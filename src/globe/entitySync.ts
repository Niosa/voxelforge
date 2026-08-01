import {
  Viewer,
  Color,
  Cartesian3,
  Cartesian2,
  HeightReference,
  HorizontalOrigin,
  VerticalOrigin,
  Entity,
  PolygonHierarchy,
  ImageMaterialProperty,
  ColorMaterialProperty,
  Cartographic,
  sampleTerrainMostDetailed,
  Math as CesiumMath,
  DistanceDisplayCondition,
  ConstantPositionProperty,
} from 'cesium';
import type { TerraEntity } from '@/entities/types';
import { geometryCentroid } from '@/geo/centroid';
import { getEntityArea } from '@/geo/geometryArea';
import { getBiomeTextureDataUrl, type BiomeType } from '@/geo/biomeTexture';
import { createTownStructureEntities } from '@/globe/townStructures';
import { useUiStore } from '@/state/uiStore';
import { getPinBillboardDataUrl, type PinStyle, type PinIcon } from '@/globe/pinGraphics';
import { useWorldStore } from '@/state/worldStore';
import {
  getIsFantasyWorld,
  updateFantasyImageryEntities,
} from '@/globe/CesiumViewer';
import { trafficManager } from '@/globe/trafficManager';
import { syncWorldBordersData } from '@/globe/borderOverlay';

interface BoundingBox {
  minLon: number;
  maxLon: number;
  minLat: number;
  maxLat: number;
}

interface ManagedRecord {
  cesiumEntities: Entity[];
  entityRef: TerraEntity;
  updatedAt: number;
  selected: boolean;
  globalFill: boolean;
  showCountry: boolean;
  showRegion: boolean;
  showCity: boolean;
  borderStyle: string;
  perfMode: boolean;
  zRank: number;
  bbox: BoundingBox;
  centerPos: Cartesian3;
}

const managed = new Map<string, ManagedRecord>();
let globalShowFillOverlay = false;
let cullListenerAttached = false;

/**
 * Camera-driven bbox culling: hides managed entities whose bounding box is
 * outside the current view so off-screen fills/labels don't cost GPU/CPU.
 * Respects the frustumCullingEnabled UI flag; re-evaluated on camera moveEnd
 * and after every sync.
 */
function ensureFrustumCuller(viewer: Viewer): void {
  if (cullListenerAttached) return;
  cullListenerAttached = true;
  viewer.camera.moveEnd.addEventListener(() => applyFrustumCulling(viewer));
}

function applyFrustumCulling(viewer: Viewer): void {
  if (viewer.isDestroyed()) return;

  if (!useUiStore.getState().frustumCullingEnabled) {
    for (const record of managed.values()) {
      for (const e of record.cesiumEntities) {
        if (!e.show) e.show = true;
      }
    }
    return;
  }

  const rect = viewer.camera.computeViewRectangle(viewer.scene.globe.ellipsoid);
  if (!rect) return;

  // Small margin so entities don't visibly pop at the viewport edge
  const west = CesiumMath.toDegrees(rect.west) - 5;
  const east = CesiumMath.toDegrees(rect.east) + 5;
  const south = CesiumMath.toDegrees(rect.south) - 5;
  const north = CesiumMath.toDegrees(rect.north) + 5;
  const crossesAntimeridian = west > east;

  for (const record of managed.values()) {
    const b = record.bbox;
    let inView: boolean;
    if (crossesAntimeridian) {
      inView =
        (b.maxLon >= west || b.minLon <= east) && b.maxLat >= south && b.minLat <= north;
    } else {
      inView =
        b.maxLon >= west && b.minLon <= east && b.maxLat >= south && b.minLat <= north;
    }
    for (const e of record.cesiumEntities) {
      if (e.show !== inView) e.show = inView;
    }
  }
}

function computeEntityBoundingBox(entity: TerraEntity): BoundingBox {
  const geom = entity.geometry;
  if (geom.type === 'Point') {
    const [lon, lat] = geom.coordinates;
    return { minLon: lon - 0.005, maxLon: lon + 0.005, minLat: lat - 0.005, maxLat: lat + 0.005 };
  }

  // Cover every landmass part (islands) — MultiPolygon outer rings
  const outerRings: number[][][] = [];
  if (geom.type === 'Polygon') {
    if (geom.coordinates[0]) outerRings.push(geom.coordinates[0] as number[][]);
  } else {
    for (const part of geom.coordinates) {
      if (part[0]) outerRings.push(part[0] as number[][]);
    }
  }

  if (outerRings.length === 0) {
    const [lon, lat] = geometryCentroid(geom);
    return { minLon: lon - 0.01, maxLon: lon + 0.01, minLat: lat - 0.01, maxLat: lat + 0.01 };
  }

  let minLon = 180, maxLon = -180, minLat = 90, maxLat = -90;
  for (const ring of outerRings) {
    for (const [ln, lt] of ring) {
      if (ln < minLon) minLon = ln;
      if (ln > maxLon) maxLon = ln;
      if (lt < minLat) minLat = lt;
      if (lt > maxLat) maxLat = lt;
    }
  }

  return { minLon, maxLon, minLat, maxLat };
}

function getLabelDistanceDisplayCondition(
  entity: TerraEntity,
  isSelected: boolean,
): DistanceDisplayCondition | undefined {
  if (isSelected) return undefined; // Selected entity label & pin are always visible

  const type = entity.type;
  const isCapital = entity.tags.includes('capital');

  if (type === 'continent') {
    return new DistanceDisplayCondition(0, 25_000_000);
  }
  if (type === 'island') {
    return new DistanceDisplayCondition(0, 10_000_000);
  }
  if (type === 'region') {
    return new DistanceDisplayCondition(0, 6_000_000);
  }
  if (type === 'city') {
    return new DistanceDisplayCondition(0, isCapital ? 3_500_000 : 2_200_000);
  }
  if (type === 'town') {
    return new DistanceDisplayCondition(0, 900_000);
  }
  return new DistanceDisplayCondition(0, 450_000);
}

function getBorderStyleConfig(entity: TerraEntity, isSelected: boolean) {
  const uiState = useUiStore.getState();
  const { showCountryBorders, showRegionBorders, showCityBorders, borderStyle } = uiState;

  // Real Earth sample continents and islands use simplified bounding polygons for fill.
  // Their crisp, accurate boundary lines are rendered by borderOverlay (Natural Earth 50m vectors).
  if (entity.tags.includes('earth-sample-bounding-box') && (entity.type === 'continent' || entity.type === 'island')) {
    if (!isSelected) {
      return { showOutline: false, color: Color.TRANSPARENT, width: 0 };
    }
  }

  let enabled = true;
  if (entity.type === 'continent' || entity.type === 'island') {
    enabled = showCountryBorders;
  } else if (entity.type === 'region') {
    enabled = showRegionBorders;
  } else if (entity.type === 'city' || entity.type === 'town' || entity.type === 'landmark') {
    enabled = showCityBorders;
  }

  if (!enabled) {
    return { showOutline: false, color: Color.TRANSPARENT, width: 0 };
  }

  if (isSelected) {
    return { showOutline: true, color: Color.fromCssColorString('#38bdf8'), width: 4 };
  }

  if (borderStyle === 'glowing-neon') {
    const col = entity.type === 'continent' ? '#00f3ff' : entity.type === 'region' ? '#0284c7' : '#14b8a6';
    return { showOutline: true, color: Color.fromCssColorString(col).withAlpha(0.9), width: entity.type === 'continent' ? 3.5 : 2.5 };
  } else if (borderStyle === 'subtle-white') {
    return { showOutline: true, color: Color.WHITE.withAlpha(0.4), width: 1.5 };
  } else if (borderStyle === 'vintage-ink') {
    return { showOutline: true, color: Color.fromCssColorString('#27272a').withAlpha(0.85), width: 2 };
  } else {
    const col = entity.type === 'continent' ? '#fef08a' : entity.type === 'region' ? '#ffffff' : '#cbd5e1';
    const alpha = entity.type === 'continent' ? 0.95 : entity.type === 'region' ? 0.75 : 0.5;
    const width = entity.type === 'continent' ? 2.5 : entity.type === 'region' ? 2 : 1.5;
    return { showOutline: true, color: Color.fromCssColorString(col).withAlpha(alpha), width };
  }
}

export function setGlobalShowFillOverlay(show: boolean): void {
  globalShowFillOverlay = show;
}

export function getGlobalShowFillOverlay(): boolean {
  return globalShowFillOverlay;
}

let activeViewer: Viewer | null = null;

/**
 * Drops all managed records and removes their Cesium entities, forcing the next
 * sync to re-create everything (used when Performance Mode toggles so texture
 * resolution / building generation pick up the new quality settings).
 */
export function resetEntitySyncState(): void {
  if (activeViewer && !activeViewer.isDestroyed()) {
    for (const record of managed.values()) {
      for (const e of record.cesiumEntities) {
        activeViewer.entities.remove(e);
      }
    }
  }
  managed.clear();
}

export function syncEntitiesToCesium(
  viewer: Viewer,
  entities: Record<string, TerraEntity>,
  selectedId: string | null,
): void {
  if (activeViewer !== viewer) {
    managed.clear();
    activeViewer = viewer;
  }

  ensureFrustumCuller(viewer);
  trafficManager.setViewer(viewer);
  trafficManager.syncCityTraffic(entities);

  const nextIds = new Set(Object.keys(entities));
  const uiState = useUiStore.getState();
  const { showCountryBorders, showRegionBorders, showCityBorders, borderStyle, performanceMode } = uiState;
  let contentChanged = false;

  // Compute ground-fill stacking order from geometry area: the smallest, most
  // specific polygons get the highest zIndex so they render on top of any
  // larger landmass they sit inside. This keeps visual layering consistent
  // with pick ranking (smallest territory at the click point wins).
  const zRankById = new Map<string, number>();
  Object.values(entities)
    .filter((e) => e.geometry && e.geometry.type !== 'Point')
    .map((e) => ({ id: e.id, area: getEntityArea(e) }))
    .sort((a, b) => b.area - a.area)
    .forEach((entry, idx) => zRankById.set(entry.id, idx));

  if (managed.size > 0 && nextIds.size > 0) {
    let hasIntersection = false;
    for (const id of nextIds) {
      if (managed.has(id)) {
        hasIntersection = true;
        break;
      }
    }
    if (!hasIntersection) {
      for (const record of managed.values()) {
        for (const e of record.cesiumEntities) {
          viewer.entities.remove(e);
        }
      }
      managed.clear();
      contentChanged = true;
    }
  }

  for (const [id, record] of managed) {
    if (!nextIds.has(id)) {
      for (const e of record.cesiumEntities) {
        viewer.entities.remove(e);
      }
      managed.delete(id);
      contentChanged = true;
    }
  }

  for (const entity of Object.values(entities)) {
    const isSelected = selectedId === entity.id;
    const existing = managed.get(entity.id);
    const zRank = entity.geometry.type === 'Point' ? -1 : (zRankById.get(entity.id) ?? 0);

    // Reference-based change detection: immer produces a new entity object on
    // every store update, so a reference match means nothing changed. This
    // avoids same-millisecond updatedAt collisions silently skipping a refresh.
    if (
      existing &&
      existing.entityRef === entity &&
      existing.selected === isSelected &&
      existing.globalFill === globalShowFillOverlay &&
      existing.showCountry === showCountryBorders &&
      existing.showRegion === showRegionBorders &&
      existing.showCity === showCityBorders &&
      existing.borderStyle === borderStyle &&
      existing.perfMode === performanceMode &&
      existing.zRank === zRank
    ) {
      continue;
    }

    if (existing) {
      for (const e of existing.cesiumEntities) {
        viewer.entities.remove(e);
      }
      managed.delete(entity.id);
    }

    // Defensive: if a previous upsert threw mid-way, an untracked Cesium entity
    // with this ID may still exist. EntityCollection.add() throws on duplicate
    // IDs, which would otherwise wedge every future sync for every entity.
    try {
      viewer.entities.removeById(entity.id);
    } catch (_) {
      /* ignore */
    }

    let cesiumEntities: Entity[];
    try {
      cesiumEntities = upsertCesiumEntity(viewer, entity, isSelected, zRank);
    } catch (err) {
      // Isolate per-entity failures so one bad entity cannot break the entire sync.
      console.error(`[entitySync] Failed to sync entity "${entity.name}" (${entity.id}):`, err);
      try {
        viewer.entities.removeById(entity.id);
      } catch (_) {
        /* ignore */
      }
      continue;
    }

    const bbox = computeEntityBoundingBox(entity);
    const [cLon, cLat] = geometryCentroid(entity.geometry);
    const centerPos = Cartesian3.fromDegrees(cLon, cLat);

    if (!existing || existing.entityRef !== entity) {
      contentChanged = true;
    }

    managed.set(entity.id, {
      cesiumEntities,
      entityRef: entity,
      updatedAt: entity.updatedAt,
      selected: isSelected,
      globalFill: globalShowFillOverlay,
      showCountry: showCountryBorders,
      showRegion: showRegionBorders,
      showCity: showCityBorders,
      borderStyle: borderStyle,
      perfMode: performanceMode,
      zRank,
      bbox,
      centerPos,
    });
  }

  // Sync entities to Fantasy Imagery Provider for dynamic tile-level LoD texturing.
  // Only regenerate tiles when entity content actually changed — selection-only
  // syncs don't alter the base map, and regenerating on every click causes flicker.
  if (contentChanged) {
    updateFantasyImageryEntities(entities);
  }

  // Sync Real Earth & World Land Borders Data
  syncWorldBordersData(viewer);

  // Apply view-based culling so newly created entities outside the viewport
  // start hidden immediately
  applyFrustumCulling(viewer);
}

const terrainElevationCache = new Map<string, number>();

export function getSafeTerrainElevation(viewer: Viewer, lon: number, lat: number): number {
  const key = `${lon.toFixed(6)}_${lat.toFixed(6)}`;
  const globe = viewer.scene.globe;
  const carto = Cartographic.fromDegrees(lon, lat);
  const rawH = globe.getHeight(carto);

  if (typeof rawH === 'number' && !isNaN(rawH)) {
    terrainElevationCache.set(key, rawH);
    return rawH;
  }

  const cached = terrainElevationCache.get(key);
  if (typeof cached === 'number') {
    return cached;
  }

  return 0;
}

function upsertCesiumEntity(
  viewer: Viewer,
  entity: TerraEntity,
  selected: boolean,
  zRank = 0,
): Entity[] {
  const created: Entity[] = [];

  // In 1st-Person mode, suppress non-voxel ground polygon fills, mountain tiers, and 2D pins
  // so only 3D voxel blocks and natural terrain render.
  const is1stPerson = useUiStore.getState().firstPersonActive;
  if (is1stPerson && !entity.properties?.isVoxelBlock && !entity.properties?.is1stPersonStructure) {
    return created;
  }

  const showFill = globalShowFillOverlay && entity.properties?.showFill !== false;
  const fillColor = Color.fromCssColorString(entity.color).withAlpha(
    showFill ? Math.max(0.3, entity.fillOpacity) : 0.05,
  );
  const fillAlpha = showFill ? Math.max(0.3, entity.fillOpacity) : 0.001;

  // Performance Mode: 128px biome textures are ~4x cheaper than 256px but stay
  // crisp enough on a Retina iPad (64px was too aggressive for the A13-class iPad 9).
  const textureResolution = useUiStore.getState().performanceMode ? 128 : 256;

  const borderConfig = getBorderStyleConfig(entity, selected);
  const outlineColor = borderConfig.color;
  const outlineWidth = borderConfig.width;

  const [lon, lat] = geometryCentroid(entity.geometry);
  const distCond = getLabelDistanceDisplayCondition(entity, selected);

  if (entity.geometry.type === 'Point') {
    const pinStyle = (entity.properties.pinStyle as PinStyle) || (entity.type === 'city' ? 'teardrop' : entity.type === 'landmark' ? 'beacon' : 'teardrop');
    const pinIcon = (entity.properties.pinIcon as PinIcon) || (entity.tags.includes('capital') ? 'capital' : entity.type === 'city' ? 'city' : entity.type === 'landmark' ? 'landmark' : 'pin');
    const pinHeight = (entity.properties.pinHeight as number) || 0;

    // 1st-Person Minecraft Voxel Blocks are no longer rendered here!
    // They are natively managed and rendered via VoxelChunkManager and VoxelRenderer.
    if (entity.properties?.isVoxelBlock || entity.properties?.is1stPersonStructure) {
      return created; // Skip rendering individually!
    }

    // Hide 2D billboard pins & floating text labels while in 1st-person mode
    const is1stPerson = useUiStore.getState().firstPersonActive;
    if (is1stPerson) {
      return created;
    }

    const billboardUrl = getPinBillboardDataUrl({
      color: entity.color,
      style: pinStyle,
      icon: pinIcon,
      selected,
      size: selected ? 72 : 56,
    });

    const position = Cartesian3.fromDegrees(lon, lat, pinHeight);
    const heightRef = pinHeight > 0 ? HeightReference.RELATIVE_TO_GROUND : HeightReference.CLAMP_TO_GROUND;

    // Draw vertical 3D tether line down to ground if elevated
    if (pinHeight > 0) {
      const tether = viewer.entities.add({
        polyline: {
          positions: [
            Cartesian3.fromDegrees(lon, lat, 0),
            Cartesian3.fromDegrees(lon, lat, pinHeight),
          ],
          width: selected ? 3 : 2,
          material: selected ? Color.YELLOW : Color.fromCssColorString(entity.color).withAlpha(0.8),
          clampToGround: false,
        },
      });
      created.push(tether);
    }

    const mainPoint = viewer.entities.add({
      id: entity.id,
      name: entity.name,
      position: position,
      billboard: {
        image: billboardUrl,
        verticalOrigin: pinStyle === 'teardrop' || pinStyle === 'flag' ? VerticalOrigin.BOTTOM : VerticalOrigin.CENTER,
        horizontalOrigin: HorizontalOrigin.CENTER,
        heightReference: heightRef,
        scale: selected ? 1.15 : 1.0,
        distanceDisplayCondition: distCond,
        disableDepthTestDistance: 10_000_000,
        eyeOffset: new Cartesian3(0, 0, -50),
      },
      label: {
        text: entity.name,
        font: selected ? 'bold 15px Inter, system-ui, sans-serif' : '13px Inter, system-ui, sans-serif',
        fillColor: Color.WHITE,
        outlineColor: Color.BLACK.withAlpha(0.8),
        outlineWidth: 2,
        showBackground: true,
        backgroundColor: Color.fromCssColorString('#090d16').withAlpha(0.85),
        backgroundPadding: new Cartesian2(8, 4),
        style: 2, // FILL_AND_OUTLINE
        verticalOrigin: pinStyle === 'teardrop' || pinStyle === 'flag' ? VerticalOrigin.TOP : VerticalOrigin.BOTTOM,
        horizontalOrigin: HorizontalOrigin.CENTER,
        pixelOffset: new Cartesian2(0, pinStyle === 'teardrop' || pinStyle === 'flag' ? 6 : (selected ? -28 : -22)),
        distanceDisplayCondition: distCond,
        disableDepthTestDistance: 10_000_000,
        eyeOffset: new Cartesian3(0, 0, -60),
      },
    });
    created.push(mainPoint);

    // Add 3D town structures (citadels, towers, city blocks) if enabled in UI & entity properties.
    // Skipped in Performance Mode: each town spawns many textured entities — too heavy for low-power devices.
    const showBuildings =
      entity.properties?.generate3DBuildings !== false &&
      useUiStore.getState().fantasyBuildingsEnabled &&
      !useUiStore.getState().performanceMode;
    if (showBuildings) {
      const structures = createTownStructureEntities(viewer, entity);
      for (const st of structures) {
        const added = viewer.entities.add(st);
        created.push(added);
      }
      void resolveTerrainHeightsForEntities(viewer, structures, lon, lat);
    }

    for (const ent of created) {
      (ent as any).terraEntityId = entity.id;
    }
    return created;
  }

  // Polygon / MultiPolygon
  const geom = entity.geometry;
  const isPolygon = geom.type === 'Polygon' || geom.type === 'MultiPolygon';
  const extrudedHeight = (entity.properties.extrudedHeight as number) ?? 0;
  let biome = (entity.properties.biome as BiomeType) ?? 'custom';
  if (isPolygon && (entity.type === 'city' || entity.type === 'town')) {
    const theme = useWorldStore.getState().world.properties?.theme || 'medieval';
    biome = theme === 'modern' ? 'city-urban' : 'town-village';
  }
  const nameLower = entity.name.toLowerCase();
  const isMountain = extrudedHeight > 0 && (biome === 'mountain-slate' || nameLower.includes('mountain') || nameLower.includes('peak') || nameLower.includes('hills') || nameLower.includes('ered') || nameLower.includes('hitaeglir'));

  if (isPolygon && isMountain) {
    const ring = geom.type === 'Polygon' ? geom.coordinates[0] : geom.coordinates[0]?.[0] ?? [];
    if (ring && ring.length > 0) {
      const centroid: [number, number] = [lon, lat];
      // Generate 5 nested concentric tiers to build a smooth sloped mountain range profile
      const tiers = [
        { scale: 1.00, heightCoeff: 0.15, biomeType: biome, opacity: fillAlpha },
        { scale: 0.82, heightCoeff: 0.40, biomeType: biome, opacity: fillAlpha },
        { scale: 0.64, heightCoeff: 0.65, biomeType: 'mountain-slate' as BiomeType, opacity: fillAlpha },
        { scale: 0.44, heightCoeff: 0.85, biomeType: 'mountain-slate' as BiomeType, opacity: fillAlpha },
        { scale: 0.22, heightCoeff: 1.00, biomeType: (biome === 'volcanic-ash' ? 'volcanic-ash' : 'snowy-tundra') as BiomeType, opacity: fillAlpha + 0.1 },
      ];

      for (let tIdx = 0; tIdx < tiers.length; tIdx++) {
        const tier = tiers[tIdx]!;
        const scaledRing = ring.map(([lng, lt]) => [
          centroid[0] + (lng - centroid[0]) * tier.scale,
          centroid[1] + (lt - centroid[1]) * tier.scale,
        ]);
        const tierHierarchy = new PolygonHierarchy(
          scaledRing.map(([lng, lt]) => Cartesian3.fromDegrees(lng, lt))
        );
        const tHeight = extrudedHeight * tier.heightCoeff;

        let tierMaterial: ImageMaterialProperty | ColorMaterialProperty;
        if (showFill && tier.biomeType !== 'custom') {
          const dataUrl = getBiomeTextureDataUrl({
            biome: tier.biomeType,
            color: entity.color,
            seedStr: `${entity.id}_tier_${tIdx}`,
            topography: entity.properties.topography as any,
            climate: entity.properties.climate as any,
            resolution: textureResolution,
          });
          const bbox = computeEntityBoundingBox(entity);
          const degWidth = Math.max(0.1, bbox.maxLon - bbox.minLon);
          const degHeight = Math.max(0.1, bbox.maxLat - bbox.minLat);
          const repeatX = Math.max(1, Math.round(degWidth / 1.5));
          const repeatY = Math.max(1, Math.round(degHeight / 1.5));

          tierMaterial = new ImageMaterialProperty({
            image: dataUrl,
            color: Color.WHITE.withAlpha(Math.min(1, tier.opacity)),
            repeat: new Cartesian2(repeatX, repeatY),
          });
        } else {
          tierMaterial = new ColorMaterialProperty(fillColor);
        }

        const tierEntity = viewer.entities.add({
          name: `${entity.name} Tier ${tIdx + 1}`,
          polygon: {
            hierarchy: tierHierarchy,
            material: tierMaterial,
            outline: borderConfig.showOutline && tIdx === 0,
            outlineColor: outlineColor,
            outlineWidth: outlineWidth,
            extrudedHeight: tHeight,
            heightReference: HeightReference.NONE,
          },
        });
        created.push(tierEntity);
      }

      // Add label at the very center peak
      const labelEntity = viewer.entities.add({
        id: entity.id,
        name: entity.name,
        position: Cartesian3.fromDegrees(lon, lat, extrudedHeight),
        label: {
          text: entity.name,
          font: selected ? 'bold 16px Inter, sans-serif' : '14px Inter, sans-serif',
          fillColor: Color.WHITE,
          outlineColor: Color.BLACK,
          outlineWidth: 3,
          style: 2,
          verticalOrigin: VerticalOrigin.CENTER,
          horizontalOrigin: HorizontalOrigin.CENTER,
          distanceDisplayCondition: distCond,
          disableDepthTestDistance: 10_000_000,
          eyeOffset: new Cartesian3(0, 0, -50),
        },
      });
      created.push(labelEntity);

      for (const ent of created) {
        (ent as any).terraEntityId = entity.id;
      }
      return created;
    }
  }

  let materialProperty: ImageMaterialProperty | ColorMaterialProperty;

  if (showFill && (biome === 'city-urban' || biome === 'town-village' || !getIsFantasyWorld())) {
    const dataUrl = getBiomeTextureDataUrl({
      biome,
      color: entity.color,
      seedStr: entity.id,
      topography: entity.properties.topography as any,
      climate: entity.properties.climate as any,
      resolution: textureResolution,
    });
    const bbox = computeEntityBoundingBox(entity);
    const degWidth = Math.max(0.1, bbox.maxLon - bbox.minLon);
    const degHeight = Math.max(0.1, bbox.maxLat - bbox.minLat);
    // High-frequency texture repeating to ensure high resolution when zooming in close
    const repeatX = Math.max(4, Math.round(degWidth * 6));
    const repeatY = Math.max(4, Math.round(degHeight * 6));

    materialProperty = new ImageMaterialProperty({
      image: dataUrl,
      color: Color.WHITE.withAlpha(fillAlpha),
      repeat: new Cartesian2(repeatX, repeatY),
    });
  } else {
    // In Fantasy Mode, the ProceduralFantasyImageryProvider renders dynamic multi-resolution LoD tiles.
    // Use translucent color overlay so the underlying LoD terrain tiles show through sharply at every zoom level.
    materialProperty = new ColorMaterialProperty(fillColor);
  }

  const hierarchies = createPolygonHierarchies(entity);
  for (let hIdx = 0; hIdx < hierarchies.length; hIdx++) {
    const polyEntity = viewer.entities.add({
      // First part carries the entity id + label; extra parts (islands) share
      // the same material/zIndex and are linked back via terraEntityId below.
      id: hIdx === 0 ? entity.id : `${entity.id}__part${hIdx}`,
      name: hIdx === 0 ? entity.name : `${entity.name} (part ${hIdx + 1})`,
      polygon: {
        hierarchy: hierarchies[hIdx]!,
        material: materialProperty,
        outline: borderConfig.showOutline && extrudedHeight > 0,
        outlineColor: outlineColor,
        outlineWidth: outlineWidth,
        extrudedHeight: extrudedHeight > 0 ? extrudedHeight : undefined,
        // height: 0 is required by Cesium when heightReference is set on a polygon;
        // omitting it triggers a DeveloperError warning in the console.
        height: extrudedHeight > 0 ? undefined : 0,
        heightReference: extrudedHeight > 0 ? HeightReference.NONE : HeightReference.CLAMP_TO_GROUND,
        // Stack ground-clamped fills by area rank so nested (smaller) landmasses
        // render on top of larger containers. zIndex only affects ground geometry.
        zIndex: extrudedHeight > 0 ? undefined : zRank,
      },
      position: Cartesian3.fromDegrees(lon, lat),
      label: hIdx === 0
        ? {
            text: entity.name,
            font: selected ? 'bold 16px Inter, sans-serif' : '14px Inter, sans-serif',
            fillColor: Color.WHITE,
            outlineColor: Color.BLACK,
            outlineWidth: 3,
            style: 2,
            verticalOrigin: VerticalOrigin.CENTER,
            horizontalOrigin: HorizontalOrigin.CENTER,
            distanceDisplayCondition: distCond,
            disableDepthTestDistance: 10_000_000,
            eyeOffset: new Cartesian3(0, 0, -50),
          }
        : undefined,
    });
    created.push(polyEntity);
  }

  // Cesium ignores polygon.outline on ground-clamped polygons (extrudedHeight <= 0).
  // Generate explicit ground-clamped polyline boundaries for crisp visible borders.
  if (borderConfig.showOutline && extrudedHeight <= 0) {
    const rings: [number, number][][] = [];
    if (geom.type === 'Polygon') {
      rings.push(geom.coordinates[0] as [number, number][] ?? []);
    } else if (geom.type === 'MultiPolygon') {
      for (const pCoords of geom.coordinates) {
        if (pCoords[0]) rings.push(pCoords[0] as [number, number][]);
      }
    }

    for (let rIdx = 0; rIdx < rings.length; rIdx++) {
      const ring = rings[rIdx]!;
      if (ring.length > 1) {
        const closedRing = [...ring];
        const first = closedRing[0]!;
        const last = closedRing[closedRing.length - 1]!;
        if (first[0] !== last[0] || first[1] !== last[1]) {
          closedRing.push(first);
        }

        const polylinePositions = closedRing.map(([lng, lt]) => Cartesian3.fromDegrees(lng, lt));
        const outlineZIndex = selected
          ? 30
          : entity.type === 'city' || entity.type === 'town'
          ? 20
          : entity.type === 'landmark'
          ? 15
          : entity.type === 'region'
          ? 10
          : 2;

        const outlinePolyline = viewer.entities.add({
          name: `${entity.name} Ground Outline ${rIdx + 1}`,
          polyline: {
            positions: polylinePositions,
            width: outlineWidth,
            material: new ColorMaterialProperty(outlineColor),
            clampToGround: true,
            zIndex: outlineZIndex,
          },
        });
        created.push(outlinePolyline);
      }
    }
  }

  // Add 3D town structures for polygon cities/towns
  if ((entity.type === 'city' || entity.type === 'town') && isPolygon) {
    const showBuildings =
      entity.properties?.generate3DBuildings !== false &&
      useUiStore.getState().fantasyBuildingsEnabled &&
      !useUiStore.getState().performanceMode;
    if (showBuildings) {
      const structures = createTownStructureEntities(viewer, entity);
      for (const st of structures) {
        const added = viewer.entities.add(st);
        created.push(added);
      }
    }
  }

  for (const ent of created) {
    (ent as any).terraEntityId = entity.id;
  }
  return created;
}

function ringsToHierarchy(rings: number[][][]): PolygonHierarchy {
  const outer = rings[0] ?? [];
  // Interior rings (from erase-hole cuts) become Cesium polygon holes
  const holes = rings
    .slice(1)
    .filter((r) => r && r.length > 2)
    .map((r) => new PolygonHierarchy(r.map(([lng, lt]) => Cartesian3.fromDegrees(lng, lt))));
  return new PolygonHierarchy(
    outer.map(([lng, lt]) => Cartesian3.fromDegrees(lng, lt)),
    holes,
  );
}

/**
 * One hierarchy per landmass part: MultiPolygon parts (islands) each get their
 * own hierarchy so every disjoint piece of an entity renders, and interior
 * rings render as holes (lakes / erased areas).
 */
function createPolygonHierarchies(entity: TerraEntity): PolygonHierarchy[] {
  const geom = entity.geometry;
  if (geom.type === 'Polygon') {
    return geom.coordinates[0] && geom.coordinates[0].length > 2
      ? [ringsToHierarchy(geom.coordinates as number[][][])]
      : [];
  }
  if (geom.type === 'MultiPolygon') {
    return geom.coordinates
      .filter((part) => part[0] && part[0].length > 2)
      .map((part) => ringsToHierarchy(part as number[][][]));
  }
  return [];
}

/**
 * Returns true if the Cesium terrain provider has tile availability data,
 * meaning sampleTerrainMostDetailed can be called safely.
 * EllipsoidTerrainProvider (used for fantasy worlds) always exists but has no
 * tile availability — calling sampleTerrainMostDetailed on it throws a
 * DeveloperError every frame.
 */
function terrainHasTileAvailability(viewer: Viewer): boolean {
  const tp = viewer.terrainProvider as any;
  if (!tp) return false;
  // availability is defined on CesiumTerrainProvider but undefined on EllipsoidTerrainProvider
  return tp.availability != null;
}

async function resolveTerrainHeightsForEntities(viewer: Viewer, entities: Entity[], lon: number, lat: number) {
  if (!terrainHasTileAvailability(viewer)) return;

  const carto = Cartographic.fromDegrees(lon, lat);
  try {
    const [result] = await sampleTerrainMostDetailed(viewer.terrainProvider, [carto]);
    if (result && typeof result.height === 'number') {
      const terrainHeight = result.height;
      for (const ent of entities) {
        const pos = ent.position?.getValue(viewer.clock.currentTime);
        if (pos) {
          const cartoPos = Cartographic.fromCartesian(pos);
          const newHeight = cartoPos.height + terrainHeight;
          ent.position = new ConstantPositionProperty(
            Cartesian3.fromDegrees(
              CesiumMath.toDegrees(cartoPos.longitude),
              CesiumMath.toDegrees(cartoPos.latitude),
              newHeight
            )
          ) as any;
        }
      }
    }
  } catch (err) {
    console.warn('Failed to resolve terrain heights:', err);
  }
}

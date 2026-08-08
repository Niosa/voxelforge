import {
  Viewer,
  Color,
  Cartesian3,
  Cartesian2,
  Entity,
  ImageMaterialProperty,
  DistanceDisplayCondition,
} from 'cesium';
import type { SettlementBuildingUse, TerraEntity, TerraGeometry } from '@/entities/types';
import { geometryCentroid } from '@/geo/centroid';
import { getEntityArea } from '@/geo/geometryArea';
import { useWorldStore } from '@/state/worldStore';
import { useUiStore } from '@/state/uiStore';
import { LruCache } from '@/utils/lruCache';
import { planCityLots, planCityRoadSegments } from '@/city/CityLayout';

function isPointInRing(pt: [number, number], ring: [number, number][]): boolean {
  let inside = false;
  const x = pt[0], y = pt[1];
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i]![0], yi = ring[i]![1];
    const xj = ring[j]![0], yj = ring[j]![1];
    const intersect = ((yi > y) !== (yj > y)) &&
      (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function isPointInsideEntityGeometry(pt: [number, number], geom: TerraGeometry): boolean {
  if (geom.type === 'Point') return true;
  if (geom.type === 'Polygon') {
    const ring = geom.coordinates[0] as [number, number][];
    return ring ? isPointInRing(pt, ring) : false;
  }
  if (geom.type === 'MultiPolygon') {
    for (const poly of geom.coordinates) {
      const ring = poly[0] as [number, number][];
      if (ring && isPointInRing(pt, ring)) return true;
    }
  }
  return false;
}

// Bounded caches: facade data URLs and material wrappers are seeded per-entity,
// so unbounded maps grow forever during long sessions on low-memory devices.
const facadeCache = new LruCache<string, string>(100);
const materialCache = new LruCache<string, ImageMaterialProperty>(100);

// Building counts are bounded and spatially sampled, so the full settlement can
// remain visible at regional zoom instead of only the few parcels under camera.
const buildingDistanceCondition = new DistanceDisplayCondition(0, 50_000);

interface SettlementContext {
  biome: string;
  nearbySettlementCount: number;
  densityMultiplier: number;
  metropolitan: boolean;
}

function analyzeSettlementContext(entity: TerraEntity, entities: Record<string, TerraEntity>): SettlementContext {
  const [lon, lat] = geometryCentroid(entity.geometry);
  const containing = Object.values(entities)
    .filter((candidate) => candidate.id !== entity.id && candidate.type !== 'city' && candidate.type !== 'town')
    .filter((candidate) => isPointInsideEntityGeometry([lon, lat], candidate.geometry))
    .sort((a, b) => getEntityArea(a) - getEntityArea(b));
  const biome = String(
    containing.find((candidate) => candidate.properties.biome)?.properties.biome
      ?? (containing.length > 0 ? 'temperate' : 'ocean'),
  ).toLowerCase();
  let nearbySettlementCount = 0;
  for (const candidate of Object.values(entities)) {
    if (candidate.id === entity.id || (candidate.type !== 'city' && candidate.type !== 'town')) continue;
    const [otherLon, otherLat] = geometryCentroid(candidate.geometry);
    const meters = Math.hypot(
      (otherLon - lon) * 111_000 * Math.cos(lat * Math.PI / 180),
      (otherLat - lat) * 111_000,
    );
    if (meters < 4_000) nearbySettlementCount++;
  }
  const population = Math.max(0, Number(entity.properties.population) || 0);
  const climateMultiplier = /ocean|water/.test(biome)
    ? 0.55
    : /polar|tundra|ice|desert|arid/.test(biome)
    ? 0.72
    : /forest|jungle|wetland|mountain/.test(biome)
    ? 0.84
    : 1;
  return {
    biome,
    nearbySettlementCount,
    densityMultiplier: climateMultiplier * Math.min(1.2, 0.82 + nearbySettlementCount * 0.12),
    metropolitan: entity.type === 'city' && population >= 150_000 && nearbySettlementCount > 0,
  };
}

function getCachedImageMaterial(imageUrl: string): ImageMaterialProperty {
  let mat = materialCache.get(imageUrl);
  if (!mat) {
    mat = new ImageMaterialProperty({
      image: imageUrl,
      repeat: new Cartesian2(1, 1),
    });
    materialCache.set(imageUrl, mat);
  }
  return mat;
}

/** 1. Glass Curtain Wall Facade (Blue / Cyan / Emerald) */
function getCurtainWallFacade(seed: number): string {
  const key = `curtain_${seed}`;
  const cached = facadeCache.get(key);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const palettes = [
    { top: '#0369a1', bot: '#0c4a6e', spandrel: '#0284c7', window: '#7dd3fc', lit: '#fef08a' },
    { top: '#047857', bot: '#064e3b', spandrel: '#059669', window: '#6ee7b7', lit: '#fef08a' },
    { top: '#1e293b', bot: '#0f172a', spandrel: '#334155', window: '#94a3b8', lit: '#fef9c3' },
  ];
  const p = palettes[Math.abs(seed) % palettes.length]!;

  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, p.top);
  grad.addColorStop(1, p.bot);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 256);

  // Horizontal spandrel bands & vertical glass columns
  for (let y = 0; y < 256; y += 16) {
    ctx.fillStyle = p.spandrel;
    ctx.fillRect(0, y, 128, 3);

    for (let x = 4; x < 124; x += 12) {
      const isLit = ((x * 7 + y * 13 + seed * 19) % 100) < 18;
      ctx.fillStyle = isLit ? p.lit : p.window;
      ctx.fillRect(x, y + 4, 8, 10);
    }
  }

  const dataUrl = canvas.toDataURL('image/png');
  facadeCache.set(key, dataUrl);
  return dataUrl;
}

/** 2. Brutalist Concrete Core Facade */
function getConcreteCoreFacade(seed: number): string {
  const key = `concrete_${seed}`;
  const cached = facadeCache.get(key);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  ctx.fillStyle = '#475569';
  ctx.fillRect(0, 0, 128, 256);

  // Punched windows in heavy concrete frames
  for (let y = 10; y < 246; y += 18) {
    ctx.fillStyle = '#334155';
    ctx.fillRect(0, y - 2, 128, 2);

    for (let x = 8; x < 120; x += 16) {
      const isLit = ((x * 11 + y * 17 + seed * 23) % 100) < 15;
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(x, y, 10, 12);
      ctx.fillStyle = isLit ? '#fef08a' : '#38bdf8';
      ctx.fillRect(x + 2, y + 2, 6, 8);
    }
  }

  const dataUrl = canvas.toDataURL('image/png');
  facadeCache.set(key, dataUrl);
  return dataUrl;
}

/** 3. Art-Deco Setback Metallic Facade */
function getSetbackTowerFacade(seed: number): string {
  const key = `setback_${seed}`;
  const cached = facadeCache.get(key);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  ctx.fillStyle = '#1e1b4b';
  ctx.fillRect(0, 0, 128, 256);

  // Bronze trim vertical columns
  ctx.strokeStyle = '#d97706';
  ctx.lineWidth = 2;
  for (let x = 2; x < 128; x += 16) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 256); ctx.stroke();
  }

  for (let y = 8; y < 248; y += 14) {
    for (let x = 5; x < 120; x += 16) {
      const isLit = ((x * 13 + y * 7 + seed * 31) % 100) < 22;
      ctx.fillStyle = isLit ? '#fffbeb' : '#818cf8';
      ctx.fillRect(x, y, 10, 9);
    }
  }

  const dataUrl = canvas.toDataURL('image/png');
  facadeCache.set(key, dataUrl);
  return dataUrl;
}

/** 4. Residential Brick/Stucco Facade */
function getResidentialFacade(seed: number): string {
  const key = `res_${seed}`;
  const cached = facadeCache.get(key);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const isBrick = seed % 2 === 0;
  ctx.fillStyle = isBrick ? '#7c2d12' : '#78716c';
  ctx.fillRect(0, 0, 128, 256);

  for (let y = 12; y < 244; y += 20) {
    for (let x = 10; x < 118; x += 20) {
      // Window frame
      ctx.fillStyle = '#f5f5f4';
      ctx.fillRect(x - 1, y - 1, 12, 14);
      // Window glass
      const isLit = ((x * 5 + y * 19 + seed * 41) % 100) < 30;
      ctx.fillStyle = isLit ? '#fef08a' : '#1e293b';
      ctx.fillRect(x, y, 10, 12);
      // Balcony ledge
      ctx.fillStyle = '#44403c';
      ctx.fillRect(x - 2, y + 12, 14, 3);
    }
  }

  const dataUrl = canvas.toDataURL('image/png');
  facadeCache.set(key, dataUrl);
  return dataUrl;
}

/** 5. Industrial Metal Panel Facade */
function getIndustrialFacade(seed: number): string {
  const key = `ind_${seed}`;
  const cached = facadeCache.get(key);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  ctx.fillStyle = '#374151';
  ctx.fillRect(0, 0, 128, 256);

  // Corrugated vertical lines
  ctx.strokeStyle = '#1f2937';
  ctx.lineWidth = 1;
  for (let x = 0; x < 128; x += 6) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 256); ctx.stroke();
  }

  // Large loading dock bays at bottom
  ctx.fillStyle = '#111827';
  ctx.fillRect(12, 200, 36, 48);
  ctx.fillRect(80, 200, 36, 48);

  const dataUrl = canvas.toDataURL('image/png');
  facadeCache.set(key, dataUrl);
  return dataUrl;
}

/** Generates central mega skyscraper facade */
function getMegaSkyscraperFacade(): string {
  const key = 'mega';
  const cached = facadeCache.get(key);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  // Gradient background
  const grad = ctx.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, '#0284c7');
  grad.addColorStop(0.5, '#0369a1');
  grad.addColorStop(1, '#0c4a6e');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 512);

  // High density modern panels & lit windows
  for (let y = 16; y < 496; y += 16) {
    // Spandrel band
    ctx.fillStyle = '#0284c7';
    ctx.fillRect(0, y, 256, 3);

    for (let x = 12; x < 244; x += 16) {
      ctx.fillStyle = Math.random() > 0.85 ? '#fffbeb' : 'rgba(56, 189, 248, 0.85)';
      ctx.fillRect(x, y + 4, 10, 10);
    }
  }

  // Steel beams
  ctx.strokeStyle = '#bae6fd';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let x = 4; x < 256; x += 16) {
    ctx.moveTo(x, 0); ctx.lineTo(x, 512);
  }
  ctx.stroke();

  const dataUrl = canvas.toDataURL('image/png');
  facadeCache.set(key, dataUrl);
  return dataUrl;
}

/** Generates timber framed plaster wall for medieval/fantasy */
function getMedievalFacadeTexture(colorHex: string): string {
  const key = `med_${colorHex}`;
  const cached = facadeCache.get(key);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  // Plaster wall backing
  ctx.fillStyle = '#f5f5dc';
  ctx.fillRect(0, 0, 128, 128);

  // Timber beams
  ctx.strokeStyle = '#5c4033';
  ctx.lineWidth = 4;
  for (let x = 16; x < 128; x += 32) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 128); ctx.stroke();
  }
  for (let y = 16; y < 128; y += 32) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(128, y); ctx.stroke();
  }
  // Diagonals
  ctx.beginPath();
  ctx.moveTo(0, 0); ctx.lineTo(128, 128);
  ctx.moveTo(128, 0); ctx.lineTo(0, 128);
  ctx.stroke();

  const dataUrl = canvas.toDataURL('image/png');
  facadeCache.set(key, dataUrl);
  return dataUrl;
}

/**
 * Procedural 3D City & Building Generator.
 * Generates high-detail Google Earth quality architectural layouts for preset and user-created cities/towns.
 */
export function createTownStructureEntities(
  _viewer: Viewer,
  entity: TerraEntity,
  districtType?: 'downtown' | 'commercial' | 'residential' | 'industrial',
): Entity[] {
  if (entity.type !== 'city' && entity.type !== 'town') {
    return [];
  }

  const uiState = useUiStore.getState();
  if (uiState.performanceMode || !uiState.fantasyBuildingsEnabled) {
    return [];
  }

  const [lon, lat] = geometryCentroid(entity.geometry);
  const structures: Entity[] = [];
  const activeWorld = useWorldStore.getState().world;
  const theme = activeWorld.properties?.theme || 'medieval';
  const settlementContext = analyzeSettlementContext(entity, activeWorld.entities);

  if (theme === 'modern') {
    const isCity = entity.type === 'city';
    const isPolygonEntity = entity.geometry.type === 'Polygon' || entity.geometry.type === 'MultiPolygon';

    let gridPoints: { lon: number; lat: number; dist: number; seed: number; plannedHeight?: number; lotWidth?: number; lotDepth?: number; buildingUse?: SettlementBuildingUse }[] = [];

    if (isPolygonEntity) {
      // Calculate geographic bounding box of freehand city polygon
      let minLon = 180, maxLon = -180, minLat = 90, maxLat = -90;
      const rings: [number, number][][] = [];
      if (entity.geometry.type === 'Polygon') {
        rings.push(entity.geometry.coordinates[0] as [number, number][]);
      } else if (entity.geometry.type === 'MultiPolygon') {
        for (const poly of entity.geometry.coordinates) {
          if (poly[0]) rings.push(poly[0] as [number, number][]);
        }
      }

      for (const ring of rings) {
        for (const [ptLon, ptLat] of ring) {
          if (ptLon < minLon) minLon = ptLon;
          if (ptLon > maxLon) maxLon = ptLon;
          if (ptLat < minLat) minLat = ptLat;
          if (ptLat > maxLat) maxLat = ptLat;
        }
      }

      if (maxLon > minLon && maxLat > minLat) {
        const spanLon = Math.max(0.0006, maxLon - minLon);
        const spanLat = Math.max(0.0006, maxLat - minLat);
        const step = Math.max(0.00035, Math.min(0.00085, Math.max(spanLon, spanLat) / 6));

        let idx = 0;
        for (let bLat = minLat + step / 2; bLat <= maxLat; bLat += step) {
          for (let bLng = minLon + step / 2; bLng <= maxLon; bLng += step) {
            idx++;
            if (isPointInsideEntityGeometry([bLng, bLat], entity.geometry)) {
              const dist = Math.hypot((bLng - lon) / step, (bLat - lat) / step);
              gridPoints.push({ lon: bLng, lat: bLat, dist, seed: Math.abs(idx * 31 + Math.floor(bLng * 10000)) });
            }
          }
        }
      }

      // If polygon is narrow or small, fall back to centroid grid
      if (gridPoints.length === 0) {
        const gridLimit = isCity ? 3 : 2;
        const stepFall = 0.0006;
        for (let dx = -gridLimit; dx <= gridLimit; dx++) {
          for (let dy = -gridLimit; dy <= gridLimit; dy++) {
            gridPoints.push({
              lon: lon + dx * stepFall,
              lat: lat + dy * stepFall,
              dist: Math.hypot(dx, dy),
              seed: Math.abs(dx * 17 + dy * 31),
            });
          }
        }
      }
    } else {
      // Point City: Radial Grid around centroid
      const gridLimit = isCity ? 3 : 2;
      const step = 0.00075;
      for (let dx = -gridLimit; dx <= gridLimit; dx++) {
        for (let dy = -gridLimit; dy <= gridLimit; dy++) {
          gridPoints.push({
            lon: lon + dx * step,
            lat: lat + dy * step,
            dist: Math.hypot(dx, dy),
            seed: Math.abs(dx * 17 + dy * 31),
          });
        }
      }
    }

    // Replace the old independent globe grid with lots from the same seeded
    // parcel plan used by walk mode. Globe and voxel skylines now correspond.
    const sharedLots = planCityLots(entity, activeWorld.seed ?? 0, 256, true);
    if (sharedLots.length > 0) {
      gridPoints = sharedLots.map((lot) => ({
        lon: lot.lon,
        lat: lot.lat,
        dist: lot.distance / Math.max(1, 22),
        seed: lot.parcelSeed,
        plannedHeight: lot.buildingHeight,
        lotWidth: lot.lotWidth,
        lotDepth: lot.lotDepth,
        buildingUse: lot.buildingUse,
      }));
      for (const [roadIndex, road] of planCityRoadSegments(entity, activeWorld.seed ?? 0, 32).entries()) {
        structures.push(new Entity({
          name: `${entity.name} Shared Avenue ${roadIndex + 1}`,
          corridor: {
            positions: [
              Cartesian3.fromDegrees(road.startLon, road.startLat),
              Cartesian3.fromDegrees(road.endLon, road.endLat),
            ],
            width: road.width,
            height: 0.15,
            material: Color.fromCssColorString('#1f2937'),
            distanceDisplayCondition: buildingDistanceCondition,
          },
        }));
      }
    }

    // The number of real shared parcels is a much better density signal than a
    // fixed population default. Small drawn cities therefore stay small.
    const parcelCount = sharedLots.length || gridPoints.length;
    const desiredBuildings = Math.max(
      entity.type === 'town' ? 3 : 4,
      Math.round(parcelCount * (entity.type === 'town' ? 0.55 : 0.68) * settlementContext.densityMultiplier),
    );

    const multiplier =
      districtType === 'downtown' ? (settlementContext.metropolitan ? 1.3 : 1) :
      districtType === 'commercial' ? 1.2 :
      districtType === 'residential' ? 0.8 :
      districtType === 'industrial' ? 0.7 :
      1;

    const isTouch = typeof navigator !== 'undefined' &&
      ((navigator.maxTouchPoints ?? 0) > 0 || 'ontouchstart' in window);
    const cap = isTouch ? (entity.type === 'town' ? 8 : 14) : (entity.type === 'town' ? 14 : 28);

    const sortedGridPoints = gridPoints.sort((a, b) => a.dist - b.dist);
    const selectedCount = Math.min(Math.ceil(desiredBuildings * multiplier), cap, sortedGridPoints.length);
    gridPoints = selectedCount >= sortedGridPoints.length
      ? sortedGridPoints
      : Array.from({ length: selectedCount }, (_, index) =>
          sortedGridPoints[Math.round(index * (sortedGridPoints.length - 1) / Math.max(1, selectedCount - 1))]!,
        );

    for (const pt of gridPoints) {
      const bLng = pt.lon;
      const bLat = pt.lat;
      const dist = pt.dist;
      const seed = pt.seed;

      let height: number;
      let wD: number;
      let wH: number;
      let facadeUrl: string;
      let isCylinder = false;
      let isSetback = false;
      let isTwinTower = false;

      if (dist <= 1.2) {
        // Zone 1: Downtown Financial High-Rise Skyscraper District (Height 220 - 480m)
        height = Math.max(220, (isCity ? 450 : 260) - dist * 45 + (seed % 70));
        wD = 38 + (seed % 22);
        wH = 38 + ((seed * 3) % 22);
        facadeUrl = (seed % 2 === 0) ? getCurtainWallFacade(seed) : getSetbackTowerFacade(seed);
        if (seed % 5 === 0) isCylinder = true;
        else if (seed % 3 === 0) isSetback = true;
        else if (seed % 7 === 0) isTwinTower = true;
      } else if (dist <= 2.2) {
        // Zone 2: Commercial Mid-Rise & Office District (Height 100 - 230m)
        height = Math.max(100, (isCity ? 230 : 130) - dist * 35 + (seed % 45));
        wD = 42 + (seed % 25);
        wH = 32 + ((seed * 7) % 22);
        facadeUrl = (seed % 2 === 0) ? getConcreteCoreFacade(seed) : getCurtainWallFacade(seed);
        if (seed % 6 === 0) isCylinder = true;
      } else {
        // Zone 3: Residential & Industrial Zoning Fringe (Height 35 - 110m)
        height = Math.max(35, (isCity ? 110 : 55) + (seed % 40));
        wD = 46 + (seed % 20);
        wH = 26 + ((seed * 11) % 20);
        facadeUrl = (seed % 2 === 0) ? getResidentialFacade(seed) : getIndustrialFacade(seed);
      }

      if (pt.plannedHeight !== undefined) {
        height = Math.max(7, pt.plannedHeight * 3.1);
        wD = Math.max(7, (pt.lotWidth ?? 8) * 0.82);
        wH = Math.max(7, (pt.lotDepth ?? 8) * 0.82);
        facadeUrl = dist < 2
          ? getCurtainWallFacade(seed)
          : seed % 2 === 0
          ? getResidentialFacade(seed)
          : getConcreteCoreFacade(seed);
        isCylinder = false;
        isSetback = settlementContext.metropolitan && dist < 1.4 && seed % 4 === 0;
        isTwinTower = false;

        // The globe uses the same parcel purpose as walk mode, making homes,
        // shops, workshops and civic buildings recognizable from either view.
        if (pt.buildingUse === 'home') {
          height = Math.min(height, isCity ? 24 : 16);
          facadeUrl = getResidentialFacade(seed);
          isSetback = false;
        } else if (pt.buildingUse === 'shop' || pt.buildingUse === 'inn') {
          height = Math.min(height, isCity ? 34 : 20);
          facadeUrl = getConcreteCoreFacade(seed + 17);
          isSetback = false;
        } else if (pt.buildingUse === 'workshop' || pt.buildingUse === 'farm') {
          height = Math.min(height, 18);
          wD *= 1.12;
          facadeUrl = getIndustrialFacade(seed);
          isSetback = false;
        } else if (pt.buildingUse === 'civic') {
          height = Math.min(48, height * 1.2);
          facadeUrl = getSetbackTowerFacade(seed + 29);
        }
      } else {
        // Legacy/fallback points still use restrained voxel-like massing.
        height = entity.type === 'town' ? 7 + seed % 7 : 10 + seed % (settlementContext.metropolitan ? 28 : 14);
        wD = entity.type === 'town' ? 9 + seed % 5 : 11 + seed % 8;
        wH = entity.type === 'town' ? 9 + (seed >>> 2) % 5 : 11 + (seed >>> 2) % 8;
        facadeUrl = entity.type === 'town' || dist > 1.5
          ? getResidentialFacade(seed)
          : getConcreteCoreFacade(seed);
        isCylinder = false;
        isSetback = false;
        isTwinTower = false;
      }

      // 1. Concrete Ground Podium Foundation & Sidewalk Plaza
      const foundationH = 1.8;
        structures.push(
          new Entity({
            name: `${entity.name} ${pt.buildingUse ?? 'mixed-use'} foundation ${seed}`,
            position: Cartesian3.fromDegrees(bLng, bLat, foundationH / 2),
            box: {
              dimensions: new Cartesian3(wD + 4, wH + 4, foundationH),
              material: Color.fromCssColorString('#1e293b'),
              distanceDisplayCondition: buildingDistanceCondition,
            },
          })
        );

        // Roadside Plaza Trees (Corner canopy foliage)
        if (seed % 2 === 0) {
          const treeOffsetLng = bLng + (wD / 2 + 6) * 0.000009;
          const treeOffsetLat = bLat + (wH / 2 + 6) * 0.000009;
          structures.push(
            new Entity({
              name: `${entity.name} Plaza Tree ${seed}`,
              position: Cartesian3.fromDegrees(treeOffsetLng, treeOffsetLat, foundationH + 6),
              box: {
                dimensions: new Cartesian3(4.5, 4.5, 6),
                material: Color.fromCssColorString('#15803d'),
                distanceDisplayCondition: buildingDistanceCondition,
              },
            })
          );
        }

        // 2. High-Rise Architectural Structure Construction
        if (isCylinder) {
          // Cylindrical Glass Tower with Spire
          structures.push(
            new Entity({
              name: `${entity.name} Cylindrical Skyscraper ${seed}`,
              position: Cartesian3.fromDegrees(bLng, bLat, foundationH + height / 2),
              cylinder: {
                length: height,
                topRadius: wD / 2,
                bottomRadius: wD / 2,
                material: getCachedImageMaterial(facadeUrl),
                distanceDisplayCondition: buildingDistanceCondition,
              },
            })
          );

          // Roof Spire
          const spireH = height * 0.2;
          structures.push(
            new Entity({
              name: `${entity.name} Cylinder Spire ${seed}`,
              position: Cartesian3.fromDegrees(bLng, bLat, foundationH + height + spireH / 2),
              cylinder: {
                length: spireH,
                topRadius: 0.5,
                bottomRadius: wD * 0.15,
                material: Color.SILVER,
                distanceDisplayCondition: buildingDistanceCondition,
              },
            })
          );
        } else if (isTwinTower) {
          // Twin Skyscraper Towers connected by mid-level Skybridge
          const tWidth = wD * 0.42;
          const offsetLng = (wD * 0.3) * 0.000009;

          const leftLng = bLng - offsetLng;
          const rightLng = bLng + offsetLng;

          structures.push(
            new Entity({
              name: `${entity.name} Twin Tower Left ${seed}`,
              position: Cartesian3.fromDegrees(leftLng, bLat, foundationH + height / 2),
              box: {
                dimensions: new Cartesian3(tWidth, wH, height),
                material: getCachedImageMaterial(facadeUrl),
                distanceDisplayCondition: buildingDistanceCondition,
              },
            }),
            new Entity({
              name: `${entity.name} Twin Tower Right ${seed}`,
              position: Cartesian3.fromDegrees(rightLng, bLat, foundationH + height / 2),
              box: {
                dimensions: new Cartesian3(tWidth, wH, height),
                material: getCachedImageMaterial(facadeUrl),
                distanceDisplayCondition: buildingDistanceCondition,
              },
            }),
            // Skybridge
            new Entity({
              name: `${entity.name} Skybridge ${seed}`,
              position: Cartesian3.fromDegrees(bLng, bLat, foundationH + height * 0.65),
              box: {
                dimensions: new Cartesian3(offsetLng * 2 * 111000, wH * 0.5, 8),
                material: Color.fromCssColorString('#38bdf8').withAlpha(0.85),
                distanceDisplayCondition: buildingDistanceCondition,
              },
            })
          );
        } else if (isSetback) {
          // 3-Tier Stepped Art-Deco Skyscraper with Helipad
          const tier1H = height * 0.45;
          const tier2H = height * 0.35;
          const tier3H = height * 0.20;

          structures.push(
            new Entity({
              name: `${entity.name} Setback Tier 1 ${seed}`,
              position: Cartesian3.fromDegrees(bLng, bLat, foundationH + tier1H / 2),
              box: {
                dimensions: new Cartesian3(wD, wH, tier1H),
                material: getCachedImageMaterial(facadeUrl),
                distanceDisplayCondition: buildingDistanceCondition,
              },
            }),
            new Entity({
              name: `${entity.name} Setback Tier 2 ${seed}`,
              position: Cartesian3.fromDegrees(bLng, bLat, foundationH + tier1H + tier2H / 2),
              box: {
                dimensions: new Cartesian3(wD * 0.75, wH * 0.75, tier2H),
                material: getCachedImageMaterial(facadeUrl),
                distanceDisplayCondition: buildingDistanceCondition,
              },
            }),
            new Entity({
              name: `${entity.name} Setback Tier 3 ${seed}`,
              position: Cartesian3.fromDegrees(bLng, bLat, foundationH + tier1H + tier2H + tier3H / 2),
              box: {
                dimensions: new Cartesian3(wD * 0.5, wH * 0.5, tier3H),
                material: getCachedImageMaterial(facadeUrl),
                distanceDisplayCondition: buildingDistanceCondition,
              },
            })
          );

          // Rooftop Helipad with glowing beacon perimeter
          const totalRoofH = foundationH + height;
          structures.push(
            new Entity({
              name: `${entity.name} Helipad ${seed}`,
              position: Cartesian3.fromDegrees(bLng, bLat, totalRoofH + 0.3),
              cylinder: {
                length: 0.6,
                topRadius: wD * 0.2,
                bottomRadius: wD * 0.2,
                material: Color.fromCssColorString('#334155'),
                distanceDisplayCondition: buildingDistanceCondition,
              },
            }),
            new Entity({
              name: `${entity.name} Helipad Beacon ${seed}`,
              position: Cartesian3.fromDegrees(bLng, bLat, totalRoofH + 1.2),
              ellipsoid: {
                radii: new Cartesian3(1.5, 1.5, 1.5),
                material: Color.RED,
                distanceDisplayCondition: buildingDistanceCondition,
              },
            })
          );
        } else {
          // Standard Highrise with Rooftop HVAC Penthouse Box
          structures.push(
            new Entity({
              name: `${entity.name} Highrise ${seed}`,
              position: Cartesian3.fromDegrees(bLng, bLat, foundationH + height / 2),
              box: {
                dimensions: new Cartesian3(wD, wH, height),
                material: getCachedImageMaterial(facadeUrl),
                distanceDisplayCondition: buildingDistanceCondition,
              },
            }),
            // HVAC Rooftop Unit
            new Entity({
              name: `${entity.name} HVAC Penthouse ${seed}`,
              position: Cartesian3.fromDegrees(bLng, bLat, foundationH + height + 3),
              box: {
                dimensions: new Cartesian3(wD * 0.35, wH * 0.35, 6),
                material: Color.fromCssColorString('#0f172a'),
                distanceDisplayCondition: buildingDistanceCondition,
              },
            })
          );
        }
      }

    // Major landmarks are reserved for genuinely metropolitan settlements.
    // Ordinary and small cities keep a readable low/mid-rise voxel skyline.
    if (!settlementContext.metropolitan) return structures;

    // 3. Seeded Center Landmark (Varies per city so cities do not look identical)
    const citySeed = Math.abs(
      entity.id.split('').reduce((acc, ch) => (acc << 5) - acc + ch.charCodeAt(0), 0)
    );
    // Keep globe landmarks cuboid as well; elaborate round monuments clash
    // with the voxel vocabulary used by walk mode.
    const landmarkType: number = 3;

    if (landmarkType === 0) {
      // Twin Financial Towers Plaza
      const towerH = isCity ? 320 : 180;
      structures.push(
        new Entity({
          name: `${entity.name} Plaza Fountain`,
          position: Cartesian3.fromDegrees(lon, lat, 1.5),
          cylinder: {
            length: 1.0,
            topRadius: 22,
            bottomRadius: 22,
            material: Color.fromCssColorString('#0284c7').withAlpha(0.85),
          },
        }),
        new Entity({
          name: `${entity.name} Financial Tower 1`,
          position: Cartesian3.fromDegrees(lon - 0.0002, lat, towerH / 2),
          box: {
            dimensions: new Cartesian3(36, 36, towerH),
            material: getCachedImageMaterial(getMegaSkyscraperFacade()),
            distanceDisplayCondition: buildingDistanceCondition,
          },
        }),
        new Entity({
          name: `${entity.name} Financial Tower 2`,
          position: Cartesian3.fromDegrees(lon + 0.0002, lat, towerH * 0.85 / 2),
          box: {
            dimensions: new Cartesian3(32, 32, towerH * 0.85),
            material: getCachedImageMaterial(getSetbackTowerFacade(citySeed + 1)),
            distanceDisplayCondition: buildingDistanceCondition,
          },
        })
      );
    } else if (landmarkType === 1) {
      // Central Civic Park & Obelisk Monument
      structures.push(
        new Entity({
          name: `${entity.name} Civic Park Lawn`,
          position: Cartesian3.fromDegrees(lon, lat, 0.5),
          box: {
            dimensions: new Cartesian3(110, 110, 1),
            material: Color.fromCssColorString('#15803d'),
          },
        }),
        new Entity({
          name: `${entity.name} Monument Obelisk`,
          position: Cartesian3.fromDegrees(lon, lat, 45),
          cylinder: {
            length: 90,
            topRadius: 1,
            bottomRadius: 7,
            material: Color.fromCssColorString('#f8fafc'),
          },
        })
      );
    } else if (landmarkType === 2) {
      // Glass Arena / Stadium Dome
      structures.push(
        new Entity({
          name: `${entity.name} Stadium Arena Dome`,
          position: Cartesian3.fromDegrees(lon, lat, 20),
          ellipsoid: {
            radii: new Cartesian3(55, 40, 22),
            material: Color.fromCssColorString('#0284c7').withAlpha(0.9),
            distanceDisplayCondition: buildingDistanceCondition,
          },
        })
      );
    } else if (landmarkType === 3) {
      // Convention Terminal Hub
      structures.push(
        new Entity({
          name: `${entity.name} Transit Terminal Roof`,
          position: Cartesian3.fromDegrees(lon, lat, 18),
          box: {
            dimensions: new Cartesian3(80, 50, 25),
            material: getCachedImageMaterial(getConcreteCoreFacade(citySeed + 99)),
            distanceDisplayCondition: buildingDistanceCondition,
          },
        })
      );
    } else {
      // Natural Highrise Block (No single central tower)
      structures.push(
        new Entity({
          name: `${entity.name} Downtown Highrise`,
          position: Cartesian3.fromDegrees(lon, lat, 110),
          box: {
            dimensions: new Cartesian3(44, 44, 220),
            material: getCachedImageMaterial(getCurtainWallFacade(citySeed)),
            distanceDisplayCondition: buildingDistanceCondition,
          },
        })
      );
    }

    return structures;
  }

  // Fantasy / Medieval Architectural Styling
  const nameLower = entity.name.toLowerCase();
  const tagsStr = entity.tags.join(' ').toLowerCase();

  let style: 'gondor' | 'mordor' | 'elven' | 'shire' | 'dwarf' | 'ruins' | 'medieval' = 'medieval';

  if (nameLower.includes('minas tirith') || nameLower.includes('osgiliath') || tagsStr.includes('gondor') || tagsStr.includes('stone-white')) {
    style = nameLower.includes('osgiliath') || tagsStr.includes('ruins') ? 'ruins' : 'gondor';
  } else if (nameLower.includes('barad') || nameLower.includes('morgul') || nameLower.includes('mordor') || tagsStr.includes('mordor') || tagsStr.includes('dark')) {
    style = 'mordor';
  } else if (nameLower.includes('rivendell') || nameLower.includes('lothlorien') || nameLower.includes('mithlond') || tagsStr.includes('elven') || tagsStr.includes('shimmer')) {
    style = 'elven';
  } else if (nameLower.includes('hobbit') || nameLower.includes('shire') || tagsStr.includes('shire') || tagsStr.includes('hobbit')) {
    style = 'shire';
  } else if (nameLower.includes('erebor') || nameLower.includes('moria') || tagsStr.includes('dwarven') || tagsStr.includes('mountain-hall')) {
    style = 'dwarf';
  }

  const wallColor =
    style === 'gondor'
      ? Color.WHITE.withAlpha(0.95)
      : style === 'mordor'
      ? Color.fromCssColorString('#1e1e2f')
      : style === 'elven'
      ? Color.AZURE.withAlpha(0.85)
      : style === 'shire'
      ? Color.fromCssColorString('#8b5a2b')
      : style === 'dwarf'
      ? Color.DARKSLATEGRAY
      : style === 'ruins'
      ? Color.GRAY.withAlpha(0.7)
      : Color.fromCssColorString('#d2b48c');

  const roofColor =
    style === 'gondor'
      ? Color.DODGERBLUE
      : style === 'mordor'
      ? Color.CRIMSON
      : style === 'elven'
      ? Color.AQUAMARINE
      : style === 'shire'
      ? Color.FORESTGREEN
      : style === 'dwarf'
      ? Color.GOLD
      : Color.fromCssColorString('#a0522d');

  // 1. Iconic Tolkien Fantasy Cities (Minas Tirith & Barad-dûr)
  if (nameLower.includes('minas tirith')) {
    for (let tier = 1; tier <= 7; tier++) {
      const radius = 1200 - tier * 150;
      const height = tier * 40;
      structures.push(
        new Entity({
          name: `Minas Tirith Tier ${tier} Wall`,
          position: Cartesian3.fromDegrees(lon, lat, height / 2),
          cylinder: {
            length: height,
            topRadius: radius - 20,
            bottomRadius: radius,
            material: wallColor,
            outline: true,
            outlineColor: Color.LIGHTGRAY,
          },
        }),
      );

      const houseCount = 8 + tier * 4;
      for (let i = 0; i < houseCount; i++) {
        const angle = (i / houseCount) * Math.PI * 2 + tier;
        const dLng = lon + Math.cos(angle) * (radius - 50) * 0.00001;
        const dLat = lat + Math.sin(angle) * (radius - 50) * 0.00001;
        const hHeight = 15 + Math.random() * 15;

        structures.push(
          new Entity({
            name: `Tier ${tier} Cottage ${i}`,
            position: Cartesian3.fromDegrees(dLng, dLat, height - 10 + hHeight / 2),
            box: {
              dimensions: new Cartesian3(30, 30, hHeight),
              material: wallColor,
            },
          }),
          new Entity({
            name: `Tier ${tier} Roof ${i}`,
            position: Cartesian3.fromDegrees(dLng, dLat, height - 10 + hHeight + 6),
            cylinder: {
              length: 12,
              topRadius: 0,
              bottomRadius: 18,
              material: roofColor,
            },
          })
        );
      }
    }

    structures.push(
      new Entity({
        name: 'White Tower of Ecthelion',
        position: Cartesian3.fromDegrees(lon, lat, 380 / 2),
        cylinder: {
          length: 380,
          topRadius: 10,
          bottomRadius: 30,
          material: Color.WHITE,
          outline: true,
          outlineColor: Color.GOLD,
        },
      }),
      new Entity({
        name: 'White Tower Crown',
        position: Cartesian3.fromDegrees(lon, lat, 380 + 25),
        ellipsoid: {
          radii: new Cartesian3(25, 25, 25),
          material: Color.GOLD,
        },
      })
    );
    return structures;
  }

  if (nameLower.includes('barad-dûr') || nameLower.includes('barad-dur')) {
    for (let i = 1; i <= 3; i++) {
      structures.push(
        new Entity({
          name: `Barad-dûr Ring ${i}`,
          position: Cartesian3.fromDegrees(lon, lat, (i * 150) / 2),
          cylinder: {
            length: i * 150,
            topRadius: 400 - i * 100,
            bottomRadius: 500 - i * 100,
            material: wallColor,
            outline: true,
            outlineColor: Color.DARKRED,
          },
        })
      );
    }
    structures.push(
      new Entity({
        name: 'Barad-dûr Spire Monolith',
        position: Cartesian3.fromDegrees(lon, lat, 1200 / 2),
        cylinder: {
          length: 1200,
          topRadius: 25,
          bottomRadius: 180,
          material: Color.BLACK,
          outline: true,
          outlineColor: Color.RED,
        },
      }),
      new Entity({
        name: 'Eye of Sauron',
        position: Cartesian3.fromDegrees(lon, lat, 1200 + 40),
        ellipsoid: {
          radii: new Cartesian3(80, 80, 80),
          material: Color.ORANGERED,
        },
      })
    );
    return structures;
  }

  // Generic fantasy/medieval settlements use the same block parcels as walk
  // mode. Distinctive named landmarks above retain their authored silhouettes,
  // while ordinary towns no longer become rings of round towers and cone roofs.
  const voxelLots = planCityLots(entity, activeWorld.seed ?? 0, entity.type === 'town' ? 72 : 144, true);
  const voxelCount = Math.min(
    voxelLots.length,
    entity.type === 'town' ? 24 : 48,
    Math.max(entity.type === 'town' ? 3 : 4, Math.round(voxelLots.length * settlementContext.densityMultiplier * 0.72)),
  );
  const selectedVoxelLots = voxelCount >= voxelLots.length
    ? voxelLots
    : Array.from({ length: voxelCount }, (_, index) =>
        voxelLots[Math.round(index * (voxelLots.length - 1) / Math.max(1, voxelCount - 1))]!,
      );
  for (const lot of selectedVoxelLots) {
    let height = Math.max(6, lot.buildingHeight * 2.6);
    if (lot.buildingUse === 'home') height = Math.min(height, entity.type === 'town' ? 13 : 18);
    if (lot.buildingUse === 'workshop' || lot.buildingUse === 'farm') height = Math.min(height, 14);
    if (lot.buildingUse === 'civic') height = Math.min(34, height * 1.15);
    const width = Math.max(7, lot.lotWidth * 0.82);
    const depth = Math.max(7, lot.lotDepth * 0.82);
    structures.push(
      new Entity({
        name: `${entity.name} ${lot.buildingUse} ${lot.parcelSeed}`,
        position: Cartesian3.fromDegrees(lot.lon, lot.lat, height / 2),
        box: {
          dimensions: new Cartesian3(width, depth, height),
          material: wallColor,
          distanceDisplayCondition: buildingDistanceCondition,
        },
      }),
      new Entity({
        name: `${entity.name} block roof ${lot.parcelSeed}`,
        position: Cartesian3.fromDegrees(lot.lon, lot.lat, height + 0.75),
        box: {
          dimensions: new Cartesian3(width + 0.8, depth + 0.8, 1.5),
          material: roofColor,
          distanceDisplayCondition: buildingDistanceCondition,
        },
      }),
    );
  }
  for (const [roadIndex, road] of planCityRoadSegments(entity, activeWorld.seed ?? 0, 24).entries()) {
    structures.push(new Entity({
      name: `${entity.name} voxel road ${roadIndex + 1}`,
      corridor: {
        positions: [
          Cartesian3.fromDegrees(road.startLon, road.startLat),
          Cartesian3.fromDegrees(road.endLon, road.endLat),
        ],
        width: road.width,
        height: 0.12,
        material: Color.fromCssColorString('#57534e'),
        distanceDisplayCondition: buildingDistanceCondition,
      },
    }));
  }
  if (structures.length > 0) return structures;

  // 2. Legacy fallback for degenerate settlement geometry.
  const isCity = entity.type === 'city';
  const population = typeof entity.properties.population === 'number' ? entity.properties.population : 0;
  const houseCount = Math.min(
    isCity ? 48 : 24,
    Math.max(isCity ? 28 : 14, Math.ceil(population / 750)),
  );
  const centralHeight = isCity ? 190 : 80;
  let layoutRadius = isCity ? 0.0035 : 0.0018;
  if (entity.geometry.type !== 'Point') {
    const rings = entity.geometry.type === 'Polygon'
      ? [entity.geometry.coordinates[0] as [number, number][]]
      : entity.geometry.coordinates.map((polygon) => polygon[0] as [number, number][]);
    let minLon = Number.POSITIVE_INFINITY, maxLon = Number.NEGATIVE_INFINITY;
    let minLat = Number.POSITIVE_INFINITY, maxLat = Number.NEGATIVE_INFINITY;
    for (const ring of rings) {
      for (const [ringLon, ringLat] of ring) {
        minLon = Math.min(minLon, ringLon); maxLon = Math.max(maxLon, ringLon);
        minLat = Math.min(minLat, ringLat); maxLat = Math.max(maxLat, ringLat);
      }
    }
    const insetRadius = Math.min(maxLon - minLon, maxLat - minLat) * 0.42;
    if (Number.isFinite(insetRadius) && insetRadius > 0) {
      layoutRadius = Math.max(0.0005, Math.min(0.01, insetRadius));
    }
  }

  // Central Gothic Cathedral / Fortress Basilica
  structures.push(
    // Main Cathedral Nave Hall
    new Entity({
      name: `${entity.name} Cathedral Nave`,
      position: Cartesian3.fromDegrees(lon, lat, centralHeight * 0.4),
      box: {
        dimensions: new Cartesian3(60, 30, centralHeight * 0.8),
        material: wallColor,
        outline: true,
        outlineColor: roofColor,
      },
    }),
    // Cathedral Transept Cross Hall
    new Entity({
      name: `${entity.name} Cathedral Transept`,
      position: Cartesian3.fromDegrees(lon, lat, centralHeight * 0.35),
      box: {
        dimensions: new Cartesian3(28, 55, centralHeight * 0.7),
        material: wallColor,
        outline: true,
        outlineColor: roofColor,
      },
    }),
    // Cathedral Bell Tower Spire
    new Entity({
      name: `${entity.name} Cathedral Spire`,
      position: Cartesian3.fromDegrees(lon, lat, centralHeight / 2),
      cylinder: {
        length: centralHeight,
        topRadius: 4,
        bottomRadius: 18,
        material: wallColor,
        outline: true,
        outlineColor: roofColor,
      },
    }),
    new Entity({
      name: `${entity.name} Spire Roof`,
      position: Cartesian3.fromDegrees(lon, lat, centralHeight + 15),
      cylinder: {
        length: 30,
        topRadius: 0,
        bottomRadius: 10,
        material: roofColor,
      },
    })
  );

  // Cobblestone Market Square Plaza
  const plazaDist = layoutRadius * 0.18;
  structures.push(
    new Entity({
      name: `${entity.name} Market Square Paving`,
      position: Cartesian3.fromDegrees(lon + plazaDist, lat, 0.4),
      box: {
        dimensions: new Cartesian3(45, 45, 0.8),
        material: Color.fromCssColorString('#57534e'),
      },
    }),
    // Market Canopy Stall 1
    new Entity({
      name: `${entity.name} Market Stall 1`,
      position: Cartesian3.fromDegrees(lon + plazaDist - 0.0001, lat, 3),
      box: {
        dimensions: new Cartesian3(10, 8, 5),
        material: Color.fromCssColorString('#ef4444'),
        distanceDisplayCondition: buildingDistanceCondition,
      },
    }),
    // Market Canopy Stall 2
    new Entity({
      name: `${entity.name} Market Stall 2`,
      position: Cartesian3.fromDegrees(lon + plazaDist + 0.0001, lat + 0.0001, 3),
      box: {
        dimensions: new Cartesian3(10, 8, 5),
        material: Color.fromCssColorString('#3b82f6'),
        distanceDisplayCondition: buildingDistanceCondition,
      },
    })
  );

  // Concentric Rings of Timber Cottages & Cobblestone Avenues
  const rings = isCity
    ? [layoutRadius * 0.36, layoutRadius * 0.7]
    : [layoutRadius * 0.58];

  for (let rIdx = 0; rIdx < rings.length; rIdx++) {
    const dist = rings[rIdx]!;
    const count = Math.floor(houseCount / rings.length);

    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + rIdx;
      const hLng = lon + Math.cos(angle) * dist;
      const hLat = lat + Math.sin(angle) * dist;
      if (entity.geometry.type !== 'Point' && !isPointInsideEntityGeometry([hLng, hLat], entity.geometry)) {
        continue;
      }

      const hW = 22 + (i * 7) % 18;
      const hD = 22 + (i * 13) % 18;
      const hH = 18 + (i * 9) % 24;

      const facadeImg = getMedievalFacadeTexture(wallColor.toCssColorString());
      structures.push(
        new Entity({
          name: `${entity.name} Timber House ${rIdx}-${i}`,
          position: Cartesian3.fromDegrees(hLng, hLat, hH / 2),
          box: {
            dimensions: new Cartesian3(hW, hD, hH),
            material: getCachedImageMaterial(facadeImg),
            distanceDisplayCondition: buildingDistanceCondition,
          },
        }),
        new Entity({
          name: `${entity.name} Roof ${rIdx}-${i}`,
          position: Cartesian3.fromDegrees(hLng, hLat, hH + (hH * 0.45) / 2),
          cylinder: {
            length: hH * 0.45,
            topRadius: 0,
            bottomRadius: Math.max(hW, hD) * 0.7,
            material: roofColor,
            distanceDisplayCondition: buildingDistanceCondition,
          },
        })
      );

      // Garden Tree Clusters
      if (i % 3 === 0) {
        const tLng = hLng + Math.cos(angle + 0.5) * 0.0004;
        const tLat = hLat + Math.sin(angle + 0.5) * 0.0004;
        structures.push(
          new Entity({
            name: `${entity.name} Tree Canopy`,
            position: Cartesian3.fromDegrees(tLng, tLat, 10),
            ellipsoid: {
              radii: new Cartesian3(10, 10, 10),
              material: Color.fromCssColorString(style === 'elven' ? '#60a5fa' : '#22c55e'),
              distanceDisplayCondition: buildingDistanceCondition,
            },
          })
        );
      }
    }
  }

  // Defensive Outer Stone Walls & Drawbridge Gatehouse for Cities
  if (isCity) {
    const wallRadius = layoutRadius;
    for (let segment = 0; segment < 8; segment++) {
      const angle = (segment / 8) * Math.PI * 2;
      const wLng = lon + Math.cos(angle) * wallRadius;
      const wLat = lat + Math.sin(angle) * wallRadius;
      if (entity.geometry.type !== 'Point' && !isPointInsideEntityGeometry([wLng, wLat], entity.geometry)) {
        continue;
      }

      // Watchtowers with Conical Roofs
      structures.push(
        new Entity({
          name: `${entity.name} Wall Watchtower ${segment + 1}`,
          position: Cartesian3.fromDegrees(wLng, wLat, 25),
          cylinder: {
            length: 50,
            topRadius: 14,
            bottomRadius: 18,
            material: wallColor,
            outline: true,
            outlineColor: roofColor,
          },
        }),
        new Entity({
          name: `${entity.name} Watchtower Roof ${segment + 1}`,
          position: Cartesian3.fromDegrees(wLng, wLat, 50 + 8),
          cylinder: {
            length: 16,
            topRadius: 0,
            bottomRadius: 16,
            material: roofColor,
          },
        })
      );
    }

    // Main Drawbridge Gatehouse Towers (South Gate)
    const gateLng = lon;
    const gateLat = lat - wallRadius;
    structures.push(
      new Entity({
        name: `${entity.name} Main Gatehouse Left Tower`,
        position: Cartesian3.fromDegrees(gateLng - 0.0002, gateLat, 30),
        cylinder: {
          length: 60,
          topRadius: 12,
          bottomRadius: 16,
          material: wallColor,
        },
      }),
      new Entity({
        name: `${entity.name} Main Gatehouse Right Tower`,
        position: Cartesian3.fromDegrees(gateLng + 0.0002, gateLat, 30),
        cylinder: {
          length: 60,
          topRadius: 12,
          bottomRadius: 16,
          material: wallColor,
        },
      }),
      new Entity({
        name: `${entity.name} Drawbridge Archway`,
        position: Cartesian3.fromDegrees(gateLng, gateLat, 20),
        box: {
          dimensions: new Cartesian3(26, 12, 20),
          material: Color.fromCssColorString('#44403c'),
        },
      })
    );
  }

  return structures;
}

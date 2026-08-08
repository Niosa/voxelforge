import {
  BoxGeometry,
  Cartesian3,
  Color,
  ColorGeometryInstanceAttribute,
  DistanceDisplayConditionGeometryInstanceAttribute,
  GeometryInstance,
  GroundPrimitive,
  HeadingPitchRoll,
  Matrix4,
  Material,
  MaterialAppearance,
  PerInstanceColorAppearance,
  Primitive,
  Rectangle,
  RectangleGeometry,
  Transforms,
  Math as CesiumMath,
  type Viewer,
} from 'cesium';
import type { GeneratedVoxelChunkMap, TerraEntity, VoxelBlock, VoxelChunkMap } from '@/entities/types';
import { lonLatToPlanetMeters, planetChunkKey, planetMetersToLonLat, PLANET_CHUNK_SIZE } from '@/planet/spatial/PlanetGrid';
import { BLOCK_AIR, BLOCK_BY_ID, isPlantBlock } from '@/walk/blockRegistry';
import { MAX_NATURAL_TERRAIN_Y, PlanetTerrainSampler } from '@/planet/terrain/PlanetTerrainSampler';
import { useUiStore } from '@/state/uiStore';

const MAX_DISPLAY_DISTANCE_M = 75_000;
const MAX_GENERATED_ALTITUDE_M = 60_000;
// A typical walk session generates more than the old 3x3/9-column ceiling.
// Keep a broad close-range working set so a revisited city or biome renders as
// one continuous voxel area instead of an arbitrary handful of chunks.
const MAX_VISIBLE_GENERATED_CHUNKS = 48;
const MAX_PERFORMANCE_VISIBLE_GENERATED_CHUNKS = 16;
const MAX_GENERATED_BOXES = 48_000;
const MAX_PERFORMANCE_GENERATED_BOXES = 16_000;
type VoxelOverlayPrimitive = Primitive | GroundPrimitive;
let primitives: VoxelOverlayPrimitive[] = [];
let lastViewer: Viewer | null = null;
let lastChunks: VoxelChunkMap | undefined;
let lastEntities: Record<string, TerraEntity> | null = null;
let lastManifest: GeneratedVoxelChunkMap | undefined;
let lastSeed = Number.NaN;
let lastVisibleSignature = '';
let boxCacheChunks: VoxelChunkMap | undefined;
let boxCacheEntities: Record<string, TerraEntity> | null = null;
let boxCacheSeed = Number.NaN;
const generatedBoxCache = new Map<string, GeneratedVoxelBox[]>();
const pendingPrimitives = new Set<VoxelOverlayPrimitive>();
let readinessFrameId: number | null = null;
let readinessFramesRemaining = 0;
let readinessViewer: Viewer | null = null;
let pendingGenerationTimer: ReturnType<typeof setTimeout> | null = null;

export interface GeneratedVoxelBox {
  centerX: number;
  centerY: number;
  centerZ: number;
  width: number;
  height: number;
  depth: number;
  blockId: number;
}

interface GeneratedSurfaceCell {
  y: number;
  blockId: number;
  baseY: number;
}

interface GlobeVoxelBox {
  centerX: number;
  centerY: number;
  centerZ: number;
  width: number;
  height: number;
  depth: number;
}

export interface GlobeVoxelChunkFootprint {
  west: number;
  south: number;
  east: number;
  north: number;
}

export function globeBlockTextureFaces(textures: string | [string, string, string] | undefined): { top: string; side: string } | null {
  if (!textures) return null;
  return typeof textures === 'string'
    ? { top: textures, side: textures }
    : { top: textures[0], side: textures[2] };
}

/** Bottom altitude needed to cover every exposed side of a surface voxel. */
export function exposedSurfaceBaseY(surfaceY: number, neighborSurfaceYs: readonly number[]): number {
  if (neighborSurfaceYs.length === 0) return surfaceY;
  return Math.min(surfaceY, Math.min(...neighborSurfaceYs) + 1);
}

function addTexturedBoxes(
  viewer: Viewer,
  textureUrl: string,
  boxes: readonly GlobeVoxelBox[],
  translucent: boolean,
  asynchronous: boolean,
): void {
  if (boxes.length === 0) return;
  const geometryInstances = boxes.map((box) => {
    const [lon, lat] = planetMetersToLonLat(box.centerX, box.centerZ);
    const center = Cartesian3.fromDegrees(lon, lat, box.centerY);
    const orientation = Transforms.headingPitchRollQuaternion(center, new HeadingPitchRoll());
    return new GeometryInstance({
      geometry: BoxGeometry.fromDimensions({
        dimensions: new Cartesian3(1, 1, 1),
        vertexFormat: MaterialAppearance.MaterialSupport.TEXTURED.vertexFormat,
      }),
      modelMatrix: Matrix4.fromTranslationQuaternionRotationScale(
        center,
        orientation,
        new Cartesian3(box.width, box.depth, box.height),
      ),
      attributes: {
        distanceDisplayCondition: new DistanceDisplayConditionGeometryInstanceAttribute(0, MAX_DISPLAY_DISTANCE_M),
      },
    });
  });
  const primitive = new Primitive({
    geometryInstances,
    appearance: new MaterialAppearance({
      material: Material.fromType('Image', { image: textureUrl }),
      materialSupport: MaterialAppearance.MaterialSupport.TEXTURED,
      flat: false,
      faceForward: false,
      closed: true,
      translucent,
    }),
    asynchronous,
  });
  viewer.scene.primitives.add(primitive);
  primitives.push(primitive);
  requestFramesUntilPrimitiveReady(viewer, primitive, asynchronous);
}

function requestFramesUntilPrimitiveReady(viewer: Viewer, primitive: VoxelOverlayPrimitive, asynchronous: boolean): void {
  if (!asynchronous) return;
  if (readinessViewer !== viewer) {
    pendingPrimitives.clear();
    readinessViewer = viewer;
  }
  pendingPrimitives.add(primitive);
  readinessFramesRemaining = 120;
  if (readinessFrameId !== null) return;
  const request = () => {
    readinessFrameId = null;
    if (viewer.isDestroyed() || readinessViewer !== viewer) return;
    for (const candidate of pendingPrimitives) {
      if (candidate.isDestroyed() || candidate.ready) pendingPrimitives.delete(candidate);
    }
    if (pendingPrimitives.size === 0 || readinessFramesRemaining-- <= 0) return;
    viewer.scene.requestRender();
    readinessFrameId = window.requestAnimationFrame(request);
  };
  readinessFrameId = window.requestAnimationFrame(request);
}

function addVoxelChunkGroundMasks(viewer: Viewer, chunkColumns: readonly string[]): void {
  const footprints = generatedVoxelChunkFootprints(Object.fromEntries(
    chunkColumns.map((column) => [`planet/${column.split(',')[0]},0,${column.split(',')[1]}`, 0]),
  ));
  if (footprints.length === 0) return;
  const color = Color.fromCssColorString('#071422');
  const geometryInstances = footprints.map((footprint) => new GeometryInstance({
    geometry: new RectangleGeometry({
      rectangle: new Rectangle(
        CesiumMath.toRadians(footprint.west),
        CesiumMath.toRadians(footprint.south),
        CesiumMath.toRadians(footprint.east),
        CesiumMath.toRadians(footprint.north),
      ),
      vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT,
    }),
    attributes: {
      color: ColorGeometryInstanceAttribute.fromColor(color),
    },
  }));
  const primitive = new GroundPrimitive({
    geometryInstances,
    appearance: new PerInstanceColorAppearance({ flat: true, translucent: false, closed: false }),
    asynchronous: true,
  });
  viewer.scene.primitives.add(primitive);
  primitives.push(primitive);
  requestFramesUntilPrimitiveReady(viewer, primitive, true);
}

export function effectiveGeneratedVoxelManifest(
  manifest: GeneratedVoxelChunkMap | undefined,
  chunks: VoxelChunkMap | undefined,
  entities: Record<string, TerraEntity>,
): GeneratedVoxelChunkMap {
  const effective: GeneratedVoxelChunkMap = { ...(manifest ?? {}) };
  for (const key of Object.keys(chunks ?? {})) {
    if (key.startsWith('planet/') && effective[key] === undefined) effective[key] = 0;
  }
  // Walk pins predate generated-chunk manifests in some saved worlds. A pin is
  // sufficient evidence to reconstruct the natural chunk around that site.
  for (const entity of Object.values(entities)) {
    if (entity.geometry.type !== 'Point' || entity.properties.walkEntry !== true) continue;
    const [x, z] = lonLatToPlanetMeters(entity.geometry.coordinates[0], entity.geometry.coordinates[1]);
    const key = planetChunkKey(x, 0, z);
    if (effective[key] === undefined) effective[key] = entity.updatedAt || entity.createdAt || 0;
  }
  return effective;
}

function parsePlanetChunkKey(key: string): readonly [number, number, number] | null {
  if (!key.startsWith('planet/')) return null;
  const values = key.slice(7).split(',').map(Number);
  if (values.length !== 3 || values.some((value) => !Number.isFinite(value))) return null;
  return [values[0]!, values[1]!, values[2]!];
}

export function generatedVoxelChunkFootprints(manifest: GeneratedVoxelChunkMap | undefined): GlobeVoxelChunkFootprint[] {
  const columns = new Set<string>();
  const footprints: GlobeVoxelChunkFootprint[] = [];
  for (const key of Object.keys(manifest ?? {})) {
    const parsed = parsePlanetChunkKey(key);
    if (!parsed) continue;
    const [cx, , cz] = parsed;
    const columnKey = `${cx},${cz}`;
    if (columns.has(columnKey)) continue;
    columns.add(columnKey);
    const [lonA, latA] = planetMetersToLonLat(cx * PLANET_CHUNK_SIZE, cz * PLANET_CHUNK_SIZE);
    const [lonB, latB] = planetMetersToLonLat((cx + 1) * PLANET_CHUNK_SIZE, (cz + 1) * PLANET_CHUNK_SIZE);

    let west = Math.min(lonA, lonB);
    let east = Math.max(lonA, lonB);
    let south = Math.min(latA, latB);
    let north = Math.max(latA, latB);

    if (east - west > 180) {
      west = Math.max(lonA, lonB);
      east = Math.min(lonA, lonB) + 360;
    }
    footprints.push({ west, south, east, north });
  }
  return footprints;
}

export function visibleGeneratedChunkColumns(
  manifest: GeneratedVoxelChunkMap | undefined,
  cameraLon: number,
  cameraLat: number,
  cameraHeight: number,
  maximumColumns = MAX_VISIBLE_GENERATED_CHUNKS,
): string[] {
  if (!manifest || cameraHeight > MAX_GENERATED_ALTITUDE_M) return [];
  const [cameraX, cameraZ] = lonLatToPlanetMeters(cameraLon, cameraLat);
  const radius = Math.max(192, Math.min(12_000, cameraHeight * 1.25));
  const columns = new Map<string, number>();
  for (const key of Object.keys(manifest)) {
    const parsed = parsePlanetChunkKey(key);
    if (!parsed) continue;
    const [cx, , cz] = parsed;
    const columnKey = `${cx},${cz}`;
    if (columns.has(columnKey)) continue;
    const centerX = (cx + 0.5) * PLANET_CHUNK_SIZE;
    const centerZ = (cz + 0.5) * PLANET_CHUNK_SIZE;
    const distance = Math.hypot(centerX - cameraX, centerZ - cameraZ);
    if (distance <= radius) columns.set(columnKey, distance);
  }
  return [...columns].sort((left, right) => left[1] - right[1])
    .slice(0, Math.max(0, maximumColumns))
    .map(([key]) => key);
}

export function collectGeneratedChunkBoxes(
  chunkColumns: readonly string[],
  chunks: VoxelChunkMap | undefined,
  entities: Record<string, TerraEntity>,
  seed = 0,
): GeneratedVoxelBox[] {
  const terrain = new PlanetTerrainSampler(entities, seed);
  const overrides = new Set<string>();
  for (const block of Object.values(chunks ?? {}).flat()) overrides.add(`${block.bx},${block.by},${block.bz}`);
  const naturalBlockAt = (bx: number, by: number, bz: number, sample: ReturnType<PlanetTerrainSampler['sampleSurface']>) => (
    overrides.has(`${bx},${by},${bz}`) ? BLOCK_AIR : terrain.blockAt(bx, by, bz, sample)
  );
  const boxes: GeneratedVoxelBox[] = [];

  for (const key of chunkColumns) {
    if (boxes.length >= MAX_GENERATED_BOXES) break;
    const [cx = Number.NaN, cz = Number.NaN] = key.split(',').map(Number);
    if (!Number.isFinite(cx) || !Number.isFinite(cz)) continue;
    const startX = cx * PLANET_CHUNK_SIZE;
    const startZ = cz * PLANET_CHUNK_SIZE;
    const surfaces: Array<GeneratedSurfaceCell | null> = new Array(PLANET_CHUNK_SIZE * PLANET_CHUNK_SIZE).fill(null);

    for (let dz = 0; dz < PLANET_CHUNK_SIZE; dz++) {
      for (let dx = 0; dx < PLANET_CHUNK_SIZE; dx++) {
        const bx = startX + dx;
        const bz = startZ + dz;
        const sample = terrain.sampleSurface(bx, bz);
        const baselineTop = Math.max(sample.elevation, sample.waterLevel ?? sample.elevation);
        for (let by = baselineTop; by >= sample.elevation - 16; by--) {
          const blockId = naturalBlockAt(bx, by, bz, sample);
          if (blockId !== BLOCK_AIR && !isPlantBlock(blockId)) {
            surfaces[dz * PLANET_CHUNK_SIZE + dx] = { y: by, blockId, baseY: by };
            break;
          }
        }

        let runId = BLOCK_AIR;
        let runStart = baselineTop + 1;
        const flushRun = (endY: number) => {
          if (runId === BLOCK_AIR || isPlantBlock(runId) || boxes.length >= MAX_GENERATED_BOXES) return;
          const height = endY - runStart;
          boxes.push({
            centerX: bx + 0.5,
            centerY: runStart + height / 2,
            centerZ: bz + 0.5,
            width: 1,
            height,
            depth: 1,
            blockId: runId,
          });
        };
        // Natural columns only need enough headroom for their decorations.
        // Keeping every plains column scanning to the mountain ceiling makes
        // globe overlays substantially more expensive as chunk coverage grows.
        const decorationCeiling = Math.min(
          MAX_NATURAL_TERRAIN_Y,
          baselineTop + (sample.isCity ? 64 : 12),
        );
        for (let by = baselineTop + 1; by <= decorationCeiling + 1; by++) {
          const nextId = by <= decorationCeiling ? naturalBlockAt(bx, by, bz, sample) : BLOCK_AIR;
          if (nextId === runId) continue;
          flushRun(by);
          runId = nextId;
          runStart = by;
        }
      }
    }

    // Surface caps alone look like flat decals. Extend each cell down to the
    // lowest adjacent surface so cliffs and block edges have real side faces.
    for (let dz = 0; dz < PLANET_CHUNK_SIZE; dz++) {
      for (let dx = 0; dx < PLANET_CHUNK_SIZE; dx++) {
        const surface = surfaces[dz * PLANET_CHUNK_SIZE + dx];
        if (!surface) continue;
        const neighbors: number[] = [];
        for (const [offsetX, offsetZ] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
          const neighborX = dx + offsetX;
          const neighborZ = dz + offsetZ;
          if (neighborX >= 0 && neighborX < PLANET_CHUNK_SIZE && neighborZ >= 0 && neighborZ < PLANET_CHUNK_SIZE) {
            const neighbor = surfaces[neighborZ * PLANET_CHUNK_SIZE + neighborX];
            if (neighbor) neighbors.push(neighbor.y);
            continue;
          }
          const bx = startX + neighborX;
          const bz = startZ + neighborZ;
          const sample = terrain.sampleSurface(bx, bz);
          neighbors.push(Math.max(sample.elevation, sample.waterLevel ?? sample.elevation));
        }
        surface.baseY = exposedSurfaceBaseY(surface.y, neighbors);
      }
    }

    // Greedily merge equal surface cells in both X and Z. Flat roads, parks,
    // fields, and roofs become a handful of rectangular slabs instead of one
    // Cesium instance per row, while cliffs retain their exposed side depth.
    const mergedSurfaceCells = new Uint8Array(PLANET_CHUNK_SIZE * PLANET_CHUNK_SIZE);
    for (let dz = 0; dz < PLANET_CHUNK_SIZE && boxes.length < MAX_GENERATED_BOXES; dz++) {
      for (let dx = 0; dx < PLANET_CHUNK_SIZE && boxes.length < MAX_GENERATED_BOXES; dx++) {
        const index = dz * PLANET_CHUNK_SIZE + dx;
        if (mergedSurfaceCells[index]) continue;
        const surface = surfaces[index];
        if (!surface) continue;
        let width = 1;
        while (dx + width < PLANET_CHUNK_SIZE) {
          const nextIndex = dz * PLANET_CHUNK_SIZE + dx + width;
          const next = surfaces[nextIndex];
          if (mergedSurfaceCells[nextIndex]) break;
          if (!next || next.y !== surface.y || next.baseY !== surface.baseY || next.blockId !== surface.blockId) break;
          width++;
        }
        let depth = 1;
        depthLoop: while (dz + depth < PLANET_CHUNK_SIZE) {
          for (let offsetX = 0; offsetX < width; offsetX++) {
            const nextIndex = (dz + depth) * PLANET_CHUNK_SIZE + dx + offsetX;
            const next = surfaces[nextIndex];
            if (mergedSurfaceCells[nextIndex]
              || !next
              || next.y !== surface.y
              || next.baseY !== surface.baseY
              || next.blockId !== surface.blockId) break depthLoop;
          }
          depth++;
        }
        for (let offsetZ = 0; offsetZ < depth; offsetZ++) {
          for (let offsetX = 0; offsetX < width; offsetX++) {
            mergedSurfaceCells[(dz + offsetZ) * PLANET_CHUNK_SIZE + dx + offsetX] = 1;
          }
        }
        const height = surface.y + 1 - surface.baseY;
        boxes.push({
          centerX: startX + dx + width / 2,
          centerY: surface.baseY + height / 2,
          centerZ: startZ + dz + depth / 2,
          width,
          height,
          depth,
          blockId: surface.blockId,
        });
      }
    }
  }
  return boxes;
}

export function collectPlacedWalkBlocks(chunks: VoxelChunkMap | undefined): VoxelBlock[] {
  if (!chunks) return [];
  return Object.values(chunks).flat().filter((block) => block.blockId !== BLOCK_AIR && !isPlantBlock(block.blockId));
}

/**
 * Reconstruct the newly exposed top block for columns whose natural surface
 * was excavated. These become close-range micro-terrain decals on the globe.
 */
export function collectExcavatedSurfacePatches(
  chunks: VoxelChunkMap | undefined,
  entities: Record<string, TerraEntity>,
  seed = 0,
): VoxelBlock[] {
  if (!chunks) return [];
  const overridesByColumn = new Map<string, Map<number, number>>();
  for (const block of Object.values(chunks).flat()) {
    const key = `${block.bx},${block.bz}`;
    const column = overridesByColumn.get(key) ?? new Map<number, number>();
    column.set(block.by, block.blockId);
    overridesByColumn.set(key, column);
  }

  const terrain = new PlanetTerrainSampler(entities, seed);
  const patches: VoxelBlock[] = [];
  for (const [key, overrides] of overridesByColumn) {
    const airLevels = [...overrides].filter(([, id]) => id === BLOCK_AIR).map(([by]) => by);
    if (airLevels.length === 0) continue;
    const [bx = 0, bz = 0] = key.split(',').map(Number);
    const sample = terrain.sampleSurface(bx, bz);
    const highestOverride = Math.max(...overrides.keys());
    const scanTop = Math.max(MAX_NATURAL_TERRAIN_Y, sample.elevation + 32, highestOverride);
    const scanBottom = sample.elevation - 32;

    let baselineTop: number | null = null;
    for (let by = scanTop; by >= scanBottom; by--) {
      const blockId = terrain.blockAt(bx, by, bz, sample);
      if (blockId !== BLOCK_AIR && !isPlantBlock(blockId)) {
        baselineTop = by;
        break;
      }
    }
    if (baselineTop === null || !airLevels.some((by) => by >= baselineTop)) continue;

    let finalTop: number | null = null;
    let finalBlockId = BLOCK_AIR;
    for (let by = scanTop; by >= scanBottom; by--) {
      const id = overrides.get(by) ?? terrain.blockAt(bx, by, bz, sample);
      if (id !== BLOCK_AIR && !isPlantBlock(id)) {
        finalTop = by;
        finalBlockId = id;
        break;
      }
    }
    if (finalTop !== null && finalTop < baselineTop) {
      patches.push({ bx, by: finalTop, bz, blockId: finalBlockId });
    }
  }
  return patches;
}

export function clearWalkVoxelGlobeOverlay(viewer: Viewer): void {
  if (!viewer.isDestroyed()) {
    for (const primitive of primitives) viewer.scene.primitives.remove(primitive);
  }
  primitives = [];
  lastViewer = null;
  lastChunks = undefined;
  lastEntities = null;
  lastManifest = undefined;
  lastSeed = Number.NaN;
  lastVisibleSignature = '';
  generatedBoxCache.clear();
  boxCacheChunks = undefined;
  boxCacheEntities = null;
  boxCacheSeed = Number.NaN;
  readinessViewer = null;
  if (readinessFrameId !== null) window.cancelAnimationFrame(readinessFrameId);
  readinessFrameId = null;
  readinessFramesRemaining = 0;
  if (pendingGenerationTimer !== null) clearTimeout(pendingGenerationTimer);
  pendingGenerationTimer = null;
}

export function syncWalkVoxelsToGlobe(
  viewer: Viewer,
  chunks: VoxelChunkMap | undefined,
  entities: Record<string, TerraEntity>,
  seed = 0,
  generatedChunks?: GeneratedVoxelChunkMap,
): void {
  if (viewer.isDestroyed()) return;
  const camera = viewer.camera.positionCartographic;
  const effectiveManifest = effectiveGeneratedVoxelManifest(generatedChunks, chunks, entities);
  const performanceMode = useUiStore.getState().performanceMode;
  const visibleChunkColumns = visibleGeneratedChunkColumns(
    effectiveManifest,
    CesiumMath.toDegrees(camera.longitude),
    CesiumMath.toDegrees(camera.latitude),
    camera.height,
    performanceMode ? MAX_PERFORMANCE_VISIBLE_GENERATED_CHUNKS : MAX_VISIBLE_GENERATED_CHUNKS,
  );
  const renderChunkColumns = visibleChunkColumns;
  // Distance ordering changes during small camera moves even when the visible
  // chunk set does not. Use a canonical set signature so Cesium primitives are
  // not torn down and rebuilt merely because two nearby chunks swap rank.
  const visibleSignature = `${performanceMode ? 'perf' : 'full'}:${[...renderChunkColumns].sort().join('|')}`;
  if (
    lastViewer === viewer
    && lastChunks === chunks
    && lastEntities === entities
    && lastManifest === generatedChunks
    && lastSeed === seed
    && lastVisibleSignature === visibleSignature
  ) return;
  for (const primitive of primitives) viewer.scene.primitives.remove(primitive);
  primitives = [];
  lastViewer = viewer;
  lastChunks = chunks;
  lastEntities = entities;
  lastManifest = generatedChunks;
  lastSeed = seed;
  lastVisibleSignature = visibleSignature;

  if (boxCacheChunks !== chunks || boxCacheEntities !== entities || boxCacheSeed !== seed) {
    generatedBoxCache.clear();
    boxCacheChunks = chunks;
    boxCacheEntities = entities;
    boxCacheSeed = seed;
  }
  const generatedBoxes: GeneratedVoxelBox[] = [];
  const maskedChunkColumns: string[] = [];
  const generatedBoxBudget = performanceMode ? MAX_PERFORMANCE_GENERATED_BOXES : MAX_GENERATED_BOXES;
  const MAX_BOX_CACHE_SIZE = 256;
  const startTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const TIME_BUDGET_MS = 6;
  let hasUncachedRemaining = false;

  for (const key of renderChunkColumns) {
    let cached = generatedBoxCache.get(key);
    if (!cached) {
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      if (generatedBoxes.length > 0 && now - startTime > TIME_BUDGET_MS) {
        hasUncachedRemaining = true;
        continue;
      }
      cached = collectGeneratedChunkBoxes([key], chunks, entities, seed);
      generatedBoxCache.set(key, cached);
      if (generatedBoxCache.size > MAX_BOX_CACHE_SIZE) {
        generatedBoxCache.delete(generatedBoxCache.keys().next().value!);
      }
    }
    // Never mask a chunk whose geometry was omitted by the box budget. That
    // mismatch produced apparently random dark/missing squares while panning.
    if (generatedBoxes.length > 0 && generatedBoxes.length + cached.length > generatedBoxBudget) break;
    generatedBoxes.push(...cached);
    maskedChunkColumns.push(key);
    if (generatedBoxes.length >= generatedBoxBudget) break;
  }

  if (hasUncachedRemaining && typeof window !== 'undefined') {
    if (pendingGenerationTimer !== null) clearTimeout(pendingGenerationTimer);
    pendingGenerationTimer = setTimeout(() => {
      pendingGenerationTimer = null;
      if (!viewer.isDestroyed()) {
        syncWalkVoxelsToGlobe(viewer, chunks, entities, seed, generatedChunks);
      }
    }, 16) as unknown as ReturnType<typeof setTimeout>;
  }
  addVoxelChunkGroundMasks(viewer, maskedChunkColumns);
  const generatedGroups = new Map<number, GeneratedVoxelBox[]>();
  for (const box of generatedBoxes) {
    const group = generatedGroups.get(box.blockId) ?? [];
    group.push(box);
    generatedGroups.set(box.blockId, group);
  }
  for (const [blockId, boxes] of generatedGroups) {
    const definition = BLOCK_BY_ID.get(blockId);
    if (!definition) continue;
    const faces = globeBlockTextureFaces(definition.textures);
    const translucentTexture = definition.name === 'water'
      || definition.name === 'glass'
      || definition.name === 'ice'
      || definition.name.includes('leaves');
    if (faces) {
      addTexturedBoxes(viewer, faces.side, boxes, translucentTexture, true);
      if (faces.top !== faces.side) {
        addTexturedBoxes(viewer, faces.top, boxes.map((box) => ({
          centerX: box.centerX,
          centerY: box.centerY + box.height / 2 + 0.008,
          centerZ: box.centerZ,
          width: box.width,
          height: 0.016,
          depth: box.depth,
        })), translucentTexture, true);
      }
      continue;
    }
    const color = Color.fromCssColorString(definition.color).withAlpha(
      definition.name === 'water' ? 0.58 : definition.name === 'glass' ? 0.48 : 0.96,
    );
    const geometryInstances = boxes.map((box) => {
      const [lon, lat] = planetMetersToLonLat(box.centerX, box.centerZ);
      const center = Cartesian3.fromDegrees(lon, lat, box.centerY);
      const orientation = Transforms.headingPitchRollQuaternion(center, new HeadingPitchRoll());
      return new GeometryInstance({
        geometry: BoxGeometry.fromDimensions({
          dimensions: new Cartesian3(1, 1, 1),
          vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT,
        }),
        modelMatrix: Matrix4.fromTranslationQuaternionRotationScale(
          center,
          orientation,
          new Cartesian3(box.width, box.depth, box.height),
        ),
        attributes: {
          color: ColorGeometryInstanceAttribute.fromColor(color),
          distanceDisplayCondition: new DistanceDisplayConditionGeometryInstanceAttribute(0, MAX_DISPLAY_DISTANCE_M),
        },
      });
    });
    const primitive = new Primitive({
      geometryInstances,
      appearance: new PerInstanceColorAppearance({ closed: true, translucent: color.alpha < 1 }),
      asynchronous: true,
    });
    viewer.scene.primitives.add(primitive);
    primitives.push(primitive);
    requestFramesUntilPrimitiveReady(viewer, primitive, true);
  }

  const groups = new Map<number, VoxelBlock[]>();
  for (const block of collectPlacedWalkBlocks(chunks)) {
    const group = groups.get(block.blockId) ?? [];
    group.push(block);
    groups.set(block.blockId, group);
  }

  for (const [blockId, blocks] of groups) {
    const definition = BLOCK_BY_ID.get(blockId);
    if (!definition) continue;
    const faces = globeBlockTextureFaces(definition.textures);
    const translucentTexture = definition.name === 'water'
      || definition.name === 'glass'
      || definition.name === 'ice'
      || definition.name.includes('leaves');
    if (faces) {
      const boxes = blocks.map((block) => ({
        centerX: block.bx + 0.5,
        centerY: block.by + 0.5,
        centerZ: block.bz + 0.5,
        width: 1,
        height: 1,
        depth: 1,
      }));
      addTexturedBoxes(viewer, faces.side, boxes, translucentTexture, false);
      if (faces.top !== faces.side) {
        addTexturedBoxes(viewer, faces.top, boxes.map((box) => ({
          ...box,
          centerY: box.centerY + 0.508,
          height: 0.016,
        })), translucentTexture, false);
      }
      continue;
    }
    const color = Color.fromCssColorString(definition.color).withAlpha(
      definition.name === 'water' ? 0.65 : definition.name === 'glass' ? 0.55 : 1,
    );
    const geometryInstances = blocks.map((block) => {
      const [lon, lat] = planetMetersToLonLat(block.bx + 0.5, block.bz + 0.5);
      const center = Cartesian3.fromDegrees(lon, lat, block.by + 0.5);
      const orientation = Transforms.headingPitchRollQuaternion(center, new HeadingPitchRoll());
      return new GeometryInstance({
        geometry: BoxGeometry.fromDimensions({
          dimensions: new Cartesian3(1, 1, 1),
          vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT,
        }),
        modelMatrix: Matrix4.fromTranslationQuaternionRotationScale(
          center,
          orientation,
          new Cartesian3(1, 1, 1),
        ),
        attributes: {
          color: ColorGeometryInstanceAttribute.fromColor(color),
          distanceDisplayCondition: new DistanceDisplayConditionGeometryInstanceAttribute(
            0,
            MAX_DISPLAY_DISTANCE_M,
          ),
        },
      });
    });

    const primitive = new Primitive({
      geometryInstances,
      appearance: new PerInstanceColorAppearance({
        closed: true,
        translucent: color.alpha < 1,
      }),
      asynchronous: false,
    });
    viewer.scene.primitives.add(primitive);
    primitives.push(primitive);
  }

  const patchGroups = new Map<number, VoxelBlock[]>();
  for (const patch of collectExcavatedSurfacePatches(chunks, entities, seed)) {
    const group = patchGroups.get(patch.blockId) ?? [];
    group.push(patch);
    patchGroups.set(patch.blockId, group);
  }
  for (const [blockId, patches] of patchGroups) {
    const definition = BLOCK_BY_ID.get(blockId);
    if (!definition) continue;
    const faces = globeBlockTextureFaces(definition.textures);
    if (faces) {
      const patchBoxes = patches.map((patch) => ({
        centerX: patch.bx + 0.5,
        centerY: patch.by + 0.5,
        centerZ: patch.bz + 0.5,
        width: 1,
        height: 1,
        depth: 1,
      }));
      addTexturedBoxes(viewer, faces.side, patchBoxes, false, false);
      if (faces.top !== faces.side) {
        addTexturedBoxes(viewer, faces.top, patchBoxes.map((box) => ({
          ...box,
          centerY: box.centerY + 0.508,
          height: 0.016,
        })), false, false);
      }
      continue;
    }
    const color = Color.fromCssColorString(definition.color).brighten(0.12, new Color());
    const geometryInstances = patches.map((patch) => {
      const [lon, lat] = planetMetersToLonLat(patch.bx + 0.5, patch.bz + 0.5);
      const center = Cartesian3.fromDegrees(lon, lat, patch.by + 1.03);
      const orientation = Transforms.headingPitchRollQuaternion(center, new HeadingPitchRoll());
      return new GeometryInstance({
        geometry: BoxGeometry.fromDimensions({
          dimensions: new Cartesian3(1, 1, 0.06),
          vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT,
        }),
        modelMatrix: Matrix4.fromTranslationQuaternionRotationScale(
          center,
          orientation,
          new Cartesian3(1, 1, 1),
        ),
        attributes: {
          color: ColorGeometryInstanceAttribute.fromColor(color),
          distanceDisplayCondition: new DistanceDisplayConditionGeometryInstanceAttribute(0, MAX_DISPLAY_DISTANCE_M),
        },
      });
    });
    const primitive = new Primitive({
      geometryInstances,
      appearance: new PerInstanceColorAppearance({ closed: true, translucent: false }),
      asynchronous: false,
    });
    viewer.scene.primitives.add(primitive);
    primitives.push(primitive);
  }
  viewer.scene.requestRender();
}

import {
  BoxGeometry,
  Cartesian3,
  Color,
  ColorGeometryInstanceAttribute,
  DistanceDisplayConditionGeometryInstanceAttribute,
  GeometryInstance,
  HeadingPitchRoll,
  Matrix4,
  Material,
  MaterialAppearance,
  PerInstanceColorAppearance,
  Primitive,
  Transforms,
  Math as CesiumMath,
  type Viewer,
} from 'cesium';
import type { GeneratedVoxelChunkMap, TerraEntity, VoxelBlock, VoxelChunkMap } from '@/entities/types';
import { lonLatToPlanetMeters, planetChunkKey, planetMetersToLonLat, PLANET_CHUNK_SIZE } from '@/planet/spatial/PlanetGrid';
import { BLOCK_AIR, BLOCK_BY_ID } from '@/walk/blockRegistry';
import { MAX_NATURAL_TERRAIN_Y, PlanetTerrainSampler } from '@/planet/terrain/PlanetTerrainSampler';

const MAX_DISPLAY_DISTANCE_M = 75_000;
const MAX_GENERATED_ALTITUDE_M = 60_000;
const MAX_VISIBLE_GENERATED_CHUNKS = 9;
const MAX_GENERATED_BOXES = 18_000;
let primitives: Primitive[] = [];
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
        dimensions: new Cartesian3(box.width, box.depth, box.height),
        vertexFormat: MaterialAppearance.MaterialSupport.TEXTURED.vertexFormat,
      }),
      modelMatrix: Matrix4.fromTranslationQuaternionRotationScale(center, orientation, new Cartesian3(1, 1, 1)),
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

function requestFramesUntilPrimitiveReady(viewer: Viewer, primitive: Primitive, asynchronous: boolean): void {
  if (!asynchronous) return;
  let remainingFrames = 120;
  const request = () => {
    if (remainingFrames-- <= 0 || viewer.isDestroyed() || primitive.isDestroyed()) return;
    viewer.scene.requestRender();
    if (!primitive.ready) window.requestAnimationFrame(request);
  };
  window.requestAnimationFrame(request);
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

export function visibleGeneratedChunkColumns(
  manifest: GeneratedVoxelChunkMap | undefined,
  cameraLon: number,
  cameraLat: number,
  cameraHeight: number,
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
    .slice(0, MAX_VISIBLE_GENERATED_CHUNKS)
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
          if (blockId !== BLOCK_AIR) {
            surfaces[dz * PLANET_CHUNK_SIZE + dx] = { y: by, blockId, baseY: by };
            break;
          }
        }

        let runId = BLOCK_AIR;
        let runStart = baselineTop + 1;
        const flushRun = (endY: number) => {
          if (runId === BLOCK_AIR || runId === 25 || runId === 26 || boxes.length >= MAX_GENERATED_BOXES) return;
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
        for (let by = baselineTop + 1; by <= MAX_NATURAL_TERRAIN_Y + 1; by++) {
          const nextId = by <= MAX_NATURAL_TERRAIN_Y ? naturalBlockAt(bx, by, bz, sample) : BLOCK_AIR;
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

    // Merge adjacent cells only when both their top and exposed wall base match.
    for (let dz = 0; dz < PLANET_CHUNK_SIZE && boxes.length < MAX_GENERATED_BOXES; dz++) {
      let dx = 0;
      while (dx < PLANET_CHUNK_SIZE && boxes.length < MAX_GENERATED_BOXES) {
        const surface = surfaces[dz * PLANET_CHUNK_SIZE + dx];
        if (!surface) { dx++; continue; }
        let width = 1;
        while (dx + width < PLANET_CHUNK_SIZE) {
          const next = surfaces[dz * PLANET_CHUNK_SIZE + dx + width];
          if (!next || next.y !== surface.y || next.baseY !== surface.baseY || next.blockId !== surface.blockId) break;
          width++;
        }
        const height = surface.y + 1 - surface.baseY;
        boxes.push({
          centerX: startX + dx + width / 2,
          centerY: surface.baseY + height / 2,
          centerZ: startZ + dz + 0.5,
          width,
          height,
          depth: 1,
          blockId: surface.blockId,
        });
        dx += width;
      }
    }
  }
  return boxes;
}

export function collectPlacedWalkBlocks(chunks: VoxelChunkMap | undefined): VoxelBlock[] {
  if (!chunks) return [];
  return Object.values(chunks).flat().filter((block) => block.blockId !== BLOCK_AIR);
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
      if (terrain.blockAt(bx, by, bz, sample) !== BLOCK_AIR) {
        baselineTop = by;
        break;
      }
    }
    if (baselineTop === null || !airLevels.some((by) => by >= baselineTop)) continue;

    let finalTop: number | null = null;
    let finalBlockId = BLOCK_AIR;
    for (let by = scanTop; by >= scanBottom; by--) {
      const id = overrides.get(by) ?? terrain.blockAt(bx, by, bz, sample);
      if (id !== BLOCK_AIR) {
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
  const visibleChunkColumns = visibleGeneratedChunkColumns(
    effectiveManifest,
    CesiumMath.toDegrees(camera.longitude),
    CesiumMath.toDegrees(camera.latitude),
    camera.height,
  );
  const visibleSignature = visibleChunkColumns.join('|');
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
  for (const key of visibleChunkColumns) {
    let cached = generatedBoxCache.get(key);
    if (!cached) {
      cached = collectGeneratedChunkBoxes([key], chunks, entities, seed);
      generatedBoxCache.set(key, cached);
      if (generatedBoxCache.size > 64) generatedBoxCache.delete(generatedBoxCache.keys().next().value!);
    }
    generatedBoxes.push(...cached);
    if (generatedBoxes.length >= MAX_GENERATED_BOXES) break;
  }
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
          dimensions: new Cartesian3(box.width, box.depth, box.height),
          vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT,
        }),
        modelMatrix: Matrix4.fromTranslationQuaternionRotationScale(center, orientation, new Cartesian3(1, 1, 1)),
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

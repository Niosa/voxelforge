import type { TerraEntity } from '@/entities/types';
import type { BiomeType } from '@/geo/biomeTexture';
import { planetMetersToLonLat } from '@/planet/spatial/PlanetGrid';
import { cityColumnLayout, createCityLayout, type CityLayout } from '@/city/CityLayout';
import { clusteredOreAt, isNoiseIntersectionCave, sampleV7TerrainFields, valueNoise3D } from './LuantiMapgen';

export interface PlanetSurfaceSample {
  lon: number;
  lat: number;
  elevation: number;
  waterLevel: number | null;
  frozenWater: boolean;
  biome: BiomeType;
  surfaceBlockId: number;
  isForest: boolean;
  isCity: boolean;
  featureId: string | null;
}

interface ColumnDecoration {
  trunk: boolean;
  leaves: boolean;
  treeBase: number;
  treeHeight: number;
  leafDistance: number;
  leafStyle: number;
  leafHash: number;
  plantBlockId: number;
  buildingHeight: number;
  buildingWall: boolean;
  buildingBlockId: number;
  buildingEntrance: boolean;
  road: boolean;
}

interface TerrainColumn {
  globalX: number;
  globalZ: number;
  sample: PlanetSurfaceSample;
  decoration: ColumnDecoration;
}

const MAX_COLUMN_CACHE_SIZE = 16_384;
export const MAX_NATURAL_TERRAIN_Y = 63;

const LAND_TYPES = new Set(['continent', 'island', 'region', 'city', 'town']);
export const FOLIAGE_CELL_SIZE = 7;
export const NATURAL_POND_CELL_SIZE = 96;

export function isSettlementRoadBlock(blockId: number): boolean {
  return blockId === 13 || blockId === 44;
}

function hashCoordinates(seed: number, x: number, z: number, salt = 0): number {
  let hash = (seed ^ salt ^ Math.imul(x, 73_856_093) ^ Math.imul(z, 19_349_663)) | 0;
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 1_274_126_177);
  return (hash ^ hash >>> 16) >>> 0;
}

export function naturalPondAt(seed: number, globalX: number, globalZ: number, biome: BiomeType): { water: boolean; centerX: number; centerZ: number; radius: number } {
  const cellX = Math.floor(globalX / NATURAL_POND_CELL_SIZE);
  const cellZ = Math.floor(globalZ / NATURAL_POND_CELL_SIZE);
  const selector = hashCoordinates(seed, cellX, cellZ, 911);
  const enabled = biome === 'forest-canopy' && selector % 13 === 0;
  const centerX = cellX * NATURAL_POND_CELL_SIZE + 20 + hashCoordinates(seed, cellX, cellZ, 919) % 56;
  const centerZ = cellZ * NATURAL_POND_CELL_SIZE + 20 + hashCoordinates(seed, cellX, cellZ, 929) % 56;
  const radius = 7 + hashCoordinates(seed, cellX, cellZ, 937) % 10;
  return { water: enabled && Math.hypot(globalX - centerX, globalZ - centerZ) <= radius, centerX, centerZ, radius };
}

export function foliageTreePosition(seed: number, cellX: number, cellZ: number): readonly [number, number] {
  return [
    cellX * FOLIAGE_CELL_SIZE + 1 + hashCoordinates(seed, cellX, cellZ, 71) % 5,
    cellZ * FOLIAGE_CELL_SIZE + 1 + hashCoordinates(seed, cellX, cellZ, 83) % 5,
  ];
}

export function foliageCellHasTree(
  seed: number,
  biome: BiomeType,
  denseForest: boolean,
  cellX: number,
  cellZ: number,
): boolean {
  if (denseForest) return true;
  const selector = hashCoordinates(seed, cellX, cellZ, 131);
  if (biome === 'lush-grassland') return selector % 5 === 0;
  if (biome === 'snowy-tundra') return selector % 7 === 0;
  if (biome === 'coastal-beach') return selector % 11 === 0;
  return false;
}

function ringArea(ring: number[][]): number {
  let area = 0;
  for (let index = 0; index < ring.length; index++) {
    const current = ring[index]!;
    const next = ring[(index + 1) % ring.length]!;
    area += current[0]! * next[1]! - next[0]! * current[1]!;
  }
  return Math.abs(area / 2);
}

function entityArea(entity: TerraEntity): number {
  if (entity.geometry.type === 'Point') return 0;
  if (entity.geometry.type === 'Polygon') return ringArea(entity.geometry.coordinates[0] as number[][]);
  return entity.geometry.coordinates.reduce((sum, polygon) => sum + ringArea(polygon[0] as number[][]), 0);
}

function pointInRing(lon: number, lat: number, ring: number[][]): boolean {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const xi = ring[index]![0]!, yi = ring[index]![1]!;
    const xj = ring[previous]![0]!, yj = ring[previous]![1]!;
    if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function polygonContains(lon: number, lat: number, polygon: number[][][]): boolean {
  const outer = polygon[0];
  if (!outer || !pointInRing(lon, lat, outer)) return false;
  return !polygon.slice(1).some((hole) => pointInRing(lon, lat, hole));
}

function entityContains(entity: TerraEntity, lon: number, lat: number): boolean {
  if (entity.geometry.type === 'Point') return false;
  if (entity.geometry.type === 'Polygon') return polygonContains(lon, lat, entity.geometry.coordinates as number[][][]);
  return entity.geometry.coordinates.some((polygon) => polygonContains(lon, lat, polygon as number[][][]));
}

function pointDistanceM(entity: TerraEntity, lon: number, lat: number): number {
  if (entity.geometry.type !== 'Point') return Number.POSITIVE_INFINITY;
  const [entityLon, entityLat] = entity.geometry.coordinates;
  const latScale = 111_320;
  const lonScale = latScale * Math.cos(lat * Math.PI / 180);
  return Math.hypot((entityLon! - lon) * lonScale, (entityLat! - lat) * latScale);
}

function entityBiome(entity: TerraEntity | null): BiomeType {
  const biome = entity?.properties.biome;
  const authoredBiome = typeof biome === 'string' ? biome as BiomeType : 'satellite-blend';
  const climate = entity?.properties.climate;

  // Climate is an authored terrain constraint, not only a globe texture tint.
  // Preserve strongly semantic biomes (water, cities, mountains, etc.) while
  // compiling generic land into a matching walk-mode surface.
  const climateCanShapeBiome = authoredBiome !== 'shallow-water'
    && authoredBiome !== 'city-urban'
    && authoredBiome !== 'town-village'
    && authoredBiome !== 'volcanic-ash';
  if (!climateCanShapeBiome) return authoredBiome;

  switch (climate) {
    case 'frigid': return 'snowy-tundra';
    case 'arid': return 'desert-dunes';
    case 'tropical': return 'forest-canopy';
    default: return authoredBiome;
  }
}

function hasAuthoredTerrainStyle(entity: TerraEntity): boolean {
  return entity.properties.biome !== undefined && entity.properties.biome !== 'satellite-blend'
    || entity.properties.climate !== undefined
    || entity.properties.topography !== undefined
    || entity.properties.water === true;
}

function topographyAmplitude(entity: TerraEntity | null, biome: BiomeType): number {
  const reliefHeight = Number(entity?.properties.reliefHeight);
  if (Number.isFinite(reliefHeight) && reliefHeight > 0) {
    return Math.max(2, Math.min(34, Math.sqrt(reliefHeight) * 0.5));
  }
  if (biome === 'mountain-slate') return 18;
  if (biome === 'city-urban' || biome === 'town-village') return 1;
  switch (entity?.properties.topography) {
    case 'mountains': return 18;
    case 'hills': return 8;
    case 'valleys': return 5;
    case 'plains': return 2;
    default: return 4;
  }
}

function surfaceMaterial(biome: BiomeType): number {
  switch (biome) {
    case 'desert-dunes':
    case 'coastal-beach': return 4;
    case 'shallow-water': return 4;
    case 'snowy-tundra': return 8;
    case 'volcanic-ash':
    case 'mountain-slate': return 13;
    case 'city-urban':
    case 'town-village': return 11;
    default: return 3;
  }
}

export class PlanetTerrainSampler {
  private readonly polygons: TerraEntity[];
  private readonly points: TerraEntity[];
  private readonly entitiesById: Record<string, TerraEntity>;
  private readonly cityLayouts = new Map<string, CityLayout>();
  private readonly columnCache = new Map<string, TerrainColumn>();

  constructor(entities: Record<string, TerraEntity>, private readonly seed = 0) {
    this.entitiesById = entities;
    const all = Object.values(entities);
    this.polygons = all.filter((entity) => entity.geometry.type !== 'Point').sort((a, b) => entityArea(a) - entityArea(b));
    this.points = all.filter((entity) => entity.geometry.type === 'Point' && entity.properties.walkEntry !== true);
    for (const entity of all) {
      if (entity.type === 'city' || entity.type === 'town') {
        this.cityLayouts.set(entity.id, createCityLayout(entity, seed));
      }
    }
  }

  sampleSurface(globalX: number, globalZ: number): PlanetSurfaceSample {
    const [lon, lat] = planetMetersToLonLat(globalX + 0.5, globalZ + 0.5);
    const containing = this.polygons.filter((entity) => entityContains(entity, lon, lat));
    let feature = containing[0] ?? null;

    const nearbyPoint = this.points
      .map((entity) => ({ entity, distance: pointDistanceM(entity, lon, lat) }))
      .filter(({ entity, distance }) => {
        const configured = Number(entity.properties.footprintRadiusM);
        const radius = Number.isFinite(configured) && configured > 0
          ? configured
          : entity.type === 'city' ? 240 : entity.type === 'town' ? 140 : 60;
        return distance <= radius;
      })
      .sort((a, b) => a.distance - b.distance)[0]?.entity;
    if (nearbyPoint) feature = nearbyPoint;

    const styleFeature = nearbyPoint
      ?? containing.find(hasAuthoredTerrainStyle)
      ?? feature;
    let biome = entityBiome(styleFeature);
    const explicitWater = biome === 'shallow-water'
      || feature?.properties.water === true
      || styleFeature?.properties.water === true;
    const frozenWater = explicitWater && styleFeature?.properties.climate === 'frigid';
    const land = !explicitWater && (
      containing.some((entity) => LAND_TYPES.has(entity.type))
      || (feature !== null && LAND_TYPES.has(feature.type))
    );

    if (!land) biome = 'shallow-water';
    const localSettlement = nearbyPoint && (nearbyPoint.type === 'city' || nearbyPoint.type === 'town')
      ? nearbyPoint
      : containing.find((entity) => entity.type === 'city' || entity.type === 'town');
    const isCity = land && (localSettlement !== undefined || biome === 'city-urban' || biome === 'town-village');
    if (isCity) biome = localSettlement?.type === 'town' ? 'town-village' : 'city-urban';
    const isForest = land && !isCity && (
      biome === 'forest-canopy'
      || feature?.tags.includes('forest') === true
      || styleFeature?.tags.includes('forest') === true
    );
    const fields = sampleV7TerrainFields(this.seed, globalX, globalZ);
    const noiseA = fields.rolling * 0.5 + 0.5;
    const noiseB = valueNoise3D(this.seed + 539, globalX, 0, globalZ, 220) * 0.5 + 0.5;
    const amplitude = topographyAmplitude(styleFeature, biome);
    const mountainous = biome === 'mountain-slate' || styleFeature?.properties.topography === 'mountains';
    const mountainStrength = mountainous ? 1.25 : styleFeature?.properties.topography === 'hills' ? 0.42 : 0.18;
    const relief = fields.rolling * amplitude * 0.72
      + fields.mountain * amplitude * mountainStrength
      - fields.ridge * amplitude * (mountainous ? 0.12 : 0.24);
    let elevation = land
      ? Math.max(1, Math.min(54, Math.floor(4 + relief)))
      : -4 - Math.floor(noiseA * 3);
    const naturalWater = land && !isCity && naturalPondAt(this.seed, globalX, globalZ, biome).water;
    if (naturalWater) elevation = Math.min(elevation, 1);
    let surfaceBlockId = surfaceMaterial(biome);
    if (biome === 'snowy-tundra') {
      const variableMountainSnow = styleFeature?.properties.topography === 'mountains'
        || styleFeature?.properties.biome === 'mountain-slate';
      if (variableMountainSnow) {
        const snowLine = 3 + Math.floor(noiseB * 7);
        surfaceBlockId = elevation >= snowLine || noiseA > 0.72 ? 8 : elevation > 6 ? 13 : 3;
      } else {
        surfaceBlockId = 8;
      }
    }

    return {
      lon,
      lat,
      elevation: isCity ? 4 : elevation,
      waterLevel: naturalWater ? 3 : land ? null : 0,
      frozenWater,
      biome,
      surfaceBlockId,
      isForest,
      isCity,
      featureId: feature?.id ?? null,
    };
  }

  blockAt(globalX: number, worldY: number, globalZ: number, sample = this.sampleSurface(globalX, globalZ)): number {
    return this.blockFromColumn(worldY, this.columnAt(globalX, globalZ, sample));
  }

  blocksForColumn(globalX: number, globalZ: number, startY: number, height: number): Uint8Array {
    const column = this.columnAt(globalX, globalZ);
    const blocks = new Uint8Array(height);
    for (let offset = 0; offset < height; offset++) {
      blocks[offset] = this.blockFromColumn(startY + offset, column);
    }
    return blocks;
  }

  private blockFromColumn(worldY: number, column: TerrainColumn): number {
    const { sample, decoration } = column;
    if (decoration.buildingHeight > 0 && worldY > sample.elevation && worldY <= sample.elevation + decoration.buildingHeight) {
      const roof = worldY === sample.elevation + decoration.buildingHeight;
      if (roof) return sample.biome === 'town-village'
        ? (hashCoordinates(this.seed, column.globalX, column.globalZ, 1_103) % 3 === 0 ? 28 : 22)
        : 13;
      if (!decoration.buildingWall) return 0;
      const facadeLevel = worldY - sample.elevation;
      if (decoration.buildingEntrance && facadeLevel <= 2) return facadeLevel === 1 ? 23 : 46;
      return facadeLevel > 1 && facadeLevel % 3 === 0 ? 10 : decoration.buildingBlockId;
    }
    if (decoration.trunk && worldY > decoration.treeBase && worldY <= decoration.treeBase + decoration.treeHeight) return sample.biome === 'snowy-tundra' ? 41 : 5;
    if (decoration.leaves && this.hasLeafAt(worldY, decoration)) return sample.biome === 'snowy-tundra' ? 43 : 6;
    if (decoration.plantBlockId > 0 && worldY === sample.elevation + 1 && sample.waterLevel === null) return decoration.plantBlockId;
    if (sample.waterLevel !== null && worldY > sample.elevation && worldY <= sample.waterLevel) {
      return sample.frozenWater && worldY === sample.waterLevel ? 30 : 7;
    }
    if (worldY < sample.elevation - 3) {
      if (!sample.isCity && sample.waterLevel === null && worldY > -24 && this.isCave(column.globalX, worldY, column.globalZ, sample.elevation)) return 0;
      const depth = sample.elevation - worldY;
      const ore = clusteredOreAt(this.seed, column.globalX, worldY, column.globalZ, depth);
      if (ore !== null) return ore;
      const geology = valueNoise3D(this.seed + 701, column.globalX, worldY, column.globalZ, 13);
      if (geology > 0.48) return 38;
      if (geology < -0.52) return 39;
      if (Math.abs(geology) < 0.055) return 40;
      if (sample.biome === 'mountain-slate' && geology > 0.25) return 33;
      return 1;
    }
    if (worldY < sample.elevation) {
      if (sample.biome === 'desert-dunes' || sample.biome === 'coastal-beach') return 27;
      if (sample.biome === 'mountain-slate' || sample.biome === 'volcanic-ash') return 38;
      return sample.waterLevel !== null ? 31 : 2;
    }
    if (worldY === sample.elevation) {
      if (decoration.road) return sample.biome === 'town-village' ? 44 : 13;
      if (sample.isCity) return decoration.buildingHeight > 0 ? decoration.buildingBlockId : 3;
      const surfaceVariant = hashCoordinates(this.seed, column.globalX, column.globalZ, 809);
      if (sample.waterLevel !== null) return surfaceVariant % 5 === 0 ? 29 : surfaceVariant % 7 === 0 ? 32 : 31;
      if (sample.biome === 'desert-dunes' && surfaceVariant % 9 === 0) return 36;
      if (sample.biome === 'mountain-slate' || sample.biome === 'volcanic-ash') {
        return surfaceVariant % 5 === 0 ? 39 : surfaceVariant % 7 === 0 ? 40 : 38;
      }
      return sample.surfaceBlockId;
    }
    return 0;
  }

  private columnAt(globalX: number, globalZ: number, suppliedSample?: PlanetSurfaceSample): TerrainColumn {
    const key = `${globalX},${globalZ}`;
    const cached = this.columnCache.get(key);
    if (cached) return cached;

    const sample = suppliedSample ?? this.sampleSurface(globalX, globalZ);
    const column = { globalX, globalZ, sample, decoration: this.decorationAt(globalX, globalZ, sample) };
    this.columnCache.set(key, column);
    if (this.columnCache.size > MAX_COLUMN_CACHE_SIZE) {
      const oldest = this.columnCache.keys().next().value as string | undefined;
      if (oldest !== undefined) this.columnCache.delete(oldest);
    }
    return column;
  }

  findSafeSpawn(globalX: number, globalZ: number): readonly [number, number, number] {
    for (let radius = 0; radius <= 16; radius++) {
      for (let dz = -radius; dz <= radius; dz++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (radius > 0 && Math.abs(dx) !== radius && Math.abs(dz) !== radius) continue;
          const x = globalX + dx;
          const z = globalZ + dz;
          const sample = this.sampleSurface(x, z);
          const decoration = this.decorationAt(x, z, sample);
          if (!decoration.trunk && decoration.buildingHeight === 0) {
            const y = (sample.waterLevel ?? sample.elevation) + 2;
            return [x, y, z];
          }
        }
      }
    }
    const sample = this.sampleSurface(globalX, globalZ);
    return [globalX, (sample.waterLevel ?? sample.elevation) + 2, globalZ];
  }

  private decorationAt(globalX: number, globalZ: number, sample: PlanetSurfaceSample): ColumnDecoration {
    let trunk = false;
    let leaves = false;
    let treeHeight = 5;
    let leafDistance = 0;
    let leafStyle = 0;
    let leafHash = 0;
    const cellX = Math.floor(globalX / FOLIAGE_CELL_SIZE);
    const cellZ = Math.floor(globalZ / FOLIAGE_CELL_SIZE);
    const supportsFoliage = sample.isForest
      || sample.biome === 'lush-grassland'
      || sample.biome === 'snowy-tundra'
      || sample.biome === 'coastal-beach';
    if (supportsFoliage) {
      for (let cz = cellZ - 1; cz <= cellZ + 1; cz++) {
        for (let cx = cellX - 1; cx <= cellX + 1; cx++) {
          if (!foliageCellHasTree(this.seed, sample.biome, sample.isForest, cx, cz)) continue;
          const [treeX, treeZ] = foliageTreePosition(this.seed, cx, cz);
          const dx = Math.abs(globalX - treeX);
          const dz = Math.abs(globalZ - treeZ);
          const treeVariant = hashCoordinates(this.seed, cx, cz, 149);
          const candidateHeight = 4 + treeVariant % 4;
          const candidateStyle = treeVariant % 3;
          const canopyRadius = candidateStyle === 1 ? 2 : 2 + treeVariant % 2;
          if (dx === 0 && dz === 0) trunk = true;
          if (dx <= canopyRadius && dz <= canopyRadius) {
            leaves = true;
            treeHeight = candidateHeight;
            leafDistance = Math.max(dx, dz);
            leafStyle = candidateStyle;
            leafHash = hashCoordinates(this.seed, globalX, globalZ, treeVariant);
          }
        }
      }
    }

    let buildingHeight = 0;
    let buildingWall = false;
    let buildingBlockId = 11;
    let buildingEntrance = false;
    let road = false;
    if (sample.isCity) {
      const feature = sample.featureId ? this.entitiesById[sample.featureId] : undefined;
      const layout = sample.featureId ? this.cityLayouts.get(sample.featureId) : undefined;
      if (layout) {
        const column = cityColumnLayout(layout, globalX, globalZ);
        road = column.road;
        buildingHeight = column.buildingHeight;
        buildingWall = column.buildingWall;
        buildingBlockId = column.buildingBlockId;
        buildingEntrance = column.buildingEntrance;
      } else if (feature?.type === 'city' || feature?.type === 'town') {
        const fallbackLayout = createCityLayout(feature, this.seed);
        const column = cityColumnLayout(fallbackLayout, globalX, globalZ);
        road = column.road;
        buildingHeight = column.buildingHeight;
        buildingWall = column.buildingWall;
        buildingBlockId = column.buildingBlockId;
        buildingEntrance = column.buildingEntrance;
      }
    }
    if (sample.biome === 'town-village' && buildingBlockId === 11) buildingBlockId = 42;
    const plantSelector = hashCoordinates(this.seed, globalX, globalZ, 577);
    const supportsPlants = !sample.isCity && sample.waterLevel === null && (sample.biome === 'lush-grassland' || sample.biome === 'forest-canopy');
    const plantBlockId = supportsPlants && plantSelector % 17 === 0 ? 26 : supportsPlants && plantSelector % 5 === 0 ? 25 : 0;
    return { trunk, leaves, treeBase: sample.elevation, treeHeight, leafDistance, leafStyle, leafHash, plantBlockId, buildingHeight, buildingWall, buildingBlockId, buildingEntrance, road };
  }

  private hasLeafAt(worldY: number, decoration: ColumnDecoration): boolean {
    const relative = worldY - decoration.treeBase;
    if (decoration.leafStyle === 1) {
      const distanceFromTop = decoration.treeHeight + 2 - relative;
      return relative >= decoration.treeHeight - 2 && relative <= decoration.treeHeight + 2
        && decoration.leafDistance <= Math.max(0, Math.ceil(distanceFromTop / 2));
    }
    if (decoration.leafStyle === 2) {
      return relative >= decoration.treeHeight - 2 && relative <= decoration.treeHeight + 2
        && decoration.leafDistance <= 2
        && (decoration.leafHash + worldY) % 5 !== 0;
    }
    const radius = relative === decoration.treeHeight + 2 ? 1 : relative === decoration.treeHeight - 2 ? 2 : 3;
    return relative >= decoration.treeHeight - 2 && relative <= decoration.treeHeight + 2 && decoration.leafDistance <= radius;
  }

  private isCave(globalX: number, worldY: number, globalZ: number, surfaceY: number): boolean {
    if (worldY >= surfaceY - 5) return false;
    return isNoiseIntersectionCave(this.seed, globalX, worldY, globalZ);
  }
}

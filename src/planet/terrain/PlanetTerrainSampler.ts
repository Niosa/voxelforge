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

export type NaturalTopography = 'plains' | 'hills' | 'mountains';

export interface NaturalSettlementSite {
  active: boolean;
  centerX: number;
  centerZ: number;
  radius: number;
  elevation: number;
}

interface ColumnDecoration {
  trunk: boolean;
  leaves: boolean;
  treeBase: number;
  treeHeight: number;
  treeTrunkBlockId: number;
  treeLeafBlockId: number;
  leafDistance: number;
  leafStyle: number;
  leafHash: number;
  plantBlockId: number;
  buildingHeight: number;
  buildingWall: boolean;
  buildingBlockId: number;
  roofBlockId: number;
  buildingEntrance: boolean;
  road: boolean;
  parkFeature: 'none' | 'bench' | 'fountain';
  streetLight: boolean;
  transitStop: boolean;
  businessSignBlockId: number;
}

interface TerrainColumn {
  globalX: number;
  globalZ: number;
  sample: PlanetSurfaceSample;
  decoration: ColumnDecoration;
}

const MAX_COLUMN_CACHE_SIZE = 16_384;
export const MAX_NATURAL_TERRAIN_Y = 95;

const LAND_TYPES = new Set(['continent', 'island', 'region', 'city', 'town']);
export const FOLIAGE_CELL_SIZE = 7;
export const NATURAL_POND_CELL_SIZE = 96;
export const NATURAL_SETTLEMENT_CELL_SIZE = 768;

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
  const enabled = biome === 'forest-canopy' ? selector % 7 === 0
    : biome === 'lush-grassland' ? selector % 11 === 0
    : biome === 'snowy-tundra' ? selector % 19 === 0
    : biome === 'coastal-beach' ? selector % 9 === 0
    : false;
  const centerX = cellX * NATURAL_POND_CELL_SIZE + 20 + hashCoordinates(seed, cellX, cellZ, 919) % 56;
  const centerZ = cellZ * NATURAL_POND_CELL_SIZE + 20 + hashCoordinates(seed, cellX, cellZ, 929) % 56;
  const radius = 8 + hashCoordinates(seed, cellX, cellZ, 937) % 15;
  return { water: enabled && Math.hypot(globalX - centerX, globalZ - centerZ) <= radius, centerX, centerZ, radius };
}

export function naturalTopographyAt(seed: number, globalX: number, globalZ: number): NaturalTopography {
  const province = valueNoise3D(seed + 4_091, globalX, 0, globalZ, 1_350);
  const ridgeProvince = Math.abs(valueNoise3D(seed + 7_133, globalX, 0, globalZ, 820));
  if (province > 0.38 && ridgeProvince > 0.2) return 'mountains';
  if (province > -0.12 || ridgeProvince > 0.62) return 'hills';
  return 'plains';
}

export function naturalSettlementAt(
  seed: number,
  globalX: number,
  globalZ: number,
  biome: BiomeType,
): NaturalSettlementSite {
  const cellX = Math.floor(globalX / NATURAL_SETTLEMENT_CELL_SIZE);
  const cellZ = Math.floor(globalZ / NATURAL_SETTLEMENT_CELL_SIZE);
  const selector = hashCoordinates(seed, cellX, cellZ, 1_301);
  const suitable = biome !== 'shallow-water' && biome !== 'volcanic-ash' && biome !== 'mountain-slate';
  const centerX = cellX * NATURAL_SETTLEMENT_CELL_SIZE + 180 + hashCoordinates(seed, cellX, cellZ, 1_303) % 408;
  const centerZ = cellZ * NATURAL_SETTLEMENT_CELL_SIZE + 180 + hashCoordinates(seed, cellX, cellZ, 1_307) % 408;
  const radius = 46 + hashCoordinates(seed, cellX, cellZ, 1_309) % 25;
  const elevation = 4 + hashCoordinates(seed, cellX, cellZ, 1_313) % 5;
  return {
    active: suitable && selector % 4 === 0 && Math.hypot(globalX - centerX, globalZ - centerZ) <= radius,
    centerX,
    centerZ,
    radius,
    elevation,
  };
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
  if (denseForest || biome === 'forest-canopy' || biome === 'elven-azure') return true;
  const selector = hashCoordinates(seed, cellX, cellZ, 131);
  if (biome === 'lush-grassland' || biome === 'satellite-blend') return selector % 5 === 0;
  if (biome === 'snowy-tundra') return selector % 6 === 0;
  if (biome === 'coastal-beach' || biome === 'desert-dunes') return selector % 11 === 0;
  return false;
}

export interface BiomeFoliageSpec {
  trunkBlockId: number;
  leafBlockId: number;
  heightOffset: number;
  canopyRadiusBonus: number;
}

export function getBiomeFoliageSpec(
  seed: number,
  sample: PlanetSurfaceSample,
  cellX: number,
  cellZ: number,
): BiomeFoliageSpec {
  const treeVariant = hashCoordinates(seed, cellX, cellZ, 149);
  const absLat = Math.abs(sample.lat);

  // 1. Desert / Arid (Sandy or coastal-beach)
  if (sample.biome === 'desert-dunes' || sample.biome === 'coastal-beach' || sample.surfaceBlockId === 4) {
    return {
      trunkBlockId: 76,
      leafBlockId: 77,
      heightOffset: 0,
      canopyRadiusBonus: 0,
    };
  }

  // 2. Frigid / Taiga / Alpine (High Latitudes lat > 52deg OR elevation > 35)
  if (absLat > 52 || sample.elevation > 35 || sample.biome === 'snowy-tundra' || sample.surfaceBlockId === 8) {
    return {
      trunkBlockId: 41,
      leafBlockId: 43,
      heightOffset: 1,
      canopyRadiusBonus: 0,
    };
  }

  // 3. Elven / Mythic (elven-azure)
  if (sample.biome === 'elven-azure') {
    const isCherry = treeVariant % 3 !== 0;
    return {
      trunkBlockId: isCherry ? 80 : 74,
      leafBlockId: isCherry ? 81 : 75,
      heightOffset: 1,
      canopyRadiusBonus: 1,
    };
  }

  // 4. Tropical / Rainforest (Equatorial | lat < 22deg or forest-canopy)
  if (absLat < 22 || sample.biome === 'forest-canopy') {
    const isJungle = treeVariant % 2 === 0;
    return {
      trunkBlockId: isJungle ? 78 : 76,
      leafBlockId: isJungle ? 79 : 77,
      heightOffset: 2,
      canopyRadiusBonus: 1,
    };
  }

  // 5. Temperate Forest / Lush Grassland / Satellite-Blend
  const species = treeVariant % 4;
  if (species === 0) {
    return { trunkBlockId: 74, leafBlockId: 75, heightOffset: 0, canopyRadiusBonus: 0 };
  }
  if (species === 1) {
    return { trunkBlockId: 80, leafBlockId: 81, heightOffset: 1, canopyRadiusBonus: 1 };
  }
  return { trunkBlockId: 5, leafBlockId: 6, heightOffset: 0, canopyRadiusBonus: 0 };
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

  if (entity?.tags?.includes('desert')) return 'desert-dunes';
  if (entity?.tags?.includes('snow')) return 'snowy-tundra';
  if (entity?.tags?.includes('mountain')) return 'mountain-slate';
  if (entity?.tags?.includes('forest')) return 'forest-canopy';

  switch (climate) {
    case 'frigid': return 'snowy-tundra';
    case 'arid': return 'desert-dunes';
    case 'tropical': return 'forest-canopy';
    default: return authoredBiome;
  }
}

function hasAuthoredTerrainStyle(entity: TerraEntity): boolean {
  return (entity.properties.biome !== undefined && entity.properties.biome !== 'satellite-blend')
    || entity.properties.climate !== undefined
    || entity.properties.topography !== undefined
    || entity.properties.water === true
    || entity.tags.includes('desert')
    || entity.tags.includes('forest')
    || entity.tags.includes('mountain')
    || entity.tags.includes('snow')
    || entity.tags.includes('city')
    || entity.tags.includes('town');
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
  private readonly polygons: Array<{
    entity: TerraEntity;
    minLon: number;
    minLat: number;
    maxLon: number;
    maxLat: number;
  }>;
  private readonly points: Array<{
    entity: TerraEntity;
    lon: number;
    lat: number;
    radius: number;
  }>;
  private readonly entitiesById: Record<string, TerraEntity>;
  private readonly cityLayouts = new Map<string, CityLayout>();
  private readonly columnCache = new Map<string, TerrainColumn>();
  private readonly settlementRoadCache = new Map<string, number | null>();

  constructor(entities: Record<string, TerraEntity>, private readonly seed = 0) {
    this.entitiesById = entities;
    const all = Object.values(entities);
    this.polygons = all
      .filter((entity) => entity.geometry.type !== 'Point')
      .sort((a, b) => entityArea(a) - entityArea(b))
      .map((entity) => {
        const polygons = entity.geometry.type === 'Polygon'
          ? [entity.geometry.coordinates]
          : entity.geometry.type === 'MultiPolygon' ? entity.geometry.coordinates : [];
        let minLon = 180, minLat = 90, maxLon = -180, maxLat = -90;
        for (const polygon of polygons) {
          for (const ring of polygon) {
            for (const coordinate of ring) {
              minLon = Math.min(minLon, coordinate[0]!);
              minLat = Math.min(minLat, coordinate[1]!);
              maxLon = Math.max(maxLon, coordinate[0]!);
              maxLat = Math.max(maxLat, coordinate[1]!);
            }
          }
        }
        if (maxLon - minLon > 180) { minLon = -180; maxLon = 180; }
        return { entity, minLon, minLat, maxLon, maxLat };
      });
    this.points = all
      .filter((entity) => entity.geometry.type === 'Point' && entity.properties.walkEntry !== true)
      .map((entity) => {
        const configured = Number(entity.properties.footprintRadiusM);
        return {
          entity,
          lon: entity.geometry.type === 'Point' ? entity.geometry.coordinates[0]! : 0,
          lat: entity.geometry.type === 'Point' ? entity.geometry.coordinates[1]! : 0,
          radius: Number.isFinite(configured) && configured > 0
            ? configured
            : entity.type === 'city' ? 240 : entity.type === 'town' ? 140 : 60,
        };
      });
    for (const entity of all) {
      if (entity.type === 'city' || entity.type === 'town') {
        this.cityLayouts.set(entity.id, createCityLayout(entity, seed));
      }
    }
  }

  sampleSurface(globalX: number, globalZ: number): PlanetSurfaceSample {
    const [lon, lat] = planetMetersToLonLat(globalX + 0.5, globalZ + 0.5);
    const containing: TerraEntity[] = [];
    for (const candidate of this.polygons) {
      if (lon < candidate.minLon || lon > candidate.maxLon
        || lat < candidate.minLat || lat > candidate.maxLat) continue;
      if (entityContains(candidate.entity, lon, lat)) containing.push(candidate.entity);
    }
    let feature = containing[0] ?? null;

    let nearbyPoint: TerraEntity | undefined;
    let nearbyPointDistance = Number.POSITIVE_INFINITY;
    const latScale = 111_320;
    const lonScale = latScale * Math.cos(lat * Math.PI / 180);
    for (const candidate of this.points) {
      if (Math.abs(candidate.lat - lat) * latScale > candidate.radius) continue;
      if (Math.abs(candidate.lon - lon) * lonScale > candidate.radius) continue;
      const distance = Math.hypot(
        (candidate.lon - lon) * lonScale,
        (candidate.lat - lat) * latScale,
      );
      if (distance <= candidate.radius && distance < nearbyPointDistance) {
        nearbyPoint = candidate.entity;
        nearbyPointDistance = distance;
      }
    }
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
    const authoredCity = land && (localSettlement !== undefined || biome === 'city-urban' || biome === 'town-village');
    const emergentSettlement = land && !authoredCity
      ? naturalSettlementAt(this.seed, globalX, globalZ, biome)
      : null;
    const isCity = authoredCity || emergentSettlement?.active === true;
    if (isCity) biome = localSettlement?.type === 'city' || (authoredCity && localSettlement?.type !== 'town')
      ? 'city-urban'
      : 'town-village';
    const isForest = land && !isCity && (
      biome === 'forest-canopy'
      || feature?.tags.includes('forest') === true
      || styleFeature?.tags.includes('forest') === true
    );
    const fields = sampleV7TerrainFields(this.seed, globalX, globalZ);
    const noiseA = fields.rolling * 0.5 + 0.5;
    const noiseB = valueNoise3D(this.seed + 539, globalX, 0, globalZ, 220) * 0.5 + 0.5;
    const generatedTopography = naturalTopographyAt(this.seed, globalX, globalZ);
    const authoredTopography = styleFeature?.properties.topography as NaturalTopography | 'valleys' | undefined;
    const effectiveTopography = authoredTopography ?? generatedTopography;
    const baseAmplitude = topographyAmplitude(styleFeature, biome);
    const amplitude = authoredTopography ? baseAmplitude
      : generatedTopography === 'mountains' ? Math.max(baseAmplitude, 23)
      : generatedTopography === 'hills' ? Math.max(baseAmplitude, 10)
      : Math.min(baseAmplitude, 3);
    const mountainous = biome === 'mountain-slate' || effectiveTopography === 'mountains';
    const isVolcanic = biome === 'volcanic-ash' || styleFeature?.tags.includes('volcano') === true;
    const mountainStrength = mountainous ? 2.15 : effectiveTopography === 'hills' ? 0.72 : 0.2;
    const relief = fields.rolling * amplitude * 0.72
      + fields.mountain * amplitude * mountainStrength
      - fields.ridge * amplitude * (mountainous ? 0.12 : 0.24);
    let elevation = land
      ? Math.max(1, Math.min(86, Math.floor(4 + relief)))
      : -4 - Math.floor(noiseA * 3);
    const naturalWater = land && !isCity && naturalPondAt(this.seed, globalX, globalZ, biome).water;
    if (naturalWater) elevation = Math.min(elevation, 1);
    let surfaceBlockId = surfaceMaterial(biome);
    if (mountainous || isVolcanic) {
      const snowLine = 24 + Math.floor(noiseB * 8);
      if (elevation >= snowLine) {
        surfaceBlockId = 8;
      } else if (isVolcanic || biome === 'volcanic-ash') {
        surfaceBlockId = 38;
      } else if (biome === 'mountain-slate') {
        surfaceBlockId = 13;
      } else {
        surfaceBlockId = 38;
      }
    }
    if (biome === 'snowy-tundra') {
      const variableMountainSnow = effectiveTopography === 'mountains'
        || styleFeature?.properties.biome === 'mountain-slate';
      if (variableMountainSnow) {
        const snowLine = 3 + Math.floor(noiseB * 7);
        surfaceBlockId = elevation >= snowLine || noiseA > 0.72 ? 8 : elevation > 6 ? 13 : 38;
      } else {
        surfaceBlockId = 8;
      }
    }

    return {
      lon,
      lat,
      elevation: authoredCity ? 4 : emergentSettlement?.active ? emergentSettlement.elevation : elevation,
      waterLevel: naturalWater ? 3 : land ? null : 0,
      frozenWater,
      biome,
      surfaceBlockId,
      isForest,
      isCity,
      featureId: feature?.id ?? null,
    };
  }

  fastElevationRange(globalX: number, globalZ: number, size = 32): readonly [number, number] {
    const s1 = this.sampleSurface(globalX, globalZ);
    const s2 = this.sampleSurface(globalX + size - 1, globalZ);
    const s3 = this.sampleSurface(globalX, globalZ + size - 1);
    const s4 = this.sampleSurface(globalX + size - 1, globalZ + size - 1);
    const s5 = this.sampleSurface(globalX + 16, globalZ + 16);

    const minE = Math.min(s1.elevation, s2.elevation, s3.elevation, s4.elevation, s5.elevation) - 6;
    const maxE = Math.max(s1.elevation, s2.elevation, s3.elevation, s4.elevation, s5.elevation) + 24;
    return [minE, maxE];
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

  /** Lightweight navigation query that avoids compiling a decorated voxel
   * column for every A* neighbor. Player-authored obstacles are checked by the
   * runtime immediately before an NPC step instead. */
  settlementRoadElevationAt(globalX: number, globalZ: number): number | null {
    const key = `${globalX},${globalZ}`;
    if (this.settlementRoadCache.has(key)) return this.settlementRoadCache.get(key) ?? null;
    const sample = this.sampleSurface(globalX, globalZ);
    let elevation: number | null = null;
    if (sample.isCity && sample.featureId) {
      const feature = this.entitiesById[sample.featureId];
      const layout = this.cityLayouts.get(sample.featureId)
        ?? ((feature?.type === 'city' || feature?.type === 'town') ? createCityLayout(feature, this.seed) : undefined);
      if (layout && cityColumnLayout(layout, globalX, globalZ).road) elevation = sample.elevation;
    }
    this.settlementRoadCache.set(key, elevation);
    if (this.settlementRoadCache.size > MAX_COLUMN_CACHE_SIZE) {
      const oldest = this.settlementRoadCache.keys().next().value as string | undefined;
      if (oldest !== undefined) this.settlementRoadCache.delete(oldest);
    }
    return elevation;
  }

  private blockFromColumn(worldY: number, column: TerrainColumn): number {
    const { sample, decoration } = column;
    if (decoration.buildingHeight > 0 && worldY > sample.elevation && worldY <= sample.elevation + decoration.buildingHeight) {
      const roof = worldY === sample.elevation + decoration.buildingHeight;
      if (roof) return decoration.roofBlockId;
      if (!decoration.buildingWall) return 0;
      const facadeLevel = worldY - sample.elevation;
      if (decoration.buildingEntrance && facadeLevel <= 2) return facadeLevel === 1 ? 23 : 46;
      if (decoration.businessSignBlockId > 0 && facadeLevel === 3) return decoration.businessSignBlockId;
      return facadeLevel > 1 && facadeLevel % 3 === 0 ? 10 : decoration.buildingBlockId;
    }
    const featureLevel = worldY - sample.elevation;
    if (decoration.transitStop) {
      if (featureLevel === 1 || featureLevel === 2) return 13;
      if (featureLevel === 3) return 19;
    }
    if (decoration.streetLight) {
      if (featureLevel >= 1 && featureLevel <= 3) return 13;
      if (featureLevel === 4) return 21;
    }
    if (decoration.parkFeature === 'fountain') {
      if (featureLevel === 1) return 12;
      if (featureLevel === 2) return 7;
    } else if (decoration.parkFeature === 'bench' && featureLevel === 1) {
      return 42;
    }
    if (decoration.trunk && worldY > decoration.treeBase && worldY <= decoration.treeBase + decoration.treeHeight) return decoration.treeTrunkBlockId;
    if (decoration.leaves && this.hasLeafAt(worldY, decoration)) return decoration.treeLeafBlockId;
    if (decoration.plantBlockId > 0 && worldY === sample.elevation + 1) return decoration.plantBlockId;
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
      const isArid = sample.biome === 'desert-dunes' || sample.biome === 'coastal-beach' || sample.surfaceBlockId === 4;
      if (isArid) return surfaceVariant % 9 === 0 ? 36 : 4;
      const isVolcanic = sample.biome === 'volcanic-ash' || sample.biome === 'mountain-slate' || sample.surfaceBlockId === 38 || sample.surfaceBlockId === 13;
      if (isVolcanic) {
        return surfaceVariant % 5 === 0 ? 39 : surfaceVariant % 7 === 0 ? 40 : surfaceVariant % 3 === 0 ? 13 : 38;
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
      || sample.biome === 'forest-canopy'
      || sample.biome === 'snowy-tundra'
      || sample.biome === 'coastal-beach'
      || sample.biome === 'desert-dunes'
      || sample.biome === 'elven-azure'
      || sample.biome === 'satellite-blend';

    let treeTrunkBlockId = 5;
    let treeLeafBlockId = 6;

    if (supportsFoliage) {
      for (let cz = cellZ - 1; cz <= cellZ + 1; cz++) {
        for (let cx = cellX - 1; cx <= cellX + 1; cx++) {
          if (!foliageCellHasTree(this.seed, sample.biome, sample.isForest, cx, cz)) continue;
          const [treeX, treeZ] = foliageTreePosition(this.seed, cx, cz);
          const dx = Math.abs(globalX - treeX);
          const dz = Math.abs(globalZ - treeZ);
          const spec = getBiomeFoliageSpec(this.seed, sample, cx, cz);
          const treeVariant = hashCoordinates(this.seed, cx, cz, 149);
          const candidateHeight = 4 + spec.heightOffset + (treeVariant % 4);
          const candidateStyle = treeVariant % 3;
          const canopyRadius = spec.canopyRadiusBonus + (candidateStyle === 1 ? 2 : 2 + (treeVariant % 2));
          if (dx === 0 && dz === 0) trunk = true;
          if (dx <= canopyRadius && dz <= canopyRadius) {
            leaves = true;
            treeHeight = candidateHeight;
            treeTrunkBlockId = spec.trunkBlockId;
            treeLeafBlockId = spec.leafBlockId;
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
    let roofBlockId = 13;
    let buildingEntrance = false;
    let road = false;
    let park = false;
    let parkFeature: ColumnDecoration['parkFeature'] = 'none';
    let streetLight = false;
    let transitStop = false;
    let businessSignBlockId = 0;
    if (sample.isCity) {
      const feature = sample.featureId ? this.entitiesById[sample.featureId] : undefined;
      const layout = sample.featureId ? this.cityLayouts.get(sample.featureId) : undefined;
      if (layout) {
        const column = cityColumnLayout(layout, globalX, globalZ);
        road = column.road;
        park = column.park;
        buildingHeight = column.buildingHeight;
        buildingWall = column.buildingWall;
        buildingBlockId = column.buildingBlockId;
        roofBlockId = column.roofBlockId;
        buildingEntrance = column.buildingEntrance;
        parkFeature = column.parkFeature;
        streetLight = column.streetLight;
        transitStop = column.transitStop;
        businessSignBlockId = column.businessSignBlockId;
        if (column.parkTreeDistance <= 2) {
          trunk = column.parkTree;
          leaves = true;
          treeHeight = 5 + column.parcelSeed % 2;
          leafDistance = column.parkTreeDistance;
          leafStyle = column.parcelSeed % 3;
          leafHash = hashCoordinates(this.seed, globalX, globalZ, column.parcelSeed);
        }
      } else if (feature?.type === 'city' || feature?.type === 'town') {
        const fallbackLayout = createCityLayout(feature, this.seed);
        const column = cityColumnLayout(fallbackLayout, globalX, globalZ);
        road = column.road;
        park = column.park;
        buildingHeight = column.buildingHeight;
        buildingWall = column.buildingWall;
        buildingBlockId = column.buildingBlockId;
        roofBlockId = column.roofBlockId;
        buildingEntrance = column.buildingEntrance;
        parkFeature = column.parkFeature;
        streetLight = column.streetLight;
        transitStop = column.transitStop;
        businessSignBlockId = column.businessSignBlockId;
        if (column.parkTreeDistance <= 2) {
          trunk = column.parkTree;
          leaves = true;
          treeHeight = 5 + column.parcelSeed % 2;
          leafDistance = column.parkTreeDistance;
          leafStyle = column.parcelSeed % 3;
          leafHash = hashCoordinates(this.seed, globalX, globalZ, column.parcelSeed);
        }
      } else {
        const site = naturalSettlementAt(this.seed, globalX, globalZ, sample.biome);
        if (site.active) {
          const dx = Math.floor(globalX - site.centerX);
          const dz = Math.floor(globalZ - site.centerZ);
          const distance = Math.hypot(dx, dz);
          const positiveModulo = (value: number, divisor: number) => ((value % divisor) + divisor) % divisor;
          const parcelX = Math.floor((dx + site.radius) / 12);
          const parcelZ = Math.floor((dz + site.radius) / 12);
          const localX = positiveModulo(dx + site.radius, 12);
          const localZ = positiveModulo(dz + site.radius, 12);
          const parcelSeed = hashCoordinates(this.seed, parcelX + Math.floor(site.centerX / 12), parcelZ + Math.floor(site.centerZ / 12), 1_401);
          road = Math.abs(dx) <= 1 || Math.abs(dz) <= 1;
          park = !road && distance < site.radius - 4 && parcelSeed % 6 === 0;
          const occupied = !road && !park && distance < site.radius - 5 && parcelSeed % 5 !== 0;
          const insideHouse = occupied && localX >= 2 && localX <= 9 && localZ >= 2 && localZ <= 9;
          if (insideHouse) {
            buildingHeight = 4 + parcelSeed % 3;
            buildingWall = localX === 2 || localX === 9 || localZ === 2 || localZ === 9;
            buildingEntrance = localZ === 2 && (localX === 5 || localX === 6);
            buildingBlockId = parcelSeed % 3 === 0 ? 28 : 42;
            roofBlockId = parcelSeed % 4 === 0 ? 22 : parcelSeed % 3 === 0 ? 28 : 42;
            businessSignBlockId = parcelSeed % 7 === 0 ? 14 : 0;
          }
          if (park) {
            parkFeature = parcelSeed % 3 === 0 && localX === 6 && localZ === 6 ? 'fountain' : 'none';
            if (localX === 4 && localZ === 4) {
              trunk = true;
              leaves = true;
              treeHeight = 5 + parcelSeed % 2;
              leafDistance = 0;
              leafStyle = parcelSeed % 3;
              leafHash = parcelSeed;
            }
          }
          streetLight = road && distance < site.radius - 3
            && (Math.abs(dx) <= 1 ? positiveModulo(dz, 12) === 0 : positiveModulo(dx, 12) === 0);
          transitStop = Math.abs(dx) <= 1 && Math.abs(dz - 5) <= 1;
        }
      }
    }
    if (sample.biome === 'town-village' && buildingBlockId === 11) buildingBlockId = 42;

    const plantSelector = hashCoordinates(this.seed, globalX, globalZ, 577);
    let plantBlockId = 0;

    const supportsPlants = sample.waterLevel === null && !trunk && !road && (
      (!sample.isCity && (
        sample.biome === 'lush-grassland' ||
        sample.biome === 'forest-canopy' ||
        sample.biome === 'snowy-tundra' ||
        sample.biome === 'desert-dunes' ||
        sample.biome === 'coastal-beach' ||
        sample.biome === 'volcanic-ash' ||
        sample.biome === 'mountain-slate' ||
        sample.biome === 'elven-azure' ||
        sample.biome === 'satellite-blend'
      )) ||
      (sample.isCity && park && parkFeature === 'none')
    );

    if (supportsPlants) {
      const absLat = Math.abs(sample.lat);
      const isTropical = absLat < 22 || sample.biome === 'forest-canopy';
      const isArid = sample.biome === 'desert-dunes' || sample.biome === 'coastal-beach' || sample.surfaceBlockId === 4;
      const isSnowy = absLat > 52 || sample.elevation > 35 || sample.biome === 'snowy-tundra' || sample.surfaceBlockId === 8;
      const isRocky = sample.biome === 'volcanic-ash' || sample.biome === 'mountain-slate' || sample.surfaceBlockId === 13 || sample.surfaceBlockId === 38;
      const isElven = sample.biome === 'elven-azure';

      if (isArid) {
        // Strict arid rules: No green grass, no garden flowers
        if (plantSelector % 37 === 0) plantBlockId = 69;      // Cactus
        else if (plantSelector % 19 === 0) plantBlockId = 71; // Dead Bush
        else if (plantSelector % 29 === 0) plantBlockId = 70; // Reeds near water
      } else if (isRocky) {
        // Strict volcanic/rocky rules: No green grass or flowers
        if (plantSelector % 23 === 0) plantBlockId = 71;      // Dead Bush
        else if (plantSelector % 37 === 0) plantBlockId = 67; // Brown Mushroom
        else if (plantSelector % 43 === 0) plantBlockId = 66; // Red Mushroom
      } else if (isSnowy) {
        // Strict alpine/tundra rules: Ferns and rare arctic flowers/mushrooms, no green grass
        if (plantSelector % 23 === 0) plantBlockId = 68;      // Fern
        else if (plantSelector % 43 === 0) plantBlockId = 64; // Blue Orchid
        else if (plantSelector % 37 === 0) plantBlockId = 66; // Red Mushroom
      } else if (isTropical) {
        if (plantSelector % 13 === 0) plantBlockId = 68;      // Fern
        else if (plantSelector % 17 === 0) plantBlockId = 70; // Bamboo / Reeds
        else if (plantSelector % 31 === 0) plantBlockId = 64; // Rare Blue Orchid
        else if (plantSelector % 37 === 0) plantBlockId = 66; // Red Mushroom
        else if (plantSelector % 6 === 0) plantBlockId = 25;  // Jungle Tall Grass
      } else if (isElven) {
        if (plantSelector % 29 === 0) plantBlockId = 64;       // Blue Orchid
        else if (plantSelector % 31 === 0) plantBlockId = 65; // Allium
        else if (plantSelector % 37 === 0) plantBlockId = 73; // Sunflower
        else if (plantSelector % 5 === 0) plantBlockId = 25;  // Tall Grass
      } else {
        // Temperate Grassland / Forest / Default Land:
        // Flowers are rare natural accents (~1 in 41 blocks), Tall Grass is primary (~1 in 6 blocks)
        if (plantSelector % 41 === 0) {
          const flowerType = plantSelector % 6;
          if (flowerType === 0) plantBlockId = 26;            // Red Poppy / Rose
          else if (flowerType === 1) plantBlockId = 63;       // Yellow Dandelion
          else if (flowerType === 2) plantBlockId = 65;       // White Allium
          else if (flowerType === 3) plantBlockId = 73;       // Sunflower
          else if (flowerType === 4) plantBlockId = 68;       // Fern
          else plantBlockId = 66;                             // Red Mushroom
        } else if (plantSelector % 6 === 0) {
          plantBlockId = 25;                                  // Tall Grass
        }
      }
    } else if (sample.waterLevel !== null && sample.elevation < sample.waterLevel) {
      if (plantSelector % 11 === 0) plantBlockId = 72;        // Seagrass
    }

    return {
      trunk, leaves, treeBase: sample.elevation, treeHeight, treeTrunkBlockId, treeLeafBlockId,
      leafDistance, leafStyle, leafHash, plantBlockId, buildingHeight, buildingWall, buildingBlockId,
      roofBlockId, buildingEntrance, road, parkFeature, streetLight, transitStop, businessSignBlockId,
    };
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
    if (isNoiseIntersectionCave(this.seed, globalX, worldY, globalZ)) return true;
    const tunnelA = Math.abs(valueNoise3D(this.seed + 8_111, globalX, worldY, globalZ, 24));
    const tunnelB = Math.abs(valueNoise3D(this.seed + 8_123, globalX, worldY, globalZ, 31));
    if (tunnelA < 0.105 && tunnelB < 0.13) return true;
    const depth = surfaceY - worldY;
    const cavern = valueNoise3D(this.seed + 8_141, globalX, worldY, globalZ, 42);
    return depth > 13 && cavern > 0.68;
  }
}

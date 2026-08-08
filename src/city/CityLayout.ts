import type { TerraEntity } from '@/entities/types';
import type { SettlementBuildingUse } from '@/entities/types';
import { geometryCentroid } from '@/geo/centroid';
import { lonLatToPlanetMeters, planetMetersToLonLat } from '@/planet/spatial/PlanetGrid';

export interface CityLayout {
  settlementId: string;
  settlementType: 'city' | 'town';
  seed: number;
  centerX: number;
  centerZ: number;
  gridSize: number;
  roadWidth: number;
  offsetX: number;
  offsetZ: number;
  diagonalPeriod: number;
  diagonalOffset: number;
  footprintRadius: number;
  coreRadius: number;
  density: number;
}

export interface CityColumnLayout {
  road: boolean;
  park: boolean;
  buildingHeight: number;
  buildingWall: boolean;
  buildingBlockId: number;
  roofBlockId: number;
  lotWidth: number;
  lotDepth: number;
  district: 'core' | 'commercial' | 'residential' | 'park';
  parcelSeed: number;
  buildingUse: SettlementBuildingUse;
  buildingEntrance: boolean;
  parkTree: boolean;
  parkTreeDistance: number;
  parkFeature: 'none' | 'bench' | 'fountain';
  streetLight: boolean;
  transitStop: boolean;
  businessSignBlockId: number;
}

export interface CityLotPlan extends CityColumnLayout {
  x: number;
  z: number;
  lon: number;
  lat: number;
  distance: number;
}

export interface CityRoadSegment {
  startLon: number;
  startLat: number;
  endLon: number;
  endLat: number;
  width: number;
}

function hashString(value: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function hashCell(seed: number, x: number, z: number): number {
  let hash = seed ^ Math.imul(x, 73_856_093) ^ Math.imul(z, 19_349_663);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 1_274_126_177);
  return (hash ^ hash >>> 16) >>> 0;
}

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
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

function settlementContains(entity: TerraEntity, x: number, z: number): boolean {
  const [lon, lat] = planetMetersToLonLat(x, z);
  if (entity.geometry.type === 'Point') {
    const [centerLon, centerLat] = entity.geometry.coordinates;
    const [centerX, centerZ] = lonLatToPlanetMeters(centerLon!, centerLat!);
    const configured = Number(entity.properties.footprintRadiusM);
    const radius = Number.isFinite(configured) && configured > 0
      ? configured
      : entity.type === 'town' ? 140 : 240;
    return Math.hypot(x - centerX, z - centerZ) <= radius;
  }
  const polygons = entity.geometry.type === 'Polygon'
    ? [entity.geometry.coordinates]
    : entity.geometry.coordinates;
  return polygons.some((polygon) => {
    const outer = polygon[0] as number[][] | undefined;
    if (!outer || !pointInRing(lon, lat, outer)) return false;
    return !polygon.slice(1).some((hole) => pointInRing(lon, lat, hole as number[][]));
  });
}

function settlementFootprintRadius(entity: TerraEntity, centerX: number, centerZ: number): number {
  if (entity.geometry.type === 'Point') {
    const configured = Number(entity.properties.footprintRadiusM);
    return Number.isFinite(configured) && configured > 0
      ? configured
      : entity.type === 'town' ? 140 : 240;
  }
  const polygons = entity.geometry.type === 'Polygon'
    ? [entity.geometry.coordinates]
    : entity.geometry.coordinates;
  let radius = 0;
  for (const polygon of polygons) {
    for (const coordinate of polygon[0] ?? []) {
      const [x, z] = lonLatToPlanetMeters(coordinate[0]!, coordinate[1]!);
      radius = Math.max(radius, Math.hypot(x - centerX, z - centerZ));
    }
  }
  return Math.max(40, radius);
}

export function createCityLayout(entity: TerraEntity, worldSeed = 0): CityLayout {
  const idSeed = hashString(entity.id) ^ worldSeed;
  const [lon, lat] = geometryCentroid(entity.geometry);
  const [centerX, centerZ] = lonLatToPlanetMeters(lon, lat);
  const footprintRadius = settlementFootprintRadius(entity, centerX, centerZ);
  const population = Math.max(0, Number(entity.properties.population) || 0);
  const sizeDensity = Math.min(1, footprintRadius / (entity.type === 'town' ? 320 : 700));
  const populationDensity = Math.min(1, population / (entity.type === 'town' ? 12_000 : 120_000));
  const computedDensity = Math.max(entity.type === 'town' ? 0.18 : 0.22, sizeDensity * 0.65 + populationDensity * 0.35);
  const authoredDensity = Number(entity.properties.density);
  const density = Number.isFinite(authoredDensity)
    ? Math.max(0.1, Math.min(1, authoredDensity))
    : computedDensity;
  const coreRadius = entity.type === 'city' && footprintRadius >= 220
    ? Math.min(170, footprintRadius * (0.12 + density * 0.12))
    : 0;
  const gridSize = entity.type === 'town' ? 17 + idSeed % 4 : 18 + idSeed % 7;
  return {
    settlementId: entity.id,
    settlementType: entity.type === 'town' ? 'town' : 'city',
    seed: idSeed,
    centerX,
    centerZ,
    gridSize,
    roadWidth: entity.type === 'town' ? 2 : 2 + (idSeed >>> 4) % 2,
    offsetX: (idSeed >>> 7) % gridSize,
    offsetZ: (idSeed >>> 12) % gridSize,
    diagonalPeriod: entity.type === 'town' ? 0 : 43 + (idSeed >>> 17) % 17,
    diagonalOffset: (idSeed >>> 22) % 43,
    footprintRadius,
    coreRadius,
    density,
  };
}

export function cityDiagonalRoadAt(layout: CityLayout, x: number, z: number): boolean {
  if (layout.diagonalPeriod <= 0) return false;
  const value = positiveModulo(x + z + layout.diagonalOffset, layout.diagonalPeriod);
  return value < 2 || value > layout.diagonalPeriod - 2;
}

function diagonalCrossesRange(layout: CityLayout, minimumSum: number, maximumSum: number, clearance = 2): boolean {
  if (layout.diagonalPeriod <= 0) return false;
  const low = minimumSum + layout.diagonalOffset - clearance;
  const high = maximumSum + layout.diagonalOffset + clearance;
  return Math.ceil(low / layout.diagonalPeriod) <= Math.floor(high / layout.diagonalPeriod);
}

export function cityParcelReservedForDiagonal(layout: CityLayout, cellX: number, cellZ: number): boolean {
  const parcelSeed = hashCell(layout.seed, cellX, cellZ);
  const insetX = layout.roadWidth + 2 + parcelSeed % 2;
  const insetZ = layout.roadWidth + 2 + (parcelSeed >>> 3) % 2;
  const maxX = layout.gridSize - 2 - (parcelSeed >>> 6) % 2;
  const maxZ = layout.gridSize - 2 - (parcelSeed >>> 9) % 2;
  const parcelOriginX = cellX * layout.gridSize - layout.offsetX;
  const parcelOriginZ = cellZ * layout.gridSize - layout.offsetZ;
  return diagonalCrossesRange(
    layout,
    parcelOriginX + insetX + parcelOriginZ + insetZ,
    parcelOriginX + maxX + parcelOriginZ + maxZ,
  );
}

export function cityColumnLayout(layout: CityLayout, x: number, z: number): CityColumnLayout {
  const shiftedX = x + layout.offsetX;
  const shiftedZ = z + layout.offsetZ;
  const localX = positiveModulo(shiftedX, layout.gridSize);
  const localZ = positiveModulo(shiftedZ, layout.gridSize);
  const cellX = Math.floor(shiftedX / layout.gridSize);
  const cellZ = Math.floor(shiftedZ / layout.gridSize);
  const parcelSeed = hashCell(layout.seed, cellX, cellZ);
  const primaryRoad = localX < layout.roadWidth || localZ < layout.roadWidth;
  const diagonalRoad = cityDiagonalRoadAt(layout, x, z);
  const road = primaryRoad || diagonalRoad;
  const insetX = layout.roadWidth + 2 + parcelSeed % 2;
  const insetZ = layout.roadWidth + 2 + (parcelSeed >>> 3) % 2;
  const maxX = layout.gridSize - 2 - (parcelSeed >>> 6) % 2;
  const maxZ = layout.gridSize - 2 - (parcelSeed >>> 9) % 2;
  const diagonalReservedLot = cityParcelReservedForDiagonal(layout, cellX, cellZ);
  const park = !road && (diagonalReservedLot || parcelSeed % (layout.settlementType === 'town' ? 7 : 11) === 0);
  const decoratedPark = park && !diagonalReservedLot;
  const inBuilding = !road && !park && localX >= insetX && localX <= maxX && localZ >= insetZ && localZ <= maxZ;
  const distance = Math.hypot(x - layout.centerX, z - layout.centerZ);
  const core = layout.coreRadius > 0 && distance < layout.coreRadius;
  const commercialChance = layout.density > 0.7 ? 3 : layout.density > 0.4 ? 5 : 8;
  const commercial = !core && layout.settlementType === 'city' && (parcelSeed >>> 12) % commercialChance === 0;
  const district = park ? 'park' : core ? 'core' : commercial ? 'commercial' : 'residential';
  const buildingUse: SettlementBuildingUse = layout.settlementType === 'town'
    ? parcelSeed % 9 === 0 ? 'inn' : parcelSeed % 5 === 0 ? 'workshop' : parcelSeed % 7 === 0 ? 'farm' : 'home'
    : district === 'core' ? (parcelSeed % 5 === 0 ? 'civic' : 'office')
    : district === 'commercial' ? (parcelSeed % 4 === 0 ? 'inn' : 'shop')
    : 'home';
  const baseHeight = layout.settlementType === 'town' ? 3 : core ? 7 + Math.round(layout.density * 4) : commercial ? 5 : 3;
  const variation = layout.settlementType === 'town' ? 4 : core ? 7 + Math.round(layout.density * 7) : commercial ? 6 : 5;
  const buildingHeight = inBuilding ? baseHeight + (parcelSeed >>> 15) % variation : 0;
  const roadVerge = !road && !inBuilding && !park && (
    (localX === layout.roadWidth && localZ >= layout.roadWidth + 2)
    || (localZ === layout.roadWidth && localX >= layout.roadWidth + 2)
  );
  const streetLight = roadVerge
    && (localX + localZ + (parcelSeed >>> 5)) % (layout.settlementType === 'town' ? 9 : 7) === 0;
  const transitStop = layout.settlementType === 'city'
    && roadVerge
    && parcelSeed % 13 === 0
    && (localX === Math.floor(layout.gridSize / 2) || localZ === Math.floor(layout.gridSize / 2));
  const parkQuarter = Math.max(layout.roadWidth + 3, Math.floor(layout.gridSize / 3));
  const parkThreeQuarter = Math.min(layout.gridSize - 3, Math.floor(layout.gridSize * 2 / 3));
  const parkTreeDistance = decoratedPark ? Math.min(
    Math.max(Math.abs(localX - parkQuarter), Math.abs(localZ - parkQuarter)),
    Math.max(Math.abs(localX - parkThreeQuarter), Math.abs(localZ - parkThreeQuarter)),
  ) : Number.POSITIVE_INFINITY;
  const parkTree = parkTreeDistance === 0;
  const parkCenter = decoratedPark
    && localX === Math.floor(layout.gridSize / 2)
    && localZ === Math.floor(layout.gridSize / 2);
  const parkFeature = !parkCenter ? 'none'
    : parcelSeed % 3 === 0 ? 'fountain'
    : 'bench';
  const buildingEntrance = inBuilding && localZ === insetZ && localX === Math.floor((insetX + maxX) / 2);
  const businessSignBlockId = !buildingEntrance ? 0
    : buildingUse === 'shop' ? 14
    : buildingUse === 'inn' ? 17
    : buildingUse === 'workshop' ? 18
    : buildingUse === 'office' ? 19
    : buildingUse === 'civic' ? 12
    : 0;
  const materialPalette = layout.settlementType === 'town'
    ? [5, 42, 11, 28]
    : district === 'core'
      ? [12, 13, 11, 37]
      : district === 'commercial'
        ? [11, 12, 27, 37]
        : [11, 42, 28, 37];
  const buildingBlockId = materialPalette[(parcelSeed >>> 8) % materialPalette.length]!;
  const roofPalette = layout.settlementType === 'town'
    ? [22, 28, 42]
    : district === 'core'
      ? [13, 12, 37]
      : district === 'commercial'
        ? [13, 27, 37]
        : [22, 13, 42];
  const roofBlockId = roofPalette[(parcelSeed >>> 11) % roofPalette.length]!;

  return {
    road,
    park,
    buildingHeight,
    buildingWall: inBuilding && (localX === insetX || localX === maxX || localZ === insetZ || localZ === maxZ),
    buildingBlockId,
    roofBlockId,
    lotWidth: Math.max(1, maxX - insetX + 1),
    lotDepth: Math.max(1, maxZ - insetZ + 1),
    district,
    parcelSeed,
    buildingUse,
    buildingEntrance,
    parkTree,
    parkTreeDistance,
    parkFeature,
    streetLight: streetLight && !transitStop,
    transitStop,
    businessSignBlockId,
  };
}

export function planCityLots(entity: TerraEntity, worldSeed = 0, limit = 48, fullCoverage = false): CityLotPlan[] {
  const layout = createCityLayout(entity, worldSeed);
  const centerCellX = Math.floor((layout.centerX + layout.offsetX) / layout.gridSize);
  const centerCellZ = Math.floor((layout.centerZ + layout.offsetZ) / layout.gridSize);
  const lots: CityLotPlan[] = [];
  const defaultRadius = Math.max(5, Math.ceil(Math.sqrt(limit) * 2.5));
  const scanRadius = fullCoverage
    ? Math.min(80, Math.max(defaultRadius, Math.ceil(layout.footprintRadius / layout.gridSize)))
    : defaultRadius;
  for (let dz = -scanRadius; dz <= scanRadius; dz++) {
    for (let dx = -scanRadius; dx <= scanRadius; dx++) {
      const cellX = centerCellX + dx;
      const cellZ = centerCellZ + dz;
      const x = cellX * layout.gridSize - layout.offsetX + Math.floor(layout.gridSize / 2);
      const z = cellZ * layout.gridSize - layout.offsetZ + Math.floor(layout.gridSize / 2);
      if (!settlementContains(entity, x, z)) continue;
      const column = cityColumnLayout(layout, x, z);
      if (column.buildingHeight === 0) continue;
      const [lon, lat] = planetMetersToLonLat(x + 0.5, z + 0.5);
      lots.push({ ...column, x, z, lon, lat, distance: Math.hypot(x - layout.centerX, z - layout.centerZ) });
    }
  }
  const sorted = lots.sort((a, b) => a.distance - b.distance || a.parcelSeed - b.parcelSeed);
  if (!fullCoverage || sorted.length <= limit) return sorted.slice(0, limit);
  return Array.from({ length: limit }, (_, index) => sorted[Math.round(index * (sorted.length - 1) / Math.max(1, limit - 1))]!);
}

export function planCityRoadSegments(entity: TerraEntity, worldSeed = 0, lotLimit = 32): CityRoadSegment[] {
  const layout = createCityLayout(entity, worldSeed);
  const lots = planCityLots(entity, worldSeed, lotLimit);
  const segments = new Map<string, CityRoadSegment>();
  for (const lot of lots) {
    const cellX = Math.floor((lot.x + layout.offsetX) / layout.gridSize);
    const cellZ = Math.floor((lot.z + layout.offsetZ) / layout.gridSize);
    const minX = cellX * layout.gridSize - layout.offsetX;
    const minZ = cellZ * layout.gridSize - layout.offsetZ;
    const maxX = minX + layout.gridSize;
    const maxZ = minZ + layout.gridSize;
    const candidates: Array<[string, number, number, number, number]> = [
      [`v:${cellX}:${cellZ}`, minX + layout.roadWidth / 2, minZ, minX + layout.roadWidth / 2, maxZ],
      [`v:${cellX + 1}:${cellZ}`, maxX + layout.roadWidth / 2, minZ, maxX + layout.roadWidth / 2, maxZ],
      [`h:${cellX}:${cellZ}`, minX, minZ + layout.roadWidth / 2, maxX, minZ + layout.roadWidth / 2],
      [`h:${cellX}:${cellZ + 1}`, minX, maxZ + layout.roadWidth / 2, maxX, maxZ + layout.roadWidth / 2],
    ];
    for (const [key, x1, z1, x2, z2] of candidates) {
      if (segments.has(key) || !settlementContains(entity, (x1 + x2) / 2, (z1 + z2) / 2)) continue;
      const [startLon, startLat] = planetMetersToLonLat(x1, z1);
      const [endLon, endLat] = planetMetersToLonLat(x2, z2);
      segments.set(key, { startLon, startLat, endLon, endLat, width: layout.roadWidth });
    }
  }
  return [...segments.values()];
}

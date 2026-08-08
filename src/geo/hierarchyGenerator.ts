import { createEntity } from '@/entities/factory';
import type { TerraEntity } from '@/entities/types';
import type { BiomeType } from '@/geo/biomeTexture';
import type { SettlementDensity, TerrainClimate, TerrainTopography } from '@/state/uiStore';

export type GenerationRoot = 'continent' | 'region' | 'city' | 'town';

export interface HierarchyGenerationConfig {
  rootType: GenerationRoot;
  name: string;
  centerLon: number;
  centerLat: number;
  radiusKm: number;
  biome: BiomeType;
  climate: TerrainClimate;
  topography: TerrainTopography;
  density: SettlementDensity;
  includeDescendants: boolean;
  seed?: number;
}

const REGION_NAMES = ['Northreach', 'Greenvale', 'High March', 'Riverlands', 'Sun Coast', 'Frostmere'];
const CITY_NAMES = ['Stonehaven', 'Alderwatch', 'Brightwater', 'Ironford', 'Westgate', 'Silverkeep'];
const TOWN_NAMES = ['Millbrook', 'Oakstead', 'Redfield', 'Pinecross', 'Willowby', 'Eastmere'];
const LANDMARK_NAMES = ['Old Beacon', 'Ancient Ruins', 'Crown Peak', 'Moonwell', 'Standing Stones', 'Watchers Gate'];

function seeded(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state = Math.imul(state ^ state >>> 15, 1 | state);
    state ^= state + Math.imul(state ^ state >>> 7, 61 | state);
    return ((state ^ state >>> 14) >>> 0) / 4_294_967_296;
  };
}

function blob(lon: number, lat: number, radiusKm: number, random: () => number, points = 24): [number, number][] {
  const latRadius = radiusKm / 111.32;
  const lonRadius = latRadius / Math.max(0.25, Math.cos(lat * Math.PI / 180));
  const ring: [number, number][] = [];
  for (let index = 0; index < points; index++) {
    const angle = index / points * Math.PI * 2;
    const variation = 0.78 + random() * 0.3;
    ring.push([lon + Math.cos(angle) * lonRadius * variation, lat + Math.sin(angle) * latRadius * variation]);
  }
  ring.push([...ring[0]!] as [number, number]);
  return ring;
}

const densityValue: Record<SettlementDensity, number> = { rural: 0.2, low: 0.35, medium: 0.55, high: 0.78, metropolitan: 1 };

function landEntity(type: 'continent' | 'region', name: string, parentId: string | null, lon: number, lat: number, radiusKm: number, config: HierarchyGenerationConfig, random: () => number): TerraEntity {
  const reliefHeight = config.topography === 'mountains' ? 3_800 : config.topography === 'hills' ? 700 : config.topography === 'valleys' ? 450 : 80;
  return createEntity({
    type, name, parentId, description: `Procedurally generated ${type} with a complete editable world hierarchy.`,
    color: config.climate === 'frigid' ? '#bfdbfe' : config.climate === 'arid' ? '#d6a85f' : '#3f8f58', fillOpacity: 0.78,
    geometry: { type: 'Polygon', coordinates: [blob(lon, lat, radiusKm, random)] },
    properties: { biome: config.biome, climate: config.climate, topography: config.topography, reliefHeight },
  });
}

function settlementEntity(type: 'city' | 'town', name: string, parentId: string | null, lon: number, lat: number, radiusKm: number, config: HierarchyGenerationConfig, random: () => number): TerraEntity {
  return createEntity({
    type, name, parentId, description: `Generated ${type} with persistent streets, buildings, citizens, and local landmarks.`,
    color: type === 'city' ? '#f97316' : '#eab308', fillOpacity: 0.88,
    geometry: { type: 'Polygon', coordinates: [blob(lon, lat, radiusKm, random, 16)] },
    properties: {
      biome: type === 'city' ? 'city-urban' : 'town-village', density: densityValue[config.density], densityPreset: config.density,
      population: Math.round((type === 'city' ? 60_000 : 6_000) * Math.max(0.35, densityValue[config.density])),
      zoningPreset: 'mixed', generate3DBuildings: true,
    },
  });
}

function landmarkEntity(name: string, parentId: string, lon: number, lat: number): TerraEntity {
  return createEntity({
    type: 'landmark', name, parentId, description: 'A generated point of interest ready for custom lore and interaction.',
    color: '#a855f7', fillOpacity: 1, geometry: { type: 'Point', coordinates: [lon, lat] },
    properties: { pinStyle: 'beacon', pinIcon: 'landmark' },
  });
}

function addSettlementLayer(result: TerraEntity[], parent: TerraEntity, centerLon: number, centerLat: number, radiusKm: number, config: HierarchyGenerationConfig, random: () => number): void {
  const cityCount = config.density === 'rural' ? 1 : config.density === 'metropolitan' ? 3 : 2;
  const townCount = config.density === 'rural' ? 3 : 2;
  const children: TerraEntity[] = [];
  for (let index = 0; index < cityCount + townCount; index++) {
    const type = index < cityCount ? 'city' : 'town';
    const angle = (index / (cityCount + townCount)) * Math.PI * 2 + random() * 0.5;
    const distanceKm = radiusKm * (0.2 + random() * 0.42);
    const lat = centerLat + Math.sin(angle) * distanceKm / 111.32;
    const lon = centerLon + Math.cos(angle) * distanceKm / (111.32 * Math.max(0.25, Math.cos(centerLat * Math.PI / 180)));
    const names = type === 'city' ? CITY_NAMES : TOWN_NAMES;
    const settlement = settlementEntity(type, names[(index + Math.floor(random() * names.length)) % names.length]!, parent.id, lon, lat, type === 'city' ? 0.55 : 0.24, config, random);
    result.push(settlement);
    children.push(settlement);
  }
  for (let index = 0; index < Math.min(3, children.length); index++) {
    const owner = children[index]!;
    const [lon, lat] = owner.geometry.type === 'Point' ? owner.geometry.coordinates : [centerLon, centerLat];
    const center = owner.geometry.type === 'Polygon' ? owner.geometry.coordinates[0]?.[0] ?? [centerLon, centerLat] : [lon, lat];
    result.push(landmarkEntity(LANDMARK_NAMES[(index + Math.floor(random() * LANDMARK_NAMES.length)) % LANDMARK_NAMES.length]!, owner.id, center[0]!, center[1]!));
  }
}

export function generateHierarchy(config: HierarchyGenerationConfig): TerraEntity[] {
  const random = seeded(config.seed ?? Date.now());
  const result: TerraEntity[] = [];

  if (config.rootType === 'continent') {
    const continent = landEntity('continent', config.name || 'Generated Continent', null, config.centerLon, config.centerLat, config.radiusKm, config, random);
    result.push(continent);
    if (!config.includeDescendants) return result;
    const regionCount = config.density === 'rural' ? 3 : 4;
    for (let index = 0; index < regionCount; index++) {
      const angle = index / regionCount * Math.PI * 2 + 0.35;
      const distanceKm = config.radiusKm * 0.36;
      const lat = config.centerLat + Math.sin(angle) * distanceKm / 111.32;
      const lon = config.centerLon + Math.cos(angle) * distanceKm / (111.32 * Math.max(0.25, Math.cos(config.centerLat * Math.PI / 180)));
      const region = landEntity('region', REGION_NAMES[index % REGION_NAMES.length]!, continent.id, lon, lat, config.radiusKm * 0.27, config, random);
      result.push(region);
      addSettlementLayer(result, region, lon, lat, config.radiusKm * 0.27, config, random);
    }
    result.push(landmarkEntity('Continental Crown', continent.id, config.centerLon, config.centerLat));
    return result;
  }

  if (config.rootType === 'region') {
    const region = landEntity('region', config.name || 'Generated Region', null, config.centerLon, config.centerLat, config.radiusKm, config, random);
    result.push(region);
    if (config.includeDescendants) addSettlementLayer(result, region, config.centerLon, config.centerLat, config.radiusKm, config, random);
    return result;
  }

  const root = settlementEntity(config.rootType, config.name || `Generated ${config.rootType}`, null, config.centerLon, config.centerLat, config.rootType === 'city' ? Math.max(0.3, config.radiusKm) : Math.max(0.15, config.radiusKm), config, random);
  result.push(root);
  if (config.includeDescendants) {
    const landmarkCount = config.rootType === 'city' ? 3 : 2;
    for (let index = 0; index < landmarkCount; index++) {
      const angle = index / landmarkCount * Math.PI * 2;
      const distanceKm = config.radiusKm * 0.35;
      result.push(landmarkEntity(LANDMARK_NAMES[index]!, root.id, config.centerLon + Math.cos(angle) * distanceKm / 111.32, config.centerLat + Math.sin(angle) * distanceKm / 111.32));
    }
  }
  return result;
}

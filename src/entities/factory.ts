import { ulid } from 'ulid';
import type { EntityType, TerraEntity, TerraGeometry, World } from './types';

export function createEntityId(): string {
  return ulid();
}

export function createEntity(
  partial: Pick<TerraEntity, 'type' | 'name' | 'geometry'> &
    Partial<Omit<TerraEntity, 'id' | 'createdAt' | 'updatedAt'>>,
): TerraEntity {
  const now = Date.now();
  return {
    id: createEntityId(),
    type: partial.type,
    name: partial.name,
    description: partial.description ?? '',
    tags: partial.tags ?? [],
    color: partial.color ?? '#2dd4bf',
    fillOpacity: partial.fillOpacity ?? 0.35,
    parentId: partial.parentId ?? null,
    geometry: partial.geometry,
    images: partial.images ?? [],
    properties: {
      biome: 'satellite-blend',
      ...partial.properties,
    },
    createdAt: now,
    updatedAt: now,
  };
}

const WORLD_PREFIXES = [
  'Aether', 'Vesper', 'Celest', 'Eldor', 'Zelar', 'Verd', 'Sol', 'Astr',
  'Arcad', 'Myth', 'Cael', 'Nov', 'Kael', 'Zephyr', 'Boreal', 'Aur',
  'Thorn', 'Frost', 'Iron', 'Shadow', 'Silver', 'Starlight', 'Aura',
  'Val', 'Drak', 'Lumi', 'Obsidian', 'Astral', 'Solaria', 'Elys', 'Orion',
  'Lyra', 'Titan', 'Xanth', 'Hyperion', 'Oberon', 'Tethys', 'Sylvan'
];

const WORLD_SUFFIXES = [
  'ia', 'is', 'a', 'gard', 'ium', ' Reach', 'ros', 'us',
  'oria', 'alis', 'thos', 'heim', 'crest', 'vale', 'spire', 'haven',
  ' Prime', ' Majoris', ' Nexus', ' Sanctum', ' Sphere', ' Realm'
];

export function generateRandomWorldName(): string {
  const prefix = WORLD_PREFIXES[Math.floor(Math.random() * WORLD_PREFIXES.length)];
  const suffix = WORLD_SUFFIXES[Math.floor(Math.random() * WORLD_SUFFIXES.length)];
  return `${prefix}${suffix}`;
}

export function createEmptyWorld(name?: string): World {
  const worldName = name || generateRandomWorldName();
  return {
    id: createEntityId(),
    name: worldName,
    entities: {},
    camera: {
      lon: 0,
      lat: 20,
      height: 12_000_000,
      heading: 0,
      pitch: -90,
    },
    properties: {
      theme: 'modern',
    },
    version: 1,
  };
}

/** Dev helper — sample continent near 0,0 */
export function createSampleContinent(): TerraEntity {
  const geometry: TerraGeometry = {
    type: 'Polygon',
    coordinates: [
      [
        [-20, -10],
        [20, -10],
        [20, 10],
        [-20, 10],
        [-20, -10],
      ],
    ],
  };
  return createEntity({
    type: 'continent' satisfies EntityType,
    name: 'Aetherra',
    description: 'A sample continent. Replace me — draw your own!',
    color: '#38bdf8',
    fillOpacity: 0.4,
    geometry,
    tags: ['demo', 'fantasy'],
  });
}

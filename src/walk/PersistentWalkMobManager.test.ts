import { describe, expect, it } from 'vitest';
import type { TerraEntity } from '@/entities/types';
import { PlanetTerrainSampler } from '@/planet/terrain/PlanetTerrainSampler';
import { ensureBasicMobs } from './PersistentWalkMobManager';

describe('basic persistent mobs', () => {
  it('generates stable mobs only once on suitable land', () => {
    const land: TerraEntity = { id: 'land', type: 'continent', name: 'Land', description: '', tags: [], color: '#fff', fillOpacity: 1, parentId: null, images: [], createdAt: 0, updatedAt: 0, geometry: { type: 'Polygon', coordinates: [[[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]]] }, properties: { biome: 'lush-grassland' } };
    const terrain = new PlanetTerrainSampler({ land }, 14);
    const first = ensureBasicMobs({}, terrain, 14, 0, 0, 8, 100);
    const second = ensureBasicMobs(first, terrain, 14, 0, 0, 8, 200);
    expect(Object.keys(first)).toHaveLength(8);
    expect(second).toEqual(first);
    expect(Object.values(first).every((mob) => mob.health > 0)).toBe(true);
  });
});

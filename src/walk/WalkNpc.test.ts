import { describe, expect, it } from 'vitest';
import type { TerraEntity } from '@/entities/types';
import { PlanetTerrainSampler } from '@/planet/terrain/PlanetTerrainSampler';
import { planWalkNpcSpawns } from './WalkNpc';

function city(): TerraEntity {
  return {
    id: 'city', type: 'city', name: 'Test City', description: '', tags: [], color: '#fff',
    fillOpacity: 1, parentId: null, images: [], createdAt: 0, updatedAt: 0,
    geometry: { type: 'Polygon', coordinates: [[[-0.02, -0.02], [0.02, -0.02], [0.02, 0.02], [-0.02, 0.02], [-0.02, -0.02]]] },
    properties: { biome: 'city-urban' },
  };
}

describe('planWalkNpcSpawns', () => {
  it('places deterministic citizens on safe city streets', () => {
    const settlement = city();
    const terrain = new PlanetTerrainSampler({ city: settlement }, 12);
    const first = planWalkNpcSpawns({ city: settlement }, terrain, 0, 0, false);
    const second = planWalkNpcSpawns({ city: settlement }, terrain, 0, 0, false);

    expect(first.length).toBeGreaterThan(0);
    expect(first.length).toBeLessThanOrEqual(6);
    expect(second).toEqual(first);
    for (const npc of first) {
      expect(npc.settlementId).toBe('city');
      expect(npc.waypoints.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('does not spawn citizens outside settlement range', () => {
    const settlement = city();
    const terrain = new PlanetTerrainSampler({ city: settlement }, 12);
    expect(planWalkNpcSpawns({ city: settlement }, terrain, 10_000, 10_000, false)).toEqual([]);
  });
});

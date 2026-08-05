import { describe, expect, it } from 'vitest';
import type { TerraEntity } from '@/entities/types';
import { ensureNpcPopulation, scheduleEntryAt, simulateNpcToHour } from './NpcPopulation';

const city: TerraEntity = {
  id: 'city', type: 'city', name: 'Persiston', description: '', tags: [], color: '#fff',
  fillOpacity: 1, parentId: null, images: [], createdAt: 0, updatedAt: 0,
  geometry: { type: 'Polygon', coordinates: [[[-0.03, -0.03], [0.03, -0.03], [0.03, 0.03], [-0.03, 0.03], [-0.03, -0.03]]] },
  properties: { biome: 'city-urban' },
};

describe('persistent NPC population', () => {
  it('generates a stable roster once and preserves changed records', () => {
    const first = ensureNpcPopulation({}, { city }, 5, 100);
    expect(Object.keys(first).length).toBeGreaterThan(3);
    const id = Object.keys(first)[0]!;
    first[id]!.memories.push('Met the player');
    const second = ensureNpcPopulation(first, { city }, 5, 200);
    expect(second[id]!.memories).toContain('Met the player');
    expect(Object.keys(second)).toEqual(Object.keys(first));
  });

  it('moves unloaded NPC state according to its daily schedule', () => {
    const npc = Object.values(ensureNpcPopulation({}, { city }, 5, 100))[0]!;
    expect(scheduleEntryAt(npc, 9).activity).toBe('work');
    const simulated = simulateNpcToHour(npc, 9, 100_000);
    expect(simulated.currentActivity).toBe('work');
    expect(simulated.position.label).toBe(simulated.workplace.label);
  });

  it('populates towns more densely than the old ten-citizen cap', () => {
    const town = { ...city, id: 'town', type: 'town' as const, name: 'Busy Town', properties: { biome: 'town-village' } };
    const population = ensureNpcPopulation({}, { town }, 8, 100);
    expect(Object.keys(population).length).toBeGreaterThan(10);
  });
});

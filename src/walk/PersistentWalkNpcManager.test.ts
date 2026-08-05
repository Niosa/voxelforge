import { describe, expect, it } from 'vitest';
import type { TerraEntity, NpcLocation } from '@/entities/types';
import { PlanetTerrainSampler } from '@/planet/terrain/PlanetTerrainSampler';
import { findNpcRoadRoute, npcDialogueText, rayNpcDistance, safeNpcSpawnNode } from './PersistentWalkNpcManager';
import { ensureNpcPopulation } from '@/npc/NpcPopulation';

const city: TerraEntity = {
  id: 'city', type: 'city', name: 'Routes', description: '', tags: [], color: '#fff',
  fillOpacity: 1, parentId: null, images: [], createdAt: 0, updatedAt: 0,
  geometry: { type: 'Polygon', coordinates: [[[-0.03, -0.03], [0.03, -0.03], [0.03, 0.03], [-0.03, 0.03], [-0.03, -0.03]]] },
  properties: { biome: 'city-urban' },
};

describe('NPC road navigation', () => {
  it('places NPC feet exactly one block above the sampled surface', () => {
    const terrain = new PlanetTerrainSampler({ city }, 4);
    const spawn = safeNpcSpawnNode(terrain, 0, 0);
    const surface = terrain.sampleSurface(Math.floor(spawn.x), Math.floor(spawn.z));
    expect(spawn.y).toBe(surface.elevation + 1);
    expect(terrain.blockAt(Math.floor(spawn.x), spawn.y, Math.floor(spawn.z), surface)).toBe(0);
  });

  it('finds a connected route whose nodes stay on walkable roads', () => {
    const terrain = new PlanetTerrainSampler({ city }, 4);
    const start: NpcLocation = { x: -30, y: 5, z: -30, label: 'start' };
    const end: NpcLocation = { x: 30, y: 5, z: 30, label: 'end' };
    const route = findNpcRoadRoute(terrain, start, end);
    expect(route.length).toBeGreaterThan(2);
    for (const node of route) {
      const surface = terrain.sampleSurface(Math.floor(node.x), Math.floor(node.z));
      expect(terrain.blockAt(Math.floor(node.x), surface.elevation, Math.floor(node.z), surface)).toBe(13);
    }
  });

  it('advances through occupation-aware dialogue stages', () => {
    const npc = Object.values(ensureNpcPopulation({}, { city }, 4, 100))[0]!;
    npc.conversationStage = 1;
    const greeting = npcDialogueText(npc);
    npc.conversationStage = 2;
    const localTopic = npcDialogueText(npc);
    expect(greeting).not.toBe(localTopic);
    expect(localTopic.length).toBeGreaterThan(20);
  });

  it('only targets NPC bounds intersected by the crosshair ray', () => {
    expect(rayNpcDistance([0, 1.6, 0], [0, 0, 1], [0, 0, 3])).toBeCloseTo(2.62, 2);
    expect(rayNpcDistance([0, 1.6, 0], [0, 0, 1], [1.2, 0, 3])).toBeNull();
    expect(rayNpcDistance([0, 1.6, 0], [0, 0, -1], [0, 0, 3])).toBeNull();
  });
});

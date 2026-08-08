import { describe, expect, it } from 'vitest';
import type { TerraEntity, NpcLocation } from '@/entities/types';
import { PlanetTerrainSampler } from '@/planet/terrain/PlanetTerrainSampler';
import {
  findNpcRoadRoute,
  findNpcRoutineRoute,
  findNpcObstacleDetour,
  nextNpcRoadStep,
  npcActivityRoams,
  npcDialogueResponse,
  npcDialogueText,
  prioritizeWalkNpcs,
  rayNpcDistance,
  routineDestination,
  safeNpcSpawnNode,
} from './PersistentWalkNpcManager';
import { ensureNpcPopulation, scheduleFor } from '@/npc/NpcPopulation';

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

  it('advances kinematic citizens toward their road target independently of physics sleep', () => {
    const [x, z] = nextNpcRoadStep(0, 0, 3, 4, 1.2, 0.1);
    expect(x).toBeCloseTo(0.072, 4);
    expect(z).toBeCloseTo(0.096, 4);
    expect(Math.hypot(x, z)).toBeCloseTo(0.12, 4);
  });

  it('can find a local routine when a scheduled destination is disconnected', () => {
    const terrain = new PlanetTerrainSampler({ city }, 4);
    const start = safeNpcSpawnNode(terrain, 0, 0);
    const route = findNpcRoutineRoute(
      terrain,
      { ...start, label: 'start' },
      { x: 1_000_000, y: start.y, z: 1_000_000, label: 'disconnected' },
      2,
    );
    expect(route.length).toBeGreaterThan(1);
  });

  it('detours around live player-built obstacles and rejoins its route', () => {
    const blocked = new Set(['2,0', '2,1']);
    const route = findNpcObstacleDetour(
      { x: 0.5, y: 5, z: 0.5, label: 'start' },
      { x: 5.5, y: 5, z: 0.5, label: 'route' },
      (x, z) => blocked.has(`${x},${z}`) ? null : 5,
    );
    expect(route.length).toBeGreaterThan(6);
    expect(route.at(-1)).toMatchObject({ x: 5.5, z: 0.5 });
    expect(route.every((node) => !blocked.has(`${Math.floor(node.x)},${Math.floor(node.z)}`))).toBe(true);
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

  it('offers relationship-aware player conversation topics', () => {
    const npc = Object.values(ensureNpcPopulation({}, { city }, 4, 100))[0]!;
    npc.currentActivity = 'work';
    const work = npcDialogueResponse(npc, 'work');
    const town = npcDialogueResponse(npc, 'town');
    const family = npcDialogueResponse(npc, 'family');
    npc.relationships.player = 10;
    const trustedHelp = npcDialogueResponse(npc, 'help');
    expect(work).toContain('work');
    expect(town).not.toBe(work);
    expect(family).toContain(npc.home.label);
    expect(trustedHelp).toContain("You've been kind");
  });

  it('gives occupations distinct schedules and roaming activity destinations', () => {
    expect(scheduleFor('farmer').find((entry) => entry.startHour === 5.5)?.activity).toBe('work');
    expect(scheduleFor('innkeeper').find((entry) => entry.startHour === 17)?.destination).toBe('tavern');
    const npc = Object.values(ensureNpcPopulation({}, { city }, 4, 100))[0]!;
    npc.currentActivity = 'work';
    const nearbyRoutine = routineDestination(npc, npc.workplace, 1);
    expect(npcActivityRoams(npc.currentActivity)).toBe(true);
    expect(Math.hypot(nearbyRoutine.x - npc.workplace.x, nearbyRoutine.z - npc.workplace.z)).toBeGreaterThan(3);
  });

  it('only targets NPC bounds intersected by the crosshair ray', () => {
    expect(rayNpcDistance([0, 1.6, 0], [0, 0, 1], [0, 0, 3])).toBeCloseTo(2.62, 2);
    expect(rayNpcDistance([0, 1.6, 0], [0, 0, 1], [1.2, 0, 3])).toBeNull();
    expect(rayNpcDistance([0, 1.6, 0], [0, 0, -1], [0, 0, 3])).toBeNull();
  });

  it('prioritizes citizens from the settlement under the player', () => {
    const population = ensureNpcPopulation({}, { city }, 4, 100);
    const local = Object.values(population)[0]!;
    local.position = { ...local.position, x: 1_000, z: 1_000 };
    const outsider = {
      ...Object.values(population)[1]!,
      id: 'outsider',
      settlementId: 'elsewhere',
      position: { ...Object.values(population)[1]!.position, x: 2, z: 2 },
    };
    const selected = prioritizeWalkNpcs({ [local.id]: local, outsider }, 'city', 0, 0, 1);
    expect(selected[0]!.settlementId).toBe('city');
  });
});

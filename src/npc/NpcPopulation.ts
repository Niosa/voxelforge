import type {
  NpcLocation,
  NpcOccupation,
  NpcScheduleEntry,
  TerraEntity,
  WorldNpc,
} from '@/entities/types';
import { planCityLots, type CityLotPlan } from '@/city/CityLayout';
import { isSettlementRoadBlock, PlanetTerrainSampler } from '@/planet/terrain/PlanetTerrainSampler';
import { createCityLayout } from '@/city/CityLayout';
import { planetMetersToLonLat } from '@/planet/spatial/PlanetGrid';

const FIRST_NAMES = ['Ari', 'Bea', 'Cato', 'Dara', 'Eli', 'Fia', 'Galen', 'Hana', 'Ivo', 'Jora', 'Kellan', 'Lina'];
const FAMILY_NAMES = ['Ashfield', 'Bell', 'Copper', 'Dale', 'Ember', 'Fenn', 'Grove', 'Hearth', 'Ives', 'Juniper'];
const OCCUPATIONS: NpcOccupation[] = ['merchant', 'innkeeper', 'artisan', 'farmer', 'guard', 'laborer'];

function selectIndex(value: number, length: number): number {
  return ((value % length) + length) % length;
}

function locationForLot(lot: CityLotPlan, label: string, terrain: PlanetTerrainSampler): NpcLocation {
  const targetX = Math.round(lot.x);
  const targetZ = Math.round(lot.z - Math.max(2, lot.lotDepth / 2));
  for (let radius = 0; radius <= 12; radius++) {
    for (let dz = -radius; dz <= radius; dz++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (radius > 0 && Math.abs(dx) !== radius && Math.abs(dz) !== radius) continue;
        const x = targetX + dx;
        const z = targetZ + dz;
        const surface = terrain.sampleSurface(x, z);
        if (!isSettlementRoadBlock(terrain.blockAt(x, surface.elevation, z, surface))) continue;
        if (terrain.blockAt(x, surface.elevation + 1, z, surface) !== 0) continue;
        return { x: x + 0.5, y: surface.elevation + 1, z: z + 0.5, label };
      }
    }
  }
  const surface = terrain.sampleSurface(targetX, targetZ);
  return { x: targetX + 0.5, y: surface.elevation + 1, z: targetZ + 0.5, label };
}

export function scheduleFor(occupation: NpcOccupation): NpcScheduleEntry[] {
  if (occupation === 'guard') {
    return [
      { startHour: 0, activity: 'sleep', destination: 'home' },
      { startHour: 6, activity: 'breakfast', destination: 'home' },
      { startHour: 7, activity: 'patrol', destination: 'patrol' },
      { startHour: 12, activity: 'lunch', destination: 'market' },
      { startHour: 13, activity: 'patrol', destination: 'patrol' },
      { startHour: 19, activity: 'tavern', destination: 'tavern' },
      { startHour: 22, activity: 'travel-home', destination: 'home' },
    ];
  }
  if (occupation === 'farmer') {
    return [
      { startHour: 0, activity: 'sleep', destination: 'home' },
      { startHour: 5, activity: 'breakfast', destination: 'home' },
      { startHour: 5.5, activity: 'work', destination: 'work' },
      { startHour: 11.5, activity: 'lunch', destination: 'home' },
      { startHour: 12.5, activity: 'work', destination: 'work' },
      { startHour: 17, activity: 'market', destination: 'market' },
      { startHour: 19, activity: 'leisure', destination: 'tavern' },
      { startHour: 21, activity: 'travel-home', destination: 'home' },
    ];
  }
  if (occupation === 'innkeeper') {
    return [
      { startHour: 0, activity: 'sleep', destination: 'work' },
      { startHour: 7, activity: 'breakfast', destination: 'home' },
      { startHour: 9, activity: 'market', destination: 'market' },
      { startHour: 11, activity: 'work', destination: 'work' },
      { startHour: 15, activity: 'leisure', destination: 'market' },
      { startHour: 17, activity: 'work', destination: 'tavern' },
      { startHour: 23.5, activity: 'travel-home', destination: 'home' },
    ];
  }
  if (occupation === 'merchant') {
    return [
      { startHour: 0, activity: 'sleep', destination: 'home' },
      { startHour: 7, activity: 'breakfast', destination: 'home' },
      { startHour: 8, activity: 'market', destination: 'market' },
      { startHour: 12.5, activity: 'lunch', destination: 'tavern' },
      { startHour: 13.5, activity: 'work', destination: 'work' },
      { startHour: 18, activity: 'leisure', destination: 'market' },
      { startHour: 21, activity: 'travel-home', destination: 'home' },
    ];
  }
  if (occupation === 'artisan') {
    return [
      { startHour: 0, activity: 'sleep', destination: 'home' },
      { startHour: 6.5, activity: 'breakfast', destination: 'home' },
      { startHour: 7.5, activity: 'work', destination: 'work' },
      { startHour: 12, activity: 'lunch', destination: 'market' },
      { startHour: 13, activity: 'work', destination: 'work' },
      { startHour: 18.5, activity: 'tavern', destination: 'tavern' },
      { startHour: 22, activity: 'travel-home', destination: 'home' },
    ];
  }
  return [
    { startHour: 0, activity: 'sleep', destination: 'home' },
    { startHour: 6.5, activity: 'breakfast', destination: 'home' },
    { startHour: 8, activity: 'work', destination: 'work' },
    { startHour: 12, activity: 'lunch', destination: 'market' },
    { startHour: 13, activity: 'work', destination: 'work' },
    { startHour: 17.5, activity: 'leisure', destination: 'market' },
    { startHour: 19, activity: 'tavern', destination: 'tavern' },
    { startHour: 21.5, activity: 'travel-home', destination: 'home' },
  ];
}

export function scheduleEntryAt(npc: WorldNpc, hour: number): NpcScheduleEntry {
  const normalized = ((hour % 24) + 24) % 24;
  let entry = npc.schedule[0]!;
  for (const candidate of npc.schedule) {
    if (candidate.startHour <= normalized) entry = candidate;
    else break;
  }
  return entry;
}

export function destinationFor(npc: WorldNpc, entry: NpcScheduleEntry): NpcLocation {
  switch (entry.destination) {
    case 'home': return npc.home;
    case 'work': return npc.workplace;
    case 'market': return npc.market;
    case 'tavern': return npc.tavern;
    case 'patrol': return npc.market;
  }
}

function generateSettlementNpcs(
  settlement: TerraEntity,
  terrain: PlanetTerrainSampler,
  seed: number,
  now: number,
): WorldNpc[] {
  let lots = planCityLots(settlement, seed, settlement.type === 'town' ? 36 : 60);
  if (lots.length === 0) {
    const layout = createCityLayout(settlement, seed);
    const uses: CityLotPlan['buildingUse'][] = ['home', 'home', 'shop', 'inn', 'workshop', 'farm', 'civic'];
    lots = Array.from({ length: settlement.type === 'town' ? 18 : 24 }, (_, index) => {
      const angle = index / (settlement.type === 'town' ? 18 : 24) * Math.PI * 2;
      const distance = 18 + index % 4 * 7;
      const x = Math.round(layout.centerX + Math.cos(angle) * distance);
      const z = Math.round(layout.centerZ + Math.sin(angle) * distance);
      const [lon, lat] = planetMetersToLonLat(x, z);
      const buildingUse = uses[index % uses.length]!;
      return {
        x, z, lon, lat, distance, road: false, park: false, buildingHeight: 4, buildingWall: true,
        buildingBlockId: 11, roofBlockId: 13, lotWidth: 7, lotDepth: 7, district: 'residential' as const,
        parcelSeed: index, buildingUse, buildingEntrance: true,
        parkTree: false, parkTreeDistance: Number.POSITIVE_INFINITY,
        parkFeature: 'none' as const, streetLight: false, transitStop: false,
        businessSignBlockId: 0,
      };
    });
  }
  const homes = lots.filter((lot) => lot.buildingUse === 'home');
  const workplaces = lots.filter((lot) => lot.buildingUse !== 'home');
  const tavernLot = lots.find((lot) => lot.buildingUse === 'inn') ?? workplaces[0] ?? lots[0]!;
  const marketLot = lots.find((lot) => lot.buildingUse === 'shop' || lot.buildingUse === 'civic') ?? lots[0]!;
  const rosterSize = Math.min(
    settlement.type === 'town' ? 30 : 48,
    Math.max(settlement.type === 'town' ? 12 : 16, homes.length * 3),
  );
  const householdCount = Math.max(1, Math.min(
    Math.max(1, homes.length),
    Math.ceil(rosterSize / 2.5),
  ));
  const result: WorldNpc[] = [];
  for (let index = 0; index < rosterSize; index++) {
    const householdIndex = index % householdCount;
    const householdGeneration = Math.floor(index / householdCount);
    const homeLot = homes[householdIndex % Math.max(1, homes.length)] ?? lots[index % lots.length]!;
    const workLot = workplaces[index % Math.max(1, workplaces.length)] ?? lots[(index + 1) % lots.length]!;
    let occupation = OCCUPATIONS[selectIndex(index + seed, OCCUPATIONS.length)]!;
    if (workLot.buildingUse === 'inn') occupation = 'innkeeper';
    else if (workLot.buildingUse === 'shop') occupation = 'merchant';
    else if (workLot.buildingUse === 'workshop') occupation = 'artisan';
    else if (workLot.buildingUse === 'farm') occupation = 'farmer';
    else if (workLot.buildingUse === 'civic') occupation = 'guard';
    const id = `npc-${settlement.id}-${index}`;
    const familyName = FAMILY_NAMES[selectIndex(householdIndex + seed, FAMILY_NAMES.length)]!;
    const householdId = `household-${settlement.id}-${householdIndex}`;
    const familyRole = householdGeneration === 0 ? 'adult' : householdGeneration === 1 ? 'partner' : 'relative';
    const home = locationForLot(homeLot, `${familyName} residence`, terrain);
    const workplace = locationForLot(workLot, `${settlement.name} ${workLot.buildingUse}`, terrain);
    const market = locationForLot(marketLot, `${settlement.name} market`, terrain);
    const tavern = locationForLot(tavernLot, `${settlement.name} inn`, terrain);
    const schedule = scheduleFor(occupation);
    result.push({
      id,
      name: `${FIRST_NAMES[index % FIRST_NAMES.length]} ${familyName}`,
      settlementId: settlement.id,
      occupation,
      householdId,
      familyName,
      familyRole,
      home,
      workplace,
      market,
      tavern,
      position: { ...home },
      schedule,
      currentActivity: schedule[0]!.activity,
      relationships: {},
      memories: [],
      conversationStage: 0,
      createdAt: now,
      updatedAt: now,
      lastSimulatedAt: now,
    });
  }
  const households = new Map<string, WorldNpc[]>();
  for (const npc of result) {
    const members = households.get(npc.householdId!) ?? [];
    members.push(npc);
    households.set(npc.householdId!, members);
  }
  for (const members of households.values()) {
    for (const npc of members) {
      const relatives = members.filter((member) => member.id !== npc.id);
      npc.familyIds = relatives.map((member) => member.id);
      npc.familyMemberNames = relatives.map((member) => member.name);
      for (const relative of relatives) npc.relationships[relative.id] = 45;
    }
  }
  return result;
}

export function ensureNpcPopulation(
  existing: Record<string, WorldNpc> | undefined,
  entities: Record<string, TerraEntity>,
  seed: number,
  now = Date.now(),
): Record<string, WorldNpc> {
  const settlements = Object.values(entities).filter((entity) => entity.type === 'city' || entity.type === 'town');
  const settlementIds = new Set(settlements.map((settlement) => settlement.id));
  const next = Object.fromEntries(
    Object.entries(existing ?? {}).filter(([, npc]) => settlementIds.has(npc.settlementId)),
  );
  const terrain = new PlanetTerrainSampler(entities, seed);
  for (const settlement of settlements) {
    for (const generated of generateSettlementNpcs(settlement, terrain, seed, now)) {
      const existingNpc = next[generated.id];
      if (!existingNpc) next[generated.id] = generated;
      else {
        // Refresh generated routines and destinations as settlement layouts evolve,
        // while retaining the citizen's persistent identity, position, and memories.
        next[generated.id] = {
          ...existingNpc,
          householdId: generated.householdId,
          familyName: generated.familyName,
          familyRole: generated.familyRole,
          familyIds: generated.familyIds,
          familyMemberNames: generated.familyMemberNames,
          home: generated.home,
          workplace: generated.workplace,
          market: generated.market,
          tavern: generated.tavern,
          schedule: generated.schedule,
          relationships: {
            ...generated.relationships,
            ...existingNpc.relationships,
          },
        };
      }
    }
  }
  return next;
}

export function simulateNpcToHour(npc: WorldNpc, hour: number, now = Date.now()): WorldNpc {
  const entry = scheduleEntryAt(npc, hour);
  if (now - npc.lastSimulatedAt < 60_000 && npc.currentActivity === entry.activity) return npc;
  const destination = destinationFor(npc, entry);
  return {
    ...npc,
    position: { ...destination },
    currentActivity: entry.activity,
    lastSimulatedAt: now,
    updatedAt: now,
  };
}

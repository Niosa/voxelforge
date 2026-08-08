import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Matrix } from '@babylonjs/core/Maths/math.vector';
import '@babylonjs/core/Rendering/outlineRenderer';
import type { Engine } from 'noa-engine';
import type { NpcLocation, WorldNpc } from '@/entities/types';
import type { PlanetLocalFrame } from '@/planet/spatial/PlanetGrid';
import { PlanetTerrainSampler } from '@/planet/terrain/PlanetTerrainSampler';
import { destinationFor, scheduleEntryAt } from '@/npc/NpcPopulation';
import { BLOCK_AIR, BLOCK_BY_ID } from './blockRegistry';

export interface NpcConversationBubble {
  npcId: string;
  npcName: string;
  occupation: string;
  activity: string;
  relationship: number;
  text: string;
  choices: NpcConversationChoice[];
}

export interface NpcConversationChoice {
  id: 'work' | 'town' | 'family' | 'help' | 'goodbye';
  label: string;
}

interface RouteNode {
  x: number;
  y: number;
  z: number;
}

interface RuntimeNpc {
  record: WorldNpc;
  entityId: number;
  mesh: Mesh;
  route: RouteNode[];
  routeIndex: number;
  destinationKey: string;
  nextScheduleCheck: number;
  nextRepathAt: number;
  stoppedForConversation: boolean;
  nextGroundingCheck: number;
  terrainReady: boolean;
  dwellUntil: number;
  routineStep: number;
  lastProgressAt: number;
  lastProgressDistance: number;
}

const CLOTHING = ['#2563eb', '#dc2626', '#059669', '#d97706', '#7c3aed', '#0891b2'];
const NPC_NEIGHBOR_CELL_SIZE = 2;
const CONVERSATION_CHOICES: NpcConversationChoice[] = [
  { id: 'work', label: 'What are you doing?' },
  { id: 'town', label: 'Tell me about this town.' },
  { id: 'family', label: 'Do you have family here?' },
  { id: 'help', label: 'Do you need any help?' },
  { id: 'goodbye', label: 'Goodbye.' },
];

function positionKey(location: NpcLocation): string {
  return `${Math.round(location.x)},${Math.round(location.z)}`;
}

function closestRoadNode(terrain: PlanetTerrainSampler, x: number, z: number, radius = 14): RouteNode | null {
  for (let ring = 0; ring <= radius; ring++) {
    for (let dz = -ring; dz <= ring; dz++) {
      for (let dx = -ring; dx <= ring; dx++) {
        if (ring > 0 && Math.abs(dx) !== ring && Math.abs(dz) !== ring) continue;
        // NPC locations are stored at block centres (n + 0.5), so floor maps
        // directly back to their authored road node. Round needlessly started
        // every lookup one block away and expanded most searches into rings.
        const bx = Math.floor(x + dx);
        const bz = Math.floor(z + dz);
        const elevation = terrain.settlementRoadElevationAt(bx, bz);
        if (elevation === null) continue;
        return { x: bx + 0.5, y: elevation + 1, z: bz + 0.5 };
      }
    }
  }
  return null;
}

export function safeNpcSpawnNode(terrain: PlanetTerrainSampler, x: number, z: number): RouteNode {
  const road = closestRoadNode(terrain, x, z);
  if (road) return road;
  const [safeX, , safeZ] = terrain.findSafeSpawn(Math.round(x), Math.round(z));
  const surface = terrain.sampleSurface(safeX, safeZ);
  return { x: safeX + 0.5, y: surface.elevation + 1, z: safeZ + 0.5 };
}

export function rayNpcDistance(
  origin: readonly number[],
  direction: readonly number[],
  feet: readonly number[],
  maxDistance = 4.5,
): number | null {
  const minimum = [feet[0]! - 0.38, feet[1]!, feet[2]! - 0.38];
  const maximum = [feet[0]! + 0.38, feet[1]! + 1.8, feet[2]! + 0.38];
  let near = 0;
  let far = maxDistance;
  for (let axis = 0; axis < 3; axis++) {
    const delta = direction[axis]!;
    if (Math.abs(delta) < 1e-8) {
      if (origin[axis]! < minimum[axis]! || origin[axis]! > maximum[axis]!) return null;
      continue;
    }
    const inverse = 1 / delta;
    let first = (minimum[axis]! - origin[axis]!) * inverse;
    let second = (maximum[axis]! - origin[axis]!) * inverse;
    if (first > second) [first, second] = [second, first];
    near = Math.max(near, first);
    far = Math.min(far, second);
    if (near > far) return null;
  }
  return near <= maxDistance ? near : null;
}

function routeKey(x: number, z: number): string {
  return `${x},${z}`;
}

interface RouteCandidate { x: number; z: number; score: number }

function pushRouteCandidate(heap: RouteCandidate[], candidate: RouteCandidate): void {
  heap.push(candidate);
  let index = heap.length - 1;
  while (index > 0) {
    const parent = Math.floor((index - 1) / 2);
    if (heap[parent]!.score <= candidate.score) break;
    heap[index] = heap[parent]!;
    index = parent;
  }
  heap[index] = candidate;
}

function popRouteCandidate(heap: RouteCandidate[]): RouteCandidate | undefined {
  const first = heap[0];
  const tail = heap.pop();
  if (!first || !tail || heap.length === 0) return first;
  let index = 0;
  while (true) {
    const left = index * 2 + 1;
    if (left >= heap.length) break;
    const right = left + 1;
    const child = right < heap.length && heap[right]!.score < heap[left]!.score ? right : left;
    if (heap[child]!.score >= tail.score) break;
    heap[index] = heap[child]!;
    index = child;
  }
  heap[index] = tail;
  return first;
}

export function findNpcObstacleDetour(
  start: RouteNode | NpcLocation,
  destination: RouteNode | NpcLocation,
  walkableYAt: (x: number, z: number, previousY: number) => number | null,
  maxVisited = 512,
): RouteNode[] {
  const startX = Math.floor(start.x), startZ = Math.floor(start.z);
  const endX = Math.floor(destination.x), endZ = Math.floor(destination.z);
  const directDistance = Math.abs(endX - startX) + Math.abs(endZ - startZ);
  const searchRadius = Math.max(8, Math.min(16, directDistance + 5));
  const queue: RouteCandidate[] = [{ x: startX, z: startZ, score: directDistance }];
  const startKey = routeKey(startX, startZ);
  const cameFrom = new Map<string, string | null>([[startKey, null]]);
  const routeCost = new Map<string, number>([[startKey, 0]]);
  const elevations = new Map<string, number>([[startKey, start.y]]);
  const settled = new Set<string>();
  while (queue.length > 0 && settled.size < maxVisited) {
    const current = popRouteCandidate(queue)!;
    const currentKey = routeKey(current.x, current.z);
    if (settled.has(currentKey)) continue;
    settled.add(currentKey);
    if (current.x === endX && current.z === endZ) break;
    const currentY = elevations.get(currentKey) ?? start.y;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const x = current.x + dx;
      const z = current.z + dz;
      if (Math.abs(x - startX) > searchRadius || Math.abs(z - startZ) > searchRadius) continue;
      const y = walkableYAt(x, z, currentY);
      if (y === null || Math.abs(y - currentY) > 1.05) continue;
      const key = routeKey(x, z);
      const nextCost = (routeCost.get(currentKey) ?? 0) + 1;
      if (nextCost >= (routeCost.get(key) ?? Number.POSITIVE_INFINITY)) continue;
      routeCost.set(key, nextCost);
      cameFrom.set(key, currentKey);
      elevations.set(key, y);
      pushRouteCandidate(queue, { x, z, score: nextCost + Math.abs(endX - x) + Math.abs(endZ - z) });
    }
  }
  const endKey = routeKey(endX, endZ);
  if (!cameFrom.has(endKey)) return [];
  const reversed: RouteNode[] = [];
  let key: string | null = endKey;
  while (key) {
    const [x = 0, z = 0] = key.split(',').map(Number);
    reversed.push({ x: x + 0.5, y: elevations.get(key) ?? start.y, z: z + 0.5 });
    key = cameFrom.get(key) ?? null;
  }
  return reversed.reverse();
}

export function findNpcRoadRoute(
  terrain: PlanetTerrainSampler,
  start: NpcLocation,
  destination: NpcLocation,
  maxVisited = 2_500,
): RouteNode[] {
  const startNode = closestRoadNode(terrain, start.x, start.z);
  const endNode = closestRoadNode(terrain, destination.x, destination.z);
  if (!startNode || !endNode) return [];
  const startX = Math.floor(startNode.x), startZ = Math.floor(startNode.z);
  const endX = Math.floor(endNode.x), endZ = Math.floor(endNode.z);
  const queue: RouteCandidate[] = [{
    x: startX,
    z: startZ,
    score: Math.abs(endX - startX) + Math.abs(endZ - startZ),
  }];
  const cameFrom = new Map<string, string | null>([[routeKey(startX, startZ), null]]);
  const routeCost = new Map<string, number>([[routeKey(startX, startZ), 0]]);
  const settled = new Set<string>();
  while (queue.length > 0 && settled.size < maxVisited) {
    const current = popRouteCandidate(queue)!;
    const currentKey = routeKey(current.x, current.z);
    if (settled.has(currentKey)) continue;
    settled.add(currentKey);
    if (current.x === endX && current.z === endZ) break;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const x = current.x + dx;
      const z = current.z + dz;
      const key = routeKey(x, z);
      if (terrain.settlementRoadElevationAt(x, z) === null) continue;
      const nextCost = (routeCost.get(currentKey) ?? 0) + 1;
      if (nextCost >= (routeCost.get(key) ?? Number.POSITIVE_INFINITY)) continue;
      routeCost.set(key, nextCost);
      cameFrom.set(key, routeKey(current.x, current.z));
      pushRouteCandidate(queue, { x, z, score: nextCost + Math.abs(endX - x) + Math.abs(endZ - z) });
    }
  }
  const endKey = routeKey(endX, endZ);
  if (!cameFrom.has(endKey)) return [];
  const reversed: RouteNode[] = [];
  let key: string | null = endKey;
  while (key) {
    const [x = 0, z = 0] = key.split(',').map(Number);
    const surface = terrain.sampleSurface(x, z);
    reversed.push({ x: x + 0.5, y: surface.elevation + 1, z: z + 0.5 });
    key = cameFrom.get(key) ?? null;
  }
  return reversed.reverse();
}

export function findNpcRoutineRoute(
  terrain: PlanetTerrainSampler,
  start: NpcLocation,
  destination: NpcLocation,
  routineStep = 0,
): RouteNode[] {
  const destinationDx = destination.x - start.x;
  const destinationDz = destination.z - start.z;
  const destinationDistance = Math.hypot(destinationDx, destinationDz);
  // Long journeys are planned in bounded legs. This prevents one citizen on
  // the far side of a large authored city from monopolizing the main thread.
  const routeTarget = destinationDistance > 72 ? {
    ...destination,
    x: start.x + destinationDx / destinationDistance * 72,
    z: start.z + destinationDz / destinationDistance * 72,
    label: `${destination.label} route`,
  } : destination;
  const scheduled = findNpcRoadRoute(terrain, start, routeTarget);
  if (scheduled.length > 0) return scheduled;
  // Layout edits can temporarily disconnect a generated destination from its
  // old road. Keep the citizen alive locally instead of freezing forever.
  for (let attempt = 0; attempt < 4; attempt++) {
    const angle = (attempt + routineStep) * Math.PI / 4;
    const radius = 8 + attempt % 3 * 4;
    const localDestination: NpcLocation = {
      x: start.x + Math.cos(angle) * radius,
      y: start.y,
      z: start.z + Math.sin(angle) * radius,
      label: 'nearby road',
    };
    const localRoute = findNpcRoadRoute(terrain, start, localDestination);
    if (localRoute.length > 1) return localRoute;
  }
  return [];
}

function makeCharacterMesh(noa: Engine, npc: WorldNpc, colorIndex: number): Mesh {
  const scene = noa.rendering.getScene();
  const clothes = new StandardMaterial(`${npc.id}-clothes`, scene);
  clothes.diffuseColor = Color3.FromHexString(CLOTHING[colorIndex % CLOTHING.length]!);
  clothes.emissiveColor = clothes.diffuseColor.scale(0.12);
  const torso = MeshBuilder.CreateBox(`${npc.id}-torso`, { width: 0.58, height: 0.72, depth: 0.34 }, scene);
  torso.position.y = 1.02; torso.material = clothes;
  const head = MeshBuilder.CreateBox(`${npc.id}-head`, { size: 0.44 }, scene);
  head.position.y = 1.62; head.material = clothes;
  const leftLeg = MeshBuilder.CreateBox(`${npc.id}-left-leg`, { width: 0.22, height: 0.64, depth: 0.25 }, scene);
  leftLeg.position.set(-0.16, 0.32, 0); leftLeg.material = clothes;
  const rightLeg = MeshBuilder.CreateBox(`${npc.id}-right-leg`, { width: 0.22, height: 0.64, depth: 0.25 }, scene);
  rightLeg.position.set(0.16, 0.32, 0); rightLeg.material = clothes;
  const leftArm = MeshBuilder.CreateBox(`${npc.id}-left-arm`, { width: 0.16, height: 0.65, depth: 0.2 }, scene);
  leftArm.position.set(-0.39, 1.02, 0); leftArm.material = clothes;
  const rightArm = MeshBuilder.CreateBox(`${npc.id}-right-arm`, { width: 0.16, height: 0.65, depth: 0.2 }, scene);
  rightArm.position.set(0.39, 1.02, 0); rightArm.material = clothes;
  const parts = [torso, head, leftLeg, rightLeg, leftArm, rightArm];
  for (const part of parts) part.computeWorldMatrix(true);
  const merged = Mesh.MergeMeshes(parts, true, true, undefined, false, false);
  if (!merged) throw new Error(`Unable to build NPC geometry for ${npc.name}`);
  merged.name = npc.id;
  merged.material = clothes;
  // MergeMeshes can preserve a small negative local bound depending on the
  // source transforms. Normalize the character so its feet are always y=0,
  // matching NOA's bottom-centred entity position convention.
  merged.refreshBoundingInfo();
  const feetY = merged.getBoundingInfo().boundingBox.minimum.y;
  if (Number.isFinite(feetY) && Math.abs(feetY) > 1e-5) {
    merged.bakeTransformIntoVertices(Matrix.Translation(0, -feetY, 0));
    merged.refreshBoundingInfo();
  }
  merged.isPickable = false;
  merged.alwaysSelectAsActiveMesh = true;
  return merged;
}

export function npcDialogueText(npc: WorldNpc): string {
  const activity = npc.currentActivity.replace('-', ' ');
  const memory = npc.memories.length > 0 ? ` I remember ${npc.memories[npc.memories.length - 1]}.` : '';
  const stage = ((npc.conversationStage - 1) % 4 + 4) % 4;
  if (stage === 1) {
    if (npc.occupation === 'guard') return `The roads have been mostly quiet, but I keep hearing reports from beyond ${npc.market.label}.`;
    if (npc.occupation === 'merchant') return `Trade is steady. Bring me something unusual and I'll make sure the whole market hears about it.`;
    if (npc.occupation === 'innkeeper') return `Travelers exchange all kinds of rumors at ${npc.tavern.label}. Some of them may even be true.`;
    if (npc.occupation === 'farmer') return `The weather decides more than any ruler does. This season has been ${activity}.`;
    return `Most days you'll find me around ${npc.workplace.label}. There's always another task waiting.`;
  }
  if (stage === 2) return `If you're exploring, start near ${npc.market.label}. People there usually know what has changed around town.`;
  if (stage === 3) return `Safe travels. I'll remember that you stopped to speak with me.`;
  switch (npc.occupation) {
    case 'merchant': return `I'm ${npc.name}. I run trade here in ${npc.workplace.label}. I'm currently ${activity}.${memory}`;
    case 'guard': return `Keep the roads clear, traveler. I'm ${npc.name}, and I'm ${activity}.${memory}`;
    case 'innkeeper': return `Welcome. I'm ${npc.name}, keeper of ${npc.workplace.label}. I'm currently ${activity}.${memory}`;
    case 'artisan': return `I'm ${npc.name}. My workshop keeps me busy; right now I'm ${activity}.${memory}`;
    case 'farmer': return `I'm ${npc.name}. The settlement depends on our harvest. I'm currently ${activity}.${memory}`;
    case 'laborer': return `Name's ${npc.name}. There's always work to do; right now I'm ${activity}.${memory}`;
  }
}

export function npcDialogueResponse(npc: WorldNpc, choice: NpcConversationChoice['id']): string {
  const activity = npc.currentActivity.replace('-', ' ');
  if (choice === 'work') {
    if (npc.currentActivity === 'sleep') return `I was trying to get some rest before tomorrow's work at ${npc.workplace.label}.`;
    if (npc.currentActivity === 'tavern') return `I'm off duty for the evening. Even ${npc.occupation}s need time to unwind.`;
    if (npc.currentActivity === 'market' || npc.currentActivity === 'lunch') return `I'm taking a short break at ${npc.market.label}, then it's back to work.`;
    return `Right now I'm ${activity}. My usual work is at ${npc.workplace.label}.`;
  }
  if (choice === 'town') {
    if (npc.occupation === 'guard') return `Keep to the roads after dark. ${npc.market.label} is the busiest place, so that's where I patrol most often.`;
    if (npc.occupation === 'innkeeper') return `${npc.tavern.label} is where news arrives first. The market is best during daylight.`;
    if (npc.occupation === 'merchant') return `${npc.market.label} keeps the settlement alive. Farmers and artisans bring their goods there every day.`;
    return `I know the route between ${npc.home.label}, ${npc.workplace.label}, and ${npc.market.label} better than anywhere else.`;
  }
  if (choice === 'family') {
    const relatives = npc.familyMemberNames ?? [];
    if (relatives.length === 0) return `I live at ${npc.home.label}. It is a quiet household, but it is home.`;
    const names = relatives.length === 1
      ? relatives[0]
      : `${relatives.slice(0, -1).join(', ')} and ${relatives.at(-1)}`;
    return `${names} share ${npc.home.label} with me. We try to meet there for breakfast before our schedules pull us across town.`;
  }
  if (choice === 'help') {
    const relationship = npc.relationships.player ?? 0;
    if (relationship >= 8) return `You've been kind to me. For now, keep an eye on the roads near ${npc.workplace.label}. I'll remember it.`;
    return `Talk with me when you pass through town. Familiar faces make a place feel safer.`;
  }
  return `Safe travels. I'll get back to ${activity}.`;
}

export function routineDestination(
  npc: WorldNpc,
  scheduledDestination: NpcLocation,
  routineStep: number,
): NpcLocation {
  if (npc.currentActivity === 'patrol') {
    return [npc.market, npc.workplace, npc.tavern, npc.home][routineStep % 4]!;
  }
  if (npc.currentActivity === 'leisure') {
    return [npc.market, npc.tavern, npc.home][routineStep % 3]!;
  }
  if (['work', 'market', 'lunch', 'tavern'].includes(npc.currentActivity) && routineStep % 3 !== 0) {
    let hash = 2166136261;
    for (let index = 0; index < npc.id.length; index++) {
      hash ^= npc.id.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    const angle = ((hash >>> 0) % 360) * Math.PI / 180 + routineStep * 2.399963229728653;
    const radius = 4 + (hash >>> 8) % 5;
    return {
      ...scheduledDestination,
      x: scheduledDestination.x + Math.cos(angle) * radius,
      z: scheduledDestination.z + Math.sin(angle) * radius,
      label: `${scheduledDestination.label} vicinity`,
    };
  }
  return scheduledDestination;
}

export function npcActivityRoams(activity: WorldNpc['currentActivity']): boolean {
  return ['work', 'market', 'lunch', 'tavern', 'patrol', 'leisure'].includes(activity);
}

export function nextNpcRoadStep(
  currentX: number,
  currentZ: number,
  directionX: number,
  directionZ: number,
  speed: number,
  deltaSeconds: number,
): readonly [number, number] {
  const directionLength = Math.hypot(directionX, directionZ);
  if (directionLength <= 1e-6 || speed <= 0 || deltaSeconds <= 0) return [currentX, currentZ];
  const distance = speed * Math.min(0.25, deltaSeconds);
  return [
    currentX + directionX / directionLength * distance,
    currentZ + directionZ / directionLength * distance,
  ];
}

export function prioritizeWalkNpcs(
  records: Record<string, WorldNpc>,
  activeSettlementId: string | null,
  anchorX: number,
  anchorZ: number,
  limit: number,
): WorldNpc[] {
  return Object.values(records)
    .filter((npc) => npc.settlementId === activeSettlementId
      || Math.hypot(npc.position.x - anchorX, npc.position.z - anchorZ) <= 420)
    .sort((left, right) => {
      const leftLocal = left.settlementId === activeSettlementId ? 0 : 1;
      const rightLocal = right.settlementId === activeSettlementId ? 0 : 1;
      if (leftLocal !== rightLocal) return leftLocal - rightLocal;
      return Math.hypot(left.position.x - anchorX, left.position.z - anchorZ)
        - Math.hypot(right.position.x - anchorX, right.position.z - anchorZ);
    })
    .slice(0, limit);
}

export class PersistentWalkNpcManager {
  private readonly runtime: RuntimeNpc[] = [];
  private readonly routePlansPerUpdate: number;
  private lastHighlightAt = 0;
  private lastMovementUpdateAt = performance.now();

  constructor(
    private readonly noa: Engine,
    private readonly frame: PlanetLocalFrame,
    private readonly terrain: PlanetTerrainSampler,
    records: Record<string, WorldNpc>,
    anchorX: number,
    anchorZ: number,
    private readonly hourProvider: () => number,
    performanceMode: boolean,
  ) {
    this.routePlansPerUpdate = performanceMode ? 1 : 2;
    const anchorSurface = terrain.sampleSurface(anchorX, anchorZ);
    const activeSettlementId = anchorSurface.isCity ? anchorSurface.featureId : null;
    const nearby = prioritizeWalkNpcs(records, activeSettlementId, anchorX, anchorZ, performanceMode ? 18 : 40);
    for (const [index, record] of nearby.entries()) {
      const scheduledDistance = Math.hypot(record.position.x - anchorX, record.position.z - anchorZ);
      const streamNearAnchor = record.settlementId === activeSettlementId && scheduledDistance > 64;
      const angle = index * 2.399963229728653;
      const radius = 10 + index % 4 * 5;
      const spawnX = streamNearAnchor ? anchorX + Math.cos(angle) * radius : record.position.x;
      const spawnZ = streamNearAnchor ? anchorZ + Math.sin(angle) * radius : record.position.z;
      const safe = safeNpcSpawnNode(terrain, spawnX, spawnZ);
      const mesh = makeCharacterMesh(noa, record, index);
      const entityId = noa.ents.add(
        [safe.x - frame.originX, safe.y, safe.z - frame.originZ],
        0.62,
        1.8,
        mesh,
        [0, 0, 0],
        true,
        false,
      );
      // Citizens are kinematic road agents. Player-edited obstacles are checked
      // before each step, while deterministic separation prevents crowd overlap.
      // This avoids NOA's movement system putting autonomous physics bodies to
      // sleep or fighting their schedule controller.
      const body = noa.ents.getPhysicsBody(entityId);
      if (body) {
        body.gravityMultiplier = 0;
        body.velocity[0] = 0;
        body.velocity[1] = 0;
        body.velocity[2] = 0;
      }
      this.runtime.push({
        // Zustand/Immer freezes persisted world records. Runtime simulation is
        // intentionally mutable, so clone every nested collection it changes.
        record: {
          ...record,
          home: { ...record.home },
          workplace: { ...record.workplace },
          market: { ...record.market },
          tavern: { ...record.tavern },
          position: { ...record.position },
          schedule: record.schedule.map((entry) => ({ ...entry })),
          relationships: { ...record.relationships },
          memories: [...record.memories],
          familyIds: record.familyIds ? [...record.familyIds] : undefined,
          familyMemberNames: record.familyMemberNames ? [...record.familyMemberNames] : undefined,
        },
        entityId,
        mesh,
        route: [],
        routeIndex: 0,
        destinationKey: '',
        nextScheduleCheck: performance.now() + index * (performanceMode ? 240 : 120),
        nextRepathAt: 0,
        stoppedForConversation: false,
        // Spread terrain probes across frames. Starting every citizen at zero
        // made dense settlements perform all grounding work in one hitch.
        nextGroundingCheck: performance.now() + index * (performanceMode ? 70 : 35),
        terrainReady: true,
        dwellUntil: 0,
        routineStep: index % 4,
        lastProgressAt: 0,
        lastProgressDistance: Number.POSITIVE_INFINITY,
      });
    }
  }

  get count(): number { return this.runtime.length; }

  update(now = performance.now()): void {
    const wallNow = Date.now();
    const deltaSeconds = Math.max(1 / 120, Math.min(0.25, (now - this.lastMovementUpdateAt) / 1_000));
    this.lastMovementUpdateAt = now;
    let routePlansRemaining = this.routePlansPerUpdate;
    // Crowd avoidance used to query every other ECS entity for every NPC
    // (O(n²), up to 1,600 position reads per update). A tiny spatial grid keeps
    // the same local separation behaviour while only considering close cells.
    const positions = new Map<number, readonly number[]>();
    const neighborGrid = new Map<string, RuntimeNpc[]>();
    for (const candidate of this.runtime) {
      const position = this.noa.ents.getPosition(candidate.entityId);
      if (!position) continue;
      positions.set(candidate.entityId, position);
      const cellX = Math.floor(position[0]! / NPC_NEIGHBOR_CELL_SIZE);
      const cellZ = Math.floor(position[2]! / NPC_NEIGHBOR_CELL_SIZE);
      const key = `${cellX},${cellZ}`;
      const cell = neighborGrid.get(key) ?? [];
      cell.push(candidate);
      neighborGrid.set(key, cell);
    }
    for (const npc of this.runtime) {
      const local = positions.get(npc.entityId);
      if (!local) continue;
      const current: NpcLocation = {
        x: this.frame.originX + local[0]!, y: local[1]!, z: this.frame.originZ + local[2]!, label: 'current position',
      };
      if (now >= npc.nextScheduleCheck) {
        const entry = scheduleEntryAt(npc.record, this.hourProvider());
        const activityChanged = npc.record.currentActivity !== entry.activity;
        npc.record.currentActivity = entry.activity;
        if (activityChanged) {
          npc.routineStep = 0;
          npc.dwellUntil = 0;
        }
        const destination = routineDestination(npc.record, destinationFor(npc.record, entry), npc.routineStep);
        const key = positionKey(destination);
        if (key !== npc.destinationKey || (npc.route.length === 0 && now >= npc.dwellUntil)) {
          if (routePlansRemaining <= 0) {
            npc.nextScheduleCheck = now + 100;
            continue;
          }
          routePlansRemaining--;
          npc.route = findNpcRoutineRoute(this.terrain, current, destination, npc.routineStep);
          npc.routeIndex = 0;
          npc.destinationKey = key;
          npc.lastProgressAt = now;
          npc.lastProgressDistance = Number.POSITIVE_INFINITY;
        }
        npc.nextScheduleCheck = now + 2_000;
      }
      const body = this.noa.ents.getPhysicsBody(npc.entityId);
      if (!body) continue;
      if (now >= npc.nextGroundingCheck) {
        this.correctEmbeddedNpc(npc, local);
        npc.nextGroundingCheck = now + 700;
      }
      if (npc.stoppedForConversation) {
        body.velocity[0] = 0;
        body.velocity[2] = 0;
        continue;
      }
      if (npc.routeIndex >= npc.route.length) {
        body.velocity[0] = 0;
        body.velocity[2] = 0;
        if (npc.dwellUntil === 0) {
          const dwellSeed = npc.record.id.length * 379 + npc.routineStep * 997;
          npc.dwellUntil = now + 2_500 + dwellSeed % 4_500;
          if (['market', 'lunch', 'tavern', 'leisure'].includes(npc.record.currentActivity)) {
            this.socializeNearby(npc, local);
          }
        } else if (now >= npc.dwellUntil && npcActivityRoams(npc.record.currentActivity)) {
          npc.routineStep++;
          npc.destinationKey = '';
          npc.dwellUntil = 0;
          npc.nextScheduleCheck = 0;
        }
        continue;
      }
      const target = npc.route[npc.routeIndex]!;
      const dx = target.x - current.x;
      const dz = target.z - current.z;
      const distance = Math.hypot(dx, dz);
      if (distance < 0.35) {
        npc.routeIndex++;
        npc.lastProgressDistance = Number.POSITIVE_INFINITY;
        continue;
      }
      if (now >= npc.nextRepathAt && Math.abs(target.y - current.y) > 1.5) {
        npc.route = findNpcRoutineRoute(
          this.terrain,
          current,
          destinationFor(npc.record, scheduleEntryAt(npc.record, this.hourProvider())),
          npc.routineStep,
        );
        npc.routeIndex = 0;
        npc.nextRepathAt = now + 2_000;
        continue;
      }
      if (distance + 0.01 < npc.lastProgressDistance) {
        npc.lastProgressDistance = distance;
        npc.lastProgressAt = now;
      } else if (now - npc.lastProgressAt > 2_500) {
        const entry = scheduleEntryAt(npc.record, this.hourProvider());
        const destination = routineDestination(npc.record, destinationFor(npc.record, entry), npc.routineStep);
        npc.route = findNpcRoutineRoute(this.terrain, current, destination, npc.routineStep);
        npc.routeIndex = Math.min(1, Math.max(0, npc.route.length - 1));
        npc.lastProgressAt = now;
        npc.lastProgressDistance = Number.POSITIVE_INFINITY;
        continue;
      }
      const speed = npc.record.currentActivity === 'patrol' ? 1.35 : 1.05;
      let steerX = dx / distance;
      let steerZ = dz / distance;
      const cellX = Math.floor(local[0]! / NPC_NEIGHBOR_CELL_SIZE);
      const cellZ = Math.floor(local[2]! / NPC_NEIGHBOR_CELL_SIZE);
      for (let offsetZ = -1; offsetZ <= 1; offsetZ++) {
        for (let offsetX = -1; offsetX <= 1; offsetX++) {
          const neighbors = neighborGrid.get(`${cellX + offsetX},${cellZ + offsetZ}`) ?? [];
          for (const neighbor of neighbors) {
            if (neighbor === npc) continue;
            const neighborPosition = positions.get(neighbor.entityId);
            if (!neighborPosition) continue;
            const awayX = local[0]! - neighborPosition[0]!;
            const awayZ = local[2]! - neighborPosition[2]!;
            const separation = Math.hypot(awayX, awayZ);
            if (separation <= 0.001 || separation >= 0.9) continue;
            const strength = (0.9 - separation) / 0.9 * 0.7;
            steerX += awayX / separation * strength;
            steerZ += awayZ / separation * strength;
          }
        }
      }
      const [nextX, nextZ] = nextNpcRoadStep(current.x, current.z, steerX, steerZ, speed, deltaSeconds);
      const nextLocalX = nextX - this.frame.originX;
      const nextLocalZ = nextZ - this.frame.originZ;
      const nextSurface = this.terrain.sampleSurface(Math.floor(nextX), Math.floor(nextZ));
      const nextFeetY = nextSurface.elevation + 1;
      const feetBlock = this.noa.getBlock(Math.floor(nextLocalX), nextFeetY, Math.floor(nextLocalZ));
      const headBlock = this.noa.getBlock(Math.floor(nextLocalX), nextFeetY + 1, Math.floor(nextLocalZ));
      if ((feetBlock !== BLOCK_AIR && BLOCK_BY_ID.get(feetBlock)?.solid)
        || (headBlock !== BLOCK_AIR && BLOCK_BY_ID.get(headBlock)?.solid)) {
        const reconnectIndex = Math.min(npc.route.length - 1, npc.routeIndex + 8);
        const reconnect = npc.route[reconnectIndex]!;
        const detour = this.findLiveVoxelDetour(current, reconnect);
        if (detour.length > 1) {
          npc.route = [...detour, ...npc.route.slice(reconnectIndex + 1)];
          npc.routeIndex = 1;
          npc.nextRepathAt = now + 500;
          npc.lastProgressAt = now;
          npc.lastProgressDistance = Number.POSITIVE_INFINITY;
        } else {
          npc.nextRepathAt = now + 1_000;
          npc.nextScheduleCheck = now + 250;
          npc.destinationKey = '';
          npc.route = [];
        }
        body.velocity[0] = 0;
        body.velocity[2] = 0;
        continue;
      }
      body.velocity[0] = 0;
      body.velocity[1] = 0;
      body.velocity[2] = 0;
      body.gravityMultiplier = 0;
      this.noa.ents.setPosition(npc.entityId, [nextLocalX, nextFeetY, nextLocalZ]);
      npc.mesh.rotation.y = Math.atan2(steerX, steerZ);
      npc.record.position = { x: nextX, y: nextFeetY, z: nextZ, label: npc.record.position.label };
      npc.record.updatedAt = wallNow;
      npc.record.lastSimulatedAt = wallNow;
    }
    if (now - this.lastHighlightAt >= 100) {
      this.updateCrosshairHighlight();
      this.lastHighlightAt = now;
    }
  }

  private findLiveVoxelDetour(
    start: RouteNode | NpcLocation,
    destination: RouteNode | NpcLocation,
  ): RouteNode[] {
    return findNpcObstacleDetour(start, destination, (globalX, globalZ, previousY) => {
      const sample = this.terrain.sampleSurface(globalX, globalZ);
      if (sample.waterLevel !== null && sample.waterLevel >= sample.elevation + 1) return null;
      const feetY = sample.elevation + 1;
      if (Math.abs(feetY - previousY) > 1.05) return null;
      const localX = globalX - this.frame.originX;
      const localZ = globalZ - this.frame.originZ;
      const feetBlock = this.noa.getBlock(localX, feetY, localZ);
      const headBlock = this.noa.getBlock(localX, feetY + 1, localZ);
      const feetSolid = feetBlock !== BLOCK_AIR && (BLOCK_BY_ID.get(feetBlock)?.solid ?? true);
      const headSolid = headBlock !== BLOCK_AIR && (BLOCK_BY_ID.get(headBlock)?.solid ?? true);
      return feetSolid || headSolid ? null : feetY;
    });
  }

  private correctEmbeddedNpc(npc: RuntimeNpc, local: readonly number[]): void {
    const bx = Math.floor(local[0]!);
    const bz = Math.floor(local[2]!);
    const globalX = this.frame.originX + bx;
    const globalZ = this.frame.originZ + bz;
    const surface = this.terrain.sampleSurface(globalX, globalZ);
    const expectedFeetY = surface.elevation + 1;
    const body = this.noa.ents.getPhysicsBody(npc.entityId);
    if (body) {
      body.gravityMultiplier = 0;
      body.velocity[1] = 0;
    }
    if (Math.abs(local[1]! - expectedFeetY) <= 0.05) return;
    this.noa.ents.setPosition(npc.entityId, [local[0]!, expectedFeetY, local[2]!]);
  }

  private socializeNearby(npc: RuntimeNpc, local: readonly number[]): void {
    let neighbor: RuntimeNpc | null = null;
    let neighborDistance = 2.4;
    for (const candidate of this.runtime) {
      if (candidate === npc || candidate.stoppedForConversation) continue;
      const candidatePosition = this.noa.ents.getPosition(candidate.entityId);
      if (!candidatePosition) continue;
      const distance = Math.hypot(
        candidatePosition[0]! - local[0]!,
        candidatePosition[2]! - local[2]!,
      );
      if (distance < neighborDistance) {
        neighbor = candidate;
        neighborDistance = distance;
      }
    }
    if (!neighbor) return;
    const neighborPosition = this.noa.ents.getPosition(neighbor.entityId);
    if (!neighborPosition) return;
    npc.mesh.rotation.y = Math.atan2(neighborPosition[0]! - local[0]!, neighborPosition[2]! - local[2]!);
    neighbor.mesh.rotation.y = Math.atan2(local[0]! - neighborPosition[0]!, local[2]! - neighborPosition[2]!);
    npc.record.relationships[neighbor.record.id] = Math.min(100, (npc.record.relationships[neighbor.record.id] ?? 0) + 1);
    neighbor.record.relationships[npc.record.id] = Math.min(100, (neighbor.record.relationships[npc.record.id] ?? 0) + 1);
    const memory = `talking with ${neighbor.record.name} near ${npc.record.position.label}`;
    if (!npc.record.memories.includes(memory)) npc.record.memories.push(memory);
    npc.record.memories = npc.record.memories.slice(-12);
  }

  private targetedNpc(): RuntimeNpc | null {
    const origin = this.noa.camera.getPosition() as number[];
    const direction = this.noa.camera.getDirection() as number[];
    const terrainHit = this.noa.pick(origin, direction, 4.5, (blockId) => blockId !== BLOCK_AIR);
    const terrainDistance = terrainHit
      ? Math.hypot(
        terrainHit.position[0] - origin[0]!,
        terrainHit.position[1] - origin[1]!,
        terrainHit.position[2] - origin[2]!,
      )
      : 4.5;
    let nearest: RuntimeNpc | null = null;
    let nearestDistance = terrainDistance;
    for (const npc of this.runtime) {
      const position = this.noa.ents.getPosition(npc.entityId);
      if (!position) continue;
      const distance = rayNpcDistance(origin, direction, position, 4.5);
      if (distance !== null && distance < nearestDistance) {
        nearest = npc;
        nearestDistance = distance;
      }
    }
    return nearest;
  }

  private updateCrosshairHighlight(): void {
    const targeted = this.targetedNpc();
    for (const npc of this.runtime) {
      const active = npc === targeted;
      npc.mesh.renderOutline = active;
      npc.mesh.outlineColor = new Color3(1, 0.82, 0.28);
      npc.mesh.outlineWidth = 0.035;
    }
  }

  interact(playerLocalPosition: readonly number[]): NpcConversationBubble | null {
    let nearest: RuntimeNpc | null = null;
    let nearestDistance = 4.25;
    for (const npc of this.runtime) {
      const position = this.noa.ents.getPosition(npc.entityId);
      if (!position) continue;
      const distance = Math.hypot(
        position[0]! - playerLocalPosition[0]!,
        position[1]! - playerLocalPosition[1]!,
        position[2]! - playerLocalPosition[2]!,
      );
      if (distance < nearestDistance) { nearest = npc; nearestDistance = distance; }
    }
    return nearest ? this.beginConversation(nearest, playerLocalPosition) : null;
  }

  interactTargeted(): NpcConversationBubble | null {
    const targeted = this.targetedNpc();
    return targeted ? this.beginConversation(targeted, this.noa.ents.getPosition(this.noa.playerEntity)) : null;
  }

  continueConversation(npcId: string): NpcConversationBubble | null {
    const npc = this.runtime.find((candidate) => candidate.record.id === npcId);
    return npc ? this.beginConversation(npc, this.noa.ents.getPosition(this.noa.playerEntity)) : null;
  }

  respond(npcId: string, choice: NpcConversationChoice['id']): NpcConversationBubble | null {
    const npc = this.runtime.find((candidate) => candidate.record.id === npcId);
    if (!npc) return null;
    if (choice === 'goodbye') {
      npc.stoppedForConversation = false;
      npc.record.memories.push(`the traveler said goodbye while I was ${npc.record.currentActivity}`);
      npc.record.memories = npc.record.memories.slice(-12);
      npc.record.updatedAt = Date.now();
      return null;
    }
    const relationshipGain = choice === 'help' ? 2 : 1;
    npc.record.relationships.player = Math.min(100, (npc.record.relationships.player ?? 0) + relationshipGain);
    if (choice === 'help' && !npc.record.memories.includes('the traveler offered to help')) {
      npc.record.memories.push('the traveler offered to help');
    }
    npc.record.memories = npc.record.memories.slice(-12);
    npc.record.updatedAt = Date.now();
    return this.conversationBubble(npc, npcDialogueResponse(npc.record, choice));
  }

  private beginConversation(nearest: RuntimeNpc, playerLocalPosition: readonly number[]): NpcConversationBubble {
    nearest.stoppedForConversation = true;
    nearest.record.relationships.player = Math.min(100, (nearest.record.relationships.player ?? 0) + 1);
    if (!nearest.record.memories.includes('meeting the traveler')) nearest.record.memories.push('meeting the traveler');
    nearest.record.memories = nearest.record.memories.slice(-12);
    nearest.record.conversationStage++;
    nearest.record.updatedAt = Date.now();
    const npcPosition = this.noa.ents.getPosition(nearest.entityId);
    if (npcPosition) {
      nearest.mesh.rotation.y = Math.atan2(
        playerLocalPosition[0]! - npcPosition[0]!,
        playerLocalPosition[2]! - npcPosition[2]!,
      );
    }
    return this.conversationBubble(nearest, npcDialogueText(nearest.record));
  }

  private conversationBubble(npc: RuntimeNpc, text: string): NpcConversationBubble {
    return {
      npcId: npc.record.id,
      npcName: npc.record.name,
      occupation: npc.record.occupation,
      activity: npc.record.currentActivity,
      relationship: npc.record.relationships.player ?? 0,
      text,
      choices: CONVERSATION_CHOICES,
    };
  }

  closeConversation(npcId: string): void {
    const npc = this.runtime.find((candidate) => candidate.record.id === npcId);
    if (npc) npc.stoppedForConversation = false;
  }

  snapshot(): Record<string, WorldNpc> {
    const result: Record<string, WorldNpc> = {};
    for (const npc of this.runtime) {
      const local = this.noa.ents.getPosition(npc.entityId);
      if (local) {
        npc.record.position = {
          x: this.frame.originX + local[0]!, y: local[1]!, z: this.frame.originZ + local[2]!, label: npc.record.position.label,
        };
      }
      result[npc.record.id] = { ...npc.record, position: { ...npc.record.position } };
    }
    return result;
  }

  dispose(): void {
    // The enclosing NOA engine is torn down immediately after this manager. Dispose
    // Babylon resources here; NOA owns the short-lived ECS entity records.
    for (const npc of this.runtime) npc.mesh.dispose(false, true);
    this.runtime.length = 0;
  }
}

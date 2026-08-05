import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Matrix } from '@babylonjs/core/Maths/math.vector';
import '@babylonjs/core/Rendering/outlineRenderer';
import type { Engine } from 'noa-engine';
import type { NpcLocation, WorldNpc } from '@/entities/types';
import type { PlanetLocalFrame } from '@/planet/spatial/PlanetGrid';
import { isSettlementRoadBlock, PlanetTerrainSampler } from '@/planet/terrain/PlanetTerrainSampler';
import { destinationFor, scheduleEntryAt } from '@/npc/NpcPopulation';
import { BLOCK_AIR, BLOCK_BY_ID } from './blockRegistry';

export interface NpcConversationBubble {
  npcId: string;
  npcName: string;
  occupation: string;
  text: string;
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
}

const CLOTHING = ['#2563eb', '#dc2626', '#059669', '#d97706', '#7c3aed', '#0891b2'];

function positionKey(location: NpcLocation): string {
  return `${Math.round(location.x)},${Math.round(location.z)}`;
}

function closestRoadNode(terrain: PlanetTerrainSampler, x: number, z: number, radius = 14): RouteNode | null {
  for (let ring = 0; ring <= radius; ring++) {
    for (let dz = -ring; dz <= ring; dz++) {
      for (let dx = -ring; dx <= ring; dx++) {
        if (ring > 0 && Math.abs(dx) !== ring && Math.abs(dz) !== ring) continue;
        const bx = Math.round(x + dx);
        const bz = Math.round(z + dz);
        const surface = terrain.sampleSurface(bx, bz);
        if (!surface.isCity) continue;
        if (!isSettlementRoadBlock(terrain.blockAt(bx, surface.elevation, bz, surface))) continue;
        if (terrain.blockAt(bx, surface.elevation + 1, bz, surface) !== 0) continue;
        return { x: bx + 0.5, y: surface.elevation + 1, z: bz + 0.5 };
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

export function findNpcRoadRoute(
  terrain: PlanetTerrainSampler,
  start: NpcLocation,
  destination: NpcLocation,
  maxVisited = 20_000,
): RouteNode[] {
  const startNode = closestRoadNode(terrain, start.x, start.z);
  const endNode = closestRoadNode(terrain, destination.x, destination.z);
  if (!startNode || !endNode) return [];
  const startX = Math.floor(startNode.x), startZ = Math.floor(startNode.z);
  const endX = Math.floor(endNode.x), endZ = Math.floor(endNode.z);
  const queue: Array<{ x: number; z: number; score: number }> = [{
    x: startX,
    z: startZ,
    score: Math.abs(endX - startX) + Math.abs(endZ - startZ),
  }];
  const cameFrom = new Map<string, string | null>([[routeKey(startX, startZ), null]]);
  const routeCost = new Map<string, number>([[routeKey(startX, startZ), 0]]);
  const settled = new Set<string>();
  while (queue.length > 0 && settled.size < maxVisited) {
    // A* keeps searches focused toward the scheduled destination instead of
    // flooding every avenue in a large settlement.
    let bestIndex = 0;
    for (let index = 1; index < queue.length; index++) {
      if (queue[index]!.score < queue[bestIndex]!.score) bestIndex = index;
    }
    const current = queue.splice(bestIndex, 1)[0]!;
    const currentKey = routeKey(current.x, current.z);
    if (settled.has(currentKey)) continue;
    settled.add(currentKey);
    if (current.x === endX && current.z === endZ) break;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const x = current.x + dx;
      const z = current.z + dz;
      const key = routeKey(x, z);
      const surface = terrain.sampleSurface(x, z);
      if (!surface.isCity || !isSettlementRoadBlock(terrain.blockAt(x, surface.elevation, z, surface))) continue;
      if (terrain.blockAt(x, surface.elevation + 1, z, surface) !== 0) continue;
      const nextCost = (routeCost.get(currentKey) ?? 0) + 1;
      if (nextCost >= (routeCost.get(key) ?? Number.POSITIVE_INFINITY)) continue;
      routeCost.set(key, nextCost);
      cameFrom.set(key, routeKey(current.x, current.z));
      queue.push({ x, z, score: nextCost + Math.abs(endX - x) + Math.abs(endZ - z) });
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

export class PersistentWalkNpcManager {
  private readonly runtime: RuntimeNpc[] = [];

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
    const nearby = Object.values(records)
      .filter((npc) => Math.hypot(npc.position.x - anchorX, npc.position.z - anchorZ) <= 260)
      .sort((a, b) => Math.hypot(a.position.x - anchorX, a.position.z - anchorZ) - Math.hypot(b.position.x - anchorX, b.position.z - anchorZ))
      .slice(0, performanceMode ? 10 : 28);
    for (const [index, record] of nearby.entries()) {
      const safe = safeNpcSpawnNode(terrain, record.position.x, record.position.z);
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
      noa.ents.addComponentAgain(entityId, noa.ents.names.collideTerrain, null);
      noa.ents.addComponentAgain(entityId, noa.ents.names.collideEntities, null);
      const body = noa.ents.getPhysicsBody(entityId);
      if (body) {
        body.gravityMultiplier = 1;
        body.autoStep = true;
        body.friction = 2;
      }
      this.runtime.push({
        record: { ...record, position: { ...record.position } },
        entityId,
        mesh,
        route: [],
        routeIndex: 0,
        destinationKey: '',
        nextScheduleCheck: 0,
        nextRepathAt: 0,
        stoppedForConversation: false,
        nextGroundingCheck: 0,
      });
    }
  }

  get count(): number { return this.runtime.length; }

  update(): void {
    const now = performance.now();
    for (const npc of this.runtime) {
      const local = this.noa.ents.getPosition(npc.entityId);
      if (!local) continue;
      const current: NpcLocation = {
        x: this.frame.originX + local[0]!, y: local[1]!, z: this.frame.originZ + local[2]!, label: 'current position',
      };
      if (now >= npc.nextScheduleCheck) {
        const entry = scheduleEntryAt(npc.record, this.hourProvider());
        npc.record.currentActivity = entry.activity;
        const destination = destinationFor(npc.record, entry);
        const key = positionKey(destination);
        if (key !== npc.destinationKey || npc.route.length === 0) {
          npc.route = findNpcRoadRoute(this.terrain, current, destination);
          npc.routeIndex = 0;
          npc.destinationKey = key;
        }
        npc.nextScheduleCheck = now + 1_000;
      }
      const body = this.noa.ents.getPhysicsBody(npc.entityId);
      if (!body) continue;
      if (now >= npc.nextGroundingCheck) {
        this.correctEmbeddedNpc(npc, local);
        npc.nextGroundingCheck = now + 350;
      }
      if (npc.stoppedForConversation || npc.routeIndex >= npc.route.length) {
        body.velocity[0] = 0;
        body.velocity[2] = 0;
        continue;
      }
      const target = npc.route[npc.routeIndex]!;
      const dx = target.x - current.x;
      const dz = target.z - current.z;
      const distance = Math.hypot(dx, dz);
      if (distance < 0.35) {
        npc.routeIndex++;
        continue;
      }
      if (now >= npc.nextRepathAt && Math.abs(target.y - current.y) > 1.5) {
        npc.route = findNpcRoadRoute(this.terrain, current, destinationFor(npc.record, scheduleEntryAt(npc.record, this.hourProvider())));
        npc.routeIndex = 0;
        npc.nextRepathAt = now + 2_000;
        continue;
      }
      const speed = npc.record.currentActivity === 'patrol' ? 1.35 : 1.05;
      body.velocity[0] = dx / distance * speed;
      body.velocity[2] = dz / distance * speed;
      // Direct velocity changes do not wake sleeping voxel-physics bodies.
      body.applyForce([0, 0, 0]);
      npc.mesh.rotation.y = Math.atan2(dx, dz);
      npc.record.position = { ...current, label: npc.record.position.label };
      npc.record.updatedAt = Date.now();
      npc.record.lastSimulatedAt = Date.now();
    }
    this.updateCrosshairHighlight();
  }

  private correctEmbeddedNpc(npc: RuntimeNpc, local: readonly number[]): void {
    const bx = Math.floor(local[0]!);
    const bz = Math.floor(local[2]!);
    let feetY = local[1]!;
    let checks = 0;
    while (checks++ < 8) {
      const blockId = this.noa.getBlock(bx, Math.floor(feetY + 0.04), bz);
      if (blockId === BLOCK_AIR || !BLOCK_BY_ID.get(blockId)?.solid) break;
      feetY = Math.floor(feetY + 0.04) + 1.001;
    }
    if (feetY <= local[1]! + 0.02) return;
    this.noa.ents.setPosition(npc.entityId, [local[0]!, feetY, local[2]!]);
    const body = this.noa.ents.getPhysicsBody(npc.entityId);
    if (body) body.velocity[1] = 0;
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
    return nearest ? this.beginConversation(nearest) : null;
  }

  interactTargeted(): NpcConversationBubble | null {
    const targeted = this.targetedNpc();
    return targeted ? this.beginConversation(targeted) : null;
  }

  private beginConversation(nearest: RuntimeNpc): NpcConversationBubble {
    nearest.stoppedForConversation = true;
    nearest.record.relationships.player = Math.min(100, (nearest.record.relationships.player ?? 0) + 1);
    if (!nearest.record.memories.includes('meeting the traveler')) nearest.record.memories.push('meeting the traveler');
    nearest.record.conversationStage++;
    nearest.record.updatedAt = Date.now();
    return {
      npcId: nearest.record.id,
      npcName: nearest.record.name,
      occupation: nearest.record.occupation,
      text: npcDialogueText(nearest.record),
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

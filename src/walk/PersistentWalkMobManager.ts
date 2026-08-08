import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Matrix } from '@babylonjs/core/Maths/math.vector';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { Engine } from 'noa-engine';
import type { MobSpecies, WorldMob } from '@/entities/types';
import type { PlanetLocalFrame } from '@/planet/spatial/PlanetGrid';
import { PlanetTerrainSampler } from '@/planet/terrain/PlanetTerrainSampler';

interface RuntimeMob {
  record: WorldMob;
  entityId: number;
  mesh: Mesh;
  targetX: number;
  targetZ: number;
  nextDecisionAt: number;
}

const MOB_COLORS: Record<MobSpecies, string> = {
  pig: '#e9a3a8', cow: '#7c5138', sheep: '#e5e7eb', chicken: '#f8fafc',
  deer: '#9a6a43', rabbit: '#a89f91', horse: '#754c2f', fox: '#d86422', goat: '#b8b0a0',
};

const MOB_HEALTH: Record<MobSpecies, number> = {
  chicken: 4, rabbit: 4, fox: 8, pig: 10, sheep: 10, goat: 12, deer: 14, cow: 16, horse: 20,
};

function speciesForHabitat(seed: number, x: number, z: number, biome: string): MobSpecies {
  const selector = hash(seed + 991, x, z);
  if (biome === 'snowy-tundra') return (['sheep', 'goat', 'rabbit'] as const)[selector % 3]!;
  if (biome === 'forest-canopy') return (['deer', 'fox', 'rabbit', 'pig'] as const)[selector % 4]!;
  if (biome === 'mountain-slate') return (['goat', 'sheep', 'deer'] as const)[selector % 3]!;
  if (biome === 'desert-dunes') return (['horse', 'rabbit'] as const)[selector % 2]!;
  return (['pig', 'cow', 'sheep', 'chicken', 'deer', 'rabbit', 'horse'] as const)[selector % 7]!;
}

function hash(seed: number, x: number, z: number): number {
  let value = seed ^ Math.imul(x, 73_856_093) ^ Math.imul(z, 19_349_663);
  value = Math.imul(value ^ value >>> 13, 1_274_126_177);
  return (value ^ value >>> 16) >>> 0;
}

export function ensureBasicMobs(
  records: Record<string, WorldMob>,
  terrain: PlanetTerrainSampler,
  seed: number,
  anchorX: number,
  anchorZ: number,
  limit: number,
  now = Date.now(),
): Record<string, WorldMob> {
  const result = { ...records };
  const nearby = Object.values(result).filter((mob) => Math.hypot(mob.position.x - anchorX, mob.position.z - anchorZ) < 180);
  if (nearby.length >= limit) return result;
  for (let index = 0; index < 48 && nearby.length < limit; index++) {
    const selector = hash(seed + index * 17, Math.floor(anchorX / 24), Math.floor(anchorZ / 24));
    const x = Math.round(anchorX + (selector % 121) - 60);
    const z = Math.round(anchorZ + (Math.floor(selector / 127) % 121) - 60);
    const spawnX = x + 0.5;
    const spawnZ = z + 0.5;
    const surface = terrain.sampleSurface(spawnX, spawnZ);
    if (surface.waterLevel !== null || surface.isCity) continue;
    const species = speciesForHabitat(seed, x, z, surface.biome);
    const id = `mob:${species}:${Math.floor(x / 12)}:${Math.floor(z / 12)}`;
    if (result[id]) continue;
    const location = { x: spawnX, y: surface.elevation + 1, z: spawnZ, label: 'natural habitat' };
    const mob: WorldMob = {
      id, species, position: { ...location }, home: { ...location }, health: MOB_HEALTH[species],
      behavior: 'idle', createdAt: now, updatedAt: now,
    };
    result[id] = mob;
    nearby.push(mob);
  }
  return result;
}

function makeMobMesh(noa: Engine, mob: WorldMob): Mesh {
  const scene = noa.rendering.getScene();
  const material = new StandardMaterial(`${mob.id}-material`, scene);
  material.diffuseColor = Color3.FromHexString(MOB_COLORS[mob.species]);
  const scale = mob.species === 'chicken' || mob.species === 'rabbit' ? 0.52
    : mob.species === 'horse' ? 1.16
    : mob.species === 'cow' || mob.species === 'deer' ? 1.05
    : 0.88;
  const body = MeshBuilder.CreateBox(`${mob.id}-body`, { width: 1.0 * scale, height: 0.62 * scale, depth: 1.25 * scale }, scene);
  body.position.y = 0.62 * scale; body.material = material;
  const head = MeshBuilder.CreateBox(`${mob.id}-head`, { size: 0.56 * scale }, scene);
  head.position.set(0, 0.78 * scale, 0.78 * scale); head.material = material;
  const parts: Mesh[] = [body, head];
  for (const [x, z] of [[-0.32, -0.38], [0.32, -0.38], [-0.32, 0.38], [0.32, 0.38]] as const) {
    const leg = MeshBuilder.CreateBox(`${mob.id}-leg`, { width: 0.2 * scale, height: 0.5 * scale, depth: 0.2 * scale }, scene);
    leg.position.set(x * scale, 0.25 * scale, z * scale); leg.material = material; parts.push(leg);
  }
  for (const part of parts) part.computeWorldMatrix(true);
  const merged = Mesh.MergeMeshes(parts, true, true, undefined, false, false);
  if (!merged) throw new Error(`Unable to build ${mob.species} mesh`);
  merged.refreshBoundingInfo();
  const feetY = merged.getBoundingInfo().boundingBox.minimum.y;
  merged.bakeTransformIntoVertices(Matrix.Translation(0, -feetY, 0));
  merged.isPickable = false;
  return merged;
}

export class PersistentWalkMobManager {
  private readonly runtime: RuntimeMob[] = [];
  private readonly records: Record<string, WorldMob>;

  constructor(
    private readonly noa: Engine,
    private readonly frame: PlanetLocalFrame,
    private readonly terrain: PlanetTerrainSampler,
    records: Record<string, WorldMob>,
    seed: number,
    anchorX: number,
    anchorZ: number,
    performanceMode: boolean,
  ) {
    // The expanded cap also lets existing worlds that already persisted the
    // original twelve-animal population acquire the newer habitat species.
    const activeLimit = performanceMode ? 7 : 16;
    this.records = ensureBasicMobs(records, terrain, seed, anchorX, anchorZ, activeLimit);
    const nearby = Object.values(this.records).filter((mob) => Math.hypot(mob.position.x - anchorX, mob.position.z - anchorZ) < 200).slice(0, activeLimit);
    for (const mob of nearby) {
      const surface = terrain.sampleSurface(mob.position.x, mob.position.z);
      const mesh = makeMobMesh(noa, mob);
      const entityId = noa.ents.add([mob.position.x - frame.originX, surface.elevation + 1, mob.position.z - frame.originZ], 0.9, 1.15, mesh, [0, 0, 0], true, false);
      noa.ents.addComponentAgain(entityId, noa.ents.names.collideTerrain, null);
      noa.ents.addComponentAgain(entityId, noa.ents.names.collideEntities, null);
      const body = noa.ents.getPhysicsBody(entityId);
      // Keep animals kinematic like citizens. Physics gravity can run before a
      // streamed terrain chunk is ready and bury newly spawned animals.
      if (body) { body.gravityMultiplier = 0; body.autoStep = false; body.friction = 2.5; }
      this.runtime.push({ record: { ...mob, position: { ...mob.position }, home: { ...mob.home } }, entityId, mesh, targetX: mob.position.x, targetZ: mob.position.z, nextDecisionAt: 0 });
    }
  }

  update(now = performance.now()): void {
    const wallNow = Date.now();
    const player = this.noa.ents.getPosition(this.noa.playerEntity);
    for (const mob of this.runtime) {
      const local = this.noa.ents.getPosition(mob.entityId);
      const body = this.noa.ents.getPhysicsBody(mob.entityId);
      if (!local || !body) continue;
      const globalX = this.frame.originX + local[0]!;
      const globalZ = this.frame.originZ + local[2]!;
      const currentSurface = this.terrain.sampleSurface(globalX, globalZ);
      const expectedFeetY = currentSurface.elevation + 1;
      if (Math.abs(local[1]! - expectedFeetY) > 0.05) {
        this.noa.ents.setPosition(mob.entityId, [local[0]!, expectedFeetY, local[2]!]);
        body.velocity[1] = 0;
      }
      const playerDistance = Math.hypot(local[0]! - player[0]!, local[2]! - player[2]!);
      if (playerDistance < 4.5) {
        mob.record.behavior = 'flee';
        const dx = local[0]! - player[0]!;
        const dz = local[2]! - player[2]!;
        const distance = Math.max(0.01, Math.hypot(dx, dz));
        mob.targetX = globalX + dx / distance * 7;
        mob.targetZ = globalZ + dz / distance * 7;
      } else if (now >= mob.nextDecisionAt || Math.hypot(mob.targetX - globalX, mob.targetZ - globalZ) < 0.5) {
        const decision = hash(Math.floor(now / 2_000), Math.floor(mob.record.home.x), Math.floor(mob.record.home.z));
        mob.record.behavior = decision % 4 === 0 ? 'idle' : 'wander';
        mob.targetX = mob.record.home.x + (decision % 19) - 9;
        mob.targetZ = mob.record.home.z + (Math.floor(decision / 23) % 19) - 9;
        mob.nextDecisionAt = now + 1_500 + decision % 3_500;
      }
      const targetSurface = this.terrain.sampleSurface(mob.targetX, mob.targetZ);
      if (mob.record.behavior === 'idle' || targetSurface.waterLevel !== null || Math.abs(targetSurface.elevation + 1 - local[1]!) > 2) {
        body.velocity[0] = 0; body.velocity[2] = 0;
      } else {
        const dx = mob.targetX - globalX;
        const dz = mob.targetZ - globalZ;
        const distance = Math.max(0.01, Math.hypot(dx, dz));
        const speed = mob.record.behavior === 'flee' ? 1.8 : 0.72;
        const stepSeconds = 0.075;
        const nextX = globalX + dx / distance * speed * stepSeconds;
        const nextZ = globalZ + dz / distance * speed * stepSeconds;
        const nextSurface = this.terrain.sampleSurface(nextX, nextZ);
        body.velocity[0] = 0;
        body.velocity[1] = 0;
        body.velocity[2] = 0;
        this.noa.ents.setPosition(mob.entityId, [
          nextX - this.frame.originX,
          nextSurface.elevation + 1,
          nextZ - this.frame.originZ,
        ]);
        mob.mesh.rotation.y = Math.atan2(dx, dz);
      }
      mob.record.position = { x: globalX, y: local[1]!, z: globalZ, label: mob.record.position.label };
      mob.record.updatedAt = wallNow;
    }
  }

  snapshot(): Record<string, WorldMob> {
    const result = { ...this.records };
    for (const mob of this.runtime) result[mob.record.id] = { ...mob.record, position: { ...mob.record.position }, home: { ...mob.record.home } };
    return result;
  }

  dispose(): void {
    for (const mob of this.runtime) mob.mesh.dispose(false, true);
    this.runtime.length = 0;
  }
}

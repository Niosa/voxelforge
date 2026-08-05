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
};

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
    const surface = terrain.sampleSurface(x, z);
    if (surface.waterLevel !== null || surface.isCity) continue;
    const speciesIndex = hash(seed + 991, x, z) % 4;
    const species: MobSpecies = surface.biome === 'snowy-tundra' ? 'sheep' : (['pig', 'cow', 'sheep', 'chicken'] as const)[speciesIndex]!;
    const id = `mob:${species}:${Math.floor(x / 12)}:${Math.floor(z / 12)}`;
    if (result[id]) continue;
    const location = { x: x + 0.5, y: surface.elevation + 1, z: z + 0.5, label: 'natural habitat' };
    const mob: WorldMob = {
      id, species, position: { ...location }, home: { ...location }, health: species === 'chicken' ? 4 : 10,
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
  const scale = mob.species === 'chicken' ? 0.58 : mob.species === 'cow' ? 1.05 : 0.88;
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
    this.records = ensureBasicMobs(records, terrain, seed, anchorX, anchorZ, performanceMode ? 5 : 12);
    const nearby = Object.values(this.records).filter((mob) => Math.hypot(mob.position.x - anchorX, mob.position.z - anchorZ) < 200).slice(0, performanceMode ? 5 : 12);
    for (const mob of nearby) {
      const surface = terrain.sampleSurface(mob.position.x, mob.position.z);
      const mesh = makeMobMesh(noa, mob);
      const entityId = noa.ents.add([mob.position.x - frame.originX, surface.elevation + 1, mob.position.z - frame.originZ], 0.9, 1.15, mesh, [0, 0, 0], true, false);
      noa.ents.addComponentAgain(entityId, noa.ents.names.collideTerrain, null);
      noa.ents.addComponentAgain(entityId, noa.ents.names.collideEntities, null);
      const body = noa.ents.getPhysicsBody(entityId);
      if (body) { body.gravityMultiplier = 1; body.autoStep = true; body.friction = 2.5; }
      this.runtime.push({ record: { ...mob, position: { ...mob.position }, home: { ...mob.home } }, entityId, mesh, targetX: mob.position.x, targetZ: mob.position.z, nextDecisionAt: 0 });
    }
  }

  update(): void {
    const now = performance.now();
    const player = this.noa.ents.getPosition(this.noa.playerEntity);
    for (const mob of this.runtime) {
      const local = this.noa.ents.getPosition(mob.entityId);
      const body = this.noa.ents.getPhysicsBody(mob.entityId);
      if (!local || !body) continue;
      const globalX = this.frame.originX + local[0]!;
      const globalZ = this.frame.originZ + local[2]!;
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
        body.velocity[0] = dx / distance * speed;
        body.velocity[2] = dz / distance * speed;
        body.applyForce([0, 0, 0]);
        mob.mesh.rotation.y = Math.atan2(dx, dz);
      }
      mob.record.position = { x: globalX, y: local[1]!, z: globalZ, label: mob.record.position.label };
      mob.record.updatedAt = Date.now();
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

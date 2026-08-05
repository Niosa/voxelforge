import { Color3 } from '@babylonjs/core/Maths/math.color';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { Engine } from 'noa-engine';
import type { TerraEntity } from '@/entities/types';
import { geometryCentroid } from '@/geo/centroid';
import { lonLatToPlanetMeters, type PlanetLocalFrame } from '@/planet/spatial/PlanetGrid';
import { isSettlementRoadBlock, PlanetTerrainSampler } from '@/planet/terrain/PlanetTerrainSampler';

export interface WalkNpcSpawn {
  id: string;
  name: string;
  settlementId: string;
  waypoints: Array<readonly [number, number, number]>;
  colorIndex: number;
}

const NPC_NAMES = ['Ari', 'Bea', 'Cato', 'Dara', 'Eli', 'Fia', 'Galen', 'Hana'];
const CLOTHING_COLORS = ['#2563eb', '#dc2626', '#059669', '#d97706', '#7c3aed', '#0891b2'];

function roadPositionNear(
  terrain: PlanetTerrainSampler,
  targetX: number,
  targetZ: number,
  _settlementId: string,
): readonly [number, number, number] | null {
  for (let radius = 0; radius <= 14; radius++) {
    for (let dz = -radius; dz <= radius; dz++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (radius > 0 && Math.abs(dx) !== radius && Math.abs(dz) !== radius) continue;
        const x = Math.round(targetX + dx);
        const z = Math.round(targetZ + dz);
        const surface = terrain.sampleSurface(x, z);
        // Overlapping regions can be the sampler's feature owner even while the
        // column is valid settlement terrain. isCity is the authoritative test.
        if (!surface.isCity) continue;
        if (!isSettlementRoadBlock(terrain.blockAt(x, surface.elevation, z, surface))) continue;
        if (terrain.blockAt(x, surface.elevation + 1, z, surface) !== 0) continue;
        return [x + 0.5, surface.elevation + 1, z + 0.5];
      }
    }
  }
  return null;
}

export function planWalkNpcSpawns(
  entities: Record<string, TerraEntity>,
  terrain: PlanetTerrainSampler,
  anchorX: number,
  anchorZ: number,
  performanceMode: boolean,
): WalkNpcSpawn[] {
  const settlements = Object.values(entities).filter(
    (entity) => entity.type === 'city' || entity.type === 'town',
  );
  const anchorFeatureId = terrain.sampleSurface(anchorX, anchorZ).featureId;
  const nearby = settlements
    .map((settlement) => {
      const [lon, lat] = geometryCentroid(settlement.geometry);
      const [x, z] = lonLatToPlanetMeters(lon, lat);
      const atAnchor = settlement.id === anchorFeatureId;
      return {
        settlement,
        x: atAnchor ? anchorX : x,
        z: atAnchor ? anchorZ : z,
        distance: atAnchor ? 0 : Math.hypot(x - anchorX, z - anchorZ),
      };
    })
    .filter(({ distance }) => distance <= 350)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, performanceMode ? 1 : 2);

  const result: WalkNpcSpawn[] = [];
  for (const { settlement, x: centerX, z: centerZ } of nearby) {
    const count = performanceMode ? (settlement.type === 'city' ? 3 : 2) : (settlement.type === 'city' ? 6 : 3);
    for (let index = 0; index < count; index++) {
      const angle = index / count * Math.PI * 2;
      const start = roadPositionNear(
        terrain,
        centerX + Math.cos(angle) * (8 + index * 2),
        centerZ + Math.sin(angle) * (8 + index * 2),
        settlement.id,
      );
      if (!start) continue;
      const candidates = [
        start,
        roadPositionNear(terrain, start[0] + 12, start[2], settlement.id),
        roadPositionNear(terrain, start[0] + 12, start[2] + 12, settlement.id),
        roadPositionNear(terrain, start[0], start[2] + 12, settlement.id),
      ].filter((point): point is readonly [number, number, number] => point !== null);
      if (candidates.length === 0) continue;
      result.push({
        id: `walk-npc-${settlement.id}-${index}`,
        name: `${NPC_NAMES[index % NPC_NAMES.length]} of ${settlement.name}`,
        settlementId: settlement.id,
        waypoints: candidates,
        colorIndex: index % CLOTHING_COLORS.length,
      });
    }
  }
  return result;
}

interface RuntimeNpc {
  root: TransformNode;
  leftLeg: TransformNode;
  rightLeg: TransformNode;
  waypoints: Array<readonly [number, number, number]>;
  waypointIndex: number;
  phase: number;
}

function color3FromHex(hex: string): Color3 {
  return Color3.FromHexString(hex);
}

export class WalkNpcManager {
  private readonly npcs: RuntimeNpc[] = [];
  private readonly materials: StandardMaterial[] = [];
  private lastUpdate = performance.now();

  constructor(noa: Engine, frame: PlanetLocalFrame, spawns: WalkNpcSpawn[]) {
    const scene = noa.rendering.getScene();
    for (const [index, spawn] of spawns.entries()) {
      const root = new TransformNode(spawn.id, scene);
      const clothing = new StandardMaterial(`${spawn.id}-clothes`, scene);
      clothing.diffuseColor = color3FromHex(CLOTHING_COLORS[spawn.colorIndex]!);
      clothing.emissiveColor = clothing.diffuseColor.scale(0.16);
      const skin = new StandardMaterial(`${spawn.id}-skin`, scene);
      skin.diffuseColor = color3FromHex(index % 3 === 0 ? '#8d5524' : index % 3 === 1 ? '#c68642' : '#f1c27d');
      const dark = new StandardMaterial(`${spawn.id}-dark`, scene);
      dark.diffuseColor = color3FromHex('#1f2937');
      this.materials.push(clothing, skin, dark);

      const torso = MeshBuilder.CreateBox(`${spawn.id}-torso`, { width: 0.58, height: 0.72, depth: 0.32 }, scene);
      torso.parent = root; torso.position.y = 1.02; torso.material = clothing;
      const head = MeshBuilder.CreateBox(`${spawn.id}-head`, { size: 0.44 }, scene);
      head.parent = root; head.position.y = 1.62; head.material = skin;
      const leftLeg = new TransformNode(`${spawn.id}-left-leg-node`, scene);
      leftLeg.parent = root; leftLeg.position.set(-0.16, 0.67, 0);
      const leftLegMesh = MeshBuilder.CreateBox(`${spawn.id}-left-leg`, { width: 0.22, height: 0.65, depth: 0.25 }, scene);
      leftLegMesh.parent = leftLeg; leftLegMesh.position.y = -0.325; leftLegMesh.material = dark;
      const rightLeg = new TransformNode(`${spawn.id}-right-leg-node`, scene);
      rightLeg.parent = root; rightLeg.position.set(0.16, 0.67, 0);
      const rightLegMesh = MeshBuilder.CreateBox(`${spawn.id}-right-leg`, { width: 0.22, height: 0.65, depth: 0.25 }, scene);
      rightLegMesh.parent = rightLeg; rightLegMesh.position.y = -0.325; rightLegMesh.material = dark;
      // NOA uses a Babylon selection octree; register dynamic child meshes so
      // they remain visible and correctly culled as their parent walks.
      noa.rendering.addMeshToScene(torso, false);
      noa.rendering.addMeshToScene(head, false);
      noa.rendering.addMeshToScene(leftLegMesh, false);
      noa.rendering.addMeshToScene(rightLegMesh, false);
      for (const mesh of [torso, head, leftLegMesh, rightLegMesh]) {
        mesh.alwaysSelectAsActiveMesh = true;
        mesh.isPickable = false;
      }

      const start = spawn.waypoints[0]!;
      root.position.set(start[0] - frame.originX, start[1], start[2] - frame.originZ);
      this.npcs.push({
        root,
        leftLeg,
        rightLeg,
        waypoints: spawn.waypoints,
        waypointIndex: spawn.waypoints.length > 1 ? 1 : 0,
        phase: index,
      });
    }
  }

  update(frame: PlanetLocalFrame): void {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastUpdate) / 1_000);
    this.lastUpdate = now;
    for (const npc of this.npcs) {
      const target = npc.waypoints[npc.waypointIndex]!;
      const tx = target[0] - frame.originX;
      const tz = target[2] - frame.originZ;
      const dx = tx - npc.root.position.x;
      const dz = tz - npc.root.position.z;
      const distance = Math.hypot(dx, dz);
      if (distance < 0.25) {
        npc.waypointIndex = (npc.waypointIndex + 1) % npc.waypoints.length;
        continue;
      }
      const step = Math.min(distance, 1.15 * dt);
      npc.root.position.x += dx / distance * step;
      npc.root.position.z += dz / distance * step;
      npc.root.position.y += (target[1] - npc.root.position.y) * Math.min(1, dt * 8);
      npc.root.rotation.y = Math.atan2(dx, dz);
      npc.phase += dt * 8;
      const swing = Math.sin(npc.phase) * 0.55;
      npc.leftLeg.rotation.x = swing;
      npc.rightLeg.rotation.x = -swing;
    }
  }

  get count(): number {
    return this.npcs.length;
  }

  dispose(): void {
    for (const npc of this.npcs) npc.root.dispose(false, true);
    for (const material of this.materials) material.dispose();
    this.npcs.length = 0;
    this.materials.length = 0;
  }
}

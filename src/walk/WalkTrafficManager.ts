import { Color3 } from '@babylonjs/core/Maths/math.color';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Engine } from 'noa-engine';
import type { WorldNpc } from '@/entities/types';
import type { PlanetLocalFrame } from '@/planet/spatial/PlanetGrid';
import { PlanetTerrainSampler } from '@/planet/terrain/PlanetTerrainSampler';
import { findNpcRoadRoute } from './PersistentWalkNpcManager';

interface TrafficVehicle {
  entityId: number;
  mesh: Mesh;
  route: Array<{ x: number; y: number; z: number }>;
  routeIndex: number;
  speed: number;
}

function makeVehicleMesh(noa: Engine, id: number, modern: boolean): Mesh {
  const scene = noa.rendering.getScene();
  const bodyMaterial = new StandardMaterial(`traffic-body-${id}`, scene);
  bodyMaterial.diffuseColor = Color3.FromHexString(modern ? ['#dc2626', '#eab308', '#2563eb'][id % 3]! : '#854d0e');
  const darkMaterial = new StandardMaterial(`traffic-dark-${id}`, scene);
  darkMaterial.diffuseColor = Color3.FromHexString('#111827');
  const body = MeshBuilder.CreateBox(`traffic-${id}`, { width: 1.45, height: 0.7, depth: 2.25 }, scene);
  body.position.y = 0.72;
  body.material = bodyMaterial;
  const cabin = MeshBuilder.CreateBox(`traffic-cabin-${id}`, { width: 1.15, height: 0.58, depth: 1.05 }, scene);
  cabin.position.set(0, 1.3, modern ? -0.12 : 0.2);
  cabin.material = modern ? darkMaterial : bodyMaterial;
  const merged = body.clone(`traffic-merged-${id}`);
  body.dispose();
  cabin.parent = merged;
  merged.isPickable = false;
  merged.alwaysSelectAsActiveMesh = true;
  return merged;
}

export class WalkTrafficManager {
  private readonly vehicles: TrafficVehicle[] = [];

  constructor(
    private readonly noa: Engine,
    private readonly frame: PlanetLocalFrame,
    terrain: PlanetTerrainSampler,
    records: Record<string, WorldNpc>,
    performanceMode: boolean,
    modern: boolean,
  ) {
    if (performanceMode) return;
    const citizens = Object.values(records);
    const count = Math.min(4, Math.floor(citizens.length / 4));
    for (let index = 0; index < count; index++) {
      const citizen = citizens[(index * 3) % citizens.length];
      if (!citizen) continue;
      const outward = findNpcRoadRoute(terrain, citizen.home, citizen.market, 2_500);
      if (outward.length < 3) continue;
      const route = [...outward, ...outward.slice(1, -1).reverse()];
      const start = route[(index * 5) % route.length]!;
      const mesh = makeVehicleMesh(noa, index, modern);
      const entityId = noa.ents.add(
        [start.x - frame.originX, start.y + 0.05, start.z - frame.originZ],
        1.45,
        1.65,
        mesh,
        [0, 0, 0],
        false,
        false,
      );
      noa.ents.addComponentAgain(entityId, noa.ents.names.collideEntities, null);
      this.vehicles.push({ entityId, mesh, route, routeIndex: (index * 5) % route.length, speed: modern ? 3.2 : 1.8 });
    }
  }

  get count(): number { return this.vehicles.length; }

  update(dtSeconds: number): void {
    for (const vehicle of this.vehicles) {
      const position = this.noa.ents.getPosition(vehicle.entityId);
      if (!position) continue;
      const target = vehicle.route[vehicle.routeIndex]!;
      const targetX = target.x - this.frame.originX;
      const targetZ = target.z - this.frame.originZ;
      const dx = targetX - position[0]!;
      const dz = targetZ - position[2]!;
      const distance = Math.hypot(dx, dz);
      if (distance < 0.22) {
        vehicle.routeIndex = (vehicle.routeIndex + 1) % vehicle.route.length;
        continue;
      }
      const step = Math.min(distance, vehicle.speed * Math.min(dtSeconds, 0.1));
      const nextX = position[0]! + dx / distance * step;
      const nextZ = position[2]! + dz / distance * step;
      const surfaceTarget = vehicle.route[vehicle.routeIndex]!;
      this.noa.ents.setPosition(vehicle.entityId, [nextX, surfaceTarget.y + 0.05, nextZ]);
      vehicle.mesh.rotation.y = Math.atan2(dx, dz);
    }
  }

  dispose(): void {
    for (const vehicle of this.vehicles) vehicle.mesh.dispose(false, true);
    this.vehicles.length = 0;
  }
}

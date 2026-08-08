import {
  Viewer,
  Entity,
  Cartesian3,
  HeadingPitchRoll,
  Transforms,
  Color,
  HeightReference,
  DistanceDisplayCondition,
} from 'cesium';
import type { TerraEntity } from '@/entities/types';
import { geometryCentroid } from '@/geo/centroid';

export interface NpcDialogBubble {
  npcId: string;
  npcName: string;
  dialogText: string;
  active: boolean;
}

export interface NpcInstance {
  id: string;
  name: string;
  cityId: string;
  lon: number;
  lat: number;
  height: number;
  heading: number;
  waypoints: { lon: number; lat: number }[];
  currentWaypointIdx: number;
  speed: number;
  color: Color;
  entity: Entity;
  dialogues: string[];
}

const npcDistanceCondition = new DistanceDisplayCondition(0, 150_000);

class NpcManager {
  private viewer: Viewer | null = null;
  private npcs = new Map<string, NpcInstance>();
  private activeDialog: NpcDialogBubble | null = null;
  private lastUpdateTime = 0;

  setViewer(v: Viewer): void {
    this.viewer = v;
  }

  getActiveDialog(): NpcDialogBubble | null {
    return this.activeDialog;
  }

  closeDialog(): void {
    this.activeDialog = null;
  }

  clear(): void {
    if (this.viewer && !this.viewer.isDestroyed()) {
      for (const npc of this.npcs.values()) {
        this.viewer.entities.remove(npc.entity);
      }
    }
    this.npcs.clear();
    this.activeDialog = null;
  }

  syncCityNpcs(entities: Record<string, TerraEntity>): void {
    if (!this.viewer) return;

    const cities = Object.values(entities).filter(
      (e) => (e.type === 'city' || e.type === 'town') && e.geometry
    );

    for (const city of cities) {
      const hasNpcs = Array.from(this.npcs.values()).some((n) => n.cityId === city.id);
      if (!hasNpcs) {
        this.spawnCityNpcs(city);
      }
    }
  }

  private spawnCityNpcs(city: TerraEntity): void {
    if (!this.viewer) return;

    const [cLon, cLat] = geometryCentroid(city.geometry);
    const count = city.type === 'city' ? 6 : 3;

    const dialogues = [
      "Welcome to our city! Safe travels, wanderer.",
      "The weather on the globe is splendid today.",
      "Did you know you can build custom voxel structures in 1st-person mode?",
      "Watch out for the autonomous vehicles along the avenues!",
      "Our architects built these skyscrapers from procedurally generated blueprints.",
    ];

    const colors = [
      Color.fromCssColorString('#38bdf8'),
      Color.fromCssColorString('#f43f5e'),
      Color.fromCssColorString('#10b981'),
      Color.fromCssColorString('#fbbf24'),
      Color.fromCssColorString('#a855f7'),
    ];

    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const radius = 0.0012;
      const waypoints = [
        { lon: cLon + Math.cos(angle) * radius, lat: cLat + Math.sin(angle) * radius },
        { lon: cLon + Math.cos(angle + Math.PI / 2) * radius, lat: cLat + Math.sin(angle + Math.PI / 2) * radius },
        { lon: cLon + Math.cos(angle + Math.PI) * radius, lat: cLat + Math.sin(angle + Math.PI) * radius },
        { lon: cLon + Math.cos(angle + (3 * Math.PI) / 2) * radius, lat: cLat + Math.sin(angle + (3 * Math.PI) / 2) * radius },
      ];

      const start = waypoints[0]!;
      const id = `npc_${city.id}_${i}`;
      const color = colors[i % colors.length]!;

      const posCartesian = Cartesian3.fromDegrees(start.lon, start.lat, 0.9);
      const orientQuat = Transforms.headingPitchRollQuaternion(
        posCartesian,
        new HeadingPitchRoll(0, 0, 0)
      );

      const entity = this.viewer.entities.add({
        name: `NPC Citizen ${i + 1}`,
        position: posCartesian,
        orientation: orientQuat as any,
        box: {
          dimensions: new Cartesian3(0.6, 0.6, 1.8),
          material: color,
          distanceDisplayCondition: npcDistanceCondition,
          heightReference: HeightReference.RELATIVE_TO_GROUND,
        },
      });

      this.npcs.set(id, {
        id,
        name: `Citizen of ${city.name}`,
        cityId: city.id,
        lon: start.lon,
        lat: start.lat,
        height: 1.8,
        heading: 0,
        waypoints,
        currentWaypointIdx: 0,
        speed: 1.4, // 1.4 m/s walking speed
        color,
        entity,
        dialogues,
      });
    }
  }

  update(playerLon?: number, playerLat?: number): void {
    if (!this.viewer || this.viewer.isDestroyed() || this.npcs.size === 0) return;

    const now = performance.now();
    const dtSeconds = (now - this.lastUpdateTime) / 1000;
    if (dtSeconds < 0.05) return;
    this.lastUpdateTime = now;
    const dt = Math.min(0.1, dtSeconds);

    for (const npc of this.npcs.values()) {
      // If player is close (< 3.5 meters), NPC stops and faces player
      if (typeof playerLon === 'number' && typeof playerLat === 'number') {
        const dLon = playerLon - npc.lon;
        const dLat = playerLat - npc.lat;
        const distMeters = Math.hypot(dLon * 111_000, dLat * 111_000);

        if (distMeters < 3.5) {
          const faceHeading = Math.atan2(dLon, dLat);
          const pos = Cartesian3.fromDegrees(npc.lon, npc.lat, 0.9);
          const orient = Transforms.headingPitchRollQuaternion(
            pos,
            new HeadingPitchRoll(faceHeading, 0, 0)
          );
          npc.entity.orientation = orient as any;
          continue;
        }
      }

      // Advance along waypoints
      const waypoints = npc.waypoints;
      if (waypoints.length < 2) continue;

      const currWp = waypoints[npc.currentWaypointIdx]!;
      const nextIdx = (npc.currentWaypointIdx + 1) % waypoints.length;
      const nextWp = waypoints[nextIdx]!;

      const dLon = nextWp.lon - currWp.lon;
      const dLat = nextWp.lat - currWp.lat;
      const segMeters = Math.hypot(dLon * 111_000, dLat * 111_000);

      if (segMeters < 0.1) {
        npc.currentWaypointIdx = nextIdx;
        continue;
      }

      const moveStep = (npc.speed * dt) / segMeters;
      npc.lon += dLon * moveStep;
      npc.lat += dLat * moveStep;

      const heading = Math.atan2(dLon, dLat);
      const posCartesian = Cartesian3.fromDegrees(npc.lon, npc.lat, 0.9);
      const orientQuat = Transforms.headingPitchRollQuaternion(
        posCartesian,
        new HeadingPitchRoll(heading, 0, 0)
      );

      npc.entity.position = posCartesian as any;
      npc.entity.orientation = orientQuat as any;
    }
  }

  triggerNpcInteraction(npcId: string): void {
    const npc = this.npcs.get(npcId);
    if (!npc) return;
    const dialogue = npc.dialogues[Math.floor(Math.random() * npc.dialogues.length)]!;
    this.activeDialog = {
      npcId: npc.id,
      npcName: npc.name,
      dialogText: dialogue,
      active: true,
    };
  }
}

export const npcManager = new NpcManager();

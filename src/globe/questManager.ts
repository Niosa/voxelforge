import {
  Viewer,
  Entity,
  Cartesian3,
  Color,
  HeightReference,
} from 'cesium';
import { getViewer } from '@/globe/CesiumViewer';
import { useUiStore } from '@/state/uiStore';
import { soundEngine } from '@/audio/soundEngine';

export interface RelicInstance {
  id: string;
  name: string;
  lon: number;
  lat: number;
  discovered: boolean;
  entity: Entity;
}

class QuestManager {
  private relics: RelicInstance[] = [];
  private viewer: Viewer | null = null;

  public initQuests(): void {
    this.viewer = getViewer();
    if (!this.viewer) return;

    this.clearQuests();

    // Spawn 5 Ancient Relic Runes at interesting points across globe
    const relicNames = [
      '🔮 Crystal Rune of Solaria',
      '📜 Ancient Cartography Scroll',
      '⚡ Cybernetic Energy Core',
      '🔱 Trident of the Deep Azure',
      '👑 Golden Crown of Aethelgard',
    ];

    const coords = [
      { lon: 15.0, lat: 48.0 },
      { lon: -75.0, lat: 40.0 },
      { lon: 139.0, lat: 35.0 },
      { lon: 30.0, lat: -25.0 },
      { lon: -100.0, lat: 20.0 },
    ];

    relics_loop: for (let i = 0; i < relicNames.length; i++) {
      const c = coords[i]!;
      const pos = Cartesian3.fromDegrees(c.lon, c.lat, 10.0);

      const entity = this.viewer.entities.add({
        name: relicNames[i],
        position: pos,
        ellipsoid: {
          radii: new Cartesian3(6.0, 6.0, 6.0),
          material: Color.fromCssColorString('#06b6d4').withAlpha(0.9),
          heightReference: HeightReference.RELATIVE_TO_GROUND,
        },
      });

      this.relics.push({
        id: `relic_${i}`,
        name: relicNames[i]!,
        lon: c.lon,
        lat: c.lat,
        discovered: false,
        entity,
      });
    }

    useUiStore.getState().setActiveRelicCount(this.relics.length);
  }

  public clearQuests(): void {
    if (this.viewer && !this.viewer.isDestroyed()) {
      for (const relic of this.relics) {
        this.viewer.entities.remove(relic.entity);
      }
    }
    this.relics = [];
  }

  public checkPlayerProximity(pLon: number, pLat: number): string | null {
    for (const relic of this.relics) {
      if (relic.discovered) continue;
      const dLon = pLon - relic.lon;
      const dLat = pLat - relic.lat;
      const distMeters = Math.hypot(dLon * 111_000, dLat * 111_000);

      if (distMeters < 15.0) {
        relic.discovered = true;
        relic.entity.show = false;
        soundEngine.playRelicDiscovered();

        const remaining = this.relics.filter((r) => !r.discovered).length;
        useUiStore.getState().setActiveRelicCount(remaining);
        return relic.name;
      }
    }
    return null;
  }

  public getNearestRelicDistance(pLon: number, pLat: number): { name: string; distKm: number } | null {
    let nearest: { name: string; distKm: number } | null = null;
    let minD = Infinity;

    for (const relic of this.relics) {
      if (relic.discovered) continue;
      const dLon = pLon - relic.lon;
      const dLat = pLat - relic.lat;
      const distKm = Math.hypot(dLon * 111, dLat * 111);

      if (distKm < minD) {
        minD = distKm;
        nearest = { name: relic.name, distKm };
      }
    }

    return nearest;
  }
}

export const questManager = new QuestManager();

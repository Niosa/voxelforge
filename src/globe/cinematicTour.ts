import { getViewer } from '@/globe/CesiumViewer';
import { useWorldStore } from '@/state/worldStore';
import { useUiStore } from '@/state/uiStore';
import { geometryCentroid } from '@/geo/centroid';
import { Cartesian3, Math as CesiumMath } from 'cesium';

class CinematicTourController {
  private isRunning: boolean = false;
  private timerId: any = null;

  public startTour(): void {
    const viewer = getViewer();
    const world = useWorldStore.getState().world;
    if (!viewer || this.isRunning) return;

    const entities = Object.values(world.entities).filter(
      (e) => e.type === 'city' || e.type === 'landmark' || e.type === 'continent'
    );

    if (entities.length === 0) return;

    this.isRunning = true;
    useUiStore.getState().setCinematicTourActive(true);

    let idx = 0;
    const flyNext = () => {
      if (!this.isRunning || viewer.isDestroyed()) return;

      const target = entities[idx % entities.length]!;
      const [lon, lat] = geometryCentroid(target.geometry);

      viewer.camera.flyTo({
        destination: Cartesian3.fromDegrees(lon, lat - 0.05, 2500.0),
        orientation: {
          heading: CesiumMath.toRadians(idx * 45),
          pitch: CesiumMath.toRadians(-25.0), // Dramatic 3D tilt angle
          roll: 0.0,
        },
        duration: 4.5,
        complete: () => {
          if (this.isRunning) {
            idx++;
            this.timerId = setTimeout(flyNext, 3000);
          }
        },
      });
    };

    flyNext();
  }

  public stopTour(): void {
    this.isRunning = false;
    if (this.timerId) clearTimeout(this.timerId);
    useUiStore.getState().setCinematicTourActive(false);
  }

  public isTourActive(): boolean {
    return this.isRunning;
  }
}

export const cinematicTour = new CinematicTourController();

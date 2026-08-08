import {
  Viewer,
  Cartesian3,
  Math as CesiumMath,
} from 'cesium';
import { getViewer } from '@/globe/CesiumViewer';
import type { TerraEntity, World } from '@/entities/types';

export function flyToEntity(entity: TerraEntity): void {
  const viewer = getViewer();
  if (!viewer || viewer.isDestroyed()) return;

  if (entity.geometry.type === 'Point') {
    const [lon, lat] = entity.geometry.coordinates;
    viewer.camera.flyTo({
      destination: Cartesian3.fromDegrees(lon, lat, 300_000),
      orientation: { heading: 0, pitch: CesiumMath.toRadians(-45), roll: 0 },
      duration: 1.4,
    });
    return;
  }

  // For polygons, compute bounding box centroid
  const coords =
    entity.geometry.type === 'Polygon'
      ? entity.geometry.coordinates[0]
      : entity.geometry.coordinates[0]?.[0];

  if (!coords || coords.length === 0) return;

  let minLon = 180, maxLon = -180, minLat = 90, maxLat = -90;
  for (const [ln, lt] of coords as [number, number][]) {
    if (ln < minLon) minLon = ln;
    if (ln > maxLon) maxLon = ln;
    if (lt < minLat) minLat = lt;
    if (lt > maxLat) maxLat = lt;
  }

  const cLon = (minLon + maxLon) / 2;
  const cLat = (minLat + maxLat) / 2;
  const span = Math.max(maxLon - minLon, maxLat - minLat);
  const height = Math.max(500_000, span * 120_000);

  viewer.camera.flyTo({
    destination: Cartesian3.fromDegrees(cLon, cLat, height),
    orientation: { heading: 0, pitch: CesiumMath.toRadians(-70), roll: 0 },
    duration: 1.4,
  });
}

/**
 * Flies the camera to a world’s stored camera position if present,
 * otherwise falls back to a default orbital view.
 */
export function flyToWorldCamera(viewer: Viewer, world: World): void {
  if (viewer.isDestroyed()) return;
  const cam = world.camera;
  if (!cam) return;
  viewer.camera.flyTo({
    destination: Cartesian3.fromDegrees(cam.lon, cam.lat, cam.height),
    orientation: {
      heading: CesiumMath.toRadians(cam.heading ?? 0),
      pitch: CesiumMath.toRadians(cam.pitch ?? -90),
      roll: 0,
    },
    duration: 1.2,
  });
}

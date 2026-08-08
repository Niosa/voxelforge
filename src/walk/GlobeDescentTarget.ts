import {
  Cartesian2,
  Cartographic,
  Math as CesiumMath,
  type Cartesian3,
  type Viewer,
} from 'cesium';

/** Pick the globe location visually centered beneath the camera. */
export function pickGlobeCenterLonLat(viewer: Viewer): readonly [number, number] | null {
  if (viewer.isDestroyed()) return null;
  const canvas = viewer.scene.canvas;
  const width = canvas.clientWidth || canvas.width;
  const height = canvas.clientHeight || canvas.height;
  if (width <= 0 || height <= 0) return null;

  const center = new Cartesian2(width / 2, height / 2);
  let surface: Cartesian3 | undefined;
  try {
    const ray = viewer.camera.getPickRay(center);
    if (ray) surface = viewer.scene.globe.pick(ray, viewer.scene) ?? undefined;
  } catch (_) { /* Fall through to ellipsoid picking. */ }

  if (!surface) {
    surface = viewer.camera.pickEllipsoid(center, viewer.scene.globe.ellipsoid) ?? undefined;
  }
  if (!surface) return null;

  const cartographic = Cartographic.fromCartesian(surface, viewer.scene.globe.ellipsoid);
  return [
    CesiumMath.toDegrees(cartographic.longitude),
    CesiumMath.toDegrees(cartographic.latitude),
  ];
}

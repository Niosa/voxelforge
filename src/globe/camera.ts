import { Cartesian3, Math as CesiumMath } from 'cesium';
import { getViewer } from '@/globe/CesiumViewer';
import type { TerraEntity } from '@/entities/types';
import { geometryCentroid } from '@/geo/centroid';

export function flyToEntity(entity: TerraEntity): void {
  const viewer = getViewer();
  if (!viewer) return;

  const [lon, lat] = geometryCentroid(entity.geometry);

  const isPoint = entity.geometry.type === 'Point';
  const targetHeight = isPoint ? 15_000 : 1_200_000; // 15km for towns/cities, 1200km for regions/continents
  const latOffset = isPoint ? -0.08 : 0;
  const targetPitch = isPoint ? -45 : -85;

  viewer.camera.flyTo({
    destination: Cartesian3.fromDegrees(lon, lat + latOffset, targetHeight),
    orientation: {
      heading: CesiumMath.toRadians(0),
      pitch: CesiumMath.toRadians(targetPitch),
      roll: 0,
    },
    duration: 2.2,
  });
}

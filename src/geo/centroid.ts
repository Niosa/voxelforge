import centroid from '@turf/centroid';
import type { TerraGeometry } from '@/entities/types';

/** Returns [lon, lat] suitable for label anchors */
export function geometryCentroid(geometry: TerraGeometry): [number, number] {
  if (geometry.type === 'Point') {
    return [geometry.coordinates[0], geometry.coordinates[1]];
  }
  const feature = {
    type: 'Feature' as const,
    properties: {},
    geometry,
  };
  const c = centroid(feature);
  return c.geometry.coordinates as [number, number];
}

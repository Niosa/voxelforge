import type { TerraGeometry } from '@/entities/types';

export function isClosedRing(ring: number[][]): boolean {
  if (ring.length < 4) return false;
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (!first || !last) return false;
  return first[0] === last[0] && first[1] === last[1];
}

export function validateGeometry(geometry: TerraGeometry): string[] {
  const errors: string[] = [];

  if (geometry.type === 'Point') {
    const [lon, lat] = geometry.coordinates;
    if (lon === undefined || lat === undefined || !Number.isFinite(lon) || !Number.isFinite(lat)) {
      errors.push('Point has non-finite coordinates');
    } else {
      if (Math.abs(lat) > 90) errors.push('Point latitude out of range');
      if (Math.abs(lon) > 180) errors.push('Point longitude out of range');
    }
    return errors;
  }

  const polys =
    geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;

  for (const polygon of polys) {
    const exterior = polygon[0];
    if (!exterior || exterior.length < 4) {
      errors.push('Polygon exterior needs at least 3 vertices + close');
      continue;
    }
    if (!isClosedRing(exterior)) {
      errors.push('Polygon exterior ring must be closed');
    }
  }

  return errors;
}

export function assertValidGeometry(geometry: TerraGeometry): void {
  const errors = validateGeometry(geometry);
  if (errors.length > 0) {
    throw new Error(`Invalid geometry: ${errors.join('; ')}`);
  }
}

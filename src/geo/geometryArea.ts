import type { TerraEntity } from '@/entities/types';

/**
 * Shoelace area of a lon/lat ring in square degrees.
 * Not geodetically exact, but consistent — perfect for relative area ranking.
 */
export function getRingArea(ring: number[][]): number {
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i]!;
    const [x2, y2] = ring[i + 1]!;
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum / 2);
}

/**
 * Approximate ground area of an entity's geometry in square degrees.
 * Points return 0; polygons sum their outer rings. Used for pick ranking
 * (most specific nested territory wins) and ground-fill z-stacking.
 */
export function getEntityArea(entity: TerraEntity): number {
  const geom = entity.geometry;
  if (geom.type === 'Point') return 0;
  if (geom.type === 'Polygon') {
    const ring = geom.coordinates[0];
    return ring && ring.length > 2 ? getRingArea(ring as number[][]) : Infinity;
  }
  let total = 0;
  for (const poly of geom.coordinates) {
    const ring = poly[0];
    if (ring && ring.length > 2) total += getRingArea(ring as number[][]);
  }
  return total > 0 ? total : Infinity;
}

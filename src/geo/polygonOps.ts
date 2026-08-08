import { feature, featureCollection, union, difference } from '@turf/turf';
import type { Polygon, MultiPolygon } from 'geojson';

export type PolygonalGeometry = Polygon | MultiPolygon;

/**
 * Boolean polygon operations used by the "Add Island/Part" and "Erase Region"
 * drawing tools. Both operate on plain lon/lat rings (GeoJSON order) and
 * return normalized geometries that satisfy the existing `TerraGeometry`
 * contract (Polygon or MultiPolygon).
 */

/** Ensures the ring is explicitly closed (first point === last point). */
function closeRing(ring: number[][]): number[][] {
  if (ring.length === 0) return ring;
  const first = ring[0]!;
  const last = ring[ring.length - 1]!;
  if (first[0] === last[0] && first[1] === last[1]) return ring;
  return [...ring, [first[0], first[1]]];
}

/** Collapses a single-part MultiPolygon back to a plain Polygon for tidiness. */
function normalizePolygonal(geom: Polygon | MultiPolygon): PolygonalGeometry {
  if (geom.type === 'MultiPolygon' && geom.coordinates.length === 1) {
    return { type: 'Polygon', coordinates: geom.coordinates[0]! };
  }
  return geom;
}

/** Blindly appends a ring as a new disjoint part (fallback when turf union fails). */
function appendPart(geom: PolygonalGeometry, ring: number[][]): MultiPolygon {
  const part = [closeRing(ring)];
  if (geom.type === 'Polygon') {
    return { type: 'MultiPolygon', coordinates: [geom.coordinates, part] };
  }
  return { type: 'MultiPolygon', coordinates: [...geom.coordinates, part] };
}

/**
 * Adds a drawn ring to an existing landmass. Overlapping/touching shapes are
 * unioned into a single Polygon; a disjoint shape becomes a new part of a
 * MultiPolygon (a true island of the same entity — shared name, color, biome).
 */
export function addRingToGeometry(
  geom: PolygonalGeometry,
  ring: number[][],
): PolygonalGeometry {
  const closed = closeRing(ring);
  try {
    const merged = union(
      featureCollection<Polygon | MultiPolygon>([
        feature(geom) as any,
        feature({ type: 'Polygon', coordinates: [closed] }) as any,
      ]),
    );
    if (merged && merged.geometry) {
      return normalizePolygonal(merged.geometry);
    }
  } catch (err) {
    console.warn('addRingToGeometry: union failed, appending as separate part:', err);
  }
  return appendPart(geom, closed);
}

/**
 * Subtracts a drawn "eraser" ring from an existing landmass.
 * - Eraser fully inside → an interior hole (lake).
 * - Eraser crossing an edge → the landmass is cut back.
 * - Eraser severing the landmass → MultiPolygon (it can even CREATE islands).
 * Returns null when nothing of the landmass remains (or the op failed).
 */
export function eraseRingFromGeometry(
  geom: PolygonalGeometry,
  ring: number[][],
): PolygonalGeometry | null {
  const closed = closeRing(ring);
  try {
    const result = difference(
      featureCollection<Polygon | MultiPolygon>([
        feature(geom) as any,
        feature({ type: 'Polygon', coordinates: [closed] }) as any,
      ]),
    );
    if (!result || !result.geometry) return null;
    return normalizePolygonal(result.geometry);
  } catch (err) {
    console.warn('eraseRingFromGeometry: difference failed:', err);
    return null;
  }
}

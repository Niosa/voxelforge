import type { MultiPolygon, Polygon } from 'geojson';

export type LonLat = [number, number];

const EPSILON = 1e-9;

/** Keeps a longitude in GeoJSON's conventional [-180, 180] range. */
export function normalizeLongitude(longitude: number): number {
  const normalized = ((longitude + 180) % 360 + 360) % 360 - 180;
  return Math.abs(normalized + 180) < EPSILON && longitude > 0 ? 180 : normalized;
}

/** Makes adjacent longitude samples continuous across the date line. */
export function unwrapLongitudePoints(points: LonLat[]): LonLat[] {
  if (points.length === 0) return [];

  const first: LonLat = [normalizeLongitude(points[0]![0]), points[0]![1]];
  const result: LonLat[] = [first];
  let previousLongitude = first[0];

  for (let index = 1; index < points.length; index++) {
    const point = points[index]!;
    let longitude = normalizeLongitude(point[0]);
    while (longitude - previousLongitude > 180) longitude -= 360;
    while (longitude - previousLongitude < -180) longitude += 360;
    result.push([longitude, point[1]]);
    previousLongitude = longitude;
  }

  return result;
}

function samePoint(a: LonLat, b: LonLat): boolean {
  return Math.abs(a[0] - b[0]) < EPSILON && Math.abs(a[1] - b[1]) < EPSILON;
}

function openRing(points: LonLat[]): LonLat[] {
  if (points.length > 1 && samePoint(points[0]!, points[points.length - 1]!)) {
    return points.slice(0, -1);
  }
  return [...points];
}

function dedupeAdjacent(points: LonLat[]): LonLat[] {
  const result: LonLat[] = [];
  for (const point of points) {
    if (!result.length || !samePoint(result[result.length - 1]!, point)) result.push(point);
  }
  if (result.length > 1 && samePoint(result[0]!, result[result.length - 1]!)) result.pop();
  return result;
}

function clipAtLongitude(points: LonLat[], boundary: number, keepGreater: boolean): LonLat[] {
  if (points.length === 0) return [];
  const output: LonLat[] = [];
  const isInside = (point: LonLat) => keepGreater
    ? point[0] >= boundary - EPSILON
    : point[0] <= boundary + EPSILON;

  let previous = points[points.length - 1]!;
  let previousInside = isInside(previous);
  for (const current of points) {
    const currentInside = isInside(current);
    if (currentInside !== previousInside) {
      const longitudeDelta = current[0] - previous[0];
      if (Math.abs(longitudeDelta) > EPSILON) {
        const fraction = (boundary - previous[0]) / longitudeDelta;
        output.push([boundary, previous[1] + (current[1] - previous[1]) * fraction]);
      }
    }
    if (currentInside) output.push(current);
    previous = current;
    previousInside = currentInside;
  }
  return dedupeAdjacent(output);
}

function signedArea(points: LonLat[]): number {
  let twiceArea = 0;
  for (let index = 0; index < points.length; index++) {
    const current = points[index]!;
    const next = points[(index + 1) % points.length]!;
    twiceArea += current[0] * next[1] - next[0] * current[1];
  }
  return twiceArea / 2;
}

function closeCounterClockwiseRing(points: LonLat[]): LonLat[] | null {
  let ring = dedupeAdjacent(points);
  const area = signedArea(ring);
  if (ring.length < 3 || Math.abs(area) < EPSILON) return null;
  if (area < 0) ring = [...ring].reverse();
  return [...ring, [...ring[0]!] as LonLat];
}

/**
 * Produces GeoJSON that cannot become the globe-spanning complement when a
 * freehand ring crosses +/-180 degrees. The shape is clipped at the seam and
 * stored as one polygon part on each side.
 */
export function createAntimeridianSafePolygon(points: LonLat[]): Polygon | MultiPolygon {
  const continuous = openRing(unwrapLongitudePoints(points));
  if (continuous.length < 3) return { type: 'Polygon', coordinates: [[]] };

  const longitudes = continuous.map((point) => point[0]);
  const minimum = Math.min(...longitudes);
  const maximum = Math.max(...longitudes);
  const firstStrip = Math.floor((minimum + 180) / 360);
  const lastStrip = Math.floor((maximum + 180 - EPSILON) / 360);
  const parts: LonLat[][] = [];

  for (let strip = firstStrip; strip <= lastStrip; strip++) {
    const west = -180 + strip * 360;
    const east = 180 + strip * 360;
    const clipped = clipAtLongitude(clipAtLongitude(continuous, west, true), east, false);
    const shifted = clipped.map(([longitude, latitude]): LonLat => [
      Math.max(-180, Math.min(180, longitude - strip * 360)),
      latitude,
    ]);
    const closed = closeCounterClockwiseRing(shifted);
    if (closed) parts.push(closed);
  }

  if (parts.length <= 1) {
    const fallback = parts[0] ?? closeCounterClockwiseRing(
      continuous.map(([longitude, latitude]) => [normalizeLongitude(longitude), latitude]),
    ) ?? [];
    return { type: 'Polygon', coordinates: [fallback] };
  }

  return { type: 'MultiPolygon', coordinates: parts.map((ring) => [ring]) };
}

function ringCrossesAntimeridian(ring: number[][]): boolean {
  for (let index = 1; index < ring.length; index++) {
    if (Math.abs((ring[index]?.[0] ?? 0) - (ring[index - 1]?.[0] ?? 0)) > 180) return true;
  }
  return false;
}

/** Repairs legacy, outer-ring-only shapes created before seam-safe drawing. */
export function repairAntimeridianGeometry(geometry: Polygon | MultiPolygon): Polygon | MultiPolygon {
  const sourceParts = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  let repaired = false;
  const outputParts: number[][][][] = [];

  for (const polygon of sourceParts) {
    const outer = polygon[0];
    // Avoid dropping or misassigning existing holes. New eraser operations are
    // already based on seam-safe geometry, so this guard only affects legacy data.
    if (!outer || polygon.length > 1 || !ringCrossesAntimeridian(outer)) {
      outputParts.push(polygon);
      continue;
    }

    const safe = createAntimeridianSafePolygon(outer as LonLat[]);
    repaired = true;
    if (safe.type === 'Polygon') outputParts.push(safe.coordinates);
    else outputParts.push(...safe.coordinates);
  }

  if (!repaired) return geometry;
  if (geometry.type === 'Polygon' && outputParts.length === 1) {
    return { type: 'Polygon', coordinates: outputParts[0]! };
  }
  return { type: 'MultiPolygon', coordinates: outputParts };
}

import type { TerraEntity } from '@/entities/types';

export interface ReliefVertex {
  lon: number;
  lat: number;
  height: number;
  u: number;
  v: number;
}

export interface ReliefMeshData {
  vertices: ReliefVertex[];
  indices: number[];
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function pointInRing(lon: number, lat: number, ring: number[][]): boolean {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const [xi = 0, yi = 0] = ring[index] ?? [];
    const [xj = 0, yj = 0] = ring[previous] ?? [];
    if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function contains(entity: TerraEntity, lon: number, lat: number): boolean {
  if (entity.geometry.type === 'Point') return false;
  const polygons = entity.geometry.type === 'Polygon' ? [entity.geometry.coordinates] : entity.geometry.coordinates;
  return polygons.some((polygon) => {
    const outer = polygon[0] as number[][] | undefined;
    if (!outer || !pointInRing(lon, lat, outer)) return false;
    return !polygon.slice(1).some((hole) => pointInRing(lon, lat, hole as number[][]));
  });
}

function outerRings(entity: TerraEntity): number[][][] {
  if (entity.geometry.type === 'Point') return [];
  return entity.geometry.type === 'Polygon'
    ? [entity.geometry.coordinates[0] as number[][]]
    : entity.geometry.coordinates.map((polygon) => polygon[0] as number[][]);
}

function segmentDistance(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared)) : 0;
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

function boundaryDistance(entity: TerraEntity, lon: number, lat: number, lonScale: number, latScale: number): number {
  let minimum = Number.POSITIVE_INFINITY;
  for (const ring of outerRings(entity)) {
    for (let index = 0; index < ring.length; index++) {
      const current = ring[index]!;
      const next = ring[(index + 1) % ring.length]!;
      minimum = Math.min(minimum, segmentDistance(
        lon / lonScale,
        lat / latScale,
        current[0]! / lonScale,
        current[1]! / latScale,
        next[0]! / lonScale,
        next[1]! / latScale,
      ));
    }
  }
  return minimum;
}

/** Stable multi-scale ridged noise in normalized entity coordinates. */
function reliefNoise(u: number, v: number, seed: number, rugged: boolean): number {
  const phaseA = seed * 0.000013;
  const phaseB = seed * 0.000031;
  const broad = Math.sin((u * 2.1 + v * 1.3 + phaseA) * Math.PI * 2) * 0.5
    + Math.cos((u * 1.1 - v * 2.4 + phaseB) * Math.PI * 2) * 0.5;
  const detail = Math.sin((u * 6.7 - v * 4.1 + phaseB) * Math.PI * 2) * 0.5
    + Math.cos((u * 4.3 + v * 7.1 + phaseA) * Math.PI * 2) * 0.5;
  const ridge = 1 - Math.min(1, Math.abs(broad * 0.72 + detail * 0.28));
  return rugged ? 0.18 + Math.pow(ridge, 1.7) * 0.82 : 0.3 + (broad * 0.5 + 0.5) * 0.7;
}

export function createReliefMeshData(entity: TerraEntity, reliefHeight: number, resolution = 32): ReliefMeshData {
  const rings = outerRings(entity).filter((ring) => ring.length >= 3);
  if (rings.length === 0 || reliefHeight <= 0) return { vertices: [], indices: [] };
  const coordinates = rings.flat();
  const minLon = Math.min(...coordinates.map((point) => point[0]!));
  const maxLon = Math.max(...coordinates.map((point) => point[0]!));
  const minLat = Math.min(...coordinates.map((point) => point[1]!));
  const maxLat = Math.max(...coordinates.map((point) => point[1]!));
  const lonSpan = Math.max(0.000001, maxLon - minLon);
  const latSpan = Math.max(0.000001, maxLat - minLat);
  const grid = Math.max(8, Math.min(96, Math.round(resolution)));
  const vertices: ReliefVertex[] = [];
  const indices: number[] = [];
  const seed = hashString(entity.id);
  const rugged = entity.properties.topography === 'mountains' || entity.properties.biome === 'mountain-slate';

  for (let row = 0; row <= grid; row++) {
    for (let column = 0; column <= grid; column++) {
      const u = column / grid;
      const v = row / grid;
      const lon = minLon + lonSpan * u;
      const lat = minLat + latSpan * v;
      const inside = contains(entity, lon, lat);
      const distance = inside ? boundaryDistance(entity, lon, lat, lonSpan, latSpan) : 0;
      const edgeFade = Math.min(1, Math.max(0, distance * grid * 0.9));
      const noise = reliefNoise(u, v, seed, rugged);
      const profile = rugged ? Math.pow(edgeFade, 0.7) : Math.sin(edgeFade * Math.PI / 2);
      vertices.push({ lon, lat, height: inside ? reliefHeight * profile * noise : 0, u, v });
    }
  }

  for (let row = 0; row < grid; row++) {
    for (let column = 0; column < grid; column++) {
      const centerLon = minLon + lonSpan * (column + 0.5) / grid;
      const centerLat = minLat + latSpan * (row + 0.5) / grid;
      if (!contains(entity, centerLon, centerLat)) continue;
      const topLeft = row * (grid + 1) + column;
      const topRight = topLeft + 1;
      const bottomLeft = (row + 1) * (grid + 1) + column;
      const bottomRight = bottomLeft + 1;
      indices.push(topLeft, bottomLeft, topRight, topRight, bottomLeft, bottomRight);
    }
  }

  return { vertices, indices };
}

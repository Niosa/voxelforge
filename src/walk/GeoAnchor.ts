/**
 * GeoAnchor — bidirectional coordinate bridge between the Cesium globe
 * (geodetic lon/lat/alt in degrees & metres) and the noa-engine voxel
 * world (integer block offsets in metres from a fixed anchor point).
 *
 * Earth-surface approximation valid within ~50 km of the anchor:
 *   1 degree latitude  ≈ 110,540 m  (constant)
 *   1 degree longitude ≈ 111,320 × cos(lat) m
 *
 * All block coordinates are integers. One block = one metre.
 */

import type { WalkAnchor } from '@/entities/types';

const LAT_M_PER_DEG = 110_540;
const LON_M_PER_DEG_AT_EQUATOR = 111_320;

/** Convert geodetic coords to noa integer block offsets from anchor. */
export function geoToBlock(
  anchor: WalkAnchor,
  lon: number,
  lat: number,
  altM: number,
): { bx: number; by: number; bz: number } {
  const cosLat = Math.cos((anchor.lat * Math.PI) / 180);
  const bx = Math.round((lon - anchor.lon) * LON_M_PER_DEG_AT_EQUATOR * cosLat);
  const bz = Math.round((lat - anchor.lat) * LAT_M_PER_DEG);
  const by = Math.round(altM - anchor.altM);
  return { bx, by, bz };
}

/** Convert noa integer block offsets back to geodetic coords. */
export function blockToGeo(
  anchor: WalkAnchor,
  bx: number,
  by: number,
  bz: number,
): { lon: number; lat: number; altM: number } {
  const cosLat = Math.cos((anchor.lat * Math.PI) / 180);
  const lon = anchor.lon + bx / (LON_M_PER_DEG_AT_EQUATOR * cosLat);
  const lat = anchor.lat + bz / LAT_M_PER_DEG;
  const altM = anchor.altM + by;
  return { lon, lat, altM };
}

/**
 * Build a default WalkAnchor from a Cesium camera position.
 * Pass the camera's lon/lat (degrees) and current height above ellipsoid.
 * The anchor altitude is snapped to 0 (sea level) so the voxel Y axis
 * maps cleanly to altitude in metres.
 */
export function makeAnchor(lon: number, lat: number): WalkAnchor {
  return { lon, lat, altM: 0 };
}

/**
 * Return the chunk coordinate string ("cx,cy,cz") that contains a
 * given block offset. Chunk size is 32 blocks in each axis.
 */
export const CHUNK_SIZE = 32;

export function blockToChunkKey(bx: number, by: number, bz: number): string {
  const cx = Math.floor(bx / CHUNK_SIZE);
  const cy = Math.floor(by / CHUNK_SIZE);
  const cz = Math.floor(bz / CHUNK_SIZE);
  return `${cx},${cy},${cz}`;
}

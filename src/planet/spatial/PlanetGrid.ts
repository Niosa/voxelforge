import type { WalkAnchor } from '@/entities/types';

export const PLANET_CHUNK_SIZE = 32;
const EARTH_RADIUS_M = 6_378_137;
const MAX_MERCATOR_LAT = 85.05112878;

export interface PlanetBlockPosition {
  x: number;
  y: number;
  z: number;
}

export interface PlanetLocalFrame {
  originX: number;
  originZ: number;
  spawnX: number;
  spawnZ: number;
}

function floorToChunk(value: number): number {
  return Math.floor(value / PLANET_CHUNK_SIZE) * PLANET_CHUNK_SIZE;
}

export function lonLatToPlanetMeters(lon: number, lat: number): readonly [number, number] {
  const safeLat = Math.max(-MAX_MERCATOR_LAT, Math.min(MAX_MERCATOR_LAT, lat));
  const x = EARTH_RADIUS_M * lon * Math.PI / 180;
  const z = EARTH_RADIUS_M * Math.log(Math.tan(Math.PI / 4 + safeLat * Math.PI / 360));
  return [x, z];
}

export function planetMetersToLonLat(x: number, z: number): readonly [number, number] {
  const lon = x / EARTH_RADIUS_M * 180 / Math.PI;
  const lat = (2 * Math.atan(Math.exp(z / EARTH_RADIUS_M)) - Math.PI / 2) * 180 / Math.PI;
  return [lon, lat];
}

export function createPlanetLocalFrame(anchor: WalkAnchor): PlanetLocalFrame {
  const [metresX, metresZ] = lonLatToPlanetMeters(anchor.lon, anchor.lat);
  const blockX = Math.floor(metresX);
  const blockZ = Math.floor(metresZ);
  const originX = floorToChunk(blockX);
  const originZ = floorToChunk(blockZ);
  return {
    originX,
    originZ,
    spawnX: blockX - originX + 0.5,
    spawnZ: blockZ - originZ + 0.5,
  };
}

export function localToPlanetBlock(
  frame: PlanetLocalFrame,
  localX: number,
  localY: number,
  localZ: number,
): PlanetBlockPosition {
  return {
    x: frame.originX + localX,
    y: localY,
    z: frame.originZ + localZ,
  };
}

export function planetChunkKey(blockX: number, blockY: number, blockZ: number): string {
  return `planet/${Math.floor(blockX / PLANET_CHUNK_SIZE)},${Math.floor(blockY / PLANET_CHUNK_SIZE)},${Math.floor(blockZ / PLANET_CHUNK_SIZE)}`;
}

export function localChunkToPlanetKey(
  frame: PlanetLocalFrame,
  localChunkKey: string,
): string {
  const [cx = 0, cy = 0, cz = 0] = localChunkKey.split(',').map(Number);
  return `planet/${frame.originX / PLANET_CHUNK_SIZE + cx},${cy},${frame.originZ / PLANET_CHUNK_SIZE + cz}`;
}

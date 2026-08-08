/**
 * blueprintChunkMath.ts — cross-chunk-safe voxel offset math.
 *
 * Fixes the placeBlueprint() wrap bug tracked in issue #2: the naive
 * `(local + delta) % CHUNK_SIZE` returns negative indices for negative
 * deltas (JS modulo keeps the sign of the dividend) and wraps inside the
 * SAME chunk instead of crossing into neighbors. These helpers convert a
 * (chunk, local) coordinate plus an offset into the correct neighboring
 * (chunk, local) pair using floor division.
 *
 * Note: vertical clamping (cz/lz >= 0) stays the caller's responsibility —
 * these helpers are purely mathematical and allow negative chunk coords.
 */

export interface AxisCoord {
  /** Chunk coordinate along one axis (may be negative). */
  chunk: number;
  /** Local voxel coordinate inside the chunk, always in [0, chunkSize). */
  local: number;
}

/** Offset a single axis by `delta`, crossing chunk boundaries correctly. */
export function offsetAxis(chunk: number, local: number, delta: number, chunkSize: number): AxisCoord {
  const global = chunk * chunkSize + local + delta;
  return {
    chunk: Math.floor(global / chunkSize),
    local: ((global % chunkSize) + chunkSize) % chunkSize,
  };
}

export interface VoxelCoord3 {
  cx: number;
  cy: number;
  cz: number;
  lx: number;
  ly: number;
  lz: number;
}

/**
 * Offset a 3D (chunk, local) voxel coordinate by (dx, dy, dz),
 * crossing chunk boundaries independently on all three axes.
 *
 * Intended use in FirstPersonBuilder.placeBlueprint():
 *
 *   const p = offsetVoxelCoord3(origin, dx, dy, dz, CHUNK_SIZE);
 *   voxelManager.getOrCreateChunk(p.cx, p.cy, p.cz).setBlock(p.lx, p.ly, p.lz, block);
 */
export function offsetVoxelCoord3(
  origin: VoxelCoord3,
  dx: number,
  dy: number,
  dz: number,
  chunkSize: number,
): VoxelCoord3 {
  const x = offsetAxis(origin.cx, origin.lx, dx, chunkSize);
  const y = offsetAxis(origin.cy, origin.ly, dy, chunkSize);
  const z = offsetAxis(origin.cz, origin.lz, dz, chunkSize);
  return { cx: x.chunk, cy: y.chunk, cz: z.chunk, lx: x.local, ly: y.local, lz: z.local };
}

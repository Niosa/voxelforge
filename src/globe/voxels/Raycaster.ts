import { Cartesian3, Ray } from 'cesium';
import { voxelManager } from './VoxelChunk';
import { voxelCoords } from './CoordinateSystem';
import { CHUNK_SIZE, VOXEL_SIZE, type VoxelBlock } from './VoxelChunk';

export interface VoxelIntersection {
  hit: true;
  block: VoxelBlock;
  // The global chunk and local coordinates of the block that was hit
  hitCx: number; hitCy: number; hitCz: number;
  hitLx: number; hitLy: number; hitLz: number;
  // The adjacent empty space (for block placement)
  adjCx: number; adjCy: number; adjCz: number;
  adjLx: number; adjLy: number; adjLz: number;
}

export interface VoxelMiss {
  hit: false;
}

export type VoxelRaycastResult = VoxelIntersection | VoxelMiss;

/**
 * CPU-side raymarching through the chunked voxel grid.
 * Uses 3D DDA (Digital Differential Analyzer) algorithm for fast voxel traversal.
 */
export function raycastVoxels(worldRay: Ray, maxDistance: number = 100): VoxelRaycastResult {
  // Convert ray to local ENU meters
  const originLocal = voxelCoords.worldToLocal(worldRay.origin);
  const targetWorld = Cartesian3.add(
    worldRay.origin, 
    Cartesian3.multiplyByScalar(worldRay.direction, 100, new Cartesian3()), 
    new Cartesian3()
  );
  const targetLocal = voxelCoords.worldToLocal(targetWorld);
  
  const directionLocal = Cartesian3.subtract(targetLocal, originLocal, new Cartesian3());
  Cartesian3.normalize(directionLocal, directionLocal);

  // DDA Initialization
  let x = Math.floor(originLocal.x / VOXEL_SIZE);
  let y = Math.floor(originLocal.y / VOXEL_SIZE);
  let z = Math.floor(originLocal.z / VOXEL_SIZE);

  const stepX = Math.sign(directionLocal.x);
  const stepY = Math.sign(directionLocal.y);
  const stepZ = Math.sign(directionLocal.z);

  const tDeltaX = stepX !== 0 ? Math.abs(VOXEL_SIZE / directionLocal.x) : Infinity;
  const tDeltaY = stepY !== 0 ? Math.abs(VOXEL_SIZE / directionLocal.y) : Infinity;
  const tDeltaZ = stepZ !== 0 ? Math.abs(VOXEL_SIZE / directionLocal.z) : Infinity;

  let tMaxX = stepX > 0 ? (Math.floor(originLocal.x / VOXEL_SIZE) * VOXEL_SIZE + VOXEL_SIZE - originLocal.x) / directionLocal.x : (originLocal.x - Math.floor(originLocal.x / VOXEL_SIZE) * VOXEL_SIZE) / -directionLocal.x;
  let tMaxY = stepY > 0 ? (Math.floor(originLocal.y / VOXEL_SIZE) * VOXEL_SIZE + VOXEL_SIZE - originLocal.y) / directionLocal.y : (originLocal.y - Math.floor(originLocal.y / VOXEL_SIZE) * VOXEL_SIZE) / -directionLocal.y;
  let tMaxZ = stepZ > 0 ? (Math.floor(originLocal.z / VOXEL_SIZE) * VOXEL_SIZE + VOXEL_SIZE - originLocal.z) / directionLocal.z : (originLocal.z - Math.floor(originLocal.z / VOXEL_SIZE) * VOXEL_SIZE) / -directionLocal.z;

  if (isNaN(tMaxX)) tMaxX = Infinity;
  if (isNaN(tMaxY)) tMaxY = Infinity;
  if (isNaN(tMaxZ)) tMaxZ = Infinity;

  let prevX = x;
  let prevY = y;
  let prevZ = z;

  const maxSteps = Math.ceil(maxDistance / VOXEL_SIZE);

  for (let i = 0; i < maxSteps; i++) {
    // Check current voxel
    const cx = Math.floor(x / CHUNK_SIZE);
    const cy = Math.floor(y / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);

    let lx = x % CHUNK_SIZE; if (lx < 0) lx += CHUNK_SIZE;
    let ly = y % CHUNK_SIZE; if (ly < 0) ly += CHUNK_SIZE;
    let lz = z % CHUNK_SIZE; if (lz < 0) lz += CHUNK_SIZE;

    const chunk = voxelManager.getChunk(cx, cy, cz);
    if (chunk) {
      const block = chunk.getBlock(lx, ly, lz);
      if (block) {
        // Hit!
        const adjCx = Math.floor(prevX / CHUNK_SIZE);
        const adjCy = Math.floor(prevY / CHUNK_SIZE);
        const adjCz = Math.floor(prevZ / CHUNK_SIZE);
        let adjLx = prevX % CHUNK_SIZE; if (adjLx < 0) adjLx += CHUNK_SIZE;
        let adjLy = prevY % CHUNK_SIZE; if (adjLy < 0) adjLy += CHUNK_SIZE;
        let adjLz = prevZ % CHUNK_SIZE; if (adjLz < 0) adjLz += CHUNK_SIZE;

        return {
          hit: true,
          block,
          hitCx: cx, hitCy: cy, hitCz: cz,
          hitLx: lx, hitLy: ly, hitLz: lz,
          adjCx, adjCy, adjCz,
          adjLx, adjLy, adjLz
        };
      }
    }

    // Advance to next voxel
    prevX = x;
    prevY = y;
    prevZ = z;

    if (tMaxX < tMaxY) {
      if (tMaxX < tMaxZ) {
        x += stepX;
        tMaxX += tDeltaX;
      } else {
        z += stepZ;
        tMaxZ += tDeltaZ;
      }
    } else {
      if (tMaxY < tMaxZ) {
        y += stepY;
        tMaxY += tDeltaY;
      } else {
        z += stepZ;
        tMaxZ += tDeltaZ;
      }
    }
  }

  return { hit: false };
}

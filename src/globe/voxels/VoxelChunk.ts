import type { FirstPersonBuildingType } from '@/state/uiStore';

export const CHUNK_SIZE = 32;
export const VOXEL_SIZE = 1.0;

export interface VoxelBlock {
  type: FirstPersonBuildingType;
  id: string; // The original terra entity ID if synced, or a local ID
}

/**
 * A sparse representation of a 32x32x32 voxel chunk.
 */
export class VoxelChunk {
  public blocks: Map<number, VoxelBlock> = new Map();
  public isDirty = true;

  constructor(
    public readonly chunkX: number,
    public readonly chunkY: number,
    public readonly chunkZ: number
  ) {}

  /**
   * Get 1D index for local chunk coordinates (0-31)
   */
  public static getIndex(x: number, y: number, z: number): number {
    return x + y * CHUNK_SIZE + z * CHUNK_SIZE * CHUNK_SIZE;
  }

  public setBlock(x: number, y: number, z: number, block: VoxelBlock) {
    const idx = VoxelChunk.getIndex(x, y, z);
    this.blocks.set(idx, block);
    this.isDirty = true;
  }

  public removeBlock(x: number, y: number, z: number) {
    const idx = VoxelChunk.getIndex(x, y, z);
    if (this.blocks.delete(idx)) {
      this.isDirty = true;
    }
  }

  public getBlock(x: number, y: number, z: number): VoxelBlock | undefined {
    return this.blocks.get(VoxelChunk.getIndex(x, y, z));
  }
}

import { LruCache } from '@/utils/lruCache';
import { voxelRenderer } from './VoxelRenderer';

export class VoxelChunkManager {
  // Use LRU Cache to auto-evict old chunks. Limit to ~100 active chunks.
  public chunks = new LruCache<string, VoxelChunk>(100, (key, _chunk) => {
    // When a chunk is evicted from memory, remove its rendering primitives
    voxelRenderer.removeChunk(key);
  });

  public getChunkKey(cx: number, cy: number, cz: number): string {
    return `${cx},${cy},${cz}`;
  }

  public getChunk(cx: number, cy: number, cz: number): VoxelChunk | undefined {
    return this.chunks.get(this.getChunkKey(cx, cy, cz));
  }

  public getOrCreateChunk(cx: number, cy: number, cz: number): VoxelChunk {
    const key = this.getChunkKey(cx, cy, cz);
    let chunk = this.chunks.get(key);
    if (!chunk) {
      chunk = new VoxelChunk(cx, cy, cz);
      this.chunks.set(key, chunk);
    }
    return chunk;
  }
}

export const voxelManager = new VoxelChunkManager();

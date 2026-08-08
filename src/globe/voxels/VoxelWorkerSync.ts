import { workerPool } from '@/workers/WorkerPool';
import type { FirstPersonBuildingType } from '@/state/uiStore';

// Represents an optimized, zero-copy buffer message for sending voxel edits to workers
export interface VoxelEditMessage {
  type: 'VOXEL_EDIT_BATCH';
  // Float64Array to maintain global Cartesian3 precision if needed, 
  // or Int32Array for chunk coords + local coords
  coordinates: Int32Array; 
  // Uint8Array for block type IDs (enum mapping)
  blockTypes: Uint8Array;
}

const BLOCK_TYPE_MAP: Record<string, number> = {
  'air': 0,
  'house': 1,
  'castle': 2,
  'watchtower': 3,
  'gate': 4,
  'wall': 5,
  'road': 6,
  'flagpole': 7,
  'tree': 8,
};

class VoxelWorkerSyncManager {
  private pendingEdits: { cx: number, cy: number, cz: number, lx: number, ly: number, lz: number, type: FirstPersonBuildingType | 'air' }[] = [];
  private batchTimeout: ReturnType<typeof setTimeout> | null = null;

  /**
   * Queues a voxel edit. Batches rapid placements (e.g. dragging a line of blocks)
   * into a single zero-copy message to the Worker Pool.
   */
  public queueEdit(cx: number, cy: number, cz: number, lx: number, ly: number, lz: number, type: FirstPersonBuildingType | 'air') {
    this.pendingEdits.push({ cx, cy, cz, lx, ly, lz, type });

    if (!this.batchTimeout) {
      this.batchTimeout = setTimeout(() => this.flush(), 50); // 50ms batch window
    }
  }

  private async flush() {
    this.batchTimeout = null;
    if (this.pendingEdits.length === 0) return;

    const edits = [...this.pendingEdits];
    this.pendingEdits = [];

    // Serialize to TypedArrays for Transferable Objects (Zero-Copy)
    // 6 coordinates (cx, cy, cz, lx, ly, lz) per edit
    const coordsBuffer = new Int32Array(edits.length * 6);
    const typesBuffer = new Uint8Array(edits.length);

    for (let i = 0; i < edits.length; i++) {
      const e = edits[i]!;
      coordsBuffer[i * 6 + 0] = e.cx;
      coordsBuffer[i * 6 + 1] = e.cy;
      coordsBuffer[i * 6 + 2] = e.cz;
      coordsBuffer[i * 6 + 3] = e.lx;
      coordsBuffer[i * 6 + 4] = e.ly;
      coordsBuffer[i * 6 + 5] = e.lz;
      typesBuffer[i] = BLOCK_TYPE_MAP[e.type] ?? 0;
    }

    try {
      // If SharedArrayBuffer is available (requires cross-origin isolation headers),
      // we could use it here. For now, we use Transferable Objects for zero-copy.
      
      const pool = workerPool as any;
      if (typeof pool.dispatchVoxelEditBatch === 'function') {
         await pool.dispatchVoxelEditBatch(
           { type: 'VOXEL_EDIT_BATCH', coordinates: coordsBuffer, blockTypes: typesBuffer },
           [coordsBuffer.buffer, typesBuffer.buffer] // Transfer ownership!
         );
      }
    } catch (err) {
      console.warn('Failed to sync voxel edits to worker pool:', err);
    }
  }
}

export const voxelWorkerSync = new VoxelWorkerSyncManager();

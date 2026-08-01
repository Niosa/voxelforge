/**
 * walkStore — Zustand slice managing walk-mode lifecycle state.
 *
 * Kept separate from worldStore to avoid coupling Cesium globe state
 * to the noa voxel world state.
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { WalkAnchor, VoxelChunkMap } from '@/entities/types';

export type WalkPhase =
  | 'globe'          // normal Cesium globe view
  | 'transitioning'  // fade animation playing
  | 'walk';          // noa voxel world active

interface WalkState {
  phase: WalkPhase;
  anchor: WalkAnchor | null;
  /** Active block ID the player has selected to place. */
  selectedBlockId: number;
  /** Snapshot of chunks at walk-mode entry (for WalkScene seed). */
  entryChunks: VoxelChunkMap;

  // Actions
  beginDescent(anchor: WalkAnchor, chunks: VoxelChunkMap): void;
  confirmWalk(): void;
  beginAscent(): void;
  confirmGlobe(): void;
  setSelectedBlock(id: number): void;
}

export const useWalkStore = create<WalkState>()(
  immer((set) => ({
    phase: 'globe',
    anchor: null,
    selectedBlockId: 3, // default: grass
    entryChunks: {},

    beginDescent(anchor, chunks) {
      set((s) => {
        s.phase = 'transitioning';
        s.anchor = anchor;
        s.entryChunks = chunks;
      });
    },

    confirmWalk() {
      set((s) => { s.phase = 'walk'; });
    },

    beginAscent() {
      set((s) => { s.phase = 'transitioning'; });
    },

    confirmGlobe() {
      set((s) => {
        s.phase = 'globe';
        s.anchor = null;
        s.entryChunks = {};
      });
    },

    setSelectedBlock(id) {
      set((s) => { s.selectedBlockId = id; });
    },
  })),
);

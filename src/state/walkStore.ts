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
  | 'globe'
  | 'descending'
  | 'walk'
  | 'ascending'
  | 'error';

interface WalkState {
  phase: WalkPhase;
  anchor: WalkAnchor | null;
  /** Active block ID the player has selected to place. */
  selectedBlockId: number;
  /** Snapshot of chunks at walk-mode entry (for WalkScene seed). */
  entryChunks: VoxelChunkMap;
  error: string | null;

  // Actions
  beginDescent(anchor: WalkAnchor, chunks: VoxelChunkMap): void;
  confirmWalk(): void;
  beginAscent(): void;
  confirmGlobe(): void;
  failTransition(message: string): void;
  setSelectedBlock(id: number): void;
}

export const useWalkStore = create<WalkState>()(
  immer((set) => ({
    phase: 'globe',
    anchor: null,
    selectedBlockId: 3, // default: grass
    entryChunks: {},
    error: null,

    beginDescent(anchor, chunks) {
      set((s) => {
        if (s.phase !== 'globe') return;
        s.phase = 'descending';
        s.anchor = anchor;
        s.entryChunks = chunks;
        s.error = null;
      });
    },

    confirmWalk() {
      set((s) => {
        if (s.phase === 'descending') s.phase = 'walk';
      });
    },

    beginAscent() {
      set((s) => {
        if (s.phase === 'walk') s.phase = 'ascending';
      });
    },

    confirmGlobe() {
      set((s) => {
        if (s.phase !== 'ascending' && s.phase !== 'error') return;
        s.phase = 'globe';
        s.anchor = null;
        s.entryChunks = {};
        s.error = null;
      });
    },

    failTransition(message) {
      set((s) => {
        s.phase = 'error';
        s.error = message;
      });
    },

    setSelectedBlock(id) {
      set((s) => { s.selectedBlockId = id; });
    },
  })),
);

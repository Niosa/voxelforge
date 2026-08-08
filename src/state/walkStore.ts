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

export const DEFAULT_WALK_HOTBAR_IDS = [1, 2, 3, 4, 5, 11, 10, 23, 21] as const;

interface WalkState {
  phase: WalkPhase;
  anchor: WalkAnchor | null;
  /** Active block ID the player has selected to place. */
  selectedBlockId: number;
  hotbarIds: number[];
  activeHotbarIndex: number;
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
  selectHotbarSlot(index: number): void;
  assignHotbarSlot(index: number, blockId: number): void;
  swapHotbarSlots(fromIndex: number, toIndex: number): void;
  resetHotbarToDefault(): void;
  quickAssignBlock(blockId: number): void;
  cycleHotbar(direction: number): void;
}

export const useWalkStore = create<WalkState>()(
  immer((set) => ({
    phase: 'globe',
    anchor: null,
    selectedBlockId: 3, // default: grass
    hotbarIds: [...DEFAULT_WALK_HOTBAR_IDS],
    activeHotbarIndex: 2,
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
      set((s) => {
        s.selectedBlockId = id;
        const existing = s.hotbarIds.indexOf(id);
        if (existing >= 0) s.activeHotbarIndex = existing;
      });
    },

    selectHotbarSlot(index) {
      set((s) => {
        if (s.hotbarIds.length === 0) return;
        const safeIndex = ((Math.floor(index) % s.hotbarIds.length) + s.hotbarIds.length) % s.hotbarIds.length;
        s.activeHotbarIndex = safeIndex;
        s.selectedBlockId = s.hotbarIds[safeIndex]!;
      });
    },

    assignHotbarSlot(index, blockId) {
      set((s) => {
        if (index < 0 || index >= s.hotbarIds.length) return;
        s.hotbarIds[index] = blockId;
        s.activeHotbarIndex = index;
        s.selectedBlockId = blockId;
      });
    },

    swapHotbarSlots(fromIndex, toIndex) {
      set((s) => {
        if (
          fromIndex < 0 ||
          fromIndex >= s.hotbarIds.length ||
          toIndex < 0 ||
          toIndex >= s.hotbarIds.length
        ) return;
        const temp = s.hotbarIds[fromIndex]!;
        s.hotbarIds[fromIndex] = s.hotbarIds[toIndex]!;
        s.hotbarIds[toIndex] = temp;
        if (s.activeHotbarIndex === fromIndex) {
          s.activeHotbarIndex = toIndex;
        } else if (s.activeHotbarIndex === toIndex) {
          s.activeHotbarIndex = fromIndex;
        }
        s.selectedBlockId = s.hotbarIds[s.activeHotbarIndex]!;
      });
    },

    resetHotbarToDefault() {
      set((s) => {
        s.hotbarIds = [...DEFAULT_WALK_HOTBAR_IDS];
        s.activeHotbarIndex = 0;
        s.selectedBlockId = s.hotbarIds[0]!;
      });
    },

    quickAssignBlock(blockId) {
      set((s) => {
        const existing = s.hotbarIds.indexOf(blockId);
        if (existing >= 0) {
          s.activeHotbarIndex = existing;
          s.selectedBlockId = blockId;
        } else {
          s.hotbarIds[s.activeHotbarIndex] = blockId;
          s.selectedBlockId = blockId;
        }
      });
    },

    cycleHotbar(direction) {
      set((s) => {
        if (s.hotbarIds.length === 0 || direction === 0) return;
        const step = direction > 0 ? 1 : -1;
        s.activeHotbarIndex = (s.activeHotbarIndex + step + s.hotbarIds.length) % s.hotbarIds.length;
        s.selectedBlockId = s.hotbarIds[s.activeHotbarIndex]!;
      });
    },
  })),
);

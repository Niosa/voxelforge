/**
 * worldStore — primary Zustand world state.
 *
 * Manages the dictionary of TerraEntity objects, active world selection,
 * undo/redo command stack, and preset loading.
 *
 * patchWorld() added for walk-mode voxel chunk persistence.
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { ulid } from 'ulid';
import type { TerraEntity, World, ToolMode } from '@/entities/types';
import {
  createEarthWorld,
  createMiddleEarthWorld,
  createTemplateWorld,
} from '@/entities/samples';

const MAX_UNDO = 60;

/** Build the preset list once at module load. */
const SAMPLE_WORLDS: World[] = [
  createMiddleEarthWorld(),
  createTemplateWorld(),
  // Real-earth world kept as optional preset but not loaded by default
  // (voxelforge is fantasy-only; uncomment to restore)
  // createEarthWorld(),
];
// Suppress unused-import warning while keeping createEarthWorld importable
void createEarthWorld;

interface WorldStore {
  worlds: Record<string, World>;
  activeWorldId: string | null;
  tool: ToolMode;
  selectedEntityId: string | null;
  undoStack: World[][];
  redoStack: World[][];

  // World CRUD
  createWorld(name: string, seed?: number): string;
  deleteWorld(id: string): void;
  setActiveWorld(id: string): void;
  patchWorld(id: string, recipe: (w: World) => void): void;

  // Entity CRUD
  addEntity(worldId: string, entity: TerraEntity): void;
  updateEntity(worldId: string, entity: TerraEntity): void;
  deleteEntity(worldId: string, entityId: string): void;

  // UI
  setTool(tool: ToolMode): void;
  setSelectedEntity(id: string | null): void;

  // History
  undo(): void;
  redo(): void;

  // Presets
  loadPreset(presetId: string): void;
}

const initialWorlds = SAMPLE_WORLDS.reduce(
  (acc, w) => ({ ...acc, [w.id]: w }),
  {} as Record<string, World>,
);

export const useWorldStore = create<WorldStore>()(
  immer((set, get) => ({
    worlds: initialWorlds,
    activeWorldId: Object.keys(initialWorlds)[0] ?? null,
    tool: 'select',
    selectedEntityId: null,
    undoStack: [],
    redoStack: [],

    createWorld(name, seed) {
      const id = ulid();
      set((s) => {
        s.worlds[id] = {
          id,
          name,
          seed: seed ?? Math.floor(Math.random() * 999_999),
          entities: {},
          camera: { lon: 0, lat: 20, height: 12_000_000, heading: 0, pitch: -90 },
          version: 1,
          voxelChunks: {},
        };
        s.activeWorldId = id;
      });
      return id;
    },

    deleteWorld(id) {
      set((s) => {
        delete s.worlds[id];
        if (s.activeWorldId === id) {
          s.activeWorldId = Object.keys(s.worlds)[0] ?? null;
        }
      });
    },

    setActiveWorld(id) {
      set((s) => { s.activeWorldId = id; });
    },

    patchWorld(id, recipe) {
      set((s) => {
        const w = s.worlds[id];
        if (w) recipe(w);
      });
    },

    addEntity(worldId, entity) {
      set((s) => {
        const world = s.worlds[worldId];
        if (!world) return;
        const snapshot = JSON.parse(JSON.stringify(s.worlds)) as World[];
        s.undoStack.push(snapshot as unknown as World[]);
        if (s.undoStack.length > MAX_UNDO) s.undoStack.shift();
        s.redoStack = [];
        world.entities[entity.id] = entity;
        world.updatedAt = Date.now();
      });
    },

    updateEntity(worldId, entity) {
      set((s) => {
        const world = s.worlds[worldId];
        if (!world) return;
        const snapshot = JSON.parse(JSON.stringify(s.worlds)) as World[];
        s.undoStack.push(snapshot as unknown as World[]);
        if (s.undoStack.length > MAX_UNDO) s.undoStack.shift();
        s.redoStack = [];
        world.entities[entity.id] = { ...entity, updatedAt: Date.now() };
        world.updatedAt = Date.now();
      });
    },

    deleteEntity(worldId, entityId) {
      set((s) => {
        const world = s.worlds[worldId];
        if (!world) return;
        const snapshot = JSON.parse(JSON.stringify(s.worlds)) as World[];
        s.undoStack.push(snapshot as unknown as World[]);
        if (s.undoStack.length > MAX_UNDO) s.undoStack.shift();
        s.redoStack = [];
        delete world.entities[entityId];
        world.updatedAt = Date.now();
      });
    },

    setTool(tool) {
      set((s) => { s.tool = tool; });
    },

    setSelectedEntity(id) {
      set((s) => { s.selectedEntityId = id; });
    },

    undo() {
      set((s) => {
        const snap = s.undoStack.pop();
        if (!snap) return;
        const current = JSON.parse(JSON.stringify(s.worlds)) as World[];
        s.redoStack.push(current as unknown as World[]);
        s.worlds = snap as unknown as Record<string, World>;
      });
    },

    redo() {
      set((s) => {
        const snap = s.redoStack.pop();
        if (!snap) return;
        const current = JSON.parse(JSON.stringify(s.worlds)) as World[];
        s.undoStack.push(current as unknown as World[]);
        s.worlds = snap as unknown as Record<string, World>;
      });
    },

    loadPreset(presetId) {
      const preset = SAMPLE_WORLDS.find((w) => w.id === presetId);
      if (!preset) return;
      const id = ulid();
      const newWorld: World = {
        ...JSON.parse(JSON.stringify(preset)),
        id,
        name: `${preset.name} (copy)`,
        voxelChunks: {},
      };
      set((s) => {
        s.worlds[id] = newWorld;
        s.activeWorldId = id;
      });
    },
  })),
);

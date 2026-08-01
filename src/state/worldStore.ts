/**
 * worldStore — primary Zustand world state.
 *
 * Exposes a flat single-world API (s.world, s.selectedId, s.select, etc.)
 * that the existing codebase expects, while also supporting multi-world
 * management and voxel chunk persistence for walk mode.
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

/** Preset descriptor for the world picker UI. */
export interface SampleWorldPreset {
  id: string;
  name: string;
  description: string;
}

const PRESETS: World[] = [
  createMiddleEarthWorld(),
  createTemplateWorld(),
  createEarthWorld(),
];

export const SAMPLE_WORLD_PRESETS: SampleWorldPreset[] = PRESETS.map((w) => ({
  id: w.id,
  name: w.name,
  description: w.properties?.description as string ?? '',
}));

interface WorldStore {
  // ── Multi-world registry ──────────────────────────────────────────────
  worlds: Record<string, World>;
  activeWorldId: string | null;

  // ── Flat single-world API (computed from activeWorldId) ───────────────
  /** The currently active world object. Alias for worlds[activeWorldId]. */
  world: World;
  selectedId: string | null;
  tool: ToolMode;

  // ── Entity CRUD ───────────────────────────────────────────────────────
  select(id: string | null): void;
  upsertEntity(entity: TerraEntity): void;
  removeEntity(id: string): void;
  addEntity(worldId: string, entity: TerraEntity): void;
  updateEntity(worldId: string, entity: TerraEntity): void;
  deleteEntity(worldId: string, entityId: string): void;

  // ── World management ─────────────────────────────────────────────────
  createWorld(name: string, seed?: number): string;
  deleteWorld(id: string): void;
  setActiveWorld(id: string): void;
  setWorld(world: World): void;
  patchWorld(id: string, recipe: (w: World) => void): void;
  updateWorldProperties(props: Record<string, any>): void;
  renameActiveWorld(name: string): void;
  saveActiveWorld(): Promise<void>;
  initWorldFromPersistence(): void;
  loadSampleWorld(presetId: string): void;

  // ── UI ────────────────────────────────────────────────────────────────
  setTool(tool: ToolMode): void;

  // ── History ───────────────────────────────────────────────────────────
  undoStack: World[][];
  redoStack: World[][];
  undo(): void;
  redo(): void;
}

const _firstPreset = PRESETS[0];
const _initialWorlds = PRESETS.reduce(
  (acc, w) => ({ ...acc, [w.id]: w }),
  {} as Record<string, World>,
);

export const useWorldStore = create<WorldStore>()(
  immer((set, get) => ({
    worlds: _initialWorlds,
    activeWorldId: _firstPreset.id,

    // ── Computed flat alias ────────────────────────────────────────────
    get world(): World {
      const s = get();
      return s.worlds[s.activeWorldId!] ?? PRESETS[0];
    },

    selectedId: null,
    tool: 'select' as ToolMode,
    undoStack: [],
    redoStack: [],

    // ── Selection ─────────────────────────────────────────────────────
    select(id) {
      set((s) => { s.selectedId = id; });
    },

    // ── Flat entity CRUD (operate on active world) ─────────────────────
    upsertEntity(entity) {
      set((s) => {
        const w = s.worlds[s.activeWorldId!];
        if (!w) return;
        const snap = JSON.parse(JSON.stringify(s.worlds)) as typeof s.worlds;
        s.undoStack.push(snap as unknown as World[]);
        if (s.undoStack.length > MAX_UNDO) s.undoStack.shift();
        s.redoStack = [];
        w.entities[entity.id] = entity;
        w.updatedAt = Date.now();
      });
    },

    removeEntity(id) {
      set((s) => {
        const w = s.worlds[s.activeWorldId!];
        if (!w) return;
        const snap = JSON.parse(JSON.stringify(s.worlds)) as typeof s.worlds;
        s.undoStack.push(snap as unknown as World[]);
        if (s.undoStack.length > MAX_UNDO) s.undoStack.shift();
        s.redoStack = [];
        delete w.entities[id];
        w.updatedAt = Date.now();
      });
    },

    // ── worldId-scoped entity CRUD (for walk mode / internal use) ─────
    addEntity(worldId, entity) {
      set((s) => {
        const w = s.worlds[worldId];
        if (!w) return;
        w.entities[entity.id] = entity;
        w.updatedAt = Date.now();
      });
    },

    updateEntity(worldId, entity) {
      set((s) => {
        const w = s.worlds[worldId];
        if (!w) return;
        w.entities[entity.id] = { ...entity, updatedAt: Date.now() };
        w.updatedAt = Date.now();
      });
    },

    deleteEntity(worldId, entityId) {
      set((s) => {
        const w = s.worlds[worldId];
        if (!w) return;
        delete w.entities[entityId];
        w.updatedAt = Date.now();
      });
    },

    // ── World management ──────────────────────────────────────────────
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

    setWorld(world) {
      set((s) => {
        s.worlds[world.id] = world;
        s.activeWorldId = world.id;
      });
    },

    patchWorld(id, recipe) {
      set((s) => {
        const w = s.worlds[id];
        if (w) recipe(w);
      });
    },

    updateWorldProperties(props) {
      set((s) => {
        const w = s.worlds[s.activeWorldId!];
        if (!w) return;
        w.properties = { ...w.properties, ...props };
        w.updatedAt = Date.now();
      });
    },

    renameActiveWorld(name) {
      set((s) => {
        const w = s.worlds[s.activeWorldId!];
        if (w) w.name = name;
      });
    },

    async saveActiveWorld() {
      // Persistence layer hook — implement with IndexedDB/localStorage as needed.
      // No-op for now; prevents build errors in UI components.
    },

    initWorldFromPersistence() {
      // Called on app mount. Restore from localStorage/IndexedDB if available.
      // No-op for now — presets are loaded as defaults.
    },

    loadSampleWorld(presetId) {
      const preset = PRESETS.find((w) => w.id === presetId);
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

    // ── UI ────────────────────────────────────────────────────────────
    setTool(tool) {
      set((s) => { s.tool = tool; });
    },

    // ── History ───────────────────────────────────────────────────────
    undo() {
      set((s) => {
        const snap = s.undoStack.pop();
        if (!snap) return;
        const current = JSON.parse(JSON.stringify(s.worlds));
        s.redoStack.push(current as unknown as World[]);
        s.worlds = snap as unknown as Record<string, World>;
      });
    },

    redo() {
      set((s) => {
        const snap = s.redoStack.pop();
        if (!snap) return;
        const current = JSON.parse(JSON.stringify(s.worlds));
        s.undoStack.push(current as unknown as World[]);
        s.worlds = snap as unknown as Record<string, World>;
      });
    },
  })),
);

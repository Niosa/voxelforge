/**
 * worldStore — primary Zustand world state.
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
import {
  saveWorldToDB,
  loadWorldFromDB,
  getAllWorldsFromDB,
  deleteWorldFromDB,
} from '@/persistence/idb';

const MAX_UNDO = 60;

/** Preset descriptor for the world picker UI. */
export interface SampleWorldPreset {
  id: string;
  name: string;
  description: string;
}

// --- Preset builder helpers -------------------------------------------------

function buildBlankWorld(): World {
  return {
    id: 'blank-preset',
    name: 'Blank Globe',
    seed: 0,
    entities: {},
    camera: { lon: 0, lat: 20, height: 12_000_000, heading: 0, pitch: -90 },
    version: 1,
    voxelChunks: {},
  };
}

function buildEarthWorld(): World {
  const w = createEarthWorld();
  return { ...w, id: 'earth-preset' };
}

function buildMiddleEarthWorld(): World {
  const w = createMiddleEarthWorld();
  return { ...w, id: 'middle-earth-preset' };
}

function buildDemoWorld(): World {
  const w = createTemplateWorld();
  return { ...w, id: 'demo-preset', name: 'Demo Planet' };
}

function buildTemplateWorld(): World {
  const w = createTemplateWorld();
  return { ...w, id: 'template-preset' };
}

// Keyed by the short string the TopBar/WorldManager sends to loadSampleWorld.
const PRESET_BUILDERS: Record<string, () => World> = {
  earth: buildEarthWorld,
  'middle-earth': buildMiddleEarthWorld,
  demo: buildDemoWorld,
  template: buildTemplateWorld,
  blank: buildBlankWorld,
  // Legacy: also accept the stable IDs themselves
  'earth-preset': buildEarthWorld,
  'middle-earth-preset': buildMiddleEarthWorld,
  'demo-preset': buildDemoWorld,
  'template-preset': buildTemplateWorld,
  'blank-preset': buildBlankWorld,
};

/** Shown in WorldManagerModal preset buttons. */
export const SAMPLE_WORLD_PRESETS: SampleWorldPreset[] = [
  { id: 'middle-earth', name: '🗡️ Middle-earth (Arda)', description: 'Tolkien’s Arda' },
  { id: 'template', name: '🚀 Template Sci-Fi World', description: 'Sci-fi starter' },
];

interface WorldStore {
  worlds: Record<string, World>;
  activeWorldId: string | null;
  world: World;
  selectedId: string | null;
  tool: ToolMode;

  select(id: string | null): void;
  upsertEntity(entity: TerraEntity): void;
  removeEntity(id: string): void;
  addEntity(worldId: string, entity: TerraEntity): void;
  updateEntity(worldId: string, entity: TerraEntity): void;
  deleteEntity(worldId: string, entityId: string): void;

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

  setTool(tool: ToolMode): void;

  undoStack: World[][];
  redoStack: World[][];
  undo(): void;
  redo(): void;
}

const _defaultWorld = buildEarthWorld();
const _initialWorlds: Record<string, World> = {
  [_defaultWorld.id]: _defaultWorld,
};

export const useWorldStore = create<WorldStore>()(
  immer((set, get) => ({
    worlds: _initialWorlds,
    activeWorldId: _defaultWorld.id,

    get world(): World {
      const s = get();
      return s.worlds[s.activeWorldId!] ?? _defaultWorld;
    },

    selectedId: null,
    tool: 'select' as ToolMode,
    undoStack: [],
    redoStack: [],

    select(id) {
      set((s) => { s.selectedId = id; });
    },

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
      deleteWorldFromDB(id).catch(() => {});
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
      const w = get().world;
      if (w) await saveWorldToDB(w);
    },

    initWorldFromPersistence() {
      // Fire-and-forget: load all persisted worlds from IndexedDB and merge
      // them into the store, then set the most-recently-updated one as active.
      getAllWorldsFromDB().then(async (summaries) => {
        if (!summaries.length) return;

        const loaded: World[] = [];
        for (const s of summaries) {
          const w = await loadWorldFromDB(s.id);
          if (w) loaded.push(w);
        }
        if (!loaded.length) return;

        // Sort by most recently updated
        loaded.sort((a, b) => ((b as any).updatedAt ?? 0) - ((a as any).updatedAt ?? 0));
        const most_recent = loaded[0]!;

        set((st) => {
          for (const w of loaded) {
            st.worlds[w.id] = w;
          }
          st.activeWorldId = most_recent.id;
        });
      }).catch(() => { /* persistence not available */ });
    },

    loadSampleWorld(presetId) {
      const builder = PRESET_BUILDERS[presetId];
      if (!builder) {
        console.warn('Unknown preset:', presetId);
        return;
      }
      const preset = builder();
      // Give the copy a fresh ULID so it doesn’t clobber the keyed preset
      const id = ulid();
      const newWorld: World = {
        ...JSON.parse(JSON.stringify(preset)),
        id,
        name: preset.name === 'Blank Globe' ? 'Blank Globe' : `${preset.name} (copy)`,
        voxelChunks: {},
      };
      set((s) => {
        s.worlds[id] = newWorld;
        s.activeWorldId = id;
      });
    },

    setTool(tool) {
      set((s) => { s.tool = tool; });
    },

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

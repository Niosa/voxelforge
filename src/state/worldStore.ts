/**
 * worldStore — primary Zustand world state.
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { ulid } from 'ulid';
import type { TerraEntity, World, ToolMode } from '@/entities/types';
import {
  createMiddleEarthWorld,
  createTemplateWorld,
} from '@/entities/samples';
import {
  saveWorldToDB,
  loadWorldFromDB,
  getAllWorldsFromDB,
  deleteWorldFromDB,
} from '@/persistence/idb';
import { repairAntimeridianGeometry } from '@/geo/antimeridian';

const MAX_UNDO = 60;

function repairLegacyFreehandGeometry(world: World): World {
  for (const entity of Object.values(world.entities)) {
    if (entity.geometry.type === 'Polygon' || entity.geometry.type === 'MultiPolygon') {
      entity.geometry = repairAntimeridianGeometry(entity.geometry);
    }
  }
  return world;
}

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
    seed: 10001,
    entities: {},
    updatedAt: Date.now(),
    camera: { lon: -40, lat: 10, height: 12_500_000, heading: 0, pitch: -90 },
    version: 1,
    voxelChunks: {},
  };
}

function buildMiddleEarthWorld(): World {
  const w = createMiddleEarthWorld();
  return { ...w, id: 'middle-earth-preset', updatedAt: Date.now() };
}

function buildDemoWorld(): World {
  const w = createTemplateWorld();
  return { ...w, id: 'demo-preset', name: 'Demo Planet', updatedAt: Date.now(), camera: { lon: 80, lat: 25, height: 6_000_000, heading: 0, pitch: -90 } };
}

function buildTemplateWorld(): World {
  const w = createTemplateWorld();
  return { ...w, id: 'template-preset', updatedAt: Date.now(), camera: { lon: 10, lat: 17, height: 2_500_000, heading: 0, pitch: -75 } };
}

// Keyed by the short string the TopBar/WorldManager sends to loadSampleWorld.
const PRESET_BUILDERS: Record<string, () => World> = {
  earth: buildMiddleEarthWorld,
  'middle-earth': buildMiddleEarthWorld,
  demo: buildDemoWorld,
  template: buildTemplateWorld,
  blank: buildBlankWorld,
  // Legacy: also accept the stable IDs themselves
  'earth-preset': buildMiddleEarthWorld,
  'middle-earth-preset': buildMiddleEarthWorld,
  'demo-preset': buildDemoWorld,
  'template-preset': buildTemplateWorld,
  'blank-preset': buildBlankWorld,
};

/**
 * Canonical preset key for a given raw presetId argument.
 * Strips the '-preset' suffix so both 'earth' and 'earth-preset' resolve to 'earth'.
 */
function canonicalPresetKey(presetId: string): string {
  return presetId.replace(/-preset$/, '');
}

/** Shown in WorldManagerModal preset buttons. */
export const SAMPLE_WORLD_PRESETS: SampleWorldPreset[] = [
  { id: 'middle-earth', name: '🗡️ Middle-earth (Arda)', description: "Tolkien's Arda" },
  { id: 'template', name: '🚀 Template Sci-Fi World', description: 'Sci-fi starter' },
  { id: 'demo', name: '✨ Demo Planet', description: 'Pre-populated showcase' },
  { id: 'blank', name: '➕ Blank Globe', description: 'Empty canvas' },
];

interface WorldStore {
  worlds: Record<string, World>;
  activeWorldId: string | null;
  world: World;
  selectedId: string | null;
  tool: ToolMode;
  persistenceReady: boolean;

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

const ACTIVE_WORLD_KEY = 'voxelforge_active_world_id';

function getStoredActiveWorldId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(ACTIVE_WORLD_KEY);
  } catch (_) {
    return null;
  }
}

function setStoredActiveWorldId(id: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(ACTIVE_WORLD_KEY, id);
  } catch (_) {}
}

// Start with a blank globe so the world getter never falls back to Middle-earth
// entities before IndexedDB persistence has resolved (Bug 2 fix).
const _defaultWorld = buildBlankWorld();

// Pre-populate the worlds map with both the blank default AND the stored active
// preset (if it resolves to a known builder). This prevents the world getter's
// fallback to Object.keys()[0] from returning the wrong world (Bug 3 fix).
const initialStoredId = getStoredActiveWorldId();
const _initialWorlds: Record<string, World> = {
  [_defaultWorld.id]: _defaultWorld,
};
if (initialStoredId && initialStoredId !== _defaultWorld.id) {
  if (PRESET_BUILDERS[initialStoredId]) {
    // Synchronously seed the store with the correct preset world so GlobeView's
    // first render uses the right entities instead of the blank fallback.
    _initialWorlds[initialStoredId] = PRESET_BUILDERS[initialStoredId]!();
  }
}
const initialActiveId = initialStoredId && _initialWorlds[initialStoredId]
  ? initialStoredId
  : _defaultWorld.id;

export const useWorldStore = create<WorldStore>()(
  immer((set, get) => ({
    worlds: _initialWorlds,
    activeWorldId: initialActiveId,

    world: _initialWorlds[initialActiveId] ?? _defaultWorld,

    selectedId: null,
    tool: 'select' as ToolMode,
    persistenceReady: false,
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
        s.world = w;
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
        s.world = w;
      });
    },

    addEntity(worldId, entity) {
      set((s) => {
        const w = s.worlds[worldId];
        if (!w) return;
        w.entities[entity.id] = entity;
        w.updatedAt = Date.now();
        if (s.activeWorldId === worldId) s.world = w;
      });
    },

    updateEntity(worldId, entity) {
      set((s) => {
        const w = s.worlds[worldId];
        if (!w) return;
        w.entities[entity.id] = { ...entity, updatedAt: Date.now() };
        w.updatedAt = Date.now();
        if (s.activeWorldId === worldId) s.world = w;
      });
    },

    deleteEntity(worldId, entityId) {
      set((s) => {
        const w = s.worlds[worldId];
        if (!w) return;
        delete w.entities[entityId];
        w.updatedAt = Date.now();
        if (s.activeWorldId === worldId) s.world = w;
      });
    },

    createWorld(name, seed) {
      const id = ulid();
      const now = Date.now();
      const newWorld: World = {
        id,
        name,
        seed: seed ?? Math.floor(Math.random() * 999_999),
        entities: {},
        camera: { lon: 0, lat: 20, height: 12_000_000, heading: 0, pitch: -90 },
        version: 1,
        voxelChunks: {},
        updatedAt: now,
      };
      set((s) => {
        s.worlds[id] = newWorld;
        s.activeWorldId = id;
        s.world = newWorld;
      });
      setStoredActiveWorldId(id);
      saveWorldToDB(newWorld).catch(() => {});
      return id;
    },

    deleteWorld(id) {
      set((s) => {
        delete s.worlds[id];
        if (s.activeWorldId === id) {
          const remainingKeys = Object.keys(s.worlds);
          if (remainingKeys.length > 0) {
            s.activeWorldId = remainingKeys[0]!;
          } else {
            const freshBlank = buildBlankWorld();
            s.worlds[freshBlank.id] = freshBlank;
            s.activeWorldId = freshBlank.id;
          }
          setStoredActiveWorldId(s.activeWorldId);
        }
        s.world = s.worlds[s.activeWorldId!] ?? _defaultWorld;
      });
      deleteWorldFromDB(id).catch(() => {});
    },

    setActiveWorld(id) {
      set((s) => {
        s.activeWorldId = id;
        const w = s.worlds[id];
        if (w) {
          w.updatedAt = Date.now();
          s.world = w;
        }
      });
      setStoredActiveWorldId(id);
      const w = get().worlds[id];
      if (w) saveWorldToDB(w).catch(() => {});
    },

    setWorld(world) {
      repairLegacyFreehandGeometry(world);
      set((s) => {
        s.worlds[world.id] = { ...world, updatedAt: Date.now() };
        s.activeWorldId = world.id;
        s.world = s.worlds[world.id]!;
      });
      setStoredActiveWorldId(world.id);
      saveWorldToDB(world).catch(() => {});
    },

    patchWorld(id, recipe) {
      set((s) => {
        const w = s.worlds[id];
        if (w) {
          recipe(w);
          w.updatedAt = Date.now();
          if (s.activeWorldId === id) s.world = w;
        }
      });
      const updated = get().worlds[id];
      if (updated) saveWorldToDB(updated).catch(() => {});
    },

    updateWorldProperties(props) {
      set((s) => {
        const w = s.worlds[s.activeWorldId!];
        if (!w) return;
        w.properties = { ...w.properties, ...props };
        w.updatedAt = Date.now();
        s.world = w;
      });
      const w = get().world;
      if (w) saveWorldToDB(w).catch(() => {});
    },

    renameActiveWorld(name) {
      set((s) => {
        const w = s.worlds[s.activeWorldId!];
        if (w) {
          w.name = name;
          w.updatedAt = Date.now();
          s.world = w;
        }
      });
      const w = get().world;
      if (w) saveWorldToDB(w).catch(() => {});
    },

    async saveActiveWorld() {
      const activeId = get().activeWorldId;
      if (!activeId) return;
      const w = get().worlds[activeId];
      if (w) await saveWorldToDB(w);
    },

    initWorldFromPersistence() {
      getAllWorldsFromDB().then(async (summaries) => {
        if (!summaries.length) return;

        const loaded: World[] = [];
        for (const s of summaries) {
          const w = await loadWorldFromDB(s.id);
          if (w) loaded.push(repairLegacyFreehandGeometry(w));
        }
        if (!loaded.length) return;

        // Sort by most recently updated
        loaded.sort((a, b) => ((b as any).updatedAt ?? 0) - ((a as any).updatedAt ?? 0));

        set((st) => {
          for (const w of loaded) {
            // If loaded world is a sample preset, refresh it with factory builder but preserve user entities
            if (PRESET_BUILDERS[w.id]) {
              const fresh = PRESET_BUILDERS[w.id]!();
              const hasUserEntities = w.entities && Object.keys(w.entities).length > 0;
              st.worlds[w.id] = {
                ...fresh,
                entities: hasUserEntities ? w.entities : fresh.entities,
                voxelChunks: w.voxelChunks ?? {},
                generatedVoxelChunks: w.generatedVoxelChunks ?? {},
                walkAnchor: w.walkAnchor,
                npcs: w.npcs ?? fresh.npcs,
                mobs: w.mobs ?? fresh.mobs,
                updatedAt: w.updatedAt ?? Date.now(),
              };
            } else {
              st.worlds[w.id] = w;
            }
          }

          const stored = getStoredActiveWorldId();
          if (stored && st.worlds[stored]) {
            st.activeWorldId = stored;
          } else if (!st.activeWorldId || !st.worlds[st.activeWorldId]) {
            st.activeWorldId = loaded[0]!.id;
            setStoredActiveWorldId(st.activeWorldId);
          }

          // Stamp a fresh updatedAt so GlobeView's [world?.updatedAt] dep always
          // detects the persistence-load swap even when the world ID hasn't changed.
          const activeW = st.worlds[st.activeWorldId!];
          if (activeW) {
            activeW.updatedAt = Date.now();
            st.world = activeW;
          }
        });
      }).catch(() => { /* persistence not available */ }).finally(() => {
        set((st) => { st.persistenceReady = true; });
      });
    },

    loadSampleWorld(presetId) {
      const builder = PRESET_BUILDERS[presetId];
      if (!builder) {
        console.warn('Unknown preset:', presetId);
        return;
      }
      const canonicalKey = canonicalPresetKey(presetId);
      const stableId = `${canonicalKey}-preset`;

      // Always instantiate fresh preset world to ensure presets (e.g. Blank Globe, Template)
      // are never polluted by stale persisted data in IndexedDB
      const preset = builder();
      const now = Date.now();
      const newWorld: World = {
        ...JSON.parse(JSON.stringify(preset)),
        id: stableId,
        updatedAt: now,
        properties: {
          ...(preset.properties ?? {}),
          sourcePresetId: canonicalKey,
        },
      };
      set((s) => {
        s.worlds[stableId] = newWorld;
        s.activeWorldId = stableId;
        s.world = newWorld;
      });
      setStoredActiveWorldId(stableId);
      saveWorldToDB(newWorld).catch(() => {});
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
        s.world = s.worlds[s.activeWorldId!] ?? s.worlds[Object.keys(s.worlds)[0]!] ?? _defaultWorld;
      });
    },

    redo() {
      set((s) => {
        const snap = s.redoStack.pop();
        if (!snap) return;
        const current = JSON.parse(JSON.stringify(s.worlds));
        s.undoStack.push(current as unknown as World[]);
        s.worlds = snap as unknown as Record<string, World>;
        s.world = s.worlds[s.activeWorldId!] ?? s.worlds[Object.keys(s.worlds)[0]!] ?? _defaultWorld;
      });
    },
  })),
);

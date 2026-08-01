import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { TerraEntity, World } from '@/entities/types';
import { createEmptyWorld, createSampleContinent } from '@/entities/factory';
import { createEarthWorld, createMiddleEarthWorld, createTemplateWorld } from '@/entities/samples';
import { setGlobeImageryStyle, setFantasyWorldFlag } from '@/globe/CesiumViewer';
import { saveWorldToDB, loadWorldFromDB } from '@/persistence/idb';

export type SampleWorldPreset = 'earth' | 'middle-earth' | 'demo' | 'blank' | 'template';

const LAST_ACTIVE_WORLD_KEY = 'terraforge_last_active_world_id';

let saveTimeout: ReturnType<typeof setTimeout> | null = null;

function scheduleDebouncedSave(world: World): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(LAST_ACTIVE_WORLD_KEY, world.id);
  }
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    saveWorldToDB(world);
  }, 400);
}

interface WorldState {
  world: World;
  selectedId: string | null;
  setWorld: (world: World) => void;
  renameActiveWorld: (newName: string) => void;
  saveActiveWorld: () => Promise<void>;
  initWorldFromPersistence: () => Promise<void>;
  select: (id: string | null) => void;
  upsertEntity: (entity: TerraEntity) => void;
  removeEntity: (id: string) => void;
  updateEntity: (id: string, patch: Partial<TerraEntity>) => void;
  updateWorldProperties: (props: Record<string, any>) => void;
  loadDemo: () => void;
  loadSampleWorld: (preset: SampleWorldPreset) => void;
}

export const useWorldStore = create<WorldState>()(
  immer((set, get) => ({
    world: createEmptyWorld(),
    selectedId: null,

    initWorldFromPersistence: async () => {
      try {
        const lastId = typeof localStorage !== 'undefined' ? localStorage.getItem(LAST_ACTIVE_WORLD_KEY) : null;
        if (lastId) {
          const loaded = await loadWorldFromDB(lastId);
          if (loaded) {
            const isEarth = loaded.id === 'earth-preset' || loaded.name.toLowerCase().includes('real earth');
            const isFantasy = !isEarth;
            setFantasyWorldFlag(isFantasy);
            set((s) => {
              s.world = loaded;
              s.selectedId = Object.keys(loaded.entities)[0] ?? null;
            });
            if (isFantasy) {
              setGlobeImageryStyle('satellite', loaded.entities, loaded.properties?.theme || 'medieval');
            } else {
              setGlobeImageryStyle('satellite');
            }
            return;
          }
        }
      } catch (err) {
        console.warn('Could not auto-restore last active world:', err);
      }

      // Fallback if no persisted world exists: load Real Earth
      const defaultWorld = createEarthWorld();
      setFantasyWorldFlag(false);
      setGlobeImageryStyle('satellite');
      set((s) => {
        s.world = defaultWorld;
      });
    },

    setWorld: (world) => {
      if (saveTimeout) clearTimeout(saveTimeout);
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(LAST_ACTIVE_WORLD_KEY, world.id);
      }
      saveWorldToDB(world);
      set((s) => {
        s.world = world;
        s.selectedId = null;
      });
    },

    renameActiveWorld: (newName) => {
      const trimmed = newName.trim();
      if (!trimmed) return;
      set((s) => {
        s.world.name = trimmed;
        s.world.updatedAt = Date.now();
      });
      scheduleDebouncedSave(get().world);
    },

    saveActiveWorld: async () => {
      if (saveTimeout) clearTimeout(saveTimeout);
      const current = get().world;
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(LAST_ACTIVE_WORLD_KEY, current.id);
      }
      await saveWorldToDB(current);
    },

    select: (id) =>
      set((s) => {
        s.selectedId = id;
      }),

    upsertEntity: (entity) => {
      set((s) => {
        s.world.entities[entity.id] = entity;
        s.world.updatedAt = Date.now();
      });
      scheduleDebouncedSave(get().world);
    },

    removeEntity: (id) => {
      set((s) => {
        delete s.world.entities[id];
        if (s.selectedId === id) s.selectedId = null;
        s.world.updatedAt = Date.now();
      });
      scheduleDebouncedSave(get().world);
    },

    updateEntity: (id, patch) => {
      set((s) => {
        const existing = s.world.entities[id];
        if (!existing) return;
        s.world.entities[id] = {
          ...existing,
          ...patch,
          id: existing.id,
          updatedAt: Date.now(),
        };
        s.world.updatedAt = Date.now();
      });
      scheduleDebouncedSave(get().world);
    },

    updateWorldProperties: (props) => {
      set((s) => {
        s.world.properties = {
          ...s.world.properties,
          ...props,
        };
        s.world.updatedAt = Date.now();
      });
      scheduleDebouncedSave(get().world);
    },

    loadDemo: () => {
      const continent = createSampleContinent();
      const newWorld = createEmptyWorld('Aetherra Demo');
      newWorld.properties = { theme: 'modern' };
      newWorld.entities[continent.id] = continent;
      setFantasyWorldFlag(true);
      setGlobeImageryStyle('satellite', newWorld.entities, 'modern');
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(LAST_ACTIVE_WORLD_KEY, newWorld.id);
      }
      saveWorldToDB(newWorld);
      set((s) => {
        s.world = newWorld;
        s.selectedId = continent.id;
      });
    },

    loadSampleWorld: (preset) => {
      let newWorld: World;
      if (preset === 'earth') {
        newWorld = createEarthWorld();
        setFantasyWorldFlag(false);
        setGlobeImageryStyle('satellite');
      } else if (preset === 'middle-earth') {
        newWorld = createMiddleEarthWorld();
        newWorld.properties = { theme: 'medieval' };
        setFantasyWorldFlag(true);
        setGlobeImageryStyle('satellite', newWorld.entities, 'medieval');
      } else if (preset === 'demo') {
        const continent = createSampleContinent();
        newWorld = createEmptyWorld('Aetherra Demo');
        newWorld.properties = { theme: 'modern' };
        newWorld.entities[continent.id] = continent;
        setFantasyWorldFlag(true);
        setGlobeImageryStyle('satellite', newWorld.entities, 'modern');
      } else if (preset === 'template') {
        newWorld = createTemplateWorld();
        setFantasyWorldFlag(true);
        setGlobeImageryStyle('satellite', newWorld.entities, 'modern');
      } else {
        newWorld = createEmptyWorld();
        newWorld.properties = { theme: 'modern' };
        setFantasyWorldFlag(true);
        setGlobeImageryStyle('satellite', newWorld.entities, 'modern');
      }
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(LAST_ACTIVE_WORLD_KEY, newWorld.id);
      }
      saveWorldToDB(newWorld);
      set((s) => {
        s.world = newWorld;
        const firstId = Object.keys(newWorld.entities)[0] ?? null;
        s.selectedId = firstId;
      });
    },
  })),
);

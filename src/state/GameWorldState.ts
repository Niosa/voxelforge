import { create } from 'zustand';

export interface GameWorldStore {
  stamina: number;
  maxStamina: number;
  timeOfDayHours: number; // 0 to 24
  discoveredTerritories: Set<string>;
  activeNotification: string | null;

  setStamina: (val: number) => void;
  setTimeOfDay: (hours: number) => void;
  discoverTerritory: (name: string) => void;
  clearNotification: () => void;
}

export const useGameWorldStore = create<GameWorldStore>((set, get) => ({
  stamina: 100,
  maxStamina: 100,
  timeOfDayHours: 12.0,
  discoveredTerritories: new Set<string>(),
  activeNotification: null,

  setStamina: (val) => set({ stamina: Math.max(0, Math.min(100, val)) }),

  setTimeOfDay: (hours) => set({ timeOfDayHours: (hours + 24) % 24 }),

  discoverTerritory: (name) => {
    const set_t = get().discoveredTerritories;
    if (!set_t.has(name)) {
      const next = new Set(set_t);
      next.add(name);
      set({
        discoveredTerritories: next,
        activeNotification: `📍 Discovered New Territory: ${name}`,
      });
      setTimeout(() => {
        if (get().activeNotification?.includes(name)) {
          set({ activeNotification: null });
        }
      }, 4000);
    }
  },

  clearNotification: () => set({ activeNotification: null }),
}));

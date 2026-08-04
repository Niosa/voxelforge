import { create } from 'zustand';
import type { ToolMode, EntityType } from '@/entities/types';
import { getInitialPerformanceMode, persistPerformanceMode } from '@/state/performanceMode';

const HAS_SEEN_TUTORIAL_KEY = 'terraforge_seen_tutorial_v1';

export type BorderStyle = 'google-earth' | 'glowing-neon' | 'subtle-white' | 'vintage-ink';
export type FirstPersonBuildingType =
  | 'castle'
  | 'watchtower'
  | 'house'
  | 'wall'
  | 'gate'
  | 'road'
  | 'flagpole'
  | 'tree'
  | 'stone'
  | 'dirt'
  | 'grass'
  | 'sand'
  | 'wood'
  | 'water'
  | 'snow'
  | 'obsidian'
  | 'glass'
  | 'brick'
  | 'marble'
  | 'gold_block'
  | 'emerald'
  | 'diamond'
  | 'cyber_cyan'
  | 'cyber_pink'
  | 'torch'
  | 'thatch_roof'
  | 'blueprint_tower'
  | 'blueprint_cottage'
  | 'blueprint_windmill'
  | 'blueprint_fountain';

export type WeatherType = 'clear' | 'rain' | 'snow' | 'fog' | 'storm';

interface UiState {
  tool: ToolMode;
  creationEntityType: EntityType;
  smartBordersEnabled: boolean;
  inspectorOpen: boolean;
  fpsVisible: boolean;
  tutorialOpen: boolean;
  fantasyBuildingsEnabled: boolean;
  showCountryBorders: boolean;
  showRegionBorders: boolean;
  showCityBorders: boolean;
  borderStyle: BorderStyle;
  frustumCullingEnabled: boolean;
  performanceMode: boolean;
  islandFreehandEnabled: boolean;
  hamburgerMenuOpen: boolean;
  projectSettingsOpen: boolean;
  firstPersonActive: boolean;
  firstPersonBuildingType: FirstPersonBuildingType;
  trafficEnabled: boolean;

  // New Features State
  creativeInventoryOpen: boolean;
  timeOfDay: number; // 0 to 24 hours
  weatherType: WeatherType;
  soundMuted: boolean;
  realmStatsOpen: boolean;
  cinematicTourActive: boolean;
  mapExportOpen: boolean;
  questModeActive: boolean;
  activeRelicCount: number;

  setTool: (tool: ToolMode) => void;
  setCreationEntityType: (type: EntityType) => void;
  setSmartBordersEnabled: (enabled: boolean) => void;
  setInspectorOpen: (open: boolean) => void;
  setProjectSettingsOpen: (open: boolean) => void;
  setTutorialOpen: (open: boolean) => void;
  setFantasyBuildingsEnabled: (enabled: boolean) => void;
  setTrafficEnabled: (enabled: boolean) => void;
  setShowCountryBorders: (show: boolean) => void;
  setShowRegionBorders: (show: boolean) => void;
  setShowCityBorders: (show: boolean) => void;
  setBorderStyle: (style: BorderStyle) => void;
  setFrustumCullingEnabled: (enabled: boolean) => void;
  setPerformanceMode: (on: boolean) => void;
  setIslandFreehandEnabled: (enabled: boolean) => void;
  setHamburgerMenuOpen: (open: boolean) => void;
  setFirstPersonActive: (active: boolean) => void;
  setFirstPersonBuildingType: (type: FirstPersonBuildingType) => void;
  setCreativeInventoryOpen: (open: boolean) => void;
  setTimeOfDay: (time: number) => void;
  setWeatherType: (weather: WeatherType) => void;
  setSoundMuted: (muted: boolean) => void;
  setRealmStatsOpen: (open: boolean) => void;
  setCinematicTourActive: (active: boolean) => void;
  setMapExportOpen: (open: boolean) => void;
  setQuestModeActive: (active: boolean) => void;
  setActiveRelicCount: (count: number) => void;
  markTutorialSeen: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  tool: 'select',
  creationEntityType: 'continent',
  smartBordersEnabled: true,
  inspectorOpen: true,
  fpsVisible: import.meta.env.DEV,
  tutorialOpen: typeof localStorage !== 'undefined' ? !localStorage.getItem(HAS_SEEN_TUTORIAL_KEY) : false,
  fantasyBuildingsEnabled: true,
  trafficEnabled: true,
  showCountryBorders: true,
  showRegionBorders: true,
  showCityBorders: getInitialPerformanceMode() ? false : true,
  borderStyle: 'google-earth',
  frustumCullingEnabled: false,
  performanceMode: getInitialPerformanceMode(),
  islandFreehandEnabled: false,
  hamburgerMenuOpen: false,
  projectSettingsOpen: false,
  firstPersonActive: false,
  firstPersonBuildingType: 'house',

  creativeInventoryOpen: false,
  timeOfDay: 14.0, // 2:00 PM default
  weatherType: 'clear',
  soundMuted: false,
  realmStatsOpen: false,
  cinematicTourActive: false,
  mapExportOpen: false,
  questModeActive: false,
  activeRelicCount: 0,

  setTool: (tool) => set({ tool }),
  setCreationEntityType: (creationEntityType) => set({ creationEntityType }),
  setSmartBordersEnabled: (smartBordersEnabled) => set({ smartBordersEnabled }),
  setInspectorOpen: (inspectorOpen) => set({ inspectorOpen }),
  setProjectSettingsOpen: (projectSettingsOpen) => set({ projectSettingsOpen }),
  setTutorialOpen: (tutorialOpen) => {
    if (!tutorialOpen && typeof localStorage !== 'undefined') {
      localStorage.setItem(HAS_SEEN_TUTORIAL_KEY, 'true');
    }
    set({ tutorialOpen });
  },
  setFantasyBuildingsEnabled: (fantasyBuildingsEnabled) => set({ fantasyBuildingsEnabled }),
  setTrafficEnabled: (trafficEnabled) => set({ trafficEnabled }),
  setShowCountryBorders: (showCountryBorders) => set({ showCountryBorders }),
  setShowRegionBorders: (showRegionBorders) => set({ showRegionBorders }),
  setShowCityBorders: (showCityBorders) => set({ showCityBorders }),
  setBorderStyle: (borderStyle) => set({ borderStyle }),
  setFrustumCullingEnabled: (frustumCullingEnabled) => set({ frustumCullingEnabled }),
  setPerformanceMode: (performanceMode) => {
    persistPerformanceMode(performanceMode);
    set({ performanceMode });
  },
  setIslandFreehandEnabled: (islandFreehandEnabled) => set({ islandFreehandEnabled }),
  setHamburgerMenuOpen: (hamburgerMenuOpen) => set({ hamburgerMenuOpen }),
  setFirstPersonActive: (firstPersonActive) => set({ firstPersonActive }),
  setFirstPersonBuildingType: (firstPersonBuildingType) => set({ firstPersonBuildingType }),
  setCreativeInventoryOpen: (creativeInventoryOpen) => set({ creativeInventoryOpen }),
  setTimeOfDay: (timeOfDay) => set({ timeOfDay }),
  setWeatherType: (weatherType) => set({ weatherType }),
  setSoundMuted: (soundMuted) => set({ soundMuted }),
  setRealmStatsOpen: (realmStatsOpen) => set({ realmStatsOpen }),
  setCinematicTourActive: (cinematicTourActive) => set({ cinematicTourActive }),
  setMapExportOpen: (mapExportOpen) => set({ mapExportOpen }),
  setQuestModeActive: (questModeActive) => set({ questModeActive }),
  setActiveRelicCount: (activeRelicCount) => set({ activeRelicCount }),
  markTutorialSeen: () => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(HAS_SEEN_TUTORIAL_KEY, 'true');
    }
    set({ tutorialOpen: false });
  },
}));

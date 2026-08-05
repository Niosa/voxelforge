import { create } from 'zustand';
import type { ToolMode, EntityType } from '@/entities/types';
import type { BiomeType } from '@/geo/biomeTexture';
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

export type TerrainTopography = 'plains' | 'hills' | 'mountains' | 'valleys';
export type TerrainClimate = 'temperate' | 'tropical' | 'arid' | 'frigid' | 'swamp';
export type SettlementDensity = 'rural' | 'low' | 'medium' | 'high' | 'metropolitan';
export type SettlementZoning = 'mixed' | 'residential' | 'commercial' | 'industrial' | 'downtown';

export interface CreationSettings {
  biome: BiomeType;
  topography: TerrainTopography;
  climate: TerrainClimate;
  reliefHeight: number;
  settlementDensity: SettlementDensity;
  settlementZoning: SettlementZoning;
  generate3DBuildings: boolean;
}

interface UiState {
  tool: ToolMode;
  creationEntityType: EntityType;
  creationSettings: CreationSettings;
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
  hierarchyGeneratorOpen: boolean;
  questModeActive: boolean;
  activeRelicCount: number;

  setTool: (tool: ToolMode) => void;
  setCreationEntityType: (type: EntityType) => void;
  setCreationSettings: (settings: Partial<CreationSettings>) => void;
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
  setHierarchyGeneratorOpen: (open: boolean) => void;
  setQuestModeActive: (active: boolean) => void;
  setActiveRelicCount: (count: number) => void;
  markTutorialSeen: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  tool: 'select',
  creationEntityType: 'continent',
  creationSettings: {
    biome: 'lush-grassland',
    topography: 'plains',
    climate: 'temperate',
    reliefHeight: 0,
    settlementDensity: 'medium',
    settlementZoning: 'mixed',
    generate3DBuildings: true,
  },
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
  hierarchyGeneratorOpen: false,
  questModeActive: false,
  activeRelicCount: 0,

  setTool: (tool) => set({ tool }),
  setCreationEntityType: (creationEntityType) => set({ creationEntityType }),
  setCreationSettings: (settings) => set((state) => ({
    creationSettings: { ...state.creationSettings, ...settings },
  })),
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
  setHierarchyGeneratorOpen: (hierarchyGeneratorOpen) => set({ hierarchyGeneratorOpen }),
  setQuestModeActive: (questModeActive) => set({ questModeActive }),
  setActiveRelicCount: (activeRelicCount) => set({ activeRelicCount }),
  markTutorialSeen: () => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(HAS_SEEN_TUTORIAL_KEY, 'true');
    }
    set({ tutorialOpen: false });
  },
}));

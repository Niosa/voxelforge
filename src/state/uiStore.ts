import { create } from 'zustand';
import type { ToolMode, EntityType } from '@/entities/types';
import { getInitialPerformanceMode, persistPerformanceMode } from '@/state/performanceMode';

const HAS_SEEN_TUTORIAL_KEY = 'terraforge_seen_tutorial_v1';

export type BorderStyle = 'google-earth' | 'glowing-neon' | 'subtle-white' | 'vintage-ink';
export type FirstPersonBuildingType = 'castle' | 'watchtower' | 'house' | 'wall' | 'gate' | 'road' | 'flagpole' | 'tree';

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
  // Low-power devices default city borders OFF to smooth the startup entity burst
  showCityBorders: getInitialPerformanceMode() ? false : true,
  borderStyle: 'google-earth',
  frustumCullingEnabled: true,
  performanceMode: getInitialPerformanceMode(),
  islandFreehandEnabled: false,
  hamburgerMenuOpen: false,
  projectSettingsOpen: false,
  firstPersonActive: false,
  firstPersonBuildingType: 'house',

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
    // Persisted manual override always wins over auto-detection on next launch.
    persistPerformanceMode(performanceMode);
    set({ performanceMode });
  },
  setIslandFreehandEnabled: (islandFreehandEnabled) => set({ islandFreehandEnabled }),
  setHamburgerMenuOpen: (hamburgerMenuOpen) => set({ hamburgerMenuOpen }),
  setFirstPersonActive: (firstPersonActive) => set({ firstPersonActive }),
  setFirstPersonBuildingType: (firstPersonBuildingType) => set({ firstPersonBuildingType }),
  markTutorialSeen: () => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(HAS_SEEN_TUTORIAL_KEY, 'true');
    }
    set({ tutorialOpen: false });
  },
}));

import React from 'react';
import { useUiStore, type BorderStyle } from '@/state/uiStore';
import { useWorldStore } from '@/state/worldStore';
import {
  getViewer,
  getIsTerrain3DActive,
  setGlobeTerrain3D,
  getIsLightingActive,
  setGlobeAtmosphereLighting,
  getIsFantasyWorld,
  applyPerformanceModeSettings,
} from '@/globe/CesiumViewer';
import {
  syncEntitiesToCesium,
  resetEntitySyncState,
} from '@/globe/entitySync';
import { syncWorldBordersData } from '@/globe/borderOverlay';
import { firstPersonController } from '@/globe/FirstPersonController';
import { generateRandomRealm } from '@/geo/realmGenerator';
import { soundEngine } from '@/audio/soundEngine';
import { questManager } from '@/globe/questManager';
import { cinematicTour } from '@/globe/cinematicTour';

export function HamburgerMenu() {
  const isOpen = useUiStore((s) => s.hamburgerMenuOpen);
  const setOpen = useUiStore((s) => s.setHamburgerMenuOpen);

  const showCountryBorders = useUiStore((s) => s.showCountryBorders);
  const setShowCountryBorders = useUiStore((s) => s.setShowCountryBorders);
  const showRegionBorders = useUiStore((s) => s.showRegionBorders);
  const setShowRegionBorders = useUiStore((s) => s.setShowRegionBorders);
  const showCityBorders = useUiStore((s) => s.showCityBorders);
  const setShowCityBorders = useUiStore((s) => s.setShowCityBorders);
  const borderStyle = useUiStore((s) => s.borderStyle);
  const setBorderStyle = useUiStore((s) => s.setBorderStyle);

  const fantasyBuildingsEnabled = useUiStore((s) => s.fantasyBuildingsEnabled);
  const setFantasyBuildingsEnabled = useUiStore((s) => s.setFantasyBuildingsEnabled);
  const frustumCullingEnabled = useUiStore((s) => s.frustumCullingEnabled);
  const setFrustumCullingEnabled = useUiStore((s) => s.setFrustumCullingEnabled);
  const performanceMode = useUiStore((s) => s.performanceMode);
  const setPerformanceMode = useUiStore((s) => s.setPerformanceMode);

  const world = useWorldStore((s) => s.world);
  const isFantasy = getIsFantasyWorld();

  if (!isOpen) return null;

  const triggerRedraw = () => {
    const viewer = getViewer();
    if (viewer) {
      syncWorldBordersData(viewer);
      syncEntitiesToCesium(viewer, world.entities, useWorldStore.getState().selectedId);
    }
  };

  const handleToggleCountry = () => {
    setShowCountryBorders(!showCountryBorders);
    queueMicrotask(triggerRedraw);
  };

  const handleToggleRegion = () => {
    setShowRegionBorders(!showRegionBorders);
    queueMicrotask(triggerRedraw);
  };

  const handleToggleCity = () => {
    setShowCityBorders(!showCityBorders);
    queueMicrotask(triggerRedraw);
  };

  const handleSelectBorderStyle = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setBorderStyle(e.target.value as BorderStyle);
    queueMicrotask(triggerRedraw);
  };

  const handleToggleFantasyBuildings = () => {
    setFantasyBuildingsEnabled(!fantasyBuildingsEnabled);
    setTimeout(triggerRedraw, 50);
  };

  const handleToggleCulling = () => {
    setFrustumCullingEnabled(!frustumCullingEnabled);
    setTimeout(triggerRedraw, 50);
  };

  const handleTogglePerformanceMode = () => {
    setPerformanceMode(!performanceMode);
    applyPerformanceModeSettings();
    setTimeout(() => {
      const viewer = getViewer();
      if (viewer) {
        resetEntitySyncState();
        syncWorldBordersData(viewer);
        syncEntitiesToCesium(viewer, useWorldStore.getState().world.entities, useWorldStore.getState().selectedId);
      }
    }, 50);
  };

  const handleToggleTerrain = () => {
    setGlobeTerrain3D(!getIsTerrain3DActive());
    setTimeout(triggerRedraw, 50);
  };


  const handleToggleLighting = () => {
    setGlobeAtmosphereLighting(!getIsLightingActive());
    setTimeout(triggerRedraw, 50);
  };

  return (
    <div className="fixed inset-0 z-50 flex animate-fade-in">
      {/* Dimmed backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={() => setOpen(false)}
      />

      {/* Slide-out Drawer */}
      <div className="relative z-10 w-80 max-w-[85vw] bg-slate-900/95 text-slate-100 border-r border-white/10 shadow-2xl flex flex-col h-full overflow-hidden">
        {/* Drawer Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 bg-slate-950/50">
          <div className="flex items-center space-x-2.5">
            <span className="text-xl">🗺️</span>
            <h2 className="font-bold text-base text-teal-300 tracking-wide">
              World Controls & Settings
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-lg p-1.5 text-slate-400 hover:text-white hover:bg-white/10 transition"
          >
            ✕
          </button>
        </div>

        {/* Drawer Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6 text-sm scrollbar-thin">
          {/* Quick Interactive Actions */}
          <div className="rounded-2xl border border-amber-500/30 bg-amber-950/20 p-3 space-y-2">
            <span className="font-bold text-amber-300 text-xs uppercase tracking-wider block">
              🎲 Realm Creation & Exploration
            </span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  soundEngine.playClick();
                  setOpen(false);
                  generateRandomRealm();
                }}
                className="rounded-xl border border-amber-500/40 bg-amber-500/20 py-2 text-xs font-bold text-amber-200 hover:bg-amber-500/30 transition flex items-center justify-center gap-1 cursor-pointer"
              >
                <span>🎲</span><span>Forge Realm</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  soundEngine.playClick();
                  setOpen(false);
                  useUiStore.getState().setRealmStatsOpen(true);
                }}
                className="rounded-xl border border-teal-500/40 bg-teal-500/20 py-2 text-xs font-bold text-teal-200 hover:bg-teal-500/30 transition flex items-center justify-center gap-1 cursor-pointer"
              >
                <span>📊</span><span>Dashboard</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  soundEngine.playClick();
                  setOpen(false);
                  useUiStore.getState().setMapExportOpen(true);
                }}
                className="rounded-xl border border-purple-500/40 bg-purple-500/20 py-2 text-xs font-bold text-purple-200 hover:bg-purple-500/30 transition flex items-center justify-center gap-1 cursor-pointer"
              >
                <span>🖼️</span><span>Map Export</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  soundEngine.playClick();
                  setOpen(false);
                  questManager.initQuests();
                  useUiStore.getState().setQuestModeActive(true);
                }}
                className="rounded-xl border border-cyan-500/40 bg-cyan-500/20 py-2 text-xs font-bold text-cyan-200 hover:bg-cyan-500/30 transition flex items-center justify-center gap-1 cursor-pointer"
              >
                <span>🔮</span><span>Relic Quest</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                setOpen(false);
                cinematicTour.startTour();
              }}
              className="w-full rounded-xl border border-rose-500/40 bg-rose-500/20 py-2 text-xs font-bold text-rose-200 hover:bg-rose-500/30 transition flex items-center justify-center gap-1.5 cursor-pointer mt-1"
            >
              <span>🎬</span><span>Launch Cinematic Orbit Tour</span>
            </button>
          </div>

          {/* Section 0: Project & World Settings Button */}
          <div className="rounded-2xl border border-teal-500/30 bg-teal-950/20 p-3 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-teal-300 text-xs uppercase tracking-wider">
                ⚙️ World Configuration
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Configure per-world flags, heraldry, lore notes, and project settings.
            </p>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                useUiStore.getState().setProjectSettingsOpen(true);
              }}
              className="w-full rounded-xl bg-teal-500 py-2 text-xs font-bold text-slate-950 hover:bg-teal-400 transition flex items-center justify-center gap-1.5 shadow"
            >
              <span>⚙️</span>
              <span>Open Project Settings</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setOpen(false);
                firstPersonController.enter(0, 0);
              }}
              className="w-full rounded-xl border border-amber-500/40 bg-amber-500/20 py-2 text-xs font-bold text-amber-300 hover:bg-amber-500/30 transition flex items-center justify-center gap-1.5 shadow cursor-pointer mt-1"
            >
              <span>🧪</span>
              <span>Launch Dev Voxel Sandbox</span>
            </button>
          </div>

          {/* Section 1: Land Borders & Styling */}
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs font-semibold text-teal-400 uppercase tracking-wider">
              <span>🌐 Land Borders & Outlines</span>
            </div>

            {/* Border Style Selector */}
            <div className="flex flex-col space-y-1.5">
              <label htmlFor="border-style-select" className="text-xs text-slate-300 font-medium">
                Border Theme Preset
              </label>
              <select
                id="border-style-select"
                value={borderStyle}
                onChange={handleSelectBorderStyle}
                className="w-full rounded-xl border border-white/15 bg-slate-800 px-3 py-2 text-xs font-medium text-slate-200 focus:border-teal-400 focus:outline-none cursor-pointer"
              >
                <option value="google-earth">✨ Classic Bold Outline (Pale Yellow)</option>
                <option value="glowing-neon">⚡ Glowing Neon Cyan</option>
                <option value="subtle-white">🤍 Subtle Faint White</option>
                <option value="vintage-ink">📜 Vintage Ink Charcoal</option>
              </select>
            </div>

            {/* Country Borders Toggle */}
            <label className="flex items-center justify-between p-2.5 rounded-xl border border-white/5 bg-white/5 hover:bg-white/10 transition cursor-pointer">
              <div className="flex flex-col">
                <span className="font-medium text-slate-200">Country / Continent Borders</span>
                <span className="text-[10px] text-slate-400">Primary national boundary outlines</span>
              </div>
              <input
                type="checkbox"
                checked={showCountryBorders}
                onChange={handleToggleCountry}
                className="w-4 h-4 rounded accent-teal-500 cursor-pointer"
              />
            </label>

            {/* Region / State Borders Toggle */}
            <label className="flex items-center justify-between p-2.5 rounded-xl border border-white/5 bg-white/5 hover:bg-white/10 transition cursor-pointer">
              <div className="flex flex-col">
                <span className="font-medium text-slate-200">State & Region Borders</span>
                <span className="text-[10px] text-slate-400">Subtle dashed province outlines</span>
              </div>
              <input
                type="checkbox"
                checked={showRegionBorders}
                onChange={handleToggleRegion}
                className="w-4 h-4 rounded accent-teal-500 cursor-pointer"
              />
            </label>

            {/* City / District Borders Toggle */}
            <label className="flex items-center justify-between p-2.5 rounded-xl border border-white/5 bg-white/5 hover:bg-white/10 transition cursor-pointer">
              <div className="flex flex-col">
                <span className="font-medium text-slate-200">City & District Borders</span>
                <span className="text-[10px] text-slate-400">Municipal territory boundaries</span>
              </div>
              <input
                type="checkbox"
                checked={showCityBorders}
                onChange={handleToggleCity}
                className="w-4 h-4 rounded accent-teal-500 cursor-pointer"
              />
            </label>
          </div>

          {/* Section 2: ⚡ Mobile Performance & Culling */}
          <div className="space-y-3 pt-2 border-t border-white/10">
            <div className="flex items-center justify-between text-xs font-semibold text-amber-400 uppercase tracking-wider">
              <span>⚡ Mobile Performance & Culling</span>
            </div>

            {/* Performance Mode Toggle */}
            <label className="flex items-center justify-between p-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/15 transition cursor-pointer">
              <div className="flex flex-col">
                <span className="font-medium text-amber-200">Performance Mode</span>
                <span className="text-[10px] text-amber-400/80">Prevents crashes on older devices (lower quality)</span>
              </div>
              <input
                type="checkbox"
                checked={performanceMode}
                onChange={handleTogglePerformanceMode}
                className="w-4 h-4 rounded accent-amber-500 cursor-pointer"
              />
            </label>

            {/* Frustum Culling Toggle */}
            <label className="flex items-center justify-between p-2.5 rounded-xl border border-white/5 bg-white/5 hover:bg-white/10 transition cursor-pointer">
              <div className="flex flex-col">
                <span className="font-medium text-slate-200">Viewport Frustum Culling</span>
                <span className="text-[10px] text-slate-400">Hide off-screen entities for high FPS on mobile</span>
              </div>
              <input
                type="checkbox"
                checked={frustumCullingEnabled}
                onChange={handleToggleCulling}
                className="w-4 h-4 rounded accent-amber-500 cursor-pointer"
              />
            </label>
          </div>

          {/* Section 3: 🏢 3D World Controls */}
          <div className="space-y-3 pt-2 border-t border-white/10">
            <div className="flex items-center justify-between text-xs font-semibold text-cyan-400 uppercase tracking-wider">
              <span>🏢 3D World & Graphics</span>
            </div>

            {isFantasy && (
              <label className="flex items-center justify-between p-2.5 rounded-xl border border-white/5 bg-white/5 hover:bg-white/10 transition cursor-pointer">
                <div className="flex flex-col">
                  <span className="font-medium text-slate-200">3D City Buildings</span>
                  <span className="text-[10px] text-slate-400">Procedural 3D architectural towers</span>
                </div>
                <input
                  type="checkbox"
                  checked={fantasyBuildingsEnabled}
                  onChange={handleToggleFantasyBuildings}
                  className="w-4 h-4 rounded accent-teal-500 cursor-pointer"
                />
              </label>
            )}

            <label className="flex items-center justify-between p-2.5 rounded-xl border border-white/5 bg-white/5 hover:bg-white/10 transition cursor-pointer">
              <div className="flex flex-col">
                <span className="font-medium text-slate-200">3D Elevation Terrain</span>
                <span className="text-[10px] text-slate-400">3D Mountain ridges and valleys</span>
              </div>
              <input
                type="checkbox"
                checked={getIsTerrain3DActive()}
                onChange={handleToggleTerrain}
                className="w-4 h-4 rounded accent-teal-500 cursor-pointer"
              />
            </label>


            <label className="flex items-center justify-between p-2.5 rounded-xl border border-white/5 bg-white/5 hover:bg-white/10 transition cursor-pointer">
              <div className="flex flex-col">
                <span className="font-medium text-slate-200">Atmosphere Lighting</span>
                <span className="text-[10px] text-slate-400">Sun & ground shading</span>
              </div>
              <input
                type="checkbox"
                checked={getIsLightingActive()}
                onChange={handleToggleLighting}
                className="w-4 h-4 rounded accent-teal-500 cursor-pointer"
              />
            </label>
          </div>
        </div>

        {/* Drawer Footer */}
        <div className="px-5 py-3 border-t border-white/10 bg-slate-950/60 text-center">
          <span className="text-[10px] text-slate-500 font-mono">
            Terraforge 3D Engine • Mobile Optimized
          </span>
        </div>
      </div>
    </div>
  );
}

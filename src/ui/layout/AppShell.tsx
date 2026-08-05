import { useEffect } from 'react';
import { GlobeView } from '@/globe/GlobeView';
import { TopBar } from '@/ui/layout/TopBar';
import { ToolRail } from '@/ui/layout/ToolRail';
import { InspectorPanel } from '@/ui/layout/InspectorPanel';
import { StatusBar } from '@/ui/layout/StatusBar';
import { TutorialModal } from '@/ui/tutorial/TutorialModal';
import { DesignAssistPanel } from '@/ui/tools/DesignAssistPanel';
import { useUiStore } from '@/state/uiStore';
import { drawController } from '@/drawing/DrawController';
import { useWorldStore } from '@/state/worldStore';
import { useKeyboardShortcuts } from '@/ui/hooks/useKeyboardShortcuts';
import { ProjectSettingsModal } from '@/ui/settings/ProjectSettingsModal';
import { MinecraftHotbar } from '@/ui/layout/MinecraftHotbar';
import { firstPersonController } from '@/globe/FirstPersonController';
import { firstPersonBuilder } from '@/drawing/FirstPersonBuilder';
import { CreativeInventoryModal } from '@/ui/firstPerson/CreativeInventoryModal';
import { RealmStatsModal } from '@/ui/layout/RealmStatsModal';
import { MapExportModal } from '@/ui/layout/MapExportModal';
import { WeatherControlPanel } from '@/ui/layout/WeatherControlPanel';
import { MobileControlsOverlay } from '@/ui/firstPerson/MobileControlsOverlay';
import { useWalkStore } from '@/state/walkStore';
import { CreationSettingsPanel } from '@/ui/tools/CreationSettingsPanel';
import type { EntityType } from '@/entities/types';
import { HierarchyGeneratorModal } from '@/ui/generation/HierarchyGeneratorModal';

export function AppShell() {
  const tool = useUiStore((s) => s.tool);
  const creationEntityType = useUiStore((s) => s.creationEntityType);
  const smartBordersEnabled = useUiStore((s) => s.smartBordersEnabled);
  const firstPersonActive = useUiStore((s) => s.firstPersonActive);
  const walkPhase = useWalkStore((s) => s.phase);
  const immersiveMode = firstPersonActive || walkPhase !== 'globe';

  useKeyboardShortcuts();

  useEffect(() => {
    // Defer init until after GlobeView's mount effect has created the Cesium viewer.
    // (GlobeView's [] effect and AppShell's [] effect both fire on mount; execution
    // order is deterministic — GlobeView's fires first since it renders inside AppShell —
    // but we add a microtask yield to guarantee the viewer handle is assigned.)
    const timerId = setTimeout(() => {
      drawController.init();
    }, 0);
    useWorldStore.getState().initWorldFromPersistence();

    if (typeof window !== 'undefined') {
      const search = window.location.search;
      if (search.includes('dev-voxel') || search.includes('dev=1')) {
        setTimeout(() => {
          firstPersonController.enter(0, 0);
        }, 600);
      }
    }

    return () => {
      clearTimeout(timerId);
      drawController.destroy();
    };
  }, []);

  // First-Person update tick for placement crosshair preview
  useEffect(() => {
    if (!firstPersonActive) {
      firstPersonBuilder.clearPreview();
      return;
    }
    const interval = setInterval(() => {
      firstPersonBuilder.updatePreview();
    }, 30);
    return () => {
      clearInterval(interval);
      firstPersonBuilder.clearPreview();
    };
  }, [firstPersonActive]);

  return (
    <div className="relative h-full w-full text-slate-100">
      <GlobeView />
      <TutorialModal />
      <ProjectSettingsModal />
      <MinecraftHotbar />
      <CreativeInventoryModal />
      <RealmStatsModal />
      <MapExportModal />
      <HierarchyGeneratorModal />
      <MobileControlsOverlay />

      <div className="pointer-events-auto">
        <DesignAssistPanel />
      </div>

      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between">
        {!immersiveMode && (
          <div className="pointer-events-auto">
            <TopBar />
          </div>
        )}

        {/* Floating Weather Control Bar (Top Right) */}
        {!immersiveMode && (
          <div className="pointer-events-auto absolute bottom-12 right-[21rem] z-30 hidden md:block xl:bottom-auto xl:top-16">
            <WeatherControlPanel />
          </div>
        )}

        {/* Active Drawing Banner */}
        {(tool === 'drawPolygon' || tool === 'placePoint' || tool === 'freehandDraw' || tool === 'designAssist' || tool === 'addPart' || tool === 'eraseRegion') && (
          <div className="pointer-events-auto z-40 mx-auto mt-2 flex max-h-[42dvh] w-[calc(100%-1rem)] max-w-4xl flex-wrap items-center justify-center gap-2 overflow-y-auto rounded-xl border border-teal-500/40 bg-slate-950/95 px-3 py-2 text-xs font-semibold text-teal-200 shadow-2xl backdrop-blur-md animate-fadeIn sm:w-auto sm:rounded-2xl">
            {tool === 'drawPolygon' && (
              <>
                <span>✏️ Draw Polygon:</span>
                <button
                  type="button"
                  onClick={() => drawController.finishPolygon()}
                  className="rounded-lg bg-teal-500 px-3 py-1 text-xs font-bold text-slate-950 hover:bg-teal-400 transition"
                >
                  Finish Shape
                </button>
              </>
            )}
            {tool === 'addPart' && (
              <>
                <span>🏝️ Draw Island — click vertices or drag freehand:</span>
                <button
                  type="button"
                  onClick={() => drawController.finishPolygon()}
                  className="rounded-lg bg-teal-500 px-3 py-1 text-xs font-bold text-slate-950 hover:bg-teal-400 transition"
                >
                  Complete Island
                </button>
              </>
            )}
            {tool === 'eraseRegion' && (
              <>
                <span>✂️ Erase from selected region:</span>
                <button
                  type="button"
                  onClick={() => drawController.finishPolygon()}
                  className="rounded-lg bg-rose-500 px-3 py-1 text-xs font-bold text-slate-950 hover:bg-rose-400 transition"
                >
                  Apply Erase
                </button>
              </>
            )}
            {tool === 'freehandDraw' && (
              <span>🖊️ Drag mouse/finger across globe to draw landmass shape.</span>
            )}
            {tool === 'placePoint' && (
              <span>📍 Click anywhere on globe to place marker.</span>
            )}
            {tool === 'designAssist' && (
              <span>✨ Stamp procedurally generated landmasses onto globe.</span>
            )}

            {(tool === 'drawPolygon' || tool === 'placePoint' || tool === 'freehandDraw' || tool === 'designAssist') && (
            <>
            <div className="no-scrollbar flex max-w-full items-center gap-1 overflow-x-auto px-1 py-0.5 sm:border-l sm:border-r sm:border-white/15 sm:px-3">
              <span className="sticky left-0 mr-1 bg-slate-950 pr-1 text-[11px] font-normal text-slate-400">Type:</span>
              {[
                { id: 'continent', label: '🌍 Continent' },
                { id: 'region', label: '🗺️ Region' },
                { id: 'island', label: '🏝️ Island' },
                { id: 'city', label: '🏙️ City' },
                { id: 'town', label: '🏡 Town' },
                { id: 'landmark', label: '🚩 Landmark' },
              ].map((t) => {
                const isSelected = creationEntityType === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => useUiStore.getState().setCreationEntityType(t.id as EntityType)}
                    className={`shrink-0 rounded-md px-2 py-1 text-[11px] transition ${
                      isSelected
                        ? 'bg-teal-400 text-slate-950 font-bold shadow-sm'
                        : 'bg-white/5 text-slate-300 hover:bg-white/15 hover:text-white'
                    }`}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => useUiStore.getState().setSmartBordersEnabled(!smartBordersEnabled)}
              title="Automatically snaps shared boundaries with neighboring landmasses while preserving nested enclaves"
              className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition flex items-center gap-1 ${
                smartBordersEnabled
                  ? 'border border-emerald-500/40 bg-emerald-500/20 text-emerald-300'
                  : 'border border-slate-700 bg-slate-800 text-slate-400'
              }`}
            >
              <span>🧲 Smart Borders:</span>
              <span>{smartBordersEnabled ? 'ON' : 'OFF'}</span>
            </button>
            </>
            )}

            {(tool === 'drawPolygon' || tool === 'freehandDraw' || tool === 'placePoint') && (
              <details className="group basis-full rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1">
                <summary className="cursor-pointer list-none text-center text-[11px] font-semibold text-slate-300 marker:hidden">
                  <span className="group-open:hidden">Customize terrain or settlement</span>
                  <span className="hidden group-open:inline">Hide creation settings</span>
                  <span className="ml-1 text-teal-400">⌄</span>
                </summary>
                <CreationSettingsPanel />
              </details>
            )}

            <button
              type="button"
              onClick={() => {
                drawController.cancelDrawing();
                useUiStore.getState().setTool('select');
              }}
              className="rounded-lg bg-white/10 px-2.5 py-1 text-xs text-slate-300 hover:bg-white/20 transition"
            >
              Cancel
            </button>
          </div>
        )}

        <div className="flex min-h-0 flex-1">
          {!immersiveMode && (
            <div className="pointer-events-auto md:shrink-0">
              <ToolRail />
            </div>
          )}
          <div className="flex-1" />
          {!immersiveMode && (
            <div className="pointer-events-auto md:shrink-0">
              <InspectorPanel />
            </div>
          )}
        </div>

        {!immersiveMode && (
          <div className="pointer-events-auto">
            <StatusBar />
          </div>
        )}
      </div>
    </div>
  );
}

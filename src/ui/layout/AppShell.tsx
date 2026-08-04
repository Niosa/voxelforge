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

export function AppShell() {
  const tool = useUiStore((s) => s.tool);
  const firstPersonActive = useUiStore((s) => s.firstPersonActive);

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
      <MobileControlsOverlay />

      <div className="pointer-events-auto">
        <DesignAssistPanel />
      </div>

      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between">
        {!firstPersonActive && (
          <div className="pointer-events-auto">
            <TopBar />
          </div>
        )}

        {/* Floating Weather Control Bar (Top Right) */}
        {!firstPersonActive && (
          <div className="pointer-events-auto absolute top-16 right-4 z-30">
            <WeatherControlPanel />
          </div>
        )}

        {/* Active Drawing Banner */}
        {(tool === 'drawPolygon' || tool === 'placePoint' || tool === 'freehandDraw' || tool === 'designAssist' || tool === 'addPart' || tool === 'eraseRegion') && (
          <div className="pointer-events-auto mx-auto mt-3 flex flex-wrap items-center justify-center gap-3 rounded-2xl border border-teal-500/40 bg-slate-950/95 px-4 py-2.5 text-xs font-semibold text-teal-200 backdrop-blur-md shadow-2xl animate-fadeIn z-40 max-w-4xl">
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
            <div className="flex items-center gap-1 border-l border-r border-white/15 px-3 py-0.5">
              <span className="text-[11px] text-slate-400 font-normal mr-1">Type:</span>
              {[
                { id: 'continent', label: '🌍 Continent' },
                { id: 'region', label: '🗺️ Region' },
                { id: 'island', label: '🏝️ Island' },
                { id: 'city', label: '🏙️ City' },
                { id: 'town', label: '🏡 Town' },
                { id: 'landmark', label: '🚩 Landmark' },
              ].map((t) => {
                const isSelected = useUiStore.getState().creationEntityType === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => useUiStore.getState().setCreationEntityType(t.id as any)}
                    className={`rounded-md px-2 py-0.5 text-[11px] transition ${
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
              onClick={() => useUiStore.getState().setSmartBordersEnabled(!useUiStore.getState().smartBordersEnabled)}
              title="Automatically snaps shared boundaries with neighboring landmasses while preserving nested enclaves"
              className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition flex items-center gap-1 ${
                useUiStore.getState().smartBordersEnabled
                  ? 'border border-emerald-500/40 bg-emerald-500/20 text-emerald-300'
                  : 'border border-slate-700 bg-slate-800 text-slate-400'
              }`}
            >
              <span>🧲 Smart Borders:</span>
              <span>{useUiStore.getState().smartBordersEnabled ? 'ON' : 'OFF'}</span>
            </button>
            </>
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
          <div className="pointer-events-auto">
            <ToolRail />
          </div>
          <div className="flex-1" />
          {!firstPersonActive && (
            <div className="pointer-events-auto">
              <InspectorPanel />
            </div>
          )}
        </div>

        <div className="pointer-events-auto">
          <StatusBar />
        </div>
      </div>
    </div>
  );
}

import { useUiStore } from '@/state/uiStore';
import type { ToolMode } from '@/entities/types';
import { drawController } from '@/drawing/DrawController';
import { firstPersonController } from '@/globe/FirstPersonController';

interface ToolItem {
  id: ToolMode;
  label: string;
  icon: string;
  hotkey: string;
  description: string;
}

const tools: ToolItem[] = [
  { id: 'select', label: 'Select', icon: '👆', hotkey: '1', description: 'Click any territory or city marker to inspect & edit' },
  { id: 'pan', label: 'Pan', icon: '✋', hotkey: '2', description: 'Drag to orbit & pan around the 3D globe' },
  { id: 'drawPolygon', label: 'Draw', icon: '✏️', hotkey: '3', description: 'Click points on globe to outline custom land territories' },
  { id: 'placePoint', label: 'City', icon: '📍', hotkey: '4', description: 'Click anywhere on globe to place a new city pin' },
  { id: 'designAssist', label: 'Design', icon: '✨', hotkey: '5', description: 'Stamp procedurally generated continents & mountain chains' },
  { id: 'freehandDraw', label: 'Freehand', icon: '🖊️', hotkey: '6', description: 'Drag mouse or touch across globe to freehand draw landmasses' },
  { id: 'addPart', label: 'Island', icon: '🏝️', hotkey: '7', description: 'Draw an island with its own editable label — click vertices or drag freehand. Select a landmass first to attach it' },
  { id: 'eraseRegion', label: 'Erase', icon: '✂️', hotkey: '8', description: 'Draw a shape to erase that area from the SELECTED region (cuts holes, trims edges, splits landmasses)' },
  { id: 'walk', label: 'Walk', icon: '🚶', hotkey: '9', description: 'Explore your world in first-person ground mode & build structures' },
];

export function ToolRail() {
  const tool = useUiStore((s) => s.tool);
  const setTool = useUiStore((s) => s.setTool);

  const handleSelectTool = (id: ToolMode) => {
    if (id === 'walk') {
      firstPersonController.enter();
      return;
    }

    if (firstPersonController.isActive()) {
      firstPersonController.exit();
    }

    if (id !== 'drawPolygon' && id !== 'freehandDraw') {
      drawController.cancelDrawing();
    }
    if (id === 'placePoint') {
      const current = useUiStore.getState().creationEntityType;
      if (current === 'continent' || current === 'island' || current === 'region') {
        useUiStore.getState().setCreationEntityType('city');
      }
    } else if (id === 'drawPolygon' || id === 'freehandDraw') {
      // Retain active creation type (continent, region, island, city, town, landmark)
    }
    setTool(id);
  };

  return (
    <aside
      className="m-3 flex flex-col gap-2 rounded-2xl border border-white/15 bg-slate-950/85 p-2 backdrop-blur-md shadow-2xl z-30 transition-all"
      aria-label="Tool Navigation Rail"
    >
      {tools.map((t) => {
        const isActive = tool === t.id;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => handleSelectTool(t.id)}
            title={`${t.label} (${t.description}) - Hotkey [${t.hotkey}]`}
            className={`group relative flex flex-col items-center justify-center rounded-xl p-2.5 transition-all duration-200 cursor-pointer ${
              isActive
                ? 'border border-teal-400/60 bg-teal-500/25 text-teal-200 shadow-lg shadow-teal-500/20 scale-105'
                : 'border border-transparent bg-white/5 text-slate-300 hover:bg-white/12 hover:text-white'
            }`}
          >
            <span className="text-xl leading-none transition-transform group-hover:scale-110">
              {t.icon}
            </span>
            <span className="mt-1 text-[10px] font-bold tracking-tight">
              {t.label}
            </span>
            {/* Hotkey Badge */}
            <span
              className={`absolute top-1 right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full text-[9px] font-extrabold font-mono transition ${
                isActive
                  ? 'bg-teal-400 text-slate-950 shadow-sm'
                  : 'bg-white/15 text-slate-400 group-hover:bg-white/25 group-hover:text-slate-200'
              }`}
            >
              {t.hotkey}
            </span>
          </button>
        );
      })}
    </aside>
  );
}

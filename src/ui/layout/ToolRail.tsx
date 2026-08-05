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

const tools: ToolItem[] = ([
  { id: 'select', label: 'Select', icon: '👆', hotkey: '1', description: 'Click any territory or city marker to inspect & edit' },
  { id: 'pan', label: 'Pan', icon: '✋', hotkey: '2', description: 'Drag to orbit & pan around the 3D globe' },
  { id: 'drawPolygon', label: 'Draw', icon: '✏️', hotkey: '3', description: 'Click points on globe to outline custom land territories' },
  { id: 'placePoint', label: 'City', icon: '📍', hotkey: '4', description: 'Click anywhere on globe to place a new city pin' },
  { id: 'designAssist', label: 'Design', icon: '✨', hotkey: '5', description: 'Stamp procedurally generated continents & mountain chains' },
  { id: 'freehandDraw', label: 'Freehand', icon: '🖊️', hotkey: '6', description: 'Drag mouse or touch across globe to freehand draw landmasses' },
  { id: 'addPart', label: 'Island', icon: '🏝️', hotkey: '7', description: 'Draw an island with its own editable label — click vertices or drag freehand. Select a landmass first to attach it' },
  { id: 'eraseRegion', label: 'Erase', icon: '✂️', hotkey: '8', description: 'Draw a shape to erase that area from the SELECTED region (cuts holes, trims edges, splits landmasses)' },
  { id: 'walk', label: 'Walk', icon: '🚶', hotkey: '9', description: 'Explore your world in first-person ground mode & build structures' },
] satisfies ToolItem[]).filter((tool) => tool.id !== 'placePoint').map((tool, index) => ({
  ...tool,
  hotkey: String(index + 1),
}));

export function ToolRail() {
  const tool = useUiStore((s) => s.tool);
  const setTool = useUiStore((s) => s.setTool);

  const handleSelectTool = (id: ToolMode) => {
    if (id === 'walk') {
      if (firstPersonController.isActive()) firstPersonController.exit();
      setTool('walk');
      window.__voxelforgeDescend?.();
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
      className="no-scrollbar fixed inset-x-2 bottom-10 z-30 flex max-w-full flex-row gap-1 overflow-x-auto rounded-xl border border-white/15 bg-slate-950/90 p-1.5 shadow-2xl backdrop-blur-md transition-all md:static md:m-2 md:max-h-[calc(100dvh-7rem)] md:w-auto md:flex-col md:gap-1.5 md:overflow-y-auto md:rounded-2xl md:p-2"
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
            className={`group relative flex min-w-[3.4rem] shrink-0 flex-col items-center justify-center rounded-lg px-2 py-1.5 transition-all duration-200 cursor-pointer md:min-w-0 md:rounded-xl md:p-2 ${
              isActive
                ? 'border border-teal-400/60 bg-teal-500/25 text-teal-200 shadow-lg shadow-teal-500/20 scale-105'
                : 'border border-transparent bg-white/5 text-slate-300 hover:bg-white/12 hover:text-white'
            }`}
          >
            <span className="text-lg leading-none transition-transform group-hover:scale-110 md:text-xl">
              {t.icon}
            </span>
            <span className="mt-0.5 text-[9px] font-bold tracking-tight md:mt-1 md:text-[10px]">
              {t.label}
            </span>
            {/* Hotkey Badge */}
            <span
              className={`absolute top-0.5 right-0.5 hidden h-3.5 w-3.5 items-center justify-center rounded-full text-[9px] font-extrabold font-mono transition md:flex ${
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

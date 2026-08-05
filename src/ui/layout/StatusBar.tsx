import { useWorldStore } from '@/state/worldStore';
import { useUiStore } from '@/state/uiStore';
import { history } from '@/state/history/HistoryStack';

export function StatusBar() {
  const count = useWorldStore((s) => Object.keys(s.world.entities).length);
  const tool = useUiStore((s) => s.tool);

  return (
    <footer className="tf-status-bar flex min-h-9 items-center gap-2 border-t border-white/10 bg-slate-950/80 px-2 py-1 text-[11px] text-slate-400 backdrop-blur-md sm:gap-3 sm:px-3 sm:text-xs">
      <span className="hidden capitalize sm:inline">Tool: {tool}</span>
      <span>·</span>
      <span className="hidden sm:inline">Places: {count}</span>
      <div className="flex-1" />
      <button
        type="button"
        className="rounded px-2 py-0.5 hover:bg-white/10 transition"
        onClick={() => history.undo()}
      >
        Undo
      </button>
      <button
        type="button"
        className="rounded px-2 py-0.5 hover:bg-white/10 transition"
        onClick={() => history.redo()}
      >
        Redo
      </button>
    </footer>
  );
}

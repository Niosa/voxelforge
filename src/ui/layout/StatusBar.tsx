import { useWorldStore } from '@/state/worldStore';
import { useUiStore } from '@/state/uiStore';
import { history } from '@/state/history/HistoryStack';

export function StatusBar() {
  const count = useWorldStore((s) => Object.keys(s.world.entities).length);
  const tool = useUiStore((s) => s.tool);

  return (
    <footer className="flex items-center gap-3 border-t border-white/10 bg-slate-950/70 px-3 py-1.5 text-xs text-slate-400 backdrop-blur-md">
      <span className="capitalize">Tool: {tool}</span>
      <span>·</span>
      <span>Places: {count}</span>
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

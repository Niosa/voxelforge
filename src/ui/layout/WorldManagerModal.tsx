import { useState } from 'react';
import { useWorldStore } from '@/state/worldStore';
import { SAMPLE_WORLD_PRESETS } from '@/state/worldStore';
import { flyToEntity } from '@/globe/camera';
import { getViewer } from '@/globe/CesiumViewer';
import { syncEntitiesToCesium } from '@/globe/entitySync';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function WorldManagerModal({ isOpen, onClose }: Props) {
  const activeWorld = useWorldStore((s) => s.world);
  const setWorld = useWorldStore((s) => s.setWorld);
  const loadSampleWorld = useWorldStore((s) => s.loadSampleWorld);
  const worlds = useWorldStore((s) => s.worlds);
  const setActiveWorld = useWorldStore((s) => s.setActiveWorld);
  const deleteWorld = useWorldStore((s) => s.deleteWorld);
  const createWorld = useWorldStore((s) => s.createWorld);

  const [newName, setNewName] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  if (!isOpen) return null;

  const worldList = Object.values(worlds);

  const handleSave = async () => {
    await useWorldStore.getState().saveActiveWorld();
  };

  const handleCreate = () => {
    if (!newName.trim()) return;
    createWorld(newName.trim());
    setNewName('');
  };

  const handleRename = (id: string) => {
    const w = worlds[id];
    if (!w) return;
    setRenamingId(id);
    setRenameValue(w.name);
  };

  const handleRenameCommit = (id: string) => {
    const store = useWorldStore.getState();
    if (store.activeWorldId === id) {
      store.renameActiveWorld(renameValue);
    } else {
      store.patchWorld(id, (w) => { w.name = renameValue; });
    }
    setRenamingId(null);
  };

  // loadSampleWorld takes a preset ID string
  const handleCreateNew = (presetId: string) => {
    loadSampleWorld(presetId);
    onClose();
  };

  const handleSwitch = (id: string) => {
    setActiveWorld(id);
    const viewer = getViewer();
    const w = worlds[id];
    if (viewer && w) {
      syncEntitiesToCesium(viewer, w.entities, null);
    }
    onClose();
  };

  void setWorld; void flyToEntity;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-2xl border border-white/10 bg-slate-950 p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-teal-300">🗺️ World Manager</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition">✕</button>
        </div>

        {/* Active world save */}
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-teal-500/20 bg-teal-500/5 px-4 py-2.5">
          <span className="text-teal-300 font-semibold text-sm">Active: {activeWorld.name}</span>
          <button onClick={handleSave}
            className="ml-auto rounded-lg border border-teal-500/30 bg-teal-500/10 px-3 py-1 text-xs font-semibold text-teal-300 hover:bg-teal-500/20 transition">
            💾 Save
          </button>
        </div>

        {/* World list */}
        <div className="max-h-52 overflow-y-auto mb-4 space-y-1">
          {worldList.map((w) => (
            <div key={w.id}
              className={`flex items-center gap-2 rounded-xl px-3 py-2 border transition ${
                w.id === activeWorld.id
                  ? 'border-teal-500/40 bg-teal-500/10'
                  : 'border-white/10 bg-white/5 hover:bg-white/10'
              }`}>
              {renamingId === w.id ? (
                <input autoFocus value={renameValue} onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={() => handleRenameCommit(w.id)}
                  onKeyDown={(e) => e.key === 'Enter' && handleRenameCommit(w.id)}
                  className="flex-1 bg-transparent text-sm text-white border-b border-teal-400 focus:outline-none" />
              ) : (
                <span className="flex-1 text-sm font-medium text-slate-200 truncate">{w.name}</span>
              )}
              <span className="text-[10px] text-slate-500">{Object.keys(w.entities).length} entities</span>
              {w.id !== activeWorld.id && (
                <button onClick={() => handleSwitch(w.id)}
                  className="rounded-lg bg-teal-500/10 px-2 py-0.5 text-[11px] text-teal-300 hover:bg-teal-500/20 transition">Load</button>
              )}
              <button onClick={() => handleRename(w.id)}
                className="rounded-lg bg-white/5 px-2 py-0.5 text-[11px] text-slate-400 hover:text-white transition">Rename</button>
              {worldList.length > 1 && (
                <button onClick={() => deleteWorld(w.id)}
                  className="rounded-lg bg-red-500/10 px-2 py-0.5 text-[11px] text-red-400 hover:bg-red-500/20 transition">Delete</button>
              )}
            </div>
          ))}
        </div>

        {/* Create blank world */}
        <div className="flex gap-2 mb-4">
          <input value={newName} onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            placeholder="New world name…"
            className="flex-1 rounded-xl border border-white/15 bg-slate-900 px-3 py-1.5 text-sm text-white placeholder-slate-500 focus:border-teal-400 focus:outline-none" />
          <button onClick={handleCreate}
            className="rounded-xl border border-teal-500/30 bg-teal-500/10 px-4 py-1.5 text-sm font-semibold text-teal-300 hover:bg-teal-500/20 transition">+ Create</button>
        </div>

        {/* Sample world presets */}
        <div>
          <p className="text-xs text-slate-400 mb-2">Load a sample world:</p>
          <div className="flex flex-wrap gap-2">
            {SAMPLE_WORLD_PRESETS.map((preset) => (
              <button key={preset.id} onClick={() => handleCreateNew(preset.id)}
                className="rounded-xl border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-teal-500/10 hover:text-teal-200 hover:border-teal-500/30 transition">
                {preset.name}
              </button>
            ))}
            <button onClick={() => handleCreateNew('earth')}
              className="rounded-xl border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-teal-500/10 hover:text-teal-200 hover:border-teal-500/30 transition">
              🌍 Real Earth
            </button>
            <button onClick={() => handleCreateNew('middle-earth')}
              className="rounded-xl border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-teal-500/10 hover:text-teal-200 hover:border-teal-500/30 transition">
              🗡️ Middle-earth
            </button>
            <button onClick={() => handleCreateNew('blank')}
              className="rounded-xl border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-teal-500/10 hover:text-teal-200 hover:border-teal-500/30 transition">
              ➕ Blank Globe
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

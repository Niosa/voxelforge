import { useState, useEffect, useRef } from 'react';
import { useWorldStore, type SampleWorldPreset } from '@/state/worldStore';
import {
  getAllWorldsFromDB,
  deleteWorldFromDB,
  saveWorldToDB,
  loadWorldFromDB,
  type WorldSummary,
} from '@/persistence/idb';
import {
  exportWorldToJsonFile,
  importWorldFromJsonFile,
} from '@/persistence/exportImport';
import { setFantasyWorldFlag, setGlobeImageryStyle } from '@/globe/CesiumViewer';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function WorldManagerModal({ isOpen, onClose }: Props) {
  const activeWorld = useWorldStore((s) => s.world);
  const setWorld = useWorldStore((s) => s.setWorld);
  const loadSampleWorld = useWorldStore((s) => s.loadSampleWorld);

  const [savedWorlds, setSavedWorlds] = useState<WorldSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const refreshList = async () => {
    setLoading(true);
    const list = await getAllWorldsFromDB();
    setSavedWorlds(list);
    setLoading(false);
  };

  useEffect(() => {
    if (isOpen) {
      refreshList();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleLoadWorld = async (id: string) => {
    const loaded = await loadWorldFromDB(id);
    if (loaded) {
      const isEarth = loaded.id === 'earth-preset' || loaded.name.toLowerCase().includes('real earth');
      setFantasyWorldFlag(!isEarth);
      setGlobeImageryStyle('satellite', loaded.entities, loaded.properties?.theme || 'medieval');
      setWorld(loaded);
      onClose();
    }
  };

  const handleSaveActiveWorld = async () => {
    await useWorldStore.getState().saveActiveWorld();
    await refreshList();
  };

  const handleDeleteWorld = async (id: string, name: string) => {
    if (confirm(`Are you sure you want to delete "${name}"? This action cannot be undone.`)) {
      await deleteWorldFromDB(id);
      if (id === activeWorld.id) {
        loadSampleWorld('earth');
      }
      await refreshList();
    }
  };

  const handleCreateNew = (preset: SampleWorldPreset) => {
    loadSampleWorld(preset);
    onClose();
  };

  const handleDuplicate = async (summary: WorldSummary) => {
    const original = await loadWorldFromDB(summary.id);
    const targetWorld = original ?? (summary.id === activeWorld.id ? activeWorld : null);
    if (targetWorld) {
      const cloned = structuredClone(targetWorld);
      cloned.id = crypto.randomUUID();
      cloned.name = `${targetWorld.name} (Copy)`;
      await saveWorldToDB(cloned);
      await refreshList();
    }
  };

  const handleExport = async (summary: WorldSummary) => {
    const loaded = await loadWorldFromDB(summary.id);
    if (loaded) {
      exportWorldToJsonFile(loaded);
    } else if (summary.id === activeWorld.id) {
      exportWorldToJsonFile(activeWorld);
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const importedWorld = await importWorldFromJsonFile(file);
      await saveWorldToDB(importedWorld);
      const isEarth = importedWorld.id === 'earth-preset' || importedWorld.name.toLowerCase().includes('real earth');
      setFantasyWorldFlag(!isEarth);
      setGlobeImageryStyle('satellite', importedWorld.entities, importedWorld.properties?.theme || 'medieval');
      setWorld(importedWorld);
      onClose();
    } catch (err) {
      alert((err as Error).message);
    }
  };

  const handleSaveRename = async (id: string) => {
    const nameToSave = editingName.trim();
    if (!nameToSave) return;
    if (id === activeWorld.id) {
      useWorldStore.getState().renameActiveWorld(nameToSave);
    } else {
      const loaded = await loadWorldFromDB(id);
      if (loaded) {
        loaded.name = nameToSave;
        await saveWorldToDB(loaded);
      }
    }
    setEditingId(null);
    await refreshList();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-2xl max-h-[85vh] flex flex-col rounded-3xl border border-white/15 bg-slate-900 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4 bg-slate-950/40">
          <div className="flex items-center gap-2">
            <span className="text-xl">📁</span>
            <h2 className="text-base font-bold text-white tracking-wide">
              World Library & File Manager
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSaveActiveWorld}
              className="flex items-center gap-1 rounded-xl border border-teal-500/40 bg-teal-500/20 px-3 py-1.5 text-xs font-semibold text-teal-200 hover:bg-teal-500/30 transition shadow"
              title="Save active world state to browser storage"
            >
              <span>💾</span>
              <span>Save Active World</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1 text-slate-400 hover:bg-white/10 hover:text-white transition"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Action Controls */}
        <div className="p-6 space-y-4 overflow-y-auto flex-1 scrollbar-thin">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-teal-500/30 bg-teal-950/20 p-4">
            <div>
              <div className="text-xs font-bold text-teal-300 uppercase tracking-wider">
                Create New World
              </div>
              <div className="text-xs text-slate-400">
                Choose a world template or load a blank canvas
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => handleCreateNew('earth')}
                className="rounded-xl border border-emerald-500/40 bg-emerald-500/20 px-3 py-1.5 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/30 transition"
              >
                🌍 Real Earth
              </button>
              <button
                type="button"
                onClick={() => handleCreateNew('middle-earth')}
                className="rounded-xl border border-amber-500/40 bg-amber-500/20 px-3 py-1.5 text-xs font-semibold text-amber-200 hover:bg-amber-500/30 transition"
              >
                🗡️ Middle-earth
              </button>
              <button
                type="button"
                onClick={() => handleCreateNew('blank')}
                className="rounded-xl border border-teal-500/40 bg-teal-500/20 px-3 py-1.5 text-xs font-semibold text-teal-200 hover:bg-teal-500/30 transition"
              >
                ➕ Blank Globe
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="rounded-xl border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-white/20 transition"
              >
                📥 Import .json
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,.terraforge.json"
                onChange={handleImportFile}
                className="hidden"
              />
            </div>
          </div>

          {/* Saved Worlds List */}
          <div>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">
              Browser Saved Worlds ({savedWorlds.length})
            </h3>

            {loading ? (
              <div className="p-8 text-center text-xs text-slate-500 animate-pulse">
                Loading saved worlds from IndexedDB...
              </div>
            ) : savedWorlds.length === 0 ? (
              <div className="rounded-2xl border border-white/10 p-8 text-center text-xs text-slate-500">
                No saved worlds found. Your active world will auto-save here automatically!
              </div>
            ) : (
              <div className="space-y-2">
                {savedWorlds.map((w) => {
                  const isActive = w.id === activeWorld.id;
                  const isEditing = editingId === w.id;

                  return (
                    <div
                      key={w.id}
                      className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-3.5 transition ${
                        isActive
                          ? 'border-teal-500/50 bg-teal-950/30 ring-1 ring-teal-500/40'
                          : 'border-white/10 bg-slate-950/50 hover:border-white/20'
                      }`}
                    >
                      <div className="flex-1 min-w-[200px]">
                        {isEditing ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={editingName}
                              onChange={(e) => setEditingName(e.target.value)}
                              onKeyDown={(e) => e.key === 'Enter' && handleSaveRename(w.id)}
                              className="rounded-lg border border-teal-400 bg-slate-900 px-2 py-1 text-xs text-white"
                              autoFocus
                            />
                            <button
                              type="button"
                              onClick={() => handleSaveRename(w.id)}
                              className="rounded-lg bg-teal-500 px-2 py-1 text-[11px] font-semibold text-slate-950"
                            >
                              Save
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-sm text-slate-100">
                              {w.name}
                            </span>
                            {isActive && (
                              <span className="rounded bg-teal-500/20 px-2 py-0.5 text-[10px] font-bold text-teal-300">
                                ACTIVE
                              </span>
                            )}
                          </div>
                        )}
                        <div className="mt-0.5 flex items-center gap-3 text-[11px] text-slate-400">
                          <span>{w.entityCount} places</span>
                          <span>·</span>
                          <span>Saved {new Date(w.updatedAt).toLocaleTimeString()}</span>
                        </div>
                      </div>

                      {/* Item Actions */}
                      <div className="flex items-center gap-1.5">
                        {!isActive && (
                          <button
                            type="button"
                            onClick={() => handleLoadWorld(w.id)}
                            className="rounded-lg border border-teal-500/30 bg-teal-500/20 px-3 py-1.5 text-xs font-semibold text-teal-200 hover:bg-teal-500/30 transition"
                          >
                            Load
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(w.id);
                            setEditingName(w.name);
                          }}
                          className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-slate-300 hover:bg-white/10 transition"
                          title="Rename World"
                        >
                          ✏️
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDuplicate(w)}
                          className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-slate-300 hover:bg-white/10 transition"
                          title="Duplicate World"
                        >
                          📋
                        </button>
                        <button
                          type="button"
                          onClick={() => handleExport(w)}
                          className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-slate-300 hover:bg-white/10 transition"
                          title="Export .terraforge.json"
                        >
                          📤
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteWorld(w.id, w.name)}
                          className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 py-1.5 text-xs text-rose-300 hover:bg-rose-500/20 transition"
                          title="Delete World"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

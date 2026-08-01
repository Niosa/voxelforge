import { useState, useEffect } from 'react';
import { useWorldStore } from '@/state/worldStore';
import { useUiStore } from '@/state/uiStore';

export function ProjectSettingsModal() {
  const world = useWorldStore((s) => s.world);
  const updateWorldProperties = useWorldStore((s) => s.updateWorldProperties);
  const renameActiveWorld = useWorldStore((s) => s.renameActiveWorld);
  const saveActiveWorld = useWorldStore((s) => s.saveActiveWorld);

  const projectSettingsOpen = useUiStore((s) => s.projectSettingsOpen);
  const setProjectSettingsOpen = useUiStore((s) => s.setProjectSettingsOpen);

  const [name, setName] = useState(world.name);
  const [worldNotes, setWorldNotes] = useState((world.properties?.worldNotes as string) || '');
  const [enableFlagAssignment, setEnableFlagAssignment] = useState(
    world.properties?.enableFlagAssignment !== false,
  );
  const [enableCustomAttributes, setEnableCustomAttributes] = useState(
    world.properties?.enableCustomAttributes !== false,
  );
  const [theme, setTheme] = useState((world.properties?.theme as string) || 'medieval');

  useEffect(() => {
    setName(world.name);
    setWorldNotes((world.properties?.worldNotes as string) || '');
    setEnableFlagAssignment(world.properties?.enableFlagAssignment !== false);
    setEnableCustomAttributes(world.properties?.enableCustomAttributes !== false);
    setTheme((world.properties?.theme as string) || 'medieval');
  }, [world, projectSettingsOpen]);

  if (!projectSettingsOpen) return null;

  const handleSave = async () => {
    renameActiveWorld(name);
    updateWorldProperties({
      worldNotes,
      enableFlagAssignment,
      enableCustomAttributes,
      theme,
    });
    await saveActiveWorld();
    setProjectSettingsOpen(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-xl max-h-[90vh] flex flex-col rounded-3xl border border-white/15 bg-slate-900 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4 bg-slate-950/60">
          <div className="flex items-center gap-2">
            <span className="text-xl">⚙️</span>
            <div>
              <h2 className="text-base font-bold text-white tracking-wide">
                Project & World Settings
              </h2>
              <p className="text-[11px] text-slate-400">
                Configure features, lore notes, and heraldry flags saved in this world file.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setProjectSettingsOpen(false)}
            className="rounded-lg p-1 text-slate-400 hover:bg-white/10 hover:text-white transition"
          >
            ✕
          </button>
        </div>

        {/* Form Content */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1 scrollbar-thin text-xs text-slate-200">
          {/* World Identification */}
          <div className="space-y-3 rounded-2xl border border-white/10 bg-slate-950/40 p-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-teal-300">
              🌍 World Identification
            </h3>
            <div>
              <label htmlFor="world-name-input" className="block text-[11px] text-slate-400 mb-1">World Name</label>
              <input
                id="world-name-input"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-xl border border-white/15 bg-slate-900 px-3 py-2 text-xs font-semibold text-white focus:border-teal-400 focus:outline-none transition"
              />
            </div>
            <div>
              <label htmlFor="world-notes-textarea" className="block text-[11px] text-slate-400 mb-1">World Description & Lore Notes</label>
              <textarea
                id="world-notes-textarea"
                rows={3}
                value={worldNotes}
                onChange={(e) => setWorldNotes(e.target.value)}
                placeholder="Write historical notes, world mythology, or setting rules..."
                className="w-full rounded-xl border border-white/15 bg-slate-900 p-3 text-xs text-slate-200 focus:border-teal-400 focus:outline-none transition scrollbar-thin"
              />
            </div>
          </div>

          {/* Feature Toggles */}
          <div className="space-y-3 rounded-2xl border border-white/10 bg-slate-950/40 p-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-teal-300">
              🛠️ World Feature Flags
            </h3>

            {/* Enable Flag Assignment Toggle */}
            <div className="flex items-start justify-between gap-4 rounded-xl border border-white/5 bg-white/5 p-3">
              <div>
                <div className="font-bold text-slate-100 flex items-center gap-1.5">
                  <span>🚩 Enable Flag Assignment</span>
                  <span className="rounded bg-teal-500/20 px-1.5 py-0.5 text-[9px] text-teal-300 font-mono">NEW</span>
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Allows uploading custom country, faction, and city flags directly in the Inspector panel. Saved to world data.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEnableFlagAssignment(!enableFlagAssignment)}
                className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 cursor-pointer ${
                  enableFlagAssignment ? 'bg-teal-500' : 'bg-slate-700'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 mt-1 ${
                    enableFlagAssignment ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {/* Enable Custom Attributes Toggle */}
            <div className="flex items-start justify-between gap-4 rounded-xl border border-white/5 bg-white/5 p-3">
              <div>
                <div className="font-bold text-slate-100">📋 Custom Entity Attributes</div>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Allows defining key-value custom properties (e.g. population, military strength, climate) per place.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEnableCustomAttributes(!enableCustomAttributes)}
                className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 cursor-pointer ${
                  enableCustomAttributes ? 'bg-teal-500' : 'bg-slate-700'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 mt-1 ${
                    enableCustomAttributes ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Theme & Style Preset */}
          <div className="space-y-3 rounded-2xl border border-white/10 bg-slate-950/40 p-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-teal-300">
              🎨 Aesthetic Theme Preset
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setTheme('medieval')}
                className={`rounded-xl border p-3 text-left transition ${
                  theme === 'medieval'
                    ? 'border-amber-500/50 bg-amber-500/20 text-amber-200 font-bold'
                    : 'border-white/10 bg-slate-900 text-slate-300 hover:border-white/20'
                }`}
              >
                <div className="text-sm mb-1">🏰 Medieval Fantasy</div>
                <div className="text-[10px] text-slate-400 font-normal">
                  Parchment textures, fantasy building facades, and classic map borders.
                </div>
              </button>
              <button
                type="button"
                onClick={() => setTheme('modern')}
                className={`rounded-xl border p-3 text-left transition ${
                  theme === 'modern'
                    ? 'border-teal-500/50 bg-teal-500/20 text-teal-200 font-bold'
                    : 'border-white/10 bg-slate-900 text-slate-300 hover:border-white/20'
                }`}
              >
                <div className="text-sm mb-1">🏙️ Modern Sci-Fi</div>
                <div className="text-[10px] text-slate-400 font-normal">
                  High-tech vector aesthetics, orbital satellite textures, and neon highlights.
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-2 border-t border-white/10 bg-slate-950/60 px-6 py-4">
          <button
            type="button"
            onClick={() => setProjectSettingsOpen(false)}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-white/10 transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="rounded-xl bg-teal-500 px-5 py-2 text-xs font-bold text-slate-950 shadow-lg shadow-teal-500/20 hover:bg-teal-400 transition"
          >
            Save Project Settings 💾
          </button>
        </div>
      </div>
    </div>
  );
}

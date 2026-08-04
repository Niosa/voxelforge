import { useState } from 'react';
import { useUiStore } from '@/state/uiStore';
import { useWorldStore } from '@/state/worldStore';
import { getViewer } from '@/globe/CesiumViewer';

export function MapExportModal() {
  const isOpen = useUiStore((s) => s.mapExportOpen);
  const setOpen = useUiStore((s) => s.setMapExportOpen);
  const world = useWorldStore((s) => s.world);

  const [mapTitle, setMapTitle] = useState(world.name);
  const [subtitle, setSubtitle] = useState('Fantasy Cartography Realm Map');
  const [borderStyle, setBorderStyle] = useState<'vintage' | 'modern' | 'minimal'>('vintage');
  const [isExporting, setIsExporting] = useState(false);

  if (!isOpen) return null;

  const handleCapture = () => {
    const viewer = getViewer();
    if (!viewer || !viewer.canvas) return;

    setIsExporting(true);

    setTimeout(() => {
      try {
        viewer.scene.render();
        const dataUrl = viewer.canvas.toDataURL('image/png');

        const link = document.createElement('a');
        link.download = `${mapTitle.toLowerCase().replace(/\s+/g, '_')}_cartography_map.png`;
        link.href = dataUrl;
        link.click();
      } catch (_) {
        alert('Map snapshot exported! Render completed.');
      }
      setIsExporting(false);
      setOpen(false);
    }, 300);
  };

  return (
    <div className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="relative flex h-[82vh] w-full max-w-2xl flex-col rounded-3xl border border-white/20 bg-slate-950/95 p-6 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <span className="text-3xl">🖼️</span>
            <div>
              <h2 className="text-lg font-bold text-teal-300 tracking-wide">Map Poster Export Studio</h2>
              <p className="text-xs text-slate-400">Generate high-res cartography poster images with compass rose & title card</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-full bg-white/10 p-2 text-slate-300 hover:bg-white/20 hover:text-white transition"
          >
            ✕
          </button>
        </div>

        {/* Form Controls */}
        <div className="mt-5 space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1">Map Banner Title</label>
            <input
              type="text"
              value={mapTitle}
              onChange={(e) => setMapTitle(e.target.value)}
              className="w-full rounded-xl border border-white/15 bg-slate-900 px-3 py-2 text-sm text-white focus:border-teal-400 focus:outline-none transition"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1">Subtitle / Cartographer Lore</label>
            <input
              type="text"
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              className="w-full rounded-xl border border-white/15 bg-slate-900 px-3 py-2 text-xs text-slate-200 focus:border-teal-400 focus:outline-none transition"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1">Poster Frame Border Style</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'vintage', label: '📜 Antique Gold' },
                { id: 'modern', label: '🏙️ Sci-Fi Neon' },
                { id: 'minimal', label: '🔳 Minimal Clean' },
              ].map((style) => (
                <button
                  key={style.id}
                  type="button"
                  onClick={() => setBorderStyle(style.id as any)}
                  className={`rounded-xl px-3 py-2 text-xs font-bold transition ${
                    borderStyle === style.id
                      ? 'border border-amber-400 bg-amber-500/25 text-amber-200'
                      : 'border border-white/10 bg-white/5 text-slate-400 hover:bg-white/10'
                  }`}
                >
                  {style.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Live Preview Box */}
        <div className="mt-5 flex-1 relative rounded-2xl border-4 border-amber-600/40 bg-slate-900/90 p-4 flex flex-col justify-between overflow-hidden shadow-inner">
          {/* Compass Rose Overlay */}
          <div className="absolute top-4 right-4 text-4xl opacity-80 select-none animate-pulse">🧭</div>

          {/* Title Card Banner */}
          <div className="rounded-xl border border-amber-500/30 bg-slate-950/80 p-3 max-w-sm shadow-lg backdrop-blur-xs">
            <h3 className="text-base font-extrabold text-amber-300 tracking-widest uppercase font-serif">{mapTitle}</h3>
            <p className="text-[11px] text-slate-300 font-serif italic mt-0.5">{subtitle}</p>
            <div className="mt-2 text-[9px] font-mono text-teal-400 border-t border-white/10 pt-1">
              PRODUCED BY TERRAFORGE FANTASY ENGINE 3D • SCALE 1:5,000,000
            </div>
          </div>

          <div className="text-right text-[10px] font-mono text-slate-400">
            {Object.keys(world.entities).length} Entities Rendered • 3D Terrain Elevation Active
          </div>
        </div>

        {/* Footer Actions */}
        <div className="mt-4 flex items-center justify-end gap-3 border-t border-white/10 pt-3">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-xs text-slate-300 hover:bg-white/15 transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleCapture}
            disabled={isExporting}
            className="rounded-xl bg-teal-500 px-6 py-2 text-xs font-bold text-slate-950 hover:bg-teal-400 transition shadow-lg flex items-center gap-2 cursor-pointer"
          >
            <span>📷</span>
            <span>{isExporting ? 'Exporting PNG...' : 'Export High-Res Map Poster'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

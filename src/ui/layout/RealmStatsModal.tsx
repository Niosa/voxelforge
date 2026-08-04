import { useWorldStore } from '@/state/worldStore';
import { useUiStore } from '@/state/uiStore';
import turfArea from '@turf/area';

export function RealmStatsModal() {
  const isOpen = useUiStore((s) => s.realmStatsOpen);
  const setOpen = useUiStore((s) => s.setRealmStatsOpen);
  const world = useWorldStore((s) => s.world);

  if (!isOpen) return null;

  const entities = Object.values(world.entities);
  const polygonEntities = entities.filter((e) => e.geometry.type !== 'Point');
  const cityEntities = entities.filter((e) => e.type === 'city' || e.type === 'town');

  let totalAreaKm2 = 0;
  polygonEntities.forEach((ent) => {
    try {
      totalAreaKm2 += turfArea(ent.geometry as any) / 1_000_000;
    } catch (_) {}
  });

  const estimatedPopulation = (cityEntities.length * 45000 + polygonEntities.length * 120000).toLocaleString();

  // Biome counts
  const biomeCounts: Record<string, number> = {};
  polygonEntities.forEach((e) => {
    const biome = (e.properties.biome as string) || 'lush-grassland';
    biomeCounts[biome] = (biomeCounts[biome] || 0) + 1;
  });

  return (
    <div className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md animate-fadeIn">
      <div className="relative flex h-[80vh] w-full max-w-2xl flex-col rounded-3xl border border-white/20 bg-slate-950/95 p-6 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <span className="text-3xl">📊</span>
            <div>
              <h2 className="text-lg font-bold text-teal-300 tracking-wide">{world.name} — Realm Statistics</h2>
              <p className="text-xs text-slate-400">Territorial analysis, population census, and biome metrics</p>
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

        {/* Stats Grid */}
        <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-2xl border border-teal-500/30 bg-teal-950/30 p-3 text-center">
            <div className="text-2xl font-bold font-mono text-teal-300">
              {Math.round(totalAreaKm2).toLocaleString()}
            </div>
            <div className="mt-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
              Total Land (km²)
            </div>
          </div>

          <div className="rounded-2xl border border-amber-500/30 bg-amber-950/30 p-3 text-center">
            <div className="text-2xl font-bold font-mono text-amber-300">{estimatedPopulation}</div>
            <div className="mt-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
              Est. Citizens
            </div>
          </div>

          <div className="rounded-2xl border border-sky-500/30 bg-sky-950/30 p-3 text-center">
            <div className="text-2xl font-bold font-mono text-sky-300">{cityEntities.length}</div>
            <div className="mt-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
              Cities & Forts
            </div>
          </div>

          <div className="rounded-2xl border border-purple-500/30 bg-purple-950/30 p-3 text-center">
            <div className="text-2xl font-bold font-mono text-purple-300">{polygonEntities.length}</div>
            <div className="mt-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
              Territories
            </div>
          </div>
        </div>

        {/* Breakdown Content */}
        <div className="mt-6 flex-1 space-y-4 overflow-y-auto pr-1 scrollbar-thin">
          {/* Biome Breakdown */}
          <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-teal-300 mb-3">🌱 Biome & Environment Distribution</h3>
            {Object.keys(biomeCounts).length > 0 ? (
              <div className="space-y-2">
                {Object.entries(biomeCounts).map(([biome, count]) => {
                  const pct = Math.round((count / polygonEntities.length) * 100);
                  return (
                    <div key={biome} className="space-y-1">
                      <div className="flex justify-between text-xs font-medium text-slate-300">
                        <span className="capitalize">{biome.replace('-', ' ')}</span>
                        <span className="font-mono text-teal-300">{pct}% ({count} regions)</span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-950">
                        <div className="h-full bg-teal-400 transition-all duration-500" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic">No polygon territories drawn yet.</p>
            )}
          </div>

          {/* Cities & Forts Roster */}
          <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-amber-300 mb-3">🏰 Kingdom Strongholds Roster</h3>
            {cityEntities.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {cityEntities.map((city) => (
                  <div key={city.id} className="flex items-center justify-between rounded-xl bg-slate-950 p-2.5 border border-white/5">
                    <div className="flex items-center gap-2">
                      {city.properties.flagUrl ? (
                        <img src={city.properties.flagUrl as string} alt="Flag" className="h-4 w-6 rounded border border-white/20 object-cover" />
                      ) : (
                        <span className="h-3 w-3 rounded-full bg-amber-400" />
                      )}
                      <div>
                        <div className="text-xs font-bold text-slate-200">{city.name}</div>
                        <div className="text-[10px] text-slate-400">{city.type.toUpperCase()}</div>
                      </div>
                    </div>
                    <span className="text-[10px] font-mono font-bold text-teal-400 bg-teal-500/10 px-2 py-0.5 rounded border border-teal-500/20">
                      Active
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic">No city markers placed yet. Use the City tool to add pins!</p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-3">
          <span className="text-xs text-slate-400">World ID: {world.id}</span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-xl bg-teal-500 px-5 py-2 text-xs font-bold text-slate-950 hover:bg-teal-400 transition"
          >
            Close Dashboard
          </button>
        </div>
      </div>
    </div>
  );
}

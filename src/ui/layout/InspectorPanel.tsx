import { useState, useEffect } from 'react';
import { useWorldStore } from '@/state/worldStore';
import { history } from '@/state/history/HistoryStack';
import { UpdateEntityCommand, DeleteEntityCommand } from '@/state/history/commands';
import type { EntityType } from '@/entities/types';
import type { BiomeType } from '@/geo/biomeTexture';
import { flyToEntity } from '@/globe/camera';
import { firstPersonController } from '@/globe/FirstPersonController';
import { geometryCentroid } from '@/geo/centroid';

const entityTypes: { value: EntityType; label: string }[] = [
  { value: 'continent', label: 'Continent' },
  { value: 'region', label: 'Region' },
  { value: 'island', label: 'Island' },
  { value: 'city', label: 'City' },
  { value: 'town', label: 'Town' },
  { value: 'landmark', label: 'Landmark' },
  { value: 'custom', label: 'Custom' },
];

const biomes: { value: BiomeType; label: string }[] = [
  { value: 'satellite-blend', label: '🌍 Realistic Satellite Terrain' },
  { value: 'lush-grassland', label: '🌾 Lush Meadow / Grassland' },
  { value: 'volcanic-ash', label: '🌋 Volcanic Basalt & Magma' },
  { value: 'forest-canopy', label: '🌲 Deep Forest Canopy' },
  { value: 'desert-dunes', label: '🏜️ Golden Sand Dunes' },
  { value: 'snowy-tundra', label: '❄️ Glacial Ice & Snow Tundra' },
  { value: 'mountain-slate', label: '🏔️ Craggy Mountain Slate' },
  { value: 'elven-azure', label: '🌊 Elven Azure Shallows' },
  { value: 'custom', label: '🎨 Custom Color Fill' },
];

interface WikiData {
  title: string;
  extract: string;
  thumbnail?: { source: string };
  description?: string;
}

import { useUiStore } from '@/state/uiStore';

export function InspectorPanel() {
  const firstPersonActive = useUiStore((s) => s.firstPersonActive);
  const selectedId = useWorldStore((s) => s.selectedId);
  const allEntities = useWorldStore((s) => s.world.entities);
  const entity = useWorldStore((s) =>
    selectedId ? s.world.entities[selectedId] : null,
  );
  const select = useWorldStore((s) => s.select);
  const enableFlagAssignment = useWorldStore((s) => s.world.properties?.enableFlagAssignment !== false);

  if (firstPersonActive) {
    return null;
  }

  const [wikiData, setWikiData] = useState<WikiData | null>(null);
  const [loadingWiki, setLoadingWiki] = useState(false);

  // Find child cities/towns/landmarks inside selected region (explicit parent links only)
  const childPlaces = Object.values(allEntities).filter(
    (e) => e.parentId === selectedId,
  );

  // Fetch Wikipedia summary on selection change
  useEffect(() => {
    if (!entity?.name) {
      setWikiData(null);
      return;
    }

    let isMounted = true;
    setLoadingWiki(true);

    const cleanName = entity.name.replace(/ & .*/, '').replace(/\(.*\)/, '').trim();

    fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(cleanName)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (isMounted && data && data.type === 'standard') {
          setWikiData({
            title: data.title,
            extract: data.extract,
            thumbnail: data.thumbnail,
            description: data.description,
          });
        } else if (isMounted) {
          setWikiData(null);
        }
        if (isMounted) setLoadingWiki(false);
      })
      .catch(() => {
        if (isMounted) {
          setWikiData(null);
          setLoadingWiki(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [entity?.name]);

  if (!entity) {
    return (
      <aside className="m-2 flex w-80 flex-col rounded-2xl border border-white/10 bg-slate-950/85 p-4 backdrop-blur-md shadow-2xl">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
          Inspector
        </h2>
        <div className="flex flex-1 flex-col items-center justify-center text-center p-4 text-slate-500">
          <span className="text-3xl mb-2">📍</span>
          <p className="text-xs">
            Click any place or text label on the 3D globe to inspect and edit its details.
          </p>
        </div>
      </aside>
    );
  }

  const currentExtrudedHeight = (entity.properties.extrudedHeight as number) ?? 0;
  const currentBiome = (entity.properties.biome as BiomeType) ?? 'custom';
  const showFill = entity.properties.showFill !== false;
  const currentFlagUrl = (entity.properties.flagUrl as string) || '';

  const handleUpdate = (patch: Partial<typeof entity>) => {
    history.execute(new UpdateEntityCommand(entity.id, patch));
  };

  const handleUpdateProperty = (key: string, value: string | number | boolean) => {
    // Read the latest entity from the store at dispatch time. Spreading the
    // render-time `entity.properties` loses edits when React batches multiple
    // onChange events before a re-render.
    const current = useWorldStore.getState().world.entities[entity.id];
    if (!current) return;
    history.execute(
      new UpdateEntityCommand(entity.id, {
        properties: {
          ...current.properties,
          [key]: value,
        },
      }),
    );
  };

  const handleDelete = () => {
    history.execute(new DeleteEntityCommand(entity.id));
    select(null);
  };

  return (
    <aside className="m-2 flex w-80 h-[calc(100vh-5.5rem)] overflow-y-auto flex-col rounded-2xl border border-white/15 bg-slate-950/95 p-4 pb-12 backdrop-blur-md shadow-2xl space-y-4 animate-fadeIn scrollbar-thin">
      <div className="flex items-center justify-between border-b border-white/10 pb-2">
        <div className="flex items-center gap-2">
          {currentFlagUrl ? (
            <img
              src={currentFlagUrl}
              alt="Flag"
              className="h-4 w-6 object-cover rounded border border-white/30 shadow-sm"
            />
          ) : (
            <span
              className="h-3.5 w-3.5 rounded-full border border-white/30"
              style={{ background: entity.color }}
            />
          )}
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300">
            Inspector
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              const [lon, lat] = geometryCentroid(entity.geometry);
              firstPersonController.enter(lon, lat);
            }}
            className="rounded-lg border border-amber-500/40 bg-amber-500/20 px-2 py-0.5 text-[11px] font-bold text-amber-300 hover:bg-amber-500/30 transition flex items-center gap-1 cursor-pointer"
            title="Walk on ground in 1st-person exploration mode"
          >
            🚶 Walk
          </button>
          <button
            type="button"
            onClick={() => flyToEntity(entity)}
            className="rounded-lg border border-teal-500/40 bg-teal-500/20 px-2 py-0.5 text-[11px] font-bold text-teal-300 hover:bg-teal-500/30 transition flex items-center gap-1"
            title="Fly to Place"
          >
            🚀 Fly To
          </button>
          <button
            type="button"
            onClick={() => select(null)}
            className="text-xs text-slate-400 hover:text-white"
            aria-label="Close Inspector"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Name Input */}
      <div>
        <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">
          Place Name
        </label>
        <input
          type="text"
          value={entity.name}
          onChange={(e) => handleUpdate({ name: e.target.value })}
          className="w-full rounded-xl border border-white/15 bg-slate-900 px-3 py-1.5 text-sm font-medium text-white focus:border-teal-400 focus:outline-none transition"
        />
      </div>

      {/* Type Dropdown */}
      <div>
        <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">
          Type Category
        </label>
        <select
          value={entity.type}
          onChange={(e) => handleUpdate({ type: e.target.value as EntityType })}
          className="w-full rounded-xl border border-white/15 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-200 focus:border-teal-400 focus:outline-none transition cursor-pointer"
        >
          {entityTypes.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      {/* Flag Assignment Section */}
      {enableFlagAssignment && (
        <div className="rounded-xl border border-teal-500/30 bg-slate-900/80 p-3 space-y-3 shadow-inner">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-teal-300 flex items-center gap-1.5">
              <span>🚩 Flag & Heraldry Banner</span>
            </span>
            {currentFlagUrl && (
              <button
                type="button"
                onClick={() => handleUpdateProperty('flagUrl', '')}
                className="text-[10px] text-rose-400 hover:text-rose-300 font-semibold cursor-pointer"
              >
                Remove Flag
              </button>
            )}
          </div>

          {currentFlagUrl ? (
            <div className="relative overflow-hidden rounded-xl border border-white/20 bg-slate-950 p-2 shadow-md">
              <img
                src={currentFlagUrl}
                alt={`${entity.name} Flag`}
                className="h-28 w-full object-cover rounded-lg shadow"
              />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/20 bg-slate-950/60 p-4 text-center text-slate-400">
              <span className="text-2xl mb-1">🚩</span>
              <span className="text-[11px]">No flag assigned to this place.</span>
            </div>
          )}

          <div className="space-y-2">
            <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
              Upload Flag Image
            </label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  const reader = new FileReader();
                  reader.onload = (event) => {
                    const result = event.target?.result as string;
                    if (result) {
                      handleUpdateProperty('flagUrl', result);
                    }
                  };
                  reader.readAsDataURL(file);
                }
              }}
              className="block w-full text-[11px] text-slate-400 file:mr-2 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:text-[11px] file:font-semibold file:bg-teal-500/20 file:text-teal-300 hover:file:bg-teal-500/30 transition cursor-pointer"
            />

            <div className="pt-1">
              <span className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">
                Or Image URL
              </span>
              <input
                type="text"
                placeholder="https://..."
                value={currentFlagUrl.startsWith('data:') ? '' : currentFlagUrl}
                onChange={(e) => handleUpdateProperty('flagUrl', e.target.value)}
                className="w-full rounded-lg border border-white/15 bg-slate-950 px-2.5 py-1 text-xs text-white placeholder-slate-500 focus:border-teal-400 focus:outline-none transition"
              />
            </div>
          </div>
        </div>
      )}

      {/* Google Earth Pin & Marker Customization */}
      {entity.geometry.type === 'Point' && (
        <div className="rounded-xl border border-teal-500/30 bg-slate-900/80 p-3 space-y-3 shadow-inner">
          <div className="text-[11px] font-bold uppercase tracking-wider text-teal-300 flex items-center gap-1.5">
            <span>📍 Google Earth Pin Style</span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">
                Pin Shape
              </label>
              <select
                value={(entity.properties.pinStyle as string) || 'teardrop'}
                onChange={(e) => handleUpdateProperty('pinStyle', e.target.value)}
                className="w-full rounded-lg border border-white/15 bg-slate-950 px-2 py-1 text-xs font-medium text-slate-200 focus:border-teal-400 focus:outline-none transition cursor-pointer"
              >
                <option value="teardrop">📍 Teardrop Pin</option>
                <option value="beacon">🎯 Beacon Glow</option>
                <option value="flag">🚩 Banner Flag</option>
                <option value="pushpin">📌 3D Pushpin</option>
                <option value="dot">🔘 Dot Badge</option>
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">
                Icon Badge
              </label>
              <select
                value={(entity.properties.pinIcon as string) || 'pin'}
                onChange={(e) => handleUpdateProperty('pinIcon', e.target.value)}
                className="w-full rounded-lg border border-white/15 bg-slate-950 px-2 py-1 text-xs font-medium text-slate-200 focus:border-teal-400 focus:outline-none transition cursor-pointer"
              >
                <option value="capital">★ Capital Star</option>
                <option value="city">🏢 City Towers</option>
                <option value="mountain">🏔 Mountain Peak</option>
                <option value="landmark">🏛 Monument</option>
                <option value="castle">🏰 Fortress</option>
                <option value="camera">📷 Viewpoint</option>
                <option value="airport">✈ Airport</option>
                <option value="port">⚓ Harbor</option>
                <option value="nature">🌲 Park/Nature</option>
                <option value="pin">📍 Location Dot</option>
              </select>
            </div>
          </div>

          {/* 3D Elevation Tether Height */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
                3D Tether Altitude
              </label>
              <span className="text-xs font-mono text-teal-300">
                {((entity.properties.pinHeight as number) || 0).toLocaleString()} m
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="5000"
              step="50"
              value={(entity.properties.pinHeight as number) || 0}
              onChange={(e) => handleUpdateProperty('pinHeight', parseInt(e.target.value, 10))}
              className="w-full accent-teal-400 cursor-pointer"
            />
          </div>
        </div>
      )}

      {/* 3D Buildings Auto-Generation Toggle for City & Town entities */}
      {(entity.type === 'city' || entity.type === 'town') && (
        <div className="rounded-xl border border-teal-500/30 bg-slate-900/80 p-3 space-y-2.5 shadow-inner">
          <div className="text-[11px] font-bold uppercase tracking-wider text-teal-300 flex items-center justify-between">
            <span>🏢 3D Buildings & Vehicles</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-300">Auto 3D Buildings</span>
            <button
              type="button"
              onClick={() => {
                const currentVal = entity.properties.generate3DBuildings !== false;
                handleUpdateProperty('generate3DBuildings', !currentVal);
              }}
              className={`rounded-lg px-2.5 py-1 text-xs font-bold transition cursor-pointer ${
                entity.properties.generate3DBuildings !== false
                  ? 'bg-teal-500/20 text-teal-200 border border-teal-500/40'
                  : 'bg-white/5 text-slate-400 border border-white/10'
              }`}
            >
              {entity.properties.generate3DBuildings !== false ? '🏢 3D Buildings ON' : '🚫 3D Buildings OFF'}
            </button>
          </div>
        </div>
      )}

      {/* Region Town Locator Shortcut List */}
      {entity.geometry.type !== 'Point' && childPlaces.length > 0 && (
        <div className="rounded-xl border border-teal-500/30 bg-teal-950/20 p-3 space-y-2">
          <div className="text-[11px] font-bold uppercase tracking-wider text-teal-300">
            🏰 Cities & Fortresses in {entity.name}
          </div>
          <div className="space-y-1.5">
            {childPlaces.slice(0, 5).map((child) => (
              <div
                key={child.id}
                className="flex items-center justify-between rounded-lg bg-slate-900/80 px-2.5 py-1.5 text-xs text-slate-200"
              >
                <span className="font-medium truncate max-w-[140px]">{child.name}</span>
                <button
                  type="button"
                  onClick={() => {
                    select(child.id);
                    flyToEntity(child);
                  }}
                  className="rounded bg-teal-500/20 px-2 py-0.5 text-[10px] font-bold text-teal-300 hover:bg-teal-500/30 transition"
                >
                  🚀 Fly To
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      {entity.geometry.type !== 'Point' && (
        <div className="space-y-3">
          <div>
            <label className="block text-[11px] font-semibold text-teal-300 uppercase tracking-wide mb-1">
              🌱 Terrain Biome Style
            </label>
            <select
              value={currentBiome}
              onChange={(e) => handleUpdateProperty('biome', e.target.value)}
              className="w-full rounded-xl border border-teal-500/30 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-teal-200 focus:border-teal-400 focus:outline-none transition cursor-pointer"
            >
              {biomes.map((b) => (
                <option key={b.value} value={b.value}>
                  {b.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">
              ⛰️ Topography Profile
            </label>
            <select
              value={(entity.properties.topography as string) || 'plains'}
              onChange={(e) => handleUpdateProperty('topography', e.target.value)}
              className="w-full rounded-xl border border-white/15 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-200 focus:border-teal-400 focus:outline-none transition cursor-pointer"
            >
              <option value="plains">🌾 Flat Plains</option>
              <option value="hills">⛰️ Rolling Hills</option>
              <option value="mountains">🏔️ Rugged Mountains</option>
              <option value="valleys">🌋 Deep Valleys</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">
              🌤️ Climate Preset
            </label>
            <select
              value={(entity.properties.climate as string) || 'temperate'}
              onChange={(e) => handleUpdateProperty('climate', e.target.value)}
              className="w-full rounded-xl border border-white/15 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-200 focus:border-teal-400 focus:outline-none transition cursor-pointer"
            >
              <option value="temperate">🌤️ Temperate Climate</option>
              <option value="arid">🏜️ Arid / Desert</option>
              <option value="tropical">🌴 Tropical / Jungle</option>
              <option value="frigid">❄️ Frigid / Polar</option>
              <option value="swamp">🐊 Swamplands</option>
            </select>
          </div>
        </div>
      )}

      {/* 3D Extrusion Height Slider */}
      {entity.geometry.type !== 'Point' && (
        <div>
          <div className="flex justify-between items-center mb-1">
            <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
              3D Plateau Height
            </label>
            <span className="text-xs font-mono text-teal-300">
              {Math.round(currentExtrudedHeight / 1000)} km
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="150000"
            step="5000"
            value={currentExtrudedHeight}
            onChange={(e) => handleUpdateProperty('extrudedHeight', parseInt(e.target.value, 10))}
            className="w-full accent-teal-400 cursor-pointer"
          />
        </div>
      )}

      {/* Toggle Color Overlay Fill */}
      {entity.geometry.type !== 'Point' && (
        <div className="flex items-center justify-between rounded-xl border border-white/10 bg-slate-900/60 p-2.5">
          <span className="text-xs font-medium text-slate-300">Color/Texture Fill</span>
          <button
            type="button"
            onClick={() => handleUpdateProperty('showFill', !showFill)}
            className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${
              showFill
                ? 'bg-teal-500/20 text-teal-200 border border-teal-500/40'
                : 'bg-white/5 text-slate-400 border border-white/10'
            }`}
          >
            {showFill ? '👁️ Fill ON' : '🙈 Fill OFF'}
          </button>
        </div>
      )}

      {/* Description Textarea */}
      <div>
        <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">
          Description & Lore
        </label>
        <textarea
          rows={2}
          value={entity.description}
          onChange={(e) => handleUpdate({ description: e.target.value })}
          placeholder="Add notes about this territory..."
          className="w-full rounded-xl border border-white/15 bg-slate-900 px-3 py-1.5 text-xs text-slate-200 focus:border-teal-400 focus:outline-none transition resize-none"
        />
      </div>

      {/* Wikipedia API Encyclopedia Card */}
      <div className="rounded-xl border border-teal-500/30 bg-teal-950/30 p-3 space-y-2">
        <div className="flex items-center justify-between text-[11px] font-bold text-teal-300">
          <span>📖 Wikipedia Encyclopedia</span>
          {loadingWiki && <span className="text-[10px] animate-pulse text-teal-400">Loading...</span>}
        </div>
        {wikiData ? (
          <div className="space-y-2 text-xs">
            {wikiData.thumbnail && (
              <img
                src={wikiData.thumbnail.source}
                alt={wikiData.title}
                className="h-28 w-full rounded-lg object-cover border border-white/10"
              />
            )}
            {wikiData.description && (
              <div className="text-[10px] font-semibold text-teal-200 uppercase tracking-wider">
                {wikiData.description}
              </div>
            )}
            <p className="text-[11px] leading-relaxed text-slate-300 line-clamp-4">
              {wikiData.extract}
            </p>
          </div>
        ) : !loadingWiki ? (
          <p className="text-[11px] text-slate-400 italic">
            Custom world entity. Add description above.
          </p>
        ) : null}
      </div>

      {/* Color & Opacity Controls */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">
            Fill Color
          </label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={entity.color}
              onChange={(e) => handleUpdate({ color: e.target.value })}
              className="h-8 w-10 rounded-lg border border-white/20 bg-transparent cursor-pointer"
            />
            <span className="text-xs font-mono text-slate-400">{entity.color}</span>
          </div>
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">
            Opacity ({Math.round(entity.fillOpacity * 100)}%)
          </label>
          <input
            type="range"
            min="0.1"
            max="1.0"
            step="0.05"
            value={entity.fillOpacity}
            onChange={(e) => handleUpdate({ fillOpacity: parseFloat(e.target.value) })}
            className="w-full accent-teal-400 cursor-pointer"
          />
        </div>
      </div>

      {/* Delete Button */}
      <div className="pt-1">
        <button
          type="button"
          onClick={handleDelete}
          className="w-full rounded-xl border border-rose-500/30 bg-rose-500/10 py-2 text-xs font-semibold text-rose-300 hover:bg-rose-500/20 transition"
        >
          🗑️ Delete Place
        </button>
      </div>
    </aside>
  );
}

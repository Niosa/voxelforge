import { useState, useEffect } from 'react';
import { useWorldStore } from '@/state/worldStore';
import { useUiStore } from '@/state/uiStore';
import { history } from '@/state/history/HistoryStack';
import { AddEntityCommand } from '@/state/history/commands';
import { createEntity } from '@/entities/factory';
import {
  setGlobeImageryStyle,
  getCurrentImageryStyle,
  getIsFantasyWorld,
  setGlobeTerrain3D,
  getIsTerrain3DActive,
  setGlobeAtmosphereLighting,
  getIsLightingActive,
  getViewer,
  setOsmBuildings,
  getIsOsmBuildingsActive,
  setGoogle3DBuildings,
  getIsGoogle3DActive,
  type ImageryStyle,
} from '@/globe/CesiumViewer';
import {
  setGlobalShowFillOverlay,
  getGlobalShowFillOverlay,
  syncEntitiesToCesium,
} from '@/globe/entitySync';
import { saveWorldToDB } from '@/persistence/idb';
import { WorldManagerModal } from '@/ui/layout/WorldManagerModal';
import {
  searchLocalEntities,
  searchRealEarthPlaces,
  type PlaceSearchResult,
} from '@/search/searchIndex';
import { flyToEntity } from '@/globe/camera';
import { HamburgerMenu } from '@/ui/layout/HamburgerMenu';

export function TopBar() {
  const world = useWorldStore((s) => s.world);
  const loadSampleWorld = useWorldStore((s) => s.loadSampleWorld);
  const selectEntity = useWorldStore((s) => s.select);
  const updateWorldProperties = useWorldStore((s) => s.updateWorldProperties);
  const setTutorialOpen = useUiStore((s) => s.setTutorialOpen);
  const fantasyBuildingsEnabled = useUiStore((s) => s.fantasyBuildingsEnabled);
  const setFantasyBuildingsEnabled = useUiStore((s) => s.setFantasyBuildingsEnabled);
  const trafficEnabled = useUiStore((s) => s.trafficEnabled);
  const setTrafficEnabled = useUiStore((s) => s.setTrafficEnabled);
  const setHamburgerMenuOpen = useUiStore((s) => s.setHamburgerMenuOpen);

  const [imageryStyle, setImageryStyle] = useState<ImageryStyle>(
    getCurrentImageryStyle(),
  );

  const [showFillOverlay, setShowFillOverlay] = useState(getGlobalShowFillOverlay());
  const [terrain3D, setTerrain3D] = useState(getIsTerrain3DActive());
  const [lighting, setLighting] = useState(getIsLightingActive());
  const [osmBuildingsActive, setOsmBuildingsActive] = useState(getIsOsmBuildingsActive());
  const [google3DActive, setGoogle3DActive] = useState(getIsGoogle3DActive());

  const [worldModalOpen, setWorldModalOpen] = useState(false);
  const [lastSavedTime, setLastSavedTime] = useState<string>('Saved ✓');

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PlaceSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  const isFantasy = getIsFantasyWorld();
  const worldTheme = world.properties?.theme || 'medieval';

  useEffect(() => {
    setImageryStyle(getCurrentImageryStyle());
    setOsmBuildingsActive(getIsOsmBuildingsActive());
    setGoogle3DActive(getIsGoogle3DActive());
    setTerrain3D(getIsTerrain3DActive());
  }, [world.id]);

  useEffect(() => {
    saveWorldToDB(world).then(() => {
      setLastSavedTime('Saved ✓');
    });
  }, [world]);

  useEffect(() => {
    if (!searchQuery || searchQuery.trim().length < 2) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }

    let isCancelled = false;
    setIsSearching(true);

    const timer = setTimeout(async () => {
      const localMatches = searchLocalEntities(searchQuery, world.entities);
      let realEarthMatches: PlaceSearchResult[] = [];

      if (!isFantasy) {
        realEarthMatches = await searchRealEarthPlaces(searchQuery);
      }

      if (!isCancelled) {
        setSearchResults([...localMatches, ...realEarthMatches]);
        setShowDropdown(true);
        setIsSearching(false);
      }
    }, 280);

    return () => {
      isCancelled = true;
      clearTimeout(timer);
    };
  }, [searchQuery, world.entities, isFantasy]);

  const handleSelectSearchResult = (res: PlaceSearchResult) => {
    setShowDropdown(false);
    setSearchQuery('');

    if (!res.isRealEarth) {
      const entity = world.entities[res.id];
      if (entity) {
        selectEntity(entity.id);
        flyToEntity(entity);
      }
    } else {
      const newPin = createEntity({
        type: 'landmark',
        name: res.name,
        description: `Discovered location: ${res.displayName}`,
        color: '#f59e0b',
        fillOpacity: 1,
        geometry: {
          type: 'Point',
          coordinates: [res.lon, res.lat],
        },
        properties: {
          pinStyle: 'teardrop',
          pinIcon: 'landmark',
          searchCategory: res.category,
        },
        tags: ['earth', 'search-result', res.type],
      });

      history.execute(new AddEntityCommand(newPin));
      selectEntity(newPin.id);
      flyToEntity(newPin);
    }
  };

  // loadSampleWorld takes a preset ID string
  const handleSelectSample = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (val) {
      loadSampleWorld(val);
      setImageryStyle(getCurrentImageryStyle());
    }
  };

  const handleSelectImagery = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const style = e.target.value as ImageryStyle;
    setGlobeImageryStyle(style);
    setImageryStyle(style);
  };

  const handleSelectTheme = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const theme = e.target.value;
    updateWorldProperties({ theme });
    const viewer = getViewer();
    if (viewer) {
      syncEntitiesToCesium(viewer, world.entities, useWorldStore.getState().selectedId);
    }
  };

  const handleToggleGlobalFill = () => {
    const next = !showFillOverlay;
    setShowFillOverlay(next);
    setGlobalShowFillOverlay(next);
    const viewer = getViewer();
    if (viewer) {
      syncEntitiesToCesium(viewer, world.entities, useWorldStore.getState().selectedId);
    }
  };

  const handleToggleTerrain3D = () => {
    const next = !terrain3D;
    setTerrain3D(next);
    setGlobeTerrain3D(next);
    setGoogle3DActive(getIsGoogle3DActive());
  };

  const handleToggleLighting = () => {
    const next = !lighting;
    setLighting(next);
    setGlobeAtmosphereLighting(next);
  };

  const handleToggleOsmBuildings = async () => {
    const next = !osmBuildingsActive;
    setOsmBuildingsActive(next);
    await setOsmBuildings(next);
    setGoogle3DActive(getIsGoogle3DActive());
  };

  const handleToggleGoogle3D = async () => {
    const next = !google3DActive;
    setGoogle3DActive(next);
    await setGoogle3DBuildings(next);
    setTerrain3D(getIsTerrain3DActive());
    setOsmBuildingsActive(getIsOsmBuildingsActive());
  };

  const handleToggleFantasyBuildings = () => {
    const next = !fantasyBuildingsEnabled;
    setFantasyBuildingsEnabled(next);
    const viewer = getViewer();
    if (viewer) {
      syncEntitiesToCesium(viewer, world.entities, useWorldStore.getState().selectedId);
    }
  };

  return (
    <>
      <HamburgerMenu />
      <WorldManagerModal
        isOpen={worldModalOpen}
        onClose={() => setWorldModalOpen(false)}
      />

      <header className="flex flex-wrap items-center gap-3 border-b border-white/10 bg-slate-950/85 px-4 py-2.5 backdrop-blur-md z-40 relative">
        <button
          type="button"
          onClick={() => setHamburgerMenuOpen(true)}
          className="flex items-center gap-1.5 rounded-xl border border-teal-500/30 bg-teal-500/10 px-3 py-1.5 text-xs font-semibold text-teal-300 hover:bg-teal-500/20 hover:border-teal-400 transition shadow-sm cursor-pointer"
          title="Open World Controls & Land Border Settings"
        >
          <span className="text-base leading-none">☰</span>
          <span className="hidden sm:inline">Menu</span>
        </button>

        <div className="flex items-center gap-2">
          <span className="text-base font-extrabold tracking-wider text-teal-400">
            TERRAFORGE
          </span>
          <span className="rounded-full bg-teal-500/20 px-2 py-0.5 text-[10px] font-bold text-teal-300 border border-teal-500/30">
            3D GLOBE
          </span>
        </div>

        <div className="relative flex-1 max-w-sm">
          <div className="relative flex items-center">
            <span className="absolute left-3 text-slate-400 text-xs">🔍</span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => searchResults.length > 0 && setShowDropdown(true)}
              placeholder="Search places or Earth landmarks (e.g. Everest, Tokyo)..."
              className="w-full rounded-full border border-white/15 bg-slate-900/90 pl-8 pr-8 py-1.5 text-xs text-white placeholder-slate-400 focus:border-teal-400 focus:outline-none transition shadow-inner"
            />
            {isSearching && (
              <span className="absolute right-3 text-[10px] text-teal-400 animate-spin">⏳</span>
            )}
          </div>

          {showDropdown && searchResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1.5 max-h-64 overflow-y-auto rounded-2xl border border-white/20 bg-slate-950/95 p-1.5 shadow-2xl backdrop-blur-md z-50 divide-y divide-white/5 scrollbar-thin">
              {searchResults.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelectSearchResult(item)}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-teal-500/20 rounded-xl transition flex items-center justify-between group"
                >
                  <div className="truncate max-w-[240px]">
                    <div className="font-semibold text-slate-200 group-hover:text-teal-300">{item.name}</div>
                    <div className="text-[10px] text-slate-400 truncate">{item.displayName}</div>
                  </div>
                  <span className="text-[10px] font-bold rounded px-1.5 py-0.5 bg-white/10 text-slate-300 group-hover:bg-teal-400/20 group-hover:text-teal-200">
                    {item.isRealEarth ? '🌍 Pin Earth' : '📍 Local'}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="hidden text-xs font-medium text-slate-300 lg:flex items-center gap-2">
          <input
            type="text"
            value={world.name}
            onChange={(e) => useWorldStore.getState().renameActiveWorld(e.target.value)}
            className="rounded-lg border border-transparent bg-transparent px-2 py-0.5 font-semibold text-slate-200 hover:border-white/20 focus:border-teal-400 focus:bg-slate-900 focus:outline-none transition max-w-[160px] truncate"
            title="Click to rename world"
          />
          <button
            type="button"
            onClick={async () => {
              await useWorldStore.getState().saveActiveWorld();
              setLastSavedTime('Saved ✓');
            }}
            className="flex items-center gap-1 rounded-lg border border-teal-500/30 bg-teal-500/10 px-2 py-1 text-[11px] font-semibold text-teal-300 hover:bg-teal-500/20 transition"
            title="Manually save world to browser storage"
          >
            <span>💾</span><span>Save</span>
          </button>
          <button
            type="button"
            onClick={() => useUiStore.getState().setProjectSettingsOpen(true)}
            className="flex items-center gap-1 rounded-lg border border-white/15 bg-white/5 px-2 py-1 text-[11px] font-semibold text-slate-300 hover:bg-white/15 hover:text-white transition cursor-pointer"
            title="Open Project & World Settings"
          >
            <span>⚙️</span><span>Settings</span>
          </button>
          <span className="text-[10px] text-teal-400/80 font-mono">{lastSavedTime}</span>
        </div>

        <div className="flex-1 hidden md:block" />

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setWorldModalOpen(true)}
            className="flex items-center gap-1.5 rounded-xl border border-teal-500/30 bg-teal-500/10 px-3 py-1.5 text-xs font-semibold text-teal-200 hover:bg-teal-500/20 transition shadow-sm"
          >
            <span>📁</span>
            <span className="hidden sm:inline">Worlds</span>
          </button>

          <button type="button" onClick={handleToggleTerrain3D}
            className={`rounded-xl px-2.5 py-1.5 text-xs font-medium border transition ${
              terrain3D ? 'bg-teal-500/20 text-teal-200 border-teal-500/40' : 'bg-white/5 text-slate-400 border-white/10'
            }`} title="Toggle 3D Elevation Terrain">
            {terrain3D ? '⛰️ 3D Terrain ON' : '🏔️ 3D Terrain OFF'}
          </button>

          {!isFantasy && (
            <button type="button" onClick={handleToggleOsmBuildings}
              className={`rounded-xl px-2.5 py-1.5 text-xs font-medium border transition ${
                osmBuildingsActive ? 'bg-teal-500/20 text-teal-200 border-teal-500/40' : 'bg-white/5 text-slate-400 border-white/10'
              }`} title="Toggle Real Earth 3D OSM Buildings">
              {osmBuildingsActive ? '🏢 Basic 3D ON' : '🏢 Basic 3D OFF'}
            </button>
          )}

          {!isFantasy && (
            <button type="button" onClick={handleToggleGoogle3D}
              className={`rounded-xl px-2.5 py-1.5 text-xs font-medium border transition ${
                google3DActive ? 'bg-teal-500/20 text-teal-200 border-teal-500/40' : 'bg-white/5 text-slate-400 border-white/10'
              }`} title="Toggle Google Photorealistic 3D Tiles">
              {google3DActive ? '🌍 Photorealistic 3D ON' : '🌍 Photorealistic 3D OFF'}
            </button>
          )}

          <button type="button" onClick={handleToggleFantasyBuildings}
            className={`rounded-xl px-2.5 py-1.5 text-xs font-medium border transition ${
              fantasyBuildingsEnabled ? 'bg-teal-500/20 text-teal-200 border-teal-500/40' : 'bg-white/5 text-slate-400 border-white/10'
            }`} title="Toggle Auto-Generated 3D City Buildings">
            {fantasyBuildingsEnabled ? '🏢 3D Buildings ON' : '🏢 3D Buildings OFF'}
          </button>

          <button type="button" onClick={() => {
            const next = !trafficEnabled;
            setTrafficEnabled(next);
            const viewer = getViewer();
            if (viewer) syncEntitiesToCesium(viewer, world.entities, useWorldStore.getState().selectedId);
          }}
            className={`rounded-xl px-2.5 py-1.5 text-xs font-medium border transition ${
              trafficEnabled ? 'bg-teal-500/20 text-teal-200 border-teal-500/40' : 'bg-white/5 text-slate-400 border-white/10'
            }`} title="Toggle Moving Road Vehicles & Traffic">
            {trafficEnabled ? '🚗 Traffic ON' : '🚗 Traffic OFF'}
          </button>

          <button type="button" onClick={handleToggleLighting}
            className={`rounded-xl px-2.5 py-1.5 text-xs font-medium border transition ${
              lighting ? 'bg-amber-500/20 text-amber-200 border-amber-500/40' : 'bg-white/5 text-slate-400 border-white/10'
            }`} title="Toggle Dynamic Sun & Atmosphere Lighting">
            {lighting ? '☀️ Lighting ON' : '🌙 Lighting OFF'}
          </button>

          <button type="button" onClick={handleToggleGlobalFill}
            className={`rounded-xl px-2.5 py-1.5 text-xs font-medium border transition ${
              showFillOverlay ? 'bg-teal-500/20 text-teal-200 border-teal-500/40' : 'bg-white/5 text-slate-400 border-white/10'
            }`} title="Toggle Polygon Color & Texture Overlay">
            {showFillOverlay ? '🎨 Fill: ON' : '🎨 Fill: OFF'}
          </button>

          <label htmlFor="globe-imagery-select" className="sr-only">Select Imagery Style</label>
          <select id="globe-imagery-select" onChange={handleSelectImagery} value={imageryStyle}
            className="rounded-xl border border-white/15 bg-slate-900/90 px-2.5 py-1.5 text-xs font-medium text-slate-300 shadow-inner focus:border-teal-400 focus:outline-none transition cursor-pointer">
            {isFantasy ? (
              <>
                <option value="satellite">🛰️ Fantasy Orbital Satellite</option>
                <option value="stylized">📜 Antique Vintage Parchment</option>
              </>
            ) : (
              <>
                <option value="satellite">🛰️ Satellite (Esri)</option>
                <option value="osm">🌐 Map Tiles (OSM)</option>
                <option value="opentopo">🏔️ Topo Map (OpenTopo)</option>
                <option value="carto-light">🗺️ Carto Voyager</option>
                <option value="carto-dark">🌃 Carto Dark Matter</option>
                <option value="stylized">🎨 Vintage Parchment</option>
              </>
            )}
          </select>

          {isFantasy && (
            <select value={worldTheme} onChange={handleSelectTheme}
              className="rounded-xl border border-white/15 bg-slate-900/90 px-3 py-1.5 text-xs font-semibold text-teal-200 shadow-inner focus:border-teal-400 focus:outline-none transition cursor-pointer">
              <option value="medieval">🏰 Medieval Fantasy</option>
              <option value="modern">🏙️ Modern Sci-Fi</option>
            </select>
          )}

          <select id="world-preset-select" onChange={handleSelectSample}
            value={
              world.id === 'earth-preset' ? 'earth' :
              world.id === 'middle-earth-preset' || world.name.includes('Middle-earth') ? 'middle-earth' :
              world.id === 'demo-preset' || world.name.includes('Demo') ? 'demo' :
              world.id === 'template-preset' || world.name.includes('Template') ? 'template' :
              world.id === 'blank-preset' || world.name.includes('Blank') ? 'blank' : ''
            }
            className="rounded-xl border border-white/15 bg-slate-900/90 px-3 py-1.5 text-xs font-medium text-slate-200 shadow-inner focus:border-teal-400 focus:outline-none transition cursor-pointer">
            {!['earth-preset','middle-earth-preset','demo-preset','template-preset','blank-preset'].includes(world.id) && (
              <option value="" disabled hidden>🗺️ {world.name}</option>
            )}
            <option value="earth">🌍 Real Earth</option>
            <option value="middle-earth">🗡️ Middle-earth (Arda)</option>
            <option value="demo">✨ Demo Planet</option>
            <option value="template">🚀 Template Sci-Fi World</option>
            <option value="blank">➕ Blank Globe</option>
          </select>

          <button type="button" onClick={() => setTutorialOpen(true)}
            className="flex items-center gap-1.5 rounded-xl border border-teal-500/30 bg-teal-500/10 px-3 py-1.5 text-xs font-semibold text-teal-200 hover:bg-teal-500/20 transition">
            <span>❓</span>
            <span className="hidden sm:inline">Tutorial</span>
          </button>
        </div>
      </header>
    </>
  );
}

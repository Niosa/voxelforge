import { useState } from 'react';
import { Cartesian2, Cartographic, Math as CesiumMath } from 'cesium';
import { useUiStore, type SettlementDensity, type TerrainClimate, type TerrainTopography } from '@/state/uiStore';
import { useWorldStore } from '@/state/worldStore';
import { getViewer } from '@/globe/CesiumViewer';
import { syncEntitiesToCesium } from '@/globe/entitySync';
import { flyToEntity } from '@/globe/camera';
import { generateHierarchy, type GenerationRoot } from '@/geo/hierarchyGenerator';
import type { BiomeType } from '@/geo/biomeTexture';

const controlClass = 'w-full rounded-lg border border-white/15 bg-slate-900 px-3 py-2 text-xs text-slate-200 outline-none focus:border-teal-400';

function viewCenter(): [number, number] {
  const viewer = getViewer();
  if (!viewer) return [0, 0];
  const canvas = viewer.scene.canvas;
  const picked = viewer.camera.pickEllipsoid(new Cartesian2(canvas.clientWidth / 2, canvas.clientHeight / 2), viewer.scene.globe.ellipsoid);
  const position = picked ? Cartographic.fromCartesian(picked) : viewer.camera.positionCartographic;
  return [CesiumMath.toDegrees(position.longitude), CesiumMath.toDegrees(position.latitude)];
}

export function HierarchyGeneratorModal() {
  const open = useUiStore((state) => state.hierarchyGeneratorOpen);
  const close = () => useUiStore.getState().setHierarchyGeneratorOpen(false);
  const creation = useUiStore((state) => state.creationSettings);
  const [rootType, setRootType] = useState<GenerationRoot>('continent');
  const [name, setName] = useState('New Generated Realm');
  const [radiusKm, setRadiusKm] = useState(900);
  const [biome, setBiome] = useState<BiomeType>(creation.biome);
  const [climate, setClimate] = useState<TerrainClimate>(creation.climate);
  const [topography, setTopography] = useState<TerrainTopography>('mountains');
  const [density, setDensity] = useState<SettlementDensity>(creation.settlementDensity);
  const [includeDescendants, setIncludeDescendants] = useState(true);

  if (!open) return null;

  const changeRoot = (next: GenerationRoot) => {
    setRootType(next);
    setRadiusKm(next === 'continent' ? 900 : next === 'region' ? 220 : next === 'city' ? 0.7 : 0.3);
    setName(`New Generated ${next.charAt(0).toUpperCase()}${next.slice(1)}`);
  };

  const generate = () => {
    const [centerLon, centerLat] = viewCenter();
    const generated = generateHierarchy({ rootType, name, centerLon, centerLat, radiusKm, biome, climate, topography, density, includeDescendants });
    const root = generated[0];
    if (!root) return;
    const store = useWorldStore.getState();
    store.patchWorld(store.activeWorldId!, (world) => {
      for (const entity of generated) world.entities[entity.id] = entity;
    });
    useWorldStore.getState().select(root.id);
    const viewer = getViewer();
    if (viewer) {
      syncEntitiesToCesium(viewer, useWorldStore.getState().world.entities, root.id);
      flyToEntity(root);
    }
    close();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/65 p-2 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Generate world hierarchy">
      <div className="max-h-[calc(100dvh-1rem)] w-full max-w-xl overflow-y-auto rounded-2xl border border-teal-500/30 bg-slate-950 p-4 shadow-2xl sm:p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-teal-300">Generate an editable world hierarchy</h2>
            <p className="mt-1 text-xs text-slate-400">Choose the highest layer. Everything below it is generated as persistent, individually editable entities at the center of your current view.</p>
          </div>
          <button type="button" onClick={close} className="rounded-lg px-2 py-1 text-slate-400 hover:bg-white/10 hover:text-white">×</button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-[11px] font-semibold text-slate-400">Start at
            <select className={controlClass} value={rootType} onChange={(event) => changeRoot(event.target.value as GenerationRoot)}>
              <option value="continent">Continent → regions → settlements → landmarks</option>
              <option value="region">Region → cities and towns → landmarks</option>
              <option value="city">City → local landmarks</option>
              <option value="town">Town → local landmarks</option>
            </select>
          </label>
          <label className="text-[11px] font-semibold text-slate-400">Root name
            <input className={controlClass} value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label className="text-[11px] font-semibold text-slate-400">Radius ({Math.round(radiusKm)} km)
            <input type="range" min={rootType === 'continent' ? 200 : rootType === 'region' ? 30 : 0.1} max={rootType === 'continent' ? 2200 : rootType === 'region' ? 600 : rootType === 'city' ? 3 : 1} step={rootType === 'continent' ? 50 : rootType === 'region' ? 10 : 0.1} value={radiusKm} onChange={(event) => setRadiusKm(Number(event.target.value))} className="mt-3 w-full accent-teal-400" />
          </label>
          <label className="text-[11px] font-semibold text-slate-400">Development density
            <select className={controlClass} value={density} onChange={(event) => setDensity(event.target.value as SettlementDensity)}>
              <option value="rural">Rural</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="metropolitan">Metropolitan</option>
            </select>
          </label>
          {(rootType === 'continent' || rootType === 'region') && <>
            <label className="text-[11px] font-semibold text-slate-400">Biome
              <select className={controlClass} value={biome} onChange={(event) => setBiome(event.target.value as BiomeType)}>
                <option value="lush-grassland">Grassland</option><option value="forest-canopy">Forest</option><option value="desert-dunes">Desert</option><option value="snowy-tundra">Tundra</option><option value="mountain-slate">Alpine</option><option value="coastal-beach">Coastal</option>
              </select>
            </label>
            <label className="text-[11px] font-semibold text-slate-400">Climate
              <select className={controlClass} value={climate} onChange={(event) => setClimate(event.target.value as TerrainClimate)}>
                <option value="temperate">Temperate</option><option value="tropical">Tropical</option><option value="arid">Arid</option><option value="frigid">Polar</option><option value="swamp">Wetland</option>
              </select>
            </label>
            <label className="text-[11px] font-semibold text-slate-400">Topography
              <select className={controlClass} value={topography} onChange={(event) => setTopography(event.target.value as TerrainTopography)}>
                <option value="plains">Plains</option><option value="hills">Hills</option><option value="mountains">Mountains</option><option value="valleys">Valleys</option>
              </select>
            </label>
          </>}
          <label className="flex cursor-pointer items-center gap-2 self-end rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-300">
            <input type="checkbox" checked={includeDescendants} onChange={(event) => setIncludeDescendants(event.target.checked)} className="accent-teal-400" />
            Generate all layers below {rootType}
          </label>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={close} className="rounded-lg bg-white/5 px-4 py-2 text-xs text-slate-300 hover:bg-white/10">Cancel</button>
          <button type="button" onClick={generate} className="rounded-lg bg-teal-400 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-teal-300">Generate at view center</button>
        </div>
      </div>
    </div>
  );
}

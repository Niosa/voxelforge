import { useUiStore, type SettlementDensity, type SettlementZoning, type TerrainClimate, type TerrainTopography } from '@/state/uiStore';
import type { BiomeType } from '@/geo/biomeTexture';

const fieldClass = 'rounded-md border border-white/15 bg-slate-900 px-2 py-1 text-[11px] text-slate-200 outline-none focus:border-teal-400';

const reliefByTopography: Record<TerrainTopography, number> = {
  plains: 0,
  hills: 450,
  mountains: 2_400,
  valleys: 300,
};

export function CreationSettingsPanel() {
  const type = useUiStore((state) => state.creationEntityType);
  const settings = useUiStore((state) => state.creationSettings);
  const setSettings = useUiStore((state) => state.setCreationSettings);
  const isSettlement = type === 'city' || type === 'town';
  const isTerrain = type === 'continent' || type === 'region' || type === 'island';

  if (!isSettlement && !isTerrain) return null;

  return (
    <div className="flex flex-wrap items-center justify-center gap-2 border-t border-white/10 pt-2 basis-full">
      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
        {isSettlement ? 'Settlement settings' : 'Terrain settings'}
      </span>
      {isTerrain ? (
        <>
          <label className="flex items-center gap-1 text-[10px] text-slate-400">
            Biome
            <select className={fieldClass} value={settings.biome} onChange={(event) => setSettings({ biome: event.target.value as BiomeType })}>
              <option value="lush-grassland">Grassland</option>
              <option value="forest-canopy">Forest</option>
              <option value="desert-dunes">Desert</option>
              <option value="snowy-tundra">Tundra</option>
              <option value="mountain-slate">Rocky alpine</option>
              <option value="coastal-beach">Coastal</option>
              <option value="volcanic-ash">Volcanic</option>
              <option value="satellite-blend">Natural mix</option>
            </select>
          </label>
          <label className="flex items-center gap-1 text-[10px] text-slate-400">
            Landform
            <select className={fieldClass} value={settings.topography} onChange={(event) => {
              const topography = event.target.value as TerrainTopography;
              setSettings({ topography, reliefHeight: reliefByTopography[topography] });
            }}>
              <option value="plains">Plains</option>
              <option value="hills">Rolling hills</option>
              <option value="mountains">Mountains</option>
              <option value="valleys">Valleys</option>
            </select>
          </label>
          <label className="flex items-center gap-1 text-[10px] text-slate-400">
            Climate
            <select className={fieldClass} value={settings.climate} onChange={(event) => setSettings({ climate: event.target.value as TerrainClimate })}>
              <option value="temperate">Temperate</option>
              <option value="tropical">Tropical</option>
              <option value="arid">Arid</option>
              <option value="frigid">Polar</option>
              <option value="swamp">Wetland</option>
            </select>
          </label>
          <label className="flex items-center gap-1 text-[10px] text-slate-400" title="Maximum visual elevation in globe mode">
            Relief
            <input className="w-20 rounded-md border border-white/15 bg-slate-900 px-2 py-1 text-[11px] text-slate-200 outline-none focus:border-teal-400" type="number" min="0" max="6000" step="100" value={settings.reliefHeight} onChange={(event) => setSettings({ reliefHeight: Math.max(0, Math.min(6000, Number(event.target.value) || 0)) })} />
            m
          </label>
        </>
      ) : (
        <>
          <label className="flex items-center gap-1 text-[10px] text-slate-400">
            Density
            <select className={fieldClass} value={settings.settlementDensity} onChange={(event) => setSettings({ settlementDensity: event.target.value as SettlementDensity })}>
              <option value="rural">Rural</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="metropolitan">Metropolitan</option>
            </select>
          </label>
          <label className="flex items-center gap-1 text-[10px] text-slate-400">
            Zoning
            <select className={fieldClass} value={settings.settlementZoning} onChange={(event) => setSettings({ settlementZoning: event.target.value as SettlementZoning })}>
              <option value="mixed">Mixed use</option>
              <option value="residential">Residential</option>
              <option value="commercial">Commercial</option>
              <option value="industrial">Industrial</option>
              <option value="downtown">Downtown core</option>
            </select>
          </label>
          <label className="flex cursor-pointer items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-slate-300">
            <input type="checkbox" checked={settings.generate3DBuildings} onChange={(event) => setSettings({ generate3DBuildings: event.target.checked })} className="accent-teal-400" />
            3D buildings
          </label>
          <span className="text-[10px] font-normal text-slate-500">Population scales with footprint and density.</span>
        </>
      )}
    </div>
  );
}

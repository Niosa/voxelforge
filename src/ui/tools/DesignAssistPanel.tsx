import { useState } from 'react';
import { useUiStore } from '@/state/uiStore';
import type { EntityType } from '@/entities/types';
import type { BiomeType } from '@/geo/biomeTexture';

export type DesignArchetype =
  | 'continent'
  | 'archipelago'
  | 'kingdom'
  | 'mountain-chain'
  | 'forest-region';

export interface DesignAssistConfig {
  name: string;
  archetype: DesignArchetype;
  type: EntityType;
  radiusKm: number;
  roughness: number;
  color: string;
  biome: BiomeType;
}

let activeDesignConfig: DesignAssistConfig = {
  name: 'New Continent',
  archetype: 'continent',
  type: 'continent',
  radiusKm: 1200,
  roughness: 0.5,
  color: '#22c55e',
  biome: 'lush-grassland',
};

export function getActiveDesignConfig(): DesignAssistConfig {
  return activeDesignConfig;
}

export function DesignAssistPanel() {
  const tool = useUiStore((s) => s.tool);
  const setTool = useUiStore((s) => s.setTool);

  const [config, setConfig] = useState<DesignAssistConfig>(activeDesignConfig);

  if (tool !== 'designAssist') return null;

  const updateConfig = (patch: Partial<DesignAssistConfig>) => {
    const updated = { ...config, ...patch };
    setConfig(updated);
    activeDesignConfig = updated;
  };

  const handleSelectArchetype = (arch: DesignArchetype) => {
    if (arch === 'continent') {
      updateConfig({
        archetype: 'continent',
        name: 'Grand Continent',
        type: 'continent',
        radiusKm: 1200,
        color: '#22c55e',
        biome: 'lush-grassland',
      });
    } else if (arch === 'archipelago') {
      updateConfig({
        archetype: 'archipelago',
        name: 'Island Chain',
        type: 'island',
        radiusKm: 450,
        color: '#38bdf8',
        biome: 'satellite-blend',
      });
    } else if (arch === 'kingdom') {
      updateConfig({
        archetype: 'kingdom',
        name: 'Walled Citadel',
        type: 'city',
        radiusKm: 80,
        color: '#0284c7',
        biome: 'city-urban',
      });
    } else if (arch === 'mountain-chain') {
      updateConfig({
        archetype: 'mountain-chain',
        name: 'Highland Ridge',
        type: 'region',
        radiusKm: 600,
        color: '#64748b',
        biome: 'mountain-slate',
      });
    } else if (arch === 'forest-region') {
      updateConfig({
        archetype: 'forest-region',
        name: 'Sylvan Woodland',
        type: 'region',
        radiusKm: 350,
        color: '#15803d',
        biome: 'forest-canopy',
      });
    }
  };

  return (
    <div className="fixed bottom-6 left-6 z-40 w-96 max-w-[90vw] rounded-2xl border border-teal-500/30 bg-slate-950/90 p-4 text-slate-100 shadow-2xl backdrop-blur-md animate-fade-in space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 pb-3">
        <div className="flex items-center space-x-2">
          <span className="text-xl">✨</span>
          <div>
            <h3 className="font-bold text-sm text-teal-300">Design Assist Generator</h3>
            <p className="text-[10px] text-slate-400">Click anywhere on the globe to stamp shape</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setTool('select')}
          className="rounded-lg p-1 text-slate-400 hover:text-white hover:bg-white/10 transition"
        >
          ✕
        </button>
      </div>

      {/* Archetype Cards */}
      <div className="grid grid-cols-3 gap-2">
        <button
          type="button"
          onClick={() => handleSelectArchetype('continent')}
          className={`flex flex-col items-center justify-center rounded-xl border p-2 text-center transition cursor-pointer ${
            config.archetype === 'continent'
              ? 'border-teal-400 bg-teal-500/20 text-white'
              : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
          }`}
        >
          <span className="text-lg">🏝️</span>
          <span className="text-[11px] font-semibold mt-1">Continent</span>
        </button>

        <button
          type="button"
          onClick={() => handleSelectArchetype('archipelago')}
          className={`flex flex-col items-center justify-center rounded-xl border p-2 text-center transition cursor-pointer ${
            config.archetype === 'archipelago'
              ? 'border-teal-400 bg-teal-500/20 text-white'
              : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
          }`}
        >
          <span className="text-lg">🌋</span>
          <span className="text-[11px] font-semibold mt-1">Islands</span>
        </button>

        <button
          type="button"
          onClick={() => handleSelectArchetype('kingdom')}
          className={`flex flex-col items-center justify-center rounded-xl border p-2 text-center transition cursor-pointer ${
            config.archetype === 'kingdom'
              ? 'border-teal-400 bg-teal-500/20 text-white'
              : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
          }`}
        >
          <span className="text-lg">🏰</span>
          <span className="text-[11px] font-semibold mt-1">Kingdom</span>
        </button>

        <button
          type="button"
          onClick={() => handleSelectArchetype('mountain-chain')}
          className={`flex flex-col items-center justify-center rounded-xl border p-2 text-center transition cursor-pointer ${
            config.archetype === 'mountain-chain'
              ? 'border-teal-400 bg-teal-500/20 text-white'
              : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
          }`}
        >
          <span className="text-lg">🏔️</span>
          <span className="text-[11px] font-semibold mt-1">Mountains</span>
        </button>

        <button
          type="button"
          onClick={() => handleSelectArchetype('forest-region')}
          className={`flex flex-col items-center justify-center rounded-xl border p-2 text-center transition cursor-pointer ${
            config.archetype === 'forest-region'
              ? 'border-teal-400 bg-teal-500/20 text-white'
              : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
          }`}
        >
          <span className="text-lg">🌲</span>
          <span className="text-[11px] font-semibold mt-1">Forest</span>
        </button>
      </div>

      {/* Configuration Controls */}
      <div className="space-y-3 text-xs">
        <div>
          <label htmlFor="design-name-input" className="block text-slate-400 mb-1 font-medium">
            Entity Name
          </label>
          <input
            id="design-name-input"
            type="text"
            value={config.name}
            onChange={(e) => updateConfig({ name: e.target.value })}
            className="w-full rounded-xl border border-white/15 bg-slate-900 px-3 py-1.5 text-xs text-white focus:border-teal-400 focus:outline-none"
          />
        </div>

        <div>
          <div className="flex justify-between text-slate-400 mb-1 font-medium">
            <span>Radius / Scale</span>
            <span className="text-teal-300 font-bold">{config.radiusKm} km</span>
          </div>
          <input
            type="range"
            min="20"
            max="2500"
            step="20"
            value={config.radiusKm}
            onChange={(e) => updateConfig({ radiusKm: Number(e.target.value) })}
            className="w-full accent-teal-400 cursor-pointer"
          />
        </div>

        <div>
          <div className="flex justify-between text-slate-400 mb-1 font-medium">
            <span>Coastline Roughness</span>
            <span className="text-teal-300 font-bold">{Math.round(config.roughness * 100)}%</span>
          </div>
          <input
            type="range"
            min="0.1"
            max="0.9"
            step="0.05"
            value={config.roughness}
            onChange={(e) => updateConfig({ roughness: Number(e.target.value) })}
            className="w-full accent-teal-400 cursor-pointer"
          />
        </div>

        <div className="flex items-center justify-between pt-1">
          <span className="text-slate-400 font-medium">Color Palette</span>
          <div className="flex items-center space-x-2">
            <input
              type="color"
              value={config.color}
              onChange={(e) => updateConfig({ color: e.target.value })}
              className="h-6 w-8 rounded border-none bg-transparent cursor-pointer"
            />
            <span className="font-mono text-[10px] text-slate-300">{config.color}</span>
          </div>
        </div>
      </div>

      {/* Instruction Banner */}
      <div className="rounded-xl bg-teal-500/10 border border-teal-500/20 p-2.5 text-center text-[11px] text-teal-200">
        📍 <strong>Ready to Stamp:</strong> Left-click any point on the 3D globe to place your {config.name}!
      </div>
    </div>
  );
}

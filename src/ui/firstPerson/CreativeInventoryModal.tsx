import { useState } from 'react';
import { useUiStore, type FirstPersonBuildingType } from '@/state/uiStore';
import { soundEngine } from '@/audio/soundEngine';

interface InventoryItem {
  id: FirstPersonBuildingType;
  label: string;
  category: 'blocks' | 'blueprints' | 'decorations';
  icon: string;
  color: string;
  description: string;
}

const INVENTORY_ITEMS: InventoryItem[] = [
  // Basic Blocks
  { id: 'house', label: 'Oak Wood', category: 'blocks', icon: '🪵', color: '#0d9488', description: 'Sturdy wooden plank block' },
  { id: 'castle', label: 'Stone Brick', category: 'blocks', icon: '🧱', color: '#f59e0b', description: 'Chiseled stone fortress block' },
  { id: 'watchtower', label: 'Cobblestone', category: 'blocks', icon: '🪨', color: '#ea580c', description: 'Rough quarried cobble' },
  { id: 'wall', label: 'Dark Slate', category: 'blocks', icon: '🏰', color: '#475569', description: 'Deep mountain slate stone' },
  { id: 'road', label: 'Cobble Slab', category: 'blocks', icon: '🛣️', color: '#94a3b8', description: 'Smooth road paving stone' },
  { id: 'marble', label: 'White Marble', category: 'blocks', icon: '🏛️', color: '#e2e8f0', description: 'Polished white imperial marble' },
  { id: 'obsidian', label: 'Obsidian', category: 'blocks', icon: '🔮', color: '#1e1b4b', description: 'Blast-proof dark volcanic crystal' },
  { id: 'glass', label: 'Sky Glass', category: 'blocks', icon: '🪟', color: '#bae6fd', description: 'Translucent crystal window pane' },
  
  // Rare & Cyber Blocks
  { id: 'gold_block', label: 'Gold Arch', category: 'decorations', icon: '🟡', color: '#ca8a04', description: 'Pure gold block' },
  { id: 'emerald', label: 'Emerald', category: 'decorations', icon: '💎', color: '#10b981', description: 'Radiant green emerald gemstone' },
  { id: 'diamond', label: 'Diamond', category: 'decorations', icon: '💠', color: '#38bdf8', description: 'Luminous cyan diamond block' },
  { id: 'cyber_cyan', label: 'Neon Cyan', category: 'decorations', icon: '⚡', color: '#06b6d4', description: 'High-tech glowing cyan voxel' },
  { id: 'cyber_pink', label: 'Neon Pink', category: 'decorations', icon: '✨', color: '#ec4899', description: 'Vibrant glowing magenta voxel' },
  { id: 'torch', label: 'Torch Light', category: 'decorations', icon: '🕯️', color: '#f59e0b', description: 'Warm ambient light source' },
  { id: 'tree', label: 'Leaves', category: 'decorations', icon: '🌿', color: '#16a34a', description: 'Lush green foliage leaves' },
  { id: 'flagpole', label: 'Banner Post', category: 'decorations', icon: '🚩', color: '#ef4444', description: 'Heraldic kingdom banner pole' },

  // Instant Blueprint Structures
  { id: 'blueprint_tower', label: 'Castle Tower Blueprint', category: 'blueprints', icon: '🏯', color: '#64748b', description: 'Instantly spawns a 5x5 Stone Castle Watchtower' },
  { id: 'blueprint_cottage', label: 'Cottage Blueprint', category: 'blueprints', icon: '🏡', color: '#b45309', description: 'Instantly constructs a cozy 4x4 Medieval Timber Cottage' },
  { id: 'blueprint_windmill', label: 'Windmill Blueprint', category: 'blueprints', icon: '⚙️', color: '#d97706', description: 'Instantly constructs a tall Windmill structure' },
  { id: 'blueprint_fountain', label: 'Fountain Blueprint', category: 'blueprints', icon: '⛲', color: '#0284c7', description: 'Spawns a Marble Plaza Fountain' },
];

export function CreativeInventoryModal() {
  const isOpen = useUiStore((s) => s.creativeInventoryOpen);
  const setOpen = useUiStore((s) => s.setCreativeInventoryOpen);
  const selectedType = useUiStore((s) => s.firstPersonBuildingType);
  const setSelectedType = useUiStore((s) => s.setFirstPersonBuildingType);

  const [activeTab, setActiveTab] = useState<'all' | 'blocks' | 'decorations' | 'blueprints'>('all');
  const [search, setSearch] = useState('');

  if (!isOpen) return null;

  const filtered = INVENTORY_ITEMS.filter((item) => {
    const matchesTab = activeTab === 'all' || item.category === activeTab;
    const matchesSearch = item.label.toLowerCase().includes(search.toLowerCase()) || item.description.toLowerCase().includes(search.toLowerCase());
    return matchesTab && matchesSearch;
  });

  const handleSelect = (id: FirstPersonBuildingType) => {
    soundEngine.playClick();
    setSelectedType(id);
    setOpen(false);
  };

  return (
    <div className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md animate-fadeIn">
      <div className="relative flex h-[85vh] w-full max-w-3xl flex-col rounded-3xl border border-white/20 bg-slate-950/95 p-6 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <span className="text-3xl">🧰</span>
            <div>
              <h2 className="text-lg font-bold text-white tracking-wide">Creative Voxel Palette & Blueprints</h2>
              <p className="text-xs text-slate-400">Select any block or instant 3D blueprint prefab to place in 1st-person mode</p>
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

        {/* Filters & Search */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-slate-900/90 p-1">
            {[
              { id: 'all', label: 'All Items' },
              { id: 'blocks', label: '🧱 Blocks' },
              { id: 'decorations', label: '✨ Deco & Rare' },
              { id: 'blueprints', label: '🏛️ Prefabs' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as any)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  activeTab === tab.id
                    ? 'bg-amber-500 text-slate-950 shadow-md font-bold'
                    : 'text-slate-400 hover:bg-white/10 hover:text-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="relative flex-1 max-w-xs">
            <span className="absolute left-3 top-2.5 text-xs text-slate-400">🔍</span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search palette..."
              className="w-full rounded-xl border border-white/15 bg-slate-900 pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:border-amber-400 focus:outline-none transition"
            />
          </div>
        </div>

        {/* Item Grid */}
        <div className="mt-4 grid flex-1 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 overflow-y-auto pr-1 scrollbar-thin">
          {filtered.map((item) => {
            const isSelected = selectedType === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelect(item.id)}
                className={`group relative flex flex-col items-center justify-between rounded-2xl border p-3 text-left transition-all duration-150 cursor-pointer ${
                  isSelected
                    ? 'border-amber-400 bg-amber-500/20 shadow-lg shadow-amber-500/20 scale-102'
                    : 'border-white/10 bg-slate-900/80 hover:border-white/30 hover:bg-slate-800'
                }`}
              >
                <div className="flex w-full items-center justify-between">
                  <span className="text-3xl transition-transform group-hover:scale-110">{item.icon}</span>
                  {item.category === 'blueprints' && (
                    <span className="rounded-md bg-amber-500/30 px-1.5 py-0.5 text-[9px] font-bold text-amber-300 border border-amber-500/40">
                      PREFAB
                    </span>
                  )}
                </div>

                <div className="mt-3 w-full">
                  <div className="text-xs font-bold text-slate-100 group-hover:text-amber-300">{item.label}</div>
                  <div className="mt-0.5 text-[10px] text-slate-400 line-clamp-2">{item.description}</div>
                </div>

                {isSelected && (
                  <span className="mt-2 text-[10px] font-bold font-mono text-amber-300">✓ Active Selected</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-3 text-xs text-slate-400">
          <span>Tip: You can also use number keys [1-8] or Scroll Wheel to swap hotbar items in walk mode.</span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-xl bg-amber-500 px-5 py-2 text-xs font-bold text-slate-950 hover:bg-amber-400 transition"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

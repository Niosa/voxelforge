import { useState, useEffect, useMemo } from 'react';
import { useUiStore } from '@/state/uiStore';
import { useWalkStore } from '@/state/walkStore';
import { BLOCKS, BLOCK_BY_ID, type BlockDef } from '@/walk/blockRegistry';
import { soundEngine } from '@/audio/soundEngine';

export type InventoryCategory = 'all' | 'blocks' | 'natural' | 'decorations' | 'ores' | 'blueprints';

export interface VoxelInventoryItem {
  id: number | string;
  blockId?: number;
  name: string;
  category: 'blocks' | 'natural' | 'decorations' | 'ores' | 'blueprints';
  icon: string;
  color: string;
  description: string;
  isPrefab?: boolean;
}

// Prefab Blueprints
const PREFAB_ITEMS: VoxelInventoryItem[] = [
  {
    id: 'blueprint_tower',
    name: 'Castle Watchtower',
    category: 'blueprints',
    icon: '🏯',
    color: '#64748b',
    description: 'Instantly constructs a 5x5 Stone Watchtower with crenellations',
    isPrefab: true,
  },
  {
    id: 'blueprint_cottage',
    name: 'Timber Cottage',
    category: 'blueprints',
    icon: '🏡',
    color: '#b45309',
    description: 'Instantly constructs a cozy 4x4 Medieval Timber Cottage with roof',
    isPrefab: true,
  },
  {
    id: 'blueprint_windmill',
    name: 'Tall Windmill',
    category: 'blueprints',
    icon: '⚙️',
    color: '#d97706',
    description: 'Instantly constructs a tall Windmill structure',
    isPrefab: true,
  },
  {
    id: 'blueprint_fountain',
    name: 'Plaza Fountain',
    category: 'blueprints',
    icon: '⛲',
    color: '#0284c7',
    description: 'Constructs a Marble Plaza Fountain with flowing liquid',
    isPrefab: true,
  },
];

// Helper to determine category for standard block definitions
function determineBlockCategory(block: BlockDef): 'blocks' | 'natural' | 'decorations' | 'ores' {
  if ([14, 17, 18, 34, 35, 33, 9].includes(block.id)) return 'ores';
  if ([21, 23, 25, 26, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 19, 20, 10].includes(block.id)) return 'decorations';
  if ([2, 3, 4, 6, 8, 22, 27, 28, 29, 30, 31, 32, 36, 43, 44, 74, 75, 76, 77, 78, 79, 80, 81].includes(block.id)) return 'natural';
  return 'blocks';
}

function buildInventoryList(): VoxelInventoryItem[] {
  const blockItems: VoxelInventoryItem[] = BLOCKS
    .filter((b) => b.id !== 0 && b.placeable !== false && !b.name.includes('_flowing_'))
    .map((b) => ({
      id: b.id,
      blockId: b.id,
      name: b.name.replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      category: determineBlockCategory(b),
      icon: b.icon ?? '🧊',
      color: b.color || '#38bdf8',
      description: `Voxel Block [ID ${b.id}] · ${b.solid ? 'Solid collision' : 'Non-solid pass-through'}`,
      isPrefab: false,
    }));

  return [...blockItems, ...PREFAB_ITEMS];
}

export function CreativeInventoryModal() {
  const isOpen = useUiStore((s) => s.creativeInventoryOpen);
  const setOpen = useUiStore((s) => s.setCreativeInventoryOpen);
  const setSelectedBuildingType = useUiStore((s) => s.setFirstPersonBuildingType);

  const {
    hotbarIds,
    activeHotbarIndex,
    selectedBlockId,
    selectHotbarSlot,
    assignHotbarSlot,
    resetHotbarToDefault,
  } = useWalkStore();

  const [activeTab, setActiveTab] = useState<InventoryCategory>('all');
  const [search, setSearch] = useState('');
  const [focusedIndex, setFocusedIndex] = useState(0);

  const inventoryItems = useMemo(() => buildInventoryList(), []);

  const filteredItems = useMemo(() => {
    return inventoryItems.filter((item) => {
      const matchesTab = activeTab === 'all' || item.category === activeTab;
      const query = search.trim().toLowerCase();
      const matchesSearch =
        !query ||
        item.name.toLowerCase().includes(query) ||
        item.description.toLowerCase().includes(query) ||
        String(item.id).includes(query);
      return matchesTab && matchesSearch;
    });
  }, [inventoryItems, activeTab, search]);

  const targetSlotIndex = activeHotbarIndex >= 0 && activeHotbarIndex < 9 ? activeHotbarIndex : 0;

  // Handle equipping an item to the designated hotbar slot
  const handleEquipItem = (item: VoxelInventoryItem, slotIndex?: number) => {
    const targetSlot = slotIndex ?? targetSlotIndex;
    soundEngine.playClick();

    if (item.blockId !== undefined) {
      assignHotbarSlot(targetSlot, item.blockId);
    }
    if (typeof item.id === 'string') {
      setSelectedBuildingType(item.id as any);
    }
  };

  // Keyboard navigation & digit quick-assign [1-9]
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        return;
      }

      // Digit keys 1-9 for quick slot assignment
      if (/^[1-9]$/.test(e.key)) {
        const slot = Number.parseInt(e.key, 10) - 1;
        const currentItem = filteredItems[focusedIndex];
        if (currentItem) {
          handleEquipItem(currentItem, slot);
          selectHotbarSlot(slot);
        }
        return;
      }

      // Arrow navigation inside items grid
      const cols = window.innerWidth >= 768 ? 6 : window.innerWidth >= 640 ? 4 : 3;
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        setFocusedIndex((prev) => Math.min(filteredItems.length - 1, prev + 1));
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setFocusedIndex((prev) => Math.max(0, prev - 1));
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusedIndex((prev) => Math.min(filteredItems.length - 1, prev + cols));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusedIndex((prev) => Math.max(0, prev - cols));
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const currentItem = filteredItems[focusedIndex];
        if (currentItem) {
          handleEquipItem(currentItem);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, filteredItems, focusedIndex, targetSlotIndex, setOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="pointer-events-auto fixed inset-0 z-[80] flex items-center justify-center bg-black/80 backdrop-blur-md animate-fadeIn p-3"
      onClick={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <div className="relative flex h-[90vh] w-full max-w-4xl flex-col rounded-3xl border border-sky-400/25 bg-slate-950/95 p-5 shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-amber-400/30 bg-amber-500/10 text-2xl shadow-inner">
              🧰
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-wide">
                Creative Voxel Palette & Hotbar Manager
              </h2>
              <p className="text-xs text-slate-400">
                Select blocks or blueprints to assign directly into your 9 hotbar slots
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-300 hover:bg-white/20 hover:text-white transition cursor-pointer"
            aria-label="Close creative inventory"
          >
            ✕
          </button>
        </div>

        {/* 🟩 Interactive 9-Slot Hotbar Manager Bar */}
        <div className="mt-3 rounded-2xl border border-white/15 bg-slate-900/90 p-2.5 shadow-lg">
          <div className="flex items-center justify-between px-1 mb-1.5">
            <span className="text-[11px] font-bold font-mono text-amber-300 uppercase tracking-wider flex items-center gap-1">
              <span>🎯 Hotbar Slots (Slot [{targetSlotIndex + 1}] Active Target)</span>
            </span>
            <button
              type="button"
              onClick={() => {
                soundEngine.playClick();
                resetHotbarToDefault();
              }}
              className="text-[10px] font-mono text-slate-400 hover:text-amber-300 underline transition cursor-pointer"
            >
              Reset Hotbar
            </button>
          </div>

          <div className="grid grid-cols-9 gap-1.5">
            {hotbarIds.map((blockId, index) => {
              const block = BLOCK_BY_ID.get(blockId);
              const isTargetSlot = targetSlotIndex === index;

              return (
                <button
                  key={`hotbar-slot-${index}`}
                  type="button"
                  onClick={() => {
                    soundEngine.playClick();
                    selectHotbarSlot(index);
                  }}
                  className={`group relative flex h-14 flex-col items-center justify-center rounded-xl border-2 transition-all duration-150 cursor-pointer ${
                    isTargetSlot
                      ? 'border-amber-400 bg-amber-500/25 scale-105 shadow-md shadow-amber-500/30'
                      : 'border-slate-800 bg-slate-950/80 hover:border-slate-600 hover:bg-slate-900'
                  }`}
                  title={`Slot ${index + 1}: ${block?.name ?? 'Empty'} — Click to make target slot`}
                >
                  <span
                    className={`absolute top-0.5 left-1 text-[9px] font-mono font-extrabold ${
                      isTargetSlot ? 'text-amber-300' : 'text-slate-500'
                    }`}
                  >
                    {index + 1}
                  </span>

                  <span className="text-xl leading-none">{block?.icon ?? '📦'}</span>

                  <span className="mt-0.5 truncate max-w-[48px] text-[8px] font-bold capitalize text-slate-300">
                    {block?.name.replaceAll('_', ' ') ?? 'None'}
                  </span>

                  {isTargetSlot && (
                    <div className="absolute inset-0 rounded-xl border border-amber-300 pointer-events-none animate-pulse" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Filters & Search */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <div className="no-scrollbar flex items-center gap-1 overflow-x-auto rounded-xl border border-white/10 bg-slate-900/90 p-1">
            {[
              { id: 'all', label: 'All Items' },
              { id: 'blocks', label: '🧱 Building' },
              { id: 'natural', label: '🌿 Biomes' },
              { id: 'decorations', label: '✨ Deco & Light' },
              { id: 'ores', label: '⛏️ Ores & Rare' },
              { id: 'blueprints', label: '🏛️ Prefabs' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  soundEngine.playClick();
                  setActiveTab(tab.id as InventoryCategory);
                  setFocusedIndex(0);
                }}
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition cursor-pointer ${
                  activeTab === tab.id
                    ? 'bg-sky-500 text-slate-950 font-bold shadow'
                    : 'text-slate-400 hover:bg-white/10 hover:text-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="relative flex-1 max-w-xs min-w-[160px]">
            <span className="absolute left-3 top-2 text-xs text-slate-400">🔍</span>
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setFocusedIndex(0);
              }}
              placeholder="Search blocks [Name/ID]..."
              className="w-full rounded-xl border border-white/15 bg-slate-900 pl-8 pr-7 py-1 text-xs text-white placeholder-slate-500 focus:border-sky-400 focus:outline-none transition"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1.5 text-xs text-slate-400 hover:text-white"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Item Grid */}
        <div className="mt-3 grid flex-1 grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2.5 overflow-y-auto pr-1 scrollbar-thin">
          {filteredItems.map((item, index) => {
            const isFocused = focusedIndex === index;
            const isSelectedBlock = item.blockId !== undefined && item.blockId === selectedBlockId;
            const isAssignedInHotbar = item.blockId !== undefined && hotbarIds.includes(item.blockId);
            const hotbarSlotIndex = item.blockId !== undefined ? hotbarIds.indexOf(item.blockId) : -1;

            return (
              <button
                key={`${item.id}-${index}`}
                type="button"
                onClick={() => {
                  setFocusedIndex(index);
                  handleEquipItem(item);
                }}
                className={`group relative flex flex-col items-center justify-between rounded-2xl border p-2.5 text-center transition-all duration-150 cursor-pointer ${
                  isFocused || isSelectedBlock
                    ? 'border-sky-400 bg-sky-500/25 shadow-lg shadow-sky-500/20 scale-102 ring-2 ring-sky-400/50'
                    : isAssignedInHotbar
                    ? 'border-amber-500/40 bg-amber-500/10 hover:bg-slate-800'
                    : 'border-white/10 bg-slate-900/80 hover:border-white/30 hover:bg-slate-800'
                }`}
                title={item.description}
              >
                <div className="flex w-full items-center justify-between">
                  <span className="text-2xl transition-transform group-hover:scale-110">{item.icon}</span>
                  {hotbarSlotIndex >= 0 ? (
                    <span className="rounded-md bg-amber-500/30 px-1.5 py-0.5 text-[9px] font-bold font-mono text-amber-300 border border-amber-500/40">
                      Slot {hotbarSlotIndex + 1}
                    </span>
                  ) : item.isPrefab ? (
                    <span className="rounded-md bg-purple-500/30 px-1.5 py-0.5 text-[8px] font-bold text-purple-300 border border-purple-500/40">
                      PREFAB
                    </span>
                  ) : (
                    <span className="text-[9px] font-mono text-slate-500">ID {item.blockId}</span>
                  )}
                </div>

                <div className="mt-2 w-full">
                  <div className="text-xs font-bold text-slate-100 group-hover:text-sky-300 truncate">
                    {item.name}
                  </div>
                  <div className="mt-0.5 text-[9px] text-slate-400 line-clamp-1">{item.description}</div>
                </div>

                <div className="mt-2 w-full flex items-center justify-center gap-1 opacity-80 group-hover:opacity-100">
                  <span className="rounded-md bg-sky-500/20 px-2 py-0.5 text-[9px] font-mono font-bold text-sky-200 border border-sky-400/30 hover:bg-sky-500 hover:text-slate-950 transition">
                    Equip [Slot {targetSlotIndex + 1}]
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-2.5 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <span>💡 Quick Keys: Hover block & press <kbd className="px-1.5 py-0.5 bg-slate-800 border border-white/20 rounded font-mono text-amber-300">1-9</kbd> to assign slot</span>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-xl bg-sky-500 px-5 py-1.5 text-xs font-bold text-slate-950 hover:bg-sky-400 transition shadow cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

import { useUiStore, type FirstPersonBuildingType } from '@/state/uiStore';
import { firstPersonController } from '@/globe/FirstPersonController';
import { firstPersonBuilder } from '@/drawing/FirstPersonBuilder';

interface HotbarItem {
  id: FirstPersonBuildingType;
  slot: number;
  label: string;
  icon: string;
  color: string;
}

const HOTBAR_ITEMS: HotbarItem[] = [
  { id: 'house', slot: 1, label: 'Oak Wood', icon: '🪵', color: '#0d9488' },
  { id: 'castle', slot: 2, label: 'Stone Brick', icon: '🧱', color: '#f59e0b' },
  { id: 'watchtower', slot: 3, label: 'Cobblestone', icon: '🪨', color: '#ea580c' },
  { id: 'gate', slot: 4, label: 'Gold Arch', icon: '🚪', color: '#eab308' },
  { id: 'wall', slot: 5, label: 'Chiseled Stone', icon: '🏰', color: '#475569' },
  { id: 'road', slot: 6, label: 'Cobble Slab', icon: '🛣️', color: '#94a3b8' },
  { id: 'flagpole', slot: 7, label: 'Banner Post', icon: '🚩', color: '#ef4444' },
  { id: 'tree', slot: 8, label: 'Oak Leaves', icon: '🌿', color: '#16a34a' },
];

export function MinecraftHotbar() {
  const firstPersonActive = useUiStore((s) => s.firstPersonActive);
  const selectedType = useUiStore((s) => s.firstPersonBuildingType);
  const setSelectedType = useUiStore((s) => s.setFirstPersonBuildingType);

  if (!firstPersonActive) return null;

  const activeItem = HOTBAR_ITEMS.find((i) => i.id === selectedType) || HOTBAR_ITEMS[0]!;
  const pos = firstPersonController.getCurrentPosition();

  // Get cardinal direction facing
  const degrees = ((pos.heading * 180) / Math.PI + 360) % 360;
  let facing = 'North (Towards -Z)';
  if (degrees >= 45 && degrees < 135) facing = 'East (Towards +X)';
  else if (degrees >= 135 && degrees < 225) facing = 'South (Towards +Z)';
  else if (degrees >= 225 && degrees < 315) facing = 'West (Towards -X)';

  return (
    <>
      {/* 🎯 Retro Minecraft Pixelated Center Crosshair */}
      <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center">
        <div className="relative flex items-center justify-center">
          {/* Outer dark shadow crosshair */}
          <span className="absolute text-2xl font-mono text-black font-extrabold select-none opacity-90 scale-125">
            +
          </span>
          {/* Inner crisp white/teal crosshair */}
          <span className="relative text-2xl font-mono text-white font-extrabold select-none drop-shadow">
            +
          </span>
        </div>
      </div>

      {/* 💻 Minecraft F3 Debug Info Screen (Top Left) */}
      <div className="pointer-events-none fixed top-4 left-4 z-50 flex flex-col font-mono text-[11px] leading-tight text-white drop-shadow-[0_2px_2px_rgba(0,0,0,0.9)] bg-black/40 p-2.5 rounded-lg border border-white/10 backdrop-blur-xs select-none">
        <div className="font-bold text-amber-300">Terraforge Voxel Engine 1.20 (Minecraft FPS Mode)</div>
        <div className="text-slate-200">
          XYZ: {pos.lon.toFixed(4)} / {pos.lat.toFixed(4)} / {pos.height.toFixed(1)}m
        </div>
        <div className="text-slate-300">Facing: {facing}</div>
        <div className="text-emerald-300 font-semibold mt-0.5">
          Selected Block: [{activeItem.slot}] {activeItem.label}
        </div>
        <div className="text-slate-400 text-[10px] mt-1">
          Controls: [WASD] Move · [Mouse] 360° Look · [R-Click / E] Place · [Scroll / 1-8] Select Slot · [ESC] Orbit
        </div>
      </div>

      {/* 🪟 Minecraft Top Action Bar (Right side top controls) */}
      <div className="pointer-events-auto fixed top-4 right-4 z-50 flex items-center gap-2">
        <button
          type="button"
          onClick={() => firstPersonController.requestPointerLock()}
          className="rounded-lg border border-teal-500/40 bg-slate-950/80 px-3 py-1.5 text-xs font-mono font-bold text-teal-300 hover:bg-teal-500/30 transition shadow-lg cursor-pointer"
        >
          🎯 Lock Mouse Look
        </button>
        <button
          type="button"
          onClick={() => firstPersonController.exit()}
          className="rounded-lg border border-rose-500/40 bg-rose-950/80 px-3 py-1.5 text-xs font-mono font-bold text-rose-300 hover:bg-rose-500/30 transition shadow-lg cursor-pointer"
        >
          🚀 Exit to Orbit
        </button>
      </div>

      {/* 🟩 Minecraft Pixelated Hotbar Container (Bottom Center) */}
      <div className="pointer-events-auto fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center select-none animate-fadeIn">
        {/* Minecraft Hearts & Hunger Status Bar */}
        <div className="mb-1.5 flex items-center justify-between w-full px-2 text-xs font-mono drop-shadow">
          <div className="flex items-center gap-0.5 text-rose-500">
            {Array.from({ length: 10 }).map((_, i) => (
              <span key={`heart-${i}`} className="text-sm">❤️</span>
            ))}
          </div>
          <div className="flex items-center gap-0.5 text-amber-600">
            {Array.from({ length: 10 }).map((_, i) => (
              <span key={`hunger-${i}`} className="text-sm">🍗</span>
            ))}
          </div>
        </div>

        {/* 9-Slot Minecraft Style Hotbar */}
        <div className="relative flex items-center gap-1 rounded-xl border-4 border-slate-700 bg-slate-950/90 p-1.5 shadow-2xl backdrop-blur-md">
          {HOTBAR_ITEMS.map((item) => {
            const isSelected = item.id === selectedType;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setSelectedType(item.id);
                  firstPersonBuilder.updatePreview();
                }}
                className={`relative flex h-14 w-14 flex-col items-center justify-center rounded-lg border-2 transition-transform duration-100 cursor-pointer ${
                  isSelected
                    ? 'border-amber-400 bg-amber-500/25 scale-110 shadow-lg shadow-amber-500/30 z-10'
                    : 'border-slate-800 bg-slate-900/80 hover:border-slate-600 hover:bg-slate-800'
                }`}
              >
                {/* Slot Number Badge */}
                <span
                  className={`absolute top-0.5 left-1 text-[10px] font-mono font-extrabold ${
                    isSelected ? 'text-amber-300' : 'text-slate-400'
                  }`}
                >
                  {item.slot}
                </span>

                {/* Voxel Icon */}
                <span className="text-2xl mt-1 leading-none">{item.icon}</span>

                {/* Block Name Label */}
                <span className="mt-0.5 text-[9px] font-mono font-bold tracking-tight text-slate-200 truncate max-w-[50px]">
                  {item.label}
                </span>

                {/* Minecraft Active Selection Box Border */}
                {isSelected && (
                  <div className="absolute inset-0 rounded-lg border-2 border-white pointer-events-none animate-pulse" />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}

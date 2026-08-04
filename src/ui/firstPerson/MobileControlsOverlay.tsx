import { useState, useRef } from 'react';
import { firstPersonController } from '@/globe/FirstPersonController';
import { firstPersonBuilder } from '@/drawing/FirstPersonBuilder';
import { useUiStore } from '@/state/uiStore';
import { useWalkStore } from '@/state/walkStore';
import { soundEngine } from '@/audio/soundEngine';

export function MobileControlsOverlay() {
  const firstPersonActive = useUiStore((s) => s.firstPersonActive);
  const setCreativeOpen = useUiStore((s) => s.setCreativeInventoryOpen);
  const walkPhase = useWalkStore((s) => s.phase);

  const [joystickActive, setJoystickActive] = useState(false);
  const [joystickPos, setJoystickPos] = useState({ x: 0, y: 0 });
  const [knobPos, setKnobPos] = useState({ x: 0, y: 0 });
  const [isFlying, setIsFlying] = useState(false);

  const touchLookLastRef = useRef<{ x: number; y: number } | null>(null);

  const isActive = firstPersonActive || walkPhase === 'walk';
  if (!isActive) return null;

  // Touch handlers for virtual joystick D-pad (left screen half)
  const handleJoystickStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (!touch) return;
    const startX = touch.clientX;
    const startY = touch.clientY;
    setJoystickPos({ x: startX, y: startY });
    setKnobPos({ x: 0, y: 0 });
    setJoystickActive(true);
  };

  const handleJoystickMove = (e: React.TouchEvent) => {
    if (!joystickActive) return;
    const touch = e.touches[0];
    if (!touch) return;

    const dx = touch.clientX - joystickPos.x;
    const dy = touch.clientY - joystickPos.y;
    const dist = Math.hypot(dx, dy);
    const maxRadius = 50;

    const clampedDist = Math.min(dist, maxRadius);
    const angle = Math.atan2(dy, dx);

    const kX = Math.cos(angle) * clampedDist;
    const kY = Math.sin(angle) * clampedDist;
    setKnobPos({ x: kX, y: kY });

    // Map to normalized movement (-1 to +1)
    const normForward = -kY / maxRadius;
    const normSide = kX / maxRadius;
    firstPersonController.setTouchMovement(normForward, normSide);
    if (typeof (window as any).__voxelforgeWalkTouchMove === 'function') {
      (window as any).__voxelforgeWalkTouchMove(normForward, normSide);
    }
  };

  const handleJoystickEnd = () => {
    setJoystickActive(false);
    setKnobPos({ x: 0, y: 0 });
    firstPersonController.setTouchMovement(0, 0);
    if (typeof (window as any).__voxelforgeWalkTouchMove === 'function') {
      (window as any).__voxelforgeWalkTouchMove(0, 0);
    }
  };

  // Touch handlers for camera rotation / look drag (right screen half)
  const handleLookStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (!touch) return;
    touchLookLastRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleLookMove = (e: React.TouchEvent) => {
    if (!touchLookLastRef.current) return;
    const touch = e.touches[0];
    if (!touch) return;

    const dx = touch.clientX - touchLookLastRef.current.x;
    const dy = touch.clientY - touchLookLastRef.current.y;
    touchLookLastRef.current = { x: touch.clientX, y: touch.clientY };

    firstPersonController.addTouchLookDelta(dx, dy);
    if (typeof (window as any).__voxelforgeWalkTouchLook === 'function') {
      (window as any).__voxelforgeWalkTouchLook(dx, dy);
    }
  };

  const handleLookEnd = () => {
    touchLookLastRef.current = null;
  };

  const handleJump = () => {
    soundEngine.playJump();
    firstPersonController.triggerJump();
  };

  const handleToggleFlight = () => {
    soundEngine.playClick();
    firstPersonController.toggleFlight();
    setIsFlying(firstPersonController.isFlightActive());
  };

  const handlePlaceBlock = () => {
    firstPersonBuilder.placeCurrentStructure();
  };

  const handleBreakBlock = () => {
    firstPersonBuilder.deleteTargetedBlock();
  };

  return (
    <div className="pointer-events-none fixed inset-0 z-40 select-none overflow-hidden">
      {/* Top Mobile Bar */}
      <div className="pointer-events-auto absolute top-3 left-3 right-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              soundEngine.playClick();
              useUiStore.getState().setFirstPersonActive(false);
            }}
            className="rounded-xl border border-rose-500/40 bg-slate-950/80 px-3.5 py-2 text-xs font-bold text-rose-300 backdrop-blur-md shadow-lg active:scale-95 transition"
          >
            🚪 Exit Walk Mode
          </button>

          <button
            type="button"
            onClick={() => {
              soundEngine.playClick();
              setCreativeOpen(true);
            }}
            className="rounded-xl border border-amber-500/40 bg-slate-950/80 px-3.5 py-2 text-xs font-bold text-amber-300 backdrop-blur-md shadow-lg active:scale-95 transition flex items-center gap-1.5"
          >
            <span>🧰</span>
            <span>Inventory</span>
          </button>
        </div>

        <button
          type="button"
          onClick={handleToggleFlight}
          className={`rounded-xl border px-3.5 py-2 text-xs font-bold backdrop-blur-md shadow-lg active:scale-95 transition flex items-center gap-1 ${
            isFlying
              ? 'border-sky-400 bg-sky-500/30 text-sky-200'
              : 'border-white/20 bg-slate-950/80 text-slate-300'
          }`}
        >
          <span>✈️</span>
          <span>{isFlying ? 'Fly ON' : 'Fly OFF'}</span>
        </button>
      </div>

      {/* Left Touch Joystick Zone */}
      <div
        className="pointer-events-auto absolute bottom-0 left-0 h-1/2 w-1/2 touch-none"
        onTouchStart={handleJoystickStart}
        onTouchMove={handleJoystickMove}
        onTouchEnd={handleJoystickEnd}
        onTouchCancel={handleJoystickEnd}
      >
        {joystickActive && (
          <div
            className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-sky-400/40 bg-slate-950/60 backdrop-blur-sm"
            style={{
              left: joystickPos.x,
              top: joystickPos.y,
              width: 100,
              height: 100,
            }}
          >
            <div
              className="absolute top-1/2 left-1/2 h-12 w-12 -translate-x-1/2 -translate-y-1/2 rounded-full border border-sky-300/80 bg-sky-400/60 shadow-lg"
              style={{
                transform: `translate(calc(-50% + ${knobPos.x}px), calc(-50% + ${knobPos.y}px))`,
              }}
            />
          </div>
        )}
      </div>

      {/* Right Touch Look Zone */}
      <div
        className="pointer-events-auto absolute bottom-0 right-0 h-1/2 w-1/2 touch-none"
        onTouchStart={handleLookStart}
        onTouchMove={handleLookMove}
        onTouchEnd={handleLookEnd}
        onTouchCancel={handleLookEnd}
      />

      {/* Right Mobile Action Buttons */}
      <div className="pointer-events-auto absolute bottom-24 right-5 flex flex-col gap-3">
        <button
          type="button"
          onTouchStart={(e) => {
            e.stopPropagation();
            handleJump();
          }}
          onClick={handleJump}
          className="h-14 w-14 rounded-full border-2 border-teal-400/50 bg-slate-950/85 text-xl font-bold text-teal-300 backdrop-blur-md shadow-2xl active:scale-90 transition flex items-center justify-center"
        >
          🦘
        </button>

        <div className="flex gap-2">
          <button
            type="button"
            onTouchStart={(e) => {
              e.stopPropagation();
              handleBreakBlock();
            }}
            onClick={handleBreakBlock}
            className="h-12 w-12 rounded-full border border-rose-500/50 bg-rose-950/80 text-lg font-bold text-rose-300 backdrop-blur-md shadow-xl active:scale-90 transition flex items-center justify-center"
          >
            ⛏️
          </button>

          <button
            type="button"
            onTouchStart={(e) => {
              e.stopPropagation();
              handlePlaceBlock();
            }}
            onClick={handlePlaceBlock}
            className="h-12 w-12 rounded-full border border-emerald-500/50 bg-emerald-950/80 text-lg font-bold text-emerald-300 backdrop-blur-md shadow-xl active:scale-90 transition flex items-center justify-center"
          >
            🔨
          </button>
        </div>
      </div>
    </div>
  );
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { firstPersonController } from '@/globe/FirstPersonController';
import { firstPersonBuilder } from '@/drawing/FirstPersonBuilder';
import { useUiStore } from '@/state/uiStore';
import { useWalkStore } from '@/state/walkStore';
import { soundEngine } from '@/audio/soundEngine';
import { normalizeJoystickDelta } from '@/input/touchControls';

const JOYSTICK_RADIUS = 50;

export function MobileControlsOverlay() {
  const firstPersonActive = useUiStore((s) => s.firstPersonActive);
  const setCreativeOpen = useUiStore((s) => s.setCreativeInventoryOpen);
  const walkPhase = useWalkStore((s) => s.phase);
  const beginAscent = useWalkStore((s) => s.beginAscent);

  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const [joystickCenter, setJoystickCenter] = useState({ x: 0, y: 0 });
  const [knobPos, setKnobPos] = useState({ x: 0, y: 0 });
  const [isFlying, setIsFlying] = useState(false);
  const [isSprinting, setIsSprinting] = useState(false);

  const joystickPointerId = useRef<number | null>(null);
  const joystickOrigin = useRef({ x: 0, y: 0 });
  const lookPointerId = useRef<number | null>(null);
  const lastLookPosition = useRef({ x: 0, y: 0 });

  const isActive = firstPersonActive || walkPhase === 'walk';
  const isNoaWalk = walkPhase === 'walk';

  useEffect(() => {
    const updateTouchCapability = () => {
      setIsTouchDevice(
        navigator.maxTouchPoints > 0
        || window.matchMedia('(pointer: coarse)').matches,
      );
    };
    updateTouchCapability();
    window.addEventListener('resize', updateTouchCapability);
    return () => window.removeEventListener('resize', updateTouchCapability);
  }, []);

  const setMovement = useCallback((forward: number, side: number) => {
    if (isNoaWalk) window.__voxelforgeWalkTouchMove?.(forward, side);
    else firstPersonController.setTouchMovement(forward, side);
  }, [isNoaWalk]);

  const resetJoystick = useCallback(() => {
    joystickPointerId.current = null;
    setKnobPos({ x: 0, y: 0 });
    setMovement(0, 0);
  }, [setMovement]);

  useEffect(() => () => {
    setMovement(0, 0);
    window.__voxelforgeWalkSprint?.(false);
    joystickPointerId.current = null;
    lookPointerId.current = null;
  }, [setMovement]);

  useEffect(() => {
    if (isNoaWalk) return;
    setIsSprinting(false);
    window.__voxelforgeWalkSprint?.(false);
  }, [isNoaWalk]);

  const updateJoystick = useCallback((clientX: number, clientY: number) => {
    const dx = clientX - joystickOrigin.current.x;
    const dy = clientY - joystickOrigin.current.y;
    const { knobX, knobY, forward, side } = normalizeJoystickDelta(dx, dy, JOYSTICK_RADIUS);
    setKnobPos({ x: knobX, y: knobY });
    setMovement(forward, side);
  }, [setMovement]);

  const handleJoystickDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (joystickPointerId.current !== null || event.pointerType === 'mouse') return;
    event.preventDefault();
    event.stopPropagation();
    joystickPointerId.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    joystickOrigin.current = { x: event.clientX, y: event.clientY };
    const rect = event.currentTarget.getBoundingClientRect();
    setJoystickCenter({ x: event.clientX - rect.left, y: event.clientY - rect.top });
    setKnobPos({ x: 0, y: 0 });
    setMovement(0, 0);
  }, [setMovement]);

  const handleJoystickMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (joystickPointerId.current !== event.pointerId) return;
    event.preventDefault();
    updateJoystick(event.clientX, event.clientY);
  }, [updateJoystick]);

  const handleJoystickUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (joystickPointerId.current !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    resetJoystick();
  }, [resetJoystick]);

  const handleLookDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (lookPointerId.current !== null || event.pointerType === 'mouse') return;
    event.preventDefault();
    event.stopPropagation();
    lookPointerId.current = event.pointerId;
    lastLookPosition.current = { x: event.clientX, y: event.clientY };
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch (_) { /* capture is optional on older touch browsers */ }
  }, []);

  const handleLookMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (lookPointerId.current !== event.pointerId) return;
    event.preventDefault();
    const dx = event.clientX - lastLookPosition.current.x;
    const dy = event.clientY - lastLookPosition.current.y;
    lastLookPosition.current = { x: event.clientX, y: event.clientY };
    if (isNoaWalk) window.__voxelforgeWalkTouchLook?.(dx, dy);
    else firstPersonController.addTouchLookDelta(dx, dy);
  }, [isNoaWalk]);

  const handleLookUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (lookPointerId.current !== event.pointerId) return;
    event.preventDefault();
    lookPointerId.current = null;
  }, []);

  const handleLookCaptureLost = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (lookPointerId.current === event.pointerId) lookPointerId.current = null;
  }, []);

  const handleJump = () => {
    soundEngine.playJump();
    if (isNoaWalk) window.__voxelforgeWalkJump?.();
    else firstPersonController.triggerJump();
  };

  const handleToggleFlight = () => {
    soundEngine.playClick();
    firstPersonController.toggleFlight();
    setIsFlying(firstPersonController.isFlightActive());
  };

  if (!isActive || !isTouchDevice) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[60] select-none overflow-hidden touch-none">
      <div
        className="pointer-events-auto absolute bottom-20 left-0 top-14 w-[42%] touch-none"
        onPointerDown={handleJoystickDown}
        onPointerMove={handleJoystickMove}
        onPointerUp={handleJoystickUp}
        onPointerCancel={handleJoystickUp}
      >
        {joystickPointerId.current !== null && (
          <div
            className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-sky-400/40 bg-slate-950/60 backdrop-blur-sm"
            style={{ left: joystickCenter.x, top: joystickCenter.y, width: 100, height: 100 }}
          >
            <div
              className="absolute left-1/2 top-1/2 h-12 w-12 rounded-full border border-sky-300/80 bg-sky-400/60 shadow-lg"
              style={{ transform: `translate(calc(-50% + ${knobPos.x}px), calc(-50% + ${knobPos.y}px))` }}
            />
          </div>
        )}
      </div>

      <div
        className="pointer-events-auto absolute bottom-20 right-0 top-14 w-[58%] touch-none"
        onPointerDown={handleLookDown}
        onPointerMove={handleLookMove}
        onPointerUp={handleLookUp}
        onPointerCancel={handleLookUp}
        onLostPointerCapture={handleLookCaptureLost}
      />

      <div className="pointer-events-auto absolute left-3 right-3 top-3 z-10 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              soundEngine.playClick();
              if (isNoaWalk) beginAscent();
              else firstPersonController.exit();
            }}
            className="touch-manipulation rounded-xl border border-rose-500/40 bg-slate-950/80 px-3.5 py-2 text-xs font-bold text-rose-300 shadow-lg backdrop-blur-md active:scale-95"
          >
            🚪 Exit Walk Mode
          </button>

          {!isNoaWalk && (
            <button
              type="button"
              onClick={() => setCreativeOpen(true)}
              className="touch-manipulation rounded-xl border border-amber-500/40 bg-slate-950/80 px-3.5 py-2 text-xs font-bold text-amber-300 shadow-lg backdrop-blur-md active:scale-95"
            >
              🧰 Inventory
            </button>
          )}
        </div>

        {!isNoaWalk && (
          <button
            type="button"
            onClick={handleToggleFlight}
            className={`touch-manipulation rounded-xl border px-3.5 py-2 text-xs font-bold shadow-lg backdrop-blur-md active:scale-95 ${
              isFlying ? 'border-sky-400 bg-sky-500/30 text-sky-200' : 'border-white/20 bg-slate-950/80 text-slate-300'
            }`}
          >
            ✈️ {isFlying ? 'Fly ON' : 'Fly OFF'}
          </button>
        )}
      </div>

      <div className="pointer-events-auto absolute bottom-24 right-5 z-10 flex flex-col gap-3">
        {isNoaWalk && (
          <button
            type="button"
            onClick={() => {
              const next = !isSprinting;
              setIsSprinting(next);
              window.__voxelforgeWalkSprint?.(next);
            }}
            className={`touch-manipulation flex h-12 w-14 items-center justify-center rounded-full border text-xs font-bold shadow-xl backdrop-blur-md active:scale-90 ${
              isSprinting
                ? 'border-sky-300 bg-sky-500/40 text-sky-100'
                : 'border-sky-500/40 bg-slate-950/85 text-sky-300'
            }`}
            aria-pressed={isSprinting}
            aria-label="Toggle sprint"
          >
            Sprint
          </button>
        )}
        {isNoaWalk && (
          <button
            type="button"
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              window.__voxelforgeWalkInteract?.();
            }}
            className="touch-manipulation flex h-12 w-14 items-center justify-center rounded-full border border-amber-400/50 bg-amber-950/85 text-xs font-bold text-amber-200 shadow-xl backdrop-blur-md active:scale-90"
            aria-label="Talk to nearby citizen"
          >
            Talk
          </button>
        )}
        <button
          type="button"
          onPointerDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
            handleJump();
          }}
          onClick={(event) => { if (event.detail === 0) handleJump(); }}
          className="touch-manipulation flex h-14 w-14 items-center justify-center rounded-full border-2 border-teal-400/50 bg-slate-950/85 text-xl font-bold text-teal-300 shadow-2xl backdrop-blur-md active:scale-90"
          aria-label="Jump"
        >
          🦘
        </button>

        <div className="flex gap-2">
          <button
            type="button"
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              if (isNoaWalk) window.__voxelforgeWalkBreak?.();
              else firstPersonBuilder.deleteTargetedBlock();
            }}
            onClick={(event) => {
              if (event.detail !== 0) return;
              if (isNoaWalk) window.__voxelforgeWalkBreak?.();
              else firstPersonBuilder.deleteTargetedBlock();
            }}
            className="touch-manipulation flex h-12 w-12 items-center justify-center rounded-full border border-rose-500/50 bg-rose-950/80 text-lg font-bold text-rose-300 shadow-xl backdrop-blur-md active:scale-90"
            aria-label="Break block"
          >
            ⛏️
          </button>

          <button
            type="button"
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              if (isNoaWalk) window.__voxelforgeWalkPlace?.();
              else firstPersonBuilder.placeCurrentStructure();
            }}
            onClick={(event) => {
              if (event.detail !== 0) return;
              if (isNoaWalk) window.__voxelforgeWalkPlace?.();
              else firstPersonBuilder.placeCurrentStructure();
            }}
            className="touch-manipulation flex h-12 w-12 items-center justify-center rounded-full border border-emerald-500/50 bg-emerald-950/80 text-lg font-bold text-emerald-300 shadow-xl backdrop-blur-md active:scale-90"
            aria-label="Place block"
          >
            🔨
          </button>
        </div>
      </div>
    </div>
  );
}

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useUiStore, type FirstPersonBuildingType } from '@/state/uiStore';
import { firstPersonController } from '@/globe/FirstPersonController';
import { firstPersonBuilder } from '@/drawing/FirstPersonBuilder';
import { getVoxelBlockTextureUrl } from '@/globe/voxelTextures';

const HOTBAR_SLOTS: { type: FirstPersonBuildingType; label: string; icon: string }[] = [
  { type: 'house', label: 'Wood', icon: '🪵' },
  { type: 'castle', label: 'Brick', icon: '🧱' },
  { type: 'watchtower', label: 'Cobble', icon: '🪨' },
  { type: 'gate', label: 'Gold', icon: '🚪' },
  { type: 'wall', label: 'Chisel', icon: '🏰' },
  { type: 'road', label: 'Slab', icon: '🛣️' },
  { type: 'flagpole', label: 'Banner', icon: '🚩' },
  { type: 'tree', label: 'Leaves', icon: '🌿' },
];

export const MobileTouchOverlay: React.FC = () => {
  const firstPersonActive = useUiStore((state) => state.firstPersonActive);
  const selectedBuildingType = useUiStore((state) => state.firstPersonBuildingType);
  const setFirstPersonBuildingType = useUiStore((state) => state.setFirstPersonBuildingType);

  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const [isFlying, setIsFlying] = useState(false);

  // Joystick state
  const joystickContainerRef = useRef<HTMLDivElement>(null);
  const [joystickActive, setJoystickActive] = useState(false);
  const [joystickPos, setJoystickPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const activeJoystickPointerId = useRef<number | null>(null);

  // Look pad tracking
  const activeLookPointerId = useRef<number | null>(null);
  const lastLookPos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Detect touch capability or small touch screens
  useEffect(() => {
    const checkTouch = () => {
      const hasTouch =
        'ontouchstart' in window ||
        navigator.maxTouchPoints > 0 ||
        window.matchMedia('(pointer: coarse)').matches;
      setIsTouchDevice(hasTouch);
    };
    checkTouch();
    window.addEventListener('resize', checkTouch);
    return () => window.removeEventListener('resize', checkTouch);
  }, []);

  // Update flight state periodically
  useEffect(() => {
    if (!firstPersonActive) return;
    const interval = setInterval(() => {
      setIsFlying(firstPersonController.isFlightActive());
    }, 200);
    return () => clearInterval(interval);
  }, [firstPersonActive]);

  // --- Joystick Touch Handlers ---
  const handleJoystickPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    activeJoystickPointerId.current = e.pointerId;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    setJoystickActive(true);

    if (!joystickContainerRef.current) return;
    const rect = joystickContainerRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const dx = e.clientX - centerX;
    const dy = e.clientY - centerY;
    const maxRadius = rect.width / 2 - 12;

    const distance = Math.sqrt(dx * dx + dy * dy);
    const clampedDist = Math.min(distance, maxRadius);
    const angle = Math.atan2(dy, dx);

    const knobX = Math.cos(angle) * clampedDist;
    const knobY = Math.sin(angle) * clampedDist;

    setJoystickPos({ x: knobX, y: knobY });

    const normSide = knobX / maxRadius;
    const normForward = -knobY / maxRadius; // Up is negative Y screen space -> forward
    firstPersonController.setTouchMovement(normForward, normSide);
  }, []);

  const handleJoystickPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (activeJoystickPointerId.current !== e.pointerId) return;
    e.preventDefault();
    e.stopPropagation();

    if (!joystickContainerRef.current) return;
    const rect = joystickContainerRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const dx = e.clientX - centerX;
    const dy = e.clientY - centerY;
    const maxRadius = rect.width / 2 - 12;

    const distance = Math.sqrt(dx * dx + dy * dy);
    const clampedDist = Math.min(distance, maxRadius);
    const angle = Math.atan2(dy, dx);

    const knobX = Math.cos(angle) * clampedDist;
    const knobY = Math.sin(angle) * clampedDist;

    setJoystickPos({ x: knobX, y: knobY });

    const normSide = knobX / maxRadius;
    const normForward = -knobY / maxRadius;
    firstPersonController.setTouchMovement(normForward, normSide);
  }, []);

  const handleJoystickPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (activeJoystickPointerId.current !== e.pointerId) return;
    e.preventDefault();
    e.stopPropagation();
    activeJoystickPointerId.current = null;
    setJoystickActive(false);
    setJoystickPos({ x: 0, y: 0 });
    firstPersonController.setTouchMovement(0, 0);
  }, []);

  // --- Look Surface Handlers ---
  const handleLookPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    // Avoid capturing taps on hotbar or action buttons
    activeLookPointerId.current = e.pointerId;
    lastLookPos.current = { x: e.clientX, y: e.clientY };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }, []);

  const handleLookPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (activeLookPointerId.current !== e.pointerId) return;
    const dx = e.clientX - lastLookPos.current.x;
    const dy = e.clientY - lastLookPos.current.y;
    lastLookPos.current = { x: e.clientX, y: e.clientY };

    firstPersonController.addTouchLookDelta(dx, dy);
    firstPersonBuilder.updatePreview();
  }, []);

  const handleLookPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (activeLookPointerId.current !== e.pointerId) return;
    activeLookPointerId.current = null;
  }, []);

  if (!firstPersonActive || !isTouchDevice) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 pointer-events-none select-none overflow-hidden touch-none">
      {/* 1. Camera Touch Drag Surface (Right 65% of screen) */}
      <div
        className="absolute top-0 right-0 w-[65%] h-[80%] pointer-events-auto touch-none"
        onPointerDown={handleLookPointerDown}
        onPointerMove={handleLookPointerMove}
        onPointerUp={handleLookPointerUp}
        onPointerCancel={handleLookPointerUp}
      />

      {/* 2. Top-Left Exit Button & Mode Badge */}
      <div className="absolute top-4 left-4 flex items-center gap-3 pointer-events-auto">
        <button
          type="button"
          onClick={() => firstPersonController.exit()}
          className="px-4 py-2.5 bg-slate-900/80 hover:bg-slate-800 text-white font-medium rounded-full border border-slate-700/80 shadow-lg backdrop-blur-md flex items-center gap-2 active:scale-95 transition-transform"
        >
          <span className="text-red-400 font-bold">✕</span> Exit 3D Mode
        </button>

        <div className="px-3 py-1.5 bg-sky-950/70 text-sky-300 text-xs font-semibold rounded-full border border-sky-600/50 backdrop-blur-md flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-sky-400 animate-pulse" />
          Mobile Touch Controls
        </div>
      </div>

      {/* 3. Left Virtual Movement Joystick */}
      <div className="absolute bottom-10 left-8 pointer-events-auto">
        <div
          ref={joystickContainerRef}
          onPointerDown={handleJoystickPointerDown}
          onPointerMove={handleJoystickPointerMove}
          onPointerUp={handleJoystickPointerUp}
          onPointerCancel={handleJoystickPointerUp}
          className={`relative w-36 h-36 rounded-full bg-slate-950/50 backdrop-blur-md border ${
            joystickActive ? 'border-sky-400/80 bg-slate-900/70 shadow-[0_0_20px_rgba(56,189,248,0.25)]' : 'border-white/20'
          } flex items-center justify-center touch-none transition-colors`}
        >
          {/* Base Direction D-Pad Markings */}
          <div className="absolute inset-0 flex items-center justify-center opacity-30 pointer-events-none">
            <div className="w-0.5 h-full bg-white/40" />
            <div className="h-0.5 w-full bg-white/40 absolute" />
          </div>

          {/* Analog Knob Stick */}
          <div
            className={`w-14 h-14 rounded-full bg-gradient-to-tr from-sky-500 to-indigo-500 shadow-xl border-2 border-white/80 absolute transform transition-transform ${
              !joystickActive ? 'duration-150' : ''
            }`}
            style={{
              transform: `translate(${joystickPos.x}px, ${joystickPos.y}px)`,
            }}
          />
        </div>
      </div>

      {/* 4. Right Side Floating Action Buttons */}
      <div className="absolute bottom-10 right-6 flex flex-col items-end gap-3 pointer-events-auto">
        {/* Upper Row Action Buttons: Place & Break Block */}
        <div className="flex items-center gap-3">
          {/* Break Block Button (⛏️) */}
          <button
            type="button"
            onPointerDown={(e) => {
              e.preventDefault();
              firstPersonBuilder.deleteTargetedBlock();
            }}
            className="w-14 h-14 rounded-2xl bg-rose-950/80 border-2 border-rose-500/70 text-rose-200 shadow-lg backdrop-blur-md flex items-center justify-center text-2xl active:scale-90 transition-transform"
            title="Break Block"
          >
            ⛏️
          </button>

          {/* Place Block Button (➕) */}
          <button
            type="button"
            onPointerDown={(e) => {
              e.preventDefault();
              firstPersonBuilder.placeCurrentStructure();
            }}
            className="w-16 h-16 rounded-2xl bg-emerald-950/80 border-2 border-emerald-400 text-emerald-200 shadow-xl backdrop-blur-md flex items-center justify-center text-3xl active:scale-90 transition-transform"
            title="Place Block"
          >
            ➕
          </button>
        </div>

        {/* Lower Row Action Buttons: Flight & Jump */}
        <div className="flex items-center gap-3 mt-1">
          {/* Flight Toggle Button (🕊️) */}
          <button
            type="button"
            onClick={() => {
              firstPersonController.toggleFlight();
              setIsFlying(firstPersonController.isFlightActive());
            }}
            className={`w-13 h-13 rounded-2xl backdrop-blur-md border-2 flex items-center justify-center text-xl shadow-lg active:scale-90 transition-transform ${
              isFlying
                ? 'bg-sky-500/80 border-white text-white shadow-[0_0_15px_rgba(56,189,248,0.5)]'
                : 'bg-slate-900/70 border-slate-600 text-slate-300'
            }`}
            title="Toggle Fly Mode"
          >
            🕊️
          </button>

          {/* Jump / Ascend Button (🚀) */}
          <button
            type="button"
            onPointerDown={(e) => {
              e.preventDefault();
              firstPersonController.triggerJump();
            }}
            className="w-16 h-16 rounded-full bg-gradient-to-tr from-sky-600 to-blue-500 border-2 border-white/90 text-white shadow-2xl backdrop-blur-md flex items-center justify-center text-2xl font-bold active:scale-90 transition-transform"
            title="Jump / Ascend"
          >
            🚀
          </button>
        </div>
      </div>

      {/* 5. Mobile Hotbar Selector (Bottom Center) */}
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 pointer-events-auto">
        <div className="flex items-center gap-1.5 p-1.5 bg-slate-950/85 backdrop-blur-md border border-slate-800 rounded-2xl shadow-2xl max-w-[85vw] overflow-x-auto no-scrollbar">
          {HOTBAR_SLOTS.map((slot) => {
            const isSelected = selectedBuildingType === slot.type;
            const textureUrl = getVoxelBlockTextureUrl(slot.type);

            return (
              <button
                key={slot.type}
                type="button"
                onClick={() => setFirstPersonBuildingType(slot.type)}
                className={`relative flex flex-col items-center justify-center w-11 h-11 rounded-xl transition-all ${
                  isSelected
                    ? 'bg-sky-600/40 border-2 border-sky-400 shadow-[0_0_12px_rgba(56,189,248,0.4)] scale-105'
                    : 'bg-slate-900/60 border border-slate-700/60 opacity-80 hover:opacity-100'
                }`}
              >
                {textureUrl ? (
                  <img
                    src={textureUrl}
                    alt={slot.label}
                    className="w-7 h-7 rounded object-cover image-rendering-pixelated"
                  />
                ) : (
                  <span className="text-lg">{slot.icon}</span>
                )}
                <span className="text-[9px] font-medium text-slate-300 leading-none mt-0.5">
                  {slot.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

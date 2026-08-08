/**
 * WalkOverlay — React component that manages the walk-mode lifecycle.
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { useWalkStore } from '@/state/walkStore';
import { useWorldStore } from '@/state/worldStore';
import { useUiStore } from '@/state/uiStore';
import type { WalkScene } from './WalkScene';
import { makeAnchor } from './GeoAnchor';
import { getViewer } from '@/globe/CesiumViewer';
import { Math as CesiumMath } from 'cesium';
import { BLOCKS } from './blockRegistry';
import { pickGlobeCenterLonLat } from './GlobeDescentTarget';
import { createWalkEntryPin, findWalkEntryPin } from './WalkEntryPin';
import { ensureNpcPopulation, simulateNpcToHour } from '@/npc/NpcPopulation';
import type { NpcConversationBubble } from './PersistentWalkNpcManager';

function releaseTextEntryFocus(): void {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement)) return;
  if (active.tagName === 'INPUT'
    || active.tagName === 'TEXTAREA'
    || active.tagName === 'SELECT'
    || active.isContentEditable) {
    active.blur();
  }
}

function walkErrorMessage(cause: unknown, fallback: string): string {
  if (cause instanceof Error) return cause.message || fallback;
  if (typeof cause === 'string' && cause.trim()) return cause;
  if (cause !== null && cause !== undefined) {
    try { return JSON.stringify(cause); } catch (_) { return String(cause); }
  }
  return fallback;
}

export function WalkOverlay() {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<WalkScene | null>(null);
  const [npcCount, setNpcCount] = useState(0);
  const [conversation, setConversation] = useState<NpcConversationBubble | null>(null);
  const [creativeFlying, setCreativeFlying] = useState(false);
  const creativeInventoryOpen = useUiStore((s) => s.creativeInventoryOpen);
  const setCreativeInventoryOpen = useUiStore((s) => s.setCreativeInventoryOpen);
  const [controllerName, setControllerName] = useState<string | null>(null);
  const {
    phase,
    anchor,
    entryChunks,
    error,
    beginDescent,
    confirmWalk,
    beginAscent,
    confirmGlobe,
    failTransition,
    hotbarIds,
    activeHotbarIndex,
    selectHotbarSlot,
    assignHotbarSlot,
    cycleHotbar,
  } = useWalkStore();
  const hotbarBlocks = hotbarIds
    .map((id) => BLOCKS.find((block) => block.id === id))
    .filter((block): block is NonNullable<typeof block> => Boolean(block));
  const { activeWorldId, worlds, patchWorld } = useWorldStore();
  const returnToGlobe = useCallback(() => {
    confirmGlobe();
    useUiStore.getState().setTool('select');
  }, [confirmGlobe]);

  const descend = useCallback((targetLon?: number, targetLat?: number) => {
    const cesiumViewer = getViewer();
    if (!cesiumViewer) return;
    const picked = targetLon === undefined || targetLat === undefined
      ? pickGlobeCenterLonLat(cesiumViewer)
      : null;
    const cartographic = cesiumViewer.camera.positionCartographic;
    const lon = targetLon ?? picked?.[0] ?? CesiumMath.toDegrees(cartographic.longitude);
    const lat = targetLat ?? picked?.[1] ?? CesiumMath.toDegrees(cartographic.latitude);

    const worldId = activeWorldId;
    const world = worldId ? worlds[worldId] : null;
    const savedChunks = world?.voxelChunks ?? {};

    const newAnchor = makeAnchor(lon, lat);
    beginDescent(newAnchor, savedChunks);
  }, [activeWorldId, worlds, beginDescent]);

  const descendRef = useRef(descend);
  useEffect(() => { descendRef.current = descend; }, [descend]);

  useEffect(() => {
    // Keep the mobile bridge installed for the lifetime of the overlay. World
    // autosaves replace `descend`, but must not briefly remove the touch hooks.
    window.__voxelforgeDescend = (lon?: number, lat?: number) => descendRef.current(lon, lat);
    window.__voxelforgeWalkTouchLook = (dx: number, dy: number) => {
      sceneRef.current?.applyTouchLookDelta(dx, dy);
    };
    window.__voxelforgeWalkTouchMove = (forward: number, side: number) => {
      sceneRef.current?.applyTouchMovement(forward, side);
    };
    window.__voxelforgeWalkJump = () => sceneRef.current?.jump();
    window.__voxelforgeWalkSprint = (active: boolean) => sceneRef.current?.setSprinting(active);
    window.__voxelforgeWalkPlace = () => sceneRef.current?.placeSelectedBlock();
    window.__voxelforgeWalkBreak = () => sceneRef.current?.breakTargetedBlock();
    window.__voxelforgeWalkInteract = () => {
      if (sceneRef.current?.toggleTargetedDoor()) {
        setConversation(null);
        return true;
      }
      const bubble = sceneRef.current?.interactWithNearestNpc() ?? null;
      setConversation(bubble);
      return Boolean(bubble);
    };
    return () => {
      delete window.__voxelforgeDescend;
      delete window.__voxelforgeWalkTouchLook;
      delete window.__voxelforgeWalkTouchMove;
      delete window.__voxelforgeWalkJump;
      delete window.__voxelforgeWalkSprint;
      delete window.__voxelforgeWalkPlace;
      delete window.__voxelforgeWalkBreak;
      delete window.__voxelforgeWalkInteract;
    };
  }, []);

  useEffect(() => {
    const refreshController = () => {
      const connected = Array.from(navigator.getGamepads?.() ?? []).find((gamepad) => gamepad?.connected);
      setControllerName(connected?.id ?? null);
    };
    const handleConnected = (event: GamepadEvent) => setControllerName(event.gamepad.id);
    const handleDisconnected = () => refreshController();
    refreshController();
    window.addEventListener('gamepadconnected', handleConnected);
    window.addEventListener('gamepaddisconnected', handleDisconnected);
    return () => {
      window.removeEventListener('gamepadconnected', handleConnected);
      window.removeEventListener('gamepaddisconnected', handleDisconnected);
    };
  }, []);

  useEffect(() => {
    if (phase !== 'walk') return;
    const container = containerRef.current;
    const reclaimWalkFocus = () => {
      releaseTextEntryFocus();
      sceneRef.current?.focusControls();
    };
    const focusFrame = window.requestAnimationFrame(reclaimWalkFocus);
    container?.addEventListener('pointerdown', reclaimWalkFocus, { capture: true });
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') {
        sceneRef.current?.setKeyboardSprinting(true);
        return;
      }
      if (event.code === 'ControlLeft' || event.code === 'ControlRight') {
        sceneRef.current?.setKeyboardSprinting(true);
        return;
      }
      if (event.code === 'Escape') {
        if (creativeInventoryOpen) {
          setCreativeInventoryOpen(false);
          return;
        }
        if (conversation) {
          sceneRef.current?.closeNpcConversation(conversation.npcId);
          setConversation(null);
          return;
        }
        sceneRef.current?.releasePointerLock();
        return;
      }
      if (event.code === 'KeyF' && !event.repeat) {
        setCreativeFlying(sceneRef.current?.toggleCreativeFlight() ?? false);
        return;
      }
      if (event.code === 'KeyI' && !event.repeat) {
        const next = !useUiStore.getState().creativeInventoryOpen;
        if (next) sceneRef.current?.releasePointerLock();
        setCreativeInventoryOpen(next);
        return;
      }
      if (event.code === 'KeyE' && !event.repeat) {
        if (conversation) {
          setConversation(sceneRef.current?.continueNpcConversation(conversation.npcId) ?? null);
          return;
        }
        if (sceneRef.current?.toggleTargetedDoor()) {
          setConversation(null);
          return;
        }
        const bubble = sceneRef.current?.interactWithNearestNpc() ?? null;
        setConversation(bubble);
        return;
      }
      if (!event.code.startsWith('Digit')) return;
      const slot = Number.parseInt(event.code.slice(5), 10);
      if (slot >= 1 && slot <= hotbarIds.length) selectHotbarSlot(slot - 1);
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'ShiftLeft' || event.code === 'ShiftRight'
        || event.code === 'ControlLeft' || event.code === 'ControlRight') {
        sceneRef.current?.setKeyboardSprinting(false);
      }
    };
    const handleBlur = () => sceneRef.current?.setKeyboardSprinting(false);
    const handleWheel = (event: WheelEvent) => {
      if (event.deltaY === 0 || creativeInventoryOpen) return;
      event.preventDefault();
      cycleHotbar(event.deltaY);
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      window.cancelAnimationFrame(focusFrame);
      container?.removeEventListener('pointerdown', reclaimWalkFocus, { capture: true });
      sceneRef.current?.setKeyboardSprinting(false);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('wheel', handleWheel);
    };
  }, [phase, beginAscent, conversation, creativeInventoryOpen, hotbarIds.length, selectHotbarSlot, cycleHotbar]);

  useEffect(() => {
    sceneRef.current?.setInventoryOpen(creativeInventoryOpen);
    if (!creativeInventoryOpen) return;
    sceneRef.current?.releasePointerLock();
    let frame = 0;
    let previous = { up: false, down: false, left: false, right: false, accept: false, cancel: false };
    let lastMoveAt = 0;
    const availableBlocks = BLOCKS.filter((b) => b.id !== 0 && b.placeable !== false && !b.name.includes('_flowing_'));
    let focusIndex = 0;

    const poll = (now: number) => {
      const gamepad = Array.from(navigator.getGamepads?.() ?? []).find((pad) => pad?.connected) ?? null;
      if (gamepad) {
        const pressed = (index: number) => Boolean(gamepad.buttons[index]?.pressed || (gamepad.buttons[index]?.value ?? 0) > 0.5);
        const current = {
          up: pressed(12) || (gamepad.axes[1] ?? 0) < -0.65,
          down: pressed(13) || (gamepad.axes[1] ?? 0) > 0.65,
          left: pressed(14) || (gamepad.axes[0] ?? 0) < -0.65,
          right: pressed(15) || (gamepad.axes[0] ?? 0) > 0.65,
          accept: pressed(0),
          cancel: pressed(1),
        };
        const columns = window.innerWidth >= 768 ? 8 : window.innerWidth >= 640 ? 6 : 4;
        const moveReady = now - lastMoveAt > 170;
        let delta = 0;
        if (current.left && (!previous.left || moveReady)) delta = -1;
        else if (current.right && (!previous.right || moveReady)) delta = 1;
        else if (current.up && (!previous.up || moveReady)) delta = -columns;
        else if (current.down && (!previous.down || moveReady)) delta = columns;
        if (delta !== 0) {
          focusIndex = Math.max(0, Math.min(availableBlocks.length - 1, focusIndex + delta));
          lastMoveAt = now;
        }
        if (current.accept && !previous.accept) {
          const block = availableBlocks[focusIndex];
          if (block) {
            assignHotbarSlot(useWalkStore.getState().activeHotbarIndex, block.id);
            setCreativeInventoryOpen(false);
          }
        }
        if (current.cancel && !previous.cancel) setCreativeInventoryOpen(false);
        previous = current;
      }
      frame = window.requestAnimationFrame(poll);
    };
    frame = window.requestAnimationFrame(poll);
    return () => window.cancelAnimationFrame(frame);
  }, [creativeInventoryOpen, assignHotbarSlot, setCreativeInventoryOpen]);

  useEffect(() => {
    if (!conversation) return;
    // Dialogue is a cursor-driven UI on desktop. NOA otherwise keeps the
    // pointer captured after the interaction key/right click, making the
    // response buttons impossible to select.
    sceneRef.current?.releasePointerLock();
  }, [conversation]);

  useEffect(() => {
    if (phase !== 'descending' || !anchor || sceneRef.current || !containerRef.current) return;

    let cancelled = false;
    const startWalkScene = async () => {
      try {
        // Keep NOA and Babylon out of the initial globe bundle. The descent UI
        // naturally covers this one-time module load on the first walk entry.
        const { WalkScene: WalkSceneRuntime } = await import('./WalkScene');
        if (cancelled || sceneRef.current || !containerRef.current) return;
        const worldId = activeWorldId;
        const world = worldId ? worlds[worldId] : null;
        const now = Date.now();
        const generatedNpcs = ensureNpcPopulation(world?.npcs, world?.entities ?? {}, world?.seed ?? 0, now);
        const simulatedNpcs = Object.fromEntries(Object.entries(generatedNpcs).map(([id, npc]) => [
          id,
          simulateNpcToHour(npc, useUiStore.getState().timeOfDay, now),
        ]));
        sceneRef.current = WalkSceneRuntime.create({
          anchor,
          container: containerRef.current,
          savedChunks: entryChunks,
          savedAnchor: world?.walkAnchor,
          entities: world?.entities,
          npcs: simulatedNpcs,
          mobs: world?.mobs,
          seed: world?.seed,
          onNpcConversation: setConversation,
          onCreativeFlightChanged: setCreativeFlying,
          onInventoryToggle: () => {
            const next = !useUiStore.getState().creativeInventoryOpen;
            if (next) sceneRef.current?.releasePointerLock();
            setCreativeInventoryOpen(next);
          },
        });
        setNpcCount(sceneRef.current.getNpcCount());
        if (worldId && !findWalkEntryPin(world?.entities ?? {}, anchor)) {
          patchWorld(worldId, (draft) => {
            if (findWalkEntryPin(draft.entities, anchor)) return;
            const pin = createWalkEntryPin(draft.entities, anchor);
            draft.entities[pin.id] = pin;
          });
        }
        if (worldId) patchWorld(worldId, (draft) => { draft.npcs = simulatedNpcs; });
        confirmWalk();
      } catch (cause) {
        if (cancelled) return;
        console.error('[WalkOverlay] Unable to start walk mode:', cause);
        const message = walkErrorMessage(cause, 'Unable to start walk mode.');
        failTransition(message);
      }
    };
    void startWalkScene();
    return () => { cancelled = true; };
  }, [phase, anchor, entryChunks, activeWorldId, worlds, patchWorld, confirmWalk, failTransition]);

  useEffect(() => {
    if (phase !== 'ascending') return;

    try {
      const result = sceneRef.current?.dispose() ?? { chunks: {}, generatedChunks: [], npcs: {}, mobs: {} };
      sceneRef.current = null;
      setNpcCount(0);
      setCreativeFlying(false);

      if (activeWorldId) {
        patchWorld(activeWorldId, (w) => {
          w.voxelChunks = { ...(w.voxelChunks ?? {}), ...result.chunks };
          const visitedAt = Date.now();
          w.generatedVoxelChunks = { ...(w.generatedVoxelChunks ?? {}) };
          for (const key of result.generatedChunks) w.generatedVoxelChunks[key] = visitedAt;
          w.npcs = { ...(w.npcs ?? {}), ...result.npcs };
          w.mobs = { ...(w.mobs ?? {}), ...result.mobs };
          if (anchor) {
            w.walkAnchor = anchor;
            if (!findWalkEntryPin(w.entities, anchor)) {
              const pin = createWalkEntryPin(w.entities, anchor);
              w.entities[pin.id] = pin;
            }
          }
        });
      }
      returnToGlobe();
      setConversation(null);
    } catch (cause) {
      sceneRef.current = null;
      console.error('[WalkOverlay] Unable to finish walk mode:', cause);
      const message = walkErrorMessage(cause, 'Unable to finish walk mode.');
      failTransition(message);
    }
  }, [phase, anchor, activeWorldId, patchWorld, returnToGlobe, failTransition]);

  useEffect(() => () => {
    try { sceneRef.current?.dispose(); } catch (_) { /* Best-effort teardown during app unmount. */ }
    sceneRef.current = null;
  }, []);

  const isVisible = phase !== 'globe';
  const isTransitioning = phase === 'descending' || phase === 'ascending';

  return (
    <>
      <div
        className="pointer-events-none fixed inset-0 z-40 bg-black transition-opacity duration-500"
        style={{ opacity: isTransitioning || phase === 'error' ? 1 : 0 }}
      />
      <div
        ref={containerRef}
        className="fixed inset-0 z-30"
        style={{ display: isVisible ? 'block' : 'none' }}
      />
      {phase === 'walk' && (
        <>
          <div className="pointer-events-none fixed left-4 top-4 z-50 rounded-lg border border-white/15 bg-slate-950/75 px-3 py-1.5 text-xs font-semibold text-slate-200 backdrop-blur-sm">
            Citizens loaded: {npcCount}
          </div>
          {controllerName && (
            <div className="pointer-events-none fixed right-4 top-4 z-50 max-w-[18rem] rounded-lg border border-violet-300/25 bg-slate-950/80 px-3 py-2 text-[11px] leading-relaxed text-slate-300 backdrop-blur-sm">
              <div className="font-semibold text-violet-200">Controller connected</div>
              <div className="truncate text-[10px] text-slate-500">{controllerName}</div>
              <div>LS move · RS look · A jump · L3 toggle sprint</div>
              <div>RT break · LT use/place · LB/RB hotbar · D-pad ↑ fly</div>
              <div>Y inventory · D-pad navigate · A equip · B close</div>
            </div>
          )}
          {conversation && (
            <div
              className="fixed bottom-24 left-1/2 z-[70] w-[min(92vw,32rem)] -translate-x-1/2 rounded-xl border border-amber-300/30 bg-slate-950/95 p-4 text-slate-100 shadow-2xl backdrop-blur-md"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-bold text-amber-200">{conversation.npcName}</div>
                  <div className="text-[11px] uppercase tracking-wider text-slate-400">
                    {conversation.occupation} · {conversation.activity.replace('-', ' ')} · rapport {conversation.relationship}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    sceneRef.current?.closeNpcConversation(conversation.npcId);
                    setConversation(null);
                  }}
                  className="rounded-md px-2 py-1 text-xs text-slate-400 hover:bg-white/10 hover:text-white"
                >
                  Close
                </button>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-slate-200">{conversation.text}</p>
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {conversation.choices.map((choice) => (
                  <button
                    key={choice.id}
                    type="button"
                    onClick={() => {
                      setConversation(sceneRef.current?.respondToNpc(conversation.npcId, choice.id) ?? null);
                    }}
                    className="min-h-11 rounded-lg border border-amber-300/15 bg-amber-400/10 px-3 py-2 text-left text-xs font-semibold text-amber-100 hover:bg-amber-400/20"
                  >
                    {choice.label}
                  </button>
                ))}
              </div>
              <div className="mt-2 text-[10px] text-slate-500">E advances their story · Esc closes</div>
            </div>
          )}
          <div className="pointer-events-none fixed inset-0 z-40 grid place-items-center text-2xl font-bold text-white drop-shadow-lg">
            +
          </div>
          <div className="fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-end gap-2">
            <div className="flex gap-1 rounded-xl border border-white/20 bg-slate-950/85 p-1.5 shadow-xl backdrop-blur-sm">
              {hotbarBlocks.map((block, index) => (
                <button
                  key={`${index}-${block.id}`}
                  type="button"
                  onClick={() => selectHotbarSlot(index)}
                  aria-label={`Select ${block.name} block`}
                  className={`relative grid h-11 w-11 place-items-center rounded-lg border text-lg ${
                    activeHotbarIndex === index
                      ? 'border-sky-300 bg-sky-500/35'
                      : 'border-white/10 bg-white/5 hover:bg-white/15'
                  }`}
                >
                  <span>{block.icon}</span>
                  <span className="absolute left-1 top-0.5 text-[9px] text-slate-300">{index + 1}</span>
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => {
                sceneRef.current?.releasePointerLock();
                setCreativeInventoryOpen(true);
              }}
              className="rounded-full bg-slate-900/80 px-3 py-2 text-sm font-semibold text-sky-200 shadow-lg backdrop-blur-sm hover:bg-slate-800"
              title="Creative inventory (I)"
            >
              🎒 Inventory
            </button>
            <button
              type="button"
              onClick={() => setCreativeFlying(sceneRef.current?.toggleCreativeFlight() ?? false)}
              className={`rounded-full px-4 py-2 text-sm font-semibold shadow-lg backdrop-blur-sm ${
                creativeFlying
                  ? 'bg-violet-500 text-white hover:bg-violet-400'
                  : 'bg-slate-900/80 text-violet-300 hover:bg-slate-800'
              }`}
              title="Creative flight (F): Space rises, C descends"
            >
              {creativeFlying ? '✈ Flying' : '✈ Fly'}
            </button>
            <button
              type="button"
              onClick={beginAscent}
              className="rounded-full bg-slate-900/80 px-5 py-2 text-sm font-semibold text-sky-300 shadow-lg backdrop-blur-sm hover:bg-slate-800"
            >
              ↑ Return to Globe
            </button>
          </div>
        </>
      )}
      {phase === 'error' && (
        <div className="fixed inset-0 z-50 grid place-items-center p-6">
          <div className="max-w-md rounded-xl bg-slate-900 p-6 text-center shadow-2xl">
            <h2 className="text-lg font-semibold text-white">Walk mode stopped</h2>
            <p className="mt-2 text-sm text-slate-300">{error ?? 'An unexpected walk-mode error occurred.'}</p>
            <button
              onClick={returnToGlobe}
              className="mt-5 rounded-lg bg-sky-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-sky-400"
            >
              Return to Globe
            </button>
          </div>
        </div>
      )}
    </>
  );
}

/**
 * WalkOverlay — React component that manages the walk-mode lifecycle.
 */

import { useEffect, useRef, useCallback } from 'react';
import { useWalkStore } from '@/state/walkStore';
import { useWorldStore } from '@/state/worldStore';
import { WalkScene } from './WalkScene';
import { makeAnchor } from './GeoAnchor';
import { getViewer } from '@/globe/CesiumViewer';
import { Math as CesiumMath } from 'cesium';

let _scene: WalkScene | null = null;
let _rafId: number | null = null;
let _lastTime: number = 0;

export function WalkOverlay() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { phase, anchor, entryChunks, beginDescent, confirmWalk, beginAscent, confirmGlobe } =
    useWalkStore();
  const { activeWorldId, worlds, patchWorld } = useWorldStore();

  const descend = useCallback(() => {
    const cesiumViewer = getViewer();
    if (!cesiumViewer) return;
    const cam = cesiumViewer.camera;
    const cartographic = cam.positionCartographic;
    const lon = CesiumMath.toDegrees(cartographic.longitude);
    const lat = CesiumMath.toDegrees(cartographic.latitude);

    const worldId = activeWorldId;
    const world = worldId ? worlds[worldId] : null;
    const savedChunks = world?.voxelChunks ?? {};

    const newAnchor = makeAnchor(lon, lat);
    beginDescent(newAnchor, savedChunks);
  }, [activeWorldId, worlds, beginDescent]);

  useEffect(() => {
    (window as any).__voxelforgeDescend = descend;
    return () => { delete (window as any).__voxelforgeDescend; };
  }, [descend]);

  useEffect(() => {
    if (phase !== 'transitioning' || !anchor) return;
    if (_scene) return;

    const worldId = activeWorldId;
    const world = worldId ? worlds[worldId] : null;

    _scene = WalkScene.create({
      anchor,
      savedChunks: entryChunks,
      seed: world?.seed,
    });

    confirmWalk();
  }, [phase, anchor, entryChunks, activeWorldId, worlds, confirmWalk]);

  useEffect(() => {
    if (phase !== 'walk' || !_scene || !containerRef.current) return;

    _scene.mount(containerRef.current);
    _lastTime = performance.now();

    function loop(now: number) {
      const dt = Math.min((now - _lastTime) / 1000, 0.1);
      _lastTime = now;
      _scene?.tick(dt);
      _rafId = requestAnimationFrame(loop);
    }
    _rafId = requestAnimationFrame(loop);

    return () => {
      if (_rafId !== null) cancelAnimationFrame(_rafId);
      _rafId = null;
    };
  }, [phase]);

  const ascend = useCallback(() => {
    if (!_scene) return;
    beginAscent();

    const dirtyChunks = _scene.dispose();
    _scene = null;
    if (_rafId !== null) { cancelAnimationFrame(_rafId); _rafId = null; }

    if (activeWorldId) {
      patchWorld(activeWorldId, (w) => {
        w.voxelChunks = { ...(w.voxelChunks ?? {}), ...dirtyChunks };
        if (anchor) w.walkAnchor = anchor;
      });
    }

    confirmGlobe();
  }, [anchor, activeWorldId, patchWorld, beginAscent, confirmGlobe]);

  const isVisible = phase === 'walk' || phase === 'transitioning';

  return (
    <>
      <div
        className="pointer-events-none fixed inset-0 z-40 bg-black transition-opacity duration-500"
        style={{ opacity: phase === 'transitioning' ? 1 : 0 }}
      />
      <div
        ref={containerRef}
        className="fixed inset-0 z-30"
        style={{ display: isVisible ? 'block' : 'none' }}
      />
      {phase === 'walk' && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
          <button
            onClick={ascend}
            className="rounded-full bg-slate-900/80 px-6 py-2 text-sm font-semibold text-sky-300 shadow-lg backdrop-blur-sm hover:bg-slate-800"
          >
            ↑ Return to Globe
          </button>
        </div>
      )}
    </>
  );
}

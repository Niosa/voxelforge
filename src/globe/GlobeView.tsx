/**
 * GlobeView — mounts the Cesium viewer and syncs world state to the globe.
 * Subscribes to activeWorldId changes so the fantasy/earth flag and imagery
 * are updated whenever the user switches worlds.
 */
import { useEffect, useRef } from 'react';
import { useWorldStore } from '@/state/worldStore';
import {
  createTerraforgeViewer,
  destroyTerraforgeViewer,
  setFantasyWorldFlag,
  setGlobeImageryStyle,
  getCurrentImageryStyle,
  getViewer,
} from '@/globe/CesiumViewer';
import { syncEntitiesToCesium } from '@/globe/entitySync';
import { flyToWorldCamera } from '@/globe/camera';
import { WalkOverlay } from '@/walk/WalkOverlay';

// Heuristic: any world that is NOT the Real Earth preset is treated as fantasy.
function isFantasyWorld(world: { id: string; name: string }): boolean {
  return (
    world.id !== 'earth-preset' &&
    !world.name.toLowerCase().includes('real earth')
  );
}

export function GlobeView() {
  const containerRef = useRef<HTMLDivElement>(null);

  const activeWorldId = useWorldStore((s) => s.activeWorldId);
  const world = useWorldStore((s) => s.world);
  const selectedId = useWorldStore((s) => s.selectedId);

  // Mount Cesium once
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    createTerraforgeViewer(container);
    return () => { destroyTerraforgeViewer(); };
  }, []);

  // Re-sync whenever the active world changes (switch, preset load, persistence restore)
  useEffect(() => {
    if (!world) return;
    const fantasy = isFantasyWorld(world);
    setFantasyWorldFlag(fantasy);
    setGlobeImageryStyle(
      getCurrentImageryStyle(),
      world.entities,
      world.properties?.theme ?? 'medieval',
    );
    const v = getViewer();
    if (v) {
      syncEntitiesToCesium(v, world.entities, selectedId);
      flyToWorldCamera(v, world);
    }
  }, [activeWorldId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync entity edits on the current world
  useEffect(() => {
    const v = getViewer();
    if (!v || !world) return;
    syncEntitiesToCesium(v, world.entities, selectedId);
  }, [world.entities, selectedId]);

  // Auto-save on every world mutation
  useEffect(() => {
    useWorldStore.getState().saveActiveWorld().catch(() => {});
  }, [world]);

  return (
    <>
      <div
        ref={containerRef}
        className="absolute inset-0 h-full w-full"
        id="cesium-container"
      />
      <WalkOverlay />
    </>
  );
}

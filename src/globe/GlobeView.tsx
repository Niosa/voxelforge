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

/**
 * Returns true when the world should render as a fantasy/custom globe
 * (procedural tile imagery) rather than the real-Earth satellite basemap.
 *
 * Priority order:
 *  1. world.properties.sourcePresetId — stamped by loadSampleWorld; 'earth'
 *     is the only preset that means Real Earth.
 *  2. Legacy hard-coded id 'earth-preset' (initial default world).
 *  3. Name heuristic for worlds imported/created outside loadSampleWorld.
 */
function isFantasyWorld(world: { id: string; name: string; properties?: Record<string, any> }): boolean {
  const src = world.properties?.sourcePresetId as string | undefined;
  if (src !== undefined) {
    // Only the 'earth' preset is a real-Earth world.
    return src !== 'earth';
  }
  // Fallback for the initial built-in earth world and any world created
  // before sourcePresetId was introduced.
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

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
  updateFantasyImageryEntities,
  getViewer,
} from '@/globe/CesiumViewer';
import { syncEntitiesToCesium, resetEntitySyncState } from '@/globe/entitySync';
import { flyToWorldCamera } from '@/globe/camera';
import {
  clearWalkVoxelGlobeOverlay,
  syncWalkVoxelsToGlobe,
} from '@/globe/walkVoxelGlobeOverlay';

/**
 * Returns true when the world should render as a fantasy/custom globe
 * (procedural tile imagery) rather than the real-Earth satellite basemap.
 */
function isFantasyWorld(_world?: { id: string; name: string; properties?: Record<string, any> }): boolean {
  return true;
}

export function GlobeView() {
  const containerRef = useRef<HTMLDivElement>(null);

  // Fix D: subscribe to activeWorldId and entities directly to avoid stale
  // references from the immer-backed world getter.
  const activeWorldId = useWorldStore((s) => s.activeWorldId);
  const world = useWorldStore((s) => s.worlds[s.activeWorldId!] ?? s.world);
  const worldEntities = useWorldStore((s) => s.worlds[s.activeWorldId!]?.entities ?? {});
  const worldUpdatedAt = useWorldStore((s) => s.worlds[s.activeWorldId!]?.updatedAt);
  const voxelChunks = useWorldStore((s) => s.worlds[s.activeWorldId!]?.voxelChunks);
  const generatedVoxelChunks = useWorldStore((s) => s.worlds[s.activeWorldId!]?.generatedVoxelChunks);
  const selectedId = useWorldStore((s) => s.selectedId);

  // Mount Cesium once. DrawController lifecycle is owned exclusively by
  // AppShell (init on mount, destroy on unmount) — do NOT call init() here,
  // that would create a duplicate handler lifecycle conflict.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    createTerraforgeViewer(container);
    return () => {
      const viewer = getViewer();
      if (viewer) clearWalkVoxelGlobeOverlay(viewer);
      destroyTerraforgeViewer();
    };
  }, []);

  /**
   * Fix C: World-SWITCH effect — fires only when the active world actually
   * changes (different id). Performs a full teardown + imagery reset + camera
   * fly. Does NOT fire on entity edits (updatedAt changes) so the camera
   * doesn't fly away every time the user draws something.
   */
  useEffect(() => {
    if (!world) return;
    const fantasy = isFantasyWorld(world);
    const theme = world.properties?.theme ?? 'medieval';
    setFantasyWorldFlag(fantasy);
    const v = getViewer();
    if (v && !v.isDestroyed()) {
      resetEntitySyncState();
      v.entities.removeAll();
      setGlobeImageryStyle(
        getCurrentImageryStyle(),
        worldEntities,
        theme,
      );
      syncEntitiesToCesium(v, worldEntities, selectedId);
      flyToWorldCamera(v, world);
      v.scene.requestRender();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorldId, world?.id]);

  /**
   * Fix C (part 2): Entity-edit effect — fires when entities change OR
   * when updatedAt changes (e.g. after async persistence load). Does NOT
   * call flyToWorldCamera so the camera stays where the user is looking.
   */
  useEffect(() => {
    if (!world) return;
    const v = getViewer();
    if (!v || v.isDestroyed()) return;
    // On persistence load (updatedAt change without id change), do a full
    // re-sync so freshly loaded entities appear. No camera fly.
    syncEntitiesToCesium(v, worldEntities, selectedId);
    v.scene.requestRender();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [worldEntities, worldUpdatedAt, selectedId]);

  // Selection only changes Cesium entity styling. Rebuilding the imagery layer
  // for every selection was a particularly expensive no-op on touch devices.
  useEffect(() => {
    if (!world) return;
    const v = getViewer();
    if (!v || v.isDestroyed()) return;
    updateFantasyImageryEntities(worldEntities, world.properties?.theme ?? 'medieval');
    v.scene.requestRender();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [worldEntities, worldUpdatedAt]);

  useEffect(() => {
    const viewer = getViewer();
    if (!viewer || viewer.isDestroyed()) return;
    const sync = () => {
      if (viewer.isDestroyed()) return;
      syncWalkVoxelsToGlobe(viewer, voxelChunks, worldEntities, world?.seed, generatedVoxelChunks);
    };
    sync();
    viewer.camera.moveEnd.addEventListener(sync);
    return () => {
      // React Strict Mode may run the viewer-owning effect's cleanup first.
      if (!viewer.isDestroyed()) viewer.camera.moveEnd.removeEventListener(sync);
    };
  }, [activeWorldId, voxelChunks, generatedVoxelChunks, worldEntities, world?.seed]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 h-full w-full"
      id="cesium-container"
      style={{ minWidth: 2, minHeight: 2 }}
    />
  );
}

import { useEffect, useRef, useState } from 'react';
import { ScreenSpaceEventHandler, ScreenSpaceEventType, Cartesian2, Cartographic, Math as CesiumMath } from 'cesium';
import {
  createTerraforgeViewer,
  getViewer,
} from '@/globe/CesiumViewer';
import { useWorldStore } from '@/state/worldStore';
import { useUiStore } from '@/state/uiStore';
import { syncEntitiesToCesium } from '@/globe/entitySync';
import { getEntityArea } from '@/geo/geometryArea';
import type { TerraEntity } from '@/entities/types';
import { MobileTouchOverlay } from '@/ui/firstPerson/MobileTouchOverlay';
import { drawController } from '@/drawing/DrawController';

function isPointInPolygonRing(pt: [number, number], ring: number[][]): boolean {
  let inside = false;
  const x = pt[0], y = pt[1];
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i]![0], yi = ring[i]![1];
    const xj = ring[j]![0], yj = ring[j]![1];
    const intersect = ((yi > y) !== (yj > y)) &&
      (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

/** Containment for a polygon part: inside the outer ring but NOT inside any hole. */
function isPointInPolygonWithHoles(pt: [number, number], rings: number[][][]): boolean {
  const outer = rings[0];
  if (!outer || !isPointInPolygonRing(pt, outer)) return false;
  for (let i = 1; i < rings.length; i++) {
    const hole = rings[i];
    if (hole && hole.length > 2 && isPointInPolygonRing(pt, hole)) return false;
  }
  return true;
}

const TYPE_PRIORITY: Record<string, number> = {
  landmark: 90,
  city: 80,
  town: 70,
  region: 50,
  island: 30,
  continent: 10,
};

interface RankContext {
  lon?: number;
  lat?: number;
  directIds?: Set<string>;
}

function rankCandidates(
  candidateIds: string[],
  worldEntities: Record<string, TerraEntity>,
  ctx: RankContext = {},
): string | null {
  const valid = Array.from(new Set(candidateIds.filter((id) => Boolean(worldEntities[id]))));
  if (valid.length === 0) return null;

  // Lexicographic sort key, ascending. Tuples compared element by element.
  const sortKey = (ent: TerraEntity): [number, number, number, number] => {
    const typePrio = TYPE_PRIORITY[ent.type] ?? 40;
    if (ent.geometry.type === 'Point') {
      // Pins/landmarks/cities are precise point targets — always rank above
      // any polygon fill covering the same spot. Direct billboard hits beat
      // proximity-fallback hits, then closest to the click, then type priority.
      const direct = ctx.directIds?.has(ent.id) ? 1 : 0;
      let dist = Number.MAX_VALUE;
      if (ctx.lon !== undefined && ctx.lat !== undefined) {
        const [pLon, pLat] = ent.geometry.coordinates;
        dist = Math.hypot(pLon - ctx.lon, pLat - ctx.lat);
      }
      return [0, -direct, dist, -typePrio];
    }
    // Overlapping landmasses: the most specific (smallest actual area)
    // territory at the click point always wins over any larger container,
    // regardless of entity type. Type priority is only a last-resort tiebreak.
    return [1, getEntityArea(ent), -typePrio, 0];
  };

  valid.sort((a, b) => {
    const ka = sortKey(worldEntities[a]!);
    const kb = sortKey(worldEntities[b]!);
    for (let i = 0; i < ka.length; i++) {
      const d = ka[i]! - kb[i]!;
      if (d !== 0) return d;
    }
    return 0;
  });

  return valid[0] ?? null;
}

export function GlobeView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const entities = useWorldStore((s) => s.world.entities);
  const selectedId = useWorldStore((s) => s.selectedId);
  const select = useWorldStore((s) => s.select);
  const tool = useUiStore((s) => s.tool);
  const [globeError, setGlobeError] = useState<string | null>(null);

  useEffect(() => {
    // NOTE: No mount-once guard here on purpose. In React 18 Strict Mode the
    // sequence is: effect → cleanup → effect. createTerraforgeViewer() already
    // self-guards and returns the existing viewer on the second run, while the
    // cleanup destroys the ScreenSpaceEventHandler. Guarding the effect body
    // would leave the canvas with NO click handler after Strict Mode's
    // double-invocation — permanently killing click-to-select in dev.
    const el = containerRef.current;
    if (!el) return;

    let handler: ScreenSpaceEventHandler | null = null;
    try {
      const viewer = createTerraforgeViewer(el);
      drawController.init();

      handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
      const handlePick = (position: Cartesian2) => {
        const currentTool = useUiStore.getState().tool;
        if (currentTool !== 'select' && currentTool !== 'pan') return;

        const candidateIds: string[] = [];
        const directIds = new Set<string>();
        let clickLon: number | undefined;
        let clickLat: number | undefined;
        const pickedList = viewer.scene.drillPick(position);
        const worldEntities = useWorldStore.getState().world.entities;

        // Candidates picked directly by Cesium (billboards, labels, top-most fills).
        // NOTE: ground-clamped polygon fills are batched, so drillPick often only
        // returns the top-most fill — nested polygons underneath are recovered
        // via the geographic containment fallback below.
        const addDirect = (id: string | undefined | null) => {
          if (!id) return;
          candidateIds.push(id);
          directIds.add(id);
        };

        if (pickedList && pickedList.length > 0) {
          for (const picked of pickedList) {
            if (!picked) continue;
            const pid = picked.id;
            const prim = picked.primitive;

            if (pid) {
              if (typeof pid === 'string') {
                addDirect(pid);
              } else if (typeof pid === 'object') {
                addDirect((pid as any).terraEntityId || pid.id);
              }
            }

            if (prim) {
              if (prim.id) {
                if (typeof prim.id === 'string') {
                  addDirect(prim.id);
                } else if (typeof prim.id === 'object') {
                  addDirect((prim.id as any).terraEntityId || prim.id.id);
                }
              }
              if (prim._entity) {
                addDirect((prim._entity as any).terraEntityId || prim._entity.id);
              }
            }
          }
        }

        // Always also check Geographic Containment & Proximity Raycast for any missing polygon/point hits
        try {
          const ray = viewer.camera.getPickRay(position);
          const cartesian = ray ? viewer.scene.globe.pick(ray, viewer.scene) : null;
          if (cartesian) {
            const carto = Cartographic.fromCartesian(cartesian);
            const lon = CesiumMath.toDegrees(carto.longitude);
            const lat = CesiumMath.toDegrees(carto.latitude);
            clickLon = lon;
            clickLat = lat;

            // 1. Check point-in-polygon for all polygon entities
            for (const ent of Object.values(worldEntities)) {
              if (!ent || !ent.geometry) continue;
              const geom = ent.geometry;
              if (geom.type === 'Polygon') {
                if (isPointInPolygonWithHoles([lon, lat], geom.coordinates as number[][][])) {
                  candidateIds.push(ent.id);
                }
              } else if (geom.type === 'MultiPolygon') {
                for (const poly of geom.coordinates) {
                  if (isPointInPolygonWithHoles([lon, lat], poly as number[][][])) {
                    candidateIds.push(ent.id);
                  }
                }
              }
            }

            // 2. Check proximity for point entities
            for (const ent of Object.values(worldEntities)) {
              if (!ent || !ent.geometry || ent.geometry.type !== 'Point') continue;
              const [pLon, pLat] = ent.geometry.coordinates;
              const dist = Math.hypot(pLon - lon, pLat - lat);
              if (dist < 0.08) {
                candidateIds.push(ent.id);
              }
            }
          }
        } catch (e) {
          console.warn('Geographic fallback pick warning:', e);
        }

        const bestId = rankCandidates(candidateIds, worldEntities, {
          lon: clickLon,
          lat: clickLat,
          directIds,
        });
        select(bestId);

        // Prevent Cesium default selection box & camera pivot auto-centering
        viewer.selectedEntity = undefined as any;
        viewer.trackedEntity = undefined as any;
      };

      handler.setInputAction((m: { position: Cartesian2 }) => handlePick(m.position), ScreenSpaceEventType.LEFT_CLICK);
      handler.setInputAction((m: { position: Cartesian2 }) => handlePick(m.position), ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
    } catch (err) {
      console.error('[GlobeView] Cesium init failed:', err);
      setGlobeError(err instanceof Error ? err.message : String(err));
    }

    return () => {
      // Only clean up the event handler — never destroy the viewer here.
      // Destroying the viewer on Strict Mode cleanup breaks the second invocation.
      try { handler?.destroy(); } catch (_) { /* ignore */ }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount once
  }, []);

  useEffect(() => {
    const viewer = getViewer();
    if (!viewer) return;
    syncEntitiesToCesium(viewer, entities, selectedId);
  }, [entities, selectedId]);

  void tool;

  // Always keep the Cesium container div in the DOM — removing it while Cesium
  // is rendering to it causes React tree mismatches and crashes the page.
  // Overlay the error panel on top instead.
  return (
    <div className="absolute inset-0 touch-none" data-testid="globe-canvas">
      <div ref={containerRef} className="absolute inset-0" />
      <MobileTouchOverlay />
      {globeError && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-slate-950/95 text-slate-100 p-8">
          <div className="text-5xl">🌐</div>
          <h2 className="text-lg font-bold text-red-400">Globe Failed to Load</h2>
          <p className="text-xs text-slate-400 text-center max-w-md">
            Cesium WebGL could not initialize. Check the browser console for details.
          </p>
          <pre className="max-w-lg overflow-auto rounded-lg bg-slate-900 p-3 text-xs text-red-300 border border-red-900">
            {globeError}
          </pre>
        </div>
      )}
    </div>
  );
}

import {
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  Cartesian2,
  Cartesian3,
  Cartographic,
  Math as CesiumMath,
  Color,
  Entity,
  HeightReference,
  CallbackProperty,
} from 'cesium';
import { getViewer } from '@/globe/CesiumViewer';
import { useUiStore } from '@/state/uiStore';
import { useWorldStore } from '@/state/worldStore';
import { history } from '@/state/history/HistoryStack';
import { AddEntityCommand, UpdateEntityCommand } from '@/state/history/commands';
import { createEntity } from '@/entities/factory';
import type { TerraEntity, TerraGeometry } from '@/entities/types';
import { eraseRingFromGeometry } from '@/geo/polygonOps';

import { getActiveDesignConfig } from '@/ui/tools/DesignAssistPanel';
import { generateDesignAssistEntity } from '@/geo/designAssistGenerator';

import { processSmartBorders } from '@/geo/smartBorders';
import { syncEntitiesToCesium } from '@/globe/entitySync';
import { resolvePickedWorldEntityId } from '@/globe/entityPicking';
import type { EntityType } from '@/entities/types';
import { buildCreationProperties } from '@/drawing/creationProperties';

export { estimateSettlementPopulation } from '@/drawing/creationProperties';

function getDefaultColorForType(type: EntityType): string {
  switch (type) {
    case 'city': return '#fb7185';
    case 'town': return '#f59e0b';
    case 'landmark': return '#a855f7';
    case 'region': return '#38bdf8';
    case 'island': return '#34d399';
    case 'continent': return '#2dd4bf';
    case 'custom': default: return '#6366f1';
  }
}

function getDefaultNameForType(type: EntityType, count: number): string {
  const cap = type.charAt(0).toUpperCase() + type.slice(1);
  return `${cap} ${count}`;
}

export function simplifyRingPoints(points: [number, number][], minDistanceDeg?: number): [number, number][] {
  if (points.length <= 4) return points;
  const lons = points.map((point) => point[0]);
  const lats = points.map((point) => point[1]);
  const drawingSpan = Math.hypot(Math.max(...lons) - Math.min(...lons), Math.max(...lats) - Math.min(...lats));
  const threshold = minDistanceDeg ?? Math.max(0.00001, Math.min(0.0003, drawingSpan / 30));
  const result: [number, number][] = [points[0]!];
  let last = points[0]!;

  for (let i = 1; i < points.length - 1; i++) {
    const pt = points[i]!;
    const dist = Math.hypot(pt[0] - last[0], pt[1] - last[1]);
    if (dist >= threshold) {
      result.push(pt);
      last = pt;
    }
  }
  result.push(points[points.length - 1]!);
  return result;
}

export class DrawController {
  private handler: ScreenSpaceEventHandler | null = null;
  private currentPoints: [number, number][] = [];
  private previewEntities: Entity[] = [];
  private active = false;
  private isFreehandDrawing = false;
  private freehandCandidate = false;
  private freehandStartPoint: [number, number] | null = null;
  private lastFreehandScreenPoint: { x: number; y: number } | null = null;
  private lastPointerDownPos: { x: number; y: number } | null = null;
  private lastProcessedClickTime = 0;

  private activeCanvas: HTMLCanvasElement | null = null;
  private boundPointerDown: ((e: PointerEvent) => void) | null = null;
  private boundPointerUp: ((e: PointerEvent) => void) | null = null;

  init(): void {
    const viewer = getViewer();
    if (!viewer) return;

    if (this.handler && !this.handler.isDestroyed()) {
      try { this.handler.destroy(); } catch (_) { /* ignore */ }
    }

    if (this.activeCanvas && this.boundPointerDown && this.boundPointerUp) {
      try {
        this.activeCanvas.removeEventListener('pointerdown', this.boundPointerDown);
        this.activeCanvas.removeEventListener('pointerup', this.boundPointerUp);
      } catch (_) { /* ignore */ }
    }

    const canvas = viewer.scene.canvas;
    this.activeCanvas = canvas;
    this.handler = new ScreenSpaceEventHandler(canvas);

    const executeClickAction = (clickPos: Cartesian2) => {
      const now = Date.now();
      if (now - this.lastProcessedClickTime < 150) return; // Deduplicate
      this.lastProcessedClickTime = now;

      const mode = useUiStore.getState().tool;
      if (mode === 'select') {
        let picked: unknown;
        try {
          picked = viewer.scene.pick(clickPos);
        } catch (_) {
          picked = undefined;
        }

        const state = useWorldStore.getState();
        const entityId = resolvePickedWorldEntityId(
          picked,
          new Set(Object.keys(state.world.entities)),
        );
        state.select(entityId);
        return;
      }
      if (mode !== 'drawPolygon' && mode !== 'placePoint' && mode !== 'designAssist' && mode !== 'addPart' && mode !== 'eraseRegion') return;

      const pos = this.pickGlobePosition(clickPos);
      if (!pos) return;
      const [lon, lat] = pos;

      if (mode === 'placePoint') {
        this.handlePlaceCity(lon, lat);
      } else if (mode === 'drawPolygon' || mode === 'addPart' || mode === 'eraseRegion') {
        this.freehandCandidate = false;
        this.freehandStartPoint = null;
        this.addPolygonVertex(lon, lat);
      } else if (mode === 'designAssist') {
        this.handleDesignAssistStamp(lon, lat);
      }
    };

    // 1. Fallback Cesium LEFT_CLICK
    this.handler.setInputAction((movement: { position: Cartesian2 }) => {
      executeClickAction(movement.position);
    }, ScreenSpaceEventType.LEFT_CLICK);

    // 2. LEFT_DOWN: Track press position & start freehand
    this.handler.setInputAction((movement: { position: Cartesian2 }) => {
      this.lastPointerDownPos = { x: movement.position.x, y: movement.position.y };

      const mode = useUiStore.getState().tool;
      if (mode !== 'freehandDraw' && mode !== 'addPart') return;

      const pos = this.pickGlobePosition(movement.position);
      if (!pos) return;
      const [lon, lat] = pos;

      if (mode === 'addPart') {
        this.freehandCandidate = true;
        this.freehandStartPoint = [lon, lat];
        return;
      }

      this.isFreehandDrawing = true;
      this.clearPreview();
      this.currentPoints.push([lon, lat]);
      this.lastFreehandScreenPoint = { x: movement.position.x, y: movement.position.y };

      viewer.scene.screenSpaceCameraController.enableRotate = false;
      viewer.scene.screenSpaceCameraController.enableTranslate = false;
    }, ScreenSpaceEventType.LEFT_DOWN);

    // 3. MOUSE_MOVE: Freehand drawing & drag check
    this.handler.setInputAction((movement: { endPosition: Cartesian2 }) => {
      const mode = useUiStore.getState().tool;

      const pos = this.pickGlobePosition(movement.endPosition);
      if (!pos) return;
      const [lon, lat] = pos;

      if (this.freehandCandidate && mode === 'addPart' && this.freehandStartPoint) {
        const startScreen = this.lastPointerDownPos;
        if (startScreen && Math.hypot(
          movement.endPosition.x - startScreen.x,
          movement.endPosition.y - startScreen.y,
        ) < 5) return;
        this.freehandCandidate = false;
        this.freehandStartPoint = null;
        this.isFreehandDrawing = true;
        this.clearPreview();
        this.currentPoints.push([lon, lat]);
        this.lastFreehandScreenPoint = { x: movement.endPosition.x, y: movement.endPosition.y };
        viewer.scene.screenSpaceCameraController.enableRotate = false;
        viewer.scene.screenSpaceCameraController.enableTranslate = false;
      }

      if (!this.isFreehandDrawing) return;
      if (mode !== 'freehandDraw' && mode !== 'addPart') return;

      if (this.lastFreehandScreenPoint) {
        const screenDistance = Math.hypot(
          movement.endPosition.x - this.lastFreehandScreenPoint.x,
          movement.endPosition.y - this.lastFreehandScreenPoint.y,
        );
        if (screenDistance < 5) return;
      }

      this.currentPoints.push([lon, lat]);
      this.lastFreehandScreenPoint = { x: movement.endPosition.x, y: movement.endPosition.y };
      this.updatePolylinePreview();
      viewer.scene.requestRender();
    }, ScreenSpaceEventType.MOUSE_MOVE);

    // 4. LEFT_UP: Check if press-and-release was a click (< 30px drag)
    this.handler.setInputAction((movement: { position: Cartesian2 }) => {
      if (this.lastPointerDownPos) {
        const dx = movement.position.x - this.lastPointerDownPos.x;
        const dy = movement.position.y - this.lastPointerDownPos.y;
        const dist = Math.hypot(dx, dy);
        this.lastPointerDownPos = null;

        if (dist < 32 && !this.isFreehandDrawing) {
          executeClickAction(movement.position);
        }
      }

      this.freehandCandidate = false;
      this.freehandStartPoint = null;
      this.lastFreehandScreenPoint = null;
      if (!this.isFreehandDrawing) return;
      this.isFreehandDrawing = false;

      viewer.scene.screenSpaceCameraController.enableRotate = true;
      viewer.scene.screenSpaceCameraController.enableTranslate = true;

      if (this.currentPoints.length >= 3) {
        this.finishPolygon();
      } else {
        this.clearPreview();
      }
      viewer.scene.requestRender();
    }, ScreenSpaceEventType.LEFT_UP);

    // 5. Native Touch & Pointer Event Direct Fallback Listener on Canvas
    let nativeDownPos: { x: number; y: number; time: number } | null = null;

    this.boundPointerDown = (e: PointerEvent) => {
      nativeDownPos = { x: e.clientX, y: e.clientY, time: Date.now() };
    };

    this.boundPointerUp = (e: PointerEvent) => {
      if (!nativeDownPos) return;
      const down = nativeDownPos;
      nativeDownPos = null;

      const dx = e.clientX - down.x;
      const dy = e.clientY - down.y;
      const dist = Math.hypot(dx, dy);
      const dt = Date.now() - down.time;

      const isTouch = e.pointerType === 'touch' || e.pointerType === 'pen';
      const maxDist = isTouch ? 38 : 20;

      if (dist <= maxDist && dt < 500 && !this.isFreehandDrawing) {
        const rect = canvas.getBoundingClientRect();
        const clickPos = new Cartesian2(e.clientX - rect.left, e.clientY - rect.top);
        executeClickAction(clickPos);
      }
    };

    canvas.addEventListener('pointerdown', this.boundPointerDown, { passive: true });
    canvas.addEventListener('pointerup', this.boundPointerUp, { passive: true });

    // 6. DOUBLE_CLICK: Finish polygon
    this.handler.setInputAction(() => {
      const mode = useUiStore.getState().tool;
      if (mode === 'drawPolygon' || mode === 'addPart' || mode === 'eraseRegion') {
        this.finishPolygon();
      }
    }, ScreenSpaceEventType.LEFT_DOUBLE_CLICK);

    this.active = true;
  }

  private pickGlobePosition(position: Cartesian2): [number, number] | null {
    const viewer = getViewer();
    if (!viewer) return null;

    let cartesian: Cartesian3 | undefined;
    try {
      const ray = viewer.camera.getPickRay(position);
      if (ray) {
        cartesian = viewer.scene.globe.pick(ray, viewer.scene) || undefined;
      }
    } catch (_) { /* ignore */ }

    if (!cartesian) {
      cartesian = viewer.camera.pickEllipsoid(position, viewer.scene.globe.ellipsoid) || undefined;
    }
    if (!cartesian) return null;

    const carto = Cartographic.fromCartesian(cartesian);
    return [CesiumMath.toDegrees(carto.longitude), CesiumMath.toDegrees(carto.latitude)];
  }

  destroy(): void {
    if (this.handler) {
      this.handler.destroy();
      this.handler = null;
    }
    this.clearPreview();
    this.active = false;
    this.isFreehandDrawing = false;
  }

  getPointsCount(): number {
    return this.currentPoints.length;
  }

  isActive(): boolean {
    return this.active;
  }

  addPolygonVertex(lon: number, lat: number): void {
    const viewer = getViewer();
    if (!viewer) return;

    this.currentPoints.push([lon, lat]);

    // Add point marker preview
    const ptEntity = viewer.entities.add({
      position: Cartesian3.fromDegrees(lon, lat),
      point: {
        pixelSize: 10,
        color: Color.CYAN,
        outlineColor: Color.WHITE,
        outlineWidth: 2,
        heightReference: HeightReference.CLAMP_TO_GROUND,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    });
    this.previewEntities.push(ptEntity);

    // Update polyline preview
    if (this.currentPoints.length >= 2) {
      this.updatePolylinePreview();
    }
    viewer.scene.requestRender();
  }

  finishPolygon(): void {
    if (this.currentPoints.length < 3) {
      alert('A polygon requires at least 3 vertices on the globe!');
      return;
    }

    // Simplify freehand touch points to clean 20-30 vertex rings
    const simplified = simplifyRingPoints(this.currentPoints);
    const ring = [...simplified];
    // Close the ring
    const first = ring[0];
    if (first) {
      ring.push([first[0], first[1]]);
    }

    const activeMode = useUiStore.getState().tool;

    // Island tool: create a standalone, individually labeled island entity.
    // Erase tool: subtract the ring from the SELECTED landmass. Both stay in
    // their tool so the user can keep drawing in one session.
    if (activeMode === 'addPart' || activeMode === 'eraseRegion') {
      if (activeMode === 'addPart') {
        this.finishIsland(ring);
      } else {
        this.applyEraseToSelectedEntity(ring);
      }
      this.clearPreview();
      const viewer = getViewer();
      if (viewer) viewer.scene.requestRender();
      return;
    }

    const rawGeometry: TerraGeometry = {
      type: 'Polygon',
      coordinates: [ring],
    };

    const uiState = useUiStore.getState();
    const type = uiState.creationEntityType || 'continent';
    const smartBorders = uiState.smartBordersEnabled;
    const worldEntities = useWorldStore.getState().world.entities;

    let processedGeom: TerraGeometry = rawGeometry;
    let parentId: string | null = null;

    if (smartBorders) {
      const res = processSmartBorders(rawGeometry, worldEntities);
      processedGeom = res.geometry;
      parentId = res.parentId;
    }

    const count = Object.keys(worldEntities).length + 1;
    const name = getDefaultNameForType(type, count);
    const color = getDefaultColorForType(type);

    const newEntity = createEntity({
      type,
      name,
      description: `A custom drawn ${type} landmass.`,
      color,
      fillOpacity: type === 'city' || type === 'town' || type === 'landmark' ? 0.8 : 0.5,
      geometry: processedGeom,
      parentId,
      properties: buildCreationProperties(type, uiState.creationSettings, ring),
    });

    history.execute(new AddEntityCommand(newEntity));
    useWorldStore.getState().select(newEntity.id);

    const viewer = getViewer();
    if (viewer) {
      const updatedEntities = useWorldStore.getState().world.entities;
      syncEntitiesToCesium(viewer, updatedEntities, newEntity.id);
      viewer.scene.requestRender();
    }

    useUiStore.getState().setTool('select');
    this.clearPreview();
  }

  cancelDrawing(): void {
    const viewer = getViewer();
    if (viewer) {
      viewer.scene.screenSpaceCameraController.enableRotate = true;
      viewer.scene.screenSpaceCameraController.enableTranslate = true;
      viewer.scene.requestRender();
    }
    this.isFreehandDrawing = false;
    this.freehandCandidate = false;
    this.freehandStartPoint = null;
    this.lastFreehandScreenPoint = null;
    this.clearPreview();
    useUiStore.getState().setTool('select');
  }

  /**
   * Applies a finished eraser ring to the currently selected landmass via
   * boolean difference: interior ring → hole; edge-crossing ring → cutback;
   * severing ring → split into MultiPolygon. Applied as an undoable
   * UpdateEntityCommand.
   */
  private applyEraseToSelectedEntity(ring: [number, number][]): void {
    const worldState = useWorldStore.getState();
    const selected = worldState.selectedId
      ? worldState.world.entities[worldState.selectedId]
      : undefined;
    if (!selected || (selected.geometry.type !== 'Polygon' && selected.geometry.type !== 'MultiPolygon')) {
      alert('Select a landmass (continent, region or island) first, then draw.');
      return;
    }

    const next = eraseRingFromGeometry(selected.geometry, ring);

    if (!next) {
      alert('Erase removed the entire landmass — nothing remains. Use Delete to remove it instead.');
      return;
    }

    history.execute(new UpdateEntityCommand(selected.id, { geometry: next }));
  }

  /**
   * Completes an island drawn with the Island tool (hotkey 7). The island is
   * its own entity of type 'island' — so it gets its own label and is renamed
   * / recolored / deleted in the Inspector like any other landmass. When a
   * landmass is selected, the island is linked via parentId and inherits its
   * color and biome so it visually belongs to the same landmass; selecting a
   * previously drawn island chains the next one as a sibling of the same parent.
   * The tool stays active so a whole archipelago can be drawn in one session.
   */
  private finishIsland(ring: [number, number][]): void {
    const worldState = useWorldStore.getState();
    const entities = worldState.world.entities;
    const selected = worldState.selectedId ? entities[worldState.selectedId] : undefined;

    let parent: TerraEntity | undefined;
    if (selected && selected.geometry.type !== 'Point') {
      if (selected.type === 'island' && selected.parentId && entities[selected.parentId]) {
        parent = entities[selected.parentId];
      } else {
        parent = selected;
      }
    }

    const islandCount = Object.values(entities).filter((e) => e.type === 'island').length;
    const newIsland = createEntity({
      type: 'island',
      name: `Island ${islandCount + 1}`,
      description: parent ? `An island of ${parent.name}.` : 'A custom drawn island landmass.',
      color: parent ? parent.color : getDefaultColorForType('island'),
      fillOpacity: parent ? parent.fillOpacity : 0.5,
      geometry: { type: 'Polygon', coordinates: [ring] },
      parentId: parent ? parent.id : null,
    });

    // Inherit biome styling so the island blends into the parent landmass
    if (parent) {
      for (const key of ['biome', 'topography', 'climate'] as const) {
        const value = parent.properties[key];
        if (value !== undefined) newIsland.properties[key] = value;
      }
    }

    history.execute(new AddEntityCommand(newIsland));
    useWorldStore.getState().select(newIsland.id);
  }

  private handlePlaceCity(lon: number, lat: number): void {
    const uiState = useUiStore.getState();
    const type = uiState.creationEntityType || 'city';
    const worldEntities = useWorldStore.getState().world.entities;
    const smartBorders = uiState.smartBordersEnabled;

    const rawGeom: TerraGeometry = { type: 'Point', coordinates: [lon, lat] };
    let parentId: string | null = null;

    if (smartBorders) {
      const res = processSmartBorders(rawGeom, worldEntities);
      parentId = res.parentId;
    }

    const count = Object.keys(worldEntities).length + 1;
    const name = getDefaultNameForType(type, count);
    const color = getDefaultColorForType(type);

    const newCity = createEntity({
      type,
      name,
      description: `A newly founded ${type}.`,
      color,
      fillOpacity: 1,
      geometry: rawGeom,
      parentId,
      properties: buildCreationProperties(type, uiState.creationSettings),
    });

    history.execute(new AddEntityCommand(newCity));
    useWorldStore.getState().select(newCity.id);

    const viewer = getViewer();
    if (viewer) {
      const updatedEntities = useWorldStore.getState().world.entities;
      syncEntitiesToCesium(viewer, updatedEntities, newCity.id);
    }

    useUiStore.getState().setTool('select');
  }

  private handleDesignAssistStamp(lon: number, lat: number): void {
    const uiState = useUiStore.getState();
    const type = uiState.creationEntityType || 'continent';
    const worldEntities = useWorldStore.getState().world.entities;
    const smartBorders = uiState.smartBordersEnabled;

    const config = getActiveDesignConfig();
    const entity = generateDesignAssistEntity(lon, lat, config);
    entity.type = type;

    if (smartBorders) {
      const res = processSmartBorders(entity.geometry, worldEntities, entity.id);
      entity.geometry = res.geometry;
      entity.parentId = res.parentId;
    }

    history.execute(new AddEntityCommand(entity));
    useWorldStore.getState().select(entity.id);
    useUiStore.getState().setTool('select');
  }

  private updatePolylinePreview(): void {
    const viewer = getViewer();
    if (!viewer) return;

    // Remove old polylines
    const oldLines = this.previewEntities.filter((e) => e.polyline);
    for (const l of oldLines) {
      viewer.entities.remove(l);
    }
    this.previewEntities = this.previewEntities.filter((e) => !e.polyline);

    const positions = this.currentPoints.map(([lng, lt]) =>
      Cartesian3.fromDegrees(lng, lt),
    );

    const polylineEntity = viewer.entities.add({
      polyline: {
        positions: new CallbackProperty(() => positions, false),
        width: 3.5,
        material: Color.CYAN,
        clampToGround: true,
      },
    });
    this.previewEntities.push(polylineEntity);
    viewer.scene.requestRender();
  }

  private clearPreview(): void {
    const viewer = getViewer();
    if (viewer) {
      for (const entity of this.previewEntities) {
        viewer.entities.remove(entity);
      }
      viewer.scene.requestRender();
    }
    this.previewEntities = [];
    this.currentPoints = [];
    this.lastFreehandScreenPoint = null;
  }
}

export const drawController = new DrawController();

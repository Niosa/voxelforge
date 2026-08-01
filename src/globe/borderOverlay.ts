import {
  Viewer,
  Color,
  Cartesian3,
  ColorMaterialProperty,
  Entity,
} from 'cesium';
import { useUiStore, type BorderStyle } from '@/state/uiStore';
import {
  getCountryBorders,
  getStateBorders,
  getCityBorders,
} from '@/geo/worldBordersData';

import { getIsFantasyWorld } from '@/globe/CesiumViewer';

let borderViewer: Viewer | null = null;
const createdCountryEntities: Entity[] = [];
const createdStateEntities: Entity[] = [];
const createdCityEntities: Entity[] = [];
let currentStyle: BorderStyle | null = null;
let isSyncing = false;
let initialLoadDeferred = false;

/** Number of border entities created per batch before yielding to the main thread. */
const BORDER_BATCH_SIZE = 250;

function yieldToMainThread(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function getBorderColorAndWidth(style: BorderStyle): { color: Color; width: number } {
  if (style === 'glowing-neon') {
    return { color: Color.fromCssColorString('#00f3ff'), width: 3.5 };
  } else if (style === 'subtle-white') {
    return { color: Color.WHITE.withAlpha(0.85), width: 2.0 };
  } else if (style === 'vintage-ink') {
    return { color: Color.fromCssColorString('#18181b').withAlpha(0.95), width: 2.5 };
  } else {
    // Google Earth Classic (default) — Bright pale yellow bold stroke
    return { color: Color.fromCssColorString('#fef08a'), width: 2.8 };
  }
}

function isIOSDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints ?? 0) > 1);
}

/**
 * Creates and maintains permanent ground-clamped border polylines directly on viewer.entities.
 * Asynchronously loads border datasets on demand.
 */
export async function syncWorldBordersData(viewer: Viewer): Promise<void> {
  if (!viewer || viewer.isDestroyed()) {
    borderViewer = null;
    createdCountryEntities.length = 0;
    createdStateEntities.length = 0;
    createdCityEntities.length = 0;
    return;
  }

  const isFantasy = getIsFantasyWorld();
  const uiState = useUiStore.getState();
  const { showCountryBorders, showRegionBorders, showCityBorders, borderStyle } = uiState;
  // Performance Mode or iOS/iPadOS: use lightweight 3D polylines instead of
  // ground-clamped shadow volumes. Heavy ground clamping on 3k+ polylines
  // freezes Mobile Safari's WebGL shader compiler.
  const perf = uiState.performanceMode;
  const useGroundClamping = !perf && !isIOSDevice();

  const countryShow = !isFantasy && showCountryBorders;
  const stateShow = !isFantasy && showRegionBorders && !perf;
  const cityShow = !isFantasy && showCityBorders && !perf;

  // Immediately remove real-world borders if in fantasy mode or in 1st-person mode
  if (isFantasy || uiState.firstPersonActive) {
    if (borderViewer && !borderViewer.isDestroyed()) {
      for (const entity of createdCountryEntities) borderViewer.entities.remove(entity);
      for (const entity of createdStateEntities) borderViewer.entities.remove(entity);
      for (const entity of createdCityEntities) borderViewer.entities.remove(entity);
    }
    createdCountryEntities.length = 0;
    createdStateEntities.length = 0;
    createdCityEntities.length = 0;
    return;
  }

  // Hide real-world borders if toggled off
  for (const entity of createdCountryEntities) {
    if (entity.show !== countryShow) entity.show = countryShow;
  }
  for (const entity of createdStateEntities) {
    if (entity.show !== stateShow) entity.show = stateShow;
  }
  for (const entity of createdCityEntities) {
    if (entity.show !== cityShow) entity.show = cityShow;
  }

  if (isSyncing) return;
  isSyncing = true;

  try {
    // Defer the very first border load until the globe has had a moment to
    // render and settle — prevents the ~4.5k entity burst from landing in the
    // same window as initial tile streaming (the classic old-iPad crash point).
    if (!initialLoadDeferred) {
      initialLoadDeferred = true;
      await new Promise((resolve) => setTimeout(resolve, 1200));
      if (viewer.isDestroyed() || borderViewer !== viewer) return;
    }

    // Reset references if viewer instance changed
    if (borderViewer !== viewer) {
      if (borderViewer && !borderViewer.isDestroyed()) {
        for (const entity of createdCountryEntities) borderViewer.entities.remove(entity);
        for (const entity of createdStateEntities) borderViewer.entities.remove(entity);
        for (const entity of createdCityEntities) borderViewer.entities.remove(entity);
      }
      borderViewer = viewer;
      createdCountryEntities.length = 0;
      createdStateEntities.length = 0;
      createdCityEntities.length = 0;
      currentStyle = null;
    }

    const { color, width } = getBorderColorAndWidth(borderStyle);
    const stateWidth = Math.max(1.5, width * 0.7);
    const cityWidth = Math.max(1.2, width * 0.55);

    // 1. Country & Ocean Coastline borders (batched to avoid main-thread spikes)
    if (countryShow && createdCountryEntities.length === 0) {
      const countryRings = await getCountryBorders();
      if (viewer.isDestroyed() || borderViewer !== viewer) return;

      const currentFantasy = getIsFantasyWorld();
      const currentCountryShow = !currentFantasy && useUiStore.getState().showCountryBorders;

      for (let cIdx = 0; cIdx < countryRings.length; cIdx++) {
        const ring = countryRings[cIdx]!;
        const positions = ring.map(([lon, lat]) => Cartesian3.fromDegrees(lon, lat));

        const borderEntity = viewer.entities.add({
          name: `Country / Coastline Border ${cIdx + 1}`,
          show: currentCountryShow,
          polyline: {
            positions,
            width,
            material: new ColorMaterialProperty(color),
            clampToGround: useGroundClamping,
          },
        });
        createdCountryEntities.push(borderEntity);

        if ((cIdx + 1) % BORDER_BATCH_SIZE === 0) {
          await yieldToMainThread();
          if (viewer.isDestroyed() || borderViewer !== viewer) return;
        }
      }
    }

    // 2. State & Province regional borders (skipped entirely in Performance Mode)
    if (stateShow && createdStateEntities.length === 0) {
      const stateRings = await getStateBorders();
      if (viewer.isDestroyed() || borderViewer !== viewer) return;

      const currentFantasy = getIsFantasyWorld();
      const currentStateShow =
        !currentFantasy &&
        useUiStore.getState().showRegionBorders &&
        !useUiStore.getState().performanceMode;

      for (let sIdx = 0; sIdx < stateRings.length; sIdx++) {
        const ring = stateRings[sIdx]!;
        const positions = ring.map(([lon, lat]) => Cartesian3.fromDegrees(lon, lat));

        const borderEntity = viewer.entities.add({
          name: `State Border ${sIdx + 1}`,
          show: currentStateShow,
          polyline: {
            positions,
            width: stateWidth,
            material: new ColorMaterialProperty(color.withAlpha(0.85)),
            clampToGround: useGroundClamping,
          },
        });
        createdStateEntities.push(borderEntity);

        if ((sIdx + 1) % BORDER_BATCH_SIZE === 0) {
          await yieldToMainThread();
          if (viewer.isDestroyed() || borderViewer !== viewer) return;
        }
      }
    }

    // 3. City & Metropolitan District territory borders (skipped in Performance Mode)
    if (cityShow && createdCityEntities.length === 0) {
      const cityRings = await getCityBorders();
      if (viewer.isDestroyed() || borderViewer !== viewer) return;

      const currentFantasy = getIsFantasyWorld();
      const currentCityShow =
        !currentFantasy &&
        useUiStore.getState().showCityBorders &&
        !useUiStore.getState().performanceMode;

      for (let ctIdx = 0; ctIdx < cityRings.length; ctIdx++) {
        const ring = cityRings[ctIdx]!;
        const positions = ring.map(([lon, lat]) => Cartesian3.fromDegrees(lon, lat));

        const borderEntity = viewer.entities.add({
          name: `City District Border ${ctIdx + 1}`,
          show: currentCityShow,
          polyline: {
            positions,
            width: cityWidth,
            material: new ColorMaterialProperty(color.withAlpha(0.7)),
            clampToGround: useGroundClamping,
          },
        });
        createdCityEntities.push(borderEntity);

        if ((ctIdx + 1) % BORDER_BATCH_SIZE === 0) {
          await yieldToMainThread();
          if (viewer.isDestroyed() || borderViewer !== viewer) return;
        }
      }
    }

    // Sync visibility according to active toggles & fantasy mode
    for (const entity of createdCountryEntities) {
      if (entity.show !== countryShow) {
        entity.show = countryShow;
      }
    }
    for (const entity of createdStateEntities) {
      if (entity.show !== stateShow) {
        entity.show = stateShow;
      }
    }
    for (const entity of createdCityEntities) {
      if (entity.show !== cityShow) {
        entity.show = cityShow;
      }
    }

    // Update styling if theme preset changed
    if (currentStyle !== borderStyle) {
      currentStyle = borderStyle;
      for (const entity of createdCountryEntities) {
        if (entity.polyline) {
          entity.polyline.material = new ColorMaterialProperty(color) as any;
          entity.polyline.width = width as any;
        }
      }
      for (const entity of createdStateEntities) {
        if (entity.polyline) {
          entity.polyline.material = new ColorMaterialProperty(color.withAlpha(0.85)) as any;
          entity.polyline.width = stateWidth as any;
        }
      }
      for (const entity of createdCityEntities) {
        if (entity.polyline) {
          entity.polyline.material = new ColorMaterialProperty(color.withAlpha(0.7)) as any;
          entity.polyline.width = cityWidth as any;
        }
      }
    }
  } catch (err) {
    console.warn('Border loading note:', err);
  } finally {
    isSyncing = false;
  }
}
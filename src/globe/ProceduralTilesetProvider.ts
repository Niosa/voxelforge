import {
  Viewer,
  Cesium3DTileset,
} from 'cesium';
import { workerPool } from '@/workers/WorkerPool';
import type { TileRequestPayload } from '@/workers/types';
import { getIsFantasyWorld } from '@/globe/CesiumViewer';

let activeProceduralTileset: Cesium3DTileset | null = null;

/**
 * Creates and attaches a custom procedural Cesium3DTileset backed by off-main-thread Web Workers.
 * Preserves Real Earth mode completely untouched.
 */
export async function createProceduralTileset(viewer: Viewer): Promise<Cesium3DTileset | null> {
  if (!viewer || viewer.isDestroyed()) return null;

  // Real Earth mode uses Esri/OSM/Google Photorealistic 3D Tiles — keep untouched
  if (!getIsFantasyWorld()) {
    if (activeProceduralTileset && !activeProceduralTileset.isDestroyed()) {
      viewer.scene.primitives.remove(activeProceduralTileset);
      activeProceduralTileset = null;
    }
    return null;
  }

  if (activeProceduralTileset && !activeProceduralTileset.isDestroyed()) {
    return activeProceduralTileset;
  }

  // Intercept tile resource loading by creating a custom in-memory root tileset JSON
  const rootTileJson = {
    asset: { version: '1.0' },
    geometricError: 2000,
    root: {
      boundingVolume: {
        sphere: [0, 0, 0, 6378137],
      },
      geometricError: 1000,
      refine: 'REPLACE',
      content: {
        uri: 'procedural://tile_root',
      },
      children: [],
    },
  };

  const blob = new Blob([JSON.stringify(rootTileJson)], { type: 'application/json' });
  const rootUrl = URL.createObjectURL(blob);

  try {
    const tileset = await Cesium3DTileset.fromUrl(rootUrl, {
      maximumScreenSpaceError: 16, // Mobile performance optimization
      skipLevelOfDetail: true,      // Mobile HLOD skip
      preferLeaves: true,
    });

    if (viewer.isDestroyed()) {
      URL.revokeObjectURL(rootUrl);
      return null;
    }

    activeProceduralTileset = tileset;
    viewer.scene.primitives.add(tileset);
    URL.revokeObjectURL(rootUrl);

    return tileset;
  } catch (err) {
    console.warn('[ProceduralTilesetProvider] Failed to create procedural tileset:', err);
    URL.revokeObjectURL(rootUrl);
    return null;
  }
}

/**
 * Helper to fetch a procedurally generated tile payload via the Web Worker Pool.
 */
export async function fetchProceduralTileBuffer(payload: TileRequestPayload): Promise<ArrayBuffer | null> {
  try {
    const response = await workerPool.dispatchTileRequest(payload);
    if (response.success && response.gltfArrayBuffer) {
      return response.gltfArrayBuffer;
    }
    return null;
  } catch (err) {
    console.error('[ProceduralTilesetProvider] Worker tile fetch error:', err);
    return null;
  }
}

export function destroyProceduralTileset(viewer: Viewer): void {
  if (activeProceduralTileset && !activeProceduralTileset.isDestroyed() && viewer && !viewer.isDestroyed()) {
    viewer.scene.primitives.remove(activeProceduralTileset);
  }
  activeProceduralTileset = null;
}

import {
  Viewer,
  Primitive,
  GeometryInstance,
  MaterialAppearance,
  Cartesian3,
  Matrix4,
} from 'cesium';
import { type VoxelChunk, CHUNK_SIZE, VOXEL_SIZE } from './VoxelChunk';
import { buildGreedyVoxelMesh } from './VoxelMesher';
import { voxelCoords } from './CoordinateSystem';
import { getVoxelBlockCesiumMaterial } from '../voxelTextures';

export class VoxelRenderer {
  private viewer: Viewer | null = null;
  private chunkPrimitives: Map<string, Primitive[]> = new Map();

  public setViewer(viewer: Viewer) {
    this.viewer = viewer;
  }

  public setGlobalOrigin(_lon: number, _lat: number, _alt: number = 0) {
    // Reserved for origin shifting if needed
  }

  /**
   * Updates the rendered meshes for a specific chunk.
   * If the chunk is empty, its primitives are removed.
   */
  public updateChunk(chunkKey: string, chunk: VoxelChunk) {
    if (!this.viewer) return;

    // Remove old primitives for this chunk
    this.removeChunk(chunkKey);

    const geometries = buildGreedyVoxelMesh(chunk);
    if (!geometries) return;

    const primitives: Primitive[] = [];
    
    // Transform chunk mesh from local chunk space [0 to 32] to world Cartesian3.
    // Chunk origin in local ENU meters relative to anchor:
    const localChunkOrigin = new Cartesian3(
      chunk.chunkX * CHUNK_SIZE * VOXEL_SIZE,
      chunk.chunkY * CHUNK_SIZE * VOXEL_SIZE,
      chunk.chunkZ * CHUNK_SIZE * VOXEL_SIZE
    );

    const modelMatrix = Matrix4.multiply(
      voxelCoords.getEnuToFixedMatrix(),
      Matrix4.fromTranslation(localChunkOrigin),
      new Matrix4()
    );

    for (const [type, geometry] of Object.entries(geometries)) {
      const instance = new GeometryInstance({
        geometry: geometry,
        modelMatrix: modelMatrix,
      });

      const appearance = new MaterialAppearance({
        material: getVoxelBlockCesiumMaterial(type as any),
        faceForward: true, // Needed for proper lighting on voxel cubes
      });

      const primitive = new Primitive({
        geometryInstances: [instance],
        appearance: appearance,
        asynchronous: false, // For immediate feedback in 1st person
      });

      this.viewer.scene.primitives.add(primitive);
      primitives.push(primitive);
    }

    this.chunkPrimitives.set(chunkKey, primitives);
    this.viewer.scene.requestRender();
  }

  public removeChunk(chunkKey: string) {
    if (!this.viewer) return;
    const oldPrimitives = this.chunkPrimitives.get(chunkKey);
    if (oldPrimitives) {
      for (const p of oldPrimitives) {
        this.viewer.scene.primitives.remove(p);
      }
      this.chunkPrimitives.delete(chunkKey);
    }
  }

  public destroy() {
    if (this.viewer) {
      for (const primitives of this.chunkPrimitives.values()) {
        for (const p of primitives) {
          this.viewer.scene.primitives.remove(p);
        }
      }
    }
    this.chunkPrimitives.clear();
  }
}

export const voxelRenderer = new VoxelRenderer();

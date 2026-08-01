import {
  Cartesian2,
  Cartesian3,
  Entity,
  Color,
} from 'cesium';
import { getViewer } from '@/globe/CesiumViewer';
import { useUiStore } from '@/state/uiStore';
import { voxelManager, type VoxelBlock, CHUNK_SIZE, VOXEL_SIZE } from '@/globe/voxels/VoxelChunk';
import { voxelCoords } from '@/globe/voxels/CoordinateSystem';
import { raycastVoxels } from '@/globe/voxels/Raycaster';
import { voxelRenderer } from '@/globe/voxels/VoxelRenderer';
import { voxelWorkerSync } from '@/globe/voxels/VoxelWorkerSync';

export function getVoxelStepForLat(lat: number): { lonStep: number; latStep: number } {
  const latStep = (VOXEL_SIZE / 6378137) * (180 / Math.PI);
  const cosLat = Math.cos((lat * Math.PI) / 180);
  const lonStep = cosLat > 0.0001 ? latStep / cosLat : latStep;
  return { lonStep, latStep };
}

export class FirstPersonBuilder {
  private previewEntity: Entity | null = null;

  init(): void {
    const viewer = getViewer();
    if (viewer) {
      voxelRenderer.setViewer(viewer);
    }
  }

  /**
   * CPU Raycast to find the targeted voxel cell
   */
  getTargetVoxelIntersection() {
    const viewer = getViewer();
    if (!viewer) return null;

    const screenCenter = new Cartesian2(
      viewer.canvas.clientWidth / 2,
      viewer.canvas.clientHeight / 2,
    );

    const ray = viewer.camera.getPickRay(screenCenter);
    if (!ray) return null;

    const result = raycastVoxels(ray, 30.0);
    if (result.hit) {
      return result;
    }

    // Fast 100% CPU ground-plane raycast (Z = 0 in local ENU space)
    const originLocal = voxelCoords.worldToLocal(ray.origin);
    const targetWorld = Cartesian3.add(
      ray.origin,
      Cartesian3.multiplyByScalar(ray.direction, 30, new Cartesian3()),
      new Cartesian3()
    );
    const targetLocal = voxelCoords.worldToLocal(targetWorld);
    const dirLocal = Cartesian3.subtract(targetLocal, originLocal, new Cartesian3());

    if (dirLocal.z < -0.00001) {
      const t = -originLocal.z / dirLocal.z;
      if (Math.abs(t) <= 30.0) {
        const hitLocal = new Cartesian3(
          originLocal.x + t * dirLocal.x,
          originLocal.y + t * dirLocal.y,
          0
        );
        const { cx, cy, cz, lx, ly, lz } = voxelCoords.localToChunk(hitLocal);
        const validCz = Math.max(0, cz);
        const validLz = Math.max(0, lz);
        return {
          hit: false as const,
          hitCx: cx, hitCy: cy, hitCz: validCz,
          hitLx: lx, hitLy: ly, hitLz: validLz,
          adjCx: cx, adjCy: cy, adjCz: validCz,
          adjLx: lx, adjLy: ly, adjLz: validLz
        };
      }
    }

    return null;
  }

  /** Update Minecraft targeted block wireframe stroke outline */
  updatePreview(): void {
    const viewer = getViewer();
    if (!viewer) return;

    const target = this.getTargetVoxelIntersection();
    if (!target) {
      if (this.previewEntity) this.previewEntity.show = false;
      return;
    }

    // Determine the position for the highlight box
    // If it's a hit, highlight the hit block. If missed voxels but hit ground, highlight where block would go.
    let cx = 0, cy = 0, cz = 0, lx = 0, ly = 0, lz = 0;
    
    if (target.hit) {
        cx = target.hitCx; cy = target.hitCy; cz = target.hitCz;
        lx = target.hitLx; ly = target.hitLy; lz = target.hitLz;
    } else {
        cx = target.adjCx; cy = target.adjCy; cz = target.adjCz;
        lx = target.adjLx; ly = target.adjLy; lz = target.adjLz;
    }

    // Convert chunk + local to local ENU meters
    const chunkMeters = CHUNK_SIZE * VOXEL_SIZE;
    const localX = cx * chunkMeters + lx * VOXEL_SIZE + VOXEL_SIZE / 2;
    const localY = cy * chunkMeters + ly * VOXEL_SIZE + VOXEL_SIZE / 2;
    const localZ = cz * chunkMeters + lz * VOXEL_SIZE + VOXEL_SIZE / 2;

    const localPos = new Cartesian3(localX, localY, localZ);
    const worldPos = voxelCoords.localToWorld(localPos);

    if (!this.previewEntity) {
      this.previewEntity = viewer.entities.add({
        position: worldPos,
        box: {
          dimensions: new Cartesian3(1.002, 1.002, 1.002),
          fill: false, 
          outline: true,
          outlineColor: Color.BLACK.withAlpha(0.95),
          outlineWidth: 3,
        },
      });
    } else {
      this.previewEntity.position = worldPos as any;
      this.previewEntity.show = true;
    }
    viewer.scene.requestRender();
  }

  /** Right-Click / Key E: Place selected Minecraft voxel block */
  placeCurrentStructure() {
    this.init();
    const target = this.getTargetVoxelIntersection();
    if (!target) return null;

    const { adjCx, adjCy, adjCz, adjLx, adjLy, adjLz } = target;
    const buildingType = useUiStore.getState().firstPersonBuildingType;

    const chunk = voxelManager.getOrCreateChunk(adjCx, adjCy, adjCz);
    
    const block: VoxelBlock = {
        type: buildingType,
        id: crypto.randomUUID()
    };
    
    chunk.setBlock(adjLx, adjLy, adjLz, block);
    
    // Trigger local immediate re-mesh
    voxelRenderer.updateChunk(
        voxelManager.getChunkKey(adjCx, adjCy, adjCz),
        chunk
    );

    // Send edit to Worker Queue for 3D Tiles bake
    voxelWorkerSync.queueEdit(adjCx, adjCy, adjCz, adjLx, adjLy, adjLz, buildingType);

    const viewer = getViewer();
    if (viewer) viewer.scene.requestRender();

    return block;
  }

  /** Left-Click: Delete targeted Minecraft voxel block */
  deleteTargetedBlock(): boolean {
    this.init();
    const target = this.getTargetVoxelIntersection();
    if (!target || !target.hit) return false;

    const { hitCx, hitCy, hitCz, hitLx, hitLy, hitLz } = target;
    const chunk = voxelManager.getChunk(hitCx, hitCy, hitCz);
    if (!chunk) return false;

    chunk.removeBlock(hitLx, hitLy, hitLz);

    // Trigger local immediate re-mesh
    voxelRenderer.updateChunk(
        voxelManager.getChunkKey(hitCx, hitCy, hitCz),
        chunk
    );

    // TODO: Send edit to Worker Queue for 3D Tiles bake

    const viewer = getViewer();
    if (viewer) viewer.scene.requestRender();

    return true;
  }

  clearPreview(): void {
    const viewer = getViewer();
    if (viewer && this.previewEntity) {
      viewer.entities.remove(this.previewEntity);
      this.previewEntity = null;
    }
    if (viewer) viewer.scene.requestRender();
  }
}

export const firstPersonBuilder = new FirstPersonBuilder();

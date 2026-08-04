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
import { getVoxelBlockMaterial } from '@/globe/voxelTextures';
import { soundEngine } from '@/audio/soundEngine';

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

    const maxDist = 60.0;
    const result = raycastVoxels(ray, maxDist);
    if (result.hit) {
      return result;
    }

    // Pick exact 3D ground intersection on globe terrain under crosshairs
    const globePicked = viewer.scene.globe.pick(ray, viewer.scene);
    let worldPos: Cartesian3;
    if (globePicked) {
      worldPos = globePicked;
    } else {
      worldPos = Cartesian3.add(
        ray.origin,
        Cartesian3.multiplyByScalar(ray.direction, 4.0, new Cartesian3()),
        new Cartesian3()
      );
    }

    const localPos = voxelCoords.worldToLocal(worldPos);
    const { cx, cy, cz, lx, ly, lz } = voxelCoords.localToChunk(localPos);
    const validCz = Math.max(0, cz);
    const validLz = Math.max(0, lz);

    return {
      hit: false as const,
      targetWorldPos: worldPos,
      hitCx: cx, hitCy: cy, hitCz: validCz,
      hitLx: lx, hitLy: ly, hitLz: validLz,
      adjCx: cx, adjCy: cy, adjCz: validCz,
      adjLx: lx, adjLy: ly, adjLz: validLz
    };
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

    const cx = target.hit ? target.hitCx : target.adjCx;
    const cy = target.hit ? target.hitCy : target.adjCy;
    const cz = target.hit ? target.hitCz : target.adjCz;
    const lx = target.hit ? target.hitLx : target.adjLx;
    const ly = target.hit ? target.hitLy : target.adjLy;
    const lz = target.hit ? target.hitLz : target.adjLz;

    const chunkMeters = CHUNK_SIZE * VOXEL_SIZE;
    const localX = cx * chunkMeters + lx * VOXEL_SIZE + VOXEL_SIZE / 2;
    const localY = cy * chunkMeters + ly * VOXEL_SIZE + VOXEL_SIZE / 2;
    const localZ = cz * chunkMeters + lz * VOXEL_SIZE + VOXEL_SIZE / 2;
    const gridWorldPos = voxelCoords.localToWorld(new Cartesian3(localX, localY, localZ));

    if (!this.previewEntity) {
      this.previewEntity = viewer.entities.add({
        position: gridWorldPos,
        box: {
          dimensions: new Cartesian3(1.002, 1.002, 1.002),
          fill: false, 
          outline: true,
          outlineColor: Color.BLACK.withAlpha(0.95),
          outlineWidth: 3,
        },
      });
    } else {
      this.previewEntity.position = gridWorldPos as any;
      this.previewEntity.show = true;
    }
    viewer.scene.requestRender();
  }

  /** Right-Click / Key E / Left-Click: Place selected Minecraft voxel block or Prefab Blueprint */
  placeCurrentStructure() {
    this.init();
    const target = this.getTargetVoxelIntersection();
    if (!target) return null;

    const buildingType = useUiStore.getState().firstPersonBuildingType;
    const viewer = getViewer();
    if (!viewer) return null;

    let { adjCx, adjCy, adjCz, adjLx, adjLy, adjLz } = target;

    // If clicking on terrain (not an existing block), place block 1 level above terrain
    if (!target.hit) {
      adjLz += 1;
      if (adjLz >= CHUNK_SIZE) {
        adjCz += 1;
        adjLz = 0;
      }
    }

    // Handle Blueprint Prefabs
    if (buildingType.startsWith('blueprint_')) {
      this.placeBlueprint(buildingType, adjCx, adjCy, adjCz, adjLx, adjLy, adjLz);
      soundEngine.playBlockPlace('stone');
      return null;
    }

    const chunk = voxelManager.getOrCreateChunk(adjCx, adjCy, adjCz);
    const blockId = crypto.randomUUID();
    const block: VoxelBlock = {
      type: buildingType,
      id: blockId,
    };
    chunk.setBlock(adjLx, adjLy, adjLz, block);

    // Render textured 3D box entity directly on Cesium
    const chunkMeters = CHUNK_SIZE * VOXEL_SIZE;
    const localX = adjCx * chunkMeters + adjLx * VOXEL_SIZE + VOXEL_SIZE / 2;
    const localY = adjCy * chunkMeters + adjLy * VOXEL_SIZE + VOXEL_SIZE / 2;
    const localZ = adjCz * chunkMeters + adjLz * VOXEL_SIZE + VOXEL_SIZE / 2;
    const gridWorldPos = voxelCoords.localToWorld(new Cartesian3(localX, localY, localZ));

    viewer.entities.add({
      id: blockId,
      position: gridWorldPos,
      box: {
        dimensions: new Cartesian3(1.0, 1.0, 1.0),
        material: getVoxelBlockMaterial(buildingType),
        outline: true,
        outlineColor: Color.BLACK.withAlpha(0.4),
      },
    });

    voxelRenderer.updateChunk(
      voxelManager.getChunkKey(adjCx, adjCy, adjCz),
      chunk
    );

    voxelWorkerSync.queueEdit(adjCx, adjCy, adjCz, adjLx, adjLy, adjLz, buildingType);
    soundEngine.playBlockPlace(buildingType);

    viewer.scene.requestRender();
    return block;
  }

  /** Place multi-block prefab blueprint structures */
  placeBlueprint(type: string, startCx: number, startCy: number, startCz: number, startLx: number, startLy: number, startLz: number) {
    const chunk = voxelManager.getOrCreateChunk(startCx, startCy, startCz);

    const setBlockRelative = (dx: number, dy: number, dz: number, blockType: string) => {
      const rx = (startLx + dx) % CHUNK_SIZE;
      const ry = (startLy + dy) % CHUNK_SIZE;
      const rz = (startLz + dz) % CHUNK_SIZE;
      chunk.setBlock(rx, ry, rz, { type: blockType as import('@/state/uiStore').FirstPersonBuildingType, id: crypto.randomUUID() });
    };

    if (type === 'blueprint_tower') {
      // 5x5 Castle Watchtower with crenellations
      for (let z = 0; z < 8; z++) {
        for (let x = -2; x <= 2; x++) {
          for (let y = -2; y <= 2; y++) {
            const isBorder = Math.abs(x) === 2 || Math.abs(y) === 2;
            if (z < 7 && isBorder) {
              setBlockRelative(x, y, z, 'castle');
            } else if (z === 7 && isBorder && (x + y) % 2 === 0) {
              setBlockRelative(x, y, z, 'wall'); // Crenellation battlement
            }
          }
        }
      }
    } else if (type === 'blueprint_cottage') {
      // 4x4 Timber Cottage with Thatch Roof
      for (let z = 0; z < 4; z++) {
        for (let x = -2; x <= 2; x++) {
          for (let y = -2; y <= 2; y++) {
            if (z < 3 && (Math.abs(x) === 2 || Math.abs(y) === 2)) {
              setBlockRelative(x, y, z, 'house');
            } else if (z === 3) {
              setBlockRelative(x, y, z, 'thatch_roof');
            }
          }
        }
      }
    } else if (type === 'blueprint_windmill') {
      // Tall Windmill structure
      for (let z = 0; z < 10; z++) {
        for (let x = -1; x <= 1; x++) {
          for (let y = -1; y <= 1; y++) {
            if (z < 9 && (Math.abs(x) === 1 || Math.abs(y) === 1)) {
              setBlockRelative(x, y, z, 'marble');
            }
          }
        }
      }
      // Windmill Sails
      for (let s = -2; s <= 2; s++) {
        setBlockRelative(s, 0, 9, 'wood');
        setBlockRelative(0, s, 9, 'wood');
      }
    } else if (type === 'blueprint_fountain') {
      // Marble Fountain
      for (let x = -2; x <= 2; x++) {
        for (let y = -2; y <= 2; y++) {
          const isRim = Math.abs(x) === 2 || Math.abs(y) === 2;
          if (isRim) {
            setBlockRelative(x, y, 0, 'marble');
          } else {
            setBlockRelative(x, y, 0, 'water');
          }
        }
      }
      setBlockRelative(0, 0, 1, 'marble');
      setBlockRelative(0, 0, 2, 'water');
    }

    voxelRenderer.updateChunk(
      voxelManager.getChunkKey(startCx, startCy, startCz),
      chunk
    );
  }

  /** Left-Click: Delete targeted Minecraft voxel block */
  deleteTargetedBlock(): boolean {
    this.init();
    const target = this.getTargetVoxelIntersection();
    if (!target || !target.hit) return false;

    const { hitCx, hitCy, hitCz, hitLx, hitLy, hitLz } = target;
    const chunk = voxelManager.getChunk(hitCx, hitCy, hitCz);
    if (!chunk) return false;

    const existingBlock = chunk.getBlock(hitLx, hitLy, hitLz);
    const viewer = getViewer();
    if (existingBlock && viewer) {
      viewer.entities.removeById(existingBlock.id);
    }

    chunk.removeBlock(hitLx, hitLy, hitLz);
    soundEngine.playBlockBreak();

    voxelRenderer.updateChunk(
      voxelManager.getChunkKey(hitCx, hitCy, hitCz),
      chunk
    );

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

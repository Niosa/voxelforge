/**
 * WalkScene — initialises and manages a noa-engine voxel world anchored
 * to a geodetic position on the Cesium globe.
 */

import Noa from 'noa-engine';
import type { WalkAnchor, VoxelChunkMap, VoxelBlock } from '@/entities/types';
import { BLOCKS, BLOCK_AIR } from './blockRegistry';
import { blockToChunkKey } from './GeoAnchor';

// noa-engine ships as CJS without a typed constructor signature; cast to any.
type Noa = any;

export interface WalkSceneOptions {
  anchor: WalkAnchor;
  savedChunks?: VoxelChunkMap;
  seed?: number;
}

export class WalkScene {
  readonly noa: Noa;
  private _dirty = new Set<string>();

  private constructor(noa: Noa, _anchor: WalkAnchor) {
    this.noa = noa;
    void _anchor;
  }

  static create(opts: WalkSceneOptions): WalkScene {
    const noa: Noa = new (Noa as any)({
      debug: false,
      silent: true,
      playerHeight: 1.8,
      playerWidth: 0.6,
      playerStart: [0, 64, 0],
      chunkSize: 32,
      chunkAddDistance: [3, 2],
      chunkRemoveDistance: [4, 3],
      gravity: [0, -20, 0],
    });

    for (const block of BLOCKS) {
      if (block.id === BLOCK_AIR) continue;
      noa.registry.registerBlock(block.id, {
        material: block.name,
        solid: block.solid,
        opaque: block.solid,
      });
      noa.registry.registerMaterial(
        block.name,
        [1, 1, 1, 1],
        null,
        false,
      );
    }

    const scene = new WalkScene(noa, opts.anchor);

    noa.world.on('worldDataNeeded', (
      _id: string,
      data: { set: (x: number, y: number, z: number, blockId: number) => void; finish: () => void },
      x: number,
      y: number,
      z: number,
    ) => {
      const size = 32;
      for (let i = 0; i < size; i++) {
        for (let j = 0; j < size; j++) {
          for (let k = 0; k < size; k++) {
            const worldY = y + j;
            if (worldY < 0) data.set(i, j, k, 1);
            else if (worldY === 0) data.set(i, j, k, 3);
            else data.set(i, j, k, BLOCK_AIR);
          }
        }
      }

      if (opts.savedChunks) {
        const chunkKey = `${Math.floor(x / size)},${Math.floor(y / size)},${Math.floor(z / size)}`;
        const saved = opts.savedChunks[chunkKey];
        if (saved) {
          for (const blk of saved) {
            const lx = blk.bx - x;
            const ly = blk.by - y;
            const lz = blk.bz - z;
            if (lx >= 0 && lx < size && ly >= 0 && ly < size && lz >= 0 && lz < size) {
              data.set(lx, ly, lz, blk.blockId);
            }
          }
        }
      }

      data.finish();
    });

    noa.world.on('blockSet', (x: number, y: number, z: number, _blockId: number) => {
      const key = blockToChunkKey(x, y, z);
      scene._dirty.add(key);
    });

    return scene;
  }

  mount(container: HTMLElement): void {
    const canvas = this.noa.rendering.getScene().getEngine().getRenderingCanvas();
    if (canvas) container.appendChild(canvas);
  }

  tick(dt: number): void {
    this.noa.tick(dt);
    this.noa.rendering.render();
  }

  dispose(): VoxelChunkMap {
    const result: VoxelChunkMap = {};

    for (const chunkKey of this._dirty) {
      const [cxS, cyS, czS] = chunkKey.split(',');
      const cx = Number(cxS);
      const cy = Number(cyS);
      const cz = Number(czS);
      const size = 32;
      const blocks: VoxelBlock[] = [];

      for (let i = 0; i < size; i++) {
        for (let j = 0; j < size; j++) {
          for (let k = 0; k < size; k++) {
            const bx = cx * size + i;
            const by = cy * size + j;
            const bz = cz * size + k;
            const id: number = this.noa.getBlock(bx, by, bz);
            if (id !== BLOCK_AIR) {
              blocks.push({ bx, by, bz, blockId: id });
            }
          }
        }
      }

      if (blocks.length > 0) result[chunkKey] = blocks;
    }

    try {
      (this.noa as any).dispose?.();
    } catch (_) {
      // noa may not expose dispose in all versions
    }

    return result;
  }
}

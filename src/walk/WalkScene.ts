/**
 * WalkScene — initialises and manages a noa-engine voxel world anchored
 * to a geodetic position on the Cesium globe.
 */

// noa-engine is CommonJS — use namespace import so Rollup can resolve it
import * as NoaModule from 'noa-engine';
const Noa = (NoaModule as any).default ?? NoaModule;

import type { WalkAnchor, VoxelChunkMap, VoxelBlock } from '@/entities/types';
import { BLOCKS, BLOCK_AIR } from './blockRegistry';
import { blockToChunkKey } from './GeoAnchor';

type NoaInstance = any;

export interface WalkSceneOptions {
  anchor: WalkAnchor;
  savedChunks?: VoxelChunkMap;
  seed?: number;
}

function hexToRgbFloats(hex: string): [number, number, number] {
  if (!hex || hex === 'transparent') return [1, 1, 1];
  let clean = hex.replace('#', '');
  if (clean.length === 3) {
    clean = clean.split('').map((c) => c + c).join('');
  }
  const num = Number.parseInt(clean, 16);
  if (Number.isNaN(num)) return [1, 1, 1];
  const r = ((num >> 16) & 255) / 255;
  const g = ((num >> 8) & 255) / 255;
  const b = (num & 255) / 255;
  return [r, g, b];
}

export class WalkScene {
  readonly noa: NoaInstance;
  private _dirty = new Set<string>();

  private constructor(noa: NoaInstance, _anchor: WalkAnchor) {
    this.noa = noa;
    void _anchor;
  }

  static create(opts: WalkSceneOptions): WalkScene {
    const noa: NoaInstance = new Noa({
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
      const isAlpha = block.name === 'glass' || block.name === 'water' || block.name === 'leaves';
      if (typeof block.textures === 'string') {
        const matName = `${block.name}_mat`;
        noa.registry.registerMaterial(matName, null, block.textures, isAlpha);
        noa.registry.registerBlock(block.id, {
          material: matName,
          solid: block.solid,
          opaque: block.solid && !isAlpha,
        });
      } else if (Array.isArray(block.textures)) {
        const topMat = `${block.name}_top`;
        const botMat = `${block.name}_bot`;
        const sideMat = `${block.name}_side`;
        noa.registry.registerMaterial(topMat, null, block.textures[0]!, isAlpha);
        noa.registry.registerMaterial(botMat, null, block.textures[1]!, isAlpha);
        noa.registry.registerMaterial(sideMat, null, block.textures[2]!, isAlpha);
        noa.registry.registerBlock(block.id, {
          material: [topMat, botMat, sideMat],
          solid: block.solid,
          opaque: block.solid && !isAlpha,
        });
      } else {
        const rgb = hexToRgbFloats(block.color);
        noa.registry.registerMaterial(block.name, rgb, null, false);
        noa.registry.registerBlock(block.id, {
          material: block.name,
          solid: block.solid,
          opaque: block.solid && !isAlpha,
        });
      }
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
        for (let k = 0; k < size; k++) {
          const worldX = x + i;
          const worldZ = z + k;
          // Simple multi-frequency sine wave terrain height
          const terrainH = Math.floor(
            Math.sin(worldX * 0.08) * 3 + Math.cos(worldZ * 0.08) * 3 + Math.sin((worldX + worldZ) * 0.03) * 4
          );

          for (let j = 0; j < size; j++) {
            const worldY = y + j;
            if (worldY < terrainH - 3) {
              data.set(i, j, k, 1); // stone
            } else if (worldY < terrainH) {
              data.set(i, j, k, 2); // dirt
            } else if (worldY === terrainH) {
              data.set(i, j, k, 3); // grass
            } else {
              data.set(i, j, k, BLOCK_AIR);
            }
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
      scene._dirty.add(blockToChunkKey(x, y, z));
    });

    return scene;
  }

  mount(container: HTMLElement): void {
    const canvas = this.noa.rendering.getScene().getEngine().getRenderingCanvas();
    if (canvas) container.appendChild(canvas);
  }

  applyTouchLookDelta(dx: number, dy: number): void {
    if (!this.noa) return;
    const sens = 0.003;
    this.noa.camera.heading += dx * sens;
    const maxPitch = 1.45;
    this.noa.camera.pitch = Math.max(-maxPitch, Math.min(maxPitch, this.noa.camera.pitch - dy * sens));
  }

  applyTouchMovement(forward: number, side: number): void {
    if (!this.noa || !this.noa.inputs) return;
    this.noa.inputs.state['forward'] = forward > 0.2;
    this.noa.inputs.state['backward'] = forward < -0.2;
    this.noa.inputs.state['left'] = side < -0.2;
    this.noa.inputs.state['right'] = side > 0.2;
  }

  tick(dt: number): void {
    this.noa.tick(dt);
    this.noa.rendering.render();
  }

  dispose(): VoxelChunkMap {
    const result: VoxelChunkMap = {};
    const size = 32;

    for (const chunkKey of this._dirty) {
      const [cxS, cyS, czS] = chunkKey.split(',');
      const cx = Number(cxS), cy = Number(cyS), cz = Number(czS);
      const blocks: VoxelBlock[] = [];

      for (let i = 0; i < size; i++) {
        for (let j = 0; j < size; j++) {
          for (let k = 0; k < size; k++) {
            const bx = cx * size + i;
            const by = cy * size + j;
            const bz = cz * size + k;
            const id: number = this.noa.getBlock(bx, by, bz);
            if (id !== BLOCK_AIR) blocks.push({ bx, by, bz, blockId: id });
          }
        }
      }

      if (blocks.length > 0) result[chunkKey] = blocks;
    }

    try { (this.noa as any).dispose?.(); } catch (_) { /* noa may not expose dispose */ }
    return result;
  }
}

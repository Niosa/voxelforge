import { ImageMaterialProperty, Cartesian2, Material } from 'cesium';
import type { FirstPersonBuildingType } from '@/state/uiStore';
import { LruCache } from '@/utils/lruCache';

const textureCache = new LruCache<string, string>(50);
const materialCache = new LruCache<string, ImageMaterialProperty>(50);
const cesiumMaterialCache = new LruCache<string, Material>(50);

/**
 * Procedural Voxel Texture Generator.
 * Generates crisp 128x128 pixelated block textures (Wood, Stone Bricks, Cobblestone, Gold, Leaves, etc.)
 */
export function getVoxelBlockTextureUrl(type: FirstPersonBuildingType): string {
  const cached = textureCache.get(type);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  switch (type) {
    case 'house': {
      // 🪵 Oak Wood Planks
      ctx.fillStyle = '#854d0e';
      ctx.fillRect(0, 0, 128, 128);

      // Plank grooves
      ctx.fillStyle = '#451a03';
      for (let y = 0; y < 128; y += 32) {
        ctx.fillRect(0, y, 128, 4);
      }
      // Wood grain lines
      ctx.fillStyle = '#a16207';
      for (let y = 6; y < 128; y += 16) {
        for (let x = 8; x < 128; x += 24) {
          ctx.fillRect(x, y, 12, 2);
        }
      }
      break;
    }
    case 'castle': {
      // 🧱 Stone Bricks
      ctx.fillStyle = '#64748b';
      ctx.fillRect(0, 0, 128, 128);

      // Dark Mortar Joints
      ctx.fillStyle = '#1e293b';
      for (let y = 0; y < 128; y += 32) {
        ctx.fillRect(0, y, 128, 4);
      }
      for (let y = 0; y < 128; y += 64) {
        ctx.fillRect(64, y, 4, 32);
        ctx.fillRect(0, y + 32, 4, 32);
      }

      // Brick highlight highlights & noise
      ctx.fillStyle = '#94a3b8';
      for (let y = 4; y < 128; y += 32) {
        for (let x = 4; x < 124; x += 16) {
          ctx.fillRect(x, y, 6, 4);
        }
      }
      break;
    }
    case 'watchtower': {
      // 🪨 Cobblestone
      ctx.fillStyle = '#475569';
      ctx.fillRect(0, 0, 128, 128);

      // Random Cobble Stones
      const stones = [
        { x: 4, y: 4, w: 56, h: 56, c: '#334155' },
        { x: 64, y: 4, w: 60, h: 28, c: '#64748b' },
        { x: 64, y: 36, w: 60, h: 56, c: '#1e293b' },
        { x: 4, y: 64, w: 56, h: 60, c: '#64748b' },
        { x: 64, y: 96, w: 60, h: 28, c: '#334155' },
      ];
      stones.forEach((s) => {
        ctx.fillStyle = s.c;
        ctx.fillRect(s.x, s.y, s.w, s.h);
        ctx.strokeStyle = '#0f172a';
        ctx.strokeRect(s.x, s.y, s.w, s.h);
      });
      break;
    }
    case 'gate': {
      // 🚪 Gold Arch Block
      ctx.fillStyle = '#eab308';
      ctx.fillRect(0, 0, 128, 128);

      // Beveled Gold Border
      ctx.strokeStyle = '#ca8a04';
      ctx.lineWidth = 8;
      ctx.strokeRect(4, 4, 120, 120);

      ctx.fillStyle = '#fef08a';
      ctx.fillRect(16, 16, 32, 32);
      ctx.fillRect(80, 80, 32, 32);
      break;
    }
    case 'wall': {
      // 🏰 Chiseled Stone Wall
      ctx.fillStyle = '#334155';
      ctx.fillRect(0, 0, 128, 128);

      // Concentric Chiseled Frame
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 12;
      ctx.strokeRect(6, 6, 116, 116);
      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 4;
      ctx.strokeRect(20, 20, 88, 88);
      break;
    }
    case 'road': {
      // 🛣️ Cobble Slab
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(0, 0, 128, 128);

      ctx.fillStyle = '#64748b';
      for (let y = 8; y < 128; y += 32) {
        ctx.fillRect(0, y, 128, 2);
      }
      for (let x = 8; x < 128; x += 32) {
        ctx.fillRect(x, 0, 2, 128);
      }
      break;
    }
    case 'flagpole': {
      // 🚩 Banner Post / Red Cloth
      ctx.fillStyle = '#dc2626';
      ctx.fillRect(0, 0, 128, 128);

      // Gold Trim Border
      ctx.fillStyle = '#facc15';
      ctx.fillRect(0, 0, 128, 12);
      ctx.fillRect(0, 116, 128, 12);
      break;
    }
    case 'tree': default: {
      // 🌿 Oak Leaves Canopy
      ctx.fillStyle = '#16a34a';
      ctx.fillRect(0, 0, 128, 128);

      // Pixelated Leaf Lattice
      ctx.fillStyle = '#15803d';
      for (let y = 0; y < 128; y += 16) {
        for (let x = (y % 32 === 0 ? 0 : 8); x < 128; x += 16) {
          ctx.fillRect(x, y, 8, 8);
        }
      }
      ctx.fillStyle = '#4ade80';
      for (let y = 8; y < 128; y += 32) {
        for (let x = 4; x < 124; x += 32) {
          ctx.fillRect(x, y, 6, 6);
        }
      }
      break;
    }
  }

  const dataUrl = canvas.toDataURL('image/png');
  textureCache.set(type, dataUrl);
  return dataUrl;
}

export function getVoxelBlockMaterial(type: FirstPersonBuildingType): ImageMaterialProperty {
  let mat = materialCache.get(type);
  if (!mat) {
    mat = new ImageMaterialProperty({
      image: getVoxelBlockTextureUrl(type),
      repeat: new Cartesian2(1, 1),
    });
    materialCache.set(type, mat);
  }
  return mat;
}

export function getVoxelBlockCesiumMaterial(type: FirstPersonBuildingType): Material {
  let mat = cesiumMaterialCache.get(type);
  if (!mat) {
    mat = Material.fromType('Image', {
      image: getVoxelBlockTextureUrl(type),
    });
    cesiumMaterialCache.set(type, mat);
  }
  return mat;
}

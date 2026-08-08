import { describe, expect, it } from 'vitest';
import type { TerraEntity } from '@/entities/types';
import { PlanetTerrainSampler } from '@/planet/terrain/PlanetTerrainSampler';
import {
  collectExcavatedSurfacePatches,
  collectGeneratedChunkBoxes,
  collectPlacedWalkBlocks,
  globeBlockTextureFaces,
  exposedSurfaceBaseY,
  effectiveGeneratedVoxelManifest,
  generatedVoxelChunkFootprints,
  visibleGeneratedChunkColumns,
} from './walkVoxelGlobeOverlay';

describe('collectPlacedWalkBlocks', () => {
  it('extends surface geometry down to cover exposed voxel sides', () => {
    expect(exposedSurfaceBaseY(12, [12, 11, 8, 13])).toBe(9);
    expect(exposedSurfaceBaseY(12, [12, 12, 12, 12])).toBe(12);
    expect(exposedSurfaceBaseY(12, [])).toBe(12);
  });
  it('preserves separate top and side textures for globe voxel materials', () => {
    expect(globeBlockTextureFaces(['grass-top.png', 'dirt.png', 'grass-side.png'])).toEqual({
      top: 'grass-top.png',
      side: 'grass-side.png',
    });
    expect(globeBlockTextureFaces('stone.png')).toEqual({ top: 'stone.png', side: 'stone.png' });
  });

  it('shows only nearby generated chunks at sufficiently close globe zoom', () => {
    const manifest = {
      'planet/0,0,0': 1,
      'planet/0,1,0': 1,
      'planet/1000,0,1000': 1,
    };
    expect(visibleGeneratedChunkColumns(manifest, 0, 0, 500)).toEqual(['0,0']);
    expect(visibleGeneratedChunkColumns(manifest, 0, 0, 65_000)).toEqual([]);
  });

  it('does not truncate a generated site to the old nine-chunk ceiling', () => {
    const manifest = Object.fromEntries(Array.from({ length: 20 }, (_, index) => [
      `planet/${index % 5},0,${Math.floor(index / 5)}`,
      1,
    ]));
    expect(visibleGeneratedChunkColumns(manifest, 0, 0, 500)).toHaveLength(20);
    expect(visibleGeneratedChunkColumns(manifest, 0, 0, 500, 16)).toHaveLength(16);
  });

  it('creates one imagery-mask footprint per generated chunk column', () => {
    const footprints = generatedVoxelChunkFootprints({
      'planet/0,0,0': 1,
      'planet/0,1,0': 1,
      'planet/1,0,0': 1,
    });
    expect(footprints).toHaveLength(2);
    expect(footprints[0]!.east).toBeCloseTo(footprints[1]!.west, 10);
    expect(footprints.every((footprint) => footprint.east > footprint.west && footprint.north > footprint.south)).toBe(true);
  });

  it('recovers legacy generated sites from walk pins', () => {
    const pin: TerraEntity = {
      id: 'walk-site',
      type: 'landmark',
      name: 'Walk site',
      description: '',
      tags: ['walk-entry'],
      color: '#fff',
      fillOpacity: 1,
      parentId: null,
      images: [],
      createdAt: 0,
      updatedAt: 0,
      geometry: { type: 'Point', coordinates: [0, 0] },
      properties: { walkEntry: true },
    };
    expect(effectiveGeneratedVoxelManifest(undefined, undefined, { pin }))
      .toHaveProperty('planet/0,0,-1');
  });

  it('merges flat generated terrain into strips instead of voxel cubes', () => {
    const boxes = collectGeneratedChunkBoxes(['0,0'], {}, {}, 2);
    expect(boxes.length).toBeGreaterThan(0);
    expect(boxes.length).toBeLessThan(1_024);
    expect(boxes.some((box) => box.width > 1)).toBe(true);
    expect(boxes.some((box) => box.depth > 1)).toBe(true);
  });

  it('shows placed overrides but not saved air from broken terrain', () => {
    expect(collectPlacedWalkBlocks({
      'planet/0,0,0': [
        { bx: 1, by: 4, bz: 2, blockId: 0 },
        { bx: 2, by: 5, bz: 2, blockId: 11 },
      ],
    })).toEqual([{ bx: 2, by: 5, bz: 2, blockId: 11 }]);
  });

  it('reconstructs an exposed natural surface after excavation', () => {
    const land: TerraEntity = {
      id: 'land', type: 'continent', name: 'Land', description: '', tags: [], color: '#fff',
      fillOpacity: 1, parentId: null, images: [], createdAt: 0, updatedAt: 0,
      geometry: { type: 'Polygon', coordinates: [[[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]]] },
      properties: { biome: 'lush-grassland', topography: 'plains' },
    };
    const terrain = new PlanetTerrainSampler({ land }, 9);
    const surface = terrain.sampleSurface(0, 0);
    const patches = collectExcavatedSurfacePatches({
      'planet/0,0,0': [{ bx: 0, by: surface.elevation, bz: 0, blockId: 0 }],
    }, { land }, 9);

    expect(patches).toEqual([{
      bx: 0,
      by: surface.elevation - 1,
      bz: 0,
      blockId: 2,
    }]);
  });
});

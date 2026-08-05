import { describe, expect, it } from 'vitest';
import type { TerraEntity } from '@/entities/types';
import { lonLatToPlanetMeters } from '@/planet/spatial/PlanetGrid';
import { foliageCellHasTree, foliageTreePosition, naturalPondAt, PlanetTerrainSampler } from './PlanetTerrainSampler';

function entity(partial: Partial<TerraEntity> & Pick<TerraEntity, 'id' | 'type' | 'geometry'>): TerraEntity {
  return {
    name: partial.id,
    description: '',
    tags: [],
    color: '#fff',
    fillOpacity: 1,
    parentId: null,
    images: [],
    properties: {},
    createdAt: 0,
    updatedAt: 0,
    ...partial,
  };
}

describe('PlanetTerrainSampler', () => {
  it('compiles locations outside authored land as persistent ocean columns', () => {
    const sampler = new PlanetTerrainSampler({}, 42);
    const sample = sampler.sampleSurface(0, 0);
    expect(sample.biome).toBe('shallow-water');
    expect(sample.waterLevel).toBe(0);
    expect(sampler.blockAt(0, 0, 0, sample)).toBe(7);
  });

  it('compiles a globe forest polygon into deterministic trees', () => {
    const forest = entity({
      id: 'forest',
      type: 'region',
      geometry: { type: 'Polygon', coordinates: [[[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]]] },
      properties: { biome: 'forest-canopy' },
      tags: ['forest'],
    });
    const sampler = new PlanetTerrainSampler({ forest }, 7);
    const sample = sampler.sampleSurface(0, 0);
    expect(sample.isForest).toBe(true);
    expect(sample.waterLevel).toBeNull();

    let foundTree = false;
    for (let x = -10; x <= 10 && !foundTree; x++) {
      for (let z = -10; z <= 10 && !foundTree; z++) {
        const column = sampler.sampleSurface(x, z);
        for (let y = column.elevation + 1; y <= column.elevation + 7; y++) {
          if (sampler.blockAt(x, y, z, column) === 5) foundTree = true;
        }
      }
    }
    expect(foundTree).toBe(true);
    expect(sampler.sampleSurface(0, 0)).toEqual(sample);
  });

  it('does not let a walk-entry pin replace the underlying biome', () => {
    const forest = entity({
      id: 'forest',
      type: 'region',
      geometry: { type: 'Polygon', coordinates: [[[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]]] },
      properties: { biome: 'forest-canopy' },
    });
    const pin = entity({
      id: 'walk-pin',
      type: 'landmark',
      geometry: { type: 'Point', coordinates: [0, 0] },
      properties: { walkEntry: true },
      tags: ['walk-entry'],
    });
    expect(new PlanetTerrainSampler({ forest, pin }, 7).sampleSurface(0, 0).biome).toBe('forest-canopy');
  });

  it('compiles a globe city point into a deterministic urban footprint', () => {
    const city = entity({
      id: 'city',
      type: 'city',
      geometry: { type: 'Point', coordinates: [0, 0] },
      properties: { biome: 'city-urban', footprintRadiusM: 300 },
    });
    const sampler = new PlanetTerrainSampler({ city }, 11);
    const [centerX, centerZ] = lonLatToPlanetMeters(0, 0);
    const sample = sampler.sampleSurface(centerX, centerZ);
    expect(sample.isCity).toBe(true);

    let foundBuilding = false;
    for (let x = -40; x <= 40 && !foundBuilding; x++) {
      for (let z = -40; z <= 40 && !foundBuilding; z++) {
        if ([11, 12].includes(sampler.blockAt(x, 8, z))) foundBuilding = true;
      }
    }
    expect(foundBuilding).toBe(true);
  });

  it('compiles a frigid authored climate into snow blocks in walk mode', () => {
    const polarLand = entity({
      id: 'polar-land',
      type: 'continent',
      geometry: { type: 'Polygon', coordinates: [[[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]]] },
      properties: { biome: 'lush-grassland', climate: 'frigid' },
    });
    const sampler = new PlanetTerrainSampler({ polarLand }, 23);
    const sample = sampler.sampleSurface(0, 0);

    expect(sample.biome).toBe('snowy-tundra');
    expect(sample.surfaceBlockId).toBe(8);
    expect(sampler.blockAt(0, sample.elevation, 0, sample)).toBe(8);
  });

  it('maps arid and tropical climates to matching walk biomes', () => {
    const base = entity({
      id: 'land',
      type: 'continent',
      geometry: { type: 'Polygon', coordinates: [[[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]]] },
      properties: { biome: 'lush-grassland', climate: 'arid' },
    });
    expect(new PlanetTerrainSampler({ land: base }, 1).sampleSurface(0, 0).biome).toBe('desert-dunes');

    const tropical = { ...base, properties: { ...base.properties, climate: 'tropical' } };
    expect(new PlanetTerrainSampler({ land: tropical }, 1).sampleSurface(0, 0).biome).toBe('forest-canopy');
  });

  it('uses textured biome strata and deterministic underground geology', () => {
    const desert = entity({
      id: 'desert', type: 'region',
      geometry: { type: 'Polygon', coordinates: [[[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]]] },
      properties: { biome: 'desert-dunes', climate: 'arid' },
    });
    const sampler = new PlanetTerrainSampler({ desert }, 81);
    const surface = sampler.sampleSurface(0, 0);
    expect(sampler.blockAt(0, surface.elevation - 1, 0, surface)).toBe(27);

    const geology = new Set<number>();
    for (let x = -30; x <= 30; x += 3) {
      for (let z = -30; z <= 30; z += 3) {
        for (let y = -18; y <= -8; y++) geology.add(sampler.blockAt(x, y, z));
      }
    }
    expect([...geology].some((block) => [34, 35].includes(block))).toBe(true);
    expect([...geology].some((block) => [38, 39, 40].includes(block))).toBe(true);
  });

  it('freezes the surface of explicitly frigid water', () => {
    const frozenLake = entity({
      id: 'frozen-lake', type: 'region',
      geometry: { type: 'Polygon', coordinates: [[[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]]] },
      properties: { biome: 'shallow-water', climate: 'frigid', water: true },
    });
    const sampler = new PlanetTerrainSampler({ frozenLake }, 5);
    const surface = sampler.sampleSurface(0, 0);
    expect(surface.frozenWater).toBe(true);
    expect(sampler.blockAt(0, surface.waterLevel!, 0, surface)).toBe(30);
  });

  it('uses authored relief height to increase walk-mode terrain variation', () => {
    const base = entity({
      id: 'relief',
      type: 'region',
      geometry: { type: 'Polygon', coordinates: [[[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]]] },
      properties: { biome: 'lush-grassland', topography: 'mountains', reliefHeight: 3_600 },
    });
    const rugged = new PlanetTerrainSampler({ relief: base }, 91);
    const flat = new PlanetTerrainSampler({ relief: { ...base, properties: { biome: 'lush-grassland', topography: 'plains', reliefHeight: 0 } } }, 91);
    const ruggedHeights: number[] = [];
    const flatHeights: number[] = [];
    for (let x = -100; x <= 100; x += 10) {
      for (let z = -100; z <= 100; z += 10) {
        ruggedHeights.push(rugged.sampleSurface(x, z).elevation);
        flatHeights.push(flat.sampleSurface(x, z).elevation);
      }
    }
    expect(Math.max(...ruggedHeights) - Math.min(...ruggedHeights))
      .toBeGreaterThan(Math.max(...flatHeights) - Math.min(...flatHeights));
  });

  it('snow-covers frigid mountain terrain instead of exposing cobblestone', () => {
    const tundra = entity({
      id: 'frigid-mountains',
      type: 'region',
      geometry: { type: 'Polygon', coordinates: [[[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]]] },
      properties: { biome: 'mountain-slate', climate: 'frigid', topography: 'mountains' },
    });
    const sampler = new PlanetTerrainSampler({ tundra }, 7);
    const surfaces = Array.from({ length: 441 }, (_, index) => {
      const x = index % 21 * 17 - 170;
      const z = Math.floor(index / 21) * 17 - 170;
      return sampler.sampleSurface(x, z);
    });
    expect(surfaces.every((sample) => sample.biome === 'snowy-tundra')).toBe(true);
    expect(surfaces.some((sample) => sample.surfaceBlockId === 8)).toBe(true);
    expect(surfaces.some((sample) => sample.surfaceBlockId !== 8)).toBe(true);
  });

  it('shares deterministic foliage cells and exact tree positions', () => {
    const enabledCells = Array.from({ length: 20 }, (_, cellX) =>
      foliageCellHasTree(12, 'lush-grassland', false, cellX, 3),
    );
    expect(enabledCells.some(Boolean)).toBe(true);
    expect(enabledCells.some((enabled) => !enabled)).toBe(true);
    expect(foliageTreePosition(12, 4, 3)).toEqual(foliageTreePosition(12, 4, 3));
  });

  it('adds deterministic plants, cave air, and tropical pond cells', () => {
    const natural = entity({
      id: 'natural-variety', type: 'region',
      geometry: { type: 'Polygon', coordinates: [[[-2, -2], [2, -2], [2, 2], [-2, 2], [-2, -2]]] },
      properties: { biome: 'lush-grassland', climate: 'temperate', topography: 'hills' },
    });
    const sampler = new PlanetTerrainSampler({ natural }, 23);
    let foundPlant = false;
    let foundCave = false;
    for (let x = -90; x <= 90; x += 3) {
      for (let z = -90; z <= 90; z += 3) {
        const surface = sampler.sampleSurface(x, z);
        if ([25, 26].includes(sampler.blockAt(x, surface.elevation + 1, z, surface))) foundPlant = true;
        for (let y = Math.max(-20, surface.elevation - 15); y <= surface.elevation - 5; y++) {
          if (sampler.blockAt(x, y, z, surface) === 0) foundCave = true;
        }
      }
    }
    expect(foundPlant).toBe(true);
    expect(foundCave).toBe(true);
    expect(naturalPondAt(23, 100, 100, 'forest-canopy')).toEqual(naturalPondAt(23, 100, 100, 'forest-canopy'));
  });

  it('lets nested regions override and inherit their containing landmass', () => {
    const continent = entity({
      id: 'continent',
      type: 'continent',
      geometry: { type: 'Polygon', coordinates: [[[-2, -2], [2, -2], [2, 2], [-2, 2], [-2, -2]]] },
      properties: { biome: 'lush-grassland', climate: 'frigid' },
    });
    const inheritedRegion = entity({
      id: 'inherited',
      type: 'region',
      geometry: { type: 'Polygon', coordinates: [[[-1, -1], [0, -1], [0, 1], [-1, 1], [-1, -1]]] },
    });
    const aridRegion = entity({
      id: 'arid',
      type: 'region',
      geometry: { type: 'Polygon', coordinates: [[[0, -1], [1, -1], [1, 1], [0, 1], [0, -1]]] },
      properties: { climate: 'arid' },
    });
    const sampler = new PlanetTerrainSampler({ continent, inheritedRegion, aridRegion }, 3);
    const [snowX, snowZ] = lonLatToPlanetMeters(-0.5, 0);
    const [sandX, sandZ] = lonLatToPlanetMeters(0.5, 0);

    expect(sampler.sampleSurface(snowX, snowZ).biome).toBe('snowy-tundra');
    expect(sampler.sampleSurface(sandX, sandZ).biome).toBe('desert-dunes');
  });

  it('recognizes a nested default-biome city and generates streets and buildings', () => {
    const continent = entity({
      id: 'continent',
      type: 'continent',
      geometry: { type: 'Polygon', coordinates: [[[-2, -2], [2, -2], [2, 2], [-2, 2], [-2, -2]]] },
      properties: { biome: 'lush-grassland' },
    });
    const city = entity({
      id: 'city',
      type: 'city',
      geometry: { type: 'Polygon', coordinates: [[[-0.02, -0.02], [0.02, -0.02], [0.02, 0.02], [-0.02, 0.02], [-0.02, -0.02]]] },
      properties: { biome: 'satellite-blend' },
    });
    const sampler = new PlanetTerrainSampler({ continent, city }, 17);
    expect(sampler.sampleSurface(0, 0).biome).toBe('city-urban');

    let foundRoad = false;
    let foundOpenGround = false;
    let foundWall = false;
    let foundWindow = false;
    for (let x = -30; x <= 30; x++) {
      for (let z = -30; z <= 30; z++) {
        const sample = sampler.sampleSurface(x, z);
        const surfaceBlock = sampler.blockAt(x, sample.elevation, z, sample);
        if (surfaceBlock === 13) foundRoad = true;
        if (surfaceBlock === 3) foundOpenGround = true;
        for (let y = sample.elevation + 1; y <= sample.elevation + 25; y++) {
          const block = sampler.blockAt(x, y, z, sample);
          if (block === 11 || block === 12) foundWall = true;
          if (block === 10) foundWindow = true;
        }
      }
    }
    expect(foundRoad).toBe(true);
    expect(foundOpenGround).toBe(true);
    expect(foundWall).toBe(true);
    expect(foundWindow).toBe(true);
  });
});

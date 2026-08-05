import { describe, expect, it } from 'vitest';
import { clusteredOreAt, isNoiseIntersectionCave, sampleV7TerrainFields, valueNoise2D } from './LuantiMapgen';

describe('Luanti-style mapgen fields', () => {
  it('is deterministic and spatially coherent', () => {
    const sample = sampleV7TerrainFields(42, 100, -80);
    expect(sampleV7TerrainFields(42, 100, -80)).toEqual(sample);
    expect(Math.abs(valueNoise2D(42, 100, -80, 100) - valueNoise2D(42, 101, -80, 100))).toBeLessThan(0.05);
  });

  it('produces both solid and cave positions', () => {
    const values = new Set<boolean>();
    for (let x = 0; x < 80; x += 4) {
      for (let y = -30; y < 0; y += 3) values.add(isNoiseIntersectionCave(7, x, y, 11));
    }
    expect(values).toEqual(new Set([false, true]));
  });

  it('clusters ores below their minimum depths', () => {
    expect(clusteredOreAt(9, 0, -4, 0, 4)).toBeNull();
    const ores = new Set<number>();
    for (let x = -30; x <= 30; x++) {
      for (let y = -24; y <= -8; y++) {
        const ore = clusteredOreAt(9, x, y, 3, 20);
        if (ore !== null) ores.add(ore);
      }
    }
    expect(ores.has(34)).toBe(true);
    expect(ores.has(35)).toBe(true);
  });
});

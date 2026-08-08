import { describe, expect, it } from 'vitest';
import { estimateSettlementPopulation, simplifyRingPoints } from './DrawController';
import { createAntimeridianSafePolygon, repairAntimeridianGeometry } from '@/geo/antimeridian';

describe('freehand geometry helpers', () => {
  it('preserves enough samples for a small city outline', () => {
    const points = Array.from({ length: 24 }, (_, index): [number, number] => {
      const angle = index / 24 * Math.PI * 2;
      return [Math.cos(angle) * 0.00008, Math.sin(angle) * 0.00008];
    });
    expect(simplifyRingPoints(points).length).toBeGreaterThan(8);
  });

  it('treats adjacent samples across the antimeridian as nearby', () => {
    const points: [number, number][] = [
      [179.5, 1], [179.8, 1], [-179.9, 1], [-179.6, 1], [-179.5, 2],
    ];
    const simplified = simplifyRingPoints(points, 0.01);
    const longitudes = simplified.map(([longitude]) => longitude);
    expect(Math.max(...longitudes) - Math.min(...longitudes)).toBeLessThan(2);
  });

  it('splits a date-line crossing freehand shape instead of filling its inverse', () => {
    const geometry = createAntimeridianSafePolygon([
      [179, -2], [-179, -2], [-179, 2], [179, 2],
    ]);

    expect(geometry.type).toBe('MultiPolygon');
    if (geometry.type !== 'MultiPolygon') return;
    expect(geometry.coordinates).toHaveLength(2);
    for (const part of geometry.coordinates) {
      const longitudes = part[0]!.map(([longitude]) => longitude);
      expect(Math.max(...longitudes) - Math.min(...longitudes)).toBeLessThanOrEqual(1.01);
    }
  });

  it('repairs a previously saved inverse freehand polygon on load', () => {
    const geometry = repairAntimeridianGeometry({
      type: 'Polygon',
      coordinates: [[
        [179, -2], [-179, -2], [-179, 2], [179, 2], [179, -2],
      ]],
    });

    expect(geometry.type).toBe('MultiPolygon');
  });

  it('derives population from the drawn footprint instead of a giant fixed default', () => {
    const ring: [number, number][] = [
      [-0.0005, -0.0005], [0.0005, -0.0005], [0.0005, 0.0005], [-0.0005, 0.0005], [-0.0005, -0.0005],
    ];
    expect(estimateSettlementPopulation(ring, 'city')).toBeGreaterThanOrEqual(1_000);
    expect(estimateSettlementPopulation(ring, 'city')).toBeLessThan(25_000);
  });
});

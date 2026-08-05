import { describe, expect, it } from 'vitest';
import { estimateSettlementPopulation, simplifyRingPoints } from './DrawController';

describe('freehand geometry helpers', () => {
  it('preserves enough samples for a small city outline', () => {
    const points = Array.from({ length: 24 }, (_, index): [number, number] => {
      const angle = index / 24 * Math.PI * 2;
      return [Math.cos(angle) * 0.00008, Math.sin(angle) * 0.00008];
    });
    expect(simplifyRingPoints(points).length).toBeGreaterThan(8);
  });

  it('derives population from the drawn footprint instead of a giant fixed default', () => {
    const ring: [number, number][] = [
      [-0.0005, -0.0005], [0.0005, -0.0005], [0.0005, 0.0005], [-0.0005, 0.0005], [-0.0005, -0.0005],
    ];
    expect(estimateSettlementPopulation(ring, 'city')).toBeGreaterThanOrEqual(1_000);
    expect(estimateSettlementPopulation(ring, 'city')).toBeLessThan(25_000);
  });
});

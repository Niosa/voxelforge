import { describe, expect, it } from 'vitest';

import { offsetAxis, offsetVoxelCoord3 } from './blueprintChunkMath';

const CHUNK = 16;

describe('offsetAxis', () => {
  it('keeps in-chunk positive offsets', () => {
    expect(offsetAxis(0, 3, 2, CHUNK)).toEqual({ chunk: 0, local: 5 });
  });

  it('keeps in-chunk negative offsets', () => {
    expect(offsetAxis(0, 3, -2, CHUNK)).toEqual({ chunk: 0, local: 1 });
  });

  it('crosses into the next chunk', () => {
    expect(offsetAxis(0, 15, 1, CHUNK)).toEqual({ chunk: 1, local: 0 });
  });

  it('crosses into the previous chunk without negative modulo', () => {
    // The old bug: (0 + -2) % 16 === -2 in JS. Correct: chunk -1, local 14.
    expect(offsetAxis(0, 0, -2, CHUNK)).toEqual({ chunk: -1, local: 14 });
  });

  it('handles multi-chunk spans in both directions', () => {
    expect(offsetAxis(1, 4, 40, CHUNK)).toEqual({ chunk: 3, local: 12 });
    expect(offsetAxis(1, 4, -40, CHUNK)).toEqual({ chunk: -2, local: 12 });
  });

  it('never returns a negative local and always round-trips', () => {
    for (let local = 0; local < CHUNK; local++) {
      for (let delta = -64; delta <= 64; delta++) {
        const r = offsetAxis(0, local, delta, CHUNK);
        expect(r.local).toBeGreaterThanOrEqual(0);
        expect(r.local).toBeLessThan(CHUNK);
        expect(r.chunk * CHUNK + r.local).toBe(local + delta);
      }
    }
  });
});

describe('offsetVoxelCoord3', () => {
  it('places a 5-wide blueprint centered on a chunk edge without wrapping', () => {
    // blueprint_tower spans x/y in [-2, +2]; an origin at local x = 0 must
    // cross into the previous chunk instead of wrapping to local 14 of the
    // same chunk.
    const r = offsetVoxelCoord3(
      { cx: 4, cy: 4, cz: 0, lx: 0, ly: 8, lz: 0 },
      -2,
      0,
      0,
      CHUNK,
    );
    expect(r).toEqual({ cx: 3, cy: 4, cz: 0, lx: 14, ly: 8, lz: 0 });
  });

  it('offsets all three axes independently', () => {
    const r = offsetVoxelCoord3(
      { cx: 0, cy: 0, cz: 0, lx: 15, ly: 0, lz: 3 },
      1,
      -1,
      2,
      CHUNK,
    );
    expect(r).toEqual({ cx: 1, cy: -1, cz: 0, lx: 0, ly: 15, lz: 5 });
  });
});

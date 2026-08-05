import { describe, expect, it } from 'vitest';
import {
  isBlockWithinReach,
  placementPosition,
  nextTouchPitch,
  walkBlockTarget,
  viewBobOffset,
  cycleHotbarSelection,
  type WalkBlockTarget,
} from './WalkInteraction';

describe('walk block targeting', () => {
  it('cycles hotbar slots in both directions with wraparound', () => {
    const slots = [1, 2, 3];
    expect(cycleHotbarSelection(1, slots, 100)).toBe(2);
    expect(cycleHotbarSelection(1, slots, -100)).toBe(3);
    expect(cycleHotbarSelection(3, slots, 100)).toBe(1);
  });

  it('bobs only while grounded and moving, with a stronger sprint cadence', () => {
    expect(viewBobOffset(Math.PI / 2, 4.3, false, true)).toBeGreaterThan(0.04);
    expect(Math.abs(viewBobOffset(Math.PI / 2, 7.2, true, true))).toBeGreaterThan(Math.abs(viewBobOffset(Math.PI / 2, 4.3, false, true)));
    expect(viewBobOffset(Math.PI / 2, 4.3, false, false)).toBe(0);
    expect(viewBobOffset(Math.PI / 2, 0, false, true)).toBe(0);
  });
  it('maps a downward touch drag to a downward camera pitch', () => {
    expect(nextTouchPitch(0, 100)).toBeGreaterThan(0);
    expect(nextTouchPitch(0, -100)).toBeLessThan(0);
  });

  it('allows placement against the top face of a ground block', () => {
    const target: WalkBlockTarget = {
      position: [0, 3, 0],
      adjacent: [0, 4, 0],
    };
    expect(placementPosition(target, [0.5, 5, 2.5])).toEqual([0, 4, 0]);
  });

  it('accepts the typed-array targets emitted by noa', () => {
    expect(walkBlockTarget({
      position: new Float32Array([1, 2, 3]),
      adjacent: new Float32Array([1, 3, 3]),
    })).toEqual({ position: [1, 2, 3], adjacent: [1, 3, 3] });
  });

  it('rejects placement beyond the walk reach limit', () => {
    const target: WalkBlockTarget = {
      position: [20, 3, 0],
      adjacent: [19, 3, 0],
    };
    expect(isBlockWithinReach([0, 4, 0], target.position)).toBe(false);
    expect(placementPosition(target, [0, 4, 0])).toBeNull();
  });

});

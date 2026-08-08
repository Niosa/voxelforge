import { describe, expect, it } from 'vitest';
import { normalizeJoystickDelta } from './touchControls';

describe('normalizeJoystickDelta', () => {
  it('maps screen-up to forward movement', () => {
    expect(normalizeJoystickDelta(0, -25, 50)).toEqual({
      knobX: 0,
      knobY: -25,
      forward: 0.5,
      side: 0,
    });
  });

  it('clamps diagonal input to the joystick radius', () => {
    const value = normalizeJoystickDelta(100, 100, 50);
    expect(Math.hypot(value.knobX, value.knobY)).toBeCloseTo(50);
    expect(Math.hypot(value.side, value.forward)).toBeCloseTo(1);
  });

  it('returns a safe neutral value for an invalid radius', () => {
    expect(normalizeJoystickDelta(10, 10, 0)).toEqual({
      knobX: 0,
      knobY: 0,
      forward: 0,
      side: 0,
    });
  });
});

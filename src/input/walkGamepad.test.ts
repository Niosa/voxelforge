import { describe, expect, it } from 'vitest';
import { firstConnectedGamepad, gamepadAxis, gamepadLookAxis, nextGamepadSprintToggle, readWalkGamepad } from './walkGamepad';

function pad(overrides: Partial<Gamepad> = {}): Gamepad {
  const buttons = Array.from({ length: 16 }, () => ({ pressed: false, touched: false, value: 0 }));
  return {
    axes: [0, 0, 0, 0],
    buttons,
    connected: true,
    id: 'standard test pad',
    index: 0,
    mapping: 'standard',
    timestamp: 0,
    vibrationActuator: null,
    ...overrides,
  } as Gamepad;
}

describe('walk gamepad mapping', () => {
  it('filters drift and rescales useful stick input', () => {
    expect(gamepadAxis(0.1)).toBe(0);
    expect(gamepadAxis(-1)).toBe(-1);
    expect(gamepadAxis(0.59)).toBeCloseTo(0.5, 1);
  });

  it('gives the camera stick a precise curved response', () => {
    expect(gamepadLookAxis(0.08)).toBe(0);
    expect(gamepadLookAxis(0.3)).toBeGreaterThan(0);
    expect(gamepadLookAxis(0.3)).toBeLessThan(gamepadAxis(0.3, 0.1));
    expect(gamepadLookAxis(-1)).toBe(-1);
  });

  it('maps standard sticks, triggers, and face buttons', () => {
    const gamepad = pad({ axes: [0.5, -0.75, -0.5, 0.75] });
    (gamepad.buttons[0] as { pressed: boolean }).pressed = true;
    (gamepad.buttons[6] as { value: number }).value = 0.8;
    (gamepad.buttons[10] as { pressed: boolean }).pressed = true;
    (gamepad.buttons[3] as { pressed: boolean }).pressed = true;
    const state = readWalkGamepad(gamepad);
    expect(state.forward).toBeGreaterThan(0);
    expect(state.side).toBeGreaterThan(0);
    expect(state.lookX).toBeLessThan(0);
    expect(state.lookY).toBeGreaterThan(0);
    expect(state.jump).toBe(true);
    expect(state.useOrPlace).toBe(true);
    expect(state.sprint).toBe(true);
    expect(state.toggleInventory).toBe(true);
  });

  it('selects the first connected controller', () => {
    expect(firstConnectedGamepad([null, pad({ index: 1 })])?.index).toBe(1);
    expect(firstConnectedGamepad([null])).toBeNull();
  });

  it('toggles sprint only on the stick-click edge', () => {
    expect(nextGamepadSprintToggle(false, true, false)).toBe(true);
    expect(nextGamepadSprintToggle(true, true, true)).toBe(true);
    expect(nextGamepadSprintToggle(true, false, true)).toBe(true);
    expect(nextGamepadSprintToggle(true, true, false)).toBe(false);
  });
});

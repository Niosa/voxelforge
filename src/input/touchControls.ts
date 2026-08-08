export interface JoystickVector {
  knobX: number;
  knobY: number;
  forward: number;
  side: number;
}

export function normalizeJoystickDelta(dx: number, dy: number, radius: number): JoystickVector {
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || radius <= 0) {
    return { knobX: 0, knobY: 0, forward: 0, side: 0 };
  }
  const distance = Math.hypot(dx, dy);
  const scale = distance > radius ? radius / distance : 1;
  const knobX = dx * scale;
  const knobY = dy * scale;
  return {
    knobX,
    knobY,
    forward: -knobY / radius,
    side: knobX / radius,
  };
}

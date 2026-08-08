export interface WalkGamepadState {
  forward: number;
  side: number;
  lookX: number;
  lookY: number;
  jump: boolean;
  descend: boolean;
  sprint: boolean;
  breakBlock: boolean;
  useOrPlace: boolean;
  previousSlot: boolean;
  nextSlot: boolean;
  toggleFlight: boolean;
  toggleInventory: boolean;
}

const DEFAULT_DEADZONE = 0.18;
const LOOK_DEADZONE = 0.1;

/** Removes stick drift while preserving the full usable range outside the deadzone. */
export function gamepadAxis(value: number | undefined, deadzone = DEFAULT_DEADZONE): number {
  if (!Number.isFinite(value)) return 0;
  const magnitude = Math.abs(value!);
  if (magnitude <= deadzone) return 0;
  return Math.sign(value!) * Math.min(1, (magnitude - deadzone) / (1 - deadzone));
}

/** Softer camera-stick curve: small deflections stay precise while the outer
 * range still reaches full turning speed. */
export function gamepadLookAxis(value: number | undefined): number {
  const linear = gamepadAxis(value, LOOK_DEADZONE);
  return Math.sign(linear) * Math.pow(Math.abs(linear), 1.45);
}

function pressed(gamepad: Gamepad, index: number): boolean {
  const button = gamepad.buttons[index];
  return Boolean(button && (button.pressed || button.value >= 0.5));
}

/** Standard Gamepad mapping shared by Xbox, PlayStation, Switch Pro, and most web controllers. */
export function readWalkGamepad(gamepad: Gamepad): WalkGamepadState {
  return {
    side: gamepadAxis(gamepad.axes[0]),
    forward: -gamepadAxis(gamepad.axes[1]),
    lookX: gamepadLookAxis(gamepad.axes[2]),
    lookY: gamepadLookAxis(gamepad.axes[3]),
    jump: pressed(gamepad, 0),
    descend: pressed(gamepad, 1),
    sprint: pressed(gamepad, 10),
    previousSlot: pressed(gamepad, 4) || pressed(gamepad, 14),
    nextSlot: pressed(gamepad, 5) || pressed(gamepad, 15),
    breakBlock: pressed(gamepad, 7),
    useOrPlace: pressed(gamepad, 6),
    toggleFlight: pressed(gamepad, 12),
    toggleInventory: pressed(gamepad, 3),
  };
}

export function firstConnectedGamepad(gamepads: readonly (Gamepad | null)[]): Gamepad | null {
  return gamepads.find((gamepad): gamepad is Gamepad => Boolean(gamepad?.connected)) ?? null;
}

export function nextGamepadSprintToggle(current: boolean, pressedNow: boolean, pressedPreviously: boolean): boolean {
  return pressedNow && !pressedPreviously ? !current : current;
}

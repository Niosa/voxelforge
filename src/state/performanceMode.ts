/**
 * Adaptive "Performance Mode" for low-power devices (older iPads, low-memory
 * phones). Auto-detected from the user agent / hardware hints, with a manual
 * override persisted to localStorage. The override always wins over
 * auto-detection so false positives on newer devices can be corrected by the
 * user.
 */

const PERF_MODE_KEY = 'terraforge_performance_mode_v1';

/**
 * Returns true when the device looks low-power: iOS/iPadOS, or
 * deviceMemory <= 4 GB, or hardwareConcurrency <= 4 cores.
 */
export function detectLowPowerDevice(): boolean {
  if (typeof navigator === 'undefined') return false;

  const cores = navigator.hardwareConcurrency ?? 4;
  const memory = (navigator as { deviceMemory?: number }).deviceMemory;

  // High-end iPads / Apple Silicon devices with 8+ CPU cores run at full desktop performance
  if (cores >= 8) return false;

  const ua = navigator.userAgent || '';
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints ?? 0) > 1);
  if (isIOS) return true;

  if (typeof memory === 'number' && memory <= 4) return true;
  if (cores <= 4) return true;

  return false;
}

/** Manual override from localStorage: true = forced ON, false = forced OFF, null = auto. */
export function getPerformanceModeOverride(): boolean | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(PERF_MODE_KEY);
    if (raw === 'on') return true;
    if (raw === 'off') return false;
  } catch (_) {
    /* ignore */
  }
  return null;
}

export function setPerformanceModeOverride(value: boolean | null): void {
  try {
    if (typeof localStorage === 'undefined') return;
    if (value === null) {
      localStorage.removeItem(PERF_MODE_KEY);
    } else {
      localStorage.setItem(PERF_MODE_KEY, value ? 'on' : 'off');
    }
  } catch (_) {
    /* ignore */
  }
}

/** Resolved mode: persisted manual override wins, otherwise auto-detection. */
export function isPerformanceModeActive(): boolean {
  const override = getPerformanceModeOverride();
  if (override !== null) return override;
  return detectLowPowerDevice();
}

/** Alias kept for store initialization call sites. */
export function getInitialPerformanceMode(): boolean {
  return isPerformanceModeActive();
}

/** Alias kept for store setter call sites (persists the manual override). */
export function persistPerformanceMode(on: boolean): void {
  setPerformanceModeOverride(on);
}

import {
  Viewer,
  Cartesian3,
  HeadingPitchRoll,
  PerspectiveFrustum,
} from 'cesium';

export interface CameraPose {
  position: Cartesian3;
  heading: number;
  pitch: number;
  roll: number;
  fov?: number;
}

export function cubicEaseOut(t: number): number {
  const f = t - 1;
  return f * f * f + 1;
}

/**
 * Smoothly animates the Cesium camera from a start pose to an end pose over durationMs.
 */
export function animateCameraTransition(
  viewer: Viewer,
  start: CameraPose,
  end: CameraPose,
  durationMs = 1000,
  onComplete?: () => void,
): void {
  if (!viewer || viewer.isDestroyed()) {
    if (onComplete) onComplete();
    return;
  }

  const startTime = performance.now();

  function step(now: number) {
    if (!viewer || viewer.isDestroyed()) return;

    const elapsed = now - startTime;
    const rawProgress = Math.min(1, elapsed / durationMs);
    const ease = cubicEaseOut(rawProgress);

    // Linear Cartesian3 position interpolation
    const curPos = Cartesian3.lerp(start.position, end.position, ease, new Cartesian3());

    // Angular orientation lerp
    const curHeading = start.heading + (end.heading - start.heading) * ease;
    const curPitch = start.pitch + (end.pitch - start.pitch) * ease;
    const curRoll = start.roll + (end.roll - start.roll) * ease;

    // FOV lerp
    if (start.fov !== undefined && end.fov !== undefined && viewer.camera.frustum instanceof PerspectiveFrustum) {
      viewer.camera.frustum.fov = start.fov + (end.fov - start.fov) * ease;
    }

    viewer.camera.setView({
      destination: curPos,
      orientation: new HeadingPitchRoll(curHeading, curPitch, curRoll),
    });

    viewer.scene.requestRender();

    if (rawProgress < 1) {
      requestAnimationFrame(step);
    } else {
      if (onComplete) onComplete();
    }
  }

  requestAnimationFrame(step);
}

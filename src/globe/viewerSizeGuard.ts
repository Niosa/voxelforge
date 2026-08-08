import type { Scene, Viewer } from 'cesium';

const MIN_RENDER_SIZE_PX = 2;

export function hasRenderableViewerArea(width: number, height: number): boolean {
  return Number.isFinite(width)
    && Number.isFinite(height)
    && width >= MIN_RENDER_SIZE_PX
    && height >= MIN_RENDER_SIZE_PX;
}

function containerSize(container: HTMLElement): readonly [number, number] {
  const bounds = container.getBoundingClientRect();
  return [Math.max(container.clientWidth, bounds.width), Math.max(container.clientHeight, bounds.height)];
}

/**
 * Cesium allocates framebuffers from the current canvas dimensions. Safari can
 * transiently report 0x0 during orientation, address-bar, tab-resume, and
 * fullscreen transitions. Pause the default loop before that frame is rendered
 * and resume only after resize() has produced a valid drawing buffer.
 */
export function attachViewerSizeGuard(viewer: Viewer, container: HTMLElement): () => void {
  let disposed = false;
  let recoveryFrame: number | null = null;

  const pauseIfInvalid = (): boolean => {
    const [width, height] = containerSize(container);
    if (!document.hidden && hasRenderableViewerArea(width, height)) return false;
    viewer.useDefaultRenderLoop = false;
    return true;
  };

  const recover = (): void => {
    recoveryFrame = null;
    if (disposed || viewer.isDestroyed() || pauseIfInvalid()) return;
    try {
      viewer.resize();
      if (!hasRenderableViewerArea(viewer.canvas.width, viewer.canvas.height)) {
        viewer.useDefaultRenderLoop = false;
        return;
      }
      viewer.useDefaultRenderLoop = true;
      viewer.scene.requestRender();
    } catch (error) {
      viewer.useDefaultRenderLoop = false;
      console.warn('[Cesium] Deferred rendering until the viewport stabilizes:', error);
    }
  };

  const scheduleRecovery = (): void => {
    if (disposed || viewer.isDestroyed()) return;
    if (pauseIfInvalid()) return;
    if (recoveryFrame !== null) window.cancelAnimationFrame(recoveryFrame);
    recoveryFrame = window.requestAnimationFrame(recover);
  };

  const resizeObserver = typeof ResizeObserver === 'undefined'
    ? null
    : new ResizeObserver(() => scheduleRecovery());
  resizeObserver?.observe(container);

  const onVisibilityChange = (): void => {
    if (document.hidden) {
      if (recoveryFrame !== null) window.cancelAnimationFrame(recoveryFrame);
      recoveryFrame = null;
      viewer.useDefaultRenderLoop = false;
      return;
    }
    scheduleRecovery();
  };
  document.addEventListener('visibilitychange', onVisibilityChange);

  const onRenderError = (_scene: Scene, error: unknown): void => {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes('Expected width to be greater than 0')
      && !message.includes('Expected height to be greater than 0')) {
      console.error('[Cesium] Render loop error:', error);
    }
    viewer.useDefaultRenderLoop = false;
    scheduleRecovery();
  };
  viewer.scene.renderError.addEventListener(onRenderError);

  scheduleRecovery();

  return () => {
    disposed = true;
    resizeObserver?.disconnect();
    document.removeEventListener('visibilitychange', onVisibilityChange);
    if (!viewer.isDestroyed()) viewer.scene.renderError.removeEventListener(onRenderError);
    if (recoveryFrame !== null) window.cancelAnimationFrame(recoveryFrame);
  };
}

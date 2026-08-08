import { describe, expect, it } from 'vitest';
import { hasRenderableViewerArea } from './viewerSizeGuard';

describe('Cesium viewer size guard', () => {
  it('rejects transient zero and sub-pixel framebuffer dimensions', () => {
    expect(hasRenderableViewerArea(0, 768)).toBe(false);
    expect(hasRenderableViewerArea(1024, 0)).toBe(false);
    expect(hasRenderableViewerArea(1, 768)).toBe(false);
    expect(hasRenderableViewerArea(Number.NaN, 768)).toBe(false);
  });

  it('accepts a stable renderable viewport', () => {
    expect(hasRenderableViewerArea(2, 2)).toBe(true);
    expect(hasRenderableViewerArea(2048, 1536)).toBe(true);
  });
});

import type { DrawTool, DrawToolContext } from './types';

/** Phase 3: implement screen→cartographic vertex capture */
export class DrawPolygonTool implements DrawTool {
  readonly id = 'drawPolygon' as const;
  private ctx: DrawToolContext | null = null;

  activate(ctx: DrawToolContext): void {
    this.ctx = ctx;
  }

  deactivate(): void {
    this.ctx = null;
  }

  getContext(): DrawToolContext | null {
    return this.ctx;
  }
}

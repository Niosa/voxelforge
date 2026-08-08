import type { DrawTool, DrawToolContext } from './types';

/** Phase 3: point placement tool */
export class PlacePointTool implements DrawTool {
  readonly id = 'placePoint' as const;
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

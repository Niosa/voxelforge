import type { ToolMode } from '@/entities/types';

export interface DrawToolContext {
  mode: ToolMode;
  onCompletePolygon: (ring: [number, number][]) => void;
  onPlacePoint: (lon: number, lat: number) => void;
  onCancel: () => void;
}

export interface DrawTool {
  readonly id: ToolMode;
  activate(ctx: DrawToolContext): void;
  deactivate(): void;
}

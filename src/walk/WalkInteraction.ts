export const WALK_REACH_BLOCKS = 6;

export function viewBobOffset(phase: number, speed: number, sprinting: boolean, grounded: boolean): number {
  if (!grounded || speed < 0.15) return 0;
  const amplitude = sprinting ? 0.075 : 0.045;
  return Math.sin(phase) * amplitude + Math.abs(Math.cos(phase * 0.5)) * amplitude * 0.18;
}

export function cycleHotbarSelection(currentId: number, slotIds: readonly number[], wheelDelta: number): number {
  if (slotIds.length === 0 || wheelDelta === 0 || !Number.isFinite(wheelDelta)) return currentId;
  const currentIndex = slotIds.indexOf(currentId);
  const startIndex = currentIndex >= 0 ? currentIndex : 0;
  const direction = wheelDelta > 0 ? 1 : -1;
  return slotIds[(startIndex + direction + slotIds.length) % slotIds.length]!;
}

import type { WalkAnchor } from '@/entities/types';

export type BlockPosition = readonly [number, number, number];

export interface WalkBlockTarget {
  position: BlockPosition;
  adjacent: BlockPosition;
  normal?: readonly [number, number, number];
}

export function nextTouchPitch(currentPitch: number, deltaY: number, sensitivity = 0.003, maxPitch = 1.45): number {
  return Math.max(-maxPitch, Math.min(maxPitch, currentPitch + deltaY * sensitivity));
}

function blockPosition(value: unknown): BlockPosition | null {
  if (!value || typeof value !== 'object' || !(Array.isArray(value) || ArrayBuffer.isView(value))) return null;
  const coordinates = value as unknown as ArrayLike<unknown>;
  if (coordinates.length < 3) return null;
  const x = coordinates[0];
  const y = coordinates[1];
  const z = coordinates[2];
  if (typeof x !== 'number' || typeof y !== 'number' || typeof z !== 'number') return null;
  return [x, y, z];
}

export function walkLocationKey(anchor: WalkAnchor): string {
  return `${anchor.lon.toFixed(4)},${anchor.lat.toFixed(4)}`;
}

export function walkAnchorsMatch(left: WalkAnchor, right: WalkAnchor): boolean {
  return walkLocationKey(left) === walkLocationKey(right);
}

export function walkBlockTarget(value: unknown): WalkBlockTarget | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as { position?: unknown; adjacent?: unknown };
  const position = blockPosition(candidate.position);
  const adjacent = blockPosition(candidate.adjacent);
  return position && adjacent ? { position, adjacent } : null;
}

export function isBlockWithinReach(
  playerPosition: readonly number[],
  blockPosition: BlockPosition,
  maxReach = WALK_REACH_BLOCKS,
): boolean {
  if (playerPosition.length < 3 || maxReach <= 0) return false;
  const dx = blockPosition[0] + 0.5 - playerPosition[0]!;
  const dy = blockPosition[1] + 0.5 - playerPosition[1]!;
  const dz = blockPosition[2] + 0.5 - playerPosition[2]!;
  return dx * dx + dy * dy + dz * dz <= maxReach * maxReach;
}

export function placementPosition(
  target: WalkBlockTarget | null,
  playerPosition: readonly number[],
  maxReach = WALK_REACH_BLOCKS,
): BlockPosition | null {
  if (!target || !isBlockWithinReach(playerPosition, target.adjacent, maxReach)) return null;
  return target.adjacent;
}

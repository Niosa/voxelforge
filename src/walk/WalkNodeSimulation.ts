import {
  BLOCK_AIR,
  MAX_LIQUID_LEVEL,
  flowingLiquidBlockId,
  getBlockGroup,
  liquidKind,
  liquidLevel,
  type LiquidKind,
} from './blockRegistry';

export type MutableBlockPosition = [number, number, number];

export interface WalkVoxelAccess {
  getBlock(x: number, y: number, z: number): number;
  setBlock(blockId: number, position: MutableBlockPosition): void;
  onChanged(position: MutableBlockPosition): void;
}

function positionKey([x, y, z]: MutableBlockPosition): string {
  return `${x},${y},${z}`;
}

function parsePosition(key: string): MutableBlockPosition {
  const coordinates = key.split(',').map(Number);
  return [coordinates[0]!, coordinates[1]!, coordinates[2]!];
}

/** Budgeted active-node processing, so a local edit never scans whole chunks. */
export class WalkNodeSimulation {
  private readonly queued = new Set<string>();

  constructor(private readonly voxels: WalkVoxelAccess) {}

  enqueue(position: MutableBlockPosition): void {
    this.queued.add(positionKey(position));
  }

  enqueueNeighborhood([x, y, z]: MutableBlockPosition): void {
    this.enqueue([x, y, z]);
    this.enqueue([x, y + 1, z]);
    this.enqueue([x, y - 1, z]);
    this.enqueue([x + 1, y, z]);
    this.enqueue([x - 1, y, z]);
    this.enqueue([x, y, z + 1]);
    this.enqueue([x, y, z - 1]);
  }

  step(budget = 24): number {
    let changed = 0;
    const pending = [...this.queued].slice(0, Math.max(0, budget));
    for (const key of pending) {
      this.queued.delete(key);
      const position = parsePosition(key);
      if (this.tryFall(position)) changed += 1;
      else if (this.tryFlow(position)) changed += 1;
    }
    return changed;
  }

  private tryFlow([x, y, z]: MutableBlockPosition): boolean {
    if (y <= -32 || y >= 96) return false;
    const blockId = this.voxels.getBlock(x, y, z);
    const kind = liquidKind(blockId);
    const level = liquidLevel(blockId);
    if (!kind || level === null) return false;

    if (level > 0 && !this.hasFlowSupport(x, y, z, kind, level)) {
      const position: MutableBlockPosition = [x, y, z];
      this.voxels.setBlock(BLOCK_AIR, position);
      this.voxels.onChanged(position);
      this.enqueueNeighborhood(position);
      return true;
    }

    const below: MutableBlockPosition = [x, y - 1, z];
    if (this.canReplaceWithFlow(below, kind, 1)) {
      this.writeFlow(below, kind, 1);
      return true;
    }

    const nextLevel = level + 1;
    if (nextLevel > MAX_LIQUID_LEVEL || (kind === 'lava' && nextLevel > 4)) return false;
    let changed = false;
    for (const position of [[x + 1, y, z], [x - 1, y, z], [x, y, z + 1], [x, y, z - 1]] as MutableBlockPosition[]) {
      if (!this.canReplaceWithFlow(position, kind, nextLevel)) continue;
      this.writeFlow(position, kind, nextLevel);
      changed = true;
    }
    return changed;
  }

  private hasFlowSupport(x: number, y: number, z: number, kind: LiquidKind, level: number): boolean {
    const above = this.voxels.getBlock(x, y + 1, z);
    if (liquidKind(above) === kind) return true;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const neighbor = this.voxels.getBlock(x + dx, y, z + dz);
      const neighborLevel = liquidLevel(neighbor);
      if (liquidKind(neighbor) === kind && neighborLevel !== null && neighborLevel < level) return true;
    }
    return false;
  }

  private canReplaceWithFlow(position: MutableBlockPosition, kind: LiquidKind, level: number): boolean {
    const existing = this.voxels.getBlock(...position);
    if (existing === BLOCK_AIR) return true;
    if (liquidKind(existing) !== kind) return false;
    const existingLevel = liquidLevel(existing);
    return existingLevel !== null && existingLevel > level;
  }

  private writeFlow(position: MutableBlockPosition, kind: LiquidKind, level: number): void {
    this.voxels.setBlock(flowingLiquidBlockId(kind, level), position);
    this.voxels.onChanged(position);
    this.enqueue(position);
    this.enqueueNeighborhood(position);
  }

  private tryFall([x, y, z]: MutableBlockPosition): boolean {
    const blockId = this.voxels.getBlock(x, y, z);
    if (getBlockGroup(blockId, 'falling_node') === 0) return false;

    const below: MutableBlockPosition = [x, y - 1, z];
    const belowId = this.voxels.getBlock(...below);
    if (belowId !== BLOCK_AIR && getBlockGroup(belowId, 'liquid') === 0) return false;

    const from: MutableBlockPosition = [x, y, z];
    this.voxels.setBlock(BLOCK_AIR, from);
    this.voxels.setBlock(blockId, below);
    this.voxels.onChanged(from);
    this.voxels.onChanged(below);
    this.enqueue(below);
    this.enqueue([x, y + 1, z]);
    return true;
  }
}

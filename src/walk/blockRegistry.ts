/**
 * blockRegistry — maps integer block IDs to noa material definitions.
 *
 * Block IDs are stable integers stored in VoxelBlock.blockId.
 * ID 0 is always air (noa convention).
 *
 * Add new block types here; the noa world is initialised with this
 * registry in WalkScene.ts.
 */

export interface BlockDef {
  id: number;
  name: string;
  /** Solid colour fallback (CSS hex). Used for globe minimap rendering too. */
  color: string;
  /** Whether this block is solid (collidable). */
  solid: boolean;
  /** Optional texture atlas coords [u, v] (future use). */
  texture?: [number, number];
}

export const BLOCK_AIR = 0;

export const BLOCKS: BlockDef[] = [
  { id: 0,  name: 'air',          color: 'transparent', solid: false },
  { id: 1,  name: 'stone',        color: '#6b7280',     solid: true  },
  { id: 2,  name: 'dirt',         color: '#92400e',     solid: true  },
  { id: 3,  name: 'grass',        color: '#16a34a',     solid: true  },
  { id: 4,  name: 'sand',         color: '#fde68a',     solid: true  },
  { id: 5,  name: 'wood',         color: '#78350f',     solid: true  },
  { id: 6,  name: 'leaves',       color: '#15803d',     solid: false },
  { id: 7,  name: 'water',        color: '#0ea5e9',     solid: false },
  { id: 8,  name: 'snow',         color: '#f1f5f9',     solid: true  },
  { id: 9,  name: 'obsidian',     color: '#1e1b4b',     solid: true  },
  { id: 10, name: 'glass',        color: '#bae6fd',     solid: true  },
  { id: 11, name: 'brick',        color: '#b45309',     solid: true  },
  { id: 12, name: 'marble',       color: '#e2e8f0',     solid: true  },
  { id: 13, name: 'dark_stone',   color: '#374151',     solid: true  },
  { id: 14, name: 'gold_block',   color: '#ca8a04',     solid: true  },
  { id: 15, name: 'potato',       color: '#d4a017',     solid: true  },
];

export const BLOCK_BY_ID = new Map<number, BlockDef>(
  BLOCKS.map((b) => [b.id, b]),
);

export const BLOCK_BY_NAME = new Map<string, BlockDef>(
  BLOCKS.map((b) => [b.name, b]),
);

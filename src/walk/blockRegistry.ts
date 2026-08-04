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
  /** Emoji icon badge for hotbar & inventory */
  icon?: string;
  /** Optional texture URL or [top, bottom, side] texture URLs */
  textures?: string | [string, string, string];
}

export const BLOCK_AIR = 0;

export const BLOCKS: BlockDef[] = [
  { id: 0,  name: 'air',          color: 'transparent', solid: false, icon: '💨' },
  { id: 1,  name: 'stone',        color: '#6b7280',     solid: true,  icon: '🪨', textures: '/textures/blocks/stone.png' },
  { id: 2,  name: 'dirt',         color: '#92400e',     solid: true,  icon: '🟤', textures: '/textures/blocks/dirt.png' },
  { id: 3,  name: 'grass',        color: '#16a34a',     solid: true,  icon: '🌱', textures: ['/textures/blocks/grass_top.png', '/textures/blocks/dirt.png', '/textures/blocks/grass_side.png'] },
  { id: 4,  name: 'sand',         color: '#fde68a',     solid: true,  icon: '🏜️', textures: '/textures/blocks/sand.png' },
  { id: 5,  name: 'wood',         color: '#78350f',     solid: true,  icon: '🪵', textures: ['/textures/blocks/log_oak_top.png', '/textures/blocks/log_oak_top.png', '/textures/blocks/log_oak.png'] },
  { id: 6,  name: 'leaves',       color: '#15803d',     solid: false, icon: '🌿', textures: '/textures/blocks/azalea_leaves.png' },
  { id: 7,  name: 'water',        color: '#0ea5e9',     solid: false, icon: '💧', textures: '/textures/blocks/water_still.png' },
  { id: 8,  name: 'snow',         color: '#f1f5f9',     solid: true,  icon: '❄️', textures: '/textures/blocks/snow.png' },
  { id: 9,  name: 'obsidian',     color: '#1e1b4b',     solid: true,  icon: '🔮', textures: '/textures/blocks/obsidian.png' },
  { id: 10, name: 'glass',        color: '#bae6fd',     solid: true,  icon: '🪟', textures: '/textures/blocks/glass.png' },
  { id: 11, name: 'brick',        color: '#b45309',     solid: true,  icon: '🧱', textures: '/textures/blocks/brick.png' },
  { id: 12, name: 'marble',       color: '#e2e8f0',     solid: true,  icon: '🏛️', textures: '/textures/blocks/stonebrick.png' },
  { id: 13, name: 'dark_stone',   color: '#374151',     solid: true,  icon: '🏰', textures: '/textures/blocks/cobblestone.png' },
  { id: 14, name: 'gold_block',   color: '#ca8a04',     solid: true,  icon: '🟡', textures: '/textures/blocks/gold_block.png' },
  { id: 15, name: 'potato',       color: '#d4a017',     solid: true,  icon: '🥔', textures: '/textures/blocks/dirt.png' },
  { id: 16, name: 'lava',         color: '#ef4444',     solid: false, icon: '🔥', textures: '/textures/blocks/lava_still.png' },
  { id: 17, name: 'emerald',      color: '#10b981',     solid: true,  icon: '💎', textures: '/textures/blocks/emerald_block.png' },
  { id: 18, name: 'diamond',      color: '#38bdf8',     solid: true,  icon: '💠', textures: '/textures/blocks/diamond_block.png' },
  { id: 19, name: 'cyber_cyan',   color: '#06b6d4',     solid: true,  icon: '⚡' },
  { id: 20, name: 'cyber_pink',   color: '#ec4899',     solid: true,  icon: '✨' },
  { id: 21, name: 'torch',        color: '#f59e0b',     solid: false, icon: '🕯️', textures: '/textures/blocks/torch_on.png' },
  { id: 22, name: 'thatch_roof', color: '#d97706',     solid: true,  icon: '🌾', textures: '/textures/blocks/planks_oak.png' },
];

export const BLOCK_BY_ID = new Map<number, BlockDef>(
  BLOCKS.map((b) => [b.id, b]),
);

export const BLOCK_BY_NAME = new Map<string, BlockDef>(
  BLOCKS.map((b) => [b.name, b]),
);


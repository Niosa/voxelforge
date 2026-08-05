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
  /** Hidden state variants (for example an open door) are not selectable. */
  placeable?: boolean;
  /** Luanti-style behavioral groups queried by gameplay systems. */
  groups?: Readonly<Record<string, number>>;
  /** Block dropped when this node is dug. Defaults to the node itself. */
  drop?: number;
}

export const BLOCK_AIR = 0;
export const BLOCK_WATER_SOURCE = 7;
export const BLOCK_LAVA_SOURCE = 16;
export const BLOCK_WATER_FLOWING_START = 48;
export const BLOCK_LAVA_FLOWING_START = 55;
export const MAX_LIQUID_LEVEL = 7;

export const BLOCKS: BlockDef[] = [
  { id: 0,  name: 'air',          color: 'transparent', solid: false, icon: '💨' },
  { id: 1,  name: 'stone',        color: '#6b7280',     solid: true,  icon: '🪨', textures: '/textures/blocks/stone.png', groups: { cracky: 3, stone: 1 } },
  { id: 2,  name: 'dirt',         color: '#92400e',     solid: true,  icon: '🟤', textures: '/textures/blocks/dirt.png', groups: { crumbly: 3, soil: 1 } },
  { id: 3,  name: 'grass',        color: '#16a34a',     solid: true,  icon: '🌱', textures: ['/textures/blocks/grass_top.png', '/textures/blocks/dirt.png', '/textures/blocks/grass_side.png'], groups: { crumbly: 3, soil: 1 }, drop: 2 },
  { id: 4,  name: 'sand',         color: '#fde68a',     solid: true,  icon: '🏜️', textures: '/textures/blocks/sand.png', groups: { crumbly: 3, falling_node: 1, sand: 1 } },
  { id: 5,  name: 'wood',         color: '#78350f',     solid: true,  icon: '🪵', textures: ['/textures/blocks/log_oak_top.png', '/textures/blocks/log_oak_top.png', '/textures/blocks/log_oak.png'], groups: { choppy: 2, wood: 1, flammable: 2 } },
  { id: 23, name: 'door_closed',  color: '#92400e',     solid: true,  icon: '🚪', textures: '/textures/blocks/door_wood_lower.png' },
  { id: 6,  name: 'leaves',       color: '#15803d',     solid: false, icon: '🌿', textures: '/textures/blocks/azalea_leaves.png', groups: { snappy: 3, leaves: 1, flammable: 2 } },
  { id: 7,  name: 'water',        color: '#0ea5e9',     solid: false, icon: '💧', textures: '/textures/blocks/water_still.png', groups: { liquid: 1, water: 1 } },
  { id: 8,  name: 'snow',         color: '#f1f5f9',     solid: true,  icon: '❄️', textures: ['/textures/blocks/snow.png', '/textures/blocks/dirt.png', '/textures/blocks/grass_side_snowed.png'] },
  { id: 9,  name: 'obsidian',     color: '#1e1b4b',     solid: true,  icon: '🔮', textures: '/textures/blocks/obsidian.png' },
  { id: 10, name: 'glass',        color: '#bae6fd',     solid: true,  icon: '🪟', textures: '/textures/blocks/glass.png' },
  { id: 11, name: 'brick',        color: '#b45309',     solid: true,  icon: '🧱', textures: '/textures/blocks/brick.png' },
  { id: 12, name: 'marble',       color: '#e2e8f0',     solid: true,  icon: '🏛️', textures: '/textures/blocks/stonebrick.png' },
  { id: 13, name: 'dark_stone',   color: '#374151',     solid: true,  icon: '🏰', textures: '/textures/blocks/cobblestone.png' },
  { id: 14, name: 'gold_block',   color: '#ca8a04',     solid: true,  icon: '🟡', textures: '/textures/blocks/gold_block.png' },
  { id: 15, name: 'potato',       color: '#d4a017',     solid: true,  icon: '🥔', textures: '/textures/blocks/dirt.png' },
  { id: 16, name: 'lava',         color: '#ef4444',     solid: false, icon: '🔥', textures: '/textures/blocks/lava_still.png', groups: { liquid: 1, lava: 1 } },
  { id: 17, name: 'emerald',      color: '#10b981',     solid: true,  icon: '💎', textures: '/textures/blocks/emerald_block.png' },
  { id: 18, name: 'diamond',      color: '#38bdf8',     solid: true,  icon: '💠', textures: '/textures/blocks/diamond_block.png' },
  { id: 19, name: 'cyber_cyan',   color: '#06b6d4',     solid: true,  icon: '⚡' },
  { id: 20, name: 'cyber_pink',   color: '#ec4899',     solid: true,  icon: '✨' },
  { id: 21, name: 'torch',        color: '#f59e0b',     solid: false, icon: '🕯️', textures: '/textures/blocks/torch_on.png' },
  { id: 22, name: 'thatch_roof', color: '#d97706',     solid: true,  icon: '🌾', textures: '/textures/blocks/planks_oak.png' },
  { id: 24, name: 'door_open',   color: '#92400e',     solid: false, icon: '🚪', textures: '/textures/blocks/door_wood_lower.png', placeable: false },
  { id: 25, name: 'tall_grass', color: '#65a30d', solid: false, icon: '🌿', placeable: false },
  { id: 26, name: 'wildflower', color: '#f472b6', solid: false, icon: '🌸', textures: '/textures/blocks/flower_rose.png', placeable: false },
  { id: 27, name: 'sandstone', color: '#d6b879', solid: true, icon: '🏜️', textures: ['/textures/blocks/sandstone_top.png', '/textures/blocks/sandstone_bottom.png', '/textures/blocks/sandstone_normal.png'] },
  { id: 28, name: 'mossy_cobblestone', color: '#64745d', solid: true, icon: '🪨', textures: '/textures/blocks/cobblestone_mossy.png' },
  { id: 29, name: 'gravel', color: '#817d78', solid: true, icon: '🪨', textures: '/textures/blocks/gravel.png', groups: { crumbly: 2, falling_node: 1 } },
  { id: 30, name: 'ice', color: '#9dd7ed', solid: true, icon: '🧊', textures: '/textures/blocks/ice.png' },
  { id: 31, name: 'clay', color: '#9aa4b4', solid: true, icon: '⚪', textures: '/textures/blocks/clay.png' },
  { id: 32, name: 'mud', color: '#4b3b32', solid: true, icon: '🟫', textures: '/textures/blocks/mud.png' },
  { id: 33, name: 'calcite', color: '#dedbd0', solid: true, icon: '⬜', textures: '/textures/blocks/calcite.png' },
  { id: 34, name: 'coal_ore', color: '#4b5563', solid: true, icon: '⚫', textures: '/textures/blocks/coal_ore.png' },
  { id: 35, name: 'iron_ore', color: '#9a7564', solid: true, icon: '⛏️', textures: '/textures/blocks/iron_ore.png' },
  { id: 36, name: 'red_sand', color: '#c56a32', solid: true, icon: '🟧', textures: '/textures/blocks/red_sand.png', groups: { crumbly: 3, falling_node: 1, sand: 1 } },
  { id: 37, name: 'terracotta', color: '#985e43', solid: true, icon: '🧱', textures: '/textures/blocks/hardened_clay.png' },
  { id: 38, name: 'andesite', color: '#777c80', solid: true, icon: '🪨', textures: '/textures/blocks/stone_andesite.png' },
  { id: 39, name: 'granite', color: '#9b6c5a', solid: true, icon: '🪨', textures: '/textures/blocks/stone_granite.png' },
  { id: 40, name: 'diorite', color: '#c7c7c2', solid: true, icon: '🪨', textures: '/textures/blocks/stone_diorite.png' },
  { id: 41, name: 'spruce_log', color: '#4d3826', solid: true, icon: '🪵', textures: ['/textures/blocks/log_spruce_top.png', '/textures/blocks/log_spruce_top.png', '/textures/blocks/log_spruce.png'], groups: { choppy: 2, wood: 1, flammable: 2 } },
  { id: 42, name: 'spruce_planks', color: '#715236', solid: true, icon: '🪵', textures: '/textures/blocks/planks_spruce.png' },
  { id: 43, name: 'spruce_leaves', color: '#315845', solid: false, icon: '🌲', textures: '/textures/blocks/leaves_spruce_opaque.png' },
  { id: 44, name: 'dirt_path', color: '#8b6a3e', solid: true, icon: '🛤️', textures: ['/textures/blocks/grass_path_top.png', '/textures/blocks/dirt.png', '/textures/blocks/grass_path_side.png'] },
  { id: 46, name: 'door_closed_upper', color: '#92400e', solid: true, textures: '/textures/blocks/door_wood_upper.png', placeable: false },
  { id: 47, name: 'door_open_upper', color: '#92400e', solid: false, textures: '/textures/blocks/door_wood_upper.png', placeable: false },
  ...Array.from({ length: MAX_LIQUID_LEVEL }, (_, index): BlockDef => ({
    id: BLOCK_WATER_FLOWING_START + index,
    name: `water_flowing_${index + 1}`,
    color: '#0ea5e9', solid: false, textures: '/textures/blocks/water_still.png', placeable: false,
    groups: { liquid: 1, water: 1, flowing: index + 1 },
  })),
  ...Array.from({ length: MAX_LIQUID_LEVEL }, (_, index): BlockDef => ({
    id: BLOCK_LAVA_FLOWING_START + index,
    name: `lava_flowing_${index + 1}`,
    color: '#ef4444', solid: false, textures: '/textures/blocks/lava_still.png', placeable: false,
    groups: { liquid: 1, lava: 1, flowing: index + 1 },
  })),
];

export const BLOCK_BY_ID = new Map<number, BlockDef>(
  BLOCKS.map((b) => [b.id, b]),
);

export const BLOCK_BY_NAME = new Map<string, BlockDef>(
  BLOCKS.map((b) => [b.name, b]),
);

export function getBlockGroup(blockId: number, group: string): number {
  return BLOCK_BY_ID.get(blockId)?.groups?.[group] ?? 0;
}

export function getBlockDrop(blockId: number): number | null {
  const block = BLOCK_BY_ID.get(blockId);
  if (!block || blockId === BLOCK_AIR) return null;
  return block.drop ?? blockId;
}

export type LiquidKind = 'water' | 'lava';

export function liquidKind(blockId: number): LiquidKind | null {
  if (getBlockGroup(blockId, 'water') > 0) return 'water';
  if (getBlockGroup(blockId, 'lava') > 0) return 'lava';
  return null;
}

export function liquidLevel(blockId: number): number | null {
  const kind = liquidKind(blockId);
  if (!kind) return null;
  return getBlockGroup(blockId, 'flowing');
}

export function flowingLiquidBlockId(kind: LiquidKind, level: number): number {
  const safeLevel = Math.max(1, Math.min(MAX_LIQUID_LEVEL, Math.floor(level)));
  return (kind === 'water' ? BLOCK_WATER_FLOWING_START : BLOCK_LAVA_FLOWING_START) + safeLevel - 1;
}


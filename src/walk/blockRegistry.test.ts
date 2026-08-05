import { describe, expect, it } from 'vitest';
import { BLOCK_BY_ID, getBlockDrop, getBlockGroup } from './blockRegistry';

describe('placeholder block texture palette', () => {
  it('binds climate, geology, vegetation, and door variants to shipped textures', () => {
    expect(BLOCK_BY_ID.get(8)?.textures).toContain('/textures/blocks/grass_side_snowed.png');
    expect(BLOCK_BY_ID.get(27)?.textures).toContain('/textures/blocks/sandstone_normal.png');
    expect(BLOCK_BY_ID.get(34)?.textures).toBe('/textures/blocks/coal_ore.png');
    expect(BLOCK_BY_ID.get(41)?.textures).toContain('/textures/blocks/log_spruce.png');
    expect(BLOCK_BY_ID.get(46)?.textures).toBe('/textures/blocks/door_wood_upper.png');
  });

  it('exposes group-driven behavior and explicit drops', () => {
    expect(getBlockGroup(4, 'falling_node')).toBe(1);
    expect(getBlockGroup(1, 'falling_node')).toBe(0);
    expect(getBlockDrop(3)).toBe(2);
    expect(getBlockDrop(1)).toBe(1);
    expect(getBlockDrop(0)).toBeNull();
  });
});

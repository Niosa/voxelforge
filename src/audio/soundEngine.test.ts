import { describe, expect, it } from 'vitest';
import { soundMaterialForBlock } from './soundEngine';

describe('soundMaterialForBlock', () => {
  it('maps voxel blocks to matching sample families', () => {
    expect(soundMaterialForBlock('grass')).toBe('grass');
    expect(soundMaterialForBlock('wildflower')).toBe('grass');
    expect(soundMaterialForBlock('spruce_planks')).toBe('wood');
    expect(soundMaterialForBlock('red_sand')).toBe('sand');
    expect(soundMaterialForBlock('snow')).toBe('snow');
    expect(soundMaterialForBlock('gravel')).toBe('gravel');
    expect(soundMaterialForBlock('stonebrick')).toBe('stone');
  });
});

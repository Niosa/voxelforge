import { describe, expect, it } from 'vitest';
import { WalkNodeSimulation, type MutableBlockPosition } from './WalkNodeSimulation';

const key = (position: MutableBlockPosition): string => position.join(',');

function harness(entries: [MutableBlockPosition, number][]) {
  const blocks = new Map(entries.map(([position, id]) => [key(position), id]));
  const changed: string[] = [];
  const simulation = new WalkNodeSimulation({
    getBlock: (x, y, z) => blocks.get(key([x, y, z])) ?? 0,
    setBlock: (blockId, position) => { blocks.set(key(position), blockId); },
    onChanged: (position) => { changed.push(key(position)); },
  });
  return { blocks, changed, simulation };
}

describe('WalkNodeSimulation', () => {
  it('drops sand into air and continues falling on later steps', () => {
    const { blocks, changed, simulation } = harness([[[0, 3, 0], 4], [[0, 0, 0], 1]]);
    simulation.enqueue([0, 3, 0]);
    expect(simulation.step()).toBe(1);
    expect(blocks.get('0,2,0')).toBe(4);
    expect(simulation.step()).toBe(1);
    expect(blocks.get('0,1,0')).toBe(4);
    expect(changed).toEqual(['0,3,0', '0,2,0', '0,2,0', '0,1,0']);
  });

  it('does not move falling nodes through solid blocks', () => {
    const { blocks, simulation } = harness([[[0, 2, 0], 29], [[0, 1, 0], 1]]);
    simulation.enqueue([0, 2, 0]);
    expect(simulation.step()).toBe(0);
    expect(blocks.get('0,2,0')).toBe(29);
  });

  it('lets falling nodes displace liquids', () => {
    const { blocks, simulation } = harness([[[0, 2, 0], 36], [[0, 1, 0], 7]]);
    simulation.enqueue([0, 2, 0]);
    expect(simulation.step()).toBe(1);
    expect(blocks.get('0,1,0')).toBe(36);
  });

  it('persists liquid attenuation in flowing block IDs', () => {
    const floor: [MutableBlockPosition, number][] = [];
    for (let x = -3; x <= 3; x++) for (let z = -3; z <= 3; z++) floor.push([[x, 1, z], 1]);
    const { blocks, simulation } = harness([[[0, 2, 0], 7], ...floor]);
    simulation.enqueue([0, 2, 0]);
    expect(simulation.step()).toBe(1);
    expect(blocks.get('1,2,0')).toBe(48);
    expect(blocks.get('-1,2,0')).toBe(48);
    simulation.step();
    expect([...blocks.values()]).toContain(49);
  });

  it('prioritizes downward liquid flow', () => {
    const { blocks, simulation } = harness([[[0, 2, 0], 7]]);
    simulation.enqueue([0, 2, 0]);
    expect(simulation.step()).toBe(1);
    expect(blocks.get('0,1,0')).toBe(48);
    expect(blocks.has('1,2,0')).toBe(false);
  });
});

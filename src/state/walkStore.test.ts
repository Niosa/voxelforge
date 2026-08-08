import { beforeEach, describe, expect, it } from 'vitest';
import { useWalkStore } from './walkStore';

const anchor = { lon: -105.27, lat: 40.02, altM: 1_600 };
const chunks = { '0,0,0': [{ bx: 1, by: 2, bz: 3, blockId: 4 }] };

describe('walkStore lifecycle', () => {
  beforeEach(() => {
    useWalkStore.setState({
      phase: 'globe',
      anchor: null,
      selectedBlockId: 3,
      hotbarIds: [1, 2, 3, 4, 5, 11, 10, 23, 21],
      activeHotbarIndex: 2,
      entryChunks: {},
      error: null,
    });
  });

  it('follows the complete descent and ascent lifecycle', () => {
    const actions = useWalkStore.getState();

    actions.beginDescent(anchor, chunks);
    expect(useWalkStore.getState()).toMatchObject({ phase: 'descending', anchor, entryChunks: chunks });

    actions.confirmWalk();
    expect(useWalkStore.getState().phase).toBe('walk');

    actions.beginAscent();
    expect(useWalkStore.getState().phase).toBe('ascending');

    actions.confirmGlobe();
    expect(useWalkStore.getState()).toMatchObject({
      phase: 'globe',
      anchor: null,
      entryChunks: {},
      error: null,
    });
  });

  it('ignores lifecycle events that are invalid for the current phase', () => {
    const actions = useWalkStore.getState();

    actions.confirmWalk();
    actions.beginAscent();
    actions.confirmGlobe();

    expect(useWalkStore.getState().phase).toBe('globe');
  });

  it('records an error and allows recovery to globe mode', () => {
    const actions = useWalkStore.getState();

    actions.beginDescent(anchor, chunks);
    actions.failTransition('noa failed to initialize');
    expect(useWalkStore.getState()).toMatchObject({
      phase: 'error',
      error: 'noa failed to initialize',
    });

    actions.confirmGlobe();
    expect(useWalkStore.getState()).toMatchObject({ phase: 'globe', error: null, anchor: null });
  });

  it('selects, cycles, and replaces creative hotbar slots', () => {
    const actions = useWalkStore.getState();
    actions.selectHotbarSlot(0);
    expect(useWalkStore.getState()).toMatchObject({ activeHotbarIndex: 0, selectedBlockId: 1 });
    actions.cycleHotbar(-1);
    expect(useWalkStore.getState()).toMatchObject({ activeHotbarIndex: 8, selectedBlockId: 21 });
    actions.assignHotbarSlot(8, 37);
    expect(useWalkStore.getState()).toMatchObject({ activeHotbarIndex: 8, selectedBlockId: 37 });
  });

  it('swaps hotbar slots, resets hotbar, and quick-assigns blocks', () => {
    const actions = useWalkStore.getState();
    actions.selectHotbarSlot(0); // active 0, blockId 1
    actions.swapHotbarSlots(0, 1); // swaps slot 0 (1) and slot 1 (2); active index becomes 1
    expect(useWalkStore.getState().hotbarIds[0]).toBe(2);
    expect(useWalkStore.getState().hotbarIds[1]).toBe(1);
    expect(useWalkStore.getState().activeHotbarIndex).toBe(1);
    expect(useWalkStore.getState().selectedBlockId).toBe(1);

    actions.quickAssignBlock(14); // gold_block
    expect(useWalkStore.getState().hotbarIds[1]).toBe(14);
    expect(useWalkStore.getState().selectedBlockId).toBe(14);

    actions.resetHotbarToDefault();
    expect(useWalkStore.getState().hotbarIds).toEqual([1, 2, 3, 4, 5, 11, 10, 23, 21]);
    expect(useWalkStore.getState().activeHotbarIndex).toBe(0);
  });
});

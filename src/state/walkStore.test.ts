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
});

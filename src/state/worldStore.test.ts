import { describe, expect, it } from 'vitest';
import { useWorldStore } from './worldStore';

describe('worldStore active world alias', () => {
  it('tracks world creation and active-world patches', () => {
    const id = useWorldStore.getState().createWorld('Alias Test', 123);
    expect(useWorldStore.getState().world).toBe(useWorldStore.getState().worlds[id]);

    useWorldStore.getState().patchWorld(id, (world) => {
      world.properties = { marker: 'updated' };
    });
    expect(useWorldStore.getState().world.properties?.marker).toBe('updated');
    expect(useWorldStore.getState().world).toBe(useWorldStore.getState().worlds[id]);
  });

  it('tracks sample-world switches', () => {
    useWorldStore.getState().loadSampleWorld('blank');
    const state = useWorldStore.getState();
    expect(state.activeWorldId).toBe('blank-preset');
    expect(state.world).toBe(state.worlds['blank-preset']);
  });

  it('does not mutate watched world state while autosaving', async () => {
    useWorldStore.getState().loadSampleWorld('blank');
    const before = useWorldStore.getState().world;
    const beforeUpdatedAt = before.updatedAt;

    await useWorldStore.getState().saveActiveWorld();

    expect(useWorldStore.getState().world).toBe(before);
    expect(useWorldStore.getState().world.updatedAt).toBe(beforeUpdatedAt);
  });
});

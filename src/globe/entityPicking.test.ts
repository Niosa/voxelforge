import { describe, expect, it } from 'vitest';
import { resolvePickedWorldEntityId } from './entityPicking';

const ids = new Set(['walk-site-1', 'continent-1']);

describe('resolvePickedWorldEntityId', () => {
  it('resolves a directly picked Cesium entity', () => {
    expect(resolvePickedWorldEntityId({ id: { id: 'walk-site-1' } }, ids)).toBe('walk-site-1');
  });

  it('resolves generated graphics through their originating entity id', () => {
    expect(resolvePickedWorldEntityId({ id: { id: 'generated-3d', terraEntityId: 'continent-1' } }, ids))
      .toBe('continent-1');
  });

  it('ignores unmanaged Cesium graphics', () => {
    expect(resolvePickedWorldEntityId({ primitive: { id: 'unmanaged' } }, ids)).toBeNull();
  });
});

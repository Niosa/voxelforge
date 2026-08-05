import { describe, expect, it } from 'vitest';
import { createWalkEntryPin, findWalkEntryPin, isWalkEntryPin } from './WalkEntryPin';

describe('walk entry pins', () => {
  it('creates a persistent landmark at the exact descent coordinates', () => {
    const pin = createWalkEntryPin({}, { lon: -105.27, lat: 40.02, altM: 0 });
    expect(pin.geometry).toEqual({ type: 'Point', coordinates: [-105.27, 40.02] });
    expect(pin.properties).toMatchObject({ walkEntry: true, pinIcon: 'camera' });
    expect(isWalkEntryPin(pin)).toBe(true);
  });

  it('reuses a pin within the same local walk site', () => {
    const pin = createWalkEntryPin({}, { lon: 0, lat: 0, altM: 0 });
    expect(findWalkEntryPin({ [pin.id]: pin }, { lon: 0.00001, lat: 0, altM: 0 })).toBe(pin);
    expect(findWalkEntryPin({ [pin.id]: pin }, { lon: 0.001, lat: 0, altM: 0 })).toBeNull();
  });
});

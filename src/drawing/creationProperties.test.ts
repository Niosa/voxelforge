import { describe, expect, it } from 'vitest';
import { buildCreationProperties } from './creationProperties';
import type { CreationSettings } from '@/state/uiStore';

const settings: CreationSettings = {
  biome: 'snowy-tundra',
  topography: 'mountains',
  climate: 'frigid',
  reliefHeight: 2_400,
  settlementDensity: 'high',
  settlementZoning: 'commercial',
  generate3DBuildings: true,
};

describe('creation properties', () => {
  it('preserves authored terrain choices on new land', () => {
    expect(buildCreationProperties('continent', settings)).toEqual({
      biome: 'snowy-tundra',
      topography: 'mountains',
      climate: 'frigid',
      reliefHeight: 2_400,
    });
  });

  it('turns settlement controls into generator inputs', () => {
    const properties = buildCreationProperties('city', settings, [
      [0, 0], [0.001, 0], [0.001, 0.001], [0, 0.001], [0, 0],
    ]);
    expect(properties).toMatchObject({
      biome: 'city-urban',
      density: 0.78,
      densityPreset: 'high',
      zoningPreset: 'commercial',
      districtType: 'commercial',
      generate3DBuildings: true,
    });
    expect(Number(properties?.population)).toBeGreaterThan(1_000);
  });
});

import { describe, expect, it } from 'vitest';
import {
  createPlanetLocalFrame,
  localChunkToPlanetKey,
  localToPlanetBlock,
  lonLatToPlanetMeters,
  planetMetersToLonLat,
} from './PlanetGrid';

describe('PlanetGrid', () => {
  it('round-trips cartographic positions through the stable metre grid', () => {
    const [x, z] = lonLatToPlanetMeters(-105.2705, 40.015);
    const [lon, lat] = planetMetersToLonLat(x, z);
    expect(lon).toBeCloseTo(-105.2705, 6);
    expect(lat).toBeCloseTo(40.015, 6);
  });

  it('maps local chunks from nearby descents to the same planet key', () => {
    const first = createPlanetLocalFrame({ lon: 0, lat: 0, altM: 0 });
    const second = createPlanetLocalFrame({ lon: 0.00001, lat: 0, altM: 0 });
    const planet = localToPlanetBlock(first, 1, 4, 1);
    const secondLocalChunk = `${Math.floor((planet.x - second.originX) / 32)},0,${Math.floor((planet.z - second.originZ) / 32)}`;
    expect(localChunkToPlanetKey(first, '0,0,0')).toBe(localChunkToPlanetKey(second, secondLocalChunk));
  });
});

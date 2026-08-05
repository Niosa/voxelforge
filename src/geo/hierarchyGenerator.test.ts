import { describe, expect, it } from 'vitest';
import { generateHierarchy, type HierarchyGenerationConfig } from './hierarchyGenerator';

const config: HierarchyGenerationConfig = {
  rootType: 'continent', name: 'Test Realm', centerLon: 10, centerLat: 20, radiusKm: 500,
  biome: 'lush-grassland', climate: 'temperate', topography: 'mountains', density: 'medium', includeDescendants: true, seed: 42,
};

describe('hierarchy generator', () => {
  it('generates editable descendants beneath the chosen root', () => {
    const entities = generateHierarchy(config);
    const continent = entities.find((entity) => entity.type === 'continent');
    const regions = entities.filter((entity) => entity.type === 'region');
    const settlements = entities.filter((entity) => entity.type === 'city' || entity.type === 'town');
    expect(continent).toBeDefined();
    expect(regions.length).toBeGreaterThanOrEqual(3);
    expect(regions.every((region) => region.parentId === continent?.id)).toBe(true);
    expect(settlements.length).toBeGreaterThan(4);
    expect(settlements.every((settlement) => regions.some((region) => region.id === settlement.parentId))).toBe(true);
  });

  it('can start at a region without forcing a continent', () => {
    const entities = generateHierarchy({ ...config, rootType: 'region', name: 'Standalone Region' });
    expect(entities.some((entity) => entity.type === 'continent')).toBe(false);
    expect(entities[0]?.type).toBe('region');
    expect(entities.some((entity) => entity.type === 'city')).toBe(true);
  });
});

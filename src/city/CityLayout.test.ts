import { describe, expect, it } from 'vitest';
import type { TerraEntity } from '@/entities/types';
import { cityColumnLayout, createCityLayout, planCityLots, planCityRoadSegments } from './CityLayout';

const city: TerraEntity = {
  id: 'dynamic-city', type: 'city', name: 'Dynamic', description: '', tags: [], color: '#fff',
  fillOpacity: 1, parentId: null, images: [], createdAt: 0, updatedAt: 0,
  geometry: { type: 'Polygon', coordinates: [[[-0.03, -0.03], [0.03, -0.03], [0.03, 0.03], [-0.03, 0.03], [-0.03, -0.03]]] },
  properties: { biome: 'city-urban' },
};

describe('shared city layout', () => {
  it('is deterministic while varying roads, parks, and parcel heights', () => {
    const layout = createCityLayout(city, 42);
    expect(createCityLayout(city, 42)).toEqual(layout);
    const columns = Array.from({ length: 240 }, (_, xIndex) =>
      Array.from({ length: 240 }, (_, zIndex) => cityColumnLayout(layout, xIndex - 120, zIndex - 120)),
    ).flat();
    expect(columns.some((column) => column.road)).toBe(true);
    expect(columns.some((column) => column.park)).toBe(true);
    expect(new Set(columns.map((column) => column.buildingHeight)).size).toBeGreaterThan(2);
  });

  it('plans globe lots from the same walk-mode parcel rules', () => {
    const layout = createCityLayout(city, 7);
    const lots = planCityLots(city, 7, 24);
    expect(lots.length).toBeGreaterThan(4);
    for (const lot of lots) {
      const column = cityColumnLayout(layout, lot.x, lot.z);
      expect(lot.buildingHeight).toBe(column.buildingHeight);
      expect(lot.district).toBe(column.district);
    }
    expect(planCityRoadSegments(city, 7, 24).length).toBeGreaterThan(4);
  });

  it('keeps small drawn cities low-rise and predominantly residential', () => {
    const smallCity: TerraEntity = {
      ...city,
      id: 'small-city',
      geometry: { type: 'Polygon', coordinates: [[[-0.0005, -0.0005], [0.0005, -0.0005], [0.0005, 0.0005], [-0.0005, 0.0005], [-0.0005, -0.0005]]] },
      properties: { biome: 'city-urban', population: 1_200 },
    };
    const layout = createCityLayout(smallCity, 9);
    const lots = planCityLots(smallCity, 9, 64);
    expect(layout.coreRadius).toBe(0);
    expect(lots.length).toBeGreaterThan(2);
    expect(lots.every((lot) => lot.district !== 'core')).toBe(true);
    expect(Math.max(...lots.map((lot) => lot.buildingHeight))).toBeLessThanOrEqual(10);
    expect(lots.filter((lot) => lot.buildingUse === 'home').length).toBeGreaterThan(lots.length / 2);
  });
});

import { describe, expect, it } from 'vitest';
import type { TerraEntity } from '@/entities/types';
import { cityColumnLayout, cityDiagonalRoadAt, cityParcelReservedForDiagonal, createCityLayout, planCityLots, planCityRoadSegments } from './CityLayout';

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
    expect(columns.some((column) => column.parkTree)).toBe(true);
    expect(columns.some((column) => column.parkFeature !== 'none')).toBe(true);
    expect(columns.some((column) => column.streetLight)).toBe(true);
    expect(columns.some((column) => column.transitStop)).toBe(true);
    expect(columns.some((column) => column.businessSignBlockId > 0)).toBe(true);
    expect(new Set(columns.map((column) => column.buildingHeight)).size).toBeGreaterThan(2);
    expect(new Set(columns.filter((column) => column.buildingHeight > 0).map((column) => column.buildingBlockId)).size).toBeGreaterThan(3);
    expect(new Set(columns.filter((column) => column.buildingHeight > 0).map((column) => column.roofBlockId)).size).toBeGreaterThan(2);
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

  it('reserves entire parcels crossed by diagonal roads', () => {
    const layout = createCityLayout(city, 42);
    const parcels = new Map<string, { diagonal: boolean; reserved: boolean; building: boolean; tree: boolean }>();
    for (let x = -120; x <= 120; x++) {
      for (let z = -120; z <= 120; z++) {
        const cellX = Math.floor((x + layout.offsetX) / layout.gridSize);
        const cellZ = Math.floor((z + layout.offsetZ) / layout.gridSize);
        const key = `${cellX},${cellZ}`;
        const parcel = parcels.get(key) ?? {
          diagonal: false,
          reserved: cityParcelReservedForDiagonal(layout, cellX, cellZ),
          building: false,
          tree: false,
        };
        parcel.diagonal ||= cityDiagonalRoadAt(layout, x, z);
        parcel.building ||= cityColumnLayout(layout, x, z).buildingHeight > 0;
        parcel.tree ||= cityColumnLayout(layout, x, z).parkTree;
        parcels.set(key, parcel);
      }
    }
    expect([...parcels.values()].some((parcel) => parcel.diagonal)).toBe(true);
    expect([...parcels.values()].some((parcel) => parcel.reserved)).toBe(true);
    expect([...parcels.values()].every((parcel) => !parcel.reserved || !parcel.building)).toBe(true);
    expect([...parcels.values()].every((parcel) => !parcel.reserved || !parcel.tree)).toBe(true);
  });
});

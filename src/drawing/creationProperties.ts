import type { EntityType } from '@/entities/types';
import type { CreationSettings, SettlementDensity } from '@/state/uiStore';

const DENSITY_VALUES: Record<SettlementDensity, number> = {
  rural: 0.2,
  low: 0.35,
  medium: 0.55,
  high: 0.78,
  metropolitan: 1,
};

const POPULATION_MULTIPLIERS: Record<SettlementDensity, number> = {
  rural: 0.35,
  low: 0.65,
  medium: 1,
  high: 1.8,
  metropolitan: 3.5,
};

export function estimateSettlementPopulation(ring: [number, number][], type: 'city' | 'town'): number {
  if (ring.length < 3) return type === 'town' ? 300 : 1_000;
  let twiceArea = 0;
  let meanLatitude = 0;
  for (let index = 0; index < ring.length; index++) {
    const current = ring[index]!;
    const next = ring[(index + 1) % ring.length]!;
    twiceArea += current[0] * next[1] - next[0] * current[1];
    meanLatitude += current[1];
  }
  meanLatitude /= ring.length;
  const squareMeters = Math.abs(twiceArea / 2)
    * 111_000
    * 111_000
    * Math.max(0.2, Math.cos(meanLatitude * Math.PI / 180));
  const densityPerSquareKm = type === 'town' ? 850 : 2_400;
  const minimum = type === 'town' ? 300 : 1_000;
  return Math.max(minimum, Math.round(squareMeters / 1_000_000 * densityPerSquareKm));
}

export function buildCreationProperties(
  type: EntityType,
  settings: CreationSettings,
  ring?: [number, number][],
): Record<string, string | number | boolean> | undefined {
  if (type === 'city' || type === 'town') {
    const basePopulation = ring
      ? estimateSettlementPopulation(ring, type)
      : type === 'town' ? 4_000 : 25_000;
    const properties: Record<string, string | number | boolean> = {
      biome: type === 'town' ? 'town-village' : 'city-urban',
      generate3DBuildings: settings.generate3DBuildings,
      density: DENSITY_VALUES[settings.settlementDensity],
      densityPreset: settings.settlementDensity,
      zoningPreset: settings.settlementZoning,
      population: Math.max(type === 'town' ? 100 : 500, Math.round(basePopulation * POPULATION_MULTIPLIERS[settings.settlementDensity])),
    };
    if (settings.settlementZoning !== 'mixed') {
      properties.districtType = settings.settlementZoning;
    }
    return properties;
  }

  if (type === 'continent' || type === 'region' || type === 'island') {
    return {
      biome: settings.biome,
      topography: settings.topography,
      climate: settings.climate,
      reliefHeight: settings.reliefHeight,
    };
  }

  return undefined;
}

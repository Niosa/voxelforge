import { createEntity } from '@/entities/factory';
import type { TerraEntity, WalkAnchor } from '@/entities/types';
import { lonLatToPlanetMeters } from '@/planet/spatial/PlanetGrid';

const WALK_ENTRY_TAG = 'walk-entry';
const REUSE_DISTANCE_M = 8;

export function isWalkEntryPin(entity: TerraEntity): boolean {
  return entity.geometry.type === 'Point'
    && (entity.properties.walkEntry === true || entity.tags.includes(WALK_ENTRY_TAG));
}

export function findWalkEntryPin(
  entities: Record<string, TerraEntity>,
  anchor: WalkAnchor,
): TerraEntity | null {
  const [targetX, targetZ] = lonLatToPlanetMeters(anchor.lon, anchor.lat);
  return Object.values(entities).find((entity) => {
    if (!isWalkEntryPin(entity) || entity.geometry.type !== 'Point') return false;
    const [x, z] = lonLatToPlanetMeters(entity.geometry.coordinates[0], entity.geometry.coordinates[1]);
    return Math.hypot(x - targetX, z - targetZ) <= REUSE_DISTANCE_M;
  }) ?? null;
}

export function createWalkEntryPin(
  entities: Record<string, TerraEntity>,
  anchor: WalkAnchor,
): TerraEntity {
  const number = Object.values(entities).filter(isWalkEntryPin).length + 1;
  return createEntity({
    type: 'landmark',
    name: `Walk Site ${number}`,
    description: 'A saved walk-mode entry point. Select this pin and choose Walk to return here.',
    geometry: { type: 'Point', coordinates: [anchor.lon, anchor.lat] },
    color: '#f59e0b',
    fillOpacity: 1,
    tags: [WALK_ENTRY_TAG],
    properties: {
      walkEntry: true,
      pinIcon: 'camera',
      pinStyle: 'flag',
      pinHeight: 0,
      generate3DBuildings: false,
    },
  });
}

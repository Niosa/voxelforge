import { useWorldStore } from '@/state/worldStore';
import { history } from '@/state/history/HistoryStack';
import { createEntity } from '@/entities/factory';
import type { TerraEntity } from '@/entities/types';
import { getViewer, updateFantasyImageryEntities } from '@/globe/CesiumViewer';
import { flyToWorldCamera } from '@/globe/camera';
import { syncEntitiesToCesium } from '@/globe/entitySync';

const REALM_PREFIXES = [
  'Valoria', 'Eldoria', 'Aethelgard', 'Solaria', 'Frostglen',
  'Ironreach', 'Mythras', 'Vesperia', 'Obsidian', 'Astral',
  'Zephyria', 'Drakon', 'Verdantia', 'Shadowfen', 'Sunspire'
];

const REALM_SUFFIXES = [
  'Empire', 'Kingdom', 'Dominion', 'Alliance', 'Realm',
  'Sovereignty', 'Conclave', 'Highlands', 'Sanctuary', 'Federation'
];

const CITY_NAMES = [
  'Oakhaven', 'Ironclad', 'Sunreach', 'Silverfall', 'Dragonspire',
  'Winterfell', 'Stormhold', 'Ravenhill', 'Dawnstar', 'Highgard',
  'Crystal Bay', 'Shadowgate', 'Eldermoor', 'Falconcrest', 'Riverbend'
];

const HERALDRY_FLAGS = [
  'https://images.unsplash.com/photo-1579546929518-9e396f3cc809?w=300&q=80',
  'https://images.unsplash.com/photo-1541701494587-cb58502866ab?w=300&q=80',
  'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=300&q=80',
  'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=300&q=80',
];

export function generateRandomRealm(): void {
  const worldStore = useWorldStore.getState();
  const worldName = `${REALM_PREFIXES[Math.floor(Math.random() * REALM_PREFIXES.length)]} ${REALM_SUFFIXES[Math.floor(Math.random() * REALM_SUFFIXES.length)]}`;

  const newEntities: Record<string, TerraEntity> = {};

  // 1. Generate Main Continent
  const centerLon = (Math.random() * 240) - 120;
  const centerLat = (Math.random() * 80) - 40;
  const radius = 12 + Math.random() * 15;

  const continentPoly: [number, number][] = [];
  const numPts = 16;
  for (let i = 0; i < numPts; i++) {
    const angle = (i / numPts) * Math.PI * 2;
    const r = radius * (0.7 + Math.random() * 0.5);
    const lon = centerLon + r * Math.cos(angle);
    const lat = centerLat + (r * 0.6) * Math.sin(angle);
    continentPoly.push([lon, lat]);
  }
  continentPoly.push(continentPoly[0]!); // Close loop

  const continentEntity = createEntity({
    type: 'continent',
    name: `Great Realm of ${worldName}`,
    description: `The legendary central landmass of ${worldName}, rich with fertile valleys and mountain strongholds.`,
    color: '#16a34a',
    fillOpacity: 0.85,
    geometry: {
      type: 'Polygon',
      coordinates: [continentPoly],
    },
    properties: {
      biome: 'lush-grassland',
      topography: 'mountains',
      climate: 'temperate',
      flagUrl: HERALDRY_FLAGS[Math.floor(Math.random() * HERALDRY_FLAGS.length)],
    },
  });

  newEntities[continentEntity.id] = continentEntity;

  // 2. Generate 3-5 Cities on Continent
  const numCities = 4;
  for (let i = 0; i < numCities; i++) {
    const angle = (i / numCities) * Math.PI * 2 + (Math.random() * 0.4);
    const dist = radius * 0.4 * (0.3 + Math.random() * 0.5);
    const cLon = centerLon + dist * Math.cos(angle);
    const cLat = centerLat + (dist * 0.6) * Math.sin(angle);

    const cityName = CITY_NAMES[(i + Math.floor(Math.random() * CITY_NAMES.length)) % CITY_NAMES.length]!;

    const cityEntity = createEntity({
      type: 'city',
      name: cityName,
      parentId: continentEntity.id,
      description: `Major citadel in ${worldName}, known for trade, blacksmithing, and ancient spires.`,
      color: '#f59e0b',
      fillOpacity: 1,
      geometry: {
        type: 'Point',
        coordinates: [cLon, cLat],
      },
      properties: {
        pinStyle: i === 0 ? 'beacon' : 'teardrop',
        pinIcon: i === 0 ? 'capital' : 'city',
        pinHeight: i === 0 ? 800 : 300,
        generate3DBuildings: true,
        flagUrl: HERALDRY_FLAGS[i % HERALDRY_FLAGS.length],
      },
    });

    newEntities[cityEntity.id] = cityEntity;
  }

  // 3. Generate 2 Satellite Archipelagos
  for (let a = 0; a < 2; a++) {
    const aAngle = Math.random() * Math.PI * 2;
    const aDist = radius * 1.5;
    const aLon = centerLon + aDist * Math.cos(aAngle);
    const aLat = centerLat + (aDist * 0.6) * Math.sin(aAngle);
    const islandRadius = 4 + Math.random() * 4;

    const islandPoly: [number, number][] = [];
    for (let k = 0; k < 10; k++) {
      const ang = (k / 10) * Math.PI * 2;
      const r = islandRadius * (0.6 + Math.random() * 0.6);
      islandPoly.push([aLon + r * Math.cos(ang), aLat + r * Math.sin(ang)]);
    }
    islandPoly.push(islandPoly[0]!);

    const islandEntity = createEntity({
      type: 'island',
      name: `${REALM_PREFIXES[Math.floor(Math.random() * REALM_PREFIXES.length)]} Isle`,
      description: 'Secluded fantasy archipelago shrouded in mist and sea myths.',
      color: '#06b6d4',
      fillOpacity: 0.8,
      geometry: {
        type: 'Polygon',
        coordinates: [islandPoly],
      },
      properties: {
        biome: 'elven-azure',
        topography: 'hills',
        climate: 'tropical',
      },
    });

    newEntities[islandEntity.id] = islandEntity;
  }

  // Batch load new realm into worldStore
  worldStore.patchWorld(worldStore.activeWorldId!, (w) => {
    w.name = worldName;
    w.entities = newEntities;
    w.camera = { lon: centerLon, lat: centerLat, height: 9_000_000, heading: 0, pitch: -90 };
  });

  const viewer = getViewer();
  if (viewer) {
    viewer.entities.removeAll();
    syncEntitiesToCesium(viewer, newEntities, null);
    const theme = useWorldStore.getState().world.properties?.theme ?? 'medieval';
    updateFantasyImageryEntities(newEntities, theme);
    flyToWorldCamera(viewer, useWorldStore.getState().world);
  }

  history.clear();
}

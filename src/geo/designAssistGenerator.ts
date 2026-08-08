import { SimplexNoise2D, hashSeed } from '@/geo/noise';
import type { DesignAssistConfig } from '@/ui/tools/DesignAssistPanel';
import { createEntity } from '@/entities/factory';
import type { TerraEntity } from '@/entities/types';

/**
 * Generates a complete TerraEntity with procedural polygon geometry centered at [centerLon, centerLat].
 */
export function generateDesignAssistEntity(
  centerLon: number,
  centerLat: number,
  config: DesignAssistConfig,
): TerraEntity {
  const noise = new SimplexNoise2D(hashSeed(config.name + Date.now()));
  const numPoints = config.archetype === 'kingdom' ? 12 : 28;
  const degrees = config.radiusKm / 111; // 1 degree lat ≈ 111 km

  const ring: [number, number][] = [];

  if (config.archetype === 'mountain-chain') {
    // Elongated mountain ridge along a diagonal axis
    const angleOffset = Math.PI / 4;
    for (let i = 0; i <= numPoints; i++) {
      const t = (i / numPoints) * Math.PI * 2;
      const rx = degrees * 1.8 * Math.cos(t);
      const ry = degrees * 0.45 * Math.sin(t);

      // Rotate by diagonal angle
      const rotX = rx * Math.cos(angleOffset) - ry * Math.sin(angleOffset);
      const rotY = rx * Math.sin(angleOffset) + ry * Math.cos(angleOffset);

      const n = noise.noise2D(Math.cos(t) * 2, Math.sin(t) * 2) * config.roughness * 0.35;
      const finalX = centerLon + rotX * (1 + n);
      const finalY = centerLat + rotY * (1 + n);
      ring.push([finalX, finalY]);
    }
  } else if (config.archetype === 'kingdom') {
    // Fortified star citadel geometry
    for (let i = 0; i <= numPoints; i++) {
      const angle = (i / numPoints) * Math.PI * 2;
      const isStarPeak = i % 2 === 0;
      const r = isStarPeak ? degrees : degrees * 0.65;
      const x = centerLon + Math.cos(angle) * r;
      const y = centerLat + Math.sin(angle) * r * Math.cos((centerLat * Math.PI) / 180);
      ring.push([x, y]);
    }
  } else {
    // Fractal Continent / Archipelago / Forest
    for (let i = 0; i <= numPoints; i++) {
      const angle = (i / numPoints) * Math.PI * 2;
      const u = Math.cos(angle);
      const v = Math.sin(angle);

      // Layered simplex noise for fractal bays and peninsulas
      const n1 = noise.noise2D(u * 2.5, v * 2.5);
      const n2 = noise.fbm(u * 5, v * 5, 3);
      const radiusMult = 1 + (n1 * 0.45 + n2 * 0.35) * config.roughness;

      const latScale = Math.cos((centerLat * Math.PI) / 180);
      const x = centerLon + u * (degrees / Math.max(0.2, latScale)) * radiusMult;
      const y = centerLat + v * degrees * radiusMult;
      ring.push([x, y]);
    }
  }

  // Ensure ring closes properly
  ring[ring.length - 1] = [ring[0]![0], ring[0]![1]];

  const geometry = {
    type: 'Polygon' as const,
    coordinates: [ring],
  };

  const entity = createEntity({
    type: config.type,
    name: config.name,
    color: config.color,
    fillOpacity: config.archetype === 'kingdom' ? 0.8 : 0.65,
    geometry,
  });

  entity.properties.biome = config.biome;
  if (config.archetype === 'mountain-chain') {
    entity.properties.extrudedHeight = 4500; // Extruded mountain height
    entity.properties.topography = 'mountains';
  } else if (config.archetype === 'kingdom') {
    entity.properties.extrudedHeight = 120;
  }

  return entity;
}

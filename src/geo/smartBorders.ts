import type { TerraEntity, TerraGeometry } from '@/entities/types';
import {
  feature,
  featureCollection,
  booleanContains,
  booleanIntersects,
  difference,
  area,
} from '@turf/turf';
import type { Feature, Polygon, MultiPolygon } from 'geojson';

export interface ProcessedSmartBorderResult {
  geometry: TerraGeometry;
  parentId: string | null;
  modified: boolean;
}

/**
 * Process a new or updated landmass geometry against existing world landmasses.
 * If smart borders are enabled:
 * 1. If newGeom is inside an existing landmass (nested enclave/region/city), it keeps its shape and links parentId.
 * 2. If an existing landmass is inside newGeom, keep shapes intact.
 * 3. If newGeom partially overlaps neighboring landmasses, subtract the overlap so borders snap perfectly without breaking nested landmasses.
 */
export function processSmartBorders(
  newGeom: TerraGeometry,
  existingEntities: Record<string, TerraEntity>,
  excludeEntityId?: string,
): ProcessedSmartBorderResult {
  if (newGeom.type === 'Point') {
    // Find containing polygon for point entities to auto-assign parentId
    let parentId: string | null = null;
    const ptFeature = feature(newGeom);
    for (const ent of Object.values(existingEntities)) {
      if (excludeEntityId && ent.id === excludeEntityId) continue;
      if (ent.geometry.type === 'Polygon' || ent.geometry.type === 'MultiPolygon') {
        const polyFeature = feature(ent.geometry);
        if (booleanContains(polyFeature, ptFeature)) {
          parentId = ent.id;
          break;
        }
      }
    }
    return { geometry: newGeom, parentId, modified: false };
  }

  let currentFeature = feature(newGeom) as Feature<Polygon | MultiPolygon>;
  let parentId: string | null = null;
  let modified = false;

  const existingPolygons = Object.values(existingEntities).filter((ent) => {
    if (excludeEntityId && ent.id === excludeEntityId) return false;
    return ent.geometry.type === 'Polygon' || ent.geometry.type === 'MultiPolygon';
  });

  for (const neighbor of existingPolygons) {
    const neighborFeature = feature(neighbor.geometry) as Feature<Polygon | MultiPolygon>;

    try {
      // 1. Check if newGeom is nested inside neighbor
      const isNestedInside = booleanContains(neighborFeature, currentFeature);
      if (isNestedInside) {
        if (!parentId) {
          parentId = neighbor.id;
        }
        // Keep nested landmass geometry completely intact!
        continue;
      }

      // 2. Check if neighbor is nested inside newGeom
      const isNeighborNested = booleanContains(currentFeature, neighborFeature);
      if (isNeighborNested) {
        continue;
      }

      // 3. Check for partial overlap with neighboring landmass
      if (booleanIntersects(currentFeature, neighborFeature)) {
        const fc = featureCollection<Polygon | MultiPolygon>([currentFeature, neighborFeature]);
        const diffResult = difference(fc);
        if (diffResult && diffResult.geometry) {
          // Verify diff geometry has significant remaining area
          const newArea = area(diffResult);
          if (newArea > 10) {
            currentFeature = diffResult as any;
            modified = true;
          }
        }
      }
    } catch (err) {
      console.warn('Smart borders processing notice for neighbor:', neighbor.name, err);
    }
  }

  return {
    geometry: currentFeature.geometry as TerraGeometry,
    parentId,
    modified,
  };
}

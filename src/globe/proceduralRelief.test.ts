import { describe, expect, it } from 'vitest';
import type { TerraEntity } from '@/entities/types';
import { createReliefMeshData } from './proceduralRelief';

const mountain: TerraEntity = {
  id: 'stable-mountain', type: 'region', name: 'Range', description: '', tags: [], color: '#64748b', fillOpacity: 1,
  parentId: null, images: [], createdAt: 0, updatedAt: 0,
  geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] },
  properties: { topography: 'mountains', reliefHeight: 2400 },
};

describe('procedural globe relief', () => {
  it('creates real elevations that taper to the authored boundary', () => {
    const mesh = createReliefMeshData(mountain, 2400, 16);
    expect(mesh.indices.length).toBeGreaterThan(500);
    expect(Math.max(...mesh.vertices.map((vertex) => vertex.height))).toBeGreaterThan(800);
    expect(mesh.vertices[0]?.height).toBe(0);
  });

  it('is deterministic for persistent terrain', () => {
    expect(createReliefMeshData(mountain, 2400, 12)).toEqual(createReliefMeshData(mountain, 2400, 12));
  });
});

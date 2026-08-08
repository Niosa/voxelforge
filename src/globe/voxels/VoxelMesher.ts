import {
  Geometry,
  GeometryAttribute,
  GeometryAttributes,
  ComponentDatatype,
  PrimitiveType,
  BoundingSphere,
} from 'cesium';
import { CHUNK_SIZE, VOXEL_SIZE, type VoxelChunk } from './VoxelChunk';
import type { FirstPersonBuildingType } from '@/state/uiStore';

interface MeshData {
  positions: number[];
  normals: number[];
  uvs: number[];
  indices: number[];
  types: FirstPersonBuildingType[]; // For texture atlas mapping later
}

/**
 * Generates an optimized geometry mesh using a Greedy Meshing algorithm.
 * Merges adjacent coplanar faces of the same block type.
 */
export function buildGreedyVoxelMesh(chunk: VoxelChunk): Record<FirstPersonBuildingType, Geometry> | null {
  if (chunk.blocks.size === 0) return null;

  // We group geometry by block type since each type currently has its own material/texture.
  // In a fully optimized engine, this would use a Texture Atlas and a single geometry.
  const meshDataPerType = new Map<FirstPersonBuildingType, MeshData>();

  const getBlockType = (x: number, y: number, z: number): FirstPersonBuildingType | null => {
    if (x < 0 || x >= CHUNK_SIZE || y < 0 || y >= CHUNK_SIZE || z < 0 || z >= CHUNK_SIZE) return null;
    const b = chunk.getBlock(x, y, z);
    return b ? b.type : null;
  };

  // Run over each of the 3 dimensions (x, y, z)
  for (let d = 0; d < 3; d++) {
    const u = (d + 1) % 3;
    const v = (d + 2) % 3;
    const x = [0, 0, 0];
    const q = [0, 0, 0];
    
    // Mask arrays to store the visible faces for a given slice
    const mask = new Array(CHUNK_SIZE * CHUNK_SIZE);
    q[d] = 1;

    for (x[d] = -1; x[d] < CHUNK_SIZE;) {
      // Compute mask
      let n = 0;
      for (x[v] = 0; x[v] < CHUNK_SIZE; ++x[v]) {
        for (x[u] = 0; x[u] < CHUNK_SIZE; ++x[u]) {
          const type1 = x[d] >= 0 ? getBlockType(x[0], x[1], x[2]) : null;
          const type2 = x[d] < CHUNK_SIZE - 1 ? getBlockType(x[0] + q[0], x[1] + q[1], x[2] + q[2]) : null;

          if (type1 !== null && type2 !== null && type1 === type2) {
            mask[n++] = null; // Internal face, cull
          } else if (type1 !== null) {
            mask[n++] = { type: type1, dir: 1 }; // Forward face
          } else if (type2 !== null) {
            mask[n++] = { type: type2, dir: -1 }; // Backward face
          } else {
            mask[n++] = null;
          }
        }
      }

      ++x[d];
      n = 0;

      // Evaluate mask and generate quads
      for (let j = 0; j < CHUNK_SIZE; ++j) {
        for (let i = 0; i < CHUNK_SIZE;) {
          if (mask[n] !== null) {
            const currentFace = mask[n];
            let w = 1;
            let h = 1;

            // Compute width
            while (i + w < CHUNK_SIZE && mask[n + w] !== null && mask[n + w].type === currentFace.type && mask[n + w].dir === currentFace.dir) {
              w++;
            }

            // Compute height
            let done = false;
            for (h = 1; j + h < CHUNK_SIZE; h++) {
              for (let k = 0; k < w; k++) {
                const nextN = n + k + h * CHUNK_SIZE;
                if (mask[nextN] === null || mask[nextN].type !== currentFace.type || mask[nextN].dir !== currentFace.dir) {
                  done = true;
                  break;
                }
              }
              if (done) break;
            }

            // Generate quad
            x[u] = i;
            x[v] = j;
            
            const du = [0, 0, 0];
            du[u] = w;
            const dv = [0, 0, 0];
            dv[v] = h;

            let meshData = meshDataPerType.get(currentFace.type);
            if (!meshData) {
              meshData = { positions: [], normals: [], uvs: [], indices: [], types: [] };
              meshDataPerType.set(currentFace.type, meshData);
            }

            const baseIdx = meshData.positions.length / 3;

            // Vertices (Local space relative to chunk bounds 0,0,0)
            const p1 = [x[0], x[1], x[2]];
            const p2 = [x[0] + du[0], x[1] + du[1], x[2] + du[2]];
            const p3 = [x[0] + du[0] + dv[0], x[1] + du[1] + dv[1], x[2] + du[2] + dv[2]];
            const p4 = [x[0] + dv[0], x[1] + dv[1], x[2] + dv[2]];

            // Calculate Normal
            const normal = [0, 0, 0];
            normal[d] = currentFace.dir;

            const scale = VOXEL_SIZE;
            
            // Push Vertices
            meshData.positions.push(p1[0]*scale, p1[1]*scale, p1[2]*scale);
            meshData.positions.push(p2[0]*scale, p2[1]*scale, p2[2]*scale);
            meshData.positions.push(p3[0]*scale, p3[1]*scale, p3[2]*scale);
            meshData.positions.push(p4[0]*scale, p4[1]*scale, p4[2]*scale);

            // Push Normals & UVs
            for(let vIdx=0; vIdx<4; vIdx++) {
               meshData.normals.push(...normal);
            }
            
            // UV mapping spans the greedy mesh
            meshData.uvs.push(0, 0);
            meshData.uvs.push(w, 0);
            meshData.uvs.push(w, h);
            meshData.uvs.push(0, h);

            // Push Indices (Counter-clockwise winding based on direction)
            if (currentFace.dir === 1) {
              meshData.indices.push(baseIdx, baseIdx + 1, baseIdx + 2);
              meshData.indices.push(baseIdx, baseIdx + 2, baseIdx + 3);
            } else {
              meshData.indices.push(baseIdx + 2, baseIdx + 1, baseIdx);
              meshData.indices.push(baseIdx + 3, baseIdx + 2, baseIdx);
            }

            // Clear mask for consumed quads
            for (let l = 0; l < h; ++l) {
              for (let k = 0; k < w; ++k) {
                mask[n + k + l * CHUNK_SIZE] = null;
              }
            }

            i += w;
            n += w;
          } else {
            i++;
            n++;
          }
        }
      }
    }
  }

  const geometries: Record<string, Geometry> = {};

  for (const [type, data] of meshDataPerType.entries()) {
    if (data.positions.length === 0) continue;

    // Convert to TypedArrays for Cesium
    const posArray = new Float64Array(data.positions); // Use double precision for RTC compatibility natively!
    const normArray = new Float32Array(data.normals);
    const uvArray = new Float32Array(data.uvs);
    
    let indexArray: Uint16Array | Uint32Array;
    if (data.positions.length / 3 > 65535) {
        indexArray = new Uint32Array(data.indices);
    } else {
        indexArray = new Uint16Array(data.indices);
    }

    const attributes = new GeometryAttributes();
    attributes.position = new GeometryAttribute({
      componentDatatype: ComponentDatatype.DOUBLE,
      componentsPerAttribute: 3,
      values: posArray,
    });
    attributes.normal = new GeometryAttribute({
      componentDatatype: ComponentDatatype.FLOAT,
      componentsPerAttribute: 3,
      values: normArray,
    });
    attributes.st = new GeometryAttribute({
      componentDatatype: ComponentDatatype.FLOAT,
      componentsPerAttribute: 2,
      values: uvArray,
    });

    const geometry = new Geometry({
      attributes: attributes,
      indices: indexArray,
      primitiveType: PrimitiveType.TRIANGLES,
      boundingSphere: BoundingSphere.fromVertices(data.positions),
    });

    geometries[type] = geometry;
  }

  return geometries;
}

/**
 * Data contracts and serialization formats for multithreaded procedural 3D Tile generation.
 */

export interface TileRequestPayload {
  tileId: string;
  x: number;
  y: number;
  level: number;
  west: number;
  south: number;
  east: number;
  north: number;
  minHeight?: number;
  maxHeight?: number;
  theme?: string;
  seed?: number;
}

export interface InstancedMeshHeader {
  type: 'tree' | 'building' | 'rock';
  count: number;
  positions: Float32Array; // Relative to tile center [x, y, z]
  scales: Float32Array;    // Uniform or vec3 scale
  rotations: Float32Array; // Euler angles or quaternions
}

export interface TileResponsePayload {
  tileId: string;
  success: boolean;
  gltfArrayBuffer?: ArrayBuffer;
  boundingSphereRadius?: number;
  error?: string;
}

export interface WorkerJob {
  id: string;
  payload: TileRequestPayload;
  resolve: (response: TileResponsePayload) => void;
  reject: (reason: Error) => void;
}

export type EntityType =
  | 'continent'
  | 'region'
  | 'island'
  | 'city'
  | 'town'
  | 'landmark'
  | 'custom';

export type TerraGeometry =
  | GeoJSON.Polygon
  | GeoJSON.MultiPolygon
  | GeoJSON.Point;

export interface TerraImageRef {
  id: string;
  blobKey: string;
  caption?: string;
}

export interface TerraEntity {
  id: string;
  type: EntityType;
  name: string;
  description: string;
  tags: string[];
  color: string;
  fillOpacity: number;
  parentId: string | null;
  geometry: TerraGeometry;
  images: TerraImageRef[];
  properties: Record<string, string | number | boolean>;
  createdAt: number;
  updatedAt: number;
}

export interface CameraState {
  lon: number;
  lat: number;
  height: number;
  heading: number;
  pitch: number;
}

/**
 * A single placed voxel block, stored relative to the walk anchor.
 * bx/by/bz are integer offsets in metres from the anchor origin.
 */
export interface VoxelBlock {
  bx: number;
  by: number;
  bz: number;
  blockId: number;
}

/**
 * Serialised chunk of voxel data. Key is "cx,cy,cz" in chunk coords.
 */
export type VoxelChunkMap = Record<string, VoxelBlock[]>;

/**
 * The geodetic anchor for the walk-mode world.
 */
export interface WalkAnchor {
  lon: number;
  lat: number;
  altM: number;
}

export interface World {
  id: string;
  name: string;
  seed?: number;
  entities: Record<string, TerraEntity>;
  camera: CameraState;
  properties?: Record<string, any>;
  version: 1;
  updatedAt?: number;
  voxelChunks?: VoxelChunkMap;
  walkAnchor?: WalkAnchor;
}

export type ToolMode =
  | 'select'
  | 'pan'
  | 'drawPolygon'
  | 'editVertices'
  | 'placePoint'
  | 'designAssist'
  | 'freehandDraw'
  | 'addPart'
  | 'eraseRegion'
  | 'walk';

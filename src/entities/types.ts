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

export interface World {
  id: string;
  name: string;
  seed?: number;
  entities: Record<string, TerraEntity>;
  camera: CameraState;
  properties?: Record<string, any>;
  version: 1;
  updatedAt?: number;
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

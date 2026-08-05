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
 * A sparse voxel override in stable planet-metre coordinates.
 * Legacy saves may contain anchor-relative coordinates and are migrated on entry.
 */
export interface VoxelBlock {
  bx: number;
  by: number;
  bz: number;
  blockId: number;
}

/**
 * Serialised sparse voxel overrides. Current keys are "planet/cx,cy,cz".
 */
export type VoxelChunkMap = Record<string, VoxelBlock[]>;

/** Planet chunk keys that NOA has generated, stored with their last visit time. */
export type GeneratedVoxelChunkMap = Record<string, number>;

/**
 * The geodetic anchor for the walk-mode world.
 */
export interface WalkAnchor {
  lon: number;
  lat: number;
  altM: number;
}

export type NpcOccupation = 'merchant' | 'innkeeper' | 'artisan' | 'farmer' | 'guard' | 'laborer';
export type NpcActivity = 'sleep' | 'breakfast' | 'work' | 'lunch' | 'market' | 'tavern' | 'patrol' | 'leisure' | 'travel-home';
export type SettlementBuildingUse = 'home' | 'shop' | 'inn' | 'workshop' | 'farm' | 'office' | 'civic';

export interface NpcLocation {
  x: number;
  y: number;
  z: number;
  label: string;
}

export interface NpcScheduleEntry {
  startHour: number;
  activity: NpcActivity;
  destination: 'home' | 'work' | 'market' | 'tavern' | 'patrol';
}

export interface WorldNpc {
  id: string;
  name: string;
  settlementId: string;
  occupation: NpcOccupation;
  home: NpcLocation;
  workplace: NpcLocation;
  market: NpcLocation;
  tavern: NpcLocation;
  position: NpcLocation;
  schedule: NpcScheduleEntry[];
  currentActivity: NpcActivity;
  relationships: Record<string, number>;
  memories: string[];
  conversationStage: number;
  createdAt: number;
  updatedAt: number;
  lastSimulatedAt: number;
}

export type MobSpecies = 'pig' | 'cow' | 'sheep' | 'chicken';
export type MobBehavior = 'idle' | 'wander' | 'flee';

export interface WorldMob {
  id: string;
  species: MobSpecies;
  position: NpcLocation;
  home: NpcLocation;
  health: number;
  behavior: MobBehavior;
  createdAt: number;
  updatedAt: number;
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
  generatedVoxelChunks?: GeneratedVoxelChunkMap;
  walkAnchor?: WalkAnchor;
  npcs?: Record<string, WorldNpc>;
  mobs?: Record<string, WorldMob>;
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

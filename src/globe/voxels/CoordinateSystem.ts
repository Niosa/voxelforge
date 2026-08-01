import { Cartesian3, Transforms, Matrix4, Cartographic } from 'cesium';
import { CHUNK_SIZE, VOXEL_SIZE } from './VoxelChunk';

export class CoordinateSystem {
  private originCartesian: Cartesian3 = Cartesian3.ZERO;
  private originCartographic: Cartographic = new Cartographic();
  private enuToFixed: Matrix4 = new Matrix4();
  private fixedToEnu: Matrix4 = new Matrix4();

  public setAnchor(lon: number, lat: number, alt: number = 0) {
    this.originCartographic = Cartographic.fromDegrees(lon, lat, alt);
    this.originCartesian = Cartesian3.fromDegrees(lon, lat, alt);
    
    // Matrix to convert Local ENU (meters) to World Cartesian3
    this.enuToFixed = Transforms.eastNorthUpToFixedFrame(this.originCartesian);
    
    // Matrix to convert World Cartesian3 to Local ENU (meters)
    this.fixedToEnu = Matrix4.inverseTransformation(this.enuToFixed, new Matrix4());
  }

  public getAnchor() {
    return this.originCartographic;
  }

  public getAnchorCartesian() {
    return this.originCartesian;
  }

  public getEnuToFixedMatrix(): Matrix4 {
    return this.enuToFixed;
  }

  /** Convert World Cartesian3 to Local ENU meters */
  public worldToLocal(worldPos: Cartesian3): Cartesian3 {
    return Matrix4.multiplyByPoint(this.fixedToEnu, worldPos, new Cartesian3());
  }

  /** Convert Local ENU meters to World Cartesian3 */
  public localToWorld(localPos: Cartesian3): Cartesian3 {
    return Matrix4.multiplyByPoint(this.enuToFixed, localPos, new Cartesian3());
  }

  /** Convert Local ENU meters to Global Chunk Coordinates (cx, cy, cz) and internal local voxel coords (lx, ly, lz) */
  public localToChunk(localPos: Cartesian3): { cx: number, cy: number, cz: number, lx: number, ly: number, lz: number } {
    const chunkMeters = CHUNK_SIZE * VOXEL_SIZE;
    
    const cx = Math.floor(localPos.x / chunkMeters);
    const cy = Math.floor(localPos.y / chunkMeters);
    const cz = Math.floor(localPos.z / chunkMeters);

    let lx = Math.floor((localPos.x - cx * chunkMeters) / VOXEL_SIZE);
    let ly = Math.floor((localPos.y - cy * chunkMeters) / VOXEL_SIZE);
    let lz = Math.floor((localPos.z - cz * chunkMeters) / VOXEL_SIZE);

    // Safety clamp (floating point precision edge cases)
    lx = Math.max(0, Math.min(CHUNK_SIZE - 1, lx));
    ly = Math.max(0, Math.min(CHUNK_SIZE - 1, ly));
    lz = Math.max(0, Math.min(CHUNK_SIZE - 1, lz));

    return { cx, cy, cz, lx, ly, lz };
  }

  /** Get the World Cartesian3 center of a chunk (used for RTC rendering origin) */
  public getChunkCenterWorld(cx: number, cy: number, cz: number): Cartesian3 {
    const chunkMeters = CHUNK_SIZE * VOXEL_SIZE;
    const localCenter = new Cartesian3(
      cx * chunkMeters + chunkMeters / 2,
      cy * chunkMeters + chunkMeters / 2,
      cz * chunkMeters // Base of the chunk instead of true center for easier alignment
    );
    return this.localToWorld(localCenter);
  }
}

export const voxelCoords = new CoordinateSystem();

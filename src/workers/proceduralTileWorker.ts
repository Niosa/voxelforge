import type { TileRequestPayload, TileResponsePayload } from './types';

// Simple fast self-contained Simplex Noise for Web Worker environment
class WorkerSimplexNoise {
  private p = new Uint8Array(256);
  private perm = new Uint8Array(512);

  constructor(seed = 42) {
    for (let i = 0; i < 256; i++) {
      this.p[i] = i;
    }
    // Seeded shuffle
    let s = seed % 2147483647;
    if (s <= 0) s += 2147483646;
    for (let i = 255; i > 0; i--) {
      s = (s * 16807) % 2147483647;
      const j = Math.floor((s / 2147483647) * (i + 1));
      const tmp = this.p[i]!;
      this.p[i] = this.p[j]!;
      this.p[j] = tmp;
    }
    for (let i = 0; i < 512; i++) {
      this.perm[i] = this.p[i & 255]!;
    }
  }

  public noise2D(x: number, y: number): number {
    const F2 = 0.5 * (Math.sqrt(3.0) - 1.0);
    const G2 = (3.0 - Math.sqrt(3.0)) / 6.0;

    const s = (x + y) * F2;
    const i = Math.floor(x + s);
    const j = Math.floor(y + s);
    const t = (i + j) * G2;
    const X0 = i - t;
    const Y0 = j - t;
    const x0 = x - X0;
    const y0 = y - Y0;

    const i1 = x0 > y0 ? 1 : 0;
    const j1 = x0 > y0 ? 0 : 1;

    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1.0 + 2.0 * G2;
    const y2 = y0 - 1.0 + 2.0 * G2;

    const ii = i & 255;
    const jj = j & 255;

    const gi0 = this.perm[ii + this.perm[jj]!]! % 8;
    const gi1 = this.perm[ii + i1 + this.perm[jj + j1]!]! % 8;
    const gi2 = this.perm[ii + 1 + this.perm[jj + 1]!]! % 8;

    const n0 = this.grad(gi0, x0, y0);
    const n1 = this.grad(gi1, x1, y1);
    const n2 = this.grad(gi2, x2, y2);

    return 70.0 * (n0 + n1 + n2);
  }

  private grad(hash: number, x: number, y: number): number {
    const h = hash & 7;
    const u = h < 4 ? x : y;
    const v = h < 4 ? y : x;
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  }

  public fbm(x: number, y: number, octaves = 4): number {
    let val = 0;
    let amp = 0.5;
    let freq = 1.0;
    for (let i = 0; i < octaves; i++) {
      val += this.noise2D(x * freq, y * freq) * amp;
      freq *= 2.0;
      amp *= 0.5;
    }
    return val;
  }
}

self.onmessage = (e: MessageEvent<TileRequestPayload>) => {
  const req = e.data;
  try {
    const gltfBuffer = generateTileGlbBuffer(req);
    const response: TileResponsePayload = {
      tileId: req.tileId,
      success: true,
      gltfArrayBuffer: gltfBuffer,
      boundingSphereRadius: 50000,
    };

    // Zero-copy transfer of ArrayBuffer payload back to main thread
    (self as unknown as Worker).postMessage(response, [gltfBuffer]);
  } catch (err) {
    const response: TileResponsePayload = {
      tileId: req.tileId,
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
    (self as unknown as Worker).postMessage(response);
  }
};

/**
 * Generates binary glTF (.glb) ArrayBuffer payload for a procedural 3D terrain tile.
 */
function generateTileGlbBuffer(req: TileRequestPayload): ArrayBuffer {
  const noise = new WorkerSimplexNoise(req.seed || 42);
  const gridSize = 16; // 16x16 grid resolution per tile for mobile performance
  const vertexCount = (gridSize + 1) * (gridSize + 1);

  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);

  const dx = (req.east - req.west) / gridSize;
  const dy = (req.north - req.south) / gridSize;

  let vIdx = 0;
  let uvIdx = 0;

  for (let row = 0; row <= gridSize; row++) {
    for (let col = 0; col <= gridSize; col++) {
      const u = col / gridSize;
      const v = row / gridSize;

      const lon = req.west + col * dx;
      const lat = req.south + row * dy;

      // Sample procedural heightmap
      const elevation = noise.fbm(lon * 0.1, lat * 0.1, 4) * 800;

      // Local relative-to-center coordinates (RTC)
      positions[vIdx] = (u - 0.5) * 10000;
      positions[vIdx + 1] = elevation;
      positions[vIdx + 2] = (v - 0.5) * 10000;

      // Normal facing up
      normals[vIdx] = 0;
      normals[vIdx + 1] = 1;
      normals[vIdx + 2] = 0;

      uvs[uvIdx] = u;
      uvs[uvIdx + 1] = v;

      vIdx += 3;
      uvIdx += 2;
    }
  }

  // Create triangle indices
  const indexCount = gridSize * gridSize * 6;
  const indices = new Uint16Array(indexCount);
  let iIdx = 0;

  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      const topLeft = row * (gridSize + 1) + col;
      const topRight = topLeft + 1;
      const bottomLeft = (row + 1) * (gridSize + 1) + col;
      const bottomRight = bottomLeft + 1;

      indices[iIdx++] = topLeft;
      indices[iIdx++] = bottomLeft;
      indices[iIdx++] = topRight;

      indices[iIdx++] = topRight;
      indices[iIdx++] = bottomLeft;
      indices[iIdx++] = bottomRight;
    }
  }

  // Pack into binary glTF (.glb) container
  return packBinaryGlb(positions, normals, uvs, indices);
}

/**
 * Minimal valid Binary glTF (.glb) generator container for Web Worker output.
 */
function packBinaryGlb(
  positions: Float32Array,
  normals: Float32Array,
  uvs: Float32Array,
  indices: Uint16Array,
): ArrayBuffer {
  const posBytes = positions.byteLength;
  const normBytes = normals.byteLength;
  const uvBytes = uvs.byteLength;
  const idxBytes = indices.byteLength;

  const totalBinBytes = posBytes + normBytes + uvBytes + idxBytes;
  const binBuffer = new Uint8Array(totalBinBytes);

  let offset = 0;
  binBuffer.set(new Uint8Array(positions.buffer), offset); offset += posBytes;
  binBuffer.set(new Uint8Array(normals.buffer), offset); offset += normBytes;
  binBuffer.set(new Uint8Array(uvs.buffer), offset); offset += uvBytes;
  binBuffer.set(new Uint8Array(indices.buffer), offset);

  const jsonHeader = {
    asset: { version: '2.0', generator: 'TerraforgeWorkerEngine' },
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [
      {
        primitives: [
          {
            attributes: {
              POSITION: 0,
              NORMAL: 1,
              TEXCOORD_0: 2,
            },
            indices: 3,
          },
        ],
      },
    ],
    buffers: [{ byteLength: totalBinBytes }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: posBytes, target: 34962 },
      { buffer: 0, byteOffset: posBytes, byteLength: normBytes, target: 34962 },
      { buffer: 0, byteOffset: posBytes + normBytes, byteLength: uvBytes, target: 34962 },
      { buffer: 0, byteOffset: posBytes + normBytes + uvBytes, byteLength: idxBytes, target: 34963 },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: positions.length / 3, type: 'VEC3' },
      { bufferView: 1, componentType: 5126, count: normals.length / 3, type: 'VEC3' },
      { bufferView: 2, componentType: 5126, count: uvs.length / 2, type: 'VEC2' },
      { bufferView: 3, componentType: 5123, count: indices.length, type: 'SCALAR' },
    ],
  };

  const jsonString = JSON.stringify(jsonHeader);
  const jsonEncoder = new TextEncoder();
  const jsonBytes = jsonEncoder.encode(jsonString);

  // Pad JSON chunk to 4-byte boundary
  const jsonPaddedLength = Math.ceil(jsonBytes.length / 4) * 4;
  const jsonChunk = new Uint8Array(jsonPaddedLength);
  jsonChunk.set(jsonBytes);
  for (let i = jsonBytes.length; i < jsonPaddedLength; i++) {
    jsonChunk[i] = 0x20; // space padding
  }

  // GLB Header (12 bytes) + JSON Chunk Header (8 bytes) + JSON Body + BIN Chunk Header (8 bytes) + BIN Body
  const totalGlbSize = 12 + 8 + jsonPaddedLength + 8 + totalBinBytes;
  const glbBuffer = new ArrayBuffer(totalGlbSize);
  const dataView = new DataView(glbBuffer);
  const uint8View = new Uint8Array(glbBuffer);

  // 12-byte GLB Header
  dataView.setUint32(0, 0x46546c67, true); // Magic 'glTF'
  dataView.setUint32(4, 2, true);          // Version 2
  dataView.setUint32(8, totalGlbSize, true);

  // JSON Chunk Header
  dataView.setUint32(12, jsonPaddedLength, true);
  dataView.setUint32(16, 0x4e4f534a, true); // Chunk type 'JSON'
  uint8View.set(jsonChunk, 20);

  // BIN Chunk Header
  const binHeaderOffset = 20 + jsonPaddedLength;
  dataView.setUint32(binHeaderOffset, totalBinBytes, true);
  dataView.setUint32(binHeaderOffset + 4, 0x004e4942, true); // Chunk type 'BIN\0'
  uint8View.set(binBuffer, binHeaderOffset + 8);

  return glbBuffer;
}

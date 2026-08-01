import { SimplexNoise2D, hashSeed } from '@/geo/noise';
import { LruCache } from '@/utils/lruCache';

export type BiomeType =
  | 'satellite-blend'
  | 'lush-grassland'
  | 'volcanic-ash'
  | 'forest-canopy'
  | 'desert-dunes'
  | 'snowy-tundra'
  | 'mountain-slate'
  | 'elven-azure'
  | 'city-urban'
  | 'town-village'
  | 'coastal-beach'
  | 'shallow-water'
  | 'custom';

export interface BiomeOptions {
  biome: BiomeType;
  color?: string;
  seedStr?: string;
  topography?: 'plains' | 'hills' | 'mountains' | 'valleys';
  climate?: 'temperate' | 'tropical' | 'arid' | 'frigid' | 'swamp';
  level?: number;
  west?: number;
  east?: number;
  south?: number;
  north?: number;
  /** Output texture size in px (default 256). Lower values save memory/CPU on low-power devices. */
  resolution?: number;
}

// Bounded caches: 500 entries ≈ 30MB of 256px canvases, preventing LRU thrashing on high-res monitors.
const canvasCache = new LruCache<string, HTMLCanvasElement>(500);
const dataUrlCache = new LruCache<string, string>(500);

/** Clears all cached biome textures (e.g. after the tab was hidden for a while). */
export function clearBiomeTextureCaches(): void {
  canvasCache.clear();
  dataUrlCache.clear();
}

function buildCacheKey(options: BiomeOptions, resolution: number): string {
  const seed = hashSeed(options.seedStr || options.biome);
  const zoomLevel = options.level ?? 12;
  const isWorldSpace = options.biome === 'satellite-blend';
  const wKey = (isWorldSpace && options.west) ? options.west.toFixed(2) : '0';
  const eKey = (isWorldSpace && options.east) ? options.east.toFixed(2) : '0';
  const sKey = (isWorldSpace && options.south) ? options.south.toFixed(2) : '0';
  const nKey = (isWorldSpace && options.north) ? options.north.toFixed(2) : '0';
  return `canvas_v13_${options.biome}_${seed}_${options.color ?? ''}_${options.topography ?? ''}_${options.climate ?? ''}_z${zoomLevel}_${wKey}_${eKey}_${sKey}_${nKey}_r${resolution}`;
}

/**
 * Returns raw HTMLCanvasElement texture synchronously.
 * Perfect for dynamic real-time map painting and pattern fills.
 */
export function getBiomeTextureCanvas(options: BiomeOptions): HTMLCanvasElement {
  const size = options.resolution ?? 256;
  const cacheKey = buildCacheKey(options, size);
  const cached = canvasCache.get(cacheKey);
  if (cached) return cached;

  const mainCanvas = document.createElement('canvas');
  mainCanvas.width = size;
  mainCanvas.height = size;
  const mainCtx = mainCanvas.getContext('2d');
  if (!mainCtx) return mainCanvas;

  // Use downsampled buffer for continuous terrain shaders (4x faster CPU math)
  const isCity = options.biome === 'city-urban' || options.biome === 'town-village';
  const bufferSize = isCity ? size : Math.min(128, size);
  const renderWidth = bufferSize;
  const renderHeight = bufferSize;

  const offCanvas = document.createElement('canvas');
  offCanvas.width = renderWidth;
  offCanvas.height = renderHeight;
  const offCtx = offCanvas.getContext('2d');
  if (!offCtx) return mainCanvas;

  const noise = new SimplexNoise2D(hashSeed(options.seedStr || options.biome));
  const imgData = offCtx.createImageData(renderWidth, renderHeight);
  const data = imgData.data;

  // Generate pixel-level procedural terrain
  switch (options.biome) {
    case 'mountain-slate':
      generateMountainSlateShader(data, renderWidth, renderHeight, noise, options);
      break;
    case 'volcanic-ash':
      generateVolcanicAshShader(data, renderWidth, renderHeight, noise, options);
      break;
    case 'lush-grassland':
      generateLushGrasslandShader(data, renderWidth, renderHeight, noise, options);
      break;
    case 'forest-canopy':
      generateForestCanopyShader(data, renderWidth, renderHeight, noise, options);
      break;
    case 'desert-dunes':
      generateDesertDunesShader(data, renderWidth, renderHeight, noise, options);
      break;
    case 'snowy-tundra':
      generateSnowyTundraShader(data, renderWidth, renderHeight, noise, options);
      break;
    case 'elven-azure':
      generateElvenAzureShader(data, renderWidth, renderHeight, noise, options);
      break;
    case 'coastal-beach':
      generateCoastalBeachShader(data, renderWidth, renderHeight, noise, options);
      break;
    case 'shallow-water':
      generateShallowWaterShader(data, renderWidth, renderHeight, noise, options);
      break;
    case 'city-urban':
      generateCityUrbanShader(data, renderWidth, renderHeight, noise, options);
      break;
    case 'town-village':
      generateTownVillageShader(data, renderWidth, renderHeight, noise, options);
      break;
    case 'custom':
      generateCustomColorShader(data, renderWidth, renderHeight, noise, options);
      break;
    case 'satellite-blend':
    default:
      generateSatelliteBlendShader(data, renderWidth, renderHeight, noise, options);
      break;
  }

  offCtx.putImageData(imgData, 0, 0);

  // Smooth bilinear upscale to target texture canvas
  mainCtx.imageSmoothingEnabled = true;
  mainCtx.imageSmoothingQuality = 'medium';
  mainCtx.drawImage(offCanvas, 0, 0, renderWidth, renderHeight, 0, 0, size, size);

  canvasCache.set(cacheKey, mainCanvas);
  return mainCanvas;
}

export function getBiomeTextureDataUrl(options: BiomeOptions): string {
  // Cache the encoded PNG alongside the canvas — toDataURL is expensive and
  // was previously re-run on every entity re-sync (5x per mountain).
  const size = options.resolution ?? 256;
  const cacheKey = buildCacheKey(options, size);
  const cachedUrl = dataUrlCache.get(cacheKey);
  if (cachedUrl) return cachedUrl;

  const canvas = getBiomeTextureCanvas(options);
  const url = canvas.toDataURL('image/png');
  dataUrlCache.set(cacheKey, url);
  return url;
}

/**
 * Calculates 3D Surface Normal Hillshading Coefficient (dot(N, L)).
 * Adjusted based on topography settings (Flat Plains -> Rugged Mountains).
 */
function getHillshading(
  u: number,
  v: number,
  noise: SimplexNoise2D,
  options: BiomeOptions,
  baseScale = 4.0,
  baseStrength = 1.5,
): number {
  let scale = baseScale;
  let strength = baseStrength;

  // Scale detail frequencies according to zoom level for smooth Level-of-Detail (LoD)
  const zoomLevel = options.level ?? 8;
  const lodMultiplier = Math.pow(1.18, Math.min(10, Math.max(0, zoomLevel - 4)));
  scale *= lodMultiplier;

  // Adjust shading based on custom topography profile
  if (options.topography === 'mountains') {
    scale *= 1.4;
    strength = baseStrength * 1.8;
  } else if (options.topography === 'hills') {
    scale *= 1.1;
    strength = baseStrength * 0.9;
  } else if (options.topography === 'valleys') {
    scale *= 0.85;
    strength = baseStrength * 0.7;
  } else if (options.topography === 'plains') {
    scale *= 0.45;
    strength = baseStrength * 0.25;
  }

  const eps = 0.01;
  const hC = noise.fbm(u * scale, v * scale, 3);
  const hR = noise.fbm((u + eps) * scale, v * scale, 3);
  const hB = noise.fbm(u * scale, (v + eps) * scale, 3);

  const dhdx = (hR - hC) * strength;
  const dhdy = (hB - hC) * strength;

  const lx = -0.577;
  const ly = -0.577;
  const lz = 0.577;

  const len = Math.sqrt(dhdx * dhdx + dhdy * dhdy + 1.0);
  const nx = -dhdx / len;
  const ny = -dhdy / len;
  const nz = 1.0 / len;

  const dot = nx * lx + ny * ly + nz * lz;
  const baseLighting = Math.max(0.35, Math.min(1.35, 0.7 + dot * 0.6));

  // High-zoom micro-grain texture details for realistic close-up inspection
  if (zoomLevel >= 9) {
    const microNoise = noise.fbm(u * scale * 3.5, v * scale * 3.5, 3) * 0.15;
    return Math.max(0.25, Math.min(1.45, baseLighting + microNoise));
  }

  return baseLighting;
}

/** Applies custom climate offsets to procedural RGB values */
function applyClimate(
  r: number,
  g: number,
  b: number,
  options: BiomeOptions,
): [number, number, number] {
  const climate = options.climate || 'temperate';

  if (climate === 'arid') {
    // Heat & dryness: shift green towards dry yellow and clay orange
    return [
      Math.min(255, r + 45),
      Math.min(255, g + 15),
      Math.max(0, b - 35),
    ];
  } else if (climate === 'tropical') {
    // Heat & humidity: boost deep jungle greens and moisture saturation
    return [
      Math.max(0, r - 20),
      Math.min(255, g + 35),
      Math.max(0, b - 10),
    ];
  } else if (climate === 'frigid') {
    // Cold & frost: add heavy blue-white glaze
    return [
      Math.min(255, r * 0.75 + 60),
      Math.min(255, g * 0.75 + 70),
      Math.min(255, b * 0.9 + 90),
    ];
  } else if (climate === 'swamp') {
    // Warm humidity: shift colors toward muddy olive and marsh brown
    return [
      Math.max(0, r - 15),
      Math.max(0, g - 5),
      Math.max(0, b - 25),
    ];
  }
  return [r, g, b];
}

/** Satellite Blend: Valleys -> Farmlands -> Forests -> Inland Lakes -> Craggy Slate -> Glacial Snow */
function generateSatelliteBlendShader(
  data: Uint8ClampedArray,
  W: number,
  H: number,
  noise: SimplexNoise2D,
  options: BiomeOptions,
) {
  const west = options.west ?? -180;
  const east = options.east ?? 180;
  const south = options.south ?? -90;
  const north = options.north ?? 90;

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const u = x / W;
      const v = y / H;

      const lon = west + u * (east - west);
      const lat = north - v * (north - south);

      // Geographically anchored world-space noise (streamlined for 60 FPS performance)
      const elev = noise.fbm(lon * 0.05, lat * 0.05, 3);
      const detail = noise.noise2D(lon * 1.2, lat * 1.2);
      const lakeNoise = noise.fbm(lon * 0.12 + 15.2, lat * 0.12 + 8.1, 2);
      const forestNoise = noise.noise2D(lon * 0.18 + 4.1, lat * 0.18 + 3.9);
      const shade = getHillshading(u, v, noise, options, 3.0, 1.8);

      let r: number, g: number, b: number;

      // Inland Lakes & Alpine Waterways
      if (lakeNoise > 0.65 && elev < 0.48) {
        const lakeDepth = (lakeNoise - 0.65) / 0.35;
        if (lakeDepth < 0.12) {
          // Golden sandy lake shore
          r = 245; g = 220; b = 135;
        } else {
          // Sapphire/Turquoise alpine lake water
          r = lerp(20, 2, lakeDepth);
          g = lerp(140, 90, lakeDepth);
          b = lerp(210, 160, lakeDepth);
        }
      } else if (forestNoise > 0.42 && elev < 0.65) {
        // Deep emerald forest canopy
        const fDensity = (forestNoise - 0.42) / 0.58;
        r = lerp(18, 10, fDensity) + detail * 8;
        g = lerp(85, 55, fDensity) + detail * 12;
        b = lerp(28, 18, fDensity) + detail * 6;
      } else if (elev < 0.35) {
        // Lowland valley & meadow
        const t = elev / 0.35;
        r = lerp(45, 70, t) + detail * 10;
        g = lerp(110, 145, t) + detail * 15;
        b = lerp(35, 55, t);
      } else if (elev < 0.62) {
        // Highland plateau & hills
        const t = (elev - 0.35) / 0.27;
        r = lerp(35, 65, t) + detail * 12;
        g = lerp(90, 115, t) + detail * 14;
        b = lerp(38, 58, t);
      } else if (elev < 0.8) {
        // Slate granite mountain ridges
        const t = (elev - 0.62) / 0.18;
        r = lerp(75, 125, t) + detail * 15;
        g = lerp(85, 130, t) + detail * 15;
        b = lerp(95, 145, t) + detail * 15;
      } else {
        // Glacial snowcaps
        const t = (elev - 0.8) / 0.2;
        r = lerp(210, 250, t);
        g = lerp(220, 252, t);
        b = lerp(235, 255, t);
      }

      // Climate & Shading multipliers
      const [cr, cg, cb] = applyClimate(r, g, b, options);
      const fr = cr * shade;
      const fg = cg * shade;
      const fb = cb * shade;

      const idx = (y * W + x) * 4;
      data[idx] = Math.min(255, Math.max(0, fr));
      data[idx + 1] = Math.min(255, Math.max(0, fg));
      data[idx + 2] = Math.min(255, Math.max(0, fb));
      data[idx + 3] = 255;
    }
  }
}

/** Mountain Slate: High-Relief Granite Ridges, Scree Slopes & Snow Summits */
function generateMountainSlateShader(
  data: Uint8ClampedArray,
  W: number,
  H: number,
  noise: SimplexNoise2D,
  options: BiomeOptions,
) {
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const u = x / W;
      const v = y / H;

      const elev = noise.warpedFbm(u * 4.5, v * 4.5, 6, 0.45);
      const rockNoise = noise.ridged(u * 12, v * 12, 4);
      const shade = getHillshading(u, v, noise, options, 4.5, 2.5);

      let r: number, g: number, b: number;

      if (elev < 0.35) {
        const t = elev / 0.35;
        r = lerp(30, 55, t);
        g = lerp(70, 95, t);
        b = lerp(40, 60, t);
      } else if (elev < 0.65) {
        const t = (elev - 0.35) / 0.3;
        r = lerp(75, 125, t) + rockNoise * 20;
        g = lerp(80, 130, t) + rockNoise * 20;
        b = lerp(90, 140, t) + rockNoise * 20;
      } else if (elev < 0.82) {
        const t = (elev - 0.65) / 0.17;
        r = lerp(120, 165, t);
        g = lerp(125, 170, t);
        b = lerp(135, 180, t);
      } else {
        const t = (elev - 0.82) / 0.18;
        r = lerp(200, 250, t);
        g = lerp(210, 252, t);
        b = lerp(225, 255, t);
      }

      const [cr, cg, cb] = applyClimate(r, g, b, options);
      const fr = cr * shade;
      const fg = cg * shade;
      const fb = cb * shade;

      const idx = (y * W + x) * 4;
      data[idx] = Math.min(255, Math.max(0, fr));
      data[idx + 1] = Math.min(255, Math.max(0, fg));
      data[idx + 2] = Math.min(255, Math.max(0, fb));
      data[idx + 3] = 255;
    }
  }
}

/** Lush Grassland: Agricultural Parcel Grid, Meadow & River Veins */
function generateLushGrasslandShader(
  data: Uint8ClampedArray,
  W: number,
  H: number,
  noise: SimplexNoise2D,
  options: BiomeOptions,
) {
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const u = x / W;
      const v = y / H;

      const elev = noise.fbm(u * 3, v * 3, 5);
      const cropGrid = Math.sin(u * 40) * Math.cos(v * 40) * 0.1;
      const detail = noise.fbm(u * 16, v * 16, 3);
      const shade = getHillshading(u, v, noise, options, 3.0, 1.2);

      let r = lerp(40, 75, elev) + (detail + cropGrid) * 15;
      let g = lerp(105, 160, elev) + (detail + cropGrid) * 20;
      let b = lerp(30, 55, elev);

      const [cr, cg, cb] = applyClimate(r, g, b, options);
      const fr = cr * shade;
      const fg = cg * shade;
      const fb = cb * shade;

      const idx = (y * W + x) * 4;
      data[idx] = Math.min(255, Math.max(0, fr));
      data[idx + 1] = Math.min(255, Math.max(0, fg));
      data[idx + 2] = Math.min(255, Math.max(0, fb));
      data[idx + 3] = 255;
    }
  }
}

/** Forest Canopy: Deep Conifer Canopy, Woodland Glades & Shadow Ravines */
function generateForestCanopyShader(
  data: Uint8ClampedArray,
  W: number,
  H: number,
  noise: SimplexNoise2D,
  options: BiomeOptions,
) {
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const u = x / W;
      const v = y / H;

      const canopy = noise.warpedFbm(u * 6, v * 6, 6, 0.5);
      const leafDetail = noise.fbm(u * 20, v * 20, 3);
      const shade = getHillshading(u, v, noise, options, 6.0, 1.6);

      let r = lerp(15, 38, canopy) + leafDetail * 10;
      let g = lerp(55, 105, canopy) + leafDetail * 15;
      let b = lerp(22, 50, canopy) + leafDetail * 8;

      const [cr, cg, cb] = applyClimate(r, g, b, options);
      const fr = cr * shade;
      const fg = cg * shade;
      const fb = cb * shade;

      const idx = (y * W + x) * 4;
      data[idx] = Math.min(255, Math.max(0, fr));
      data[idx + 1] = Math.min(255, Math.max(0, fg));
      data[idx + 2] = Math.min(255, Math.max(0, fb));
      data[idx + 3] = 255;
    }
  }
}

/** Volcanic Ash: Weathered Basalt, Ash Beds & Molten Lava Cooling Crusts */
function generateVolcanicAshShader(
  data: Uint8ClampedArray,
  W: number,
  H: number,
  noise: SimplexNoise2D,
  options: BiomeOptions,
) {
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const u = x / W;
      const v = y / H;

      const basalt = noise.warpedFbm(u * 5, v * 5, 5, 0.5);
      const fissure = noise.ridged(u * 9, v * 9, 4);
      const shade = getHillshading(u, v, noise, options, 5.0, 2.0);

      let r = lerp(25, 60, basalt);
      let g = lerp(20, 45, basalt);
      let b = lerp(20, 40, basalt);

      if (fissure > 0.72) {
        const glow = (fissure - 0.72) / 0.28;
        r = lerp(r, 235, glow);
        g = lerp(g, 75, glow);
        b = lerp(b, 12, glow);
      } else {
        const [cr, cg, cb] = applyClimate(r, g, b, options);
        r = cr * shade;
        g = cg * shade;
        b = cb * shade;
      }

      const idx = (y * W + x) * 4;
      data[idx] = Math.min(255, Math.max(0, r));
      data[idx + 1] = Math.min(255, Math.max(0, g));
      data[idx + 2] = Math.min(255, Math.max(0, b));
      data[idx + 3] = 255;
    }
  }
}

/** Desert Dunes: Wind-Swept Sand Ripples, Dune Shadow Troughs & Mesa Strata */
function generateDesertDunesShader(
  data: Uint8ClampedArray,
  W: number,
  H: number,
  noise: SimplexNoise2D,
  options: BiomeOptions,
) {
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const u = x / W;
      const v = y / H;

      const dune = noise.warpedFbm(u * 5, v * 5, 5, 0.45);
      const ripple = Math.sin((u * 1.5 + v + noise.noise2D(u * 8, v * 8) * 0.15) * 45);
      const shade = getHillshading(u, v, noise, options, 5.0, 1.5);

      let r = lerp(185, 230, dune) + ripple * 10;
      let g = lerp(145, 185, dune) + ripple * 8;
      let b = lerp(70, 110, dune);

      const [cr, cg, cb] = applyClimate(r, g, b, options);
      const fr = cr * shade;
      const fg = cg * shade;
      const fb = cb * shade;

      const idx = (y * W + x) * 4;
      data[idx] = Math.min(255, Math.max(0, fr));
      data[idx + 1] = Math.min(255, Math.max(0, fg));
      data[idx + 2] = Math.min(255, Math.max(0, fb));
      data[idx + 3] = 255;
    }
  }
}

/** Snowy Tundra: Glacial Blue Ice, Frost Tundra & Snowdrifts */
function generateSnowyTundraShader(
  data: Uint8ClampedArray,
  W: number,
  H: number,
  noise: SimplexNoise2D,
  options: BiomeOptions,
) {
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const u = x / W;
      const v = y / H;

      const snow = noise.warpedFbm(u * 4.5, v * 4.5, 5, 0.45);
      const shade = getHillshading(u, v, noise, options, 4.5, 1.4);

      let r = lerp(195, 245, snow);
      let g = lerp(215, 250, snow);
      let b = lerp(230, 255, snow);

      const [cr, cg, cb] = applyClimate(r, g, b, options);
      const fr = cr * shade;
      const fg = cg * shade;
      const fb = cb * shade;

      const idx = (y * W + x) * 4;
      data[idx] = Math.min(255, Math.max(0, fr));
      data[idx + 1] = Math.min(255, Math.max(0, fg));
      data[idx + 2] = Math.min(255, Math.max(0, fb));
      data[idx + 3] = 255;
    }
  }
}

/** Elven Azure Shallows: Shallow Coral Reefs, Turquoise Lagoons & Sandbars */
function generateElvenAzureShader(
  data: Uint8ClampedArray,
  W: number,
  H: number,
  noise: SimplexNoise2D,
  options: BiomeOptions,
) {
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const u = x / W;
      const v = y / H;

      const reef = noise.warpedFbm(u * 5, v * 5, 5, 0.5);
      const shade = getHillshading(u, v, noise, options, 5.0, 1.2);

      let r = lerp(25, 60, reef);
      let g = lerp(120, 180, reef);
      let b = lerp(110, 160, reef);

      const [cr, cg, cb] = applyClimate(r, g, b, options);
      const fr = cr * shade;
      const fg = cg * shade;
      const fb = cb * shade;

      const idx = (y * W + x) * 4;
      data[idx] = Math.min(255, Math.max(0, fr));
      data[idx + 1] = Math.min(255, Math.max(0, fg));
      data[idx + 2] = Math.min(255, Math.max(0, fb));
      data[idx + 3] = 255;
    }
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}

function generateCityUrbanShader(
  data: Uint8ClampedArray,
  W: number,
  H: number,
  noise: SimplexNoise2D,
  options: BiomeOptions,
) {
  // --- seeded variable-pitch grid ---
  // Cell pitch varies per column/row so streets aren't perfectly uniform
  function cellPitch(i: number): number {
    // Pitch oscillates between 10 and 20 px based on i
    return 12 + Math.abs(Math.sin(i * 1.7)) * 8;
  }

  // Precompute cumulative cell boundaries for x and y (max 24 cells)
  const xBreaks: number[] = [0];
  while (xBreaks[xBreaks.length - 1] < W) {
    const c = xBreaks.length - 1;
    xBreaks.push(xBreaks[c] + cellPitch(c));
  }
  const yBreaks: number[] = [0];
  while (yBreaks[yBreaks.length - 1] < H) {
    const c = yBreaks.length - 1;
    yBreaks.push(yBreaks[c] + cellPitch(c + 7));
  }

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const u = x / W;
      const v = y / H;

      // Find which cell this pixel belongs to
      let cellX = 0;
      let cellX0 = 0, cellX1 = W;
      for (let ci = 0; ci < xBreaks.length - 1; ci++) {
        if (x >= xBreaks[ci] && x < xBreaks[ci + 1]) {
          cellX = ci;
          cellX0 = xBreaks[ci];
          cellX1 = xBreaks[ci + 1];
          break;
        }
      }
      let cellY = 0;
      let cellY0 = 0, cellY1 = H;
      for (let ci = 0; ci < yBreaks.length - 1; ci++) {
        if (y >= yBreaks[ci] && y < yBreaks[ci + 1]) {
          cellY = ci;
          cellY0 = yBreaks[ci];
          cellY1 = yBreaks[ci + 1];
          break;
        }
      }

      const cellW = cellX1 - cellX0;
      const cellH = cellY1 - cellY0;
      const inX = cellW > 0 ? (x - cellX0) / cellW : 0;
      const inY = cellH > 0 ? (y - cellY0) / cellH : 0;

      // Street lane width — narrower streets for sub-blocks
      const streetW = 0.14;
      const isRoad = inX < streetW || inY < streetW;

      let r = 71, g = 85, b = 105;

      if (isRoad) {
        // Asphalt base
        r = 28; g = 38; b = 52;

        // Dashed centre-line on wider roads (every other cell column on x-road)
        const isMajorRoadX = inX < streetW && cellX % 2 === 0;
        const isMajorRoadY = inY < streetW && cellY % 2 === 0;
        if (isMajorRoadX) {
          // Yellow dashed centre-line
          const dashPhase = (y % 14) < 7;
          const isCenter = Math.abs(inX - streetW / 2) < 0.025;
          if (isCenter && dashPhase) { r = 234; g = 179; b = 8; }
        }
        if (isMajorRoadY) {
          const dashPhase = (x % 14) < 7;
          const isCenter = Math.abs(inY - streetW / 2) < 0.025;
          if (isCenter && dashPhase) { r = 234; g = 179; b = 8; }
        }

        // Pedestrian crosswalk stripes at cell intersections
        const nearCornerX = inX < streetW && inY < streetW;
        if (!nearCornerX && (cellX % 4 === 0) && inX < streetW) {
          // White crosswalk stripes
          const stripe = Math.floor(inY * cellH / 3) % 2 === 0;
          if (stripe && inY > streetW * 0.1 && inY < 1 - streetW * 0.1) {
            r = 220; g = 220; b = 220;
          }
        }
      } else {
        // Block archetype — 4 types distributed by cell noise
        const archNoise = noise.noise2D(cellX * 5.3, cellY * 7.1);
        const archetype =
          archNoise > 0.4 ? 'park' :
          archNoise > 0.0 ? 'highrise' :
          archNoise > -0.45 ? 'midrise' : 'industrial';

        if (archetype === 'park') {
          // Organic park blobs using a second noise threshold
          const parkBlob = noise.warpedFbm(u * 10, v * 10, 4, 0.5);
          if (parkBlob > 0.45) {
            // Grass
            r = 34; g = 197; b = 94;
          } else if (parkBlob > 0.3) {
            // Darker hedge / shrub
            r = 21; g = 128; b = 61;
          } else {
            // Footpath gravel
            r = 180; g = 174; b = 162;
          }
          // Flower patches
          if (noise.noise2D(u * 22, v * 22) > 0.6) {
            r = 219; g = 39; b = 119;
          }
        } else if (archetype === 'industrial') {
          // Flat corrugated metal rooftops
          const stripe = Math.floor(inX * cellW / 4) % 2;
          r = stripe === 0 ? 80 : 65;
          g = stripe === 0 ? 88 : 74;
          b = stripe === 0 ? 100 : 85;
          // Occasional vent or skylight
          if (inX > 0.35 && inX < 0.45 && inY > 0.4 && inY < 0.55) {
            r = 14; g = 116; b = 144;
          }
          // Shadow on SE edge
          const nearEdge = inX > 0.85 || inY > 0.85;
          if (nearEdge) { r = Math.max(0, r - 30); g = Math.max(0, g - 30); b = Math.max(0, b - 25); }
        } else {
          // highrise or midrise — rooftop detail
          const roofMargin = archetype === 'highrise' ? 0.22 : 0.18;
          const inRoofX = inX >= roofMargin && inX <= 1 - roofMargin;
          const inRoofY = inY >= roofMargin && inY <= 1 - roofMargin;
          const inShadowX = inX > (1 - roofMargin) && inX <= (1 - roofMargin + 0.14) && inY >= roofMargin;
          const inShadowY = inY > (1 - roofMargin) && inY <= (1 - roofMargin + 0.14) && inX >= roofMargin;

          if (inRoofX && inRoofY) {
            const roofStyle = Math.abs(Math.floor(noise.noise2D(cellX * 4.1, cellY * 4.7) * 10)) % 5;
            if (roofStyle === 0) {
              // Blue glass curtain wall rooftop
              r = 14; g = 116; b = 144;
              if (Math.abs(inX - 0.5) < 0.07 && Math.abs(inY - 0.5) < 0.07) { r = 234; g = 179; b = 8; }
            } else if (roofStyle === 1) {
              // Concrete gravel
              r = 108; g = 120; b = 138;
              if (inX >= 0.44 && inX <= 0.56 && inY >= 0.44 && inY <= 0.56) { r = 51; g = 65; b = 85; }
            } else if (roofStyle === 2) {
              // White EPDM membrane
              r = 210; g = 212; b = 205;
              // HVAC units
              if (inX > 0.55 && inX < 0.7 && inY > 0.35 && inY < 0.55) { r = 140; g = 148; b = 160; }
            } else if (roofStyle === 3) {
              // Terracotta / brick parapet
              r = 168; g = 89; b = 55;
            } else {
              // Dark metallic / sedum green roof
              const isGreen = noise.noise2D(u * 18, v * 18) > 0.1;
              r = isGreen ? 45 : 47; g = isGreen ? 130 : 55; b = isGreen ? 58 : 69;
            }

            // Ambient occlusion: darken pixels near building edge
            const edgeDist = Math.min(inX - roofMargin, (1 - roofMargin) - inX, inY - roofMargin, (1 - roofMargin) - inY);
            if (edgeDist < 0.06) {
              const ao = 1 - (0.06 - edgeDist) / 0.06 * 0.4;
              r = Math.max(0, r * ao); g = Math.max(0, g * ao); b = Math.max(0, b * ao);
            }
          } else if (inShadowX || inShadowY) {
            r = 12; g = 18; b = 28;
          } else {
            // Plaza / courtyard between buildings
            const yardNoise = noise.noise2D(u * 14, v * 14);
            if (yardNoise > 0.2) { r = 22; g = 163; b = 74; }       // green courtyard
            else if (yardNoise > -0.1) { r = 148; g = 163; b = 184; } // plaza concrete
            else { r = 100; g = 108; b = 120; }                        // parking lot
          }
        }
      }

      const shade = getHillshading(u, v, noise, options, 4.0, 0.85);
      const [cr, cg, cb] = applyClimate(r, g, b, options);

      const idx = (y * W + x) * 4;
      data[idx] = Math.min(255, Math.max(0, Math.round(cr * shade)));
      data[idx + 1] = Math.min(255, Math.max(0, Math.round(cg * shade)));
      data[idx + 2] = Math.min(255, Math.max(0, Math.round(cb * shade)));
      data[idx + 3] = 255;
    }
  }
}

function generateTownVillageShader(
  data: Uint8ClampedArray,
  W: number,
  H: number,
  noise: SimplexNoise2D,
  options: BiomeOptions,
) {
  const gridCount = 10;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const u = x / W;
      const v = y / H;

      const cellX = Math.floor(u * gridCount);
      const cellY = Math.floor(v * gridCount);
      const inX = (u * gridCount) % 1;
      const inY = (v * gridCount) % 1;

      // Winding dirt roads/cobble paths
      const pathNoise = noise.noise2D(u * 6, v * 6);
      const isPath = inX < 0.12 || inY < 0.12 || Math.abs(pathNoise) < 0.08;

      let r = 34; // grassland green
      let g = 197;
      let b = 94;

      if (isPath) {
        r = 139; // cobblestone dirt brown
        g = 115;
        b = 85;
      } else {
        const hasCottage = noise.noise2D(cellX * 9, cellY * 9) > -0.2;
        if (hasCottage) {
          // Cottage thatched roofs (sienna tiles / straw)
          const inRoofX = inX >= 0.3 && inX <= 0.7;
          const inRoofY = inY >= 0.3 && inY <= 0.7;

          // Shadow cast to bottom-right
          const inShadowX = inX > 0.7 && inX <= 0.85 && inY >= 0.3;
          const inShadowY = inY > 0.7 && inY <= 0.85 && inX >= 0.3;

          if (inRoofX && inRoofY) {
            r = 180; // thatched roof sienna
            g = 83;
            b = 9;
            // Stone chimney
            if (inX >= 0.35 && inX <= 0.45 && inY >= 0.35 && inY <= 0.45) {
              r = 87; g = 83; b = 78;
            }
          } else if (inShadowX || inShadowY) {
            r = 20; // dark grass shadow
            g = 70;
            b = 20;
          } else {
            // Wild garden or courtyard
            const isFlower = noise.noise2D(u * 20, v * 20) > 0.4;
            if (isFlower) {
              r = 219; g = 39; b = 119; // pink flowerbed patches!
            } else {
              r = 21; g = 128; b = 61; // dark hedge green
            }
          }
        }
      }

      const shade = getHillshading(u, v, noise, options, 3.5, 1.25);
      const [cr, cg, cb] = applyClimate(r, g, b, options);

      const idx = (y * W + x) * 4;
      data[idx] = Math.min(255, Math.max(0, cr * shade));
      data[idx + 1] = Math.min(255, Math.max(0, cg * shade));
      data[idx + 2] = Math.min(255, Math.max(0, cb * shade));
      data[idx + 3] = 255;
    }
  }
}

/** Coastal Beach: Golden Shoreline Sand, Dunes & Shell Noise */
function generateCoastalBeachShader(
  data: Uint8ClampedArray,
  W: number,
  H: number,
  noise: SimplexNoise2D,
  options: BiomeOptions,
) {
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const u = x / W;
      const v = y / H;

      const sand = noise.fbm(u * 8, v * 8, 4);
      const ripple = Math.sin((u * 2 + v + noise.noise2D(u * 12, v * 12) * 0.1) * 30);

      let r = lerp(230, 254, sand) + ripple * 6;
      let g = lerp(200, 235, sand) + ripple * 5;
      let b = lerp(120, 160, sand);

      const shade = getHillshading(u, v, noise, options, 3.0, 1.2);
      const [cr, cg, cb] = applyClimate(r, g, b, options);

      const idx = (y * W + x) * 4;
      data[idx] = Math.min(255, Math.max(0, cr * shade));
      data[idx + 1] = Math.min(255, Math.max(0, cg * shade));
      data[idx + 2] = Math.min(255, Math.max(0, cb * shade));
      data[idx + 3] = 255;
    }
  }
}

/** Shallow Water: Turquoise Coral Shelf, Sandbars & Wave Caustics */
function generateShallowWaterShader(
  data: Uint8ClampedArray,
  W: number,
  H: number,
  noise: SimplexNoise2D,
  _options: BiomeOptions,
) {
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const u = x / W;
      const v = y / H;

      const depth = noise.warpedFbm(u * 5, v * 5, 4, 0.5);
      const wave = Math.sin((u * 3 + v * 2 + noise.noise2D(u * 10, v * 10) * 0.2) * 20);

      let r = lerp(14, 56, depth) + wave * 4;
      let g = lerp(165, 215, depth) + wave * 8;
      let b = lerp(233, 248, depth) + wave * 5;

      const idx = (y * W + x) * 4;
      data[idx] = Math.min(255, Math.max(0, r));
      data[idx + 1] = Math.min(255, Math.max(0, g));
      data[idx + 2] = Math.min(255, Math.max(0, b));
      data[idx + 3] = 220; // Translucent shallow water blend
    }
  }
}

/** Custom Color: Procedural Landmass Texture tinted with entity's custom color */
function generateCustomColorShader(
  data: Uint8ClampedArray,
  W: number,
  H: number,
  noise: SimplexNoise2D,
  options: BiomeOptions,
) {
  let baseR = 45, baseG = 212, baseB = 191; // Default teal #2dd4bf
  if (options.color) {
    try {
      const hex = options.color.replace('#', '');
      if (hex.length === 6) {
        baseR = parseInt(hex.substring(0, 2), 16);
        baseG = parseInt(hex.substring(2, 4), 16);
        baseB = parseInt(hex.substring(4, 6), 16);
      }
    } catch (_) {
      // fallback
    }
  }

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const u = x / W;
      const v = y / H;

      const elev = noise.warpedFbm(u * 4, v * 4, 5, 0.45);
      const detail = noise.fbm(u * 12, v * 12, 3);
      const shade = getHillshading(u, v, noise, options, 3.5, 1.3);

      let r = baseR * (0.8 + elev * 0.4) + detail * 10;
      let g = baseG * (0.8 + elev * 0.4) + detail * 10;
      let b = baseB * (0.8 + elev * 0.4) + detail * 10;

      const [cr, cg, cb] = applyClimate(r, g, b, options);
      const fr = cr * shade;
      const fg = cg * shade;
      const fb = cb * shade;

      const idx = (y * W + x) * 4;
      data[idx] = Math.min(255, Math.max(0, Math.round(fr)));
      data[idx + 1] = Math.min(255, Math.max(0, Math.round(fg)));
      data[idx + 2] = Math.min(255, Math.max(0, Math.round(fb)));
      data[idx + 3] = 255;
    }
  }
}

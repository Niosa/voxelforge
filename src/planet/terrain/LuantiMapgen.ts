/**
 * Browser-oriented terrain fields based on Luanti Mapgen V7's staged design:
 * blended base/alternate terrain, independent mountains and ridges, intersecting
 * cave fields, and coherent ore clusters. This is an original TypeScript
 * implementation and does not embed Luanti's native mapgen code.
 */

export interface V7TerrainFields {
  rolling: number;
  mountain: number;
  ridge: number;
}

function hash(seed: number, x: number, y: number, z: number): number {
  let value = seed ^ Math.imul(x, 374_761_393) ^ Math.imul(y, 668_265_263) ^ Math.imul(z, 2_147_483_647);
  value = Math.imul(value ^ value >>> 13, 1_274_126_177);
  return ((value ^ value >>> 16) >>> 0) / 0xffff_ffff * 2 - 1;
}

function fade(value: number): number {
  return value * value * value * (value * (value * 6 - 15) + 10);
}

function mix(left: number, right: number, amount: number): number {
  return left + (right - left) * amount;
}

export function valueNoise2D(seed: number, x: number, z: number, spread: number): number {
  const sx = x / spread;
  const sz = z / spread;
  const x0 = Math.floor(sx);
  const z0 = Math.floor(sz);
  const tx = fade(sx - x0);
  const tz = fade(sz - z0);
  const near = mix(hash(seed, x0, 0, z0), hash(seed, x0 + 1, 0, z0), tx);
  const far = mix(hash(seed, x0, 0, z0 + 1), hash(seed, x0 + 1, 0, z0 + 1), tx);
  return mix(near, far, tz);
}

export function valueNoise3D(seed: number, x: number, y: number, z: number, spread: number): number {
  const sx = x / spread;
  const sy = y / spread;
  const sz = z / spread;
  const x0 = Math.floor(sx);
  const y0 = Math.floor(sy);
  const z0 = Math.floor(sz);
  const tx = fade(sx - x0);
  const ty = fade(sy - y0);
  const tz = fade(sz - z0);
  const layer = (iy: number): number => {
    const near = mix(hash(seed, x0, iy, z0), hash(seed, x0 + 1, iy, z0), tx);
    const far = mix(hash(seed, x0, iy, z0 + 1), hash(seed, x0 + 1, iy, z0 + 1), tx);
    return mix(near, far, tz);
  };
  return mix(layer(y0), layer(y0 + 1), ty);
}

function fractal2D(seed: number, x: number, z: number, spread: number, octaves: number, persistence: number): number {
  let value = 0;
  let amplitude = 1;
  let normalization = 0;
  for (let octave = 0; octave < octaves; octave++) {
    value += valueNoise2D(seed + octave * 1_013, x, z, spread / 2 ** octave) * amplitude;
    normalization += amplitude;
    amplitude *= persistence;
  }
  return value / normalization;
}

export function sampleV7TerrainFields(seed: number, x: number, z: number): V7TerrainFields {
  const base = fractal2D(seed + 82_341, x, z, 180, 5, 0.6);
  const alternate = fractal2D(seed + 5_934, x, z, 72, 4, 0.6);
  const selector = Math.max(0, Math.min(1, 0.5 + fractal2D(seed + 4_213, x, z, 260, 4, 0.7) * 0.7));
  const rolling = mix(alternate, Math.max(base, alternate * 0.65), selector);
  const mountainField = fractal2D(seed + 5_333, x, z, 110, 5, 0.63);
  const mountain = Math.max(0, mountainField - 0.08) ** 1.35;
  const ridgeField = Math.abs(fractal2D(seed + 85_039, x, z, 155, 4, 0.6));
  const ridge = Math.max(0, 1 - ridgeField * 7) ** 2;
  return { rolling, mountain, ridge };
}

export function isNoiseIntersectionCave(seed: number, x: number, y: number, z: number): boolean {
  const first = 1 - Math.abs(valueNoise3D(seed + 52_534, x, y, z, 19));
  const second = 1 - Math.abs(valueNoise3D(seed + 10_325, x, y, z, 23));
  return first * second > 0.79;
}

export function clusteredOreAt(seed: number, x: number, y: number, z: number, depthBelowSurface: number): number | null {
  if (depthBelowSurface < 5) return null;
  const coal = valueNoise3D(seed + 2_404, x, y, z, 6.5);
  if (coal > 0.54) return 34;
  if (depthBelowSurface >= 10) {
    const iron = valueNoise3D(seed + 4_234, x, y, z, 5.25);
    if (iron > 0.64) return 35;
  }
  return null;
}

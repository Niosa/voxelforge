/**
 * Seeded 2D Simplex Noise with Fractal Brownian Motion (fBm) and Domain Warping.
 *
 * Based on Stefan Gustavson's simplex noise implementation.
 * Provides industry-standard procedural terrain generation primitives.
 */

// Gradient vectors for 2D simplex noise
const GRAD2: [number, number][] = [
  [1, 1], [-1, 1], [1, -1], [-1, -1],
  [1, 0], [-1, 0], [0, 1], [0, -1],
];

export class SimplexNoise2D {
  private perm: Uint8Array;

  constructor(seed: number = 0) {
    // Build a seeded permutation table
    this.perm = new Uint8Array(512);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;

    // Fisher-Yates shuffle with seeded PRNG (Mulberry32)
    let s = seed | 0;
    const rng = () => {
      s = s + 0x6D2B79F5 | 0;
      let t = Math.imul(s ^ s >>> 15, 1 | s);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };

    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [p[i], p[j]] = [p[j], p[i]];
    }

    for (let i = 0; i < 512; i++) {
      this.perm[i] = p[i & 255];
    }
  }

  /** Raw 2D simplex noise, returns value in [-1, 1] */
  noise2D(x: number, y: number): number {
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

    let i1: number, j1: number;
    if (x0 > y0) { i1 = 1; j1 = 0; }
    else { i1 = 0; j1 = 1; }

    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1.0 + 2.0 * G2;
    const y2 = y0 - 1.0 + 2.0 * G2;

    const ii = i & 255;
    const jj = j & 255;

    let n0 = 0, n1 = 0, n2 = 0;

    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 >= 0) {
      const gi = this.perm[ii + this.perm[jj]] % 8;
      t0 *= t0;
      n0 = t0 * t0 * (GRAD2[gi][0] * x0 + GRAD2[gi][1] * y0);
    }

    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 >= 0) {
      const gi = this.perm[ii + i1 + this.perm[jj + j1]] % 8;
      t1 *= t1;
      n1 = t1 * t1 * (GRAD2[gi][0] * x1 + GRAD2[gi][1] * y1);
    }

    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 >= 0) {
      const gi = this.perm[ii + 1 + this.perm[jj + 1]] % 8;
      t2 *= t2;
      n2 = t2 * t2 * (GRAD2[gi][0] * x2 + GRAD2[gi][1] * y2);
    }

    // Scale to [-1, 1]
    return 70.0 * (n0 + n1 + n2);
  }

  /** Fractal Brownian Motion — stacks multiple octaves of noise for natural terrain detail */
  fbm(x: number, y: number, octaves: number = 6, lacunarity: number = 2.0, gain: number = 0.5): number {
    let value = 0;
    let amplitude = 1.0;
    let frequency = 1.0;
    let maxAmp = 0;

    for (let i = 0; i < octaves; i++) {
      value += amplitude * this.noise2D(x * frequency, y * frequency);
      maxAmp += amplitude;
      amplitude *= gain;
      frequency *= lacunarity;
    }

    return value / maxAmp; // Normalize to [-1, 1]
  }

  /** Domain-warped fBm — feeds noise into itself for more organic, swirling terrain features */
  warpedFbm(x: number, y: number, octaves: number = 6, warpStrength: number = 0.4): number {
    const qx = this.fbm(x, y, octaves);
    const qy = this.fbm(x + 5.2, y + 1.3, octaves);
    return this.fbm(x + warpStrength * qx, y + warpStrength * qy, octaves);
  }

  /** Ridged multi-fractal noise — creates sharp mountain ridges */
  ridged(x: number, y: number, octaves: number = 6, lacunarity: number = 2.0, gain: number = 0.5): number {
    let value = 0;
    let amplitude = 1.0;
    let frequency = 1.0;
    let maxAmp = 0;

    for (let i = 0; i < octaves; i++) {
      const n = 1.0 - Math.abs(this.noise2D(x * frequency, y * frequency));
      value += amplitude * n * n;
      maxAmp += amplitude;
      amplitude *= gain;
      frequency *= lacunarity;
    }

    return value / maxAmp;
  }
}

/** Hash a string to a numeric seed for per-entity unique terrain */
export function hashSeed(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + ch;
    hash |= 0;
  }
  return hash;
}

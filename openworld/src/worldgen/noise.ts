import { createNoise2D, type NoiseFunction2D } from 'simplex-noise';
import { mulberry32 } from '../core/random.ts';

export interface FbmParams {
  scale: number;
  octaves: number;
  persistence: number;
  lacunarity: number;
}

export function makeNoise(seed: number): NoiseFunction2D {
  return createNoise2D(mulberry32(seed));
}

/** fBm。戻り値はおおよそ -1..1 */
export function fbm(noise: NoiseFunction2D, x: number, z: number, p: FbmParams): number {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let freq = 1 / p.scale;
  for (let i = 0; i < p.octaves; i++) {
    sum += noise(x * freq, z * freq) * amp;
    norm += amp;
    amp *= p.persistence;
    freq *= p.lacunarity;
  }
  return sum / norm;
}

/** 尾根状のノイズ。戻り値 0..1（1 が尾根） */
export function ridged(noise: NoiseFunction2D, x: number, z: number, scale: number, octaves = 4): number {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let freq = 1 / scale;
  for (let i = 0; i < octaves; i++) {
    const n = 1 - Math.abs(noise(x * freq, z * freq));
    sum += n * n * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

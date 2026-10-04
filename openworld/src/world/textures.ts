/**
 * 地形テクスチャの手続き生成（外部アセットなし）。
 * すべて継ぎ目なく繰り返せる（タイル可能な）ノイズから作る。
 * RGB = 色 (sRGB)、A = 凹凸の高さ（地表どうしの境界の混ぜ方とバンプに使う）。
 */
import { SURFACES, type Surface } from '../worldgen/surface.ts';

export const TEX_SIZE = 256;

// ---------------------------------------------------------------------------
// タイル可能なノイズ
// ---------------------------------------------------------------------------

function hash2(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

/** 周期 period（格子数。periodY で縦だけ変えられる）で繰り返す値ノイズ。u, v は 0..1。戻り値 0..1 */
function valueNoise(u: number, v: number, period: number, seed: number, periodY = period): number {
  const x = u * period;
  const y = v * periodY;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = fade(x - x0);
  const ty = fade(y - y0);
  const w = (i: number) => ((i % period) + period) % period;
  const wy = (i: number) => ((i % periodY) + periodY) % periodY;
  const a = hash2(w(x0), wy(y0), seed);
  const b = hash2(w(x0 + 1), wy(y0), seed);
  const c = hash2(w(x0), wy(y0 + 1), seed);
  const d = hash2(w(x0 + 1), wy(y0 + 1), seed);
  return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
}

function fbm(u: number, v: number, period: number, octaves: number, seed: number, gain = 0.5): number {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise(u, v, period << i, seed + i * 31) * amp;
    norm += amp;
    amp *= gain;
  }
  return sum / norm;
}

/** 周期的なセルノイズ（小石など）。最も近い点までの距離 d、2 番目に近い点までの距離 d2 (セル単位) と、最寄り点の乱数 */
function worley(u: number, v: number, period: number, seed: number): { d: number; d2: number; id: number } {
  const x = u * period;
  const y = v * period;
  const cx = Math.floor(x);
  const cy = Math.floor(y);
  let best = 9;
  let second = 9;
  let id = 0;
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const gx = cx + i;
      const gy = cy + j;
      const wx = ((gx % period) + period) % period;
      const wy = ((gy % period) + period) % period;
      const px = gx + hash2(wx, wy, seed);
      const py = gy + hash2(wx, wy, seed + 7);
      const d = Math.hypot(px - x, py - y);
      if (d < best) {
        second = best;
        best = d;
        id = hash2(wx, wy, seed + 13);
      } else if (d < second) {
        second = d;
      }
    }
  }
  return { d: best, d2: second, id };
}

const mix = (a: number[], b: number[], t: number) => a.map((v, i) => v + (b[i] - v) * t);
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

// ---------------------------------------------------------------------------
// 地表ごとのレシピ。(u, v) → [r, g, b, height] (0..1)
// ---------------------------------------------------------------------------

type Recipe = (u: number, v: number) => [number, number, number, number];

const c = (r: number, g: number, b: number) => [r / 255, g / 255, b / 255];

const RECIPES: Record<Surface, Recipe> = {
  grass(u, v) {
    const patch = fbm(u, v, 4, 4, 11);
    const fine = fbm(u, v, 48, 2, 12);
    const blade = valueNoise(u * 3, v, 96, 13) * 0.6 + valueNoise(u, v * 3, 96, 14) * 0.4;
    let col = mix(c(78, 108, 48), c(112, 126, 64), clamp01(patch * 1.6 - 0.35));
    col = mix(col, c(58, 86, 40), clamp01(blade * 1.4 - 0.55));
    const k = 0.78 + fine * 0.4;
    return [col[0] * k, col[1] * k, col[2] * k, blade * 0.7 + patch * 0.3];
  },
  forest(u, v) {
    const patch = fbm(u, v, 4, 4, 21);
    const leaves = worley(u, v, 28, 22);
    const fine = fbm(u, v, 64, 2, 23);
    let col = mix(c(72, 92, 48), c(104, 88, 58), clamp01(patch * 1.5 - 0.3));
    if (leaves.d < 0.38) col = mix(col, leaves.id > 0.5 ? c(128, 100, 60) : c(88, 108, 52), 0.55);
    const k = 0.8 + fine * 0.35;
    return [col[0] * k, col[1] * k, col[2] * k, clamp01(0.4 + (0.38 - leaves.d) + fine * 0.3)];
  },
  dirt(u, v) {
    const base = fbm(u, v, 6, 5, 31);
    const peb = worley(u, v, 14, 32);
    const size = 0.1 + peb.id * 0.22;
    let col = mix(c(106, 82, 58), c(140, 112, 80), base);
    let h = base * 0.6;
    if (peb.id > 0.45 && peb.d < size) {
      col = mix(col, mix(c(120, 110, 100), c(170, 160, 146), peb.id), 0.7);
      h = 0.7 + (size - peb.d) * 1.3;
    }
    return [col[0], col[1], col[2], h];
  },
  road(u, v) {
    const base = fbm(u, v, 5, 5, 41);
    const gravel = worley(u, v, 40, 42);
    const fine = fbm(u, v, 96, 2, 43);
    let col = mix(c(150, 128, 94), c(176, 156, 118), base);
    let h = base * 0.4 + fine * 0.2;
    if (gravel.d < 0.3) {
      col = mix(col, gravel.id > 0.5 ? c(190, 182, 168) : c(120, 108, 92), 0.5);
      h = 0.6 + (0.3 - gravel.d);
    }
    const k = 0.9 + fine * 0.2;
    return [col[0] * k, col[1] * k, col[2] * k, h];
  },
  sand(u, v) {
    const warp = fbm(u, v, 4, 3, 51);
    const ripple = 0.5 + 0.5 * Math.sin((v * 14 + warp * 2.5) * Math.PI * 2);
    const grain = hash2(Math.floor(u * TEX_SIZE), Math.floor(v * TEX_SIZE), 52);
    const col = mix(c(200, 182, 136), c(226, 210, 166), ripple * 0.6 + warp * 0.4);
    const k = 0.93 + grain * 0.12;
    return [col[0] * k, col[1] * k, col[2] * k, ripple * 0.8 + grain * 0.2];
  },
  rock(u, v) {
    const n = fbm(u, v, 4, 6, 61, 0.55);
    const coarse = fbm(u, v, 2, 3, 64);
    // 歪ませた座標で層状の縞と、まばらで細い割れ目を作る
    const wu = u + (fbm(u, v, 3, 3, 65) - 0.5) * 0.25;
    const wv = v + (fbm(u, v, 3, 3, 66) - 0.5) * 0.25;
    const strata = 0.5 + 0.5 * Math.sin((wv * 7 + n * 1.5) * Math.PI * 2);
    const cell = worley(wu, wv, 3, 62);
    const crack = clamp01((0.035 - (cell.d2 - cell.d)) * 30) * clamp01(fbm(u, v, 6, 2, 67) * 2.5 - 0.6);
    let col = mix(c(104, 100, 94), c(146, 140, 130), n * 0.55 + coarse * 0.3 + strata * 0.15);
    col = mix(col, c(88, 84, 80), crack * 0.4);
    const lichen = clamp01(fbm(u, v, 8, 3, 63) * 2.2 - 1.25);
    col = mix(col, c(112, 122, 82), lichen * 0.5);
    return [col[0], col[1], col[2], clamp01(n * 0.7 + strata * 0.2 + coarse * 0.1 - crack * 0.25)];
  },
  snow(u, v) {
    const n = fbm(u, v, 4, 5, 71);
    const sparkle = hash2(Math.floor(u * TEX_SIZE), Math.floor(v * TEX_SIZE), 72) > 0.985 ? 0.06 : 0;
    const col = mix(c(214, 224, 238), c(246, 249, 252), n);
    return [col[0] + sparkle, col[1] + sparkle, col[2] + sparkle, n];
  },
  riverbed(u, v) {
    const base = fbm(u, v, 6, 4, 81);
    const peb = worley(u, v, 18, 82);
    let col = mix(c(92, 86, 70), c(118, 110, 90), base);
    let h = base * 0.3;
    if (peb.d < 0.42) {
      col = mix(c(110, 106, 100), c(160, 150, 136), peb.id);
      h = 0.5 + (0.42 - peb.d) * 1.2;
    }
    return [col[0], col[1], col[2], h];
  },
};

// ---------------------------------------------------------------------------
// 配置物用の模様。色は持たず明るさだけ（0.5 = 元の色のまま。シェーダーで 2 倍して掛ける）
// ---------------------------------------------------------------------------

export const PROP_PATTERNS = ['wood', 'plaster', 'rooftile', 'bark', 'leaves', 'stonework'] as const;
export type PropPattern = (typeof PROP_PATTERNS)[number];

const gray = (l: number, h = l): [number, number, number, number] => [l, l, l, h];

const PATTERNS: Record<PropPattern, (u: number, v: number) => [number, number, number, number]> = {
  wood(u, v) {
    // 横板 8 枚。板ごとに明るさと木目の位相を変える
    const row = Math.floor(v * 8);
    const inRow = v * 8 - row;
    const grain = valueNoise(u + row * 0.37, inRow, 16, 111 + row, 2);
    const streak = 0.5 + 0.5 * Math.sin((u * 3 + grain * 1.5 + row) * Math.PI * 2 * 4);
    const seam = inRow < 0.06 || inRow > 0.96 ? 0.55 : 1;
    const tone = 0.42 + hash2(row, 0, 112) * 0.14;
    return gray((tone + streak * 0.06 + grain * 0.08) * seam);
  },
  plaster(u, v) {
    const n = fbm(u, v, 6, 5, 121);
    const stain = clamp01(fbm(u, v, 3, 3, 122) * 2 - 1.1);
    return gray(0.47 + n * 0.08 - stain * 0.08);
  },
  rooftile(u, v) {
    // 段ごとに半枚ずらした瓦。下端が丸く暗い
    const rows = 10;
    const row = Math.floor(v * rows);
    const x = u * 8 + (row % 2) * 0.5;
    const fx = x - Math.floor(x);
    const fy = v * rows - row;
    const arch = Math.sqrt(Math.max(0, 1 - (2 * fx - 1) ** 2));
    const edge = fy > 0.72 + 0.2 * arch ? 0.6 : 1;
    const tone = 0.44 + hash2(Math.floor(x) % 8, row, 131) * 0.12;
    return gray((tone + fy * 0.06) * edge);
  },
  bark(u, v) {
    // 縦に引き伸ばした（縦の格子数を少なくした）ノイズで縦筋にする
    const n = valueNoise(u, v, 48, 141, 12) * 0.6 + valueNoise(u, v, 96, 142, 48) * 0.4;
    const crack = clamp01((0.35 - n) * 4);
    return gray(0.5 + n * 0.12 - crack * 0.25);
  },
  leaves(u, v) {
    const cell = worley(u, v, 24, 151);
    const n = fbm(u, v, 8, 3, 152);
    return gray(0.36 + cell.id * 0.18 + n * 0.1 - clamp01(cell.d - 0.35) * 0.3);
  },
  stonework(u, v) {
    // 段ごとにずらした切石積み
    const rows = 6;
    const row = Math.floor(v * rows);
    const x = u * 4 + (row % 2) * 0.5 + hash2(row, 1, 161) * 0.2;
    const col = Math.floor(x) % 4;
    const fx = x - Math.floor(x);
    const fy = v * rows - row;
    const mortar = fx < 0.04 || fx > 0.96 || fy < 0.06 || fy > 0.94 ? 0.62 : 1;
    const n = fbm(u, v, 8, 4, 162);
    const tone = 0.4 + hash2(col, row, 163) * 0.16;
    return gray((tone + n * 0.12) * mortar);
  },
};

/** 地表 (SURFACES) と配置物の模様 (PROP_PATTERNS) を 1 つのテクスチャ配列にする */
export const LAYER_COUNT = SURFACES.length + PROP_PATTERNS.length;
export const patternLayer = (p: PropPattern) => SURFACES.length + PROP_PATTERNS.indexOf(p);

export function generateSurfaceTextures(size = TEX_SIZE): Uint8Array {
  const data = new Uint8Array(size * size * 4 * LAYER_COUNT);
  const recipes = [...SURFACES.map((s) => RECIPES[s]), ...PROP_PATTERNS.map((p) => PATTERNS[p])];
  recipes.forEach((recipe, layer) => {
    let k = layer * size * size * 4;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const [r, g, b, h] = recipe((x + 0.5) / size, (y + 0.5) / size);
        data[k++] = Math.round(clamp01(r) * 255);
        data[k++] = Math.round(clamp01(g) * 255);
        data[k++] = Math.round(clamp01(b) * 255);
        data[k++] = Math.round(clamp01(h) * 255);
      }
    }
  });
  return data;
}

/** 大きなスケールの色ムラ用（R: 明るさ、G: 色味、B: 別周期） */
export function generateMacroTexture(size = TEX_SIZE): Uint8Array {
  const data = new Uint8Array(size * size * 4);
  let k = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size;
      const v = (y + 0.5) / size;
      data[k++] = Math.round(fbm(u, v, 4, 5, 91) * 255);
      data[k++] = Math.round(fbm(u, v, 3, 4, 92) * 255);
      data[k++] = Math.round(fbm(u, v, 8, 4, 93) * 255);
      data[k++] = 255;
    }
  }
  return data;
}

/** 水面用の法線マップ（タイル可能な波） */
export function generateWaterNormals(size = TEX_SIZE): Uint8Array {
  const hgt = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) hgt[y * size + x] = fbm((x + 0.5) / size, (y + 0.5) / size, 6, 4, 101, 0.45);
  }
  const data = new Uint8Array(size * size * 4);
  const at = (x: number, y: number) => hgt[((y + size) % size) * size + ((x + size) % size)];
  const strength = 6;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const l = Math.hypot(dx, dy, 1);
      const k = (y * size + x) * 4;
      data[k] = Math.round((-dx / l * 0.5 + 0.5) * 255);
      data[k + 1] = Math.round((-dy / l * 0.5 + 0.5) * 255);
      data[k + 2] = Math.round((1 / l * 0.5 + 0.5) * 255);
      data[k + 3] = 255;
    }
  }
  return data;
}

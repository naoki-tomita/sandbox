/**
 * npm run world:preview — ワールドの俯瞰画像を preview/ に出力する。
 *
 *   npm run world:preview                         マップ全体 → preview/world.png
 *   npm run world:preview -- --region start_village   リージョンの範囲を拡大 → preview/start_village.png
 *   npm run world:preview -- --area 800,800,1200,1200 任意の範囲 → preview/area.png
 *   オプション: --width 1400（出力幅 px） --out path.png
 *
 * 画像の向き: 左上が (minX, minZ)。右へ +x、下へ +z。目盛りの数字はワールド座標 (m)。
 * 陰影 = 北西からの光、細い等高線 = 10m ごと、太い等高線 = 50m ごと。
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { PNG } from 'pngjs';
import type { Bounds } from '../src/worldgen/area.ts';
import { CATALOG } from '../src/worldgen/catalog.ts';
import { composeWorld, regionBounds } from '../src/worldgen/compose.ts';
import { WorldDataError } from '../src/worldgen/schema.ts';
import { SURFACE_COLORS } from '../src/worldgen/surface.ts';
import { loadWorldFiles, WORLD_DIR } from './loadWorld.ts';

type RGB = [number, number, number];

// 3x5 ビットマップフォント（座標ラベル用）
const FONT: Record<string, string> = {
  '0': '111101101101111', '1': '010110010010111', '2': '111001111100111', '3': '111001111001111',
  '4': '101101111001001', '5': '111100111001111', '6': '111100111101111', '7': '111001010010010',
  '8': '111101111101111', '9': '111101111001111', '-': '000000111000000', 'x': '000101010101000',
  'z': '000111010100111',
};

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function main(): void {
  const { world, regions } = loadWorldFiles();
  const w = composeWorld(world, regions);

  let bounds: Bounds = { minX: 0, minZ: 0, maxX: world.size, maxZ: world.size };
  let name = 'world';
  const regionName = arg('region');
  const areaArg = arg('area');
  if (regionName) {
    const r = regions.find((r) => r.name === regionName);
    if (!r) throw new Error(`region "${regionName}" がありません（${regions.map((r) => r.name).join(', ')}）`);
    const b = regionBounds(r);
    if (!b) throw new Error(`region "${regionName}" は空です`);
    const pad = 30;
    bounds = { minX: b.minX - pad, minZ: b.minZ - pad, maxX: b.maxX + pad, maxZ: b.maxZ + pad };
    name = regionName;
  } else if (areaArg) {
    const [x0, z0, x1, z1] = areaArg.split(',').map(Number);
    bounds = { minX: Math.min(x0, x1), minZ: Math.min(z0, z1), maxX: Math.max(x0, x1), maxZ: Math.max(z0, z1) };
    name = 'area';
  }

  const spanX = bounds.maxX - bounds.minX;
  const spanZ = bounds.maxZ - bounds.minZ;
  const mapW = Number(arg('width') ?? (regionName || areaArg ? 1000 : 1024));
  const mpp = spanX / mapW; // meters per pixel
  const mapH = Math.round(spanZ / mpp);
  const M = 22; // 目盛り用の余白
  const png = new PNG({ width: mapW + M, height: mapH + M });

  const set = (px: number, py: number, c: RGB, a = 1) => {
    if (px < 0 || py < 0 || px >= png.width || py >= png.height) return;
    const i = (py * png.width + px) * 4;
    png.data[i] = png.data[i] * (1 - a) + c[0] * a;
    png.data[i + 1] = png.data[i + 1] * (1 - a) + c[1] * a;
    png.data[i + 2] = png.data[i + 2] * (1 - a) + c[2] * a;
    png.data[i + 3] = 255;
  };
  const text = (s: string, px: number, py: number, c: RGB) => {
    [...s].forEach((ch, k) => {
      const g = FONT[ch];
      if (!g) return;
      for (let j = 0; j < 15; j++) if (g[j] === '1') set(px + k * 4 + (j % 3), py + Math.floor(j / 3), c);
    });
  };

  // 背景（余白）
  for (let py = 0; py < png.height; py++) for (let px = 0; px < png.width; px++) set(px, py, [250, 250, 250]);

  const toWorld = (px: number, py: number): [number, number] => [bounds.minX + (px + 0.5) * mpp, bounds.minZ + (py + 0.5) * mpp];
  const heights = new Float32Array(mapW * mapH);
  for (let py = 0; py < mapH; py++) {
    for (let px = 0; px < mapW; px++) {
      const [x, z] = toWorld(px, py);
      heights[py * mapW + px] = w.heights.sample(x, z);
    }
  }
  const light = [-0.5, 0.7, -0.5];
  const ll = Math.hypot(...light);
  const e = Math.max(mpp, world.cellSize);
  for (let py = 0; py < mapH; py++) {
    for (let px = 0; px < mapW; px++) {
      const [x, z] = toWorld(px, py);
      const h = heights[py * mapW + px];
      const inMap = x >= 0 && z >= 0 && x <= world.size && z <= world.size;
      let c: RGB = [...SURFACE_COLORS[w.surfaceAt(x, z)]] as RGB;
      // 陰影
      const gx = (w.heights.sample(x + e, z) - w.heights.sample(x - e, z)) / (2 * e);
      const gz = (w.heights.sample(x, z + e) - w.heights.sample(x, z - e)) / (2 * e);
      const nl = Math.hypot(gx, 1, gz);
      const shade = Math.max(0.25, (-gx * light[0] + light[1] - gz * light[2]) / (nl * ll));
      c = c.map((v) => Math.min(255, v * (0.35 + 0.9 * shade))) as RGB;
      // 等高線
      const hr = px + 1 < mapW ? heights[py * mapW + px + 1] : h;
      const hd = py + 1 < mapH ? heights[(py + 1) * mapW + px] : h;
      const crosses = (step: number) => Math.floor(h / step) !== Math.floor(hr / step) || Math.floor(h / step) !== Math.floor(hd / step);
      if (crosses(50)) c = c.map((v) => v * 0.55) as RGB;
      else if (crosses(10)) c = c.map((v) => v * 0.82) as RGB;
      // 水
      const level = w.waterLevelAt(x, z);
      if (level > h) {
        const depth = Math.min(1, (level - h) / 12);
        const water: RGB = [60 - depth * 30, 130 - depth * 50, 190 - depth * 40];
        c = c.map((v, k) => v * 0.15 + water[k] * 0.85) as RGB;
      }
      if (!inMap) c = c.map((v) => v * 0.5) as RGB;
      set(px + M, py + M, c);
    }
  }

  // グリッドと目盛り
  const step = [32, 64, 128, 256, 512].find((s) => s / mpp >= 90) ?? 512;
  for (let gx = Math.ceil(bounds.minX / step) * step; gx <= bounds.maxX; gx += step) {
    const px = Math.round((gx - bounds.minX) / mpp);
    for (let py = 0; py < mapH; py++) set(px + M, py + M, [255, 255, 255], 0.35);
    text(String(gx), px + M - 6, 3, [40, 40, 40]);
  }
  for (let gz = Math.ceil(bounds.minZ / step) * step; gz <= bounds.maxZ; gz += step) {
    const py = Math.round((gz - bounds.minZ) / mpp);
    for (let px = 0; px < mapW; px++) set(px + M, py + M, [255, 255, 255], 0.35);
    text(String(gz), 1, py + M + 7, [40, 40, 40]);
  }
  text('x', M + mapW - 12, 12, [200, 0, 0]);
  text('z', 3, M + mapH - 8, [200, 0, 0]);

  // オブジェクト
  const toPx = (x: number, z: number): [number, number] => [
    Math.round((x - bounds.minX) / mpp) + M,
    Math.round((z - bounds.minZ) / mpp) + M,
  ];
  const disc = (cx: number, cy: number, r: number, c: RGB, a = 1) => {
    const rr = Math.max(0.5, r);
    for (let dy = -Math.ceil(rr); dy <= Math.ceil(rr); dy++) {
      for (let dx = -Math.ceil(rr); dx <= Math.ceil(rr); dx++) if (dx * dx + dy * dy <= rr * rr) set(cx + dx, cy + dy, c, a);
    }
  };
  /** 中心 (cx, cy)、幅 w（ローカル X）・奥行き d（ローカル Z）、向き rot の長方形 */
  const rect = (cx: number, cy: number, w: number, d: number, rot: number, c: RGB) => {
    const r = Math.ceil(Math.hypot(w, d) / 2);
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        // ワールドの (dx, dz) をローカルへ（rotation は +Z を +X 側へ回す向き）
        const lx = dx * cos - dy * sin;
        const lz = dx * sin + dy * cos;
        if (Math.abs(lx) <= w / 2 && Math.abs(lz) <= d / 2) set(cx + dx, cy + dy, c);
      }
    }
  };
  for (const o of w.objects) {
    if (o.x < bounds.minX || o.z < bounds.minZ || o.x > bounds.maxX || o.z > bounds.maxZ) continue;
    const [px, py] = toPx(o.x, o.z);
    const info = CATALOG[o.type];
    if (o.scattered) {
      disc(px, py, Math.max(0.8, (info.footprint * o.scale * 0.6) / mpp), info.previewColor, 0.8);
    } else if (info.collider.kind === 'box' && (info.collider.size[0] * o.scale) / mpp >= 3) {
      // 箱型のもの（家・橋・桟橋など）は向き付きの長方形で描く
      const [w, , d] = info.collider.size.map((v) => (v * o.scale) / mpp);
      rect(px, py, w + 2, d + 2, o.rotation, [0, 0, 0]);
      rect(px, py, w, d, o.rotation, info.previewColor);
    } else {
      const r = Math.max(2.5, (info.footprint * o.scale) / mpp);
      disc(px, py, r + 1, [0, 0, 0]);
      disc(px, py, r, info.previewColor);
    }
  }
  // スポーン（白い十字）
  const [sx, sy] = toPx(world.spawn.at[0], world.spawn.at[1]);
  for (let k = -7; k <= 7; k++) {
    for (const o of [-1, 0, 1]) {
      set(sx + k, sy + o, [0, 0, 0]);
      set(sx + o, sy + k, [0, 0, 0]);
    }
  }
  for (let k = -6; k <= 6; k++) {
    set(sx + k, sy, [255, 255, 255]);
    set(sx, sy + k, [255, 255, 255]);
  }

  const out = arg('out') ?? join(WORLD_DIR, '..', 'preview', `${name}.png`);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, PNG.sync.write(png));
  console.log(`${out} (${png.width}x${png.height}, 1px = ${mpp.toFixed(2)}m, 範囲 x ${bounds.minX.toFixed(0)}..${bounds.maxX.toFixed(0)} z ${bounds.minZ.toFixed(0)}..${bounds.maxZ.toFixed(0)})`);
}

try {
  main();
} catch (e) {
  if (e instanceof WorldDataError) {
    console.error(e.message);
    process.exit(1);
  }
  throw e;
}

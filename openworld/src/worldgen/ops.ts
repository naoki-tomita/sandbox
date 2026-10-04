/**
 * 地形編集オペレーション。すべてグリッドをその場で書き換える純粋な処理（three/Rapier 非依存）。
 */
import { areaBounds, areaWeight, forEachNearPolyline, smoothstep } from './area.ts';
import type { HeightGrid } from './grid.ts';
import { fbm, makeNoise, ridged } from './noise.ts';
import type { Area, TerrainOp, Vec2 } from './schema.ts';

export interface OpContext {
  /** オペごとに独立したノイズを作るためのシード */
  seed: number;
}

type Visit = (i: number, x: number, z: number) => void;

function forEachIn(grid: HeightGrid, b: { minX: number; minZ: number; maxX: number; maxZ: number }, fn: Visit): void {
  const [x0, z0, x1, z1] = grid.indexRange(b.minX, b.minZ, b.maxX, b.maxZ);
  const cs = grid.cellSize;
  for (let iz = z0; iz <= z1; iz++) {
    for (let ix = x0; ix <= x1; ix++) fn(grid.index(ix, iz), ix * cs, iz * cs);
  }
}

function forEachWeighted(grid: HeightGrid, area: Area, falloff: number, fn: (i: number, w: number, x: number, z: number) => void): void {
  forEachIn(grid, areaBounds(area, falloff), (i, x, z) => {
    const w = areaWeight(area, x, z, falloff);
    if (w > 0) fn(i, w, x, z);
  });
}

/** 領域内（重み 1 の部分）の平均高さ */
function averageHeight(grid: HeightGrid, area: Area): number {
  let sum = 0;
  let count = 0;
  forEachWeighted(grid, area, 0, (i) => {
    sum += grid.data[i];
    count++;
  });
  return count ? sum / count : 0;
}

/** 経路の各頂点の目標高さ。指定がなければ現在の地形から取り、なだらかにする */
function pathHeights(grid: HeightGrid, points: Vec2[], explicit: number[] | null): number[] {
  if (explicit) return explicit;
  let hs = points.map(([x, z]) => grid.sample(x, z));
  for (let k = 0; k < 3; k++) {
    hs = hs.map((h, i) => (i === 0 || i === hs.length - 1 ? h : (hs[i - 1] + h * 2 + hs[i + 1]) / 4));
  }
  return hs;
}

type RiverOp = Extract<TerrainOp, { op: 'river' }>;

/** 川の水面の高さ（地形から自動: 点の高さを均して下流へ単調に下げ、地面より 1m 下げる） */
export function riverLevels(grid: HeightGrid, op: RiverOp): number[] {
  if (op.levels) return op.levels;
  const hs = pathHeights(grid, op.points, null);
  for (let i = 1; i < hs.length; i++) hs[i] = Math.min(hs[i], hs[i - 1]);
  return hs.map((h) => h - 1);
}

/**
 * 川: 水路を掘り、水際（幅の端）を水面より少し高くする。岸が水面より低ければ土手を盛る。
 * 水面の高さ（各点）を返す。水面メッシュと地形が必ず整合する。
 */
export function applyRiver(grid: HeightGrid, op: RiverOp): number[] {
  const levels = riverLevels(grid, op);
  const d = grid.data;
  const half = op.width / 2;
  const bank = 0.4;
  forEachNearPolyline(grid.cellSize, grid.n - 1, op.points, half + op.falloff, (ix, iz, dist, seg, t) => {
    const i = grid.index(ix, iz);
    const level = levels[seg] + (levels[seg + 1] - levels[seg]) * t;
    if (dist <= half) {
      const k = dist / half;
      d[i] = level + bank - (op.depth + bank) * (1 - k * k);
      return;
    }
    const w = 1 - smoothstep(0, op.falloff, dist - half);
    if (d[i] < level + bank) {
      // 岸が水面より低ければ土手を盛る
      d[i] += (level + bank - d[i]) * w;
    } else {
      // 岸が高ければ最大 35° 程度の斜面に削る（垂直な峡谷にしない）
      const cap = level + bank + (dist - half) * 0.7;
      if (d[i] > cap) d[i] += (cap - d[i]) * w;
    }
  });
  return levels;
}

export function applyOp(grid: HeightGrid, op: TerrainOp, ctx: OpContext): void {
  const d = grid.data;
  switch (op.op) {
    case 'river':
      applyRiver(grid, op);
      return;
    case 'raise':
    case 'lower': {
      const amount = op.op === 'raise' ? op.amount : -op.amount;
      forEachWeighted(grid, op.area, op.falloff, (i, w) => (d[i] += amount * w));
      return;
    }
    case 'hill': {
      const area: Area = { kind: 'circle', at: op.at, radius: op.radius };
      forEachIn(grid, areaBounds(area), (i, x, z) => {
        const t = Math.hypot(x - op.at[0], z - op.at[1]) / op.radius;
        if (t < 1) d[i] += op.height * 0.5 * (1 + Math.cos(Math.PI * t));
      });
      return;
    }
    case 'mountain': {
      const noise = makeNoise(ctx.seed);
      const area: Area = { kind: 'circle', at: op.at, radius: op.radius };
      const ridgeScale = op.radius / 2.2;
      forEachIn(grid, areaBounds(area), (i, x, z) => {
        const t = Math.hypot(x - op.at[0], z - op.at[1]) / op.radius;
        if (t >= 1) return;
        const shape = Math.pow(1 - smoothstep(0, 1, t), op.sharpness);
        const detail = ridged(noise, x, z, ridgeScale);
        d[i] += op.height * shape * (1 - op.roughness + op.roughness * detail * 1.3);
      });
      return;
    }
    case 'flatten': {
      const target = op.height ?? averageHeight(grid, op.area);
      forEachWeighted(grid, op.area, op.falloff, (i, w) => (d[i] += (target - d[i]) * w * op.strength));
      return;
    }
    case 'plateau': {
      forEachWeighted(grid, op.area, op.falloff, (i, w) => {
        const h = d[i] + (op.height - d[i]) * w;
        d[i] = Math.max(d[i], h);
      });
      return;
    }
    case 'path': {
      const hs = pathHeights(grid, op.points, op.heights);
      const half = op.width / 2;
      forEachNearPolyline(grid.cellSize, grid.n - 1, op.points, half + op.falloff, (ix, iz, dist, seg, t) => {
        const i = grid.index(ix, iz);
        const over = dist - half;
        if (over > 0 && over >= op.falloff) return;
        const w = over <= 0 ? 1 : 1 - smoothstep(0, op.falloff, over);
        const target = hs[seg] + (hs[seg + 1] - hs[seg]) * t - op.depth;
        const h = d[i] + (target - d[i]) * w;
        d[i] = op.mode === 'carve' ? Math.min(d[i], h) : h;
      });
      return;
    }
    case 'smooth': {
      const b = areaBounds(op.area, op.falloff);
      const [x0, z0, x1, z1] = grid.indexRange(b.minX, b.minZ, b.maxX, b.maxZ);
      const w = x1 - x0 + 1;
      const weights = new Float32Array(w * (z1 - z0 + 1));
      const cs = grid.cellSize;
      for (let iz = z0; iz <= z1; iz++) {
        for (let ix = x0; ix <= x1; ix++) weights[(iz - z0) * w + (ix - x0)] = areaWeight(op.area, ix * cs, iz * cs, op.falloff);
      }
      const tmp = new Float32Array(weights.length);
      for (let it = 0; it < op.iterations; it++) {
        for (let iz = z0; iz <= z1; iz++) {
          for (let ix = x0; ix <= x1; ix++) {
            let s = 0;
            for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) s += grid.get(ix + dx, iz + dz);
            tmp[(iz - z0) * w + (ix - x0)] = s / 9;
          }
        }
        for (let iz = z0; iz <= z1; iz++) {
          for (let ix = x0; ix <= x1; ix++) {
            const k = (iz - z0) * w + (ix - x0);
            const i = grid.index(ix, iz);
            d[i] += (tmp[k] - d[i]) * weights[k];
          }
        }
      }
      return;
    }
    case 'noise': {
      const noise = makeNoise(ctx.seed);
      const p = { scale: op.scale, octaves: 4, persistence: 0.5, lacunarity: 2 };
      forEachWeighted(grid, op.area, op.falloff, (i, w, x, z) => (d[i] += fbm(noise, x, z, p) * op.amplitude * w));
      return;
    }
  }
}

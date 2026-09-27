/**
 * ワールド定義（下地ノイズ + リージョンの編集）を合成して、ゲーム/プレビューが使う実データを作る。
 * 同じ入力からは常に同じ結果になる（決定的）。
 */
import { hashSeed, mulberry32 } from '../core/random.ts';
import {
  areaBounds,
  areaDistance,
  areaWeight,
  pointsBounds,
  polylineDistance,
  smoothstep,
  unionBounds,
  type Bounds,
} from './area.ts';
import { CATALOG, type ObjectType } from './catalog.ts';
import { HeightGrid } from './grid.ts';
import { fbm, makeNoise } from './noise.ts';
import { applyOp, applyRiver } from './ops.ts';
import type { Area, PaintDef, RegionDef, ScatterDef, Vec2, WaterDef, WorldDef } from './schema.ts';
import { autoSurface, SURFACE_INDEX, SURFACES, type Surface } from './surface.ts';

export interface PlacedObject {
  type: ObjectType;
  x: number;
  y: number;
  z: number;
  /** ラジアン。0 = +Z 向き */
  rotation: number;
  scale: number;
  id: string | null;
  props: Record<string, unknown>;
  region: string;
  /** scatter で自動配置されたもの */
  scattered: boolean;
}

export type WaterBody =
  | { kind: 'area'; name: string; area: Area; level: number }
  | { kind: 'river'; name: string; points: Vec2[]; width: number; levels: number[] };

export interface ComposedWorld {
  def: WorldDef;
  regions: RegionDef[];
  heights: HeightGrid;
  /** 頂点ごとの地表 (SURFACES の index) */
  surface: Uint8Array;
  waters: WaterBody[];
  objects: PlacedObject[];
  /** その地点の水面の高さ。水がなければ海面 */
  waterLevelAt(x: number, z: number): number;
  surfaceAt(x: number, z: number): Surface;
}

function fillBase(grid: HeightGrid, def: WorldDef): void {
  const noise = makeNoise(def.seed);
  const { base, border, size } = def;
  const cs = grid.cellSize;
  for (let iz = 0; iz < grid.n; iz++) {
    for (let ix = 0; ix < grid.n; ix++) {
      const x = ix * cs;
      const z = iz * cs;
      let h = base.height + fbm(noise, x, z, base) * base.amplitude;
      if (border.width > 0) {
        // 角を丸めた正方形からの距離を低周波ノイズで揺らし、自然な海岸線にする
        const half = size / 2;
        const r = border.width * 2;
        const qx = Math.max(Math.abs(x - half) - (half - r), 0);
        const qz = Math.max(Math.abs(z - half) - (half - r), 0);
        const edge = r - Math.hypot(qx, qz) + noise(x / 380 + 50, z / 380 - 50) * border.width * 0.45;
        h = border.depth + (h - border.depth) * smoothstep(0, border.width, edge);
      }
      grid.data[grid.index(ix, iz)] = h;
    }
  }
}

const EDGE_NOISE = { scale: 45, octaves: 3, persistence: 0.5, lacunarity: 2 };

function paintSurfaces(grid: HeightGrid, def: WorldDef, regions: RegionDef[]): Uint8Array {
  const surface = new Uint8Array(grid.n * grid.n);
  for (let iz = 0; iz < grid.n; iz++) {
    for (let ix = 0; ix < grid.n; ix++) {
      const i = grid.index(ix, iz);
      surface[i] = SURFACE_INDEX[autoSurface(grid.data[i], grid.slope(ix, iz), def.seaLevel)];
    }
  }
  const cs = grid.cellSize;
  // 塗り境界を揺らすノイズ（jitter）
  const edgeNoise = makeNoise(hashSeed(def.seed, 'paint'));
  const paints = regions.flatMap((r) => [
    ...r.ops.flatMap((op): PaintDef[] =>
      op.op === 'river' ? [{ surface: 'riverbed', points: op.points, width: op.width + 3, jitter: 0 }] : [],
    ),
    ...r.paint,
  ]);
  {
    for (const p of paints) {
      const s = SURFACE_INDEX[p.surface];
      const pad = p.jitter;
      const b = 'area' in p ? areaBounds(p.area, pad) : pointsBounds(p.points, p.width / 2 + pad);
      const [x0, z0, x1, z1] = grid.indexRange(b.minX, b.minZ, b.maxX, b.maxZ);
      for (let iz = z0; iz <= z1; iz++) {
        for (let ix = x0; ix <= x1; ix++) {
          const x = ix * cs;
          const z = iz * cs;
          const j = p.jitter > 0 ? fbm(edgeNoise, x, z, EDGE_NOISE) * p.jitter : 0;
          const inside =
            'area' in p ? areaDistance(p.area, x, z) + j <= 0 : polylineDistance(x, z, p.points).d + j <= p.width / 2;
          if (inside) surface[grid.index(ix, iz)] = s;
        }
      }
    }
  }
  return surface;
}

function toWaterBody(w: WaterDef): WaterBody {
  return 'area' in w
    ? { kind: 'area', name: w.name, area: w.area, level: w.level }
    : { kind: 'river', name: w.name, points: w.points, width: w.width, levels: w.levels };
}

/** 水面の高さ。含まれる水域のうち最も高いもの。どれにも含まれなければ null */
export function waterBodyLevel(body: WaterBody, x: number, z: number): number | null {
  if (body.kind === 'area') return areaDistance(body.area, x, z) <= 0 ? body.level : null;
  const r = polylineDistance(x, z, body.points);
  if (r.d > body.width / 2) return null;
  return body.levels[r.seg] + (body.levels[r.seg + 1] - body.levels[r.seg]) * r.t;
}

/** 配置済みオブジェクトの占有範囲を引く空間ハッシュ */
class FootprintIndex {
  private readonly cells = new Map<string, { x: number; z: number; r: number }[]>();
  private static readonly CELL = 16;

  add(x: number, z: number, r: number): void {
    if (r <= 0) return;
    const C = FootprintIndex.CELL;
    for (let cz = Math.floor((z - r) / C); cz <= Math.floor((z + r) / C); cz++) {
      for (let cx = Math.floor((x - r) / C); cx <= Math.floor((x + r) / C); cx++) {
        const k = `${cx},${cz}`;
        let list = this.cells.get(k);
        if (!list) this.cells.set(k, (list = []));
        list.push({ x, z, r });
      }
    }
  }

  blocked(x: number, z: number, r: number): boolean {
    const C = FootprintIndex.CELL;
    const list = this.cells.get(`${Math.floor(x / C)},${Math.floor(z / C)}`);
    return !!list?.some((f) => Math.hypot(f.x - x, f.z - z) < f.r + r);
  }
}

function scatter(
  world: Omit<ComposedWorld, 'objects'>,
  s: ScatterDef,
  region: string,
  seed: number,
  footprints: FootprintIndex,
  out: PlacedObject[],
): void {
  if (s.density <= 0) return;
  const rand = mulberry32(seed);
  const spacing = Math.sqrt(1000 / s.density);
  const b = areaBounds(s.area);
  const maxSlope = Math.tan((s.maxSlope * Math.PI) / 180);
  const r = CATALOG[s.type].footprint;
  const size = world.def.size;
  // ジッター付きグリッド: 各マスに 1 つ候補を置き、条件を満たすものだけ採用する
  for (let gz = b.minZ; gz < b.maxZ; gz += spacing) {
    for (let gx = b.minX; gx < b.maxX; gx += spacing) {
      const x = gx + rand() * spacing;
      const z = gz + rand() * spacing;
      const rot = rand() * Math.PI * 2;
      const scale = s.scale[0] + (s.scale[1] - s.scale[0]) * rand();
      const keep = rand();
      if (x < 1 || z < 1 || x > size - 1 || z > size - 1) continue;
      // 領域の縁は 15m かけてまばらにする
      if (keep > areaWeight(s.area, x, z, 0) * (1 - smoothstep(-15, 0, areaDistance(s.area, x, z)) * 0.7)) continue;
      const y = world.heights.sample(x, z);
      if (y < world.waterLevelAt(x, z) + 0.3) continue;
      if (world.heights.slopeAt(x, z) > maxSlope) continue;
      const surf = world.surfaceAt(x, z);
      if (s.avoid.includes(surf)) continue;
      if (s.onlyOn && !s.onlyOn.includes(surf)) continue;
      if (footprints.blocked(x, z, r * scale * 0.5)) continue;
      out.push({ type: s.type, x, y, z, rotation: rot, scale, id: null, props: {}, region, scattered: true });
    }
  }
}

export function composeWorld(def: WorldDef, regions: RegionDef[]): ComposedWorld {
  const heights = new HeightGrid(def.size, def.cellSize);
  fillBase(heights, def);
  const rivers: WaterBody[] = [];
  regions.forEach((region) => {
    region.ops.forEach((op, i) => {
      if (op.op === 'river') {
        const levels = applyRiver(heights, op);
        rivers.push({ kind: 'river', name: op.name, points: op.points, width: op.width, levels });
      } else {
        applyOp(heights, op, { seed: hashSeed(def.seed, region.name, 'op', i) });
      }
    });
  });
  const surface = paintSurfaces(heights, def, regions);
  const waters = [...rivers, ...regions.flatMap((r) => r.water.map(toWaterBody))];

  const partial: Omit<ComposedWorld, 'objects'> = {
    def,
    regions,
    heights,
    surface,
    waters,
    waterLevelAt(x, z) {
      let level = def.seaLevel;
      for (const w of waters) {
        const l = waterBodyLevel(w, x, z);
        if (l !== null && l > level) level = l;
      }
      return level;
    },
    surfaceAt(x, z) {
      const ix = Math.max(0, Math.min(heights.n - 1, Math.round(x / def.cellSize)));
      const iz = Math.max(0, Math.min(heights.n - 1, Math.round(z / def.cellSize)));
      return SURFACES[surface[heights.index(ix, iz)]];
    },
  };

  const objects: PlacedObject[] = [];
  const footprints = new FootprintIndex();
  for (const region of regions) {
    for (const o of region.objects) {
      const [x, z] = o.at;
      objects.push({
        type: o.type,
        x,
        y: heights.sample(x, z) + o.y,
        z,
        rotation: (o.rotation * Math.PI) / 180,
        scale: o.scale,
        id: o.id,
        props: o.props,
        region: region.name,
        scattered: false,
      });
      footprints.add(x, z, CATALOG[o.type].footprint * o.scale);
    }
  }
  regions.forEach((region) => {
    region.scatter.forEach((s, i) => {
      scatter(partial, s, region.name, hashSeed(def.seed, region.name, 'scatter', i), footprints, objects);
    });
  });

  return { ...partial, objects };
}

/** リージョンが触れている範囲（プレビューの切り出しに使う） */
export function regionBounds(region: RegionDef): Bounds | null {
  let b: Bounds | null = null;
  for (const op of region.ops) {
    if ('area' in op) b = unionBounds(b, areaBounds(op.area, op.falloff));
    else if (op.op === 'path' || op.op === 'river') b = unionBounds(b, pointsBounds(op.points, op.width / 2 + op.falloff));
    else b = unionBounds(b, areaBounds({ kind: 'circle', at: op.at, radius: op.radius }));
  }
  for (const p of region.paint) b = unionBounds(b, 'area' in p ? areaBounds(p.area) : pointsBounds(p.points, p.width / 2));
  for (const w of region.water) b = unionBounds(b, 'area' in w ? areaBounds(w.area) : pointsBounds(w.points, w.width / 2));
  for (const o of region.objects) b = unionBounds(b, pointsBounds([o.at], 10));
  for (const s of region.scatter) b = unionBounds(b, areaBounds(s.area));
  return b;
}

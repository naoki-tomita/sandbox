/**
 * ワールドデータ（world/world.json と world/regions/*.json）の型と実行時バリデーション。
 *
 * JSON は人間/AI が手で書くので、誤りは「ファイル: パス: 内容」の形で全件まとめて報告する。
 * 各項目の意味は openworld/CLAUDE.md の「ワールド編集ガイド」を参照。
 */
import { OBJECT_TYPES, type ObjectType } from './catalog.ts';
import { SURFACES, type Surface } from './surface.ts';

export type Vec2 = [number, number];

/** 領域指定。円 / 矩形 / 多角形のどれか 1 つ。 */
export type Area =
  | { kind: 'circle'; at: Vec2; radius: number }
  | { kind: 'rect'; min: Vec2; max: Vec2 }
  | { kind: 'polygon'; points: Vec2[] };

export interface BaseNoiseDef {
  /** 下地の平均高さ (m) */
  height: number;
  /** 起伏の振幅 (m) */
  amplitude: number;
  /** 最も大きな起伏の波長 (m) */
  scale: number;
  octaves: number;
  persistence: number;
  lacunarity: number;
}

export interface BorderDef {
  /** マップ外周から内側へ、この幅で海に沈める (m) */
  width: number;
  /** 外周での高さ (m)。海面より下にする */
  depth: number;
}

export interface WorldDef {
  name: string;
  size: number;
  cellSize: number;
  seed: number;
  seaLevel: number;
  base: BaseNoiseDef;
  border: BorderDef;
  spawn: { at: Vec2; facing: number };
  regions: string[];
}

export type TerrainOp =
  | { op: 'raise' | 'lower'; area: Area; amount: number; falloff: number }
  | { op: 'hill'; at: Vec2; radius: number; height: number }
  | { op: 'mountain'; at: Vec2; radius: number; height: number; sharpness: number; roughness: number }
  | { op: 'flatten'; area: Area; height: number | null; falloff: number; strength: number }
  | { op: 'plateau'; area: Area; height: number; falloff: number }
  | {
      op: 'path';
      points: Vec2[];
      width: number;
      falloff: number;
      mode: 'flatten' | 'carve';
      depth: number;
      heights: number[] | null;
    }
  | {
      op: 'river';
      name: string;
      points: Vec2[];
      width: number;
      depth: number;
      falloff: number;
      /** 各点の水面の高さ。null なら地形から自動（下流へ単調に下がる） */
      levels: number[] | null;
    }
  | { op: 'smooth'; area: Area; falloff: number; iterations: number }
  | { op: 'noise'; area: Area; falloff: number; amplitude: number; scale: number };

export type PaintDef =
  | { surface: Surface; area: Area; jitter: number }
  | { surface: Surface; points: Vec2[]; width: number; jitter: number };

export type WaterDef =
  | { name: string; area: Area; level: number }
  | { name: string; points: Vec2[]; width: number; levels: number[] };

export interface ObjectDef {
  type: ObjectType;
  at: Vec2;
  /** 地面からのオフセット (m) */
  y: number;
  /** 絶対高さ (m)。指定すると地面の高さを無視する（桟橋・橋など） */
  level: number | null;
  /** 向き (度)。0 = +Z 方向を向く、90 = +X 方向を向く */
  rotation: number;
  scale: number;
  id: string | null;
  props: Record<string, unknown>;
}

export interface ScatterDef {
  type: ObjectType;
  area: Area;
  /** 1000 m² あたりの個数 */
  density: number;
  scale: Vec2;
  maxSlope: number;
  avoid: Surface[];
  onlyOn: Surface[] | null;
  /** この領域の中には置かない（村の敷地など） */
  exclude: Area[];
}

export interface RegionDef {
  name: string;
  description: string;
  ops: TerrainOp[];
  paint: PaintDef[];
  water: WaterDef[];
  objects: ObjectDef[];
  scatter: ScatterDef[];
}

// ---------------------------------------------------------------------------
// バリデーション
// ---------------------------------------------------------------------------

export class WorldDataError extends Error {
  constructor(public readonly problems: string[]) {
    super(`ワールドデータに ${problems.length} 件のエラーがあります:\n  ${problems.join('\n  ')}`);
  }
}

type Json = Record<string, unknown>;

class Checker {
  readonly problems: string[] = [];
  constructor(private readonly file: string) {}

  fail(path: string, msg: string): void {
    this.problems.push(`${this.file}: ${path}: ${msg}`);
  }

  obj(v: unknown, path: string): Json | null {
    if (typeof v === 'object' && v !== null && !Array.isArray(v)) return v as Json;
    this.fail(path, 'オブジェクトが必要です');
    return null;
  }

  /** 未知のキーは typo の可能性が高いので報告する */
  keys(o: Json, path: string, allowed: string[]): void {
    for (const k of Object.keys(o)) {
      if (!allowed.includes(k)) this.fail(`${path}.${k}`, `不明なキーです（使えるのは ${allowed.join(', ')}）`);
    }
  }

  num(o: Json, key: string, path: string, opt: { def?: number; min?: number; max?: number } = {}): number {
    const v = o[key];
    if (v === undefined && opt.def !== undefined) return opt.def;
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      this.fail(`${path}.${key}`, v === undefined ? '必須の数値です' : `数値が必要です（${JSON.stringify(v)}）`);
      return opt.def ?? 0;
    }
    if (opt.min !== undefined && v < opt.min) this.fail(`${path}.${key}`, `${opt.min} 以上にしてください（${v}）`);
    if (opt.max !== undefined && v > opt.max) this.fail(`${path}.${key}`, `${opt.max} 以下にしてください（${v}）`);
    return v;
  }

  str(o: Json, key: string, path: string, def?: string): string {
    const v = o[key];
    if (v === undefined && def !== undefined) return def;
    if (typeof v !== 'string') {
      this.fail(`${path}.${key}`, '文字列が必要です');
      return def ?? '';
    }
    return v;
  }

  oneOf<T extends string>(o: Json, key: string, path: string, values: readonly T[], def?: T): T {
    const v = o[key];
    if (v === undefined && def !== undefined) return def;
    if (typeof v !== 'string' || !values.includes(v as T)) {
      this.fail(`${path}.${key}`, `${values.join(' / ')} のどれかにしてください（${JSON.stringify(v)}）`);
      return def ?? values[0];
    }
    return v as T;
  }

  vec2(v: unknown, path: string): Vec2 {
    if (Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === 'number' && Number.isFinite(n))) {
      return [v[0], v[1]];
    }
    this.fail(path, `[x, z] 形式の座標が必要です（${JSON.stringify(v)}）`);
    return [0, 0];
  }

  points(v: unknown, path: string, min: number): Vec2[] {
    if (!Array.isArray(v) || v.length < min) {
      this.fail(path, `${min} 点以上の [x, z] の配列が必要です`);
      return [];
    }
    return v.map((p, i) => this.vec2(p, `${path}[${i}]`));
  }

  numbers(v: unknown, path: string, len: number): number[] {
    if (!Array.isArray(v) || v.length !== len || !v.every((n) => typeof n === 'number' && Number.isFinite(n))) {
      this.fail(path, `長さ ${len} の数値配列が必要です`);
      return new Array(len).fill(0);
    }
    return v as number[];
  }

  array(o: Json, key: string, path: string): unknown[] {
    const v = o[key];
    if (v === undefined) return [];
    if (!Array.isArray(v)) {
      this.fail(`${path}.${key}`, '配列が必要です');
      return [];
    }
    return v;
  }

  surfaces(v: unknown, path: string): Surface[] {
    if (!Array.isArray(v)) {
      this.fail(path, '地表名の配列が必要です');
      return [];
    }
    return v.filter((s, i) => {
      const ok = SURFACES.includes(s as Surface);
      if (!ok) this.fail(`${path}[${i}]`, `不明な地表です（${JSON.stringify(s)}）。${SURFACES.join(', ')}`);
      return ok;
    }) as Surface[];
  }
}

const AREA_KEYS = ['at', 'radius', 'rect', 'polygon'];

/** 領域指定を読む。`{at, radius}` / `{rect: [x0, z0, x1, z1]}` / `{polygon: [[x, z], ...]}` */
function readArea(c: Checker, o: Json, path: string): Area {
  const has = AREA_KEYS.filter((k) => k in o && k !== 'radius');
  if (has.length !== 1) {
    c.fail(path, '領域は at+radius / rect / polygon のどれか 1 つで指定してください');
    return { kind: 'circle', at: [0, 0], radius: 1 };
  }
  if (has[0] === 'at') {
    return { kind: 'circle', at: c.vec2(o.at, `${path}.at`), radius: c.num(o, 'radius', path, { min: 0.1 }) };
  }
  if (has[0] === 'rect') {
    const r = c.numbers(o.rect, `${path}.rect`, 4);
    return {
      kind: 'rect',
      min: [Math.min(r[0], r[2]), Math.min(r[1], r[3])],
      max: [Math.max(r[0], r[2]), Math.max(r[1], r[3])],
    };
  }
  return { kind: 'polygon', points: c.points(o.polygon, `${path}.polygon`, 3) };
}

function readOp(c: Checker, raw: unknown, path: string): TerrainOp | null {
  const o = c.obj(raw, path);
  if (!o) return null;
  const kind = c.oneOf(o, 'op', path, [
    'raise', 'lower', 'hill', 'mountain', 'flatten', 'plateau', 'path', 'river', 'smooth', 'noise',
  ] as const);
  const common = ['op', 'note'];
  switch (kind) {
    case 'raise':
    case 'lower':
      c.keys(o, path, [...common, ...AREA_KEYS, 'amount', 'falloff']);
      return {
        op: kind,
        area: readArea(c, o, path),
        amount: c.num(o, 'amount', path),
        falloff: c.num(o, 'falloff', path, { def: 30, min: 0 }),
      };
    case 'hill':
      c.keys(o, path, [...common, 'at', 'radius', 'height']);
      return {
        op: 'hill',
        at: c.vec2(o.at, `${path}.at`),
        radius: c.num(o, 'radius', path, { min: 1 }),
        height: c.num(o, 'height', path),
      };
    case 'mountain':
      c.keys(o, path, [...common, 'at', 'radius', 'height', 'sharpness', 'roughness']);
      return {
        op: 'mountain',
        at: c.vec2(o.at, `${path}.at`),
        radius: c.num(o, 'radius', path, { min: 1 }),
        height: c.num(o, 'height', path),
        sharpness: c.num(o, 'sharpness', path, { def: 1.5, min: 0.2, max: 6 }),
        roughness: c.num(o, 'roughness', path, { def: 0.35, min: 0, max: 1 }),
      };
    case 'flatten': {
      c.keys(o, path, [...common, ...AREA_KEYS, 'height', 'falloff', 'strength']);
      return {
        op: 'flatten',
        area: readArea(c, o, path),
        height: o.height === undefined ? null : c.num(o, 'height', path),
        falloff: c.num(o, 'falloff', path, { def: 25, min: 0 }),
        strength: c.num(o, 'strength', path, { def: 1, min: 0, max: 1 }),
      };
    }
    case 'plateau':
      c.keys(o, path, [...common, ...AREA_KEYS, 'height', 'falloff']);
      return {
        op: 'plateau',
        area: readArea(c, o, path),
        height: c.num(o, 'height', path),
        falloff: c.num(o, 'falloff', path, { def: 6, min: 0 }),
      };
    case 'path': {
      c.keys(o, path, [...common, 'points', 'width', 'falloff', 'mode', 'depth', 'heights']);
      const points = c.points(o.points, `${path}.points`, 2);
      return {
        op: 'path',
        points,
        width: c.num(o, 'width', path, { min: 0.5 }),
        falloff: c.num(o, 'falloff', path, { def: 8, min: 0 }),
        mode: c.oneOf(o, 'mode', path, ['flatten', 'carve'] as const, 'flatten'),
        depth: c.num(o, 'depth', path, { def: 0, min: 0 }),
        heights: o.heights === undefined ? null : c.numbers(o.heights, `${path}.heights`, points.length),
      };
    }
    case 'river': {
      c.keys(o, path, [...common, 'name', 'points', 'width', 'depth', 'falloff', 'levels']);
      const points = c.points(o.points, `${path}.points`, 2);
      return {
        op: 'river',
        name: c.str(o, 'name', path, 'river'),
        points,
        width: c.num(o, 'width', path, { def: 8, min: 1 }),
        depth: c.num(o, 'depth', path, { def: 1.5, min: 0.2 }),
        falloff: c.num(o, 'falloff', path, { def: 16, min: 1 }),
        levels: o.levels === undefined ? null : c.numbers(o.levels, `${path}.levels`, points.length),
      };
    }
    case 'smooth':
      c.keys(o, path, [...common, ...AREA_KEYS, 'falloff', 'iterations']);
      return {
        op: 'smooth',
        area: readArea(c, o, path),
        falloff: c.num(o, 'falloff', path, { def: 20, min: 0 }),
        iterations: Math.round(c.num(o, 'iterations', path, { def: 3, min: 1, max: 20 })),
      };
    case 'noise':
      c.keys(o, path, [...common, ...AREA_KEYS, 'falloff', 'amplitude', 'scale']);
      return {
        op: 'noise',
        area: readArea(c, o, path),
        falloff: c.num(o, 'falloff', path, { def: 30, min: 0 }),
        amplitude: c.num(o, 'amplitude', path),
        scale: c.num(o, 'scale', path, { def: 60, min: 1 }),
      };
  }
}

function readPaint(c: Checker, raw: unknown, path: string): PaintDef | null {
  const o = c.obj(raw, path);
  if (!o) return null;
  const surface = c.oneOf(o, 'surface', path, SURFACES);
  if ('points' in o) {
    c.keys(o, path, ['surface', 'note', 'points', 'width', 'jitter']);
    return {
      surface,
      points: c.points(o.points, `${path}.points`, 2),
      width: c.num(o, 'width', path, { min: 0.5 }),
      jitter: c.num(o, 'jitter', path, { def: 0, min: 0 }),
    };
  }
  c.keys(o, path, ['surface', 'note', ...AREA_KEYS, 'jitter']);
  return { surface, area: readArea(c, o, path), jitter: c.num(o, 'jitter', path, { def: 20, min: 0 }) };
}

function readWater(c: Checker, raw: unknown, path: string, i: number): WaterDef | null {
  const o = c.obj(raw, path);
  if (!o) return null;
  const name = c.str(o, 'name', path, `water${i}`);
  if ('points' in o) {
    c.keys(o, path, ['name', 'note', 'points', 'width', 'levels']);
    const points = c.points(o.points, `${path}.points`, 2);
    return {
      name,
      points,
      width: c.num(o, 'width', path, { min: 0.5 }),
      levels: c.numbers(o.levels, `${path}.levels`, points.length),
    };
  }
  c.keys(o, path, ['name', 'note', ...AREA_KEYS, 'level']);
  return { name, area: readArea(c, o, path), level: c.num(o, 'level', path) };
}

function readObject(c: Checker, raw: unknown, path: string): ObjectDef | null {
  const o = c.obj(raw, path);
  if (!o) return null;
  c.keys(o, path, ['type', 'note', 'at', 'y', 'level', 'rotation', 'scale', 'id', 'props']);
  const props = o.props === undefined ? {} : c.obj(o.props, `${path}.props`) ?? {};
  return {
    type: c.oneOf(o, 'type', path, OBJECT_TYPES),
    at: c.vec2(o.at, `${path}.at`),
    y: c.num(o, 'y', path, { def: 0 }),
    level: o.level === undefined ? null : c.num(o, 'level', path),
    rotation: c.num(o, 'rotation', path, { def: 0 }),
    scale: c.num(o, 'scale', path, { def: 1, min: 0.05 }),
    id: o.id === undefined ? null : c.str(o, 'id', path),
    props,
  };
}

function readScatter(c: Checker, raw: unknown, path: string): ScatterDef | null {
  const o = c.obj(raw, path);
  if (!o) return null;
  c.keys(o, path, ['type', 'note', ...AREA_KEYS, 'density', 'scale', 'maxSlope', 'avoid', 'onlyOn', 'exclude']);
  return {
    type: c.oneOf(o, 'type', path, OBJECT_TYPES),
    area: readArea(c, o, path),
    density: c.num(o, 'density', path, { min: 0, max: 200 }),
    scale: o.scale === undefined ? [0.8, 1.25] : (c.numbers(o.scale, `${path}.scale`, 2) as Vec2),
    maxSlope: c.num(o, 'maxSlope', path, { def: 30, min: 0, max: 90 }),
    avoid: o.avoid === undefined ? ['road', 'sand', 'rock', 'snow'] : c.surfaces(o.avoid, `${path}.avoid`),
    onlyOn: o.onlyOn === undefined ? null : c.surfaces(o.onlyOn, `${path}.onlyOn`),
    exclude: c.array(o, 'exclude', path).map((e, i) => {
      const ex = c.obj(e, `${path}.exclude[${i}]`) ?? {};
      c.keys(ex, `${path}.exclude[${i}]`, AREA_KEYS);
      return readArea(c, ex, `${path}.exclude[${i}]`);
    }),
  };
}

export function parseWorld(raw: unknown, file = 'world.json'): WorldDef {
  const c = new Checker(file);
  const o = c.obj(raw, '$') ?? {};
  c.keys(o, '$', ['name', 'note', 'size', 'cellSize', 'seed', 'seaLevel', 'base', 'border', 'spawn', 'regions']);
  const base = c.obj(o.base, '$.base') ?? {};
  const border = c.obj(o.border, '$.border') ?? {};
  const spawn = c.obj(o.spawn, '$.spawn') ?? {};
  const size = c.num(o, 'size', '$', { min: 64, max: 8192 });
  const cellSize = c.num(o, 'cellSize', '$', { def: 2, min: 0.5, max: 16 });
  if (size % 64 !== 0) c.fail('$.size', '64 の倍数にしてください');
  if (64 % cellSize !== 0) c.fail('$.cellSize', '64 を割り切れる値にしてください');
  const regions = c.array(o, 'regions', '$').map((r, i) => {
    if (typeof r !== 'string') c.fail(`$.regions[${i}]`, 'region 名（ファイル名から .json を除いたもの）が必要です');
    return String(r);
  });
  const def: WorldDef = {
    name: c.str(o, 'name', '$', 'world'),
    size,
    cellSize,
    seed: c.num(o, 'seed', '$', { def: 1 }),
    seaLevel: c.num(o, 'seaLevel', '$', { def: 0 }),
    base: {
      height: c.num(base, 'height', '$.base', { def: 10 }),
      amplitude: c.num(base, 'amplitude', '$.base', { def: 20, min: 0 }),
      scale: c.num(base, 'scale', '$.base', { def: 500, min: 1 }),
      octaves: Math.round(c.num(base, 'octaves', '$.base', { def: 5, min: 1, max: 8 })),
      persistence: c.num(base, 'persistence', '$.base', { def: 0.5, min: 0, max: 1 }),
      lacunarity: c.num(base, 'lacunarity', '$.base', { def: 2, min: 1 }),
    },
    border: {
      width: c.num(border, 'width', '$.border', { def: 160, min: 0 }),
      depth: c.num(border, 'depth', '$.border', { def: -20 }),
    },
    spawn: { at: c.vec2(spawn.at, '$.spawn.at'), facing: c.num(spawn, 'facing', '$.spawn', { def: 0 }) },
    regions,
  };
  if (c.problems.length) throw new WorldDataError(c.problems);
  return def;
}

export function parseRegion(raw: unknown, file: string): RegionDef {
  const c = new Checker(file);
  const o = c.obj(raw, '$') ?? {};
  c.keys(o, '$', ['name', 'description', 'note', 'ops', 'paint', 'water', 'objects', 'scatter']);
  const def: RegionDef = {
    name: c.str(o, 'name', '$', file),
    description: c.str(o, 'description', '$', ''),
    ops: c.array(o, 'ops', '$').map((v, i) => readOp(c, v, `ops[${i}]`)).filter((v) => v !== null),
    paint: c.array(o, 'paint', '$').map((v, i) => readPaint(c, v, `paint[${i}]`)).filter((v) => v !== null),
    water: c.array(o, 'water', '$').map((v, i) => readWater(c, v, `water[${i}]`, i)).filter((v) => v !== null),
    objects: c.array(o, 'objects', '$').map((v, i) => readObject(c, v, `objects[${i}]`)).filter((v) => v !== null),
    scatter: c.array(o, 'scatter', '$').map((v, i) => readScatter(c, v, `scatter[${i}]`)).filter((v) => v !== null),
  };
  if (c.problems.length) throw new WorldDataError(c.problems);
  return def;
}

/**
 * world.json とリージョンファイル群（名前 → 生 JSON）を検証してまとめる。
 * 全ファイルのエラーを集めてから 1 回だけ投げる。
 */
export function parseWorldData(
  worldRaw: unknown,
  regionFiles: Record<string, unknown>,
): { world: WorldDef; regions: RegionDef[] } {
  const problems: string[] = [];
  let world: WorldDef | null = null;
  try {
    world = parseWorld(worldRaw);
  } catch (e) {
    if (e instanceof WorldDataError) problems.push(...e.problems);
    else throw e;
  }
  const regions: RegionDef[] = [];
  for (const name of world?.regions ?? []) {
    const file = `regions/${name}.json`;
    if (!(name in regionFiles)) {
      problems.push(`world.json: regions: ${file} が見つかりません`);
      continue;
    }
    try {
      regions.push(parseRegion(regionFiles[name], file));
    } catch (e) {
      if (e instanceof WorldDataError) problems.push(...e.problems);
      else throw e;
    }
  }
  for (const name of Object.keys(regionFiles)) {
    if (world && !world.regions.includes(name)) {
      problems.push(`regions/${name}.json: world.json の regions に載っていないため使われません`);
    }
  }
  if (problems.length || !world) throw new WorldDataError(problems);
  return { world, regions };
}

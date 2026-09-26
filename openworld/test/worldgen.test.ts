import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../src/core/random.ts';
import { areaDistance, areaWeight } from '../src/worldgen/area.ts';
import { composeWorld } from '../src/worldgen/compose.ts';
import { HeightGrid } from '../src/worldgen/grid.ts';
import { applyOp, applyRiver } from '../src/worldgen/ops.ts';
import { parseRegion, parseWorld, parseWorldData, WorldDataError, type TerrainOp } from '../src/worldgen/schema.ts';

const WORLD = {
  name: 'test',
  size: 256,
  cellSize: 2,
  seed: 1,
  seaLevel: 0,
  base: { height: 10, amplitude: 0 },
  border: { width: 0 },
  spawn: { at: [128, 128] },
  regions: ['r'],
};

function flatGrid(h = 0): HeightGrid {
  const g = new HeightGrid(256, 2);
  g.data.fill(h);
  return g;
}

function op(raw: object): TerrainOp {
  return parseRegion({ ops: [raw] }, 't.json').ops[0];
}

describe('random', () => {
  it('同じシードなら同じ列', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
});

describe('area', () => {
  it('円・矩形・多角形の符号付き距離', () => {
    expect(areaDistance({ kind: 'circle', at: [0, 0], radius: 10 }, 15, 0)).toBeCloseTo(5);
    expect(areaDistance({ kind: 'circle', at: [0, 0], radius: 10 }, 0, 0)).toBeCloseTo(-10);
    expect(areaDistance({ kind: 'rect', min: [0, 0], max: [10, 10] }, 13, 5)).toBeCloseTo(3);
    const tri = { kind: 'polygon' as const, points: [[0, 0], [10, 0], [0, 10]] as [number, number][] };
    expect(areaDistance(tri, 1, 1)).toBeLessThan(0);
    expect(areaDistance(tri, -2, 5)).toBeCloseTo(2);
  });

  it('falloff で 1 → 0 に滑らかに落ちる', () => {
    const a = { kind: 'circle' as const, at: [0, 0] as [number, number], radius: 10 };
    expect(areaWeight(a, 5, 0, 10)).toBe(1);
    expect(areaWeight(a, 15, 0, 10)).toBeCloseTo(0.5);
    expect(areaWeight(a, 25, 0, 10)).toBe(0);
  });
});

describe('HeightGrid', () => {
  it('双線形補間', () => {
    const g = flatGrid();
    g.data[g.index(1, 0)] = 10;
    expect(g.sample(1, 0)).toBeCloseTo(5);
    expect(g.sample(2, 0)).toBeCloseTo(10);
  });
});

describe('地形オペ', () => {
  it('hill は中心で height だけ盛り、半径の外は変えない', () => {
    const g = flatGrid();
    applyOp(g, op({ op: 'hill', at: [128, 128], radius: 40, height: 20 }), { seed: 1 });
    expect(g.sample(128, 128)).toBeCloseTo(20);
    expect(g.sample(128, 200)).toBe(0);
  });

  it('flatten は領域内を指定の高さにする', () => {
    const g = flatGrid(5);
    applyOp(g, op({ op: 'flatten', at: [128, 128], radius: 20, height: 12, falloff: 10 }), { seed: 1 });
    expect(g.sample(128, 128)).toBeCloseTo(12);
    expect(g.sample(128, 160)).toBeCloseTo(5);
  });

  it('plateau は下げない', () => {
    const g = flatGrid(30);
    applyOp(g, op({ op: 'plateau', at: [128, 128], radius: 20, height: 12 }), { seed: 1 });
    expect(g.sample(128, 128)).toBeCloseTo(30);
  });

  it('path (carve) は掘るだけで盛らない', () => {
    const g = flatGrid(10);
    applyOp(g, op({ op: 'path', points: [[20, 128], [236, 128]], width: 6, mode: 'carve', depth: 2 }), { seed: 1 });
    expect(g.sample(128, 128)).toBeCloseTo(8);
    expect(Math.max(...g.data)).toBeCloseTo(10);
  });

  it('river は水面より岸が高く、川床が低い（水が漏れない）', () => {
    const g = flatGrid(10);
    // 途中を窪ませておく（土手が必要になる）
    applyOp(g, op({ op: 'lower', at: [128, 128], radius: 20, amount: 6, falloff: 10 }), { seed: 1 });
    const river = op({ op: 'river', name: 'r', points: [[20, 128], [236, 128]], width: 8, depth: 1.5 });
    const levels = applyRiver(g, river as Extract<TerrainOp, { op: 'river' }>);
    for (let x = 30; x < 226; x += 4) {
      const t = (x - 20) / 216;
      const level = levels[0] + (levels[1] - levels[0]) * t;
      expect(g.sample(x, 128)).toBeLessThan(level - 1);
      expect(g.sample(x, 128 + 4.5)).toBeGreaterThanOrEqual(level - 0.2);
      expect(g.sample(x, 128 - 4.5)).toBeGreaterThanOrEqual(level - 0.2);
    }
  });

  it('オペは順番に適用される', () => {
    const a = flatGrid();
    const b = flatGrid();
    const hill = op({ op: 'hill', at: [128, 128], radius: 40, height: 20 });
    const flat = op({ op: 'flatten', at: [128, 128], radius: 10, height: 3 });
    applyOp(a, hill, { seed: 1 });
    applyOp(a, flat, { seed: 1 });
    applyOp(b, flat, { seed: 1 });
    applyOp(b, hill, { seed: 1 });
    expect(a.sample(128, 128)).toBeCloseTo(3);
    expect(b.sample(128, 128)).toBeCloseTo(23);
  });
});

describe('スキーマ', () => {
  it('誤りをファイル名とパス付きで全部報告する', () => {
    try {
      parseRegion({ ops: [{ op: 'hill', at: [1, 2] }, { op: 'raise', rect: [0, 0, 1, 1], amout: 3 }], objects: [{ type: 'castle', at: [0, 0] }] }, 'regions/x.json');
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(WorldDataError);
      const p = (e as WorldDataError).problems.join('\n');
      expect(p).toContain('regions/x.json: ops[0].radius');
      expect(p).toContain('ops[1].amout: 不明なキー');
      expect(p).toContain('ops[1].amount');
      expect(p).toContain('objects[0].type');
    }
  });

  it('world.json の regions にないファイル・存在しないファイルを報告する', () => {
    expect(() => parseWorldData({ ...WORLD, regions: ['a'] }, { b: {} })).toThrow(/a\.json が見つかりません[\s\S]*b\.json: world\.json の regions に載っていない/);
  });

  it('size は 64 の倍数', () => {
    expect(() => parseWorld({ ...WORLD, size: 100 })).toThrow(/64 の倍数/);
  });
});

describe('composeWorld', () => {
  const region = {
    name: 'r',
    ops: [{ op: 'flatten', at: [128, 128], radius: 30, height: 12 }],
    water: [{ name: 'pond', at: [60, 60], radius: 15, level: 20 }],
    objects: [{ type: 'house', at: [128, 128], rotation: 90, id: 'h' }],
    scatter: [{ type: 'pine', rect: [0, 0, 256, 256], density: 20 }],
  };

  it('決定的（同じ入力なら同じ結果）', () => {
    const d = parseWorldData(WORLD, { r: region });
    const a = composeWorld(d.world, d.regions);
    const b = composeWorld(d.world, d.regions);
    expect(a.heights.data).toEqual(b.heights.data);
    expect(a.objects).toEqual(b.objects);
  });

  it('配置物は地面に置かれ、scatter は家の周りと水中を避ける', () => {
    const d = parseWorldData(WORLD, { r: region });
    const w = composeWorld(d.world, d.regions);
    const house = w.objects.find((o) => o.id === 'h')!;
    expect(house.y).toBeCloseTo(12);
    expect(house.rotation).toBeCloseTo(Math.PI / 2);
    const pines = w.objects.filter((o) => o.type === 'pine');
    expect(pines.length).toBeGreaterThan(50);
    for (const p of pines) {
      expect(Math.hypot(p.x - 128, p.z - 128)).toBeGreaterThan(4);
      expect(Math.hypot(p.x - 60, p.z - 60)).toBeGreaterThan(14);
    }
    expect(w.waterLevelAt(60, 60)).toBe(20);
    expect(w.waterLevelAt(128, 128)).toBe(0);
  });
});

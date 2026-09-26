/**
 * 合成済みワールドの「見た目の破綻」を検出する（エラーではなく警告）。
 * AI がデータを編集したあと world:validate で確認できるようにする。
 */
import { CATALOG } from './catalog.ts';
import type { ComposedWorld, WaterBody } from './compose.ts';
import type { Area, Vec2 } from './schema.ts';

function outline(area: Area): Vec2[] {
  switch (area.kind) {
    case 'circle':
      return Array.from({ length: 96 }, (_, i) => {
        const a = (i / 96) * Math.PI * 2;
        return [area.at[0] + Math.cos(a) * area.radius, area.at[1] + Math.sin(a) * area.radius] as Vec2;
      });
    case 'rect':
      return [area.min, [area.max[0], area.min[1]], area.max, [area.min[0], area.max[1]]];
    case 'polygon':
      return area.points;
  }
}

/** 輪郭を約 step m 間隔で辿る */
function walk(points: Vec2[], closed: boolean, step: number, fn: (x: number, z: number) => void): void {
  const n = closed ? points.length : points.length - 1;
  for (let i = 0; i < n; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const k = Math.max(1, Math.ceil(len / step));
    for (let j = 0; j < k; j++) fn(a[0] + ((b[0] - a[0]) * j) / k, a[1] + ((b[1] - a[1]) * j) / k);
  }
}

function waterLeaks(w: ComposedWorld, body: WaterBody): Vec2[] {
  const leaks: Vec2[] = [];
  const check = (x: number, z: number, level: number) => {
    if (w.heights.sample(x, z) < level - 0.2) leaks.push([Math.round(x), Math.round(z)]);
  };
  if (body.kind === 'area') {
    walk(outline(body.area), true, 4, (x, z) => check(x, z, body.level));
  } else {
    // 川は両岸（幅の半分だけ外側）を調べる
    const pts = body.points;
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i];
      const [bx, bz] = pts[i + 1];
      const len = Math.hypot(bx - ax, bz - az) || 1;
      const nx = -(bz - az) / len;
      const nz = (bx - ax) / len;
      const k = Math.ceil(len / 4);
      for (let j = 0; j <= k; j++) {
        const t = j / k;
        const x = ax + (bx - ax) * t;
        const z = az + (bz - az) * t;
        const level = body.levels[i] + (body.levels[i + 1] - body.levels[i]) * t;
        const off = body.width / 2 + 0.5;
        check(x + nx * off, z + nz * off, level);
        check(x - nx * off, z - nz * off, level);
      }
    }
  }
  return leaks;
}

export function checkWorld(w: ComposedWorld): string[] {
  const warnings: string[] = [];
  for (const body of w.waters) {
    const leaks = waterLeaks(w, body);
    if (leaks.length) {
      const sample = leaks.slice(0, 4).map(([x, z]) => `(${x}, ${z})`).join(' ');
      warnings.push(
        `水域「${body.name}」: 縁の ${leaks.length} 箇所で地面が水面より低く、水が壁のように浮いて見えます。例 ${sample}` +
          ` → 水域を広げる / 縁を raise する / 水位を下げる`,
      );
    }
  }
  const [sx, sz] = w.def.spawn.at;
  if (w.heights.sample(sx, sz) < w.waterLevelAt(sx, sz)) warnings.push('スポーン地点が水中です');
  for (const o of w.objects) {
    if (o.scattered) continue;
    const name = `${o.region} の ${o.type}${o.id ? ` "${o.id}"` : ''} (${o.x}, ${o.z})`;
    if (o.y < w.waterLevelAt(o.x, o.z) && o.type !== 'marker') warnings.push(`${name} が水中にあります`);
    const r = CATALOG[o.type].footprint * o.scale;
    if (r > 2 && Math.atan(w.heights.slopeAt(o.x, o.z)) > (20 * Math.PI) / 180) {
      warnings.push(`${name} の足元が急斜面です（flatten で整地してください）`);
    }
  }
  const ids = new Map<string, number>();
  for (const o of w.objects) if (o.id) ids.set(o.id, (ids.get(o.id) ?? 0) + 1);
  for (const [id, n] of ids) if (n > 1) warnings.push(`id "${id}" が ${n} 回使われています`);
  return warnings;
}

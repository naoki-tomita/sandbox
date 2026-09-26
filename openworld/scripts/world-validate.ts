/**
 * npm run world:validate — ワールドデータを検証して概要と警告を表示する
 *   -- --probe x,z [x,z ...]  任意地点の高さ・傾斜・地表・水面を表示
 *   -- --strict               警告があれば終了コード 1（CI 用）
 */
import { checkWorld } from '../src/worldgen/checks.ts';
import { composeWorld } from '../src/worldgen/compose.ts';
import { WorldDataError } from '../src/worldgen/schema.ts';
import { loadWorldFiles } from './loadWorld.ts';

try {
  const { world, regions } = loadWorldFiles();
  const t0 = performance.now();
  const w = composeWorld(world, regions);
  const ms = performance.now() - t0;
  let min = Infinity;
  let max = -Infinity;
  for (const h of w.heights.data) {
    min = Math.min(min, h);
    max = Math.max(max, h);
  }
  console.log(`OK: ${world.name} (${world.size}m 四方, セル ${world.cellSize}m, 合成 ${ms.toFixed(0)}ms)`);
  console.log(`  高さ: ${min.toFixed(1)} 〜 ${max.toFixed(1)} m / 海面 ${world.seaLevel} m`);
  const [sx, sz] = world.spawn.at;
  console.log(`  スポーン: (${sx}, ${sz}) 地面 ${w.heights.sample(sx, sz).toFixed(1)} m, 水面 ${w.waterLevelAt(sx, sz).toFixed(1)} m`);
  for (const r of regions) {
    const counts = new Map<string, number>();
    for (const o of w.objects) if (o.region === r.name) counts.set(o.type, (counts.get(o.type) ?? 0) + 1);
    const summary = [...counts].map(([t, n]) => `${t}×${n}`).join(' ') || 'なし';
    console.log(`  [${r.name}] ops ${r.ops.length} / paint ${r.paint.length} / water ${r.water.length} / オブジェクト ${summary}`);
  }
  // --probe x,z [x,z ...] で任意地点の高さ・地表・水面を表示
  const pi = process.argv.indexOf('--probe');
  if (pi >= 0) {
    for (const a of process.argv.slice(pi + 1)) {
      if (a.startsWith('--')) break;
      const [x, z] = a.split(',').map(Number);
      const h = w.heights.sample(x, z);
      const deg = (Math.atan(w.heights.slopeAt(x, z)) * 180) / Math.PI;
      console.log(`  probe (${x}, ${z}): 高さ ${h.toFixed(1)} m, 傾斜 ${deg.toFixed(0)}°, 地表 ${w.surfaceAt(x, z)}, 水面 ${w.waterLevelAt(x, z).toFixed(1)} m`);
    }
  }
  const warnings = checkWorld(w);
  for (const msg of warnings) console.warn(`  警告: ${msg}`);
  if (!warnings.length) console.log('  警告なし');
  // --strict: 警告があれば失敗にする（CI 用）
  if (warnings.length && process.argv.includes('--strict')) process.exit(1);
} catch (e) {
  if (e instanceof WorldDataError) {
    console.error(e.message);
    process.exit(1);
  }
  throw e;
}

import { describe, expect, it } from 'vitest';
import { HorseAnimator, type HorseAnimInput } from '../src/mount/HorseAnimator.ts';
import { gaitWeights, horseGallop, horseIdle, horseJump, horseTrot, horseWalk, riderPose, strideLength } from '../src/mount/horsePoses.ts';
import { loadWorldFiles } from '../scripts/loadWorld.ts';
import { composeWorld } from '../src/worldgen/compose.ts';

const step = (a: HorseAnimator, input: Partial<HorseAnimInput>, seconds: number) => {
  let pose: Record<string, number> = {};
  for (let t = 0; t < seconds; t += 1 / 60) {
    pose = a.update({ dt: 1 / 60, speed: 0, vy: 0, airborne: false, idleFree: false, jumpSpeed: 8.5, ...input });
  }
  return pose;
};

describe('馬のポーズ', () => {
  it('歩法の重みは常に合計 1 で、速さに応じて常歩 → 速歩 → 襲歩に移る', () => {
    for (let s = 0; s <= 20; s += 0.5) {
      const w = gaitWeights(s);
      expect(w.walk + w.trot + w.gallop).toBeCloseTo(1, 6);
    }
    expect(gaitWeights(1.5).walk).toBe(1);
    expect(gaitWeights(7).trot).toBe(1);
    expect(gaitWeights(15).gallop).toBe(1);
  });

  it('速歩は対角の脚（左前と右後）が同じ向きに振れる', () => {
    // 接地中（位相 0..0.45）は左前と右後が一緒に前から後ろへ掻く（後脚は立ち姿の角度 0.28 が基準）
    for (const ph of [0.05, 0.4]) {
      const p = horseTrot(ph);
      expect(Math.sign(p['fl.upper.x'])).toBe(Math.sign(p['hr.upper.x'] - 0.28));
    }
    // 位相が半周ずれた左右の前脚は逆向き
    const p = horseTrot(0.2);
    expect(Math.sign(p['fl.upper.x'])).not.toBe(Math.sign(p['fr.upper.x']));
  });

  it('どのポーズも有限の値だけを返す', () => {
    const poses = [horseIdle(3.2), horseIdle(1, 1), horseWalk(0.4), horseTrot(0.7), horseGallop(0.2), horseJump(0.5), riderPose(1, 0.05, 1, 0.5)];
    for (const p of poses) for (const v of Object.values(p)) expect(Number.isFinite(v)).toBe(true);
  });

  it('跳躍の頂点で前脚を最も深く折りたたむ', () => {
    expect(horseJump(0.5)['fl.lower.x']).toBeGreaterThan(horseJump(0.1)['fl.lower.x']);
  });
});

describe('HorseAnimator', () => {
  it('脚の周期は進んだ距離 / 歩幅で進む（蹄が滑らない）', () => {
    const a = new HorseAnimator();
    step(a, { speed: 10 }, 2);
    expect(a.phase).toBeCloseTo((2 * 10) / strideLength(10), 0);
  });

  it('乗り手のいない馬は止まっているとそのうち草を食む。乗られているときは食まない', () => {
    const free = new HorseAnimator();
    const ridden = new HorseAnimator();
    // 20 秒周期の前半 8 秒が食む時間なので、静止 4 秒の後でかつ周期の前半になる時刻まで回す
    const freePose = step(free, { idleFree: true }, 25);
    const riddenPose = step(ridden, { idleFree: false }, 25);
    expect(freePose['neck.x']).toBeGreaterThan(riddenPose['neck.x'] + 0.5);
  });

  it('襲歩では乗り手の前傾用の重みが立つ', () => {
    const a = new HorseAnimator();
    step(a, { speed: 15 }, 2);
    expect(a.gallop).toBeGreaterThan(0.9);
    expect(riderPose(0, 0, 1, 0)['spine.x']).toBeGreaterThan(riderPose(0, 0, 0, 0)['spine.x']);
  });
});

describe('ワールドの馬', () => {
  it('どの村にも厩舎があり、その前に馬がいる', () => {
    const { world, regions } = loadWorldFiles();
    const w = composeWorld(world, regions);
    for (const v of ['v1', 'v2', 'v3', 'v4', 'v5', 'v6']) {
      const stable = w.objects.find((o) => o.type === 'stable' && o.region === v);
      expect(stable, v).toBeDefined();
      const horses = w.objects.filter((o) => o.type === 'horse' && o.region === v);
      expect(horses.length, v).toBeGreaterThan(0);
      for (const h of horses) expect(Math.hypot(h.x - stable!.x, h.z - stable!.z)).toBeLessThan(10);
    }
  }, 60_000);
});

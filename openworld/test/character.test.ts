import { describe, expect, it } from 'vitest';
import { CharacterAnimator, type AnimInput } from '../src/player/character/CharacterAnimator.ts';
import { blend, run, walk } from '../src/player/character/poses.ts';

const step = (a: CharacterAnimator, input: Partial<AnimInput>, seconds: number) => {
  let pose = {};
  for (let t = 0; t < seconds; t += 1 / 60) {
    pose = a.update({ dt: 1 / 60, speed: 0, vy: 0, mode: 'ground', facing: 0, ...input });
  }
  return pose as Record<string, number>;
};

describe('ポーズ', () => {
  it('歩行は左右の脚が逆に振れる（phase π/2 で左脚が前）', () => {
    const p = walk(Math.PI / 2);
    expect(p['thighL.x']).toBeLessThan(0);
    expect(p['thighR.x']).toBeGreaterThan(0);
    // 腕は同じ側の脚と逆
    expect(p['upperArmL.x']).toBeGreaterThan(0);
  });

  it('走りは歩きより振りが大きく前傾する', () => {
    expect(Math.abs(run(Math.PI / 2)['thighL.x'])).toBeGreaterThan(Math.abs(walk(Math.PI / 2)['thighL.x']));
    expect(run(0)['spine.x']).toBeGreaterThan(walk(0)['spine.x']);
  });

  it('blend は重み付きの和', () => {
    expect(blend([[{ a: 1 }, 0.25], [{ a: 3, b: 2 }, 0.5]])).toEqual({ a: 1.75, b: 1 });
  });
});

describe('CharacterAnimator', () => {
  it('止まっていれば脚はほぼまっすぐ、走れば大きく振れる', () => {
    const still = step(new CharacterAnimator(), { speed: 0 }, 1);
    expect(Math.abs(still['thighL.x'] ?? 0)).toBeLessThan(0.05);
    const a = new CharacterAnimator();
    let maxSwing = 0;
    for (let t = 0; t < 2; t += 1 / 60) {
      const p = a.update({ dt: 1 / 60, speed: 11, vy: 0, mode: 'ground', facing: 0 });
      maxSwing = Math.max(maxSwing, Math.abs(p['thighL.x']));
    }
    expect(maxSwing).toBeGreaterThan(0.6);
  });

  it('歩幅に合わせて脚を回す（速いほど 1 秒あたりの歩数が多い）', () => {
    const slow = new CharacterAnimator();
    const fast = new CharacterAnimator();
    step(slow, { speed: 3 }, 1);
    step(fast, { speed: 9 }, 1);
    expect(fast.phase).toBeGreaterThan(slow.phase * 1.5);
  });

  it('落下から着地すると腰が沈み、やがて戻る', () => {
    const a = new CharacterAnimator();
    step(a, { mode: 'air', vy: -12 }, 0.5);
    const landed = a.update({ dt: 1 / 60, speed: 0, vy: 0, mode: 'ground', facing: 0 });
    expect(landed.hipsY).toBeLessThan(-0.1);
    const later = step(a, {}, 1);
    expect(Math.abs(later.hipsY)).toBeLessThan(0.02);
  });

  it('泳いで進むと体が水平になる', () => {
    const p = step(new CharacterAnimator(), { mode: 'swim', speed: 3 }, 2);
    expect(p.rootPitch).toBeGreaterThan(1);
  });

  it('どの状態でも NaN を出さない', () => {
    const a = new CharacterAnimator();
    const modes = ['ground', 'air', 'swim'] as const;
    for (let i = 0; i < 600; i++) {
      const p = a.update({ dt: i % 50 === 0 ? 0 : 1 / 60, speed: (i % 13), vy: (i % 7) - 3, mode: modes[i % 3], facing: i * 0.1 });
      for (const v of Object.values(p)) expect(Number.isFinite(v)).toBe(true);
    }
  });
});

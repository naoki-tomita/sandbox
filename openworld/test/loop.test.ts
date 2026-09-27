import { describe, expect, it } from 'vitest';
import { Loop } from '../src/core/Loop.ts';

describe('Loop', () => {
  it('経過時間を固定ステップに分割し、余りを alpha として渡す', () => {
    const steps: number[] = [];
    let alpha = -1;
    const loop = new Loop(0.1, (dt) => steps.push(dt), (a) => (alpha = a));
    expect(loop.advance(0.25)).toBe(2);
    expect(alpha).toBeCloseTo(0.5);
    expect(loop.advance(0.06)).toBe(1);
    expect(steps).toEqual([0.1, 0.1, 0.1]);
  });

  it('巨大な経過時間は打ち切る', () => {
    const loop = new Loop(0.1, () => {}, () => {});
    expect(loop.advance(10)).toBe(2);
  });
});

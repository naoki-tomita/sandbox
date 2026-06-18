import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from './render';
import { Text, View } from './components';

/** Minimal fake 2D context recording the calls the painter makes. */
function fakeCanvas() {
  const calls: Array<{ op: string; args: unknown[] }> = [];
  const rec =
    (op: string) =>
    (...args: unknown[]) => {
      calls.push({ op, args });
    };
  const ctx: Record<string, unknown> = {
    save: rec('save'),
    restore: rec('restore'),
    clearRect: rec('clearRect'),
    fillRect: rec('fillRect'),
    fill: rec('fill'),
    stroke: rec('stroke'),
    beginPath: rec('beginPath'),
    closePath: rec('closePath'),
    moveTo: rec('moveTo'),
    arcTo: rec('arcTo'),
    arc: rec('arc'),
    clip: rec('clip'),
    drawImage: rec('drawImage'),
    setTransform: rec('setTransform'),
    fillText: rec('fillText'),
    measureText: (t: string) => ({ width: t.length * 8 }),
    globalAlpha: 1,
  };
  const listeners: Record<string, ((e: any) => void)[]> = {};
  const canvas = {
    clientWidth: 400,
    clientHeight: 300,
    width: 0,
    height: 0,
    getContext: () => ctx,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 300 }),
    addEventListener: (type: string, cb: (e: any) => void) => {
      (listeners[type] ??= []).push(cb);
    },
    removeEventListener: () => {},
    dispatch: (type: string, e: any) => {
      for (const cb of listeners[type] ?? []) cb(e);
    },
  } as unknown as HTMLCanvasElement & { dispatch: (t: string, e: any) => void };
  return { canvas, ctx, calls };
}

// The renderer falls back to setTimeout when rAF is missing (node env), so
// flush by advancing fake timers.
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function flush() {
  vi.advanceTimersByTime(32);
}

describe('render', () => {
  it('mounts a component and paints text to the canvas', () => {
    const { canvas, calls } = fakeCanvas();
    render(
      <View style={{ padding: 10 }}>
        <Text style={{ fontSize: 16, color: '#fff' }}>hi</Text>
      </View>,
      canvas,
      { pixelRatio: 1 },
    );
    flush();

    const texts = calls.filter((c) => c.op === 'fillText');
    expect(texts).toHaveLength(1);
    expect(texts[0].args[0]).toBe('hi');
  });

  it('re-renders on state changes driven by hooks', () => {
    const { canvas, calls } = fakeCanvas();
    let setN: (n: number) => void = () => {};
    function Counter() {
      const [n, set] = useState(0);
      setN = set;
      return <Text>{String(n)}</Text>;
    }
    const lastText = () => {
      const ts = calls.filter((c) => c.op === 'fillText');
      return ts[ts.length - 1]?.args[0];
    };
    render(<Counter />, canvas, { pixelRatio: 1 });
    flush();
    expect(lastText()).toBe('0');

    setN(42);
    flush();
    expect(lastText()).toBe('42');
  });

  it('routes canvas clicks to the matching node handler', () => {
    const { canvas } = fakeCanvas();
    const onClick = vi.fn();
    render(
      <View style={{ width: 400, height: 300 }}>
        <View
          style={{ position: 'absolute', left: 50, top: 50, width: 100, height: 60 }}
          onClick={onClick}
        />
      </View>,
      canvas,
      { pixelRatio: 1 },
    );
    flush();

    (canvas as any).dispatch('click', { clientX: 80, clientY: 70 });
    expect(onClick).toHaveBeenCalledTimes(1);

    (canvas as any).dispatch('click', { clientX: 5, clientY: 5 });
    expect(onClick).toHaveBeenCalledTimes(1); // outside the inner box
  });
});

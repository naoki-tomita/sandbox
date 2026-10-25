// ノブ。上下ドラッグで回す (Shift で細かく)。矢印キーでも動き、ダブルクリックで初期値に戻る。

import { h } from "zheleznaya";
import type { Param } from "../effects";
import { update } from "../state";
import { clamp } from "../util";

// ドラッグ中のノブ: 押した位置と、そのときの値
const drags = new WeakMap<Element, { y: number; value: number }>();

function setValue(p: Param, v: number) {
  const next = clamp(Math.round(v / p.step) * p.step, p.min, p.max);
  if (next === p.value) return;
  p.value = next;
  p.set(next);
  update();
}

export const Knob = ({ param: p }: { param: Param }) => {
  const decimals = p.step >= 1 ? 0 : Math.ceil(-Math.log10(p.step));
  const text = p.value.toFixed(decimals) + p.unit;
  const turn = ((p.value - p.min) / (p.max - p.min)) * 270 - 135;
  const big = (p.max - p.min) / 10;
  const moves: Record<string, number> = { ArrowUp: p.step, ArrowRight: p.step, ArrowDown: -p.step, ArrowLeft: -p.step, PageUp: big, PageDown: -big };
  return (
    <div class="knob">
      <span class="knob-label">{p.label}</span>
      <div
        class="dial"
        tabIndex={0}
        role="slider"
        aria-label={p.label}
        aria-valuemin={p.min}
        aria-valuemax={p.max}
        aria-valuenow={p.value}
        aria-valuetext={text}
        onpointerdown={(e: PointerEvent) => {
          const dial = e.currentTarget as HTMLElement;
          dial.setPointerCapture(e.pointerId);
          drags.set(dial, { y: e.clientY, value: p.value });
        }}
        onpointermove={(e: PointerEvent) => {
          const drag = drags.get(e.currentTarget as Element);
          if (!drag) return;
          const range = (p.max - p.min) * (e.shiftKey ? 0.2 : 1);
          setValue(p, drag.value + ((drag.y - e.clientY) / 160) * range);
        }}
        onpointerup={(e: PointerEvent) => drags.delete(e.currentTarget as Element)}
        onpointercancel={(e: PointerEvent) => drags.delete(e.currentTarget as Element)}
        ondblclick={() => setValue(p, p.initial)}
        onkeydown={(e: KeyboardEvent) => {
          if (e.key in moves) setValue(p, p.value + moves[e.key] * (e.shiftKey ? 10 : 1));
          else if (e.key === "Home") setValue(p, p.min);
          else if (e.key === "End") setValue(p, p.max);
          else return;
          e.preventDefault();
        }}
      >
        <span class="dial-pointer" style={{ transform: `rotate(${turn}deg)` }}></span>
      </div>
      <span class="knob-value">{text}</span>
    </div>
  );
};

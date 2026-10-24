// パネルに載せる部品: ノブ、表示窓、レベルメーター。

import { el, clamp } from "./dom.js";

// 上下ドラッグで回す (Shift で細かく)。矢印キーでも動き、ダブルクリックで初期値に戻る。
export function knob({ label, min, max, step, value, unit = "", set }) {
  const initial = value;
  const decimals = step >= 1 ? 0 : Math.ceil(-Math.log10(step));
  const root = el("div", "knob");
  const dial = el("div", "dial");
  dial.tabIndex = 0;
  dial.setAttribute("role", "slider");
  dial.setAttribute("aria-label", label);
  dial.setAttribute("aria-valuemin", min);
  dial.setAttribute("aria-valuemax", max);
  const readout = el("span", "knob-value");
  root.append(el("span", "knob-label", label), dial, readout);

  const update = (v) => {
    value = clamp(Math.round(v / step) * step, min, max);
    const text = value.toFixed(decimals) + unit;
    dial.style.setProperty("--turn", `${((value - min) / (max - min)) * 270 - 135}deg`);
    dial.setAttribute("aria-valuenow", value);
    dial.setAttribute("aria-valuetext", text);
    readout.textContent = text;
    set(value);
  };
  update(value);

  let drag = null;
  dial.addEventListener("pointerdown", (e) => {
    dial.setPointerCapture(e.pointerId);
    drag = { y: e.clientY, value };
  });
  dial.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const range = (max - min) * (e.shiftKey ? 0.2 : 1);
    update(drag.value + ((drag.y - e.clientY) / 160) * range);
  });
  const end = () => (drag = null);
  dial.addEventListener("pointerup", end);
  dial.addEventListener("pointercancel", end);
  dial.addEventListener("dblclick", () => update(initial));
  dial.addEventListener("keydown", (e) => {
    const big = (max - min) / 10;
    const moves = { ArrowUp: step, ArrowRight: step, ArrowDown: -step, ArrowLeft: -step, PageUp: big, PageDown: -big };
    if (e.key in moves) update(value + moves[e.key] * (e.shiftKey ? 10 : 1));
    else if (e.key === "Home") update(min);
    else if (e.key === "End") update(max);
    else return;
    e.preventDefault();
  });
  return root;
}

// アンバーの表示窓。rows[i].textContent に書き込んで使う。
export function lcd(lines = 1) {
  const screen = el("div", "lcd");
  const rows = Array.from({ length: lines }, () => screen.appendChild(el("div", "lcd-row", "—")));
  return { screen, rows };
}

// 縦に並んだ LED のレベルメーター。上 2 つは赤。show(dB) で点灯数が変わる。
export function meter(segments = 10) {
  const root = el("div", "meter");
  root.setAttribute("aria-hidden", "true");
  const leds = Array.from({ length: segments }, (_, i) => root.appendChild(el("span", i >= segments - 2 ? "seg seg--hot" : "seg")));
  const show = (db) => {
    const lit = Math.round(clamp((db + 60) / 60, 0, 1) * leds.length);
    leds.forEach((led, i) => led.classList.toggle("is-lit", i < lit));
  };
  return { el: root, show };
}

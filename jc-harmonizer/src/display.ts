// 頻繁に変わる表示 (レベルメーター 60fps、入力ピッチ 20Hz、MIDI の LED)。
// store に載せると毎回アプリ全体が再描画されるので、子を持たない要素を ref で受け取って直接書き換える。
// 要素が作り直されると ref がもう一度呼ばれるので、そのたびに最新の要素へ差し替える。

import { clamp } from "./util";

const SEGMENTS = 10;
let meterSegs: HTMLElement[] = [];
let pitchRow: HTMLElement | null = null;
let pitchText = "IN —";
let midiLed: HTMLElement | null = null;
let midiBlink: ReturnType<typeof setTimeout> | undefined;

// 縦に並んだ LED。上 2 つは赤。
export function attachMeter(el: HTMLElement) {
  meterSegs = Array.from({ length: SEGMENTS }, (_, i) => {
    const seg = document.createElement("span");
    seg.className = i >= SEGMENTS - 2 ? "seg seg--hot" : "seg";
    return el.appendChild(seg);
  });
}

export function showLevel(db: number) {
  const lit = Math.round(clamp((db + 60) / 60, 0, 1) * meterSegs.length);
  meterSegs.forEach((seg, i) => seg.classList.toggle("is-lit", i < lit));
}

export function attachPitch(el: HTMLElement) {
  pitchRow = el;
  el.textContent = pitchText;
}

export function showPitch(text: string) {
  pitchText = text;
  if (pitchRow) pitchRow.textContent = text;
}

export function attachMidiLed(el: HTMLElement) {
  midiLed = el;
}

export function blinkMidi() {
  midiLed?.classList.add("is-lit");
  clearTimeout(midiBlink);
  midiBlink = setTimeout(() => midiLed?.classList.remove("is-lit"), 80);
}

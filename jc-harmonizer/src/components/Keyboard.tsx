// 2 オクターブの画面鍵盤。マルチタッチで和音、指を滑らせると隣の鍵盤へ移る。

import { h } from "zheleznaya";
import { noteOff, noteOn } from "../actions";
import { isBlackKey, noteName } from "../notes";
import { state, update } from "../state";

const pointers = new Map<number, number>(); // pointerId -> note

const noteAt = (x: number, y: number) => {
  const key = document.elementFromPoint(x, y);
  return key instanceof HTMLElement && key.dataset.note ? Number(key.dataset.note) : null;
};

function shiftOctave(delta: number) {
  for (const note of pointers.values()) noteOff(note);
  pointers.clear();
  state.lowNote = Math.min(84, Math.max(24, state.lowNote + delta));
  update();
}

const release = (e: PointerEvent) => {
  if (!pointers.has(e.pointerId)) return;
  noteOff(pointers.get(e.pointerId)!);
  pointers.delete(e.pointerId);
};

function keys() {
  const whiteWidth = 100 / 14;
  let white = 0;
  const result = [];
  for (let note = state.lowNote; note < state.lowNote + 24; note++) {
    const black = isBlackKey(note);
    const left = (black ? white - 0.3 : white) * whiteWidth;
    if (!black) white++;
    result.push(
      <div
        class={`pkey ${black ? "pkey--black" : "pkey--white"}${state.held.has(note) ? " on" : ""}`}
        data-note={note}
        style={{ left: `${left}%`, width: `${(black ? 0.6 : 1) * whiteWidth}%` }}
      ></div>,
    );
  }
  return result;
}

export const Keyboard = () => (
  <section class="keys-wrap" aria-label="鍵盤">
    <div class="keys-bar">
      <button class="key" type="button" aria-label="1 オクターブ下げる" onclick={() => shiftOctave(-12)}>
        ◀
      </button>
      <span class="range">{`${noteName(state.lowNote)}–${noteName(state.lowNote + 23)}`}</span>
      <button class="key" type="button" aria-label="1 オクターブ上げる" onclick={() => shiftOctave(12)}>
        ▶
      </button>
      <span class="pc">PC キーボード A W S E D F T G Y H U J K でも弾けます (C4–C5)</span>
    </div>
    <div
      id="keyboard"
      onpointerdown={(e: PointerEvent) => {
        const note = noteAt(e.clientX, e.clientY);
        if (note === null) return;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        pointers.set(e.pointerId, note);
        noteOn(note, 100);
      }}
      onpointermove={(e: PointerEvent) => {
        if (!pointers.has(e.pointerId)) return;
        const note = noteAt(e.clientX, e.clientY);
        const prev = pointers.get(e.pointerId)!;
        if (note === null || note === prev) return;
        pointers.set(e.pointerId, note);
        noteOff(prev);
        noteOn(note, 100);
      }}
      onpointerup={release}
      onpointercancel={release}
    >
      {keys()}
    </div>
  </section>
);

// A W S E D F T G Y H U J K で C4〜C5。文字入力中は弾かない。
export function bindPcKeys() {
  const PC_KEYS = "awsedftgyhujk";
  addEventListener("keydown", (e) => {
    const i = PC_KEYS.indexOf(e.key);
    if (i >= 0 && !e.repeat && !(e.target as Element).closest("textarea, input, select")) noteOn(60 + i, 100);
  });
  addEventListener("keyup", (e) => {
    const i = PC_KEYS.indexOf(e.key);
    if (i >= 0 && state.held.has(60 + i)) noteOff(60 + i);
  });
}

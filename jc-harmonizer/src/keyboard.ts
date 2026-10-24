// 画面の鍵盤と PC キーボード。押した / 離したノートを onNoteOn / onNoteOff で知らせる。

import { el } from "./dom";
import { noteName, isBlackKey } from "./notes";

export interface NoteHandlers {
  onNoteOn(note: number, velocity: number): void;
  onNoteOff(note: number): void;
}

export interface KeyboardOptions extends NoteHandlers {
  keybed: HTMLElement;
  rangeLabel: HTMLElement;
  octDown: HTMLButtonElement;
  octUp: HTMLButtonElement;
}

// 2 オクターブの画面鍵盤。マルチタッチで和音、指を滑らせると隣の鍵盤へ移る。
// show(note, on) で、MIDI など別の入力で鳴っているノートも光らせる。
export function createKeyboard({ keybed, rangeLabel, octDown, octUp, onNoteOn, onNoteOff }: KeyboardOptions) {
  let lowNote = 48;
  const lit = new Set<number>();
  const keyEls = new Map<number, HTMLElement>(); // note -> 鍵盤の要素
  const pointers = new Map<number, number>(); // pointerId -> note

  function build() {
    for (const note of pointers.values()) onNoteOff(note);
    pointers.clear();
    keybed.replaceChildren();
    keyEls.clear();
    const whiteWidth = 100 / 14;
    let white = 0;
    for (let note = lowNote; note < lowNote + 24; note++) {
      const black = isBlackKey(note);
      const key = el("div", `pkey ${black ? "pkey--black" : "pkey--white"}`);
      key.dataset.note = String(note);
      key.style.left = `${(black ? white - 0.3 : white) * whiteWidth}%`;
      key.style.width = `${(black ? 0.6 : 1) * whiteWidth}%`;
      if (!black) white++;
      if (lit.has(note)) key.classList.add("on");
      keybed.append(key);
      keyEls.set(note, key);
    }
    rangeLabel.textContent = `${noteName(lowNote)}–${noteName(lowNote + 23)}`;
  }

  const noteAt = (x: number, y: number) => {
    const key = document.elementFromPoint(x, y);
    return key instanceof HTMLElement && key.dataset.note ? Number(key.dataset.note) : null;
  };
  keybed.addEventListener("pointerdown", (e) => {
    const note = noteAt(e.clientX, e.clientY);
    if (note === null) return;
    keybed.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, note);
    onNoteOn(note, 100);
  });
  keybed.addEventListener("pointermove", (e) => {
    if (!pointers.has(e.pointerId)) return;
    const note = noteAt(e.clientX, e.clientY);
    const prev = pointers.get(e.pointerId);
    if (note === null || note === prev) return;
    pointers.set(e.pointerId, note);
    onNoteOff(prev!);
    onNoteOn(note, 100);
  });
  const release = (e: PointerEvent) => {
    if (!pointers.has(e.pointerId)) return;
    onNoteOff(pointers.get(e.pointerId)!);
    pointers.delete(e.pointerId);
  };
  keybed.addEventListener("pointerup", release);
  keybed.addEventListener("pointercancel", release);
  octDown.onclick = () => ((lowNote = Math.max(24, lowNote - 12)), build());
  octUp.onclick = () => ((lowNote = Math.min(84, lowNote + 12)), build());
  build();

  return {
    show(note: number, on: boolean) {
      on ? lit.add(note) : lit.delete(note);
      keyEls.get(note)?.classList.toggle("on", on);
    },
  };
}

// A W S E D F T G Y H U J K で C4〜C5。文字入力中は弾かない。
export function bindPcKeys({ onNoteOn, onNoteOff, isHeld }: NoteHandlers & { isHeld(note: number): boolean }) {
  const PC_KEYS = "awsedftgyhujk";
  addEventListener("keydown", (e) => {
    const i = PC_KEYS.indexOf(e.key);
    if (i >= 0 && !e.repeat && !(e.target as Element).closest("textarea, input, select")) onNoteOn(60 + i, 100);
  });
  addEventListener("keyup", (e) => {
    const i = PC_KEYS.indexOf(e.key);
    if (i >= 0 && isHeld(60 + i)) onNoteOff(60 + i);
  });
}

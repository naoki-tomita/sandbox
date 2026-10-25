// アプリの状態と再描画。
// 状態は普通のオブジェクトに持ち、変えたら update() で zheleznaya に再描画させる。
// zheleznaya の store (Proxy) に AudioNode を入れたり配列を入れ替えたりすると壊れるので
// (https://github.com/naoki-tomita/zheleznaya/issues/20)、store には再描画のきっかけになる version だけを置く。

import { createRoot } from "zheleznaya";
import type { Param } from "./effects";

export type Role = "source" | "voice" | "fx" | "sink";

export interface CodeState {
  // テキストエリアの今の中身 (適用済みとは限らない)
  source: string;
  result: string;
  isError: boolean;
  apply(source: string): void;
}

export interface ModuleState {
  id: number;
  kind: "mic" | "voice" | "output" | "fx";
  name: string;
  // パネルに印刷する日本語の説明
  sub: string;
  // パネル上部の色帯 (音の流れの中での役割)
  role: Role;
  width: "narrow" | "normal" | "wide";
  input: AudioNode | null;
  output: AudioNode | null;
  removable: boolean;
  on: boolean;
  params: Param[];
  code: CodeState | null;
  setOn?(on: boolean): void;
  dispose?(): void;
}

export interface Cable {
  from: number;
  to: number;
  color: string;
}

export const state = {
  power: false,
  status: "STANDBY",
  midiName: "POWER で接続",
  latency: "—",
  modules: [] as ModuleState[],
  cables: [] as Cable[],
  held: new Set<number>(),
  // 画面鍵盤のいちばん左の音
  lowNote: 48,
  presetNames: [] as string[],
  // ADD MODULE で選んでいる値 (ラックを作り直しても選択を残すため)
  addChoice: "reverb",
  // relayout() の途中だけ true。ラックを一度消してから描き直す
  rackHidden: false,
};

const root = createRoot(document.getElementById("app")!);
const store = root.createStore({ version: 0 });

export const render = root.render;

const listeners: Array<() => void> = [];

// 状態を変えたあとに呼ぶ。再描画は zheleznaya がまとめて行う。
export function update() {
  store.version++;
  // DOM を経由しない描画 (ケーブル) は、再描画のあとに描き直す
  requestAnimationFrame(() => listeners.forEach((f) => f()));
}

// モジュールの出し入れのあとに呼ぶ。
// zheleznaya は子要素の並びが変わると差分の適用がずれて壊れるので
// (https://github.com/naoki-tomita/zheleznaya/issues/20)、ラックを一度文字列に置き換えてから作り直させる。
// 要素の種類が変わると差分の計算はそこで止まり、丸ごと作り直しになる。
export function relayout() {
  state.rackHidden = true;
  update();
}

let unhideQueued = false;

// ラックを消した状態を描画したときに、ラックのコンポーネントから呼ぶ。
// 再描画は debounce されていて、ほかの update() で先送りされることがあるので、
// 「消した状態が実際に描かれたあと」に戻す
export function rackHiddenRendered() {
  if (unhideQueued) return;
  unhideQueued = true;
  setTimeout(() => {
    unhideQueued = false;
    state.rackHidden = false;
    update();
  }, 0);
}

export function onUpdate(f: () => void) {
  listeners.push(f);
}

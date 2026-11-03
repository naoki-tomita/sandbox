// モジュールの並べ替え。つかみ (⠿) をドラッグするか、つかみにフォーカスして左右の矢印キーで動かす。
// 見た目の順番だけを変え、ケーブルのつながりはそのまま。MIC と OUTPUT は両端に固定。

import { moveModule } from "./patchbay";
import { state, update, type ModuleState } from "./state";

export const isMovable = (m: ModuleState) => m.kind === "voice" || m.kind === "fx";

let dragging: { m: ModuleState; pointerId: number } | null = null;

export function onReorderStart(e: PointerEvent) {
  const grip = (e.target as Element).closest<HTMLElement>(".module-grip");
  const m = grip && state.modules.find((it) => it.id === Number(grip.dataset.id));
  if (!m) return;
  e.preventDefault();
  // 並べ替えでつかみの要素が別のモジュールに使い回されるので、ラック全体でポインターを受ける
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  dragging = { m, pointerId: e.pointerId };
  state.draggingId = m.id;
  update();
}

export function onReorderMove(e: PointerEvent) {
  if (!dragging || e.pointerId !== dragging.pointerId) return;
  const from = state.modules.indexOf(dragging.m);
  const panels = [...document.querySelectorAll<HTMLElement>(".rack > .module")];
  // ポインターの下にある、動かせるモジュール
  const to = panels.findIndex((el, i) => {
    const r = el.getBoundingClientRect();
    return i !== from && isMovable(state.modules[i]) && e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
  });
  if (to < 0) return;
  // 相手の真ん中を越えたら入れ替える (幅の違うモジュールの間で行ったり来たりしないように)
  const r = panels[to].getBoundingClientRect();
  const center = r.left + r.width / 2;
  if ((to > from && e.clientX > center) || (to < from && e.clientX < center)) moveModule(dragging.m, to);
}

export function onReorderEnd(e: PointerEvent) {
  if (!dragging || e.pointerId !== dragging.pointerId) return;
  dragging = null;
  state.draggingId = null;
  update();
}

// つかみで左右の矢印キーを押したとき
export function onGripKey(e: KeyboardEvent, m: ModuleState) {
  const step = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0;
  if (!step) return;
  e.preventDefault();
  const to = state.modules.indexOf(m) + step;
  if (!state.modules[to] || !isMovable(state.modules[to])) return;
  moveModule(m, to);
  // 描き直すとフォーカスした要素が別のモジュールのものになるので、動かしたモジュールのつかみにフォーカスし直す
  setTimeout(() => document.querySelector<HTMLElement>(`.module-grip[data-id="${m.id}"]`)?.focus(), 0);
}

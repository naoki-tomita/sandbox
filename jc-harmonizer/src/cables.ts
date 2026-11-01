// パッチケーブルの描画とドラッグ操作。
// zheleznaya は <svg> の子要素を SVG として作れないので (https://github.com/naoki-tomita/zheleznaya/issues/20)、
// 子を持たない要素を ref で受け取り、その中に SVG を直接 DOM で描く。

import { state, onUpdate, type Cable } from "./state";
import { addCable, canPatch, nextColor, removeCable } from "./patchbay";

const SVG = "http://www.w3.org/2000/svg";
type Point = [number, number];
type JackDir = "in" | "out";

let wrap: HTMLElement | null = null;
let svg: SVGSVGElement | null = null;
const shapes = new Map<Cable, SVGGElement>();

// 重さで垂れ下がるケーブル。長いほど深く垂れる。
function sagPath([x1, y1]: Point, [x2, y2]: Point) {
  const sag = 24 + Math.hypot(x2 - x1, y2 - y1) * 0.3;
  return `M${x1} ${y1} C${x1} ${y1 + sag} ${x2} ${y2 + sag} ${x2} ${y2}`;
}

function shapeTo(g: SVGGElement, a: Point, b: Point) {
  const d = sagPath(a, b);
  g.querySelectorAll("path").forEach((p) => p.setAttribute("d", d));
  const [p1, p2] = g.querySelectorAll("circle");
  p1.setAttribute("cx", String(a[0]));
  p1.setAttribute("cy", String(a[1]));
  p2.setAttribute("cx", String(b[0]));
  p2.setAttribute("cy", String(b[1]));
}

function cableShape(color: string) {
  const g = document.createElementNS(SVG, "g");
  g.setAttribute("class", "cable");
  g.style.setProperty("--c", color);
  for (const cls of ["cable-shadow", "cable-wire"]) {
    const path = document.createElementNS(SVG, "path");
    path.setAttribute("class", cls);
    g.append(path);
  }
  for (let i = 0; i < 2; i++) {
    const plug = document.createElementNS(SVG, "circle");
    plug.setAttribute("class", "cable-plug");
    plug.setAttribute("r", "7");
    g.append(plug);
  }
  svg!.append(g);
  return g;
}

// ジャックがまだ描画されていなければ null
function jackCenter(id: number, dir: JackDir): Point | null {
  const jack = wrap?.querySelector(`.jack[data-id="${id}"][data-dir="${dir}"]`);
  if (!wrap || !jack) return null;
  const r = jack.getBoundingClientRect();
  const base = wrap.getBoundingClientRect();
  return [r.left + r.width / 2 - base.left, r.top + r.height / 2 - base.top];
}

// state.cables に合わせて SVG を作り直す
function redraw() {
  if (!svg) return;
  for (const [c, g] of shapes) {
    if (!state.cables.includes(c)) {
      g.remove();
      shapes.delete(c);
    }
  }
  for (const c of state.cables) {
    const a = jackCenter(c.from, "out");
    const b = jackCenter(c.to, "in");
    if (!a || !b) continue;
    let g = shapes.get(c);
    if (!g) shapes.set(c, (g = cableShape(c.color)));
    shapeTo(g, a, b);
  }
}

onUpdate(redraw);
addEventListener("resize", redraw);
document.fonts?.ready.then(redraw);
const resizes = new ResizeObserver(redraw);
// モジュールの出し入れで DOM が組み変わったら描き直す。
// SVG の中の変化は無視する (自分の描き直しで無限に呼ばれないように)。
const mutations = new MutationObserver((records) => {
  if (records.some((r) => !svg?.contains(r.target))) redraw();
});

// ラック全体 (ケーブルの座標の基準) を受け取る
export function attachRack(el: HTMLElement) {
  wrap = el;
  resizes.observe(el);
  mutations.observe(el, { childList: true, subtree: true });
}

// ケーブルを描く場所を受け取る
export function attachCableLayer(host: HTMLElement) {
  svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("class", "cables");
  svg.setAttribute("aria-hidden", "true");
  host.append(svg);
  shapes.clear();
  redraw();
}

// ---- ドラッグ操作 ----
// ジャックからドラッグしてケーブルを引く。つながっている IN ジャックからドラッグすると、
// 刺さっているケーブルを抜いて別のジャックへ挿し替えられ、ジャック以外で離すと外れる。
let patching: { fixed: { id: number; dir: JackDir }; color: string; pointerId: number; g: SVGGElement } | null = null;

const pointerIn = (e: PointerEvent): Point => {
  const base = wrap!.getBoundingClientRect();
  return [e.clientX - base.left, e.clientY - base.top];
};

export function onPatchStart(e: PointerEvent) {
  const jack = (e.target as Element).closest<HTMLElement>(".jack");
  if (!jack || !svg) return;
  e.preventDefault();
  let fixed = { id: Number(jack.dataset.id), dir: jack.dataset.dir as JackDir };
  let color = nextColor();
  if (fixed.dir === "in") {
    const plugged = state.cables.findLast((c) => c.to === fixed.id);
    if (plugged) {
      removeCable(plugged);
      fixed = { id: plugged.from, dir: "out" };
      color = plugged.color;
    }
  }
  wrap!.setPointerCapture(e.pointerId);
  patching = { fixed, color, pointerId: e.pointerId, g: cableShape(color) };
  wrap!.classList.add("is-patching");
  const start = jackCenter(fixed.id, fixed.dir);
  if (start) shapeTo(patching.g, start, pointerIn(e));
}

export function onPatchMove(e: PointerEvent) {
  if (!patching || e.pointerId !== patching.pointerId) return;
  const a = jackCenter(patching.fixed.id, patching.fixed.dir);
  if (!a) return;
  const b = pointerIn(e);
  // OUT から引くときは OUT 側を始点に、IN から引くときは IN 側を終点にして垂れ方をそろえる
  patching.fixed.dir === "out" ? shapeTo(patching.g, a, b) : shapeTo(patching.g, b, a);
}

export function onPatchEnd(e: PointerEvent) {
  if (!patching || e.pointerId !== patching.pointerId) return;
  const { fixed, color, g } = patching;
  patching = null;
  g.remove();
  wrap!.classList.remove("is-patching");
  const target = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>(".jack");
  if (!target || target.dataset.dir === fixed.dir) return;
  const other = Number(target.dataset.id);
  const [out, inn] = fixed.dir === "out" ? [fixed.id, other] : [other, fixed.id];
  if (canPatch(out, inn)) addCable(out, inn, color);
}

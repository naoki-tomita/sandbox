// ラックに並ぶモジュールと、それをつなぐパッチケーブル。
// ケーブルのとおりに各モジュールの output を次の input へ connect する。

import { el, button } from "./dom";

const CABLE_COLORS = ["#F26B1D", "#1FA3C7", "#F5C518", "#D9417A", "#6BBF59"];
const SVG = "http://www.w3.org/2000/svg";

type Point = [number, number];
type JackDir = "in" | "out";

export interface Module {
  id: number;
  name: string;
  input: AudioNode | null;
  output: AudioNode | null;
  el: HTMLElement;
  body: HTMLElement;
  onRemove: (() => void) | null;
}

export interface ModuleOptions {
  name: string;
  sub: string;
  // パネル上部の色帯 (音の流れの中での役割)
  role: "source" | "voice" | "fx" | "sink";
  width?: "narrow" | "normal" | "wide";
  input?: AudioNode | null;
  output?: AudioNode | null;
  removable?: boolean;
  before?: Node | null;
}

interface Cable {
  from: number;
  to: number;
  color: string;
  g: SVGGElement;
}

export type Rack = ReturnType<typeof createRack>;

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

export function createRack(rackEl: HTMLElement, cableLayer: SVGSVGElement) {
  const modules = new Map<number, Module>();
  const cables: Cable[] = [];
  let nextId = 1;
  let colorTurn = 0;
  const nextColor = () => CABLE_COLORS[colorTurn++ % CABLE_COLORS.length];
  const resizes = new ResizeObserver(() => redraw());
  resizes.observe(rackEl);

  // ---- モジュール ----

  function makeModule({ name, sub, role, width = "normal", input = null, output = null, removable = false, before = null }: ModuleOptions): Module {
    const id = nextId++;
    const root = el("section", `module module--${width}`);
    root.dataset.role = role;
    root.setAttribute("aria-label", name);
    const head = el("header", "module-head");
    head.append(el("h2", "module-name", name), el("span", "module-sub", sub));
    root.append(head);
    const body = el("div", "module-body");
    root.append(body);
    const foot = el("div", "jacks");
    for (const [dir, node] of [["in", input], ["out", output]] as const) {
      if (!node) continue;
      const wrap = el("span", "jack-wrap");
      const jack = button("jack", "", null);
      jack.dataset.id = String(id);
      jack.dataset.dir = dir;
      jack.setAttribute("aria-label", `${name} ${dir.toUpperCase()}`);
      wrap.append(jack, el("span", `jack-label jack-label--${dir}`, dir.toUpperCase()));
      foot.append(wrap);
    }
    root.append(foot);
    const module: Module = { id, name, input, output, el: root, body, onRemove: null };
    if (removable) head.append(button("module-remove", "外す", () => removeModule(module)));
    rackEl.insertBefore(root, before);
    modules.set(id, module);
    resizes.observe(root);
    return module;
  }

  function removeModule(m: Module) {
    const ins = cables.filter((c) => c.to === m.id);
    const outs = cables.filter((c) => c.from === m.id);
    for (const c of [...ins, ...outs]) removeCable(c, false);
    // 1 本ずつつながっていたモジュールを抜いたら、前後をつなぎ直して音を途切れさせない
    if (ins.length === 1 && outs.length === 1) addCable(ins[0].from, outs[0].to, ins[0].color, false);
    m.output && m.output.disconnect();
    m.onRemove && m.onRemove();
    modules.delete(m.id);
    resizes.unobserve(m.el);
    m.el.remove();
    applyGraph();
  }

  // ---- ケーブル ----

  function applyGraph() {
    for (const m of modules.values()) m.output && m.output.disconnect();
    for (const c of cables) modules.get(c.from)!.output!.connect(modules.get(c.to)!.input!);
  }

  function jackCenter(id: number, dir: JackDir): Point {
    const jack = rackEl.querySelector(`.jack[data-id="${id}"][data-dir="${dir}"]`)!;
    const r = jack.getBoundingClientRect();
    const base = rackEl.getBoundingClientRect();
    return [r.left + r.width / 2 - base.left, r.top + r.height / 2 - base.top];
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
    cableLayer.append(g);
    return g;
  }

  function redraw() {
    for (const c of cables) shapeTo(c.g, jackCenter(c.from, "out"), jackCenter(c.to, "in"));
  }

  function addCable(from: number, to: number, color = nextColor(), apply = true) {
    const c: Cable = { from, to, color, g: cableShape(color) };
    cables.push(c);
    shapeTo(c.g, jackCenter(from, "out"), jackCenter(to, "in"));
    if (apply) applyGraph();
    return c;
  }

  function removeCable(c: Cable, apply = true) {
    cables.splice(cables.indexOf(c), 1);
    c.g.remove();
    if (apply) applyGraph();
  }

  // from から to へケーブルをたどって行けるか (ループ防止)
  function reaches(from: number, to: number) {
    const seen = new Set<number>();
    const walk = (id: number): boolean => id === to || (!seen.has(id) && (seen.add(id), cables.some((c) => c.from === id && walk(c.to))));
    return walk(from);
  }

  function canPatch(out: number, inn: number) {
    return out !== inn && !cables.some((c) => c.from === out && c.to === inn) && !reaches(inn, out);
  }

  // target へ 1 本だけつながっているなら、そのケーブルの間に m を差し込む
  function insertBefore(m: Module, target: Module) {
    const into = cables.filter((c) => c.to === target.id);
    if (into.length !== 1) return;
    const [c] = into;
    removeCable(c, false);
    addCable(c.from, m.id, c.color, false);
    addCable(m.id, target.id, undefined, false);
    applyGraph();
  }

  // ---- パッチ操作 ----
  // ジャックからドラッグしてケーブルを引く。つながっている IN ジャックからドラッグすると、
  // 刺さっているケーブルを抜いて別のジャックへ挿し替えられ、ジャック以外で離すと外れる。
  let patching: { fixed: { id: number; dir: JackDir }; color: string; pointerId: number; g: SVGGElement } | null = null;
  const pointerIn = (e: PointerEvent): Point => {
    const base = rackEl.getBoundingClientRect();
    return [e.clientX - base.left, e.clientY - base.top];
  };
  rackEl.addEventListener("pointerdown", (e) => {
    const jack = (e.target as Element).closest<HTMLElement>(".jack");
    if (!jack) return;
    e.preventDefault();
    let fixed = { id: Number(jack.dataset.id), dir: jack.dataset.dir as JackDir };
    let color = nextColor();
    if (fixed.dir === "in") {
      const plugged = cables.findLast((c) => c.to === fixed.id);
      if (plugged) {
        removeCable(plugged);
        fixed = { id: plugged.from, dir: "out" as JackDir };
        color = plugged.color;
      }
    }
    rackEl.setPointerCapture(e.pointerId);
    patching = { fixed, color, pointerId: e.pointerId, g: cableShape(color) };
    patching.g.classList.add("cable--live");
    rackEl.classList.add("is-patching");
    shapeTo(patching.g, jackCenter(fixed.id, fixed.dir), pointerIn(e));
  });
  rackEl.addEventListener("pointermove", (e) => {
    if (!patching || e.pointerId !== patching.pointerId) return;
    const a = jackCenter(patching.fixed.id, patching.fixed.dir);
    const b = pointerIn(e);
    // OUT から引くときは OUT 側を始点に、IN から引くときは IN 側を終点にして垂れ方をそろえる
    patching.fixed.dir === "out" ? shapeTo(patching.g, a, b) : shapeTo(patching.g, b, a);
  });
  const finishPatch = (e: PointerEvent) => {
    if (!patching || e.pointerId !== patching.pointerId) return;
    const { fixed, color, g } = patching;
    patching = null;
    g.remove();
    rackEl.classList.remove("is-patching");
    const target = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>(".jack");
    if (!target || target.dataset.dir === fixed.dir) return;
    const other = Number(target.dataset.id);
    const [out, inn] = fixed.dir === "out" ? [fixed.id, other] : [other, fixed.id];
    if (canPatch(out, inn)) addCable(out, inn, color);
  };
  rackEl.addEventListener("pointerup", finishPatch);
  rackEl.addEventListener("pointercancel", finishPatch);

  addEventListener("resize", redraw);
  document.fonts?.ready.then(redraw);

  return { makeModule, addCable, insertBefore, redraw };
}

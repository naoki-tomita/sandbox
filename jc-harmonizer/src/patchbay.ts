// モジュールとパッチケーブルの出し入れ。ケーブルのとおりに各モジュールの output を次の input へ connect する。

import { relayout, state, update, type Cable, type ModuleState } from "./state";

const CABLE_COLORS = ["#F26B1D", "#1FA3C7", "#F5C518", "#D9417A", "#6BBF59"];
let colorTurn = 0;
export const nextColor = () => CABLE_COLORS[colorTurn++ % CABLE_COLORS.length];

let nextId = 1;
const byId = (id: number) => state.modules.find((m) => m.id === id)!;

function applyGraph() {
  for (const m of state.modules) m.output?.disconnect();
  for (const c of state.cables) byId(c.from).output!.connect(byId(c.to).input!);
}

// before を指定するとその手前に、指定しなければ末尾に置く。
// 画面の作り直しはしないので、描画後に呼んだときは一連の操作の最後に relayout() すること
export function addModule(spec: Omit<ModuleState, "id">, before?: ModuleState): ModuleState {
  const m: ModuleState = { ...spec, id: nextId++ };
  const at = before ? state.modules.indexOf(before) : -1;
  if (at < 0) state.modules.push(m);
  else state.modules.splice(at, 0, m);
  return m;
}

export function removeModule(m: ModuleState) {
  const ins = state.cables.filter((c) => c.to === m.id);
  const outs = state.cables.filter((c) => c.from === m.id);
  state.cables = state.cables.filter((c) => c.to !== m.id && c.from !== m.id);
  // 1 本ずつつながっていたモジュールを抜いたら、前後をつなぎ直して音を途切れさせない
  if (ins.length === 1 && outs.length === 1) state.cables.push({ from: ins[0].from, to: outs[0].to, color: ins[0].color });
  m.output?.disconnect();
  m.dispose?.();
  state.modules = state.modules.filter((it) => it !== m);
  applyGraph();
  relayout();
}

export function addCable(from: number, to: number, color = nextColor()) {
  state.cables.push({ from, to, color });
  applyGraph();
  update();
}

export function removeCable(c: Cable) {
  state.cables = state.cables.filter((it) => it !== c);
  applyGraph();
  update();
}

// from から to へケーブルをたどって行けるか (ループ防止)
function reaches(from: number, to: number) {
  const seen = new Set<number>();
  const walk = (id: number): boolean =>
    id === to || (!seen.has(id) && (seen.add(id), state.cables.some((c) => c.from === id && walk(c.to))));
  return walk(from);
}

export function canPatch(out: number, inn: number) {
  return out !== inn && !state.cables.some((c) => c.from === out && c.to === inn) && !reaches(inn, out);
}

// target へ 1 本だけつながっているなら、そのケーブルの間に m を差し込む
export function insertBefore(m: ModuleState, target: ModuleState) {
  const into = state.cables.filter((c) => c.to === target.id);
  if (into.length !== 1) return;
  const [c] = into;
  state.cables = state.cables.filter((it) => it !== c);
  state.cables.push({ from: c.from, to: m.id, color: c.color }, { from: m.id, to: target.id, color: nextColor() });
  applyGraph();
}

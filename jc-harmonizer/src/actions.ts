// 画面からの操作: 電源、ノートオン / オフ、エフェクトの追加、自作コードの保存。

import { ctx, harmonizer, latencyMs, micLevelDb, startMic } from "./audio";
import { blinkMidi, showLevel } from "./display";
import { EFFECTS, type Effect } from "./effects";
import { startMidi } from "./midi";
import { addModule, insertBefore } from "./patchbay";
import { loadPresets, savePreset } from "./presets";
import { relayout, state, update, type ModuleState } from "./state";

// ---- ノート ----
export function noteOn(note: number, velocity: number) {
  state.held.add(note);
  harmonizer.port.postMessage({ type: "noteOn", note, velocity });
  update();
}

export function noteOff(note: number) {
  state.held.delete(note);
  harmonizer.port.postMessage({ type: "noteOff", note });
  update();
}

// ---- 電源 ----
export async function powerOn() {
  if (state.power) return;
  try {
    await startMic();
  } catch (e) {
    state.status = `マイクを使えません: ${(e as Error).message}`;
    update();
    return;
  }
  state.power = true;
  state.status = `ON ${(ctx.sampleRate / 1000).toFixed(1)}kHz`;
  const showLatency = () => {
    state.latency = `${latencyMs().toFixed(1)}ms`;
    update();
  };
  showLatency();
  setInterval(showLatency, 1000);
  const tick = () => {
    showLevel(micLevelDb());
    requestAnimationFrame(tick);
  };
  tick();
  startMidi({
    onNoteOn: noteOn,
    onNoteOff: noteOff,
    onActivity: blinkMidi,
    onStatus: (text) => {
      state.midiName = text;
      update();
    },
  });
}

// ---- エフェクト ----
// エフェクトを ON/OFF できるように in/out のゲインで包む (OFF のときは素通し)
function bypassable(fx: Effect) {
  const input = ctx.createGain();
  const output = ctx.createGain();
  let on = true;
  const route = () => {
    input.disconnect();
    fx.output.disconnect();
    if (on) {
      input.connect(fx.input);
      fx.output.connect(output);
    } else {
      input.connect(output);
    }
  };
  route();
  return { input, output, setOn: (v: boolean) => ((on = v), route()) };
}

// ADD MODULE の選択肢: 内蔵エフェクトと、保存した自作コード
export function moduleOptions() {
  return [
    ...Object.entries(EFFECTS).map(([key, def]) => ({ value: key, label: `${def.name} — ${def.label}` })),
    ...state.presetNames.map((name) => ({ value: `preset:${name}`, label: `CODE: ${name}` })),
  ];
}

export function refreshPresets() {
  state.presetNames = Object.keys(loadPresets());
  update();
}

// value は moduleOptions() の値。作ったモジュールは OUTPUT の手前に差し込む。
export function addEffect(value: string) {
  let type = value;
  let opts: { source?: string } = {};
  let title: string | undefined;
  if (value.startsWith("preset:")) {
    title = value.slice(7);
    type = "code";
    opts = { source: loadPresets()[title] };
  }
  const def = EFFECTS[type];
  const fx = def.create(ctx, opts);
  const io = bypassable(fx);
  const output = state.modules.find((m) => m.kind === "output")!;
  const m = addModule(
    {
      kind: "fx",
      name: title || def.name,
      sub: def.label,
      role: "fx",
      width: fx.code ? "wide" : "normal",
      input: io.input,
      output: io.output,
      removable: true,
      on: true,
      params: fx.params,
      code: fx.code ? { source: fx.code.source, result: "", isError: false, apply: (src) => fx.code!.apply(src) } : null,
      setOn: io.setOn,
      dispose() {
        io.input.disconnect();
        fx.output.disconnect();
        fx.dispose();
      },
    },
    output,
  );
  if (fx.code) {
    fx.code.onResult = (error) => {
      m.code!.result = error ? `ERR 素通し中: ${error}` : "OK 適用しました";
      m.code!.isError = !!error;
      update();
    };
  }
  insertBefore(m, output);
  relayout();
}

export function toggleModule(m: ModuleState) {
  m.on = !m.on;
  m.setOn?.(m.on);
  update();
}

export function savePresetOf(m: ModuleState) {
  const name = prompt("保存する名前", m.name === "CODE" ? "" : m.name);
  if (!name) return;
  savePreset(name, m.code!.source);
  m.name = name;
  refreshPresets();
}

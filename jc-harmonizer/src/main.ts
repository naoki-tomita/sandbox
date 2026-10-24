// JC HARMONIZER の起動。音声の準備、固定モジュール (MIC / HARMONIZER / OUTPUT) の配置、
// 鍵盤・MIDI・電源の結線をする。各部品の中身は同じフォルダの各ファイルにある。

import { $, el } from "./dom";
import { noteName, nearestNote } from "./notes";
import { knob, lcd, meter } from "./widgets";
import { createRack } from "./rack";
import { addEffectModule, moduleOptions } from "./effect-module";
import { createKeyboard, bindPcKeys } from "./keyboard";
import { startMidi } from "./midi";
// AudioWorklet は Vite に単体のスクリプトとしてビルドさせ、その URL を addModule に渡す
import harmonizerUrl from "../worklets/harmonizer?worker&url";
import codeEffectUrl from "../worklets/code-effect?worker&url";

// ---- 音声 ----
// AudioContext はページを開いた時点で作り (停止状態)、POWER で動かす。
// こうしておくと、マイクを許可する前からモジュールを並べてつないでおける。
const ctx = new AudioContext({ latencyHint: 0 });
await ctx.audioWorklet.addModule(harmonizerUrl);
await ctx.audioWorklet.addModule(codeEffectUrl);
const harmonizer = new AudioWorkletNode(ctx, "harmonizer", { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] });
const micBus = ctx.createGain();
const micMeter = ctx.createAnalyser();
micMeter.fftSize = 1024;
const master = ctx.createGain();
master.connect(ctx.destination);
let dry = 0, wet = 1;
const sendMix = () => harmonizer.port.postMessage({ type: "params", dry, wet });

// ---- 固定モジュール ----
const rack = createRack($("rack"), document.getElementById("cables") as unknown as SVGSVGElement);
const addPanel = $("add-panel");

const mic = rack.makeModule({ name: "MIC", sub: "マイク入力", role: "source", width: "narrow", output: micBus, before: addPanel });
const level = meter(10);
mic.body.append(el("span", "panel-caption", "LEVEL"), level.el);

const voice = rack.makeModule({ name: "HARMONIZER", sub: "鍵盤の音程で声を鳴らす", role: "voice", input: harmonizer, output: harmonizer, before: addPanel });
const voiceLcd = lcd(2);
const mixKnobs = el("div", "knobs");
mixKnobs.append(
  knob({ label: "DRY", min: 0, max: 1, step: 0.01, value: 0, set: (v) => ((dry = v), sendMix()) }),
  knob({ label: "WET", min: 0, max: 1, step: 0.01, value: 1, set: (v) => ((wet = v), sendMix()) }),
);
voice.body.append(voiceLcd.screen, mixKnobs);
harmonizer.port.onmessage = (e: MessageEvent<{ type: string; hz: number }>) => {
  if (e.data.type !== "pitch") return;
  const hz = e.data.hz;
  voiceLcd.rows[0].textContent = hz ? `IN ${noteName(nearestNote(hz))} ${hz.toFixed(1)}Hz` : "IN —";
};

const output = rack.makeModule({ name: "OUTPUT", sub: "イヤホン / スピーカーへ", role: "sink", width: "narrow", input: master, before: addPanel });
const outLcd = lcd(1);
output.body.append(
  knob({ label: "VOLUME", min: 0, max: 1.5, step: 0.01, value: 1, set: (v) => (master.gain.value = v) }),
  el("span", "panel-caption", "LATENCY"),
  outLcd.screen,
);

rack.addCable(mic.id, voice.id);
rack.addCable(voice.id, output.id);

// ---- エフェクトの追加 ----
const fillModuleTypes = () => $<HTMLSelectElement>("module-type").replaceChildren(...moduleOptions());
fillModuleTypes();
$("add-module").onclick = () =>
  addEffectModule({ ctx, rack, value: $<HTMLSelectElement>("module-type").value, outputModule: output, onPresetSaved: fillModuleTypes });

// ---- 鍵盤と MIDI ----
const held = new Set<number>();
function showNotes() {
  voiceLcd.rows[1].textContent = held.size ? [...held].sort((a, b) => a - b).map(noteName).join(" ") : "NOTE —";
}
function noteOn(note: number, velocity: number) {
  held.add(note);
  keyboard.show(note, true);
  harmonizer.port.postMessage({ type: "noteOn", note, velocity });
  showNotes();
}
function noteOff(note: number) {
  held.delete(note);
  keyboard.show(note, false);
  harmonizer.port.postMessage({ type: "noteOff", note });
  showNotes();
}
const keyboard = createKeyboard({
  keybed: $("keyboard"),
  rangeLabel: $("range"),
  octDown: $<HTMLButtonElement>("oct-down"),
  octUp: $<HTMLButtonElement>("oct-up"),
  onNoteOn: noteOn,
  onNoteOff: noteOff,
});
bindPcKeys({ onNoteOn: noteOn, onNoteOff: noteOff, isHeld: (note) => held.has(note) });
showNotes();

const midiLed = $("midi-led");
let midiBlink: ReturnType<typeof setTimeout> | undefined;
const midiActivity = () => {
  midiLed.classList.add("is-lit");
  clearTimeout(midiBlink);
  midiBlink = setTimeout(() => midiLed.classList.remove("is-lit"), 80);
};

// ---- 電源 ----
const status = $("status");
status.textContent = "STANDBY";
$("power").onclick = async () => {
  const power = $("power");
  if (power.getAttribute("aria-pressed") === "true") return;
  // iOS Safari はユーザー操作の中で resume しないと音が出ない
  ctx.resume();
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      // latency は TypeScript の型定義に無いので、型を広げて渡す
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1, latency: 0 } as MediaTrackConstraints,
    });
  } catch (e) {
    status.textContent = `マイクを使えません: ${(e as Error).message}`;
    return;
  }
  const source = ctx.createMediaStreamSource(stream);
  source.connect(micBus);
  source.connect(micMeter);
  power.setAttribute("aria-pressed", "true");
  status.textContent = `ON ${(ctx.sampleRate / 1000).toFixed(1)}kHz`;

  const showLatency = () => {
    const ms = (ctx.baseLatency + (ctx.outputLatency || 0)) * 1000;
    outLcd.rows[0].textContent = `${ms.toFixed(1)}ms`;
  };
  showLatency();
  setInterval(showLatency, 1000);

  const samples = new Float32Array(micMeter.fftSize);
  const tick = () => {
    micMeter.getFloatTimeDomainData(samples);
    let sum = 0;
    for (const s of samples) sum += s * s;
    level.show(20 * Math.log10(Math.sqrt(sum / samples.length) + 1e-9));
    requestAnimationFrame(tick);
  };
  tick();
  startMidi({
    onNoteOn: noteOn,
    onNoteOff: noteOff,
    onActivity: midiActivity,
    onStatus: (text) => ($("midi-name").textContent = text),
  });
};

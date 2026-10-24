// JC HARMONIZER の画面と音声グラフ。
// モジュール (マイク / ハーモナイザー / エフェクト / 出力) をラックに並べ、
// ジャック同士をつないだケーブルのとおりに Web Audio のノードを接続する。

const $ = (id) => document.getElementById(id);
const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const noteName = (n) => NAMES[n % 12] + (Math.floor(n / 12) - 1);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}
const button = (className, text, onclick) => Object.assign(el("button", className, text), { type: "button", onclick });

// ---- 音声 ----------------------------------------------------------------
// AudioContext はページを開いた時点で作り (停止状態)、POWER で動かす。
// こうしておくと、マイクを許可する前からモジュールを並べてつないでおける。
const ctx = new AudioContext({ latencyHint: 0 });
await ctx.audioWorklet.addModule("harmonizer-worklet.js");
await ctx.audioWorklet.addModule("code-effect-worklet.js");
const harmonizer = new AudioWorkletNode(ctx, "harmonizer", { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] });
const micBus = ctx.createGain();
const micMeter = ctx.createAnalyser();
micMeter.fftSize = 1024;
const master = ctx.createGain();
master.connect(ctx.destination);
let dry = 0, wet = 1;
const sendMix = () => harmonizer.port.postMessage({ type: "params", dry, wet });

// ---- ノブ ----------------------------------------------------------------
// 上下ドラッグで回す (Shift で細かく)。矢印キーでも動き、ダブルクリックで初期値に戻る。
function knob({ label, min, max, step, value, unit = "", set }) {
  const initial = value;
  const decimals = step >= 1 ? 0 : Math.ceil(-Math.log10(step));
  const root = el("div", "knob");
  const dial = el("div", "dial");
  dial.tabIndex = 0;
  dial.setAttribute("role", "slider");
  dial.setAttribute("aria-label", label);
  dial.setAttribute("aria-valuemin", min);
  dial.setAttribute("aria-valuemax", max);
  const readout = el("span", "knob-value");
  root.append(el("span", "knob-label", label), dial, readout);

  const update = (v) => {
    value = clamp(Math.round(v / step) * step, min, max);
    const text = value.toFixed(decimals) + unit;
    dial.style.setProperty("--turn", `${((value - min) / (max - min)) * 270 - 135}deg`);
    dial.setAttribute("aria-valuenow", value);
    dial.setAttribute("aria-valuetext", text);
    readout.textContent = text;
    set(value);
  };
  update(value);

  let drag = null;
  dial.addEventListener("pointerdown", (e) => {
    dial.setPointerCapture(e.pointerId);
    drag = { y: e.clientY, value };
  });
  dial.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const range = (max - min) * (e.shiftKey ? 0.2 : 1);
    update(drag.value + ((drag.y - e.clientY) / 160) * range);
  });
  const end = () => (drag = null);
  dial.addEventListener("pointerup", end);
  dial.addEventListener("pointercancel", end);
  dial.addEventListener("dblclick", () => update(initial));
  dial.addEventListener("keydown", (e) => {
    const big = (max - min) / 10;
    const moves = { ArrowUp: step, ArrowRight: step, ArrowDown: -step, ArrowLeft: -step, PageUp: big, PageDown: -big };
    if (e.key in moves) update(value + moves[e.key] * (e.shiftKey ? 10 : 1));
    else if (e.key === "Home") update(min);
    else if (e.key === "End") update(max);
    else return;
    e.preventDefault();
  });
  return root;
}

function lcd(lines = 1) {
  const screen = el("div", "lcd");
  const rows = Array.from({ length: lines }, () => screen.appendChild(el("div", "lcd-row", "—")));
  return { screen, rows };
}

// ---- ラックとモジュール ------------------------------------------------------
const rack = $("rack");
const cableLayer = $("cables");
const modules = new Map(); // id -> { id, name, input, output, el, onRemove }
let nextId = 1;
const resizes = new ResizeObserver(() => redrawCables());
resizes.observe(rack);

// role はパネル上部の色帯 (音の流れの中での役割) になる
function makeModule({ name, sub, role, width = "normal", input = null, output = null, removable = false, before = null }) {
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
  for (const [dir, node] of [["in", input], ["out", output]]) {
    if (!node) continue;
    const wrap = el("span", "jack-wrap");
    const jack = button("jack", "", null);
    jack.dataset.id = id;
    jack.dataset.dir = dir;
    jack.setAttribute("aria-label", `${name} ${dir.toUpperCase()}`);
    wrap.append(jack, el("span", `jack-label jack-label--${dir}`, dir.toUpperCase()));
    foot.append(wrap);
  }
  root.append(foot);
  const module = { id, name, input, output, el: root, body, onRemove: null };
  if (removable) head.append(button("module-remove", "外す", () => removeModule(module)));
  rack.insertBefore(root, before);
  modules.set(id, module);
  resizes.observe(root);
  return module;
}

function removeModule(m) {
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

// ---- ケーブル --------------------------------------------------------------
const CABLE_COLORS = ["#F26B1D", "#1FA3C7", "#F5C518", "#D9417A", "#6BBF59"];
let colorTurn = 0;
const nextColor = () => CABLE_COLORS[colorTurn++ % CABLE_COLORS.length];
const cables = []; // { from, to, color, g }
const SVG = "http://www.w3.org/2000/svg";

function applyGraph() {
  for (const m of modules.values()) m.output && m.output.disconnect();
  for (const c of cables) modules.get(c.from).output.connect(modules.get(c.to).input);
}

function jackCenter(id, dir) {
  const jack = rack.querySelector(`.jack[data-id="${id}"][data-dir="${dir}"]`);
  const r = jack.getBoundingClientRect();
  const base = rack.getBoundingClientRect();
  return [r.left + r.width / 2 - base.left, r.top + r.height / 2 - base.top];
}

// 重さで垂れ下がるケーブル。長いほど深く垂れる。
function sagPath([x1, y1], [x2, y2]) {
  const sag = 24 + Math.hypot(x2 - x1, y2 - y1) * 0.3;
  return `M${x1} ${y1} C${x1} ${y1 + sag} ${x2} ${y2 + sag} ${x2} ${y2}`;
}

function cableShape(color) {
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
    plug.setAttribute("r", 7);
    g.append(plug);
  }
  cableLayer.append(g);
  return g;
}

function shapeTo(g, a, b) {
  const d = sagPath(a, b);
  g.querySelectorAll("path").forEach((p) => p.setAttribute("d", d));
  const [p1, p2] = g.querySelectorAll("circle");
  p1.setAttribute("cx", a[0]);
  p1.setAttribute("cy", a[1]);
  p2.setAttribute("cx", b[0]);
  p2.setAttribute("cy", b[1]);
}

function redrawCables() {
  for (const c of cables) shapeTo(c.g, jackCenter(c.from, "out"), jackCenter(c.to, "in"));
}

function addCable(from, to, color = nextColor(), apply = true) {
  const c = { from, to, color, g: cableShape(color) };
  cables.push(c);
  shapeTo(c.g, jackCenter(from, "out"), jackCenter(to, "in"));
  if (apply) applyGraph();
  return c;
}

function removeCable(c, apply = true) {
  cables.splice(cables.indexOf(c), 1);
  c.g.remove();
  if (apply) applyGraph();
}

// from から to へケーブルをたどって行けるか (ループ防止)
function reaches(from, to) {
  const seen = new Set();
  const walk = (id) => id === to || (!seen.has(id) && (seen.add(id), cables.some((c) => c.from === id && walk(c.to))));
  return walk(from);
}

function canPatch(out, inn) {
  return out !== inn && !cables.some((c) => c.from === out && c.to === inn) && !reaches(inn, out);
}

// ジャックからドラッグしてケーブルを引く。つながっている IN ジャックからドラッグすると、
// 刺さっているケーブルを抜いて別のジャックへ挿し替えられ、ジャック以外で離すと外れる。
let patching = null;
const pointerIn = (e) => {
  const base = rack.getBoundingClientRect();
  return [e.clientX - base.left, e.clientY - base.top];
};
rack.addEventListener("pointerdown", (e) => {
  const jack = e.target.closest(".jack");
  if (!jack) return;
  e.preventDefault();
  let fixed = { id: +jack.dataset.id, dir: jack.dataset.dir };
  let color = nextColor();
  if (fixed.dir === "in") {
    const plugged = cables.findLast((c) => c.to === fixed.id);
    if (plugged) {
      removeCable(plugged);
      fixed = { id: plugged.from, dir: "out" };
      color = plugged.color;
    }
  }
  rack.setPointerCapture(e.pointerId);
  patching = { fixed, color, pointerId: e.pointerId, g: cableShape(color) };
  patching.g.classList.add("cable--live");
  rack.classList.add("is-patching");
  shapeTo(patching.g, jackCenter(fixed.id, fixed.dir), pointerIn(e));
});
rack.addEventListener("pointermove", (e) => {
  if (!patching || e.pointerId !== patching.pointerId) return;
  const a = jackCenter(patching.fixed.id, patching.fixed.dir);
  const b = pointerIn(e);
  // OUT から引くときは OUT 側を始点に、IN から引くときは IN 側を終点にして垂れ方をそろえる
  patching.fixed.dir === "out" ? shapeTo(patching.g, a, b) : shapeTo(patching.g, b, a);
});
const finishPatch = (e) => {
  if (!patching || e.pointerId !== patching.pointerId) return;
  const { fixed, color, g } = patching;
  patching = null;
  g.remove();
  rack.classList.remove("is-patching");
  const target = document.elementFromPoint(e.clientX, e.clientY)?.closest(".jack");
  if (!target || target.dataset.dir === fixed.dir) return;
  const other = +target.dataset.id;
  const [out, inn] = fixed.dir === "out" ? [fixed.id, other] : [other, fixed.id];
  if (canPatch(out, inn)) addCable(out, inn, color);
};
rack.addEventListener("pointerup", finishPatch);
rack.addEventListener("pointercancel", finishPatch);

// ---- 固定モジュール ----------------------------------------------------------
const addPanel = $("add-panel");

const mic = makeModule({ name: "MIC", sub: "マイク入力", role: "source", width: "narrow", output: micBus, before: addPanel });
const meter = el("div", "meter");
meter.setAttribute("aria-hidden", "true");
const leds = Array.from({ length: 10 }, (_, i) => meter.appendChild(el("span", i >= 8 ? "seg seg--hot" : "seg")));
mic.body.append(el("span", "panel-caption", "LEVEL"), meter);

const voice = makeModule({ name: "HARMONIZER", sub: "鍵盤の音程で声を鳴らす", role: "voice", input: harmonizer, output: harmonizer, before: addPanel });
const voiceLcd = lcd(2);
const mixKnobs = el("div", "knobs");
mixKnobs.append(
  knob({ label: "DRY", min: 0, max: 1, step: 0.01, value: 0, set: (v) => ((dry = v), sendMix()) }),
  knob({ label: "WET", min: 0, max: 1, step: 0.01, value: 1, set: (v) => ((wet = v), sendMix()) }),
);
voice.body.append(voiceLcd.screen, mixKnobs);
harmonizer.port.onmessage = (e) => {
  if (e.data.type !== "pitch") return;
  const hz = e.data.hz;
  voiceLcd.rows[0].textContent = hz ? `IN ${noteName(Math.round(69 + 12 * Math.log2(hz / 440)))} ${hz.toFixed(1)}Hz` : "IN —";
};

const output = makeModule({ name: "OUTPUT", sub: "イヤホン / スピーカーへ", role: "sink", width: "narrow", input: master, before: addPanel });
const outLcd = lcd(1);
output.body.append(
  knob({ label: "VOLUME", min: 0, max: 1.5, step: 0.01, value: 1, set: (v) => (master.gain.value = v) }),
  el("span", "panel-caption", "LATENCY"),
  outLcd.screen,
);

addCable(mic.id, voice.id);
addCable(voice.id, output.id);

// ---- エフェクトモジュール -------------------------------------------------------
const PRESET_KEY = "jc-harmonizer.codePresets";
function loadPresets() {
  try {
    return JSON.parse(localStorage.getItem(PRESET_KEY)) || {};
  } catch {
    return {};
  }
}
function savePresets(presets) {
  try {
    localStorage.setItem(PRESET_KEY, JSON.stringify(presets));
  } catch {}
}

function fillModuleTypes() {
  const options = Object.entries(EFFECTS).map(([key, def]) => new Option(`${def.name} — ${def.label}`, key));
  for (const name of Object.keys(loadPresets())) options.push(new Option(`CODE: ${name}`, `preset:${name}`));
  $("module-type").replaceChildren(...options);
}

// エフェクトを ON/OFF できるように in/out のゲインで包む (OFF のときは素通し)
function bypassable(fx) {
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
  return { input, output, setOn: (v) => ((on = v), route()) };
}

function addEffect(value) {
  let type = value, opts = {}, title;
  if (value.startsWith("preset:")) {
    title = value.slice(7);
    type = "code";
    opts = { source: loadPresets()[title] };
  }
  const def = EFFECTS[type];
  const fx = def.create(ctx, opts);
  const io = bypassable(fx);
  const m = makeModule({
    name: title || def.name,
    sub: def.label,
    role: "fx",
    width: fx.code ? "wide" : "normal",
    input: io.input,
    output: io.output,
    removable: true,
    before: output.el,
  });
  m.onRemove = () => {
    io.input.disconnect();
    fx.output.disconnect();
    fx.dispose();
  };

  const power = button("switch", "ON", null);
  power.setAttribute("aria-pressed", "true");
  power.prepend(el("span", "led"));
  power.onclick = () => {
    const on = power.getAttribute("aria-pressed") !== "true";
    power.setAttribute("aria-pressed", String(on));
    io.setOn(on);
  };
  m.body.append(power);

  const knobs = el("div", "knobs");
  for (const p of fx.params) knobs.append(knob(p));
  m.body.append(knobs);

  if (fx.code) {
    const screen = el("div", "code-screen");
    const editor = Object.assign(el("textarea", "code"), { value: fx.code.source, spellcheck: false });
    editor.setAttribute("aria-label", `${m.name} のコード`);
    const result = el("div", "code-result", "");
    result.setAttribute("role", "status");
    fx.code.onResult = (error) => {
      result.classList.toggle("is-error", !!error);
      result.textContent = error ? `ERR 素通し中: ${error}` : "OK 適用しました";
    };
    screen.append(editor, result);

    const examples = el("select", "panel-select");
    examples.setAttribute("aria-label", "コード例");
    examples.append(new Option("例を読み込む…", ""), ...Object.keys(CODE_EXAMPLES).map((k) => new Option(k, k)));
    examples.onchange = () => {
      if (examples.value) editor.value = CODE_EXAMPLES[examples.value];
      examples.value = "";
    };
    const save = () => {
      const name = prompt("保存する名前", title || "");
      if (!name) return;
      const presets = loadPresets();
      presets[name] = editor.value;
      savePresets(presets);
      title = name;
      m.el.querySelector(".module-name").textContent = name;
      fillModuleTypes();
    };
    const tools = el("div", "code-tools");
    tools.append(button("key", "適用", () => fx.code.apply(editor.value)), button("key", "保存", save), examples);
    m.body.append(screen, tools);
  }

  // 出力へ 1 本だけつながっているなら、その間に差し込む
  const intoOutput = cables.filter((c) => c.to === output.id);
  if (intoOutput.length === 1) {
    const [c] = intoOutput;
    removeCable(c, false);
    addCable(c.from, m.id, c.color, false);
    addCable(m.id, output.id, undefined, false);
    applyGraph();
  }
  redrawCables();
}

fillModuleTypes();
$("add-module").onclick = () => addEffect($("module-type").value);

// ---- 鍵盤と MIDI ------------------------------------------------------------
const held = new Set();
const keyEls = new Map(); // note -> 画面鍵盤の要素
function showNotes() {
  voiceLcd.rows[1].textContent = held.size ? [...held].sort((a, b) => a - b).map(noteName).join(" ") : "NOTE —";
}
function noteOn(note, velocity) {
  held.add(note);
  keyEls.get(note)?.classList.add("on");
  harmonizer.port.postMessage({ type: "noteOn", note, velocity });
  showNotes();
}
function noteOff(note) {
  held.delete(note);
  keyEls.get(note)?.classList.remove("on");
  harmonizer.port.postMessage({ type: "noteOff", note });
  showNotes();
}
showNotes();

const PC_KEYS = "awsedftgyhujk";
addEventListener("keydown", (e) => {
  const i = PC_KEYS.indexOf(e.key);
  if (i >= 0 && !e.repeat && !e.target.closest("textarea, input, select")) noteOn(60 + i, 100);
});
addEventListener("keyup", (e) => {
  const i = PC_KEYS.indexOf(e.key);
  if (i >= 0 && held.has(60 + i)) noteOff(60 + i);
});

// 2 オクターブの画面鍵盤。マルチタッチで和音、指を滑らせると隣の鍵盤へ移る。
let lowNote = 48;
const pointers = new Map(); // pointerId -> note
const keybed = $("keyboard");
function buildKeyboard() {
  for (const note of pointers.values()) noteOff(note);
  pointers.clear();
  keybed.replaceChildren();
  keyEls.clear();
  const whiteWidth = 100 / 14;
  let white = 0;
  for (let note = lowNote; note < lowNote + 24; note++) {
    const black = NAMES[note % 12].includes("#");
    const key = el("div", `pkey ${black ? "pkey--black" : "pkey--white"}`);
    key.dataset.note = note;
    key.style.left = `${(black ? white - 0.3 : white) * whiteWidth}%`;
    key.style.width = `${(black ? 0.6 : 1) * whiteWidth}%`;
    if (!black) white++;
    if (held.has(note)) key.classList.add("on");
    keybed.append(key);
    keyEls.set(note, key);
  }
  $("range").textContent = `${noteName(lowNote)}–${noteName(lowNote + 23)}`;
}
const noteAt = (x, y) => {
  const key = document.elementFromPoint(x, y);
  return key && key.dataset.note ? +key.dataset.note : null;
};
keybed.addEventListener("pointerdown", (e) => {
  const note = noteAt(e.clientX, e.clientY);
  if (note === null) return;
  keybed.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, note);
  noteOn(note, 100);
});
keybed.addEventListener("pointermove", (e) => {
  if (!pointers.has(e.pointerId)) return;
  const note = noteAt(e.clientX, e.clientY);
  const prev = pointers.get(e.pointerId);
  if (note === null || note === prev) return;
  pointers.set(e.pointerId, note);
  noteOff(prev);
  noteOn(note, 100);
});
const release = (e) => {
  if (!pointers.has(e.pointerId)) return;
  noteOff(pointers.get(e.pointerId));
  pointers.delete(e.pointerId);
};
keybed.addEventListener("pointerup", release);
keybed.addEventListener("pointercancel", release);
$("oct-down").onclick = () => ((lowNote = Math.max(24, lowNote - 12)), buildKeyboard());
$("oct-up").onclick = () => ((lowNote = Math.min(84, lowNote + 12)), buildKeyboard());
buildKeyboard();

const midiLed = $("midi-led");
let midiBlink;
async function startMidi() {
  if (!navigator.requestMIDIAccess) {
    $("midi-name").textContent = "Web MIDI 非対応 — 画面の鍵盤で弾いてください";
    return;
  }
  let access;
  try {
    access = await navigator.requestMIDIAccess();
  } catch (e) {
    $("midi-name").textContent = `MIDI を使えません (${e.message})`;
    return;
  }
  const bind = () => {
    const names = [];
    for (const input of access.inputs.values()) {
      names.push(input.name);
      input.onmidimessage = ({ data }) => {
        const [status, note, velocity] = data;
        const cmd = status & 0xf0;
        if (cmd === 0x90 && velocity > 0) noteOn(note, velocity);
        else if (cmd === 0x80 || (cmd === 0x90 && velocity === 0)) noteOff(note);
        else return;
        midiLed.classList.add("is-lit");
        clearTimeout(midiBlink);
        midiBlink = setTimeout(() => midiLed.classList.remove("is-lit"), 80);
      };
    }
    $("midi-name").textContent = names.join(", ") || "MIDI 機器なし";
  };
  bind();
  access.onstatechange = bind;
}

// ---- 電源 ----------------------------------------------------------------
const status = $("status");
status.textContent = "STANDBY";
$("power").onclick = async () => {
  const power = $("power");
  if (power.getAttribute("aria-pressed") === "true") return;
  // iOS Safari はユーザー操作の中で resume しないと音が出ない
  ctx.resume();
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1, latency: 0 },
    });
  } catch (e) {
    status.textContent = `マイクを使えません: ${e.message}`;
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
    const db = 20 * Math.log10(Math.sqrt(sum / samples.length) + 1e-9);
    const lit = Math.round(clamp((db + 60) / 60, 0, 1) * leds.length);
    leds.forEach((led, i) => led.classList.toggle("is-lit", i < lit));
    requestAnimationFrame(tick);
  };
  tick();
  startMidi();
};

addEventListener("resize", redrawCables);
document.fonts?.ready.then(redrawCables);

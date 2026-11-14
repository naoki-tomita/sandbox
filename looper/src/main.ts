import "@fontsource/dm-mono/400.css";
import "@fontsource/dm-mono/500.css";
import "./style.css";
import { LooperAudio, type Status } from "./audio";
import { PEAK_BUCKET } from "./engine";
import { encodeWav } from "./wav";

interface Track {
  id: number;
  name: string;
  color: string;
  muted: boolean;
  solo: boolean;
  len: number;
  peaks: Float32Array;
  canvas: HTMLCanvasElement | null;
  playhead: HTMLElement | null;
  sub: HTMLElement | null;
  dirty: boolean;
}

const COLORS = ["#d9722f", "#2a8f9c", "#7c5fd0", "#3b9a5f", "#c44d8e", "#b8901c"];
const LATENCY_KEY = "looper.latencyMs";
const MIC_KEY = "looper.mic";
/** 何も録っていないときの、画面の横幅にあたる長さ (秒) */
const MIN_VIEW_SECONDS = 4;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const audio = new LooperAudio();
let started = false;
const tracks: Track[] = [];
let nextId = 1;
let armedId = 0;
let loop = true;
let pos = 0;
let length = 0;
let playing = false;
let recording: number | null = null;
let level = 0;
let viewLen = 1;
/** 手で決めた遅延補正 (ミリ秒)。null ならブラウザの申告から見積もる */
let latencyMs: number | null = (() => {
  const v = Number(localStorage.getItem(LATENCY_KEY) ?? NaN);
  return Number.isFinite(v) ? v : null;
})();
let exportUrl = "";
let exportFile: File | null = null;

const el = {
  time: $("time"),
  total: $("total"),
  state: $("state"),
  ruler: $("ruler"),
  rulerFill: $("ruler-fill"),
  rulerKnob: $("ruler-knob"),
  tracks: $("tracks"),
  meter: $("meter-fill"),
  mic: $<HTMLSelectElement>("mic"),
  micError: $("mic-error"),
  play: $<HTMLButtonElement>("play"),
  playIcon: document.getElementById("play-icon")!,
  rec: $<HTMLButtonElement>("rec"),
  rewind: $<HTMLButtonElement>("rewind"),
  loop: $<HTMLButtonElement>("loop"),
  export: $<HTMLButtonElement>("export"),
  addTrack: $<HTMLButtonElement>("add-track"),
  settings: $<HTMLDialogElement>("settings"),
  exportSheet: $<HTMLDialogElement>("export-sheet"),
  latencyValue: $("latency-value"),
  calibrate: $<HTMLButtonElement>("calibrate"),
  calibrateNote: $("calibrate-note"),
};

const sr = () => (started ? audio.sampleRate : 48000);

function formatTime(samples: number): string {
  const t = Math.floor((samples / sr()) * 10) / 10;
  const m = Math.floor(t / 60);
  return `${m}:${(t - m * 60).toFixed(1).padStart(4, "0")}`;
}

function setText(node: HTMLElement, text: string): void {
  if (node.textContent !== text) node.textContent = text;
}

// ---------- トラック ----------

function addTrack(): void {
  const id = nextId++;
  tracks.push({
    id,
    name: `トラック ${id}`,
    color: COLORS[(id - 1) % COLORS.length],
    muted: false,
    solo: false,
    len: 0,
    peaks: new Float32Array(0),
    canvas: null,
    playhead: null,
    sub: null,
    dirty: true,
  });
  // 追加したトラックをそのまま録音先にする (録音中は録音先を変えない)
  if (recording === null) armedId = id;
  if (started) audio.post({ type: "addTrack", id });
  renderTracks();
}

function removeTrack(id: number): void {
  const i = tracks.findIndex((t) => t.id === id);
  if (i < 0) return;
  const t = tracks[i];
  if (t.len > 0 && !confirm(`${t.name} を削除しますか？ 録音した音は元に戻せません。`)) return;
  tracks.splice(i, 1);
  audio.post({ type: "removeTrack", id });
  if (tracks.length === 0) {
    addTrack();
    return;
  }
  if (armedId === id) armedId = tracks[Math.min(i, tracks.length - 1)].id;
  renderTracks();
}

function renderTracks(): void {
  el.tracks.replaceChildren(
    ...tracks.map((t) => {
      const li = document.createElement("li");
      li.className = "track raised";
      li.dataset.id = String(t.id);
      const armed = t.id === armedId;
      li.innerHTML = `
        <div class="track-head">
          <button class="arm" type="button" role="radio" aria-checked="${armed}" aria-label="${t.name} を録音先にする"></button>
          <div class="track-title">
            <div class="track-name">${t.name}</div>
            <div class="track-sub"></div>
          </div>
          <button class="btn chip mute" type="button" aria-pressed="${t.muted}">ミュート</button>
          <button class="btn chip solo" type="button" aria-pressed="${t.solo}">ソロ</button>
          <button class="btn del" type="button" aria-label="${t.name} を削除"><svg><use href="#i-trash"/></svg></button>
        </div>
        <div class="lane inset"><canvas></canvas><div class="playhead"></div></div>`;
      t.canvas = li.querySelector("canvas");
      t.playhead = li.querySelector(".playhead");
      t.sub = li.querySelector(".track-sub");
      t.dirty = true;
      return li;
    }),
  );
}

el.tracks.addEventListener("click", (e) => {
  const target = e.target as HTMLElement;
  const li = target.closest<HTMLElement>(".track");
  if (!li) return;
  const t = tracks.find((t) => t.id === Number(li.dataset.id));
  if (!t) return;
  if (target.closest(".arm")) {
    if (recording !== null) return;
    armedId = t.id;
    renderTracks();
  } else if (target.closest(".mute") || target.closest(".solo")) {
    if (target.closest(".mute")) t.muted = !t.muted;
    else t.solo = !t.solo;
    audio.post({ type: "setTrack", id: t.id, muted: t.muted, solo: t.solo });
    renderTracks();
  } else if (target.closest(".del")) {
    removeTrack(t.id);
  } else {
    const lane = target.closest<HTMLElement>(".lane");
    if (lane) seekTo(lane, (e as MouseEvent).clientX);
  }
});

function drawTrack(t: Track): void {
  const canvas = t.canvas;
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const w = Math.round(canvas.clientWidth * dpr);
  const h = Math.round(canvas.clientHeight * dpr);
  if (w === 0 || h === 0) return;
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const g = canvas.getContext("2d")!;
  g.clearRect(0, 0, w, h);
  t.dirty = false;
  if (t.len === 0) return;

  const anySolo = tracks.some((x) => x.solo);
  const audible = !t.muted && (!anySolo || t.solo);
  g.fillStyle = recording === t.id ? getComputedStyle(document.body).getPropertyValue("--rec") : t.color;
  g.globalAlpha = audible ? 1 : 0.3;
  const bar = Math.max(1, Math.round(dpr));
  const step = bar * 2;
  const perPx = viewLen / w / PEAK_BUCKET;
  const lastBucket = Math.ceil(t.len / PEAK_BUCKET);
  const mid = h / 2;
  const maxH = h - 12 * dpr;
  for (let x = 0; x < w; x += step) {
    const b0 = Math.floor(x * perPx);
    if (b0 >= lastBucket) break;
    const b1 = Math.min(lastBucket, Math.max(b0 + 1, Math.ceil((x + step) * perPx)));
    let peak = 0;
    for (let b = b0; b < b1; b++) if (t.peaks[b] > peak) peak = t.peaks[b];
    // 小さい音も見えるよう、少し持ち上げて描く
    const bh = Math.max(bar, Math.pow(Math.min(1, peak), 0.6) * maxH);
    g.fillRect(x, mid - bh / 2, bar, bh);
  }
}

function applyPeaks(update: NonNullable<Status["peaks"]>): void {
  const t = tracks.find((t) => t.id === update.id);
  if (!t) return;
  const end = update.start + update.data.length;
  if (end > t.peaks.length) {
    const grown = new Float32Array(Math.max(end, t.peaks.length * 2, 1024));
    grown.set(t.peaks);
    t.peaks = grown;
  }
  t.peaks.set(update.data, update.start);
  t.dirty = true;
}

// ---------- エンジンからの状態 ----------

audio.onStatus = (s) => {
  if (s.recording !== recording) tracks.forEach((t) => (t.dirty = true));
  pos = s.pos;
  playing = s.playing;
  recording = s.recording;
  length = s.length;
  level = Math.max(level, s.level);
  for (const [id, len] of s.lens) {
    const t = tracks.find((t) => t.id === id);
    if (t && t.len !== len) {
      t.len = len;
      t.dirty = true;
    }
  }
  if (s.peaks) applyPeaks(s.peaks);
  for (const ev of s.events) {
    if (ev.type === "calibrated") calibrated(ev.latency);
  }
};

function frame(): void {
  const state = recording !== null ? "recording" : playing ? "playing" : "idle";
  if (document.body.dataset.state !== state) document.body.dataset.state = state;
  setText(el.state, state === "recording" ? "録音中" : state === "playing" ? "再生中" : "停止中");
  setText(el.time, formatTime(pos));
  setText(el.total, `/ ${formatTime(length)}`);

  // 録音中は録った長さに合わせて表示範囲を伸ばす。毎フレーム描き直さないよう、少し余裕を持って伸ばす
  const need = Math.max(length, recording !== null ? pos : 0);
  let view = viewLen;
  if (recording !== null) {
    if (need > viewLen) view = need * 1.3;
  } else {
    view = need > 0 ? need : MIN_VIEW_SECONDS * sr();
  }
  if (view !== viewLen) {
    viewLen = view;
    tracks.forEach((t) => (t.dirty = true));
  }

  const frac = Math.min(1, pos / viewLen);
  const rulerW = el.ruler.clientWidth;
  el.rulerKnob.style.transform = `translateX(${(11 + frac * (rulerW - 22)).toFixed(1)}px)`;
  el.rulerFill.style.width = `${(6 + frac * (rulerW - 22)).toFixed(1)}px`;
  el.ruler.setAttribute("aria-valuemax", (length / sr()).toFixed(1));
  el.ruler.setAttribute("aria-valuenow", (pos / sr()).toFixed(1));
  el.ruler.setAttribute("aria-valuetext", formatTime(pos));

  for (const t of tracks) {
    if (t.dirty) drawTrack(t);
    if (t.playhead) t.playhead.style.left = `${(frac * 100).toFixed(2)}%`;
    if (t.sub) {
      const armed = t.id === armedId;
      setText(t.sub, recording === t.id ? "録音中" : armed && t.len === 0 ? "録音先" : armed ? `録音先 ・ ${formatTime(t.len)}` : t.len === 0 ? "未録音" : formatTime(t.len));
      t.sub.classList.toggle("armed", armed);
    }
  }

  // 入力レベル。-60dB〜0dB を 0〜100% に
  const db = level > 0 ? 20 * Math.log10(level) : -100;
  const pct = Math.max(0, Math.min(100, ((db + 60) / 60) * 100));
  el.meter.style.clipPath = `inset(0 ${(100 - pct).toFixed(1)}% 0 0)`;
  level *= 0.85;

  el.play.disabled = length === 0 && !playing;
  el.play.setAttribute("aria-label", playing ? "停止" : "再生");
  const icon = playing ? "#i-stop" : "#i-play";
  if (el.playIcon.getAttribute("href") !== icon) el.playIcon.setAttribute("href", icon);
  el.rec.setAttribute("aria-pressed", String(recording !== null));
  el.rec.setAttribute("aria-label", recording !== null ? "録音を止める" : "録音");
  el.rewind.disabled = recording !== null || pos === 0;
  el.export.disabled = length === 0 || recording !== null;

  requestAnimationFrame(frame);
}

// 開いている間は画面が暗くならないようにする。
// 画面を離れると OS が勝手に解除するので、戻ってきたときと、次に触ったときに取り直す
let wakeLock: { released: boolean } | null = null;

async function keepAwake(): Promise<void> {
  if (document.visibilityState !== "visible" || (wakeLock && !wakeLock.released)) return;
  try {
    wakeLock = (await (navigator as any).wakeLock?.request("screen")) ?? null;
  } catch {
    wakeLock = null;
  }
}

// ---------- 再生・録音・シーク ----------

function effectiveLatencyMs(): number {
  return latencyMs ?? audio.estimateLatencyMs();
}

function togglePlay(): void {
  if (!started) return;
  audio.resume();
  audio.post({ type: playing ? "stop" : "play" });
}

function toggleRecord(): void {
  if (!started) return;
  audio.resume();
  if (recording !== null) {
    audio.post({ type: "stop" });
    return;
  }
  if (!audio.hasMic) {
    showMicError("マイクがつながっていません。上の「入力マイク」から選び直すか、ブラウザの設定でマイクを許可してください。");
    return;
  }
  audio.post({ type: "record", id: armedId, latency: Math.round((effectiveLatencyMs() / 1000) * audio.sampleRate) });
}

function seek(samples: number): void {
  if (!started || recording !== null) return;
  pos = Math.max(0, Math.min(length, Math.round(samples)));
  audio.post({ type: "seek", pos });
}

function seekTo(box: HTMLElement, clientX: number, inset = 0): void {
  const r = box.getBoundingClientRect();
  seek(((clientX - r.left - inset) / (r.width - inset * 2)) * viewLen);
}

el.play.addEventListener("click", togglePlay);
el.rec.addEventListener("click", toggleRecord);
el.rewind.addEventListener("click", () => seek(0));
el.loop.addEventListener("click", () => {
  loop = !loop;
  el.loop.setAttribute("aria-pressed", String(loop));
  audio.post({ type: "setLoop", value: loop });
});
el.addTrack.addEventListener("click", addTrack);

el.ruler.addEventListener("pointerdown", (e) => {
  el.ruler.setPointerCapture(e.pointerId);
  seekTo(el.ruler, e.clientX, 11);
});
el.ruler.addEventListener("pointermove", (e) => {
  if (el.ruler.hasPointerCapture(e.pointerId)) seekTo(el.ruler, e.clientX, 11);
});
el.ruler.addEventListener("keydown", (e) => {
  const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
  if (step === 0) return;
  e.preventDefault();
  seek(pos + step * sr());
});

document.addEventListener("keydown", (e) => {
  if (document.querySelector("dialog[open]") || e.target instanceof HTMLSelectElement) return;
  if (e.code === "Space" && !(e.target instanceof HTMLButtonElement)) {
    e.preventDefault();
    togglePlay();
  } else if (e.key === "r" && !e.metaKey && !e.ctrlKey) {
    toggleRecord();
  }
});

// ---------- マイク ----------

function showMicError(message: string): void {
  el.micError.textContent = message;
  el.micError.hidden = message === "";
}

async function refreshMics(): Promise<void> {
  const mics = await audio.listMics();
  const current = audio.micId;
  el.mic.replaceChildren(
    ...(mics.length > 0 ? mics : [{ id: "", label: "（マイクが見つかりません）" }]).map((m) => {
      const o = document.createElement("option");
      o.value = m.id;
      o.textContent = m.label;
      o.selected = m.id === current;
      return o;
    }),
  );
}

async function openMic(deviceId?: string): Promise<void> {
  try {
    await audio.openMic(deviceId);
    showMicError("");
    if (audio.micId) localStorage.setItem(MIC_KEY, audio.micId);
  } catch (err) {
    const denied = (err as DOMException).name === "NotAllowedError";
    showMicError(denied ? "マイクの使用が許可されていません。ブラウザの設定で許可してから、マイクを選び直してください。" : "マイクを開けませんでした。別のマイクを選んでください。");
  }
  await refreshMics();
  updateLatencyText();
}

el.mic.addEventListener("change", () => {
  if (recording !== null) audio.post({ type: "stop" });
  void openMic(el.mic.value || undefined);
});
// 許可されていない状態でも、選び直そうとしたらもう一度つなぎに行く
el.mic.addEventListener("pointerdown", () => {
  if (started && !audio.hasMic) void openMic();
});
navigator.mediaDevices?.addEventListener("devicechange", () => {
  if (started) void refreshMics();
});

// ---------- 設定 ----------

function updateLatencyText(): void {
  if (!started) return;
  el.latencyValue.textContent = latencyMs === null ? `${audio.estimateLatencyMs()} ms（推定）` : `${latencyMs} ms`;
}

function setLatency(ms: number | null): void {
  latencyMs = ms === null ? null : Math.max(0, Math.min(1000, Math.round(ms)));
  if (latencyMs === null) localStorage.removeItem(LATENCY_KEY);
  else localStorage.setItem(LATENCY_KEY, String(latencyMs));
  updateLatencyText();
}

function calibrated(latency: number | null): void {
  el.calibrate.disabled = false;
  if (latency === null) {
    el.calibrateNote.textContent = "計測できませんでした。再生と録音を止め、イヤホンを外して音量を上げてから、もう一度試してください。";
    return;
  }
  setLatency((latency / audio.sampleRate) * 1000);
  el.calibrateNote.textContent = `計測した値（${latencyMs} ms）を設定しました。`;
}

$("settings-open").addEventListener("click", () => {
  updateLatencyText();
  el.settings.showModal();
});
$<HTMLInputElement>("monitor").addEventListener("change", (e) => {
  audio.post({ type: "setMonitor", value: (e.target as HTMLInputElement).checked });
});
$("latency-down").addEventListener("click", () => setLatency(effectiveLatencyMs() - 5));
$("latency-up").addEventListener("click", () => setLatency(effectiveLatencyMs() + 5));
$("latency-auto").addEventListener("click", () => setLatency(null));
el.calibrate.addEventListener("click", () => {
  if (!audio.hasMic) {
    el.calibrateNote.textContent = "マイクがつながっていないので計測できません。";
    return;
  }
  audio.resume();
  el.calibrate.disabled = true;
  el.calibrateNote.textContent = "計測中… 短い音が 3 回鳴ります。";
  audio.post({ type: "calibrate" });
});

document.querySelectorAll<HTMLElement>("[data-close]").forEach((b) => {
  b.addEventListener("click", () => b.closest("dialog")!.close());
});

// ---------- 書き出し ----------

el.export.addEventListener("click", async () => {
  if (playing) audio.post({ type: "stop" });
  const mix = await audio.mixdown();
  if (!mix) {
    alert("書き出せる音がありません。ミュートを外してから、もう一度試してください。");
    return;
  }
  const wav = encodeWav(mix, audio.sampleRate);
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  const name = `looper-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.wav`;
  exportFile = new File([wav], name, { type: "audio/wav" });
  if (exportUrl) URL.revokeObjectURL(exportUrl);
  exportUrl = URL.createObjectURL(exportFile);
  const link = $<HTMLAnchorElement>("export-download");
  link.href = exportUrl;
  link.download = name;
  $("export-info").textContent = `${name}（${formatTime(mix.length)}・${(wav.byteLength / 1024 / 1024).toFixed(1)} MB）`;
  // iPhone のホーム画面から開いたときはダウンロードが効かないことがあるので、共有シートも出せるようにする
  $("export-share").hidden = !navigator.canShare?.({ files: [exportFile] });
  el.exportSheet.showModal();
});

$("export-share").addEventListener("click", () => {
  if (exportFile) navigator.share({ files: [exportFile] }).catch(() => {});
});

// ---------- 起動 ----------

$("start").addEventListener("click", async () => {
  const button = $<HTMLButtonElement>("start");
  const error = $("start-error");
  button.disabled = true;
  try {
    await audio.start();
  } catch {
    error.textContent = "このブラウザでは音声の処理を始められませんでした。Safari か Chrome の新しい版で開いてください。";
    error.hidden = false;
    button.disabled = false;
    return;
  }
  started = true;
  for (const t of tracks) audio.post({ type: "addTrack", id: t.id });
  audio.post({ type: "setLoop", value: loop });
  await openMic(localStorage.getItem(MIC_KEY) ?? undefined);
  $("welcome").hidden = true;
});

// 画面に戻ってきたときや、割り込み (着信など) のあとに音を動かし直す
document.addEventListener("pointerdown", () => {
  if (started) audio.resume();
  void keepAwake();
});
document.addEventListener("visibilitychange", () => {
  if (started && document.visibilityState === "visible") audio.resume();
  void keepAwake();
});
void keepAwake();
window.addEventListener("beforeunload", (e) => {
  if (length > 0) e.preventDefault();
});
new ResizeObserver(() => tracks.forEach((t) => (t.dirty = true))).observe(el.tracks);

addTrack();
requestAnimationFrame(frame);

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`);
}

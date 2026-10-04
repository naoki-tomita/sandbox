"use strict";

// タグの表示名と色。ここにないクラスは英語名のまま灰色で表示する
const TAGS = {
  person: ["人", "--t-person"],
  cat: ["猫", "--t-animal"],
  dog: ["犬", "--t-animal"],
  horse: ["馬", "--t-animal"],
  bird: ["鳥", "--t-bird"],
  car: ["車", "--t-vehicle"],
  truck: ["トラック", "--t-vehicle"],
  bus: ["バス", "--t-vehicle"],
  bicycle: ["自転車", "--t-vehicle"],
  motorcycle: ["バイク", "--t-vehicle"],
  motion: ["動きのみ", "--t-other"],
  day: ["昼", "--t-other"],
  night: ["夜", "--t-other"],
};
// 時間帯タグは対象物ではないので、色や代表タグの判定では後回しにする
const META_TAGS = new Set(["day", "night"]);
const tagName = (t) => (TAGS[t] ? TAGS[t][0] : t);
const tagColor = (t) => `var(${TAGS[t] ? TAGS[t][1] : "--t-other"})`;

const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  for (const c of children) if (c != null) node.append(c);
  return node;
};

const state = {
  date: localDate(new Date()),
  cameras: new Set(),
  tags: new Set(),
  starred: false,
  events: [],
  next: null,
  cameraList: [],
  current: null, // プレイヤーで開いているイベント
};

function localDate(d) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function parseDate(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function fmtTime(sec) {
  const d = new Date(sec * 1000);
  return d.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
function fmtDur(sec) {
  sec = Math.round(sec);
  return sec >= 60 ? `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}` : `0:${String(sec).padStart(2, "0")}`;
}
async function api(path, opts) {
  const res = await fetch(path, opts);
  if (!res.ok) {
    let msg = `${res.status}`;
    try { msg = (await res.json()).error || msg; } catch {}
    throw new Error(msg);
  }
  return res.json();
}

// ---------------- ライブ ----------------

const liveTiles = new Map();

function renderCameras() {
  const live = $("live");
  const active = state.cameraList.filter((c) => c.active);
  for (const cam of active) {
    let tile = liveTiles.get(cam.id);
    if (!tile) {
      const img = el("img", { alt: `${cam.name} のライブ映像` });
      const lamp = el("span", { className: "lamp" });
      const name = el("span", { textContent: cam.name });
      const fps = el("span", { className: "fps" });
      const msg = el("span", { className: "msg" });
      const node = el("button", { type: "button", className: "cam" }, img, msg, el("span", { className: "label" }, lamp, name, fps));
      node.addEventListener("click", () => toggleSet(state.cameras, cam.id));
      tile = { node, img, lamp, fps, msg, loading: false };
      liveTiles.set(cam.id, tile);
      live.append(node);
    }
    const rec = cam.state === "recording";
    tile.lamp.className = "lamp" + (!cam.connected ? " off" : rec ? " rec" : "");
    tile.fps.textContent = cam.connected ? `${cam.fps.toFixed(1)}fps · 今日${cam.events_today}件` : "";
    tile.node.classList.toggle("offline", !cam.connected);
    if (cam.connected) tile.msg.replaceChildren();
    else tile.msg.replaceChildren(
      el("strong", { textContent: cam.last_error ? "未接続 — 再接続を試しています" : "接続中…" }),
      cam.last_error ? el("small", { textContent: cam.last_error.slice(0, 100) }) : null);
    tile.node.setAttribute("aria-pressed", state.cameras.has(cam.id) ? "true" : "false");
    tile.node.title = rec ? "録画中" : cam.state === "motion" ? "動きあり(判定中)" : "監視中";
  }
  live.hidden = active.length === 0;
}

function refreshLive() {
  if (document.visibilityState !== "visible") return;
  for (const [id, tile] of liveTiles) {
    const cam = state.cameraList.find((c) => c.id === id);
    if (!cam || !cam.connected || tile.loading) continue;
    tile.loading = true;
    const img = new Image();
    img.onload = () => { tile.img.src = img.src; tile.loading = false; };
    img.onerror = () => { tile.loading = false; };
    img.src = `/api/cameras/${encodeURIComponent(id)}/live.jpg?t=${Date.now()}`;
  }
}

async function refreshStatus() {
  try {
    const [cams, status] = await Promise.all([api("/api/cameras"), api("/api/status")]);
    const firstLoad = state.cameraList.length === 0;
    state.cameraList = cams;
    renderCameras();
    if (firstLoad) renderCameraChips();
    const gb = (status.disk_bytes / 1024 ** 3).toFixed(2);
    const det = status.detector ? `${status.detector} ${status.detector_ms}ms` : "物体検出なし";
    $("sysline").textContent = `${det} · 保存 ${gb}GB`;
  } catch (e) {
    $("sysline").textContent = `サーバーに接続できません(${e.message})`;
  }
}

// ---------------- 絞り込み ----------------

function toggleSet(set, value) {
  set.has(value) ? set.delete(value) : set.add(value);
  renderCameraChips();
  renderCameras();
  loadTags();
  loadEvents();
}

function renderCameraChips() {
  const box = $("cameraChips");
  box.replaceChildren();
  if (state.cameraList.length < 2) return;
  for (const cam of state.cameraList) {
    const chip = el("button", { type: "button", className: "chip", textContent: cam.name });
    chip.setAttribute("aria-pressed", state.cameras.has(cam.id) ? "true" : "false");
    chip.addEventListener("click", () => toggleSet(state.cameras, cam.id));
    box.append(chip);
  }
}

async function loadTags() {
  const q = new URLSearchParams();
  state.cameras.forEach((c) => q.append("camera", c));
  const tags = await api(`/api/tags?${q}`);
  const box = $("tagChips");
  box.replaceChildren();
  for (const { tag, count } of tags) {
    const chip = el("button", { type: "button", className: "chip" },
      el("span", { className: "dot", style: `--c:${tagColor(tag)}` }),
      tagName(tag),
      el("span", { className: "n", textContent: count }));
    chip.setAttribute("aria-pressed", state.tags.has(tag) ? "true" : "false");
    chip.addEventListener("click", () => toggleSet(state.tags, tag));
    box.append(chip);
  }
}

// ---------------- 日付 ----------------

function setDate(date) {
  state.date = date;
  const d = parseDate(date);
  const today = localDate(new Date());
  const wd = "日月火水木金土"[d.getDay()];
  $("dayLabel").textContent = `${d.getMonth() + 1}月${d.getDate()}日(${wd})${date === today ? " · 今日" : ""}`;
  $("dateInput").value = date;
  $("nextDay").disabled = date >= today;
  loadEvents();
}

function shiftDay(delta) {
  const d = parseDate(state.date);
  d.setDate(d.getDate() + delta);
  setDate(localDate(d));
}

// ---------------- 一覧 ----------------

function eventQuery(before) {
  const q = new URLSearchParams({ date: state.date, limit: "120" });
  state.cameras.forEach((c) => q.append("camera", c));
  state.tags.forEach((t) => q.append("tag", t));
  if (state.starred) q.set("starred", "true");
  if (before) q.set("before", before);
  return q;
}

let loadSeq = 0;
async function loadEvents(append = false) {
  const seq = ++loadSeq;
  const data = await api(`/api/events?${eventQuery(append ? state.next : null)}`);
  if (seq !== loadSeq) return; // 古いリクエストの結果は捨てる
  state.events = append ? state.events.concat(data.events) : data.events;
  state.next = data.next;
  renderEvents();
}

function mainTag(ev) {
  return (ev.tags.find((t) => !META_TAGS.has(t.tag)) || ev.tags[0] || { tag: "motion" }).tag;
}

function renderEvents() {
  const grid = $("grid");
  grid.replaceChildren();
  for (const ev of state.events) {
    const thumb = el("div", { className: "thumb" },
      ev.thumb_url ? el("img", { src: ev.thumb_url, alt: "", loading: "lazy" }) : null,
      el("span", { className: "dur", textContent: fmtDur(ev.duration) }),
      ev.starred ? el("span", { className: "starred", textContent: "★", title: "星付き" }) : null);
    const tags = el("ul", { className: "tags" });
    for (const t of ev.tags) {
      tags.append(el("li", { className: "tag", style: `--c:${tagColor(t.tag)}` },
        el("span", { className: "dot" }), tagName(t.tag)));
    }
    const card = el("button", { type: "button", className: "card" }, thumb,
      el("div", { className: "body" },
        el("div", { className: "when" },
          el("time", { textContent: fmtTime(ev.started_at), dateTime: new Date(ev.started_at * 1000).toISOString() }),
          el("span", { className: "camname", textContent: ev.camera_name || ev.camera_id })),
        tags));
    card.addEventListener("click", () => openPlayer(ev.id));
    grid.append(el("li", {}, card));
  }
  const n = state.events.length;
  $("count").textContent = n ? `${n}${state.next ? "+" : ""} 件` : "";
  const empty = $("empty");
  empty.hidden = n > 0;
  if (!n) {
    const filtered = state.cameras.size || state.tags.size || state.starred;
    empty.textContent = filtered
      ? "この日、条件に合うイベントはありません。絞り込みを外すと他のイベントも表示されます。"
      : "この日のイベントはまだありません。人や動物などが映ると、ここにクリップが追加されます。";
  }
  $("more").hidden = !state.next;
  renderTimeline();
}

function renderTimeline() {
  const track = $("track");
  track.replaceChildren(
    el("div", { className: "night", style: "left:0;width:25%" }),
    el("div", { className: "night", style: "left:75%;width:25%" }));
  const dayStart = parseDate(state.date).getTime() / 1000;
  const span = 86400;
  for (const ev of state.events) {
    const left = ((ev.started_at - dayStart) / span) * 100;
    const width = Math.max(0.2, ((ev.ended_at - ev.started_at) / span) * 100);
    const tag = mainTag(ev);
    const mark = el("button", {
      type: "button",
      className: "mark",
      style: `left:${left}%;width:${width}%;--c:${tagColor(tag)}`,
      title: `${fmtTime(ev.started_at)} ${ev.camera_name || ev.camera_id} ${ev.tags.map((t) => tagName(t.tag)).join("・")}`,
    });
    mark.setAttribute("aria-label", mark.title);
    mark.addEventListener("click", () => openPlayer(ev.id));
    track.append(mark);
  }
  if (state.date === localDate(new Date())) {
    const now = (Date.now() / 1000 - dayStart) / span * 100;
    track.append(el("div", { className: "now", style: `left:${now}%`, title: "現在" }));
  }
}

// ---------------- プレイヤー ----------------

const video = $("video");
const overlay = $("overlay");
// 1 回の検出結果を表示し続ける長さ(秒)。推論間隔(既定 0.5 秒)より少し長く
const BOX_HOLD = 0.7;

async function openPlayer(id) {
  const ev = await api(`/api/events/${id}`);
  state.current = ev;
  $("playerTitle").textContent = `${ev.camera_name || ev.camera_id} · ${new Date(ev.started_at * 1000).toLocaleString("ja-JP")}`;
  const tags = $("playerTags");
  tags.replaceChildren(...ev.tags.map((t) =>
    el("li", { className: "tag", style: `--c:${tagColor(t.tag)}` },
      el("span", { className: "dot" }), tagName(t.tag),
      t.hits ? el("span", { className: "conf", textContent: `${Math.round(t.max_conf * 100)}% ×${t.hits}` }) : null)));
  $("starBtn").textContent = ev.starred ? "★ 星を外す" : "☆ 星を付ける";
  $("downloadBtn").href = ev.video_url;
  const idx = state.events.findIndex((e) => e.id === ev.id);
  $("prevEvent").disabled = idx <= 0;
  $("nextEvent").disabled = idx < 0 || idx >= state.events.length - 1;
  video.src = ev.video_url;
  // 動き始めの少し前から再生する
  video.addEventListener("loadedmetadata", () => {
    video.currentTime = Math.max(0, ev.started_at - ev.video_start - 1);
    video.play().catch(() => {});
  }, { once: true });
  const dlg = $("player");
  if (!dlg.open) dlg.showModal();
  drawOverlay();
}

function closePlayer() {
  video.pause();
  video.removeAttribute("src");
  video.load();
  state.current = null;
  if ($("player").open) $("player").close();
}

function drawOverlay() {
  const ctx = overlay.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const cw = overlay.clientWidth, ch = overlay.clientHeight;
  overlay.width = cw * dpr;
  overlay.height = ch * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cw, ch);
  const ev = state.current;
  if (!ev || !$("showBoxes").checked || !video.videoWidth) return;
  // video は object-fit: contain 相当なので、実際に映像が描かれている矩形を求める
  const scale = Math.min(cw / video.videoWidth, ch / video.videoHeight);
  const vw = video.videoWidth * scale, vh = video.videoHeight * scale;
  const ox = (cw - vw) / 2, oy = (ch - vh) / 2;
  const t = video.currentTime;
  // 直前の 1 回分の推論結果だけを、次の推論まで(最大 BOX_HOLD 秒)表示する。先の結果は出さない
  let latest = -Infinity;
  for (const d of ev.detections) {
    if (d.t_offset <= t && d.t_offset > latest) latest = d.t_offset;
  }
  if (t - latest > BOX_HOLD) return;
  ctx.lineWidth = 2;
  ctx.font = "12px ui-monospace, Menlo, monospace";
  const style = getComputedStyle(document.documentElement);
  for (const d of ev.detections) {
    if (d.t_offset !== latest) continue;
    const color = style.getPropertyValue((TAGS[d.label] || [, "--t-other"])[1]).trim() || "#ffb347";
    const x = ox + d.x * vw, y = oy + d.y * vh, w = d.w * vw, h = d.h * vh;
    ctx.strokeStyle = color;
    ctx.strokeRect(x, y, w, h);
    const label = `${tagName(d.label)} ${Math.round(d.conf * 100)}%`;
    const tw = ctx.measureText(label).width + 8;
    ctx.fillStyle = color;
    ctx.fillRect(x, Math.max(0, y - 18), tw, 18);
    ctx.fillStyle = "#111";
    ctx.fillText(label, x + 4, Math.max(13, y - 5));
  }
}

function overlayLoop() {
  drawOverlay();
  if (!video.paused && !video.ended) requestAnimationFrame(overlayLoop);
}
video.addEventListener("play", overlayLoop);
video.addEventListener("seeked", drawOverlay);
video.addEventListener("loadeddata", drawOverlay);
window.addEventListener("resize", drawOverlay);
$("showBoxes").addEventListener("change", drawOverlay);

function stepEvent(delta) {
  if (!state.current) return;
  const idx = state.events.findIndex((e) => e.id === state.current.id);
  const next = state.events[idx + delta];
  if (next) openPlayer(next.id);
}

$("prevEvent").addEventListener("click", () => stepEvent(-1));
$("nextEvent").addEventListener("click", () => stepEvent(1));
$("closePlayer").addEventListener("click", closePlayer);
$("player").addEventListener("close", closePlayer);
$("player").addEventListener("click", (e) => { if (e.target === $("player")) closePlayer(); });

$("starBtn").addEventListener("click", async () => {
  const ev = state.current;
  if (!ev) return;
  const starred = !ev.starred;
  await api(`/api/events/${ev.id}/star`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ starred }),
  });
  ev.starred = starred ? 1 : 0;
  const listed = state.events.find((e) => e.id === ev.id);
  if (listed) listed.starred = ev.starred;
  $("starBtn").textContent = starred ? "★ 星を外す" : "☆ 星を付ける";
  renderEvents();
});

$("deleteBtn").addEventListener("click", async () => {
  const ev = state.current;
  if (!ev || !confirm("このクリップを削除します。元に戻せません。")) return;
  const idx = state.events.findIndex((e) => e.id === ev.id);
  await api(`/api/events/${ev.id}`, { method: "DELETE" });
  state.events = state.events.filter((e) => e.id !== ev.id);
  renderEvents();
  loadTags();
  const next = state.events[idx] || state.events[idx - 1];
  next ? openPlayer(next.id) : closePlayer();
});

// ---------------- 起動 ----------------

$("prevDay").addEventListener("click", () => shiftDay(-1));
$("nextDay").addEventListener("click", () => shiftDay(1));
$("todayBtn").addEventListener("click", () => setDate(localDate(new Date())));
$("dateInput").addEventListener("change", (e) => e.target.value && setDate(e.target.value));
$("more").addEventListener("click", () => loadEvents(true));
$("starFilter").addEventListener("click", (e) => {
  state.starred = !state.starred;
  e.currentTarget.setAttribute("aria-pressed", String(state.starred));
  loadEvents();
});

refreshStatus();
loadTags();
setDate(state.date);
setInterval(refreshStatus, 3000);
setInterval(refreshLive, 1000);
// 新しいイベントを取り込む(プレイヤーを開いている間は一覧を動かさない)
setInterval(() => {
  if (!state.current && state.date === localDate(new Date())) {
    loadEvents();
    loadTags();
  }
}, 15000);

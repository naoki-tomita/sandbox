// マイクとスピーカーの選択。選んだ機器はこのブラウザ (localStorage) に覚えておき、次に POWER を押したときも使う。
// 機器の名前は、マイクを許可したあとでないと取れない。

import { canSelectOutput, setOutput, startMic } from "./audio";
import { state, update, type Device } from "./state";

const KEY = "jc-harmonizer.devices";

// 機器の ID はブラウザのデータを消すと変わるので、名前も覚えておき、ID で見つからなければ名前で探す
type Saved = { mic?: Device; speaker?: Device };

function load(): Saved {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "null") || {};
  } catch {
    return {};
  }
}

function save() {
  const find = (list: Device[], id: string) => list.find((d) => d.id === id);
  try {
    localStorage.setItem(KEY, JSON.stringify({ mic: find(state.inputs, state.micId), speaker: find(state.outputs, state.speakerId) }));
  } catch {}
}

const resolve = (list: Device[], saved?: Device) => (saved && (list.find((d) => d.id === saved.id) ?? list.find((d) => d.label === saved.label))?.id) || "";

async function refreshDevices() {
  const all = await navigator.mediaDevices.enumerateDevices();
  // "default" / "communications" は既定の機器の別名なので、一覧には「既定」として 1 つだけ出す
  const list = (kind: MediaDeviceKind) =>
    all
      .filter((d) => d.kind === kind && d.deviceId && d.deviceId !== "default" && d.deviceId !== "communications")
      .map((d, i) => ({ id: d.deviceId, label: d.label || `${kind === "audioinput" ? "マイク" : "スピーカー"} ${i + 1}` }));
  state.inputs = list("audioinput");
  state.outputs = canSelectOutput ? list("audiooutput") : [];
  update();
}

// POWER で呼ぶ。覚えておいた機器がなくなっていたら既定の機器にする
export async function startDevices() {
  const saved = load();
  // マイクを許可済みなら、この時点で機器の名前まで取れる
  await refreshDevices();
  state.micId = resolve(state.inputs, saved.mic);
  try {
    await startMic(state.micId);
  } catch (e) {
    if (!state.micId) throw e;
    state.micId = "";
    await startMic();
  }
  // 初めての許可だと名前はここで取れるようになるので、名前で探し直す
  await refreshDevices();
  const mic = resolve(state.inputs, saved.mic);
  if (mic && mic !== state.micId) {
    try {
      await startMic(mic);
      state.micId = mic;
    } catch {}
  }
  if (canSelectOutput) {
    const speaker = resolve(state.outputs, saved.speaker);
    if (speaker) {
      try {
        await setOutput(speaker);
        state.speakerId = speaker;
      } catch {}
    }
  }
  navigator.mediaDevices.addEventListener("devicechange", refreshDevices);
}

export async function selectMic(id: string) {
  try {
    await startMic(id);
    state.micId = id;
  } catch (e) {
    state.status = `マイクを切り替えられません: ${(e as Error).message}`;
  }
  save();
  update();
}

export async function selectSpeaker(id: string) {
  try {
    await setOutput(id);
    state.speakerId = id;
  } catch (e) {
    state.status = `出力先を切り替えられません: ${(e as Error).message}`;
  }
  save();
  update();
}

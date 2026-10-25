// JC HARMONIZER の起動。固定モジュール (MIC / HARMONIZER / OUTPUT) を置いてつなぎ、画面を描く。
// 画面は zheleznaya のコンポーネント (components/)、状態は state.ts、音声は audio.ts にある。

import { h } from "zheleznaya";
import { refreshPresets } from "./actions";
import { harmonizer, master, micBus } from "./audio";
import { App } from "./components/App";
import { bindPcKeys } from "./components/Keyboard";
import { showPitch } from "./display";
import { param } from "./effects";
import { nearestNote, noteName } from "./notes";
import { addCable, addModule } from "./patchbay";
import { render } from "./state";

let dry = 0;
let wet = 1;
const sendMix = () => harmonizer.port.postMessage({ type: "params", dry, wet });

const mic = addModule({
  kind: "mic",
  name: "MIC",
  sub: "マイク入力",
  role: "source",
  width: "narrow",
  input: null,
  output: micBus,
  removable: false,
  on: true,
  params: [],
  code: null,
});

const voice = addModule({
  kind: "voice",
  name: "HARMONIZER",
  sub: "鍵盤の音程で声を鳴らす",
  role: "voice",
  width: "normal",
  input: harmonizer,
  output: harmonizer,
  removable: false,
  on: true,
  params: [
    param("dry", "DRY", 0, 1, 0.01, 0, (v) => ((dry = v), sendMix())),
    param("wet", "WET", 0, 1, 0.01, 1, (v) => ((wet = v), sendMix())),
  ],
  code: null,
});

const output = addModule({
  kind: "output",
  name: "OUTPUT",
  sub: "イヤホン / スピーカーへ",
  role: "sink",
  width: "narrow",
  input: master,
  output: null,
  removable: false,
  on: true,
  params: [param("volume", "VOLUME", 0, 1.5, 0.01, 1, (v) => (master.gain.value = v))],
  code: null,
});

addCable(mic.id, voice.id);
addCable(voice.id, output.id);

harmonizer.port.onmessage = (e: MessageEvent<{ type: string; hz: number }>) => {
  if (e.data.type !== "pitch") return;
  const hz = e.data.hz;
  showPitch(hz ? `IN ${noteName(nearestNote(hz))} ${hz.toFixed(1)}Hz` : "IN —");
};

bindPcKeys();
refreshPresets();
render(<App />);

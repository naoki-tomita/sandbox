// 音声の土台。AudioContext はページを開いた時点で作り (停止状態)、POWER で動かす。
// こうしておくと、マイクを許可する前からモジュールを並べてつないでおける。

// AudioWorklet は Vite に単体のスクリプトとしてビルドさせ、その URL を addModule に渡す
import harmonizerUrl from "../worklets/harmonizer?worker&url";
import codeEffectUrl from "../worklets/code-effect?worker&url";

export const ctx = new AudioContext({ latencyHint: 0 });
await ctx.audioWorklet.addModule(harmonizerUrl);
await ctx.audioWorklet.addModule(codeEffectUrl);

export const harmonizer = new AudioWorkletNode(ctx, "harmonizer", { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] });
export const micBus = ctx.createGain();
export const micMeter = ctx.createAnalyser();
micMeter.fftSize = 1024;
export const master = ctx.createGain();
master.connect(ctx.destination);

let micStream: MediaStream | null = null;
let micSource: MediaStreamAudioSourceNode | null = null;

// マイクをつなぐ。deviceId を指定するとその機器に、空なら既定の機器にする。前のマイクは止める。失敗したら例外を投げる。
export async function startMic(deviceId = "") {
  // iOS Safari はユーザー操作の中で resume しないと音が出ない
  ctx.resume();
  const stream = await navigator.mediaDevices.getUserMedia({
    // latency は TypeScript の型定義に無いので、型を広げて渡す
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      channelCount: 1,
      latency: 0,
      ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
    } as MediaTrackConstraints,
  });
  micSource?.disconnect();
  micStream?.getTracks().forEach((t) => t.stop());
  micStream = stream;
  micSource = ctx.createMediaStreamSource(stream);
  micSource.connect(micBus);
  micSource.connect(micMeter);
}

// 出力先を選べるか (Chrome / Edge のみ。Safari と Firefox は OS の設定に従う)
export const canSelectOutput = "setSinkId" in AudioContext.prototype;

// 出力先を変える。空なら既定の機器
export async function setOutput(deviceId: string) {
  await (ctx as AudioContext & { setSinkId(id: string): Promise<void> }).setSinkId(deviceId);
}

// マイクの音量 (dB)
const samples = new Float32Array(micMeter.fftSize);
export function micLevelDb() {
  micMeter.getFloatTimeDomainData(samples);
  let sum = 0;
  for (const s of samples) sum += s * s;
  return 20 * Math.log10(Math.sqrt(sum / samples.length) + 1e-9);
}

export const latencyMs = () => (ctx.baseLatency + (ctx.outputLatency || 0)) * 1000;

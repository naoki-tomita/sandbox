// LooperEngine を AudioWorklet に載せる薄い包み。画面とはメッセージでやり取りする。
import { LooperEngine } from "../src/engine";

/** 状態を画面に知らせる間隔 (サンプル) */
const STATUS_EVERY = 1024;

class LooperProcessor extends AudioWorkletProcessor {
  private engine = new LooperEngine(sampleRate);
  private frames = 0;

  constructor() {
    super();
    this.port.onmessage = (e) => this.handle(e.data);
  }

  private handle(m: any): void {
    const e = this.engine;
    switch (m.type) {
      case "addTrack":
        e.addTrack(m.id);
        break;
      case "removeTrack":
        e.removeTrack(m.id);
        break;
      case "setTrack":
        e.setTrack(m.id, m.muted, m.solo);
        break;
      case "play":
        e.play();
        break;
      case "stop":
        e.stop();
        break;
      case "seek":
        e.seek(m.pos);
        break;
      case "record":
        e.record(m.id, m.latency);
        break;
      case "setLoop":
        e.loop = m.value;
        break;
      case "setMonitor":
        e.monitor = m.value;
        break;
      case "calibrate":
        e.calibrate();
        break;
      case "mixdown": {
        const mix = e.mixdown();
        this.port.postMessage({ type: "mixdown", mix }, mix ? [mix.buffer as ArrayBuffer] : []);
        break;
      }
    }
    this.frames = STATUS_EVERY;
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const out = outputs[0][0];
    const e = this.engine;
    e.process(inputs[0]?.[0] ?? null, out);
    this.frames += out.length;
    if (this.frames >= STATUS_EVERY || e.events.length > 0) {
      this.frames = 0;
      const peaks = e.takePeaks();
      this.port.postMessage(
        {
          type: "status",
          pos: e.pos,
          playing: e.playing,
          recording: e.recordingId,
          length: e.length,
          level: e.level,
          lens: e.trackLengths(),
          peaks,
          events: e.events,
        },
        peaks ? [peaks.data.buffer as ArrayBuffer] : [],
      );
      e.level = 0;
      e.events = [];
    }
    return true;
  }
}

registerProcessor("looper", LooperProcessor);

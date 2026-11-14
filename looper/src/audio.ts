// AudioContext・マイク・AudioWorklet をつなぐ。
import workletUrl from "../worklets/looper?worker&url";
import type { EngineEvent, PeakUpdate } from "./engine";

export interface Status {
  pos: number;
  playing: boolean;
  recording: number | null;
  counting: boolean;
  length: number;
  level: number;
  lens: [number, number][];
  peaks: PeakUpdate | null;
  events: EngineEvent[];
}

export interface Mic {
  id: string;
  label: string;
}

export class LooperAudio {
  ctx!: AudioContext;
  onStatus: (s: Status) => void = () => {};
  private node!: AudioWorkletNode;
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private mixdownDone: ((mix: Float32Array | null) => void) | null = null;

  get sampleRate(): number {
    return this.ctx.sampleRate;
  }

  get hasMic(): boolean {
    return this.stream !== null;
  }

  /** いま使っているマイクの deviceId */
  get micId(): string | null {
    return this.stream?.getAudioTracks()[0]?.getSettings().deviceId ?? null;
  }

  /** ユーザーの操作 (タップ) の中から呼ぶこと。iOS ではそうしないと音が出ない */
  async start(): Promise<void> {
    // iOS: マイクを使いながらスピーカーからも音を出す
    const session = (navigator as any).audioSession;
    if (session) {
      try {
        session.type = "play-and-record";
      } catch {
        // 対応していない版では何もしない
      }
    }
    this.ctx = new AudioContext({ latencyHint: "interactive" });
    void this.ctx.resume();
    await this.ctx.audioWorklet.addModule(workletUrl);
    this.node = new AudioWorkletNode(this.ctx, "looper", {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      channelCount: 1,
      channelCountMode: "explicit",
    });
    this.node.port.onmessage = (e) => {
      const m = e.data;
      if (m.type === "status") this.onStatus(m);
      else if (m.type === "mixdown") {
        this.mixdownDone?.(m.mix);
        this.mixdownDone = null;
      }
    };
    this.node.connect(this.ctx.destination);
  }

  /** マイクを開く (切り替える)。deviceId を省くと既定のマイク */
  async openMic(deviceId?: string): Promise<void> {
    // 通話用の加工 (エコー除去など) は音を変えるうえに遅延も増やすので、すべて切る
    const base = { echoCancellation: false, noiseSuppression: false, autoGainControl: false };
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: deviceId ? { ...base, deviceId: { exact: deviceId } } : base,
      });
    } catch (err) {
      // 覚えていたマイクがもう無いときは、既定のマイクで開き直す
      if (!deviceId || (err as DOMException).name === "NotAllowedError") throw err;
      stream = await navigator.mediaDevices.getUserMedia({ audio: base });
    }
    this.closeMic();
    this.stream = stream;
    this.source = this.ctx.createMediaStreamSource(stream);
    this.source.connect(this.node);
    void this.ctx.resume();
  }

  private closeMic(): void {
    this.source?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.source = null;
    this.stream = null;
  }

  async listMics(): Promise<Mic[]> {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter((d) => d.kind === "audioinput" && d.deviceId !== "")
      .map((d, i) => ({ id: d.deviceId, label: d.label || `マイク ${i + 1}` }));
  }

  /** ブラウザが教えてくれる範囲で見積もった、出力と入力の遅延の合計 (ミリ秒) */
  estimateLatencyMs(): number {
    const out = (this.ctx.baseLatency || 0) + (this.ctx.outputLatency || 0);
    const input = (this.stream?.getAudioTracks()[0]?.getSettings() as { latency?: number } | undefined)?.latency ?? 0;
    return Math.round((out + input) * 1000);
  }

  /** 画面を離れたあとなどで止まっていたら動かし直す */
  resume(): void {
    if (this.ctx && this.ctx.state !== "running") void this.ctx.resume();
  }

  post(message: Record<string, unknown>): void {
    this.node.port.postMessage(message);
  }

  mixdown(): Promise<Float32Array | null> {
    return new Promise((resolve) => {
      this.mixdownDone = resolve;
      this.post({ type: "mixdown" });
    });
  }
}

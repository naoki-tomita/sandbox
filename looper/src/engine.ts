// ルーパーの本体。AudioWorklet の中で動き、再生と録音を同じサンプル位置で進める。
// DOM にも Web Audio にも触らないので、テストからそのまま呼べる。

/** 波形表示用のピークを、何サンプルごとにまとめるか */
export const PEAK_BUCKET = 256;
/** 1 トラックの長さの上限 (秒) */
export const MAX_SECONDS = 600;

interface Track {
  id: number;
  buf: Float32Array;
  len: number;
  muted: boolean;
  solo: boolean;
  /** いま掛かっている音量。ミュートの切り替えでプチッと鳴らないよう、target へなめらかに寄せる */
  gain: number;
  target: number;
}

interface Rec {
  track: Track;
  /** 次に届く入力サンプルを書き込む位置。遅延補正のぶんだけ再生位置より手前にいる */
  w: number;
  /** 最初に書き込んだ位置 (まだなら -1) */
  first: number;
  /** 書き込んだサンプル数 */
  n: number;
  /** ここまで書いたら終わる位置。null の間は録音の最中 */
  end: number | null;
  /** ループ録音のとき、再生位置がここに来たら自動で録音を終える */
  bound: number | null;
  /** 上書きした元の音の直近ぶん。録音の終わりを元の音へなめらかにつなぐのに使う */
  ring: Float32Array;
}

interface Calib {
  t: number;
  noise: number;
  hit: number;
  results: number[];
  cyclesLeft: number;
}

export type EngineEvent = { type: "recorded"; id: number } | { type: "calibrated"; latency: number | null };

export interface PeakUpdate {
  id: number;
  /** data[0] が何番目のバケツか */
  start: number;
  data: Float32Array;
}

export class LooperEngine {
  readonly sampleRate: number;
  readonly maxLen: number;
  /** 再生位置 (サンプル) */
  pos = 0;
  playing = false;
  loop = true;
  monitor = false;
  /** 全トラックの中で一番長いものの長さ */
  length = 0;
  /** 前回読んでからの入力のピーク。読んだ側が 0 に戻す */
  level = 0;
  events: EngineEvent[] = [];

  private tracks: Track[] = [];
  private rec: Rec | null = null;
  private calib: Calib | null = null;
  private master = 0;
  private stopping = false;
  private stopPos = 0;
  private dirty: { id: number; from: number; to: number } | null = null;
  private readonly fade: number;
  private readonly masterStep: number;

  constructor(sampleRate: number) {
    this.sampleRate = sampleRate;
    this.maxLen = Math.floor(sampleRate * MAX_SECONDS);
    this.fade = Math.max(1, Math.round(sampleRate * 0.005));
    this.masterStep = 1 / Math.max(1, Math.round(sampleRate * 0.003));
  }

  /** 録音の最中のトラック (なければ null) */
  get recordingId(): number | null {
    return this.rec && this.rec.end === null ? this.rec.track.id : null;
  }

  get calibrating(): boolean {
    return this.calib !== null;
  }

  trackLengths(): [number, number][] {
    return this.tracks.map((t) => [t.id, t.len]);
  }

  addTrack(id: number): void {
    if (this.tracks.some((t) => t.id === id)) return;
    this.tracks.push({ id, buf: new Float32Array(0), len: 0, muted: false, solo: false, gain: 1, target: 1 });
  }

  removeTrack(id: number): void {
    const i = this.tracks.findIndex((t) => t.id === id);
    if (i < 0) return;
    if (this.rec?.track.id === id) {
      this.rec = null;
      this.stop();
    }
    this.tracks.splice(i, 1);
    if (this.dirty?.id === id) this.dirty = null;
    this.length = this.tracks.reduce((m, t) => Math.max(m, t.len), 0);
    if (this.length === 0) {
      this.playing = false;
      this.stopping = false;
      this.pos = 0;
    } else if (this.pos > this.length) {
      this.pos = this.length;
    }
    this.stopPos = Math.min(this.stopPos, this.length);
  }

  setTrack(id: number, muted: boolean, solo: boolean): void {
    const t = this.tracks.find((t) => t.id === id);
    if (!t) return;
    t.muted = muted;
    t.solo = solo;
  }

  play(): void {
    if (this.calib || this.length === 0) return;
    if (this.playing && !this.stopping) return;
    if (!this.playing) {
      if (this.pos >= this.length) this.pos = 0;
      this.master = 0;
      this.updateTargets(true);
    }
    this.playing = true;
    this.stopping = false;
  }

  /** 再生も録音も止める。位置は止めたところに残る */
  stop(): void {
    if (this.rec && this.rec.end === null) this.rec.end = this.pos;
    if (this.playing && !this.stopping) {
      this.stopping = true;
      this.stopPos = this.pos;
    }
  }

  seek(pos: number): void {
    if (this.recordingId !== null) return;
    const p = Math.max(0, Math.min(this.length, Math.round(pos)));
    this.pos = p;
    this.stopPos = p;
  }

  /**
   * いまの再生位置から id のトラックへ録音を始める。ほかのトラックは同時に再生する。
   * latency は「音を出してから、それに合わせた演奏が入力に届くまで」のサンプル数。
   */
  record(id: number, latency: number): void {
    const track = this.tracks.find((t) => t.id === id);
    if (!track || this.calib) return;
    if (this.rec) this.finishRec();
    if (this.stopping) {
      this.pos = this.stopPos;
      this.stopping = false;
    }
    const looping = this.loop && this.length > 0;
    if (looping && this.pos >= this.length) this.pos = 0;
    if (this.pos >= this.maxLen) return;
    if (!this.playing) {
      this.master = 0;
      this.updateTargets(true);
    }
    this.playing = true;
    this.rec = {
      track,
      w: this.pos - Math.max(0, Math.round(latency)),
      first: -1,
      n: 0,
      end: null,
      bound: looping ? this.length : null,
      ring: new Float32Array(this.fade),
    };
  }

  /** スピーカーからクリック音を出し、マイクに届くまでの時間を測る。結果は calibrated イベントで返す */
  calibrate(): void {
    if (this.calib) return;
    if (this.playing || this.rec) {
      this.events.push({ type: "calibrated", latency: null });
      return;
    }
    this.calib = { t: 0, noise: 0, hit: -1, results: [], cyclesLeft: 3 };
  }

  /** 聞こえているトラックを 1 本に混ぜる。音がなければ null */
  mixdown(): Float32Array | null {
    const anySolo = this.tracks.some((t) => t.solo);
    const audible = this.tracks.filter((t) => t.len > 0 && !t.muted && (!anySolo || t.solo));
    if (audible.length === 0) return null;
    const out = new Float32Array(audible.reduce((m, t) => Math.max(m, t.len), 0));
    for (const t of audible) {
      const buf = t.buf;
      for (let i = 0; i < t.len; i++) out[i] += buf[i];
    }
    for (let i = 0; i < out.length; i++) {
      if (out[i] > 1) out[i] = 1;
      else if (out[i] < -1) out[i] = -1;
    }
    return out;
  }

  /** 前回から書き換わった範囲のピークを返す */
  takePeaks(): PeakUpdate | null {
    const d = this.dirty;
    if (!d) return null;
    this.dirty = null;
    const t = this.tracks.find((t) => t.id === d.id);
    if (!t) return null;
    const to = Math.min(d.to, t.len);
    const b0 = Math.floor(Math.max(0, d.from) / PEAK_BUCKET);
    const b1 = Math.ceil(to / PEAK_BUCKET);
    if (b1 <= b0) return null;
    const data = new Float32Array(b1 - b0);
    for (let b = b0; b < b1; b++) {
      const end = Math.min((b + 1) * PEAK_BUCKET, t.len);
      let peak = 0;
      for (let i = b * PEAK_BUCKET; i < end; i++) {
        const a = Math.abs(t.buf[i]);
        if (a > peak) peak = a;
      }
      data[b - b0] = peak;
    }
    return { id: d.id, start: b0, data };
  }

  process(input: Float32Array | null, out: Float32Array): void {
    if (this.calib) {
      this.processCalib(input, out);
      return;
    }
    const tracks = this.tracks;
    this.updateTargets(!this.playing);

    for (let i = 0; i < out.length; i++) {
      const x = input ? input[i] : 0;
      const ax = x < 0 ? -x : x;
      if (ax > this.level) this.level = ax;

      // 録音。再生が止まったあとも、遅延補正のぶんだけ遅れて届く音を最後まで書き切る
      const rec = this.rec;
      if (rec) {
        const w = rec.w++;
        if ((rec.end !== null && w >= rec.end) || w >= this.maxLen) this.finishRec();
        else if (w >= 0) this.write(rec, w, x);
      }

      let y = 0;
      if (this.playing) {
        const p = this.pos;
        // 録音の最中のトラックは、上書きされる前の古い音が鳴らないよう外す
        const skip = this.rec && this.rec.end === null ? this.rec.track : null;
        for (const t of tracks) {
          t.gain += (t.target - t.gain) * 0.005;
          if (t !== skip && p < t.len) y += t.buf[p] * t.gain;
        }
        if (this.stopping) {
          this.master -= this.masterStep;
          if (this.master <= 0) {
            this.master = 0;
            this.playing = false;
            this.stopping = false;
            this.pos = this.stopPos;
          }
        } else if (this.master < 1) {
          this.master = Math.min(1, this.master + this.masterStep);
        }
        y *= this.master;
        if (this.playing) this.advance();
      }
      out[i] = this.monitor ? y + x : y;
    }
  }

  /** ミュートとソロから各トラックの音量を決める。snap なら、なめらかに寄せずにすぐ切り替える */
  private updateTargets(snap: boolean): void {
    const anySolo = this.tracks.some((t) => t.solo);
    for (const t of this.tracks) {
      t.target = !t.muted && (!anySolo || t.solo) ? 1 : 0;
      if (snap) t.gain = t.target;
    }
  }

  private advance(): void {
    this.pos++;
    const rec = this.rec;
    if (rec && rec.end === null) {
      if (rec.bound !== null && this.pos >= rec.bound) {
        // ループを一周録り終えた。録音だけ終えて、再生は頭に戻って続ける
        rec.end = rec.bound;
        this.pos = 0;
      } else if (this.pos >= this.maxLen) {
        this.stop();
      }
    } else if (this.pos >= this.length) {
      if (this.loop && this.length > 0) {
        this.pos = 0;
      } else {
        this.playing = false;
        this.stopping = false;
        this.pos = this.length;
      }
    }
  }

  private write(rec: Rec, w: number, x: number): void {
    const t = rec.track;
    if (w >= t.buf.length) {
      const grown = new Float32Array(Math.min(this.maxLen, Math.max(this.sampleRate * 30, t.buf.length * 2, w + 1)));
      grown.set(t.buf.subarray(0, t.len));
      t.buf = grown;
    }
    const old = w < t.len ? t.buf[w] : 0;
    rec.ring[w % this.fade] = old;
    // 録り始めは元の音からなめらかに入れ替える
    const g = rec.n < this.fade ? rec.n / this.fade : 1;
    t.buf[w] = old + (x - old) * g;
    if (rec.first < 0) rec.first = w;
    rec.n++;
    if (w >= t.len) {
      t.len = w + 1;
      if (t.len > this.length) this.length = t.len;
    }
    this.markDirty(t.id, w, w + 1);
  }

  private finishRec(): void {
    const rec = this.rec;
    if (!rec) return;
    this.rec = null;
    if (rec.n > 0) {
      // 録り終わりは元の音 (なければ無音) へなめらかに戻す
      const t = rec.track;
      const end = rec.first + rec.n;
      for (let k = 0; k < this.fade; k++) {
        const i = end - 1 - k;
        if (i < rec.first) break;
        const old = rec.ring[i % this.fade];
        t.buf[i] = old + (t.buf[i] - old) * (k / this.fade);
      }
      this.markDirty(t.id, Math.max(rec.first, end - this.fade), end);
    }
    this.events.push({ type: "recorded", id: rec.track.id });
  }

  private markDirty(id: number, from: number, to: number): void {
    const d = this.dirty;
    if (d && d.id === id) {
      if (from < d.from) d.from = from;
      if (to > d.to) d.to = to;
    } else {
      this.dirty = { id, from, to };
    }
  }

  // 0.5 秒を 1 回として 3 回測る。前半で周囲の音の大きさを測り、クリックを出して、戻ってくるまでを数える
  private processCalib(input: Float32Array | null, out: Float32Array): void {
    const sr = this.sampleRate;
    const cycle = Math.round(sr * 0.5);
    const quietFrom = Math.round(sr * 0.05);
    const clickAt = Math.round(sr * 0.15);
    const clickLen = Math.round(sr * 0.002);
    for (let i = 0; i < out.length; i++) {
      const c = this.calib;
      if (!c) {
        out[i] = 0;
        continue;
      }
      const x = input ? Math.abs(input[i]) : 0;
      if (x > this.level) this.level = x;
      const k = c.t - clickAt;
      if (k < 0) {
        if (c.t >= quietFrom && x > c.noise) c.noise = x;
        out[i] = 0;
      } else {
        out[i] = k < clickLen ? 0.8 * Math.sin((2 * Math.PI * 2000 * k) / sr) : 0;
        if (c.hit < 0 && x > Math.max(c.noise * 5, 0.02)) c.hit = k;
      }
      if (++c.t >= cycle) {
        if (c.hit >= 0) c.results.push(c.hit);
        c.t = 0;
        c.noise = 0;
        c.hit = -1;
        if (--c.cyclesLeft === 0) {
          const r = c.results.sort((a, b) => a - b);
          this.events.push({ type: "calibrated", latency: r.length >= 2 ? r[Math.floor(r.length / 2)] : null });
          this.calib = null;
        }
      }
    }
  }
}

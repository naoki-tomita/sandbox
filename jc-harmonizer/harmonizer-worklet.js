// マイク入力のピッチを検出し、MIDI で押されているノートの高さへ PSOLA でピッチシフトする AudioWorklet。
// 各ノートが 1 声部になるので、和音を押せばそのまま複数声部のハーモニーになる。
//
// 処理の流れ (128 サンプルのブロックごと):
//   1. 入力をリングバッファへ書き込む
//   2. 一定間隔で YIN によりピッチ (周期 T_in) を検出する
//   3. 入力上に周期 T_in 間隔の解析マークを打つ
//   4. 声部ごとに、目標周期 T_out 間隔で「最新の解析マークを中心に長さ 2*T_in の Hann 窓で切り出したグレイン」を並べる
// 遅延は解析マーク分の約 1.5〜2 周期 (100Hz の声で 15〜20ms 程度、200Hz なら 8〜10ms 程度) + ブラウザの入出力遅延。

const RING = 16384; // 入力リングバッファ (2 の冪)
const DEC_RING = 4096; // ピッチ検出用 1/2 間引きバッファ (2 の冪)
const MIN_HZ = 70;
const MAX_HZ = 1000;
const YIN_WINDOW = 256; // 間引き後のサンプル数
const YIN_THRESHOLD = 0.15;
const DETECT_HOP = 256; // 何サンプルごとにピッチ検出するか (元のレート)
const GATE_RMS = 0.005;
const MAX_VOICES = 8;
const GRAINS_PER_VOICE = 16;

class Voice {
  constructor(maxGrainLen) {
    this.period = 0; // 目標周期 (サンプル)
    this.gain = 0;
    this.env = 0;
    this.envTarget = 0;
    this.countdown = 0; // 次のグレインを置くまでのサンプル数
    this.grains = [];
    for (let i = 0; i < GRAINS_PER_VOICE; i++) {
      this.grains.push({ buf: new Float32Array(maxGrainLen), len: 0, pos: 0, active: false });
    }
  }
}

class HarmonizerProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.sr = sampleRate;

    this.buf = new Float32Array(RING);
    this.w = 0; // 書き込み済みサンプル数 (絶対位置)

    this.dbuf = new Float32Array(DEC_RING);
    this.dw = 0;
    this.dsr = this.sr / 2;
    this.minLag = Math.floor(this.dsr / MAX_HZ);
    this.maxLag = Math.ceil(this.dsr / MIN_HZ);
    this.lin = new Float32Array(YIN_WINDOW + this.maxLag);
    this.diff = new Float32Array(this.maxLag + 1);
    this.sinceDetect = 0;

    this.period = this.sr / 150; // 入力周期 T_in (未検出時はこの値のまま)
    this.voiced = false;
    this.mark = 0; // 最新の解析マーク (絶対位置, 小数)

    this.maxGrainLen = Math.ceil((2 * this.sr) / MIN_HZ) + 2;
    this.voices = new Map(); // note -> Voice
    this.pool = [];
    for (let i = 0; i < MAX_VOICES; i++) this.pool.push(new Voice(this.maxGrainLen));

    this.dry = 0;
    this.wet = 1;
    this.sinceReport = 0;

    this.port.onmessage = (e) => this.onMessage(e.data);
  }

  onMessage(msg) {
    if (msg.type === "noteOn") {
      let v = this.voices.get(msg.note);
      if (!v) {
        v = this.pool.pop();
        if (!v) return; // 声部数の上限
        v.env = 0;
        v.countdown = 0;
        for (const g of v.grains) g.active = false;
        this.voices.set(msg.note, v);
      }
      v.period = this.sr / (440 * Math.pow(2, (msg.note - 69) / 12));
      v.gain = msg.velocity / 127;
      v.envTarget = 1;
    } else if (msg.type === "noteOff") {
      const v = this.voices.get(msg.note);
      if (v) v.envTarget = 0;
    } else if (msg.type === "params") {
      this.dry = msg.dry;
      this.wet = msg.wet;
    }
  }

  write(input) {
    for (let i = 0; i < input.length; i++) {
      this.buf[this.w & (RING - 1)] = input[i];
      if (this.w & 1) {
        const a = this.buf[(this.w - 1) & (RING - 1)];
        this.dbuf[this.dw & (DEC_RING - 1)] = 0.5 * (a + input[i]);
        this.dw++;
      }
      this.w++;
    }
  }

  // YIN で周期を検出する。結果は元のサンプルレートでの周期。
  detect() {
    const W = YIN_WINDOW;
    const maxLag = this.maxLag;
    const start = this.dw - W - maxLag;
    if (start < 0) return;
    const lin = this.lin;
    for (let i = 0; i < W + maxLag; i++) lin[i] = this.dbuf[(start + i) & (DEC_RING - 1)];

    let energy = 0;
    for (let i = maxLag; i < W + maxLag; i++) energy += lin[i] * lin[i];
    if (Math.sqrt(energy / W) < GATE_RMS) {
      this.voiced = false;
      return;
    }

    // 最新のサンプルを窓の基準にするため、lin[maxLag..] と lin[maxLag - tau..] を比べる
    const d = this.diff;
    d[0] = 1;
    let running = 0;
    let found = -1;
    for (let tau = 1; tau <= maxLag; tau++) {
      let s = 0;
      for (let j = maxLag; j < W + maxLag; j++) {
        const x = lin[j] - lin[j - tau];
        s += x * x;
      }
      running += s;
      d[tau] = running > 0 ? (s * tau) / running : 1;
      if (found < 0 && tau >= this.minLag && d[tau] < YIN_THRESHOLD) found = tau;
    }
    if (found < 0) {
      this.voiced = false;
      return;
    }
    let tau = found;
    while (tau + 1 <= maxLag && d[tau + 1] < d[tau]) tau++;

    let t = tau;
    if (tau > 1 && tau < maxLag) {
      const a = d[tau - 1], b = d[tau], c = d[tau + 1];
      const den = a - 2 * b + c;
      if (den !== 0) t = tau + (0.5 * (a - c)) / den;
    }
    this.period = t * 2;
    this.voiced = true;
  }

  updateMarks() {
    const T = this.period;
    // マークは「マーク + T <= 書き込み位置」(= グレインの右端まで入力が届いている) を満たす最新のものにする
    if (this.w - this.mark > 4 * T || this.mark > this.w) this.mark = this.w - 2 * T;
    while (this.mark + 2 * T <= this.w) this.mark += T;
  }

  spawnGrain(v) {
    const g = v.grains.find((g) => !g.active);
    if (!g) return;
    const T = this.period;
    const len = Math.min(Math.floor(2 * T), this.maxGrainLen);
    const begin = this.mark - T;
    if (begin < 0) return;
    // Hann 窓 (長さ 2*T_in) を T_out 間隔で重ねると振幅が T_in/T_out 倍になるので補正する
    const norm = Math.min(v.period / T, 1);
    for (let i = 0; i < len; i++) {
      const p = begin + i;
      const i0 = Math.floor(p);
      const frac = p - i0;
      const x0 = this.buf[i0 & (RING - 1)];
      const x1 = this.buf[(i0 + 1) & (RING - 1)];
      const win = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / len);
      g.buf[i] = (x0 + (x1 - x0) * frac) * win * norm;
    }
    g.len = len;
    g.pos = 0;
    g.active = true;
  }

  process(inputs, outputs) {
    const input = inputs[0] && inputs[0][0];
    const out = outputs[0][0];
    const n = out.length;

    if (input) {
      this.write(input);
      this.sinceDetect += input.length;
      if (this.sinceDetect >= DETECT_HOP) {
        this.sinceDetect = 0;
        this.detect();
      }
      this.updateMarks();
    }

    for (let i = 0; i < n; i++) out[i] = input ? input[i] * this.dry : 0;

    const envStep = 1 / (0.005 * this.sr); // 5ms のアタック/リリース
    for (const [note, v] of this.voices) {
      for (let i = 0; i < n; i++) {
        if (--v.countdown <= 0) {
          if (input && this.w > 2 * this.period) this.spawnGrain(v);
          v.countdown += v.period;
        }
        let s = 0;
        for (const g of v.grains) {
          if (!g.active) continue;
          s += g.buf[g.pos++];
          if (g.pos >= g.len) g.active = false;
        }
        if (v.env < v.envTarget) v.env = Math.min(v.envTarget, v.env + envStep);
        else if (v.env > v.envTarget) v.env = Math.max(v.envTarget, v.env - envStep);
        out[i] += s * v.env * v.gain * this.wet;
      }
      if (v.envTarget === 0 && v.env === 0) {
        this.voices.delete(note);
        this.pool.push(v);
      }
    }

    for (let c = 1; c < outputs[0].length; c++) outputs[0][c].set(out);

    this.sinceReport += n;
    if (this.sinceReport >= this.sr / 20) {
      this.sinceReport = 0;
      this.port.postMessage({ type: "pitch", hz: this.voiced ? this.sr / this.period : 0 });
    }
    return true;
  }
}

registerProcessor("harmonizer", HarmonizerProcessor);

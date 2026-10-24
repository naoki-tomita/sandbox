// エフェクトチェーンに挿せるエフェクトの定義。
// create(ctx, opts) は { input, output, params, dispose, code? } を返す。
//   params: スライダーにする値の一覧 { key, label, min, max, step, value, set(v) }
//   code:   コードエフェクトだけが持つ、コードの差し替え口

function param(key, label, min, max, step, value, set) {
  set(value);
  return { key, label, min, max, step, value, set };
}

// input → (dry) → output と、input → [wet 側の処理] → (wet) → output を並べるミキサー
function mixer(ctx) {
  const input = ctx.createGain();
  const output = ctx.createGain();
  const dry = ctx.createGain();
  const wet = ctx.createGain();
  input.connect(dry).connect(output);
  wet.connect(output);
  const setMix = (v) => {
    dry.gain.value = 1 - v;
    wet.gain.value = v;
  };
  return { input, output, wet, setMix };
}

// 指数的に減衰するノイズでリバーブのインパルス応答を作る
function impulse(ctx, seconds) {
  const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  }
  return buf;
}

const CODE_TEMPLATE = `// 128 サンプルごとに呼ばれる。
// input / output: [L, R] の Float32Array
// state: 自由に使える保存領域 (コードを適用し直すと空に戻る)
// sr: サンプルレート / p.a, p.b, p.c: 下のスライダーの値 (0〜1)
for (let ch = 0; ch < 2; ch++) {
  for (let i = 0; i < output[ch].length; i++) {
    output[ch][i] = Math.tanh(input[ch][i] * (1 + p.a * 20)) * p.b * 2;
  }
}`;

const CODE_EXAMPLES = {
  "ディストーション": CODE_TEMPLATE,
  "トレモロ": `// p.a: 速さ / p.b: 深さ
state.phase ??= 0;
const rate = 0.5 + p.a * 15;
for (let i = 0; i < output[0].length; i++) {
  const g = 1 - p.b * (0.5 + 0.5 * Math.sin(state.phase));
  state.phase += (2 * Math.PI * rate) / sr;
  output[0][i] = input[0][i] * g;
  output[1][i] = input[1][i] * g;
}
state.phase %= 2 * Math.PI;`,
  "ビットクラッシャー": `// p.a: ビット数 / p.b: サンプルの間引き
const bits = 2 + Math.round(p.a * 14);
const step = 1 + Math.round(p.b * 30);
const q = Math.pow(2, bits - 1);
state.hold ??= [0, 0];
state.n ??= 0;
for (let i = 0; i < output[0].length; i++) {
  if (state.n++ % step === 0) {
    state.hold[0] = Math.round(input[0][i] * q) / q;
    state.hold[1] = Math.round(input[1][i] * q) / q;
  }
  output[0][i] = state.hold[0];
  output[1][i] = state.hold[1];
}`,
  "ピンポンディレイ": `// p.a: 時間 / p.b: フィードバック / p.c: ミックス
const size = sr * 2;
state.buf ??= [new Float32Array(size), new Float32Array(size)];
state.w ??= 0;
const d = Math.max(1, Math.floor(p.a * sr));
for (let i = 0; i < output[0].length; i++) {
  const r = (state.w - d + size) % size;
  const l = state.buf[0][r], rr = state.buf[1][r];
  state.buf[0][state.w] = input[0][i] + rr * p.b;
  state.buf[1][state.w] = l * p.b;
  output[0][i] = input[0][i] * (1 - p.c) + l * p.c;
  output[1][i] = input[1][i] * (1 - p.c) + rr * p.c;
  state.w = (state.w + 1) % size;
}`,
};

const EFFECTS = {
  reverb: {
    label: "リバーブ",
    create(ctx) {
      const m = mixer(ctx);
      const conv = ctx.createConvolver();
      m.input.connect(conv).connect(m.wet);
      return {
        input: m.input,
        output: m.output,
        params: [
          param("mix", "ミックス", 0, 1, 0.01, 0.3, m.setMix),
          param("decay", "長さ (秒)", 0.2, 6, 0.1, 2, (v) => (conv.buffer = impulse(ctx, v))),
        ],
        dispose() {},
      };
    },
  },

  delay: {
    label: "ディレイ",
    create(ctx) {
      const m = mixer(ctx);
      const delay = ctx.createDelay(2);
      const fb = ctx.createGain();
      m.input.connect(delay).connect(m.wet);
      delay.connect(fb).connect(delay);
      return {
        input: m.input,
        output: m.output,
        params: [
          param("mix", "ミックス", 0, 1, 0.01, 0.3, m.setMix),
          param("time", "時間 (ms)", 10, 2000, 1, 350, (v) => (delay.delayTime.value = v / 1000)),
          param("feedback", "フィードバック", 0, 0.95, 0.01, 0.4, (v) => (fb.gain.value = v)),
        ],
        dispose() {},
      };
    },
  },

  chorus: {
    label: "コーラス",
    create(ctx) {
      const m = mixer(ctx);
      const delay = ctx.createDelay(0.1);
      delay.delayTime.value = 0.015;
      const lfo = ctx.createOscillator();
      const depth = ctx.createGain();
      lfo.connect(depth).connect(delay.delayTime);
      lfo.start();
      m.input.connect(delay).connect(m.wet);
      return {
        input: m.input,
        output: m.output,
        params: [
          param("mix", "ミックス", 0, 1, 0.01, 0.5, m.setMix),
          param("rate", "速さ (Hz)", 0.05, 8, 0.01, 0.8, (v) => (lfo.frequency.value = v)),
          param("depth", "深さ (ms)", 0, 10, 0.1, 3, (v) => (depth.gain.value = v / 1000)),
        ],
        dispose() {
          lfo.stop();
        },
      };
    },
  },

  eq: {
    label: "3 バンド EQ",
    create(ctx) {
      const bands = [
        ["lowshelf", 200, "低域 (dB)"],
        ["peaking", 1000, "中域 (dB)"],
        ["highshelf", 4000, "高域 (dB)"],
      ].map(([type, freq, label]) => {
        const f = ctx.createBiquadFilter();
        f.type = type;
        f.frequency.value = freq;
        return { f, label };
      });
      bands[0].f.connect(bands[1].f).connect(bands[2].f);
      return {
        input: bands[0].f,
        output: bands[2].f,
        params: bands.map(({ f, label }, i) => param(`band${i}`, label, -18, 18, 0.5, 0, (v) => (f.gain.value = v))),
        dispose() {},
      };
    },
  },

  compressor: {
    label: "コンプレッサー",
    create(ctx) {
      const comp = ctx.createDynamicsCompressor();
      const makeup = ctx.createGain();
      comp.connect(makeup);
      return {
        input: comp,
        output: makeup,
        params: [
          param("threshold", "スレッショルド (dB)", -60, 0, 1, -24, (v) => (comp.threshold.value = v)),
          param("ratio", "レシオ", 1, 20, 0.5, 4, (v) => (comp.ratio.value = v)),
          param("makeup", "メイクアップ (dB)", 0, 24, 0.5, 6, (v) => (makeup.gain.value = Math.pow(10, v / 20))),
        ],
        dispose() {},
      };
    },
  },

  drive: {
    label: "ドライブ",
    create(ctx) {
      const shaper = ctx.createWaveShaper();
      shaper.oversample = "4x";
      const level = ctx.createGain();
      shaper.connect(level);
      const curve = (amount) => {
        const c = new Float32Array(1024);
        const k = 1 + amount * 50;
        for (let i = 0; i < c.length; i++) c[i] = Math.tanh(((i / (c.length - 1)) * 2 - 1) * k) / Math.tanh(k);
        return c;
      };
      return {
        input: shaper,
        output: level,
        params: [
          param("amount", "歪み", 0, 1, 0.01, 0.3, (v) => (shaper.curve = curve(v))),
          param("level", "音量", 0, 1.5, 0.01, 0.7, (v) => (level.gain.value = v)),
        ],
        dispose() {},
      };
    },
  },

  // ユーザーが書いたコードを code-effect-worklet.js の中で実行する
  code: {
    label: "コード (自作)",
    create(ctx, { source = CODE_TEMPLATE } = {}) {
      const node = new AudioWorkletNode(ctx, "code-effect", {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [2],
      });
      const code = {
        source,
        onResult: null, // (error: string | null) => void
        apply(src) {
          code.source = src;
          node.port.postMessage({ type: "code", source: src });
        },
      };
      node.port.onmessage = (e) => code.onResult && code.onResult(e.data.type === "error" ? e.data.message : null);
      const knob = (key) => param(key, key, 0, 1, 0.01, 0.5, (v) => node.port.postMessage({ type: "param", key, value: v }));
      code.apply(source);
      return { input: node, output: node, params: [knob("a"), knob("b"), knob("c")], code, dispose() {} };
    },
  },
};

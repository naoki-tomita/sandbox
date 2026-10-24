// エフェクトチェーンに挿せるエフェクトの定義。
// name はパネルに印刷するモジュール名、label は日本語の説明。
// create(ctx, opts) は { input, output, params, dispose, code? } を返す。
//   params: ノブにする値の一覧 { key, label, min, max, step, value, unit, set(v) }
//   code:   コードエフェクトだけが持つ、コードの差し替え口

import { CODE_TEMPLATE } from "./code-examples";

export interface Param {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  unit: string;
  set(v: number): void;
}

export interface CodeHandle {
  source: string;
  onResult: ((error: string | null) => void) | null;
  apply(source: string): void;
}

export interface Effect {
  input: AudioNode;
  output: AudioNode;
  params: Param[];
  dispose(): void;
  code?: CodeHandle;
}

export interface EffectDef {
  name: string;
  label: string;
  create(ctx: BaseAudioContext, opts?: { source?: string }): Effect;
}

function param(key: string, label: string, min: number, max: number, step: number, value: number, set: (v: number) => void, unit = ""): Param {
  set(value);
  return { key, label, min, max, step, value, unit, set };
}

// input → (dry) → output と、input → [wet 側の処理] → (wet) → output を並べるミキサー
function mixer(ctx: BaseAudioContext) {
  const input = ctx.createGain();
  const output = ctx.createGain();
  const dry = ctx.createGain();
  const wet = ctx.createGain();
  input.connect(dry).connect(output);
  wet.connect(output);
  const setMix = (v: number) => {
    dry.gain.value = 1 - v;
    wet.gain.value = v;
  };
  return { input, output, wet, setMix };
}

// 指数的に減衰するノイズでリバーブのインパルス応答を作る
function impulse(ctx: BaseAudioContext, seconds: number) {
  const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  }
  return buf;
}

export const EFFECTS: Record<string, EffectDef> = {
  reverb: {
    name: "REVERB",
    label: "リバーブ",
    create(ctx) {
      const m = mixer(ctx);
      const conv = ctx.createConvolver();
      m.input.connect(conv).connect(m.wet);
      return {
        input: m.input,
        output: m.output,
        params: [
          param("mix", "MIX", 0, 1, 0.01, 0.3, m.setMix),
          param("decay", "DECAY", 0.2, 6, 0.1, 2, (v) => (conv.buffer = impulse(ctx, v)), "s"),
        ],
        dispose() {},
      };
    },
  },

  delay: {
    name: "DELAY",
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
          param("mix", "MIX", 0, 1, 0.01, 0.3, m.setMix),
          param("time", "TIME", 10, 2000, 1, 350, (v) => (delay.delayTime.value = v / 1000), "ms"),
          param("feedback", "FDBK", 0, 0.95, 0.01, 0.4, (v) => (fb.gain.value = v)),
        ],
        dispose() {},
      };
    },
  },

  chorus: {
    name: "CHORUS",
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
          param("mix", "MIX", 0, 1, 0.01, 0.5, m.setMix),
          param("rate", "RATE", 0.05, 8, 0.01, 0.8, (v) => (lfo.frequency.value = v), "Hz"),
          param("depth", "DEPTH", 0, 10, 0.1, 3, (v) => (depth.gain.value = v / 1000), "ms"),
        ],
        dispose() {
          lfo.stop();
        },
      };
    },
  },

  eq: {
    name: "EQ",
    label: "3 バンド EQ",
    create(ctx) {
      const bands = (
        [
          ["lowshelf", 200, "LOW"],
          ["peaking", 1000, "MID"],
          ["highshelf", 4000, "HIGH"],
        ] as const
      ).map(([type, freq, label]) => {
        const f = ctx.createBiquadFilter();
        f.type = type;
        f.frequency.value = freq;
        return { f, label };
      });
      bands[0].f.connect(bands[1].f).connect(bands[2].f);
      return {
        input: bands[0].f,
        output: bands[2].f,
        params: bands.map(({ f, label }, i) => param(`band${i}`, label, -18, 18, 0.5, 0, (v) => (f.gain.value = v), "dB")),
        dispose() {},
      };
    },
  },

  compressor: {
    name: "COMP",
    label: "コンプレッサー",
    create(ctx) {
      const comp = ctx.createDynamicsCompressor();
      const makeup = ctx.createGain();
      comp.connect(makeup);
      return {
        input: comp,
        output: makeup,
        params: [
          param("threshold", "THRESH", -60, 0, 1, -24, (v) => (comp.threshold.value = v), "dB"),
          param("ratio", "RATIO", 1, 20, 0.5, 4, (v) => (comp.ratio.value = v), ":1"),
          param("makeup", "GAIN", 0, 24, 0.5, 6, (v) => (makeup.gain.value = Math.pow(10, v / 20)), "dB"),
        ],
        dispose() {},
      };
    },
  },

  drive: {
    name: "DRIVE",
    label: "ドライブ",
    create(ctx) {
      const shaper = ctx.createWaveShaper();
      shaper.oversample = "4x";
      const level = ctx.createGain();
      shaper.connect(level);
      const curve = (amount: number) => {
        const c = new Float32Array(1024);
        const k = 1 + amount * 50;
        for (let i = 0; i < c.length; i++) c[i] = Math.tanh(((i / (c.length - 1)) * 2 - 1) * k) / Math.tanh(k);
        return c;
      };
      return {
        input: shaper,
        output: level,
        params: [
          param("amount", "DRIVE", 0, 1, 0.01, 0.3, (v) => (shaper.curve = curve(v))),
          param("level", "LEVEL", 0, 1.5, 0.01, 0.7, (v) => (level.gain.value = v)),
        ],
        dispose() {},
      };
    },
  },

  // ユーザーが書いたコードを worklets/code-effect.js の中で実行する
  code: {
    name: "CODE",
    label: "自作コード",
    create(ctx, { source = CODE_TEMPLATE } = {}) {
      const node = new AudioWorkletNode(ctx, "code-effect", {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [2],
      });
      const code: CodeHandle = {
        source,
        onResult: null, // (error: string | null) => void
        apply(src) {
          code.source = src;
          node.port.postMessage({ type: "code", source: src });
        },
      };
      node.port.onmessage = (e) => code.onResult && code.onResult(e.data.type === "error" ? e.data.message : null);
      const knob = (key: string) => param(key, key.toUpperCase(), 0, 1, 0.01, 0.5, (v) => node.port.postMessage({ type: "param", key, value: v }));
      code.apply(source);
      return { input: node, output: node, params: [knob("a"), knob("b"), knob("c")], code, dispose() {} };
    },
  },
};

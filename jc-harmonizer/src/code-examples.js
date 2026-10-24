// コードエフェクトの初期テンプレートと、読み込める例。

export const CODE_TEMPLATE = `// 128 サンプルごとに呼ばれる。
// input / output: [L, R] の Float32Array
// state: 自由に使える保存領域 (コードを適用し直すと空に戻る)
// sr: サンプルレート / p.a, p.b, p.c: 上のノブ A / B / C の値 (0〜1)
for (let ch = 0; ch < 2; ch++) {
  for (let i = 0; i < output[ch].length; i++) {
    output[ch][i] = Math.tanh(input[ch][i] * (1 + p.a * 20)) * p.b * 2;
  }
}`;

export const CODE_EXAMPLES = {
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

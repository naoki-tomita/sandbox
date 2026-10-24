// アプリ内で書いたコードをエフェクトとして実行する AudioWorklet。
// コードは new Function で関数にして、128 サンプルのブロックごとに呼ぶ。
// コンパイルや実行でエラーになったら、エラーをメイン側に知らせて素通しにする。

// ユーザーのコードの形: (input, output, state, sr, p) => void
type UserCode = (input: Float32Array[], output: Float32Array[], state: object, sr: number, p: Record<string, number>) => void;

type Message = { type: "code"; source: string } | { type: "param"; key: string; value: number };

class CodeEffectProcessor extends AudioWorkletProcessor {
  fn: UserCode | null;
  state: object;
  p: Record<string, number>;
  input: Float32Array[];
  silence: Float32Array | null = null;

  constructor() {
    super();
    this.fn = null;
    this.state = {};
    this.p = { a: 0.5, b: 0.5, c: 0.5 };
    this.input = [];
    this.port.onmessage = (e: MessageEvent<Message>) => this.onMessage(e.data);
  }

  onMessage(msg: Message) {
    if (msg.type === "code") {
      try {
        this.fn = new Function("input", "output", "state", "sr", "p", msg.source) as UserCode;
        this.state = {};
        this.port.postMessage({ type: "ok" });
      } catch (e) {
        this.fn = null;
        this.port.postMessage({ type: "error", message: String(e) });
      }
    } else if (msg.type === "param") {
      this.p[msg.key] = msg.value;
    }
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][]) {
    const out = outputs[0];
    const n = out[0].length;
    const inp = inputs[0];
    if (!this.silence || this.silence.length !== n) this.silence = new Float32Array(n);
    // モノラル入力や無入力でも、コード側からは常に [L, R] に見せる
    this.input[0] = inp[0] || this.silence;
    this.input[1] = inp[1] || this.input[0];

    if (this.fn) {
      try {
        this.fn(this.input, out, this.state, sampleRate, this.p);
        return true;
      } catch (e) {
        this.fn = null;
        this.port.postMessage({ type: "error", message: String(e) });
      }
    }
    out[0].set(this.input[0]);
    out[1].set(this.input[1]);
    return true;
  }
}

registerProcessor("code-effect", CodeEffectProcessor);

export {};

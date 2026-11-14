import { describe, expect, it } from "vitest";
import { LooperEngine, PEAK_BUCKET } from "../src/engine";
import { encodeWav } from "../src/wav";

const SR = 8000;
const BLOCK = 128;

/** input(n) を n 番目の入力サンプルとして frames ぶん進め、出力を返す */
function run(e: LooperEngine, frames: number, input: (n: number) => number = () => 0, from = 0): Float32Array {
  const out = new Float32Array(frames);
  for (let at = 0; at < frames; at += BLOCK) {
    const n = Math.min(BLOCK, frames - at);
    const inp = new Float32Array(n);
    for (let i = 0; i < n; i++) inp[i] = input(from + at + i);
    e.process(inp, out.subarray(at, at + n));
  }
  return out;
}

/** トラック 1 に値 v を frames ぶん録音して、頭に戻す */
function recordFirst(e: LooperEngine, frames: number, v = 0.5): void {
  e.addTrack(1);
  e.record(1, 0);
  run(e, frames, () => v);
  e.stop();
  run(e, BLOCK * 2);
  e.seek(0);
}

describe("LooperEngine", () => {
  it("録音した長さがそのままトラックの長さになり、再生で同じ音が出る", () => {
    const e = new LooperEngine(SR);
    e.loop = false;
    recordFirst(e, 2048);
    expect(e.length).toBe(2048);
    expect(e.playing).toBe(false);
    expect(e.pos).toBe(0);

    e.play();
    const out = run(e, 2048 + BLOCK);
    expect(out[1000]).toBeCloseTo(0.5, 5);
    // 最後まで行ったら止まる
    expect(e.playing).toBe(false);
    expect(e.pos).toBe(2048);
    expect(out[2048 + 10]).toBe(0);
  });

  it("録音中はほかのトラックを再生し、録音先のトラックは鳴らさない", () => {
    const e = new LooperEngine(SR);
    e.loop = false;
    recordFirst(e, 2048, 0.5);
    e.addTrack(2);
    e.record(2, 0);
    expect(e.recordingId).toBe(2);
    const out = run(e, 1024, () => 0.25);
    expect(out[500]).toBeCloseTo(0.5, 5);
    e.stop();
    run(e, BLOCK * 2);
    expect(e.recordingId).toBe(null);
    expect(e.trackLengths()).toEqual([
      [1, 2048],
      [2, 1024],
    ]);

    // 両方を同時に再生すると足し合わされる
    e.seek(0);
    e.play();
    expect(run(e, 1024)[500]).toBeCloseTo(0.75, 5);
  });

  it("遅延補正のぶんだけ手前に書き込み、止めたあとも遅れて届く音を書き切る", () => {
    const e = new LooperEngine(SR);
    e.loop = false;
    e.addTrack(1);
    const latency = 300;
    e.record(1, latency);
    // 入力の n 番目は、再生位置 n - latency で鳴った音に合わせた演奏
    run(e, 1024, (n) => (n - latency === 700 ? 1 : 0));
    e.stop();
    run(e, 1024, (n) => (n - latency === 700 ? 1 : 0), 1024);
    expect(e.length).toBe(1024);

    e.seek(0);
    e.play();
    const out = run(e, 1024);
    const peakAt = out.indexOf(Math.max(...out));
    expect(peakAt).toBe(700);
  });

  it("ループ中の録音は一周で自動的に終わり、再生は続く", () => {
    const e = new LooperEngine(SR);
    recordFirst(e, 2048, 0.5);
    e.addTrack(2);
    e.seek(512);
    e.record(2, 0);
    run(e, 2048, () => 0.25);
    expect(e.recordingId).toBe(null);
    expect(e.playing).toBe(true);
    expect(e.length).toBe(2048);
    // 512 から終わりまでだけ録れている
    expect(e.trackLengths()[1]).toEqual([2, 2048]);
    e.stop();
    run(e, BLOCK * 2);
    e.seek(0);
    e.play();
    const out = run(e, 2048);
    expect(out[200]).toBeCloseTo(0.5, 5);
    expect(out[1000]).toBeCloseTo(0.75, 5);
  });

  it("ループ再生は終わりで頭に戻る", () => {
    const e = new LooperEngine(SR);
    recordFirst(e, 1000);
    e.play();
    run(e, 1000 + 256);
    expect(e.playing).toBe(true);
    expect(e.pos).toBe(256);
  });

  it("シークした位置から録音すると、その前後の元の音は残る", () => {
    const e = new LooperEngine(SR);
    e.loop = false;
    recordFirst(e, 4096, 0.5);
    e.seek(1024);
    e.record(1, 0);
    run(e, 1024, () => -0.5);
    e.stop();
    run(e, BLOCK * 2);
    expect(e.length).toBe(4096);
    e.seek(0);
    e.play();
    const out = run(e, 4096);
    expect(out[500]).toBeCloseTo(0.5, 5);
    expect(out[1500]).toBeCloseTo(-0.5, 5);
    expect(out[3000]).toBeCloseTo(0.5, 5);
  });

  it("ミュートしたトラックは鳴らず、ソロがあればソロだけが鳴る", () => {
    const e = new LooperEngine(SR);
    e.loop = false;
    recordFirst(e, 2048, 0.5);
    e.addTrack(2);
    e.record(2, 0);
    run(e, 2048, () => 0.25);
    e.stop();
    run(e, BLOCK * 2);

    e.setTrack(1, true, false);
    e.seek(0);
    e.play();
    expect(run(e, 1024)[1000]).toBeCloseTo(0.25, 5);
    expect(e.mixdown()![1000]).toBeCloseTo(0.25, 5);

    e.stop();
    run(e, BLOCK * 2);
    e.setTrack(1, false, true);
    e.seek(0);
    e.play();
    expect(run(e, 1024)[1000]).toBeCloseTo(0.5, 5);
    expect(e.mixdown()![1000]).toBeCloseTo(0.5, 5);
  });

  it("書き換わった範囲のピークを返す", () => {
    const e = new LooperEngine(SR);
    e.addTrack(1);
    e.record(1, 0);
    run(e, PEAK_BUCKET * 4, () => 0.5);
    const p = e.takePeaks()!;
    expect(p.id).toBe(1);
    expect(p.start).toBe(0);
    expect(p.data.length).toBe(4);
    expect(p.data[2]).toBeCloseTo(0.5, 5);
    expect(e.takePeaks()).toBe(null);
  });

  it("トラックを消すと全体の長さが縮む", () => {
    const e = new LooperEngine(SR);
    e.loop = false;
    recordFirst(e, 2048);
    e.addTrack(2);
    e.seek(2048);
    e.record(2, 0);
    run(e, 1024, () => 0.1);
    e.stop();
    run(e, BLOCK * 2);
    expect(e.length).toBe(3072);
    e.removeTrack(2);
    expect(e.length).toBe(2048);
    expect(e.pos).toBe(2048);
  });

  it("出したクリックが入力に戻るまでの遅れを測る", () => {
    const e = new LooperEngine(SR);
    const delay = 400;
    const history: number[] = [];
    e.calibrate();
    for (let n = 0; n < SR * 2 && e.calibrating; n += BLOCK) {
      const inp = new Float32Array(BLOCK);
      for (let i = 0; i < BLOCK; i++) inp[i] = (history[n + i - delay] ?? 0) * 0.5;
      const out = new Float32Array(BLOCK);
      e.process(inp, out);
      history.push(...out);
    }
    const ev = e.events.find((ev) => ev.type === "calibrated");
    expect(ev).toBeDefined();
    const latency = (ev as { latency: number }).latency;
    expect(Math.abs(latency - delay)).toBeLessThan(4);
  });
});

describe("encodeWav", () => {
  it("ヘッダーと 16bit のサンプルを書き出す", () => {
    const wav = new DataView(encodeWav(new Float32Array([0, 1, -1, 2]), 48000));
    expect(wav.byteLength).toBe(44 + 8);
    expect(wav.getUint32(24, true)).toBe(48000);
    expect(wav.getInt16(44, true)).toBe(0);
    expect(wav.getInt16(46, true)).toBe(32767);
    expect(wav.getInt16(48, true)).toBe(-32768);
    expect(wav.getInt16(50, true)).toBe(32767);
  });
});

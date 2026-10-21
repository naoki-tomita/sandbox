# Harmonizer PoC

Jacob Collier 風ハーモナイザーの実証用最小実装。マイク入力の声を、MIDI で押したノートの高さに変えて出力する。和音を押すと押した数だけ声部が出る。

## 動かし方

```sh
cd harmonizer
python3 -m http.server 8000
```

Chrome / Edge で http://localhost:8000 を開き、Start を押す。マイクと MIDI の許可を求められるので許可する。
ハウリングするのでイヤホン/ヘッドホンを使うこと。MIDI 機器が無い場合は PC キーボードの `A W S E D F T G Y H U J K` で C4〜C5 が弾ける。

## 仕組み

- `index.html`: マイク・Web MIDI の取得と UI。ノートオン/オフを AudioWorklet に送るだけ。
- `harmonizer-worklet.js`: 音声処理。128 サンプルごとに
  1. YIN で入力のピッチ (周期 T_in) を検出
  2. 入力に T_in 間隔の解析マークを打つ
  3. ノートごとに、目標周期 T_out 間隔で「解析マークを中心に 2*T_in の Hann 窓で切り出したグレイン」を重ねる (TD-PSOLA)

  PSOLA は波形の切り貼りなのでフォルマント (声色) が保たれ、FFT を使わないので遅延が小さい。

## 遅延

- ピッチシフト自体: 入力 1.5〜2 周期分 (声 200Hz で約 8〜10ms、100Hz で約 15〜20ms)
- ブラウザの入出力: `latencyHint: 0` と、マイクのエコーキャンセル等の無効化で最小化している。画面に base/output latency を表示する。macOS の Chrome が最も短い傾向。

## 既知の制限 (PoC なので未対応)

- 子音や息など無声音は周期が取れないので、直前の周期で切り貼りされる
- 解析マークを波形のピークに合わせていないので、ピッチが急に動くと少し濁る
- ピッチ検出のオクターブ誤り対策なし

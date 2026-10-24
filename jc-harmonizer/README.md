# Harmonizer PoC

Jacob Collier 風ハーモナイザーの実証用最小実装。マイク入力の声を、MIDI で押したノートの高さに変えて出力する。和音を押すと押した数だけ声部が出る。

## 動かし方

```sh
cd jc-harmonizer
python3 -m http.server 8000
```

Chrome / Edge で http://localhost:8000 を開き、Start を押す。マイクと MIDI の許可を求められるので許可する。
ハウリングするのでイヤホン/ヘッドホンを使うこと。MIDI 機器が無い場合は画面の鍵盤 (マルチタッチで和音可) か、PC キーボードの `A W S E D F T G Y H U J K` で C4〜C5 が弾ける。

### スマホ

https で開けばスマホでも動く (プレビュー/本番の URL)。

- iPhone (Safari) は Web MIDI 非対応なので画面の鍵盤で弾く。Android の Chrome は USB MIDI 機器も使える。
- Bluetooth イヤホンは遅延が 100〜200ms 程度増える。

## エフェクト

Start 後、画面下の「エフェクト」から追加する。ハーモナイザーの後ろに上から順にかかり、↑↓ で並べ替え、ON で切り替え、✕ で外せる。

- 内蔵: リバーブ / ディレイ / コーラス / 3 バンド EQ / コンプレッサー / ドライブ (`effects.js`)
- コード (自作): JS を書いて「適用」するとその場で差し替わる (`code-effect-worklet.js` で実行)。

  ```js
  // 128 サンプルごとに呼ばれる。input / output は [L, R] の Float32Array
  // state: 自由に使える保存領域, sr: サンプルレート, p.a / p.b / p.c: スライダー (0〜1)
  for (let ch = 0; ch < 2; ch++)
    for (let i = 0; i < output[ch].length; i++)
      output[ch][i] = Math.tanh(input[ch][i] * (1 + p.a * 20));
  ```

  エラーになったら素通しになり、内容が表示される。無限ループは音声処理ごと止まるのでページを再読み込みする。
  「名前をつけて保存」でブラウザ (localStorage) に保存され、エフェクトの一覧から呼び出せる。

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

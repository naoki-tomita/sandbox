# Harmonizer PoC

Jacob Collier 風ハーモナイザーの実証用最小実装。マイク入力の声を、MIDI で押したノートの高さに変えて出力する。和音を押すと押した数だけ声部が出る。

## 動かし方

```sh
cd jc-harmonizer
python3 -m http.server 8000
```

Chrome / Edge で http://localhost:8000 を開き、POWER を押す。マイクと MIDI の許可を求められるので許可する。
ハウリングするのでイヤホン/ヘッドホンを使うこと。MIDI 機器が無い場合は画面の鍵盤 (マルチタッチで和音可) か、PC キーボードの `A W S E D F T G Y H U J K` で C4〜C5 が弾ける。

### スマホ

https で開けばスマホでも動く (プレビュー/本番の URL)。

- iPhone (Safari) は Web MIDI 非対応なので画面の鍵盤で弾く。Android の Chrome は USB MIDI 機器も使える。
- Bluetooth イヤホンは遅延が 100〜200ms 程度増える。

## ラックとケーブル

画面はモジュラーシンセのラックになっていて、MIC → HARMONIZER → OUTPUT がケーブルでつながった状態で始まる。音はケーブルのとおりに流れる (`src/rack.js`)。

- ジャックからドラッグして別のジャックで離すとケーブルがつながる (OUT → IN)。1 つの OUT から何本でも出せ、1 つの IN に何本入れても混ざる
- IN ジャックからドラッグするとケーブルを引き抜ける。別の IN で離すと挿し替え、何もない所で離すと外れる
- ループになるつなぎ方はできない
- ADD MODULE でエフェクトを追加すると、OUTPUT の手前に差し込まれる。「外す」で抜くと前後がつながり直る
- ノブは上下ドラッグ (Shift で細かく)、矢印キーでも回せる。ダブルクリックで初期値に戻る

### エフェクト

- 内蔵: リバーブ / ディレイ / コーラス / 3 バンド EQ / コンプレッサー / ドライブ (`src/effects.js`)
- コード (自作): JS を書いて「適用」するとその場で差し替わる (`worklets/code-effect.js` で実行)。

  ```js
  // 128 サンプルごとに呼ばれる。input / output は [L, R] の Float32Array
  // state: 自由に使える保存領域, sr: サンプルレート, p.a / p.b / p.c: ノブ A / B / C (0〜1)
  for (let ch = 0; ch < 2; ch++)
    for (let i = 0; i < output[ch].length; i++)
      output[ch][i] = Math.tanh(input[ch][i] * (1 + p.a * 20));
  ```

  エラーになったら素通しになり、内容が表示される。無限ループは音声処理ごと止まるのでページを再読み込みする。
  「保存」でブラウザ (localStorage) に保存され、ADD MODULE の一覧から呼び出せる。

## ファイル

```
index.html              マークアップだけ
styles/app.css          配色・書体のトークン、ページ全体、上段のレール
styles/rack.css         ラック・モジュール・ノブ・ジャック・ケーブル
styles/keyboard.css     鍵盤
src/main.js             起動。音声の準備、固定モジュール (MIC / HARMONIZER / OUTPUT)、鍵盤・MIDI・電源の結線
src/rack.js             モジュールとパッチケーブル。ケーブルのとおりにノードを接続する
src/effect-module.js    エフェクトをモジュールとして組み立てる (ON/OFF・ノブ・コード欄)
src/effects.js          内蔵エフェクトの定義
src/code-examples.js    自作コードのテンプレートと例
src/presets.js          自作コードの保存 (localStorage)
src/widgets.js          ノブ・表示窓・レベルメーター
src/keyboard.js         画面鍵盤と PC キーボード
src/midi.js             Web MIDI 入力
src/notes.js, dom.js    音名の変換、DOM の小道具
worklets/harmonizer.js  ハーモナイザーの音声処理 (下記)
worklets/code-effect.js 自作コードを実行する音声処理
```

## 仕組み

- `worklets/harmonizer.js`: 音声処理。128 サンプルごとに
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

# Harmonizer PoC

Jacob Collier 風ハーモナイザーの実証用最小実装。マイク入力の声を、MIDI で押したノートの高さに変えて出力する。和音を押すと押した数だけ声部が出る。

## 動かし方

TypeScript + Vite。

```sh
cd jc-harmonizer
npm install
npm run dev        # 開発サーバー (表示された URL を開く)
npm run typecheck  # 型チェックだけ
npm run build      # 型チェック + dist/ へビルド
```

Chrome / Edge で開いて POWER を押す。マイクと MIDI の許可を求められるので許可する。
ハウリングするのでイヤホン/ヘッドホンを使うこと。MIDI 機器が無い場合は画面の鍵盤 (マルチタッチで和音可) か、PC キーボードの `A W S E D F T G Y H U J K` で C4〜C5 が弾ける。

### スマホ

https で開けばスマホでも動く (プレビュー/本番の URL)。

- iPhone (Safari) は Web MIDI 非対応なので画面の鍵盤で弾く。Android の Chrome は USB MIDI 機器も使える。
- Bluetooth イヤホンは遅延が 100〜200ms 程度増える。

## ラックとケーブル

画面はモジュラーシンセのラックになっていて、MIC → HARMONIZER → OUTPUT がケーブルでつながった状態で始まる。音はケーブルのとおりに流れる (`src/patchbay.ts`)。

- ジャックからドラッグして別のジャックで離すとケーブルがつながる (OUT → IN)。1 つの OUT から何本でも出せ、1 つの IN に何本入れても混ざる
- IN ジャックからドラッグするとケーブルを引き抜ける。別の IN で離すと挿し替え、何もない所で離すと外れる
- ループになるつなぎ方はできない
- ADD MODULE でエフェクトを追加すると、OUTPUT の手前に差し込まれる。「外す」で抜くと前後がつながり直る
- ノブは上下ドラッグ (Shift で細かく)、矢印キーでも回せる。ダブルクリックで初期値に戻る

### エフェクト

- 内蔵: リバーブ / ディレイ / コーラス / 3 バンド EQ / コンプレッサー / ドライブ (`src/effects.ts`)
- コード (自作): JS を書いて「適用」するとその場で差し替わる (`worklets/code-effect.ts` で実行)。

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

画面は [zheleznaya](https://github.com/naoki-tomita/zheleznaya) のコンポーネント (JSX) で描く。

```
index.html                 土台 (#app) だけ
styles/                    配色・書体 (app.css)、ラック (rack.css)、鍵盤 (keyboard.css)
src/main.tsx               起動。固定モジュール (MIC / HARMONIZER / OUTPUT) を置いてつなぎ、画面を描く
src/state.ts               アプリの状態と再描画 (update / relayout)
src/components/App.tsx     画面全体と上段のレール (名前・MIDI・電源)
src/components/Rack.tsx    ラックとモジュールのパネル、ADD MODULE
src/components/Knob.tsx    ノブ
src/components/Keyboard.tsx 画面鍵盤と PC キーボード
src/actions.ts             画面からの操作 (電源・ノート・エフェクトの追加・保存)
src/patchbay.ts            モジュールとケーブルの出し入れ。ケーブルのとおりにノードを接続する
src/cables.ts              ケーブルの描画とドラッグ (SVG を直接 DOM で描く)
src/display.ts             メーター・入力ピッチ・MIDI の LED (ref で直接書き換える)
src/audio.ts               AudioContext・ハーモナイザー・マイク
src/effects.ts             内蔵エフェクトの定義
src/code-examples.ts       自作コードのテンプレートと例
src/presets.ts             自作コードの保存 (localStorage)
src/midi.ts                Web MIDI 入力
src/notes.ts, util.ts      音名の変換、小さな道具
worklets/harmonizer.ts     ハーモナイザーの音声処理 (下記)
worklets/code-effect.ts    自作コードを実行する音声処理
tsconfig.json              src/ 用 (DOM の型、JSX は zheleznaya の h)
tsconfig.worklet.json      worklets/ 用 (AudioWorklet の型。DOM の型とぶつかるので分けている)
vite.config.ts             ビルド設定。worklet は ?worker&url で単体のスクリプトとして出力する
```

### zheleznaya (0.3.5) で避けていること

[issue #20](https://github.com/naoki-tomita/zheleznaya/issues/20) のうち 0.3.5 でも残っているものを、アプリ側で次のように避けている。

- ケーブル (SVG) は子を持たない要素を ref で受け取り、その中に直接 DOM で描く。`<svg>` の子要素が SVG の名前空間で作られないため
- 状態は普通のオブジェクト (`state`) に持ち、store には再描画のきっかけになる `version` だけを置く。store の Set を add / delete しても再描画されないため
- メーター・入力ピッチ・MIDI の LED も ref で直接書き換える。毎フレーム store を変えるとアプリ全体が再描画されるため

## 仕組み

- `worklets/harmonizer.ts`: 音声処理。128 サンプルごとに
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

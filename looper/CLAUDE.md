# CLAUDE.md — looper

このファイルは Claude Code がこのディレクトリを扱う際の指針です。

## 概要

Mac/Linux 対応のオーバーダブ型ルーパー。マイク入力を複数トラックに重ね録りし、
ミュート・削除・再生できるデスクトップアプリ。**低レイテンシー（特にオーバーダブ中の
「返し」= ループを聴きながら録る際の同期）を最優先**とするため、音声処理は Web Audio では
なく **Tauri のネイティブ Rust バックエンド（cpal）** で行い、WebView は UI 専用にしている。

このアプリはネイティブバイナリ（`.app`/`.dmg`/`.AppImage`/`.deb`）を生成するため、リポジトリ
ルートの GitHub Pages / Cloudflare Pages 配信パイプラインには**載せていない**（`index.html`
ポータルにもリンクしない）。

## アーキテクチャ

```
looper/
  src/                    フロントエンド（Vanilla TS、UI 専用）
    types.ts              Rust の serde 表現に対応する型
    api.ts                invoke() の型付きラッパ
    ui.ts                 DOM 描画（状態を持たない純出力関数）
    main.ts               エントリ。UIイベント→api、getStatus をポーリングして反映
  src-tauri/
    src/main.rs           Tauri setup、#[tauri::command] 群、State=Mutex<Manager>
    src/manager.rs        LooperManager（非RT）: トラック一覧の真実の情報源。コマンドを音声へ転送
    src/audio.rs          cpal 入出力ストリーム構築、リングバッファ配線、Engine 駆動
    crates/engine/        純粋 DSP コア（tauri/cpal 非依存・ユニットテスト対象）
```

### 低レイテンシー設計（audio.rs）

cpal の `Stream` は多くの環境で `!Send` なので、専用スレッド内で生成・保持し、他スレッドへ
渡さない。UI とは Send なチャネル / atomics のみでやり取りする。

- **入力コールバック**: マイクをモノラル化し lock-free リングバッファ（`ringbuf`）へ push。
- **出力コールバック**（エンジンの唯一の所有者）: ①UI→音声コマンド（`crossbeam-channel`）を
  drain → ②リングから mic を pop → ③録音中なら armed トラックへ書き込み → ④非ミュートトラックを
  合算し全チャンネルへ出力 → ⑤状態を atomics に publish。
- **RT安全性**: 出力コールバック内で allocation/lock をしない。トラックバッファは非RT側で
  `MAX_LOOP_SECONDS`（60秒）分を確保し、コマンドで move する。削除バッファは回収チャネルで
  非RT側 drop。

### レイテンシー補正（engine.rs）

オーバーダブは、モニタリング→発音→入力の往復遅延ぶん録音が後ろへずれる。これを打ち消すため、
入力サンプルを `comp` フレーム **早い** 位置 `(playhead - comp) mod loop_len` へ書き込む。
`comp` は出力ブロックサイズから概算（実測は困難なため推定値。実機で調整の余地あり）。

### 仕様（engine.rs）

- ループ長は「最初に録音したトラック」の長さで確定（`loop_len==0` の間の録音が定義する）。
- オーバーダブはループ 1 周ぶん録ると自動停止（= 最大時間到達）。1本目は容量到達 or 手動停止。
- 上書き録音は対象トラックのバッファをゼロ消去してから録り直す。
- ミュート/解除は再生中もライブに切替（ミックスループが毎サンプル参照）。
- 全トラック削除でループ長リセット。長さを定義した1本目を消しても他が残ればループ長維持。

## ビルド・開発

```bash
npm install
npm run tauri dev      # 開発起動（vite + tauri）
npm run tauri build    # ネイティブバイナリ生成
npm run build          # フロントエンドのみ（tsc + vite build）
```

前提: Rust toolchain、Node 24（ルート `.nvmrc`）。
Linux は `libwebkit2gtk-4.1-dev` / `libasound2-dev` 等、mac は Xcode CLT。詳細は README.md。

## テスト

DSP コアはハードウェア非依存でユニットテストできる:

```bash
cd src-tauri && cargo test -p engine
```

CI（`.github/workflows/looper.yml`）はこの engine テストのみを走らせる（tauri/cpal/webkit の
システム依存を CI に持ち込まないため）。

## 既知の前提・制約（v1）

- 入力/出力の既定サンプルフォーマットは f32、サンプルレートは一致している前提（リサンプリング未対応）。
- レイテンシー補正はブロックサイズからの概算。

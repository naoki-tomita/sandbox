# Looper

Mac / Linux 対応のオーバーダブ型ルーパー。マイク入力を複数トラックに重ね録りし、
ミュート・削除・再生できるデスクトップアプリです。低レイテンシーを重視し、音声処理は
Tauri のネイティブ Rust バックエンド（[cpal](https://github.com/RustAudio/cpal)）で行います。

## 機能

- マイク入力を選択トラックへ録音（トラックは無制限に追加可能）
- トラックを選んで**上書き録音**（古い録音は消去）
- ループ全体の長さは**最初に録音したトラック**で確定
- オーバーダブはループ 1 周（最大時間）で自動停止
- トラックのミュート／解除（**再生中でもライブに切替**）
- トラック削除
- 往復レイテンシー補正でオーバーダブをループに同期

## 必要環境

- [Rust](https://www.rust-lang.org/tools/install)（stable）
- Node.js 24（リポジトリルートの `.nvmrc` 参照）

### Linux の追加パッケージ（Debian/Ubuntu の例）

```bash
sudo apt-get install -y \
  libwebkit2gtk-4.1-dev libgtk-3-dev librsvg2-dev \
  libsoup-3.0-dev libjavascriptcoregtk-4.1-dev \
  libasound2-dev pkg-config build-essential
```

### macOS

Xcode Command Line Tools（`xcode-select --install`）。初回起動時にマイク使用許可を求められます。

## 開発・ビルド

```bash
npm install

# 開発起動（ホットリロード）
npm run tauri dev

# ネイティブバイナリを生成（Linux: .AppImage/.deb、macOS: .app/.dmg）
#   アイコン一式を作り直す場合は先に `npm run tauri icon src-tauri/icons/icon.png`
npm run tauri build
```

## 使い方

1. **＋ Add Track** でトラックを追加。
2. そのトラックの **● Rec** で録音開始。最初の録音の長さがループ長になります
   （**■ Stop** で停止、または最大 60 秒で自動停止）。
3. 別トラックを追加して **● Rec** すると、ループを聴きながらオーバーダブできます。
   1 周ぶん録ると自動で停止します。
4. **Mute** で各トラックをミュート／解除（再生中も可）。**🗑** で削除。
5. **▶ Play / ⏸ Stop** でループ再生を切り替え。

## テスト

DSP コアはオーディオハードウェア無しでユニットテストできます:

```bash
cd src-tauri && cargo test -p engine
```

## 制約（v1）

- 入力/出力の既定サンプルフォーマットは f32、サンプルレートは一致している前提です
  （リサンプリング未対応）。
- レイテンシー補正は出力ブロックサイズからの概算です。環境により微調整の余地があります。

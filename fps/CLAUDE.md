# CLAUDE.md — fps

このファイルは Claude Code がこのディレクトリを扱う際の指針です。

## アーキテクチャ

Vite + TypeScript 構成。ビルドは `tsc && vite build`。

### src/ のモジュール構成

依存方向は一方向で循環なし:

```
main.ts → Game.ts → { world, input, player, weapon, enemies, ui } → { config, types, utils }
```

| ファイル | 責務 |
|---|---|
| `config.ts` | 全定数・迷路データ（値はここに集約） |
| `types.ts` | 共有型定義（GameState, Enemy, Bullet, WallBox…） |
| `utils.ts` | 汎用ユーティリティ（shuffleArr） |
| `world.ts` | `World` クラス: レベルジオメトリ・照明・AABB 衝突判定 |
| `input.ts` | `Input` クラス: キーボード・マウス・ポインターロック管理 |
| `player.ts` | `Player` クラス: HP/弾薬/スコア等の状態 + 移動・カメラ姿勢 |
| `weapon.ts` | `Weapon` クラス: 銃モデル・発射機構・リロード・リコイル・弾道 |
| `enemies.ts` | `EnemyManager` クラス: スポーン・AI ステートマシン・敵弾 |
| `ui.ts` | DOM 操作の集約（純粋な出力。状態を持たない関数モジュール） |
| `Game.ts` | `Game` クラス: コンポジションルート。ゲームループ・フロー管理 |
| `main.ts` | エントリポイント: `new Game(canvas)` |

### 設計方針

- **Game がコンポジションルート**: サブシステムへの参照は Game のコンストラクタで生成し、update 等に引数として渡す。
- **シーングラフと状態を完全分離しない**: mesh の生成/削除はサブシステム内に閉じる。論理状態（hp, ammo…）はプレーンなフィールドで持つ。
- **過剰設計はしない**: ECS・イベントバス・DI なし。このサイズのゲームに見合った素直な分割。

## ビルド・開発

```bash
npm run dev      # 開発サーバ起動
npm run build    # tsc + vite build
npm run preview  # /sandbox/fps/ パスのビルド成果物を確認
```

## デプロイ

`main` ブランチへのマージで `.github/workflows/deploy.yml` が起動し、
`fps/dist/` を GitHub Pages の `/sandbox/fps/` に配置する。

`vite.config.ts` の `base: '/sandbox/fps/'` がこのパスに対応する。

## three.js バージョンについて

`three@0.134.0` に固定している。r152 のカラーマネジメント変更・r155 のライト強度変更以降は見た目が変わるため、バージョンを上げる際は動作確認が必要。

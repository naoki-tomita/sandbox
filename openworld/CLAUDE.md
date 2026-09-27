# CLAUDE.md — openworld

3D オープンワールド（探索・アクションRPG を目指す）のプロトタイプ。現段階は **ゲームシステムの土台** と、
**AI（Claude）が手で書くワールドデータ** の仕組みまで。

## ビルド・開発

```bash
npm run dev             # 開発サーバ（world/*.json を編集すると自動リロード）
npm run build           # tsc + vite build
npm test                # vitest（worldgen の純関数・当たり判定の座標系・world/ のデータ検証）
npm run world:validate  # ワールドデータの検証と警告（-- --probe x,z で地点の高さを表示 / -- --strict で警告を失敗扱い）
npm run world:preview   # 俯瞰画像を preview/ に出力（-- --region 名前 / -- --area x0,z0,x1,z1 / --width px）
```

`main` へのマージで `.github/workflows/deploy.yml` が GitHub Pages の `/sandbox/openworld/` に配置する
（`vite.config.ts` の `base`）。PR では `test.yml` がテストと `world:validate -- --strict` を実行する。

## アーキテクチャ

three.js（描画）+ Rapier（`@dimforge/rapier3d-compat`、物理）の上に薄い自作エンジン層を載せている。

```
main.ts → Game.ts → { core, physics, world, player, debug } → worldgen → core/random
```

| 場所 | 責務 |
|---|---|
| `src/config.ts` | 全定数（チャンク、移動、カメラ、時間、影…） |
| `src/core/Loop.ts` | 固定ステップ(60Hz)の物理 + 可変フレーム描画（補間 alpha） |
| `src/core/Input.ts` | キーボード/マウス → アクション（moveX/moveZ, jump, sprint, look）。タッチはここに足す |
| `src/physics/Physics.ts` | Rapier World の薄いラッパー。重力はキャラ側で扱う |
| `src/worldgen/` | **three/Rapier 非依存の純 TS**。ブラウザ・Node(CLI/テスト)共用 |
| `  schema.ts` | world.json / regions/*.json の型と実行時バリデーション（誤りを全件、パス付きで報告） |
| `  ops.ts` | 地形編集オペ。`compose.ts` が下地ノイズ + 全オペ → 高さグリッド・地表・水・配置物 |
| `  checks.ts` | 見た目の破綻の検出（水が浮く、建物が急斜面、id 重複…） |
| `  catalog.ts` / `surface.ts` | 配置物の種類と寸法・当たり判定 / 地表の種類と色 |
| `src/world/ChunkManager.ts` | 遠景（全体の低解像度メッシュ）+ 周辺の詳細チャンク + さらに狭い範囲の当たり判定 |
| `src/world/textures.ts` | テクスチャの手続き生成（地表 8 種 + 配置物の模様 6 種、色ムラ、水の法線）。起動時に Worker (`textureWorker.ts`) で生成 |
| `src/world/terrainMaterial.ts` | 地形シェーダー。頂点の地表の重み + テクスチャ配列を画素ごとに高さで混ぜる、急斜面は岩（三方向投影）、バンプ |
| `src/world/Grass.ts` | プレイヤー周辺の草（GPU インスタンシング。高さ・密度テクスチャから配置、風で揺れる、花） |
| `src/world/Props.ts` | 配置物を 256m 区画 × 種類 × パーツで InstancedMesh にまとめて描画。模様はワールド座標の三方向投影 |
| `src/world/Water.ts` / `Sky.ts` | 水面（波の法線 + 空の映り込み） / 空・太陽・影・フォグ・昼夜・環境マップ |
| `src/player/` | Rapier のキネマティック・キャラクターコントローラ、仮アバター、三人称カメラ |
| `src/debug/` | F3 の HUD、T のフリーカメラ |
| `scripts/` | Node 用 CLI（validate / preview）。`loadWorld.ts` はテストも使う |

設計方針:
- **Game がコンポジションルート**。ECS・イベントバス・DI はまだ入れない（必要になってから）。
- **worldgen は純関数**。描画・物理から切り離し、決定的（同じ入力 → 同じ結果）に保つ。
- 当たり判定はプレイヤー周辺（`physicsRadius`）だけ。フリーカメラ移動中は作らない。
- 遠景メッシュは詳細チャンクが敷き詰まった半径の内側をシェーダーで discard して重なりを避けている。
- Rapier の heightfield は **z 方向の添字が最も速く変わる** 並び（`ChunkManager.buildColliders`）。`test/physics.test.ts` で担保。

### URL パラメータ（動作確認用）

`?x=..&z=..` 開始位置、`&facing=度`、`&t=時`、`&debug=1`（HUD と marker）、
`&free=1&h=高さ&pitch=見下ろす角度`（フリーカメラで開始）、`&autoplay=1`（ポインターロックなしで開始。自動テスト用）、
`&quality=low`（草 1/4・影の解像度半分。Playwright のソフトウェア描画ではこれを付けないと 1 フレームに数十秒かかる）。
`window.game` から `Game` を参照できる。Playwright で確認する場合はソフトウェア描画なので fps は数フレーム程度になる。

---

## ワールド編集ガイド（AI 向け）

ワールドは `world/world.json` と `world/regions/*.json` の **テキストデータ** で定義する。
ゲームはロード時に「下地ノイズ → border → regions を順に適用」して地形を決定的に合成する。

### 座標系

- 地図は x, z ともに `0..size`（既定 2048m）。y は上。単位はメートル。
- プレビュー画像は **左上が (0, 0)、右へ +x、下へ +z**。目盛りの数字はワールド座標。
- 向き（`rotation` / `facing`、度）: **0 = +Z を向く、90 = +X を向く**。建物の正面（扉）は +Z 側。
- 海面は `seaLevel`（既定 0）。外周 `border.width` の範囲は海へ沈む。

### world.json

`size`, `cellSize`(2m), `seed`, `seaLevel`, `base`（下地ノイズ: height, amplitude, scale, octaves…）,
`border`（width, depth）, `spawn`（at, facing）, `regions`（**適用順**のリスト。ファイル名から .json を除いたもの）。

### region ファイル

```json
{
  "name": "start_village",
  "description": "何のための地域か",
  "ops":     [ 地形オペ… ],
  "paint":   [ 地表の塗り… ],
  "water":   [ 湖など… ],
  "objects": [ 個別配置… ],
  "scatter": [ ばらまき配置… ]
}
```

どの要素にも `"note"` を書ける（無視される。意図のメモに使う）。未知のキーはエラーになる（typo 検出）。

**領域（area）の書き方**（オペ・paint・water・scatter 共通。どれか 1 つ）:
`"at": [x, z], "radius": r` / `"rect": [x0, z0, x1, z1]` / `"polygon": [[x, z], ...]`

**地形オペ**（`ops`、上から順に適用。後のオペは前の結果に作用する）:

| op | 主なパラメータ | 効果 |
|---|---|---|
| `raise` / `lower` | area, amount, falloff(30) | 領域を一様に盛る/掘る。縁は falloff(m) で馴染む |
| `hill` | at, radius, height | なだらかな丘（cos 形） |
| `mountain` | at, radius, height, sharpness(1.5), roughness(0.35) | 尾根ノイズ付きの山。sharpness が大きいほど尖る |
| `flatten` | area, height(省略時は領域の平均), falloff(25), strength(1) | 整地（村・広場の敷地） |
| `plateau` | area, height, falloff(6) | 台地。周囲を崖にする（下げはしない） |
| `path` | points, width, falloff(8), mode(flatten/carve), depth(0), heights | 道。heights 省略時は地形に沿ってなだらかにする |
| `river` | name, points, width(8), depth(1.5), falloff(16), levels | 川。水路を掘り、**水面も自動生成**。水位は地形から自動（下流へ単調に下がる） |
| `smooth` | area, falloff(20), iterations(3) | 平滑化 |
| `noise` | area, amplitude, scale(60), falloff(30) | 起伏を足す（荒れ地・崖の表情） |

**paint**: `{ "surface": "road", "points": [...], "width": 4 }` または `{ "surface": "forest", <area> }`。
地表: `grass forest dirt road sand rock snow riverbed`。塗られていない所は高さと傾斜から自動。
area の塗りは境界が `jitter`(20m) だけノイズで揺れる（自然な境界にするため）。

**water**: `{ "name": "東の湖", <area>, "level": 5 }`。水面は平面なので、**領域の縁の地面が水位より高くなるよう**
領域を広めに取る（地面より下の部分だけ見える）。川は `river` オペを使う。

**objects**: `{ "type": "house", "at": [x, z], "rotation": 90, "scale": 1, "y": 0, "level": 5, "id": "…", "props": {…} }`。
y は地面からのオフセット、`level` は絶対高さ（指定すると地面を無視。桟橋・橋に使う）。`id` はクエスト等から参照するための一意名。
種類と寸法は `catalog.ts`:
`pine oak bush rock boulder house tower well sign campfire marker lighthouse pier bridge fence ruin_wall ruin_pillar tent barrel crate`
（marker はゲーム中不可視の目印。pier / bridge は中心に置き +Z 方向に延びる。床の上を歩ける）。

**scatter**: `{ "type": "pine", <area>, "density": 5, "scale": [0.8, 1.25], "maxSlope": 30, "avoid": [...], "onlyOn": [...] }`。
density は 1000m² あたりの個数。水中・急斜面・`avoid` の地表（既定 road sand rock snow）・個別配置物の周囲は自動で避ける。

### 編集の手順

1. どこを作るか決め、`npm run world:validate -- --probe x,z ...` で現地の高さを調べる。
2. region を追加/編集する（新しいファイルは world.json の `regions` に追加。順番に注意）。
3. `npm run world:validate` — エラーと警告（水が浮く・建物が急斜面・スポーンが水中…）を 0 にする。
4. `npm run world:preview`（全体）/ `-- --region 名前`（拡大）で画像を出力し、Read で見て意図どおりか確認する。
5. 必要ならゲームで確認: `npm run dev` → `?x=..&z=..&debug=1` や `?free=1&x=..&z=..&h=80&pitch=35`。
6. `npm test`（`test/world-data.test.ts` が world/ の検証と警告 0 を確認する）。

コツ:
- 大地形（山・湖の窪地）は早い region（`landforms`）、整地・道は後の region に置く。道は地形を削るので最後の方に。
- 建物は `flatten` した敷地の上に置く（急斜面だと警告が出る）。
- 何もしないと単なる起伏になるので、山・谷・川・台地・森などの「形」をはっきり作ると地域の個性が出る。
- paint は region の順に上書きされる。広い塗り（森など）は早い region に、道や広場の塗りは後の region に置く（今は `wilds` を `landforms` の直後に置いている）。
- 川を横切る道は、川より前の region（`trails`）に置く。橋の両端の高さは川の後の region（`river_crossing`）の path で揃え、`bridge` を `level` 付きで置く。
  橋は川に直角に架け、取り付け道の falloff は小さく（川床を埋めないように）。

## three.js / 依存のバージョン

three は最新（r18x）。`fps/` とは違い色管理・ライト強度は現行仕様（物理ベース）前提。
Rapier は compat 版（WASM を base64 同梱）なのでバンドルが 5MB 近くある。必要になったら非 compat 版 + WASM 分離を検討する。

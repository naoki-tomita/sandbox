# atom-watch

ATOM Cam などの RTSP カメラ映像を常時解析し、**人・動物・車などが動いたときだけ**クリップとして保存する常駐 CLI です。保存したクリップはブラウザで見返せます(localhost / LAN、外からは Tailscale 経由)。

- `docker compose up` で起動し、**Ctrl+C で止まります**。止めるときは、撮影中のクリップを保存してから終了します(もう一度 Ctrl+C を押すと即座に強制終了)
- **複数のカメラ**を 1 つのプロセスでまとめて扱えます
- 単純な動き検知だけだと、木の揺れや照明の変化ばかり溜まります。そこで、動きがあったときだけ物体検出(YOLOX)を走らせ、対象物が写っていたクリップだけを残します

```
カメラ ──RTSP──▶ ffmpeg ─┬─ 映像をそのまま 2 秒単位で一時保存(再エンコードなし)
  (1 台に 1 本)          └─ 縮小・間引きした映像 ─▶ 動き検知 ─(動きあり)─▶ 物体検出(全カメラで共有)
                                                                     │
               クリップ(mp4) + サムネイル + SQLite ◀── 対象物が写っていたら ┘
                         │
                     ウェブ画面(ライブ・タイムライン・タグでの絞り込み・再生)
```

## セットアップ(Docker Compose)

必要なのは Docker だけです(ffmpeg・Python・物体検出モデルはイメージに入っています)。

- Mac: [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- ラズパイ: 64bit 版の Raspberry Pi OS に `curl -fsSL https://get.docker.com | sh`

```bash
cd atom-watch
cp config.example.toml config.toml   # カメラの URL などを書く(先に作っておかないと Docker がディレクトリを作ってしまう)
docker compose up --build            # 起動。初回はイメージのビルドに数分かかる
```

起動すると、カメラの一覧と閲覧用の URL が表示されます。動作中は 10 秒ごとに状態を表示します。

```
atom-watch-1  | [玄関] 接続中  5.0fps ● 録画中 今日3件
atom-watch-1  | [庭  ] 接続中  5.0fps 監視中 今日12件
atom-watch-1  | 21:04:10 推論 22ms 待ち0 | 保存待ち0 | ディスク 1.32GB
```

**Ctrl+C** で終了します。録画中のクリップを保存してから止まります(もう一度 Ctrl+C を押すと強制終了)。

- ブラウザで `http://localhost:8080/` を開く。LAN の他の端末からは `http://<このマシンの IP>:8080/`
- ポートを変えるには `ATOMWATCH_PORT=9000 docker compose up`(`config.toml` の `[web] port` は 8080 のままにする)
- 録画は `compose.yaml` と同じ場所の `data/` に保存されます(`config.toml` の `data_dir` は既定の `"data"` のままにする)
- Mac はスリープすると止まるので、`caffeinate -i docker compose up` のように起動するとスリープを防げます
- 設定を変えたら Ctrl+C で止めて、`docker compose up` で起動し直す。コードを更新したら `--build` を付ける
- 精度重視のモデル(tiny)もイメージに入っています。`config.toml` の `[detector]` に `model = "models/yolox_tiny.onnx"` と書けば切り替わります

### ATOM Cam で RTSP を有効にする

1. ATOM アプリでカメラを開き、設定から RTSP(専用アプリ以外での視聴)を ON にする
2. 表示された `rtsp://ユーザー:パスワード@IPアドレス:8554/live` の形式の URL を、`config.toml` の `url` に書く
3. カメラの IP アドレスが変わらないよう、ルーター側で固定(DHCP 予約)しておくと安心です

### カメラなしで試す

`url` にはローカルの動画ファイルも指定できます(ループ再生されます)。`data/` に置いた動画は、コンテナの中から `data/xxx.mp4` で見えます。

```toml
[[cameras]]
id = "test"
url = "data/sample.mp4"
```

### Docker を使わずに動かす

Python 3.11 以上・[uv](https://docs.astral.sh/uv/)・ffmpeg が必要です(Mac なら `brew install ffmpeg uv`)。

```bash
uv sync
uv run python scripts/fetch_model.py       # 物体検出モデルを models/ に取得
uv run atom-watch                          # ./config.toml を読んで起動
uv run atom-watch --url rtsp://...         # 設定ファイルなしで 1 台だけ試す
uv run atom-watch --camera garden          # 指定した id のカメラだけ起動(調整時に便利)
```

この場合、macOS では起動中だけ自動でスリープを防ぎます。`./scripts/make_test_video.sh` を実行すると、`test-media/` にテスト動画を作れます。

## 設定

全項目は [`config.example.toml`](config.example.toml) にコメント付きで載せています。`[defaults]` に全カメラ共通の値を書き、各 `[[cameras]]` で同じキーを書くと、そのカメラだけ上書きできます。

調整でよく触る項目:

| 項目 | 意味 |
|---|---|
| `mask` | 無視する領域 `[x, y, 幅, 高さ]`(画面比 0〜1)。ATOM Cam は映像に時刻を焼き込むので、その位置を必ず指定する |
| `rotate` | 縦置き・逆さ付けのカメラを正しい向きにする時計回りの角度(90 / 180 / 270)。物体検出は横倒しの人をほとんど見つけられないので、縦置きなら必ず指定する。解析・ライブ映像・録画のすべてに効く(録画は再エンコードせず、回転情報だけ付ける)。`mask` は回転後の画面で指定する |
| `targets` | 残したい物体の種類(COCO のクラス名: person, cat, dog, bird, car, bicycle, motorcycle, truck…) |
| `min_confidence` / `min_hits` | 誤検出が多いときは上げる |
| `min_area` | 小さな揺れで反応するときは上げる |
| `require_overlap` | 検出した物体が「動いた場所」と重なるときだけ数える(止まっている車などを無視する)。既定は true |
| `keep_unclassified` | true にすると、対象物が写っていない動きも「動きのみ」タグで残す(調整用) |
| `pre_roll` / `post_roll` | 動き始めの何秒前から、止まってから何秒後までを保存するか |

保存先(既定 `data/`):

```
data/
  atomwatch.db                         # SQLite(イベント・タグ・検出結果)
  clips/<カメラid>/<日付>/<時刻>.mp4    # クリップ
  clips/<カメラid>/<日付>/<時刻>.jpg    # サムネイル(検出枠付き)
```

録画素材の一時ファイル(数秒ごとの `.ts`。古いものから自動で消える)は、SD カードの書き込みを減らすため
メモリ上の `/dev/shm/atom-watch/<カメラid>/` に置きます。`/dev/shm` がない環境(Docker を使わない Mac など)では
`data/segments/<カメラid>/` に置きます。場所は `config.toml` の `segment_dir` で変えられます。
Docker では `compose.yaml` の `shm_size`(既定 512MB)が上限です。カメラが多い・長いイベントが多い場合は増やしてください。

古いイベントは `[retention]` の設定(既定: 14 日 / 合計 20GB)に従って自動で消えます。星を付けたイベントは消しません。

## ウェブ画面

- 全カメラのライブ映像(1 秒ごとに更新)。タイルを押すと、そのカメラで絞り込む
- 日ごとのタイムライン。印を押すとそのクリップを再生する
- カメラ・タグ(人 / 猫 / 犬 / 車 / 昼 / 夜 …)・星付きで絞り込み
- 再生中は検出枠を重ねて表示する(表示・非表示を切り替え可)。星付け・保存・削除もここから

ウェブ画面には認証がありません。**LAN 内の誰でも閲覧・削除できる**ので、信頼できるネットワークで使ってください。

## 外から見る(Tailscale)

[Tailscale](https://tailscale.com/) を入れた端末同士で見るのがおすすめです。

```bash
tailscale serve --bg 8080
```

自分の tailnet(Tailscale に参加している自分の端末)からだけ、`https://<マシン名>.<tailnet名>.ts.net/` で見られるようになります。止めるときは `tailscale serve reset`。Mac App Store 版の Tailscale は、CLI が `/Applications/Tailscale.app/Contents/MacOS/Tailscale` にあります。

`tailscale funnel` はインターネット全体に公開されるのでおすすめしません。どうしても使う場合は、`config.toml` の `[web.auth]` で必ず Basic 認証を設定してください。

## ラズパイで動かす

- **64bit OS 必須**です(32bit OS 向けには onnxruntime のパッケージが配布されていません)
- 手順は Mac と同じく `docker compose up --build` です。イメージはラズパイの上でビルドします(古い機種だと時間がかかります)
- Linux では `data/` のファイルが root の所有になります。手で消すときは `sudo` を付けてください
- 負荷を下げる設定:
  - `[defaults]` で `analysis_fps = 3`、`detect_interval = 1.0` にする
  - ハードウェアデコードを使う(ラズパイ 3・4。5 には H.264 のハードウェアデコーダがない):
    1. `compose.yaml` と同じ場所に `.env` を作り、`RPI_FFMPEG=1` と書く。ラズパイ公式の ffmpeg 入りでイメージを作るようになる
       (Debian 版の ffmpeg では、ハードウェアデコーダからフレームが出てこないことがある)
    2. `config.toml` の `[defaults]` に `input_args = ["-c:v", "h264_v4l2m2m"]` を書く
    3. `compose.yaml` の `devices` のコメントを外す
    4. `docker compose up --build` でイメージを作り直して起動する
  - ATOM アプリで RTSP の画質を下げる
- 映像のデコードはカメラの台数に比例して重くなります。古いラズパイなら 1〜2 台が目安です(実機での計測はまだしていません)
- 一時ファイルはメモリ上(`/dev/shm`)に置くので、SD カードに書き込むのはクリップの保存時だけです。
  それでも書き込み寿命が気になる場合は、`data/` を USB 接続の SSD に置くと安心です

## 開発

```bash
uv sync
uv run pytest
```

モジュール構成は [CLAUDE.md](CLAUDE.md) を参照してください。

物体検出モデル [YOLOX](https://github.com/Megvii-BaseDetection/YOLOX) は Apache-2.0 ライセンスです。

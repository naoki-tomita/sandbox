# atom-watch

ATOM Cam などの RTSP カメラ映像を常時解析し、**人・動物・車などが動いたときだけ**クリップとして保存する常駐 CLI です。保存したクリップはブラウザで見返せます(localhost / LAN、外からは Tailscale 経由)。

- ターミナルで起動し、**Ctrl+C で止まります**。止めるときは、撮影中のクリップを保存してから終了します(もう一度 Ctrl+C を押すと即座に強制終了)
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

## 必要なもの

- Python 3.11 以上と [uv](https://docs.astral.sh/uv/)
- ffmpeg

Mac の場合:

```bash
brew install ffmpeg uv
```

## セットアップ

```bash
cd atom-watch
uv sync                                  # 依存パッケージをインストール
uv run python scripts/fetch_model.py     # 物体検出モデル(YOLOX-nano, 3.5MB)を models/ に取得
cp config.example.toml config.toml       # 設定ファイルを作り、カメラの URL を書く
```

### ATOM Cam で RTSP を有効にする

1. ATOM アプリでカメラを開き、設定から RTSP(専用アプリ以外での視聴)を ON にする
2. 表示された `rtsp://ユーザー:パスワード@IPアドレス:8554/live` の形式の URL を、`config.toml` の `url` に書く
3. カメラの IP アドレスが変わらないよう、ルーター側で固定(DHCP 予約)しておくと安心です

## 起動と終了

```bash
uv run atom-watch                    # ./config.toml を読んで起動
uv run atom-watch -c path/to.toml    # 設定ファイルを指定
uv run atom-watch --url rtsp://...   # 設定ファイルなしで 1 台だけ試す
uv run atom-watch --camera garden    # 設定のうち、指定した id のカメラだけ起動(調整時に便利)
```

起動すると、カメラの一覧と閲覧用の URL(localhost / LAN の IP / Tailscale の IP)が表示されます。動作中は 10 秒ごとに状態を表示します。

```
[玄関] 接続中  5.0fps ● 録画中 今日3件
[庭  ] 接続中  5.0fps 監視中 今日12件
21:04:10 推論 22ms 待ち0 | 保存待ち0 | ディスク 1.32GB
```

**Ctrl+C** で終了します。macOS では、起動中だけスリープしないようにしています(`--no-caffeinate` で無効化)。

### カメラなしで試す

`url` にはローカルの動画ファイルも指定できます(ループ再生されます)。

```bash
./scripts/make_test_video.sh           # test-media/ にテスト動画を作る(犬の写真が横切る動画と、ノイズだけの動画)
uv run atom-watch --url test-media/object.mp4
```

## 設定

全項目は [`config.example.toml`](config.example.toml) にコメント付きで載せています。`[defaults]` に全カメラ共通の値を書き、各 `[[cameras]]` で同じキーを書くと、そのカメラだけ上書きできます。

調整でよく触る項目:

| 項目 | 意味 |
|---|---|
| `mask` | 無視する領域 `[x, y, 幅, 高さ]`(画面比 0〜1)。ATOM Cam は映像に時刻を焼き込むので、その位置を必ず指定する |
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
  segments/<カメラid>/                  # 一時ファイル(古いものから自動で消える)
```

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
- `sudo apt install ffmpeg` と uv を入れれば、手順は Mac と同じです
- 負荷を下げる設定:
  - `[defaults]` で `analysis_fps = 3`、`detect_interval = 1.0` にする
  - ハードウェアデコードを使う(例: `input_args = ["-c:v", "h264_v4l2m2m"]`)
  - ATOM アプリで RTSP の画質を下げる
- 映像のデコードはカメラの台数に比例して重くなります。古いラズパイなら 1〜2 台が目安です(実機での計測はまだしていません)
- Mac など余裕がある環境では、`scripts/fetch_model.py tiny` で精度の高いモデルに切り替えられます

## 開発

```bash
uv run pytest
```

モジュール構成は [CLAUDE.md](CLAUDE.md) を参照してください。

物体検出モデル [YOLOX](https://github.com/Megvii-BaseDetection/YOLOX) は Apache-2.0 ライセンスです。

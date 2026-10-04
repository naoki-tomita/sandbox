# CLAUDE.md — atom-watch

このファイルは Claude Code がこのディレクトリを扱う際の指針です。

## アーキテクチャ

Python 3.11+ / uv。重い処理は ffmpeg(デコード)・OpenCV(動き検知)・ONNX Runtime(物体検出)に任せ、
Python はそれらをつなぐだけにする。

### スレッド構成

```
main(cli.py) ── シグナル処理・ステータス表示・古いイベントの削除
 ├ web: uvicorn(FastAPI)
 ├ カメラごと: FfmpegSource の読み取りスレッド + CameraPipeline の解析スレッド
 ├ DetectionService: 全カメラ共有の推論スレッド(カメラごとに最新の依頼 1 件、順番に処理)
 └ Recorder: クリップ書き出しワーカー
```

### src/atomwatch/ のモジュール構成

| ファイル | 責務 |
|---|---|
| `config.py` | TOML → dataclass。`[defaults]` を各 `[[cameras]]` で上書きして `CameraConfig` を作る。未知のキーはエラー |
| `source.py` | ffmpeg 1 プロセスで「録画用セグメント(-c copy)」と「解析用の生フレーム(stdout)」を同時に出す。指数バックオフで再接続 |
| `segments.py` | セグメント(.ts)のリングバッファ。ファイル名 = 開始時刻。`hold` で消さないよう保護 |
| `motion.py` | MOG2 背景差分 + マスク + 照明変化の判定 |
| `detector.py` | `Detector` Protocol と YOLOX(ONNX)の前処理・後処理 |
| `detection_service.py` | 共有推論スレッド |
| `events.py` | `EventTracker`(外部依存のない状態機械。時刻は引数)と `filter_detections` |
| `pipeline.py` | カメラ 1 台分の解析ループ(source → motion → detection → tracker → recorder) |
| `recorder.py` | セグメントを concat して mp4 + サムネイル → DB 登録 |
| `db.py` | SQLite。1 接続をロックで直列化 |
| `retention.py` | 保存日数・合計容量での削除 |
| `status.py` | 実行中の状態(ウェブと CLI 表示用) |
| `web/app.py`, `web/static/` | API と画面(ビルド不要の素の HTML/JS/CSS) |
| `cli.py` | エントリポイント。部品の組み立て(コンポジションルート)と終了処理 |

### 設計方針

- **Ctrl+C で必ず安全に止まる**: ffmpeg は `start_new_session=True` で起動し、端末の SIGINT は Python だけが受ける。
  終了順は「解析停止(進行中イベントを確定)→ ffmpeg 停止 → 録画ワーカーの完了待ち → 推論停止 → ウェブ停止」
- **ラズパイで動くこと**: 物体検出は動きがある間だけ。モデルは 1 つを全カメラで共有。フロントはビルド不要
- **純粋なロジックは時刻を引数で受け取る**(`EventTracker` など)ので、テストで偽の時計を使える
- 過剰設計はしない(プラグイン機構・DI コンテナなし)

## 開発

```bash
uv sync
uv run pytest                          # ユニットテスト(モデル不要)
uv run python scripts/fetch_model.py   # 実際に動かすときはモデルが必要
./scripts/make_test_video.sh           # カメラなしで試すためのテスト動画
uv run atom-watch --url test-media/object.mp4
```

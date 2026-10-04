"""atom-watch のエントリポイント。各部品を組み立て、起動中の案内と終了処理を受け持つ。"""

from __future__ import annotations

import argparse
import os
import shutil
import signal
import socket
import subprocess
import sys
import threading
import time
from dataclasses import replace
from pathlib import Path

from .config import Config, ConfigError, load_config, single_camera
from .db import Database
from .detection_service import DetectionService
from .pipeline import CameraPipeline
from .recorder import Recorder, RecordJob
from .retention import enforce
from .source import ffmpeg_available, kill_all, mask_url
from .status import StatusRegistry, start_of_today

STATUS_INTERVAL = 10.0
RETENTION_INTERVAL = 600.0


def parse_args(argv: list[str] | None) -> argparse.Namespace:
    p = argparse.ArgumentParser(
        prog="atom-watch",
        description="ATOM Cam などの RTSP カメラを解析し、意味のある動きだけを録画します。Ctrl+C で終了。",
    )
    p.add_argument("-c", "--config", type=Path, help="設定ファイル(TOML)。省略時は ./config.toml があれば使う")
    p.add_argument("--url", help="このカメラ 1 台だけで起動する(設定ファイルのカメラ定義は無視)")
    p.add_argument("--camera", action="append", default=[], help="指定した id のカメラだけ起動する(複数指定可)")
    p.add_argument("--host", help="ウェブの待ち受けアドレス")
    p.add_argument("--port", type=int, help="ウェブのポート")
    p.add_argument("--data-dir", type=Path, help="録画と DB の保存先")
    p.add_argument("--model", help="物体検出モデル(ONNX)のパス")
    p.add_argument("--no-detector", action="store_true", help="物体検出を使わず、動き検知だけで録画する")
    p.add_argument("--no-caffeinate", action="store_true", help="(macOS)起動中のスリープ防止をしない")
    return p.parse_args(argv)


def build_config(args: argparse.Namespace) -> Config:
    path = args.config
    if path is None and Path("config.toml").exists():
        path = Path("config.toml")
    config = load_config(path)
    if args.url:
        config = single_camera(config, args.url)
    if args.camera:
        wanted = set(args.camera)
        missing = wanted - {c.id for c in config.cameras}
        if missing:
            raise ConfigError(f"設定にないカメラ id です: {', '.join(sorted(missing))}")
        config = replace(config, cameras=[c for c in config.cameras if c.id in wanted])
    if args.data_dir:
        config = replace(config, data_dir=args.data_dir)
    if args.host or args.port:
        config = replace(
            config, web=replace(config.web, host=args.host or config.web.host, port=args.port or config.web.port)
        )
    if args.model:
        config = replace(config, detector=replace(config.detector, model=args.model))
    config = replace(config, cameras=[c for c in config.cameras if c.enabled])
    if not config.cameras:
        raise ConfigError("カメラが 1 台もありません。--url を指定するか、設定ファイルに [[cameras]] を書いてください")
    return config


def lan_ip() -> str | None:
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("192.0.2.1", 80))  # 実際には送信しない。経路から自分の IP を得るだけ
            return s.getsockname()[0]
    except OSError:
        return None


def tailscale_ip() -> str | None:
    candidates = [shutil.which("tailscale"), "/Applications/Tailscale.app/Contents/MacOS/Tailscale"]
    for exe in candidates:
        if exe and os.path.exists(exe):
            try:
                out = subprocess.run([exe, "ip", "-4"], capture_output=True, text=True, timeout=3)
            except (OSError, subprocess.TimeoutExpired):
                continue
            ip = out.stdout.strip().splitlines()
            if out.returncode == 0 and ip:
                return ip[0]
    return None


def start_caffeinate() -> subprocess.Popen | None:
    """macOS で、このプロセスが動いている間だけスリープを防ぐ。"""
    if sys.platform != "darwin" or not shutil.which("caffeinate"):
        return None
    return subprocess.Popen(["caffeinate", "-i", "-w", str(os.getpid())], start_new_session=True)


def dir_size(path: Path) -> int:
    total = 0
    for p in path.rglob("*"):
        try:
            if p.is_file():
                total += p.stat().st_size
        except OSError:
            pass
    return total


class WebServer:
    def __init__(self, app, host: str, port: int) -> None:
        import uvicorn

        self.server = uvicorn.Server(uvicorn.Config(app, host=host, port=port, log_level="warning", access_log=False))
        self.thread = threading.Thread(target=self.server.run, name="web", daemon=True)

    def start(self) -> None:
        self.thread.start()

    def stop(self) -> None:
        self.server.should_exit = True
        self.thread.join(timeout=5)


def print_banner(config: Config, detector_name: str) -> None:
    port = config.web.port
    print("━" * 60)
    print(" atom-watch 起動中")
    print("━" * 60)
    print(" カメラ:")
    for cam in config.cameras:
        print(f"   • {cam.display_name} [{cam.id}]  {mask_url(cam.url)}")
    print(f" 物体検出: {detector_name or 'なし(動き検知のみ)'}")
    print(f" 保存先: {config.data_dir.resolve()}")
    print(" 閲覧:")
    print(f"   • http://localhost:{port}/")
    if config.web.host in ("0.0.0.0", "::"):
        if ip := lan_ip():
            print(f"   • http://{ip}:{port}/  (LAN)")
        if ts := tailscale_ip():
            print(f"   • http://{ts}:{port}/  (Tailscale)")
    print("━" * 60)
    print(" 終了するには Ctrl+C を押してください")
    print("━" * 60, flush=True)


def format_status(registry: StatusRegistry, recorder: Recorder) -> list[str]:
    labels = {"idle": "監視中", "motion": "動きあり", "recording": "● 録画中"}
    width = max((len(st.name) for st in registry.cameras.values()), default=0)
    lines = []
    for st in registry.cameras.values():
        conn = "接続中" if st.connected else "未接続"
        lines.append(
            f"[{st.name:<{width}}] {conn} {st.fps:4.1f}fps {labels.get(st.state, st.state)} 今日{st.events_today}件"
        )
    extra = f"推論 {registry.detector_ms:.0f}ms 待ち{registry.detector_queue}" if registry.detector_ms else "推論 -"
    lines.append(
        f"{time.strftime('%H:%M:%S')} {extra} | 保存待ち{recorder.pending} | ディスク {registry.disk_bytes / 1024**3:.2f}GB"
    )
    return lines


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        config = build_config(args)
    except (ConfigError, OSError, ValueError) as e:
        print(f"設定エラー: {e}", file=sys.stderr)
        return 2

    if not ffmpeg_available():
        print("ffmpeg が見つかりません。Mac なら `brew install ffmpeg` でインストールしてください。", file=sys.stderr)
        return 2

    detection: DetectionService | None = None
    detector_name = ""
    if not args.no_detector:
        model = Path(config.detector.model)
        if not model.exists():
            print(
                f"物体検出モデルが見つかりません: {model}\n"
                "  `uv run python scripts/fetch_model.py` でダウンロードするか、"
                "--no-detector で動き検知だけで起動してください。",
                file=sys.stderr,
            )
            return 2
        from .detector import YoloxOnnxDetector

        detector = YoloxOnnxDetector(
            model, nms_threshold=config.detector.nms_threshold, threads=config.detector.threads,
            # 対象クラスの絞り込みはカメラごとに行うので、ここでは最も低いしきい値で検出しておく
            conf_threshold=min(c.min_confidence for c in config.cameras),
        )
        detection = DetectionService(detector, workers=config.detector.workers)
        detector_name = model.name

    data_dir = config.data_dir
    data_dir.mkdir(parents=True, exist_ok=True)
    db = Database(data_dir / "atomwatch.db")
    db.upsert_cameras((c.id, c.display_name) for c in config.cameras)

    registry = StatusRegistry()
    today = start_of_today()
    for cam in config.cameras:
        st = registry.add(cam.id, cam.display_name)
        st.events_today = db.count_since(cam.id, today)

    def on_saved(event_id: int, job: RecordJob) -> None:
        st = registry.cameras.get(job.camera_id)
        if st:
            st.events_today = db.count_since(job.camera_id, start_of_today())
        print(f"[{st.name if st else job.camera_id}] 保存しました(イベント #{event_id})", flush=True)

    recorder = Recorder(data_dir, db, workers=config.recorder_workers, on_saved=on_saved)
    pipelines = [
        CameraPipeline(cam, data_dir, detection, recorder, registry.cameras[cam.id]) for cam in config.cameras
    ]

    from .web.app import create_app

    app = create_app(
        db, data_dir, registry,
        auth_user=config.web.auth_user, auth_password=config.web.auth_password, detector_name=detector_name,
    )
    web = WebServer(app, config.web.host, config.web.port)

    # --- シグナル: 1 回目は安全に終了、2 回目は即座に強制終了 ---
    stop = threading.Event()
    first_signal = [0.0]

    def on_signal(signum, _frame) -> None:
        now = time.monotonic()
        if stop.is_set():
            # `uv run` 経由だと 1 回の Ctrl+C が端末と uv の両方から届くことがあるので、直後の重複は無視する
            if now - first_signal[0] < 1.0:
                return
            print("\n強制終了します", flush=True)
            kill_all()
            os._exit(130)
        first_signal[0] = now
        print("\n終了処理中です…(もう一度 Ctrl+C で強制終了)", flush=True)
        stop.set()

    signal.signal(signal.SIGINT, on_signal)
    signal.signal(signal.SIGTERM, on_signal)

    caffeinate = None if args.no_caffeinate else start_caffeinate()
    print_banner(config, detector_name)
    web.start()
    for p in pipelines:
        p.start()

    last_status = time.monotonic()
    last_retention = 0.0
    try:
        while not stop.wait(1.0):
            if detection is not None:
                registry.detector_ms = detection.avg_ms
                registry.detector_queue = detection.queue_length
                registry.detector_dropped = detection.dropped
            if time.monotonic() - last_retention >= RETENTION_INTERVAL:
                removed = enforce(db, data_dir, config.retention)
                if removed:
                    print(f"古いイベントを {removed} 件削除しました", flush=True)
                registry.disk_bytes = dir_size(data_dir)
                last_retention = time.monotonic()
            if time.monotonic() - last_status >= STATUS_INTERVAL:
                today = start_of_today()  # 日付が変わったら「今日」の件数を数え直す
                for cam_id, st in registry.cameras.items():
                    st.events_today = db.count_since(cam_id, today)
                print("\n".join(format_status(registry, recorder)), flush=True)
                last_status = time.monotonic()
    finally:
        for p in pipelines:
            p.stop_analysis()
        for p in pipelines:
            p.stop_source()
        if recorder.pending:
            print(f"録画中のクリップを保存しています({recorder.pending} 件)…", flush=True)
        recorder.stop()
        if detection is not None:
            detection.stop()
        web.stop()
        db.close()
        if caffeinate is not None:
            caffeinate.terminate()
        print("終了しました", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())

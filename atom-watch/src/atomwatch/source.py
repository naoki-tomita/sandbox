"""ffmpeg を使った映像入力。カメラ 1 台につき ffmpeg を 1 プロセスだけ起動し、出力を 2 系統に分ける。

1. 録画用: 映像は再エンコードせずに(-c:v copy)短いセグメントファイルへ書き出す
2. 解析用: 縮小・間引きした生フレーム(bgr24)を stdout に流す

切断やフレームの途絶を検知したら、待ち時間を伸ばしながら(指数バックオフ)再起動する。
"""

from __future__ import annotations

import collections
import os
import re
import signal
import subprocess
import threading
import time
from pathlib import Path

import numpy as np

from .config import CameraConfig
from .segments import FILENAME_FORMAT, SUFFIX

STALL_SECONDS = 15.0  # この間フレームが来なければ ffmpeg を再起動する
MAX_BACKOFF = 60.0
# 時計回りの回転角 → 解析用フレームに掛ける ffmpeg フィルタ(縮小してから回すので軽い)
ROTATE_FILTERS = {90: "transpose=clock", 180: "hflip,vflip", 270: "transpose=cclock"}

# 起動中の ffmpeg。強制終了時に取り残さないよう、まとめて kill できるようにしておく
_active_procs: set[subprocess.Popen[bytes]] = set()
_active_lock = threading.Lock()


def kill_all() -> None:
    with _active_lock:
        procs = list(_active_procs)
    for proc in procs:
        try:
            proc.kill()
        except OSError:
            pass


def is_stream_url(url: str) -> bool:
    return bool(re.match(r"^[a-z][a-z0-9+.-]*://", url, re.I)) and not url.lower().startswith("file:")


def mask_url(url: str) -> str:
    """表示用に URL のパスワードを伏せる。"""
    return re.sub(r"(://[^:/@]+:)[^@]*@", r"\1***@", url)


def build_command(cam: CameraConfig, segment_dir: Path, ffmpeg: str = "ffmpeg") -> list[str]:
    cmd = [ffmpeg, "-hide_banner", "-loglevel", "error", "-nostdin"]
    if cam.hwaccel:
        cmd += ["-hwaccel", cam.hwaccel]
    if is_stream_url(cam.url):
        if cam.url.lower().startswith("rtsp"):
            # -timeout: ソケットの無応答タイムアウト(マイクロ秒)
            cmd += ["-rtsp_transport", cam.rtsp_transport, "-timeout", "10000000"]
    else:
        # ローカルの動画ファイル: 実時間で再生し、ずっとループさせる(テスト・デモ用)
        cmd += ["-re", "-stream_loop", "-1"]
    cmd += list(cam.input_args)
    cmd += ["-i", cam.url]

    # 出力 1: 録画用セグメント
    cmd += ["-map", "0:v:0"]
    if cam.record_audio:
        cmd += ["-map", "0:a:0?", "-c:a", "aac", "-b:a", "64k"]
    else:
        cmd += ["-an"]
    cmd += [
        "-c:v", "copy",
        "-f", "segment",
        "-segment_time", str(cam.segment_seconds),
        "-segment_format", "mpegts",
        "-reset_timestamps", "1",
        "-strftime", "1",
        str(segment_dir / f"{FILENAME_FORMAT}{SUFFIX}"),
    ]
    # 出力 2: 解析用の生フレーム
    vf = f"fps={cam.analysis_fps},scale={cam.analysis_width}:{cam.analysis_height}"
    if cam.rotate:
        vf += "," + ROTATE_FILTERS[cam.rotate]
    cmd += ["-map", "0:v:0", "-an", "-vf", vf, "-pix_fmt", "bgr24", "-f", "rawvideo", "pipe:1"]
    return cmd


class FfmpegSource:
    """フレームを読み続けるスレッドを持ち、常に「最新の 1 枚」だけを保持する。"""

    def __init__(self, cam: CameraConfig, segment_dir: Path, ffmpeg: str = "ffmpeg") -> None:
        self.cam = cam
        self.segment_dir = segment_dir
        self.ffmpeg = ffmpeg
        self._w, self._h = cam.analysis_size
        self._frame_bytes = self._w * self._h * 3
        self._cond = threading.Condition()
        self._latest: tuple[float, np.ndarray] | None = None
        self._seq = 0
        self._stop = threading.Event()
        self._proc: subprocess.Popen[bytes] | None = None
        self._proc_lock = threading.Lock()
        self._thread = threading.Thread(target=self._run, name=f"source-{cam.id}", daemon=True)
        self.connected = False
        self.last_error = ""
        self.restarts = 0
        self._stderr_tail: collections.deque[str] = collections.deque(maxlen=5)

    def start(self) -> None:
        self._thread.start()

    def get_frame(self, last_seq: int, timeout: float = 1.0) -> tuple[int, float, np.ndarray] | None:
        """last_seq より新しいフレームを待って返す。来なければ None。"""
        with self._cond:
            if not self._cond.wait_for(lambda: self._seq > last_seq or self._stop.is_set(), timeout=timeout):
                return None
            if self._latest is None or self._seq <= last_seq:
                return None
            ts, frame = self._latest
            return self._seq, ts, frame

    def stop(self) -> None:
        self._stop.set()
        with self._cond:
            self._cond.notify_all()
        self._terminate()
        self._thread.join(timeout=10)

    def _terminate(self) -> None:
        with self._proc_lock:
            proc = self._proc
        if proc is None or proc.poll() is not None:
            return
        # q で正常終了させるのが理想だが stdin は使っていないので SIGTERM → 一定時間で kill
        try:
            proc.send_signal(signal.SIGTERM)
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait()
        except ProcessLookupError:
            pass

    def _run(self) -> None:
        backoff = 1.0
        while not self._stop.is_set():
            started = time.monotonic()
            self._run_once()
            if self._stop.is_set():
                break
            self.connected = False
            self.restarts += 1
            # しばらく安定して動いていたならバックオフをリセット
            if time.monotonic() - started > 60:
                backoff = 1.0
            # ffmpeg のエラーは最後の行が一番要点をまとめていることが多い
            detail = self._stderr_tail[-1] if self._stderr_tail else "ffmpeg が終了しました"
            self.last_error = detail
            print(f"[{self.cam.id}] 切断: {detail} — {backoff:.0f} 秒後に再接続します", flush=True)
            if self._stop.wait(backoff):
                break
            backoff = min(MAX_BACKOFF, backoff * 2)

    def _run_once(self) -> None:
        self.segment_dir.mkdir(parents=True, exist_ok=True)
        cmd = build_command(self.cam, self.segment_dir, self.ffmpeg)
        self._stderr_tail.clear()
        try:
            proc = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                stdin=subprocess.DEVNULL,
                bufsize=0,
                # 端末の Ctrl+C(SIGINT)が ffmpeg に直接届かないよう別セッションにする。止めるのはこちらから
                start_new_session=True,
            )
        except FileNotFoundError:
            self._stderr_tail.append(f"{self.ffmpeg} が見つかりません(ffmpeg をインストールしてください)")
            return
        with self._proc_lock:
            self._proc = proc
        with _active_lock:
            _active_procs.add(proc)
        threading.Thread(target=self._read_stderr, args=(proc,), daemon=True).start()

        last_frame = [time.monotonic()]
        watchdog_stop = threading.Event()

        def watchdog() -> None:
            while not watchdog_stop.wait(1.0):
                if time.monotonic() - last_frame[0] > STALL_SECONDS:
                    self._stderr_tail.append(f"{STALL_SECONDS:.0f} 秒間フレームが届きません")
                    self._terminate()
                    return

        threading.Thread(target=watchdog, daemon=True).start()
        assert proc.stdout is not None
        try:
            while not self._stop.is_set():
                buf = _read_exact(proc.stdout, self._frame_bytes)
                if buf is None:
                    break
                last_frame[0] = time.monotonic()
                frame = np.frombuffer(buf, dtype=np.uint8).reshape(self._h, self._w, 3)
                if not self.connected:
                    self.connected = True
                    self.last_error = ""
                with self._cond:
                    self._seq += 1
                    self._latest = (time.time(), frame)
                    self._cond.notify_all()
        finally:
            watchdog_stop.set()
            self._terminate()
            with self._proc_lock:
                self._proc = None
            with _active_lock:
                _active_procs.discard(proc)

    def _read_stderr(self, proc: subprocess.Popen[bytes]) -> None:
        assert proc.stderr is not None
        for line in iter(proc.stderr.readline, b""):
            text = line.decode("utf-8", "replace").strip()
            if text:
                self._stderr_tail.append(text)


def _read_exact(stream, n: int) -> bytearray | None:
    buf = bytearray(n)
    view = memoryview(buf)
    got = 0
    while got < n:
        chunk = stream.readinto(view[got:])
        if not chunk:
            return None
        got += chunk
    return buf


def ffmpeg_available(ffmpeg: str = "ffmpeg") -> bool:
    from shutil import which

    return which(ffmpeg) is not None or os.path.isfile(ffmpeg)

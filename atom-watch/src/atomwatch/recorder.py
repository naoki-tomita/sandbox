"""確定したイベントをクリップ(mp4 + サムネイル)にして DB に登録する。

セグメント(.ts)を ffmpeg の concat で再エンコードせずに繋ぐだけなので軽い。
"""

from __future__ import annotations

import queue
import secrets
import shutil
import subprocess
import tempfile
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

import cv2
import numpy as np

from .db import Database, NewEvent
from .detector import Detection
from .events import FinishedEvent
from .segments import SegmentStore

# 最後のセグメントが書き終わるのを待つ上限(秒)
SEGMENT_WAIT_SECONDS = 30.0


@dataclass
class RecordJob:
    camera_id: str
    segments: SegmentStore
    event: FinishedEvent
    hold_token: int


def time_of_day_tag(frame: np.ndarray | None, ts: float) -> str:
    """夜間タグ。赤外線モード(ほぼ白黒の映像)か、時刻が夜なら night。"""
    if frame is not None and frame.ndim == 3:
        hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
        if float(hsv[..., 1].mean()) < 12:
            return "night"
    hour = time.localtime(ts).tm_hour
    return "day" if 6 <= hour < 18 else "night"


def draw_detections(frame: np.ndarray, detections: list[Detection]) -> np.ndarray:
    img = frame.copy()
    h, w = img.shape[:2]
    for d in detections:
        x, y, bw, bh = d.box
        p0 = (int(x * w), int(y * h))
        p1 = (int((x + bw) * w), int((y + bh) * h))
        cv2.rectangle(img, p0, p1, (60, 220, 255), 2)
        label = f"{d.label} {d.conf:.2f}"
        (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)
        ty = max(th + 4, p0[1])
        cv2.rectangle(img, (p0[0], ty - th - 4), (p0[0] + tw + 4, ty), (60, 220, 255), -1)
        cv2.putText(img, label, (p0[0] + 2, ty - 3), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (20, 20, 20), 1, cv2.LINE_AA)
    return img


class Recorder:
    def __init__(
        self,
        data_dir: Path,
        db: Database,
        workers: int = 1,
        ffmpeg: str = "ffmpeg",
        on_saved: Callable[[int, RecordJob], None] | None = None,
    ) -> None:
        self.data_dir = data_dir
        self.db = db
        self.ffmpeg = ffmpeg
        self.ffprobe = shutil.which("ffprobe")
        self.on_saved = on_saved
        self._queue: queue.Queue[RecordJob | None] = queue.Queue()
        self._threads = [
            threading.Thread(target=self._run, name=f"recorder-{i}", daemon=True) for i in range(max(1, workers))
        ]
        for t in self._threads:
            t.start()

    def submit(self, job: RecordJob) -> None:
        self._queue.put(job)

    @property
    def pending(self) -> int:
        return self._queue.qsize()

    def stop(self, timeout: float = 60.0) -> None:
        """キューに残った仕事を終わらせてから止める。"""
        for _ in self._threads:
            self._queue.put(None)
        deadline = time.monotonic() + timeout
        for t in self._threads:
            t.join(timeout=max(0.1, deadline - time.monotonic()))

    def _run(self) -> None:
        while True:
            job = self._queue.get()
            if job is None:
                return
            try:
                event_id = self.process(job)
                if event_id is not None and self.on_saved:
                    self.on_saved(event_id, job)
            except Exception as e:
                print(f"[{job.camera_id}] クリップの保存に失敗しました: {e}", flush=True)
            finally:
                job.segments.release(job.hold_token)

    def process(self, job: RecordJob) -> int | None:
        ev = job.event
        store = job.segments
        # クリップ終端を含むセグメントが書き終わる(= 次のセグメントが始まる)まで待つ
        deadline = time.monotonic() + SEGMENT_WAIT_SECONDS
        while not store.closed and not store.has_segment_after(ev.clip_end) and time.monotonic() < deadline:
            time.sleep(0.5)
        segments = store.select(ev.clip_start, ev.clip_end)
        if not segments:
            print(f"[{job.camera_id}] 録画素材が見つからないためイベントを保存できませんでした", flush=True)
            return None

        video_start = segments[0].start
        day_dir = time.strftime("%Y-%m-%d", time.localtime(ev.started_at))
        stem = time.strftime("%H%M%S", time.localtime(ev.started_at)) + "-" + secrets.token_hex(3)
        rel_dir = Path("clips") / job.camera_id / day_dir
        out_dir = self.data_dir / rel_dir
        out_dir.mkdir(parents=True, exist_ok=True)
        video_rel = rel_dir / f"{stem}.mp4"
        thumb_rel = rel_dir / f"{stem}.jpg"
        video_path = self.data_dir / video_rel

        self._concat([s.path for s in segments], video_path)
        duration = self._probe_duration(video_path)
        if duration is None:
            last = segments[-1]
            duration = (last.end if last.end is not None else ev.clip_end) - video_start

        thumb_ok = self._write_thumbnail(ev, video_path, video_start, self.data_dir / thumb_rel)

        tags = {tag: (stat.max_conf, stat.hits) for tag, stat in ev.tags.items()}
        tags.setdefault(time_of_day_tag(ev.best_frame, ev.started_at), (0.0, 0))
        return self.db.insert_event(
            NewEvent(
                camera_id=job.camera_id,
                started_at=ev.started_at,
                ended_at=ev.ended_at,
                video_start=video_start,
                duration=max(0.0, duration),
                video_path=video_rel.as_posix(),
                thumb_path=thumb_rel.as_posix() if thumb_ok else None,
                size_bytes=video_path.stat().st_size,
                peak_motion=ev.peak_motion,
                tags=tags,
                detections=[(ts - video_start, d.label, d.conf, d.box) for ts, d in ev.detections],
            )
        )

    def _concat(self, paths: list[Path], out: Path) -> None:
        # 一覧ファイルもセグメントと同じ場所(既定ではメモリ上の /dev/shm)に置く
        with tempfile.NamedTemporaryFile("w", suffix=".txt", dir=paths[0].parent, delete=False) as f:
            for p in paths:
                escaped = str(p.resolve()).replace("'", "'\\''")
                f.write(f"file '{escaped}'\n")
            list_path = Path(f.name)
        tmp_out = out.with_suffix(".part.mp4")
        try:
            cmd = [
                self.ffmpeg, "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
                "-f", "concat", "-safe", "0", "-i", str(list_path),
                "-c", "copy", "-movflags", "+faststart", str(tmp_out),
            ]
            res = subprocess.run(cmd, capture_output=True, text=True, start_new_session=True)
            if res.returncode != 0:
                raise RuntimeError(f"ffmpeg concat 失敗: {res.stderr.strip()[-300:]}")
            tmp_out.replace(out)
        finally:
            list_path.unlink(missing_ok=True)
            tmp_out.unlink(missing_ok=True)

    def _probe_duration(self, path: Path) -> float | None:
        if not self.ffprobe:
            return None
        res = subprocess.run(
            [self.ffprobe, "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
            capture_output=True, text=True, start_new_session=True,
        )
        try:
            return float(res.stdout.strip())
        except ValueError:
            return None

    def _write_thumbnail(self, ev: FinishedEvent, video: Path, video_start: float, out: Path) -> bool:
        if ev.best_frame is not None:
            img = draw_detections(np.asarray(ev.best_frame), ev.best_detections)
            return bool(cv2.imwrite(str(out), img, [cv2.IMWRITE_JPEG_QUALITY, 85]))
        # 物体が検出されていない(motion のみの)イベントは、動き始めのフレームを切り出す
        offset = max(0.0, ev.started_at - video_start)
        res = subprocess.run(
            [
                self.ffmpeg, "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
                "-ss", f"{offset:.2f}", "-i", str(video), "-frames:v", "1",
                "-vf", "scale=640:-2", "-q:v", "4", str(out),
            ],
            capture_output=True, start_new_session=True,
        )
        return res.returncode == 0 and out.exists()

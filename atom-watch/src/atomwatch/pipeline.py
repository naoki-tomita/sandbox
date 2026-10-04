"""カメラ 1 台分の解析ループ。

source(ffmpeg)→ 動き検知 → (動きがあれば)共有の推論サービスへ依頼 → イベント判定 → 録画ワーカーへ
"""

from __future__ import annotations

import queue
import threading
import time
from pathlib import Path

import numpy as np

from .config import CameraConfig
from .detection_service import DetectionService
from .detector import Detection
from .events import EventTracker, FinishedEvent, filter_detections
from .motion import NO_MOTION, Box, MotionDetector
from .recorder import Recorder, RecordJob
from .segments import SegmentStore
from .source import FfmpegSource
from .status import CameraStatus

PRUNE_INTERVAL = 5.0


class CameraPipeline:
    def __init__(
        self,
        cam: CameraConfig,
        segment_dir: Path,
        detection: DetectionService | None,
        recorder: Recorder,
        status: CameraStatus,
        ffmpeg: str = "ffmpeg",
    ) -> None:
        self.cam = cam
        self.detection = detection
        self.recorder = recorder
        self.status = status
        # 前の余白 + 余裕分だけセグメントを残す
        self.segments = SegmentStore(segment_dir / cam.id, keep_seconds=cam.pre_roll + 30)
        self.segments.clear()  # 前回の起動の残りは使わない
        self.source = FfmpegSource(cam, self.segments, ffmpeg)
        self.motion = MotionDetector(
            cam.analysis_size[::-1],
            mask_regions=cam.mask,
            min_area=cam.min_area,
            lighting_change_ratio=cam.lighting_change_ratio,
            sensitivity=cam.motion_sensitivity,
            warmup_frames=max(5, int(cam.analysis_fps * 2)),
        )
        self.tracker = EventTracker(
            min_hits=cam.min_hits,
            pre_roll=cam.pre_roll,
            post_roll=cam.post_roll,
            max_event=cam.max_event,
            # 検出器なしで動かす場合は、動きだけのイベントも残す
            keep_unclassified=cam.keep_unclassified or detection is None,
        )
        self._results: queue.SimpleQueue[tuple[float, np.ndarray, list[Box], list[Detection] | None]] = (
            queue.SimpleQueue()
        )
        self._in_flight = False
        self._last_request = 0.0
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._run, name=f"pipeline-{cam.id}", daemon=True)

    def start(self) -> None:
        self.source.start()
        self._thread.start()

    def stop_analysis(self) -> None:
        """解析を止め、進行中のイベントを確定させて録画ワーカーに渡す。"""
        self._stop.set()
        self._thread.join(timeout=10)

    def stop_source(self) -> None:
        self.source.stop()
        self.segments.closed = True

    def _run(self) -> None:
        seq = 0
        fps_count, fps_since = 0, time.monotonic()
        last_prune = 0.0
        while not self._stop.is_set():
            got = self.source.get_frame(seq, timeout=1.0)
            now = time.time()
            self._drain_results()
            self.status.connected = self.source.connected
            self.status.last_error = self.source.last_error

            if got is None:
                # フレームが来なくてもイベントの終了判定は進める
                self._handle(self.tracker.update(now, NO_MOTION))
            else:
                seq, ts, frame = got
                motion = self.motion.update(frame)
                self.status.set_frame(frame, ts)
                if (
                    self.detection is not None
                    and motion.active
                    and not self._in_flight
                    and ts - self._last_request >= self.cam.detect_interval
                ):
                    self._in_flight = True
                    self._last_request = ts
                    self.detection.submit(
                        self.cam.id,
                        frame,
                        lambda r, ts=ts, frame=frame, boxes=motion.boxes: self._results.put((ts, frame, boxes, r)),
                    )
                self._handle(self.tracker.update(ts, motion))
                fps_count += 1

            self.status.state = self.tracker.state
            elapsed = time.monotonic() - fps_since
            if elapsed >= 5.0:
                self.status.fps = fps_count / elapsed
                fps_count, fps_since = 0, time.monotonic()
            if now - last_prune >= PRUNE_INTERVAL:
                self.segments.prune(now, protect_since=self.tracker.clip_start)
                last_prune = now

        self._drain_results()
        self._handle(self.tracker.flush(time.time()))
        self.status.state = "idle"

    def _drain_results(self) -> None:
        while True:
            try:
                ts, frame, boxes, result = self._results.get_nowait()
            except queue.Empty:
                return
            self._in_flight = False
            if not result:
                continue
            dets = filter_detections(
                result,
                boxes,
                targets=self.cam.targets,
                min_confidence=self.cam.min_confidence,
                require_overlap=self.cam.require_overlap,
            )
            self.tracker.add_detections(ts, dets, frame)

    def _handle(self, finished: list[FinishedEvent]) -> None:
        for ev in finished:
            token = self.segments.hold(ev.clip_start)
            labels = ", ".join(sorted(ev.tags)) or "motion"
            print(f"[{self.cam.display_name}] イベント検出: {labels}({ev.ended_at - ev.started_at:.0f} 秒)", flush=True)
            self.recorder.submit(RecordJob(self.cam.id, self.segments, ev, token, rotate=self.cam.rotate))

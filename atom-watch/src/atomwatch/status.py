"""実行中の状態(カメラごと)。解析スレッドが書き、ウェブと CLI のステータス表示が読む。"""

from __future__ import annotations

import threading
import time
from dataclasses import dataclass, field

import numpy as np


@dataclass
class CameraStatus:
    id: str
    name: str
    connected: bool = False
    state: str = "idle"  # idle / motion / recording
    fps: float = 0.0
    last_frame_at: float = 0.0
    last_error: str = ""
    events_today: int = 0
    _frame: np.ndarray | None = field(default=None, repr=False)
    _lock: threading.Lock = field(default_factory=threading.Lock, repr=False)

    def set_frame(self, frame: np.ndarray, ts: float) -> None:
        with self._lock:
            self._frame = frame
            self.last_frame_at = ts

    def latest_frame(self) -> np.ndarray | None:
        with self._lock:
            return self._frame

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "connected": self.connected,
            "state": self.state,
            "fps": round(self.fps, 1),
            "last_frame_at": self.last_frame_at or None,
            "last_error": self.last_error,
            "events_today": self.events_today,
        }


class StatusRegistry:
    def __init__(self) -> None:
        self.cameras: dict[str, CameraStatus] = {}
        self.started_at = time.time()
        self.detector_ms = 0.0
        self.detector_queue = 0
        self.detector_dropped = 0
        self.disk_bytes = 0

    def add(self, cam_id: str, name: str) -> CameraStatus:
        st = CameraStatus(cam_id, name)
        self.cameras[cam_id] = st
        return st


def start_of_today(now: float | None = None) -> float:
    t = time.localtime(now if now is not None else time.time())
    return time.mktime((t.tm_year, t.tm_mon, t.tm_mday, 0, 0, 0, 0, 0, -1))

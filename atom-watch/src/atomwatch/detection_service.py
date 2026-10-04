"""全カメラで共有する推論スレッド。

- モデルは 1 つだけ読み込む(ラズパイのメモリ節約)
- 依頼はカメラごとに「最新の 1 件」だけ保持する。新しい依頼が来たら古い依頼は捨てる(遅延を溜めない)
- カメラ間は順番に処理し、動きの多いカメラが推論を独占しないようにする
"""

from __future__ import annotations

import threading
import time
from collections import OrderedDict
from typing import Callable

import numpy as np

from .detector import Detection, Detector

# 結果のコールバック。推論できずに捨てられた場合は None が渡る
Callback = Callable[[list[Detection] | None], None]


class DetectionService:
    def __init__(self, detector: Detector, workers: int = 1) -> None:
        self._detector = detector
        self._cond = threading.Condition()
        # camera_id -> (frame, callback)。OrderedDict の先頭から取り出し、取り出したカメラは末尾に回る
        self._pending: OrderedDict[str, tuple[np.ndarray, Callback]] = OrderedDict()
        self._stopped = False
        self._busy = 0
        self.dropped = 0
        self.processed = 0
        self._avg_ms = 0.0
        self._threads = [
            threading.Thread(target=self._run, name=f"detector-{i}", daemon=True) for i in range(max(1, workers))
        ]
        for t in self._threads:
            t.start()

    @property
    def avg_ms(self) -> float:
        return self._avg_ms

    @property
    def queue_length(self) -> int:
        with self._cond:
            return len(self._pending)

    def submit(self, camera_id: str, frame: np.ndarray, callback: Callback) -> None:
        with self._cond:
            if self._stopped:
                callback(None)
                return
            old = self._pending.pop(camera_id, None)
            self._pending[camera_id] = (frame, callback)
            self._cond.notify()
        if old is not None:
            self.dropped += 1
            old[1](None)

    def _run(self) -> None:
        while True:
            with self._cond:
                while not self._pending and not self._stopped:
                    self._cond.wait()
                if self._stopped:
                    return
                _, (frame, callback) = self._pending.popitem(last=False)
                self._busy += 1
            t0 = time.perf_counter()
            try:
                result: list[Detection] | None = self._detector.detect(frame)
            except Exception as e:  # 1 回の推論失敗で全体を止めない
                print(f"[detector] 推論エラー: {e}", flush=True)
                result = None
            ms = (time.perf_counter() - t0) * 1000
            with self._cond:
                self._busy -= 1
                self.processed += 1
                self._avg_ms = ms if self._avg_ms == 0 else self._avg_ms * 0.9 + ms * 0.1
            callback(result)

    def stop(self) -> None:
        with self._cond:
            self._stopped = True
            pending = list(self._pending.values())
            self._pending.clear()
            self._cond.notify_all()
        for _, cb in pending:
            cb(None)
        for t in self._threads:
            t.join(timeout=5)

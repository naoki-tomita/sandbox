import threading
import time

import numpy as np

from atomwatch.detection_service import DetectionService
from atomwatch.detector import Detection


class SlowDetector:
    def __init__(self, delay=0.05):
        self.delay = delay
        self.calls = []
        self.lock = threading.Lock()

    def detect(self, frame):
        time.sleep(self.delay)
        with self.lock:
            self.calls.append(int(frame[0, 0, 0]))
        return [Detection("person", 0.9, (0, 0, 1, 1))]


def frame(v):
    return np.full((2, 2, 3), v, dtype=np.uint8)


def test_latest_request_wins_and_old_is_dropped():
    det = SlowDetector(delay=0.2)
    svc = DetectionService(det)
    results = {}
    done = threading.Event()

    def cb(name):
        def f(r):
            results[name] = r
            if len(results) == 3:
                done.set()
        return f

    svc.submit("a", frame(1), cb("first"))  # すぐ処理が始まる
    time.sleep(0.05)
    svc.submit("a", frame(2), cb("second"))  # 待ち中に
    svc.submit("a", frame(3), cb("third"))  # 上書きされる → second は捨てられる
    assert done.wait(2)
    assert results["second"] is None
    assert results["first"] and results["third"]
    assert det.calls == [1, 3]
    assert svc.dropped == 1
    svc.stop()


def test_round_robin_between_cameras():
    det = SlowDetector(delay=0.05)
    svc = DetectionService(det)
    finished = threading.Event()
    count = [0]

    def cb(r):
        if r is None:  # 上書きで捨てられた依頼は数えない
            return
        count[0] += 1
        if count[0] >= 4:
            finished.set()

    # 動きの多いカメラ a が依頼し続けても b が処理される
    stop = threading.Event()

    def spam():
        while not stop.is_set():
            svc.submit("a", frame(10), cb)
            time.sleep(0.005)

    t = threading.Thread(target=spam)
    t.start()
    time.sleep(0.02)
    svc.submit("b", frame(20), cb)
    assert finished.wait(3)
    stop.set()
    t.join()
    assert 20 in det.calls[:3]
    svc.stop()


def test_stop_releases_pending_callbacks():
    det = SlowDetector(delay=0.3)
    svc = DetectionService(det)
    got = []
    svc.submit("a", frame(1), got.append)
    time.sleep(0.05)
    svc.submit("b", frame(2), got.append)
    svc.stop()
    assert None in got
    svc.submit("c", frame(3), got.append)
    assert got[-1] is None

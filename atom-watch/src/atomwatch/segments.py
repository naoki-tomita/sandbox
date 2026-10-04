"""録画素材(ffmpeg が書き出す 2 秒程度の .ts ファイル)のリングバッファ。

ファイル名はセグメントの開始時刻(ローカル時刻)。セグメントの終了時刻は「次のセグメントの開始時刻」と
みなす。最新のセグメントは書き込み中なので、終了時刻は未確定として扱う。
"""

from __future__ import annotations

import itertools
import threading
import time
from dataclasses import dataclass
from pathlib import Path

FILENAME_FORMAT = "%Y%m%d-%H%M%S"  # ffmpeg の -strftime と共通
SUFFIX = ".ts"


@dataclass(frozen=True)
class Segment:
    path: Path
    start: float
    end: float | None  # None = 書き込み中


def parse_start(path: Path) -> float | None:
    try:
        return time.mktime(time.strptime(path.stem, FILENAME_FORMAT))
    except ValueError:
        return None


class SegmentStore:
    def __init__(self, directory: Path, keep_seconds: float = 60.0) -> None:
        self.directory = directory
        self.keep_seconds = keep_seconds
        directory.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self._holds: dict[int, float] = {}
        self._ids = itertools.count()
        # ffmpeg が止まっていて新しいセグメントが来ない状態(終了処理中など)
        self.closed = False

    def list(self) -> list[Segment]:
        entries = []
        for p in self.directory.glob(f"*{SUFFIX}"):
            start = parse_start(p)
            if start is not None:
                entries.append((start, p))
        entries.sort()
        segments = []
        for i, (start, p) in enumerate(entries):
            end = entries[i + 1][0] if i + 1 < len(entries) else None
            segments.append(Segment(p, start, end))
        return segments

    def select(self, start: float, end: float) -> list[Segment]:
        """[start, end] にかかるセグメントを返す。"""
        out = []
        for seg in self.list():
            seg_end = seg.end if seg.end is not None else float("inf")
            if seg.start <= end and seg_end > start:
                out.append(seg)
        return out

    def has_segment_after(self, t: float) -> bool:
        """t より後に始まったセグメントがあるか(= t を含むセグメントは書き終わっている)。"""
        return any(seg.start > t for seg in self.list())

    def hold(self, since: float) -> int:
        """since 以降のセグメントを消さないよう保護する。release で解除する。"""
        with self._lock:
            token = next(self._ids)
            self._holds[token] = since
            return token

    def release(self, token: int) -> None:
        with self._lock:
            self._holds.pop(token, None)

    def prune(self, now: float, protect_since: float | None = None) -> int:
        """keep_seconds より古く、保護されていないセグメントを削除する。削除数を返す。"""
        cutoff = now - self.keep_seconds
        with self._lock:
            holds = list(self._holds.values())
        if protect_since is not None:
            holds.append(protect_since)
        if holds:
            cutoff = min(cutoff, min(holds))
        removed = 0
        for seg in self.list():
            # 終了時刻が cutoff より前のもの(= 完全に古いもの)だけ消す
            if seg.end is not None and seg.end < cutoff:
                seg.path.unlink(missing_ok=True)
                removed += 1
        return removed

    def clear(self) -> None:
        for p in self.directory.glob(f"*{SUFFIX}"):
            p.unlink(missing_ok=True)

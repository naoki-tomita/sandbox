"""イベント(1 本のクリップになる区間)の状態機械。

外部依存を持たない純粋なロジックにしてあり、時刻は呼び出し側から渡す。

    idle ──動き──▶ motion ──対象物を min_hits 回検出──▶ recording
      ▲               │                                    │
      └──動きが post_roll 秒止まる(未確定なら破棄)◀────────┘
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Iterable, Sequence

from .detector import Detection
from .motion import Box, MotionResult


@dataclass
class TagStat:
    max_conf: float = 0.0
    hits: int = 0


@dataclass
class FinishedEvent:
    started_at: float  # 動き始め
    ended_at: float  # 最後に動きがあった時刻
    clip_start: float  # クリップに含める範囲(前後の余白込み)
    clip_end: float
    tags: dict[str, TagStat]
    detections: list[tuple[float, Detection]]
    peak_motion: float
    confirmed: bool
    # サムネイル用: 一番信頼度の高い検出があったフレームと、その時の検出結果
    best_frame: Any = None
    best_detections: list[Detection] = field(default_factory=list)


def _overlaps(a: Box, b: Box) -> bool:
    ax, ay, aw, ah = a
    bx, by, bw, bh = b
    return ax < bx + bw and bx < ax + aw and ay < by + bh and by < ay + ah


def filter_detections(
    detections: Iterable[Detection],
    motion_boxes: Sequence[Box],
    targets: Sequence[str],
    min_confidence: float,
    require_overlap: bool = True,
) -> list[Detection]:
    """対象クラス・信頼度・動き領域との重なりで検出結果を絞る。

    動き領域と重なることを要求するのは、止まっている物体(駐車中の車など)が
    木の揺れなど無関係な動きのたびに数えられるのを防ぐため。
    """
    target_set = set(targets)
    out = []
    for d in detections:
        if d.label not in target_set or d.conf < min_confidence:
            continue
        if require_overlap and not any(_overlaps(d.box, m) for m in motion_boxes):
            continue
        out.append(d)
    return out


class EventTracker:
    def __init__(
        self,
        *,
        min_hits: int = 2,
        pre_roll: float = 5.0,
        post_roll: float = 5.0,
        max_event: float = 300.0,
        keep_unclassified: bool = False,
    ) -> None:
        self.min_hits = min_hits
        self.pre_roll = pre_roll
        self.post_roll = post_roll
        self.max_event = max_event
        self.keep_unclassified = keep_unclassified
        self._current: FinishedEvent | None = None
        self._last_motion = 0.0
        self._hits = 0

    @property
    def state(self) -> str:
        if self._current is None:
            return "idle"
        return "recording" if self._current.confirmed else "motion"

    @property
    def clip_start(self) -> float | None:
        """進行中のイベントのクリップ開始時刻(録画素材を消さずに残す目安)。"""
        return self._current.clip_start if self._current else None

    def update(self, now: float, motion: MotionResult) -> list[FinishedEvent]:
        finished: list[FinishedEvent] = []
        ev = self._current
        if ev is not None:
            if now - self._last_motion >= self.post_roll:
                finished += self._finish(self._last_motion + self.post_roll)
                ev = None
            elif now - ev.started_at >= self.max_event:
                # 長すぎるイベントは分割する。続きは余白なしで始める
                finished += self._finish(now)
                ev = self._start(now, pre_roll=0.0) if motion.active else None

        if motion.active:
            if ev is None:
                ev = self._start(now, pre_roll=self.pre_roll)
            self._last_motion = now
            ev.ended_at = now
            ev.peak_motion = max(ev.peak_motion, motion.score)
        return finished

    def add_detections(self, ts: float, detections: Sequence[Detection], frame: Any = None) -> None:
        """フィルタ済みの検出結果を、進行中のイベントに取り込む。"""
        ev = self._current
        if ev is None or not detections or ts < ev.clip_start:
            return
        self._hits += 1
        for d in detections:
            stat = ev.tags.setdefault(d.label, TagStat())
            stat.hits += 1
            stat.max_conf = max(stat.max_conf, d.conf)
            ev.detections.append((ts, d))
        best = max(d.conf for d in detections)
        if not ev.best_detections or best > max(d.conf for d in ev.best_detections):
            ev.best_frame = frame
            ev.best_detections = list(detections)
        if self._hits >= self.min_hits:
            ev.confirmed = True

    def flush(self, now: float) -> list[FinishedEvent]:
        """終了時: 進行中のイベントを今の時刻で締める。"""
        if self._current is None:
            return []
        return self._finish(min(now, self._last_motion + self.post_roll))

    def _start(self, now: float, pre_roll: float) -> FinishedEvent:
        self._current = FinishedEvent(
            started_at=now,
            ended_at=now,
            clip_start=now - pre_roll,
            clip_end=now,
            tags={},
            detections=[],
            peak_motion=0.0,
            confirmed=False,
        )
        self._hits = 0
        return self._current

    def _finish(self, clip_end: float) -> list[FinishedEvent]:
        ev = self._current
        self._current = None
        assert ev is not None
        ev.clip_end = max(clip_end, ev.clip_start)
        if ev.confirmed:
            return [ev]
        if self.keep_unclassified:
            ev.tags.setdefault("motion", TagStat(max_conf=0.0, hits=0))
            return [ev]
        return []

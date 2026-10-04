"""動き検知。背景差分(MOG2)で「前景」になった領域を動きとして扱う。

- マスク: 時刻の焼き込みなど、変化しても無視したい領域を除外する
- 照明変化: 画面の大部分が一度に変わったら(照明の点灯や赤外線モードの切替)動きとみなさず、
  背景モデルを作り直す
- 小さな変化: 最小面積に満たない領域は捨てる
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Sequence

import cv2
import numpy as np

Box = tuple[float, float, float, float]  # 0〜1 に正規化した (x, y, w, h)


@dataclass(frozen=True)
class MotionResult:
    active: bool = False
    score: float = 0.0  # 変化した画素の割合(マスク外の面積に対する比)
    boxes: list[Box] = field(default_factory=list)
    lighting_change: bool = False


NO_MOTION = MotionResult()

# 処理を軽くするため、背景差分はこの幅まで縮小してから行う
_WORK_WIDTH = 320


class MotionDetector:
    def __init__(
        self,
        frame_hw: tuple[int, int],
        mask_regions: Sequence[Sequence[float]] = (),
        min_area: float = 0.003,
        lighting_change_ratio: float = 0.6,
        sensitivity: float = 25.0,
        warmup_frames: int = 10,
    ) -> None:
        h, w = frame_hw
        scale = min(1.0, _WORK_WIDTH / w)
        self._work_size = (max(1, round(w * scale)), max(1, round(h * scale)))
        ww, wh = self._work_size
        self._mask = np.full((wh, ww), 255, dtype=np.uint8)
        for x, y, rw, rh in mask_regions:
            x0, y0 = int(x * ww), int(y * wh)
            x1, y1 = int(np.ceil((x + rw) * ww)), int(np.ceil((y + rh) * wh))
            self._mask[y0:y1, x0:x1] = 0
        self._mask_area = max(1, int(np.count_nonzero(self._mask)))
        self._min_area_px = min_area * ww * wh
        self._lighting_ratio = lighting_change_ratio
        self._sensitivity = sensitivity
        self._warmup_frames = warmup_frames
        self._kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
        self._reset()

    def _reset(self) -> None:
        self._bg = cv2.createBackgroundSubtractorMOG2(
            history=300, varThreshold=self._sensitivity, detectShadows=False
        )
        self._frames_seen = 0

    def update(self, frame: np.ndarray) -> MotionResult:
        small = cv2.resize(frame, self._work_size, interpolation=cv2.INTER_AREA)
        gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY) if small.ndim == 3 else small
        gray = cv2.GaussianBlur(gray, (5, 5), 0)
        fg = self._bg.apply(gray)
        self._frames_seen += 1
        if self._frames_seen <= self._warmup_frames:
            return NO_MOTION

        fg = cv2.bitwise_and(fg, self._mask)
        _, fg = cv2.threshold(fg, 127, 255, cv2.THRESH_BINARY)
        score = float(np.count_nonzero(fg)) / self._mask_area
        if score >= self._lighting_ratio:
            self._reset()
            return MotionResult(score=score, lighting_change=True)

        fg = cv2.morphologyEx(fg, cv2.MORPH_OPEN, self._kernel)
        fg = cv2.dilate(fg, self._kernel, iterations=2)
        contours, _ = cv2.findContours(fg, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        ww, wh = self._work_size
        boxes: list[Box] = []
        for c in contours:
            if cv2.contourArea(c) < self._min_area_px:
                continue
            x, y, w, h = cv2.boundingRect(c)
            boxes.append((x / ww, y / wh, w / ww, h / wh))
        return MotionResult(active=bool(boxes), score=score, boxes=boxes)

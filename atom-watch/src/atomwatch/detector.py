"""物体検出。YOLOX (ONNX) を ONNX Runtime で動かす。

検出器は `Detector` Protocol 越しに使うので、別のモデルや後処理(VLM でのキャプション付けなど)を
差し込む場合はこのインターフェースを実装すればよい。
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Protocol, Sequence

import cv2
import numpy as np

COCO_LABELS: tuple[str, ...] = (
    "person", "bicycle", "car", "motorcycle", "airplane", "bus", "train", "truck", "boat",
    "traffic light", "fire hydrant", "stop sign", "parking meter", "bench", "bird", "cat", "dog",
    "horse", "sheep", "cow", "elephant", "bear", "zebra", "giraffe", "backpack", "umbrella",
    "handbag", "tie", "suitcase", "frisbee", "skis", "snowboard", "sports ball", "kite",
    "baseball bat", "baseball glove", "skateboard", "surfboard", "tennis racket", "bottle",
    "wine glass", "cup", "fork", "knife", "spoon", "bowl", "banana", "apple", "sandwich", "orange",
    "broccoli", "carrot", "hot dog", "pizza", "donut", "cake", "chair", "couch", "potted plant",
    "bed", "dining table", "toilet", "tv", "laptop", "mouse", "remote", "keyboard", "cell phone",
    "microwave", "oven", "toaster", "sink", "refrigerator", "book", "clock", "vase", "scissors",
    "teddy bear", "hair drier", "toothbrush",
)


@dataclass(frozen=True)
class Detection:
    label: str
    conf: float
    # 0〜1 に正規化した (x, y, w, h)。解析フレームの解像度に依存しないようにする
    box: tuple[float, float, float, float]


class Detector(Protocol):
    def detect(self, frame: np.ndarray) -> list[Detection]: ...


class YoloxOnnxDetector:
    def __init__(
        self,
        model_path: str | Path,
        conf_threshold: float = 0.35,
        nms_threshold: float = 0.45,
        labels: Sequence[str] = COCO_LABELS,
        threads: int = 0,
    ) -> None:
        import onnxruntime as ort

        opts = ort.SessionOptions()
        if threads > 0:
            opts.intra_op_num_threads = threads
        self._session = ort.InferenceSession(
            str(model_path), sess_options=opts, providers=["CPUExecutionProvider"]
        )
        inp = self._session.get_inputs()[0]
        self._input_name = inp.name
        self._input_hw = (int(inp.shape[2]), int(inp.shape[3]))
        self._grids, self._strides = _make_grids(self._input_hw)
        self.conf_threshold = conf_threshold
        self.nms_threshold = nms_threshold
        self.labels = tuple(labels)

    def detect(self, frame: np.ndarray) -> list[Detection]:
        blob, ratio = preprocess(frame, self._input_hw)
        out = self._session.run(None, {self._input_name: blob})[0]
        return postprocess(
            out[0],
            self._grids,
            self._strides,
            ratio=ratio,
            frame_hw=frame.shape[:2],
            conf_threshold=self.conf_threshold,
            nms_threshold=self.nms_threshold,
            labels=self.labels,
        )


def preprocess(frame: np.ndarray, input_hw: tuple[int, int]) -> tuple[np.ndarray, float]:
    """アスペクト比を保って縮小し、右下を 114 で埋める(YOLOX の学習時と同じ前処理)。"""
    ih, iw = input_hw
    h, w = frame.shape[:2]
    ratio = min(ih / h, iw / w)
    nh, nw = int(h * ratio), int(w * ratio)
    padded = np.full((ih, iw, 3), 114, dtype=np.uint8)
    padded[:nh, :nw] = cv2.resize(frame, (nw, nh), interpolation=cv2.INTER_LINEAR)
    blob = padded.transpose(2, 0, 1)[None].astype(np.float32)
    return np.ascontiguousarray(blob), ratio


def _make_grids(input_hw: tuple[int, int], strides=(8, 16, 32)) -> tuple[np.ndarray, np.ndarray]:
    grids, expanded = [], []
    for s in strides:
        gh, gw = input_hw[0] // s, input_hw[1] // s
        xv, yv = np.meshgrid(np.arange(gw), np.arange(gh))
        grids.append(np.stack((xv, yv), 2).reshape(-1, 2))
        expanded.append(np.full((gh * gw, 1), s))
    return np.concatenate(grids).astype(np.float32), np.concatenate(expanded).astype(np.float32)


def postprocess(
    raw: np.ndarray,
    grids: np.ndarray,
    strides: np.ndarray,
    *,
    ratio: float,
    frame_hw: tuple[int, int],
    conf_threshold: float,
    nms_threshold: float,
    labels: Sequence[str] = COCO_LABELS,
) -> list[Detection]:
    """YOLOX の生出力 (N, 5 + classes) をデコードして NMS をかける。"""
    xy = (raw[:, :2] + grids) * strides
    wh = np.exp(np.clip(raw[:, 2:4], -10, 10)) * strides
    scores = raw[:, 4:5] * raw[:, 5:]
    cls = scores.argmax(1)
    conf = scores[np.arange(len(cls)), cls]
    keep = conf >= conf_threshold
    if not keep.any():
        return []
    xy, wh, cls, conf = xy[keep] / ratio, wh[keep] / ratio, cls[keep], conf[keep]
    boxes = np.concatenate([xy - wh / 2, wh], 1)  # x, y, w, h (フレーム座標)

    fh, fw = frame_hw
    results: list[Detection] = []
    # クラスごとに NMS(別クラスの重なりは潰さない)
    for c in np.unique(cls):
        idx = np.where(cls == c)[0]
        kept = cv2.dnn.NMSBoxes(
            boxes[idx].tolist(), conf[idx].tolist(), conf_threshold, nms_threshold
        )
        for k in np.array(kept).reshape(-1):
            x, y, w, h = (float(v) for v in boxes[idx[k]])
            x0, y0 = max(0.0, x), max(0.0, y)
            x1, y1 = min(float(fw), x + w), min(float(fh), y + h)
            if x1 <= x0 or y1 <= y0:
                continue
            label = labels[c] if c < len(labels) else str(int(c))
            results.append(
                Detection(
                    label=label,
                    conf=float(conf[idx[k]]),
                    box=(x0 / fw, y0 / fh, (x1 - x0) / fw, (y1 - y0) / fh),
                )
            )
    results.sort(key=lambda d: d.conf, reverse=True)
    return results

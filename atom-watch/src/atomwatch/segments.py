"""録画素材(ffmpeg が書き出す 2 秒程度の .ts ファイル)のリングバッファ。

セグメントの時刻は、ffmpeg が書き終えるたびに追記する一覧(-segment_list の CSV)から取る。CSV の時刻は
映像ストリーム自身の時刻(秒)で、解析用フレームと同じ時間軸に乗っている。これを実時刻に直すための基準点
(アンカー)は FfmpegSource が解析用フレームの受信時刻から決め、両者で同じものを使う。
こうすることで、検出時刻と録画の位置がずれない(ファイルを開いた時刻のような、遅れ方が毎回違う時計を使わない)。

ffmpeg を起動し直すとストリーム時刻は 0 から始まり直すので、起動(接続)ごとに「ラン」を分け、
ファイル名と CSV に接頭辞を付けて区別する。書き込み中のセグメントは CSV に載らないので扱わない。
"""

from __future__ import annotations

import csv
import itertools
import threading
from dataclasses import dataclass, field
from pathlib import Path

SUFFIX = ".ts"


@dataclass(frozen=True)
class Segment:
    path: Path
    start: float  # 実時刻
    end: float


@dataclass
class _Run:
    name: str
    anchor: float | None = None  # ストリーム時刻 0 に当たる実時刻。最初のフレームが届くまでは None
    offset: int = 0  # CSV をどこまで読んだか(バイト)
    entries: list[tuple[str, float, float]] = field(default_factory=list)  # (ファイル名, 開始, 終了) ストリーム時刻


class SegmentStore:
    def __init__(self, directory: Path, keep_seconds: float = 60.0) -> None:
        self.directory = directory
        self.keep_seconds = keep_seconds
        directory.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self._holds: dict[int, float] = {}
        self._ids = itertools.count()
        self._runs: list[_Run] = []
        self._run_ids = itertools.count(1)
        # ffmpeg が止まっていて新しいセグメントが来ない状態(終了処理中など)
        self.closed = False

    # --- ffmpeg 側(FfmpegSource)から使う ---

    def new_run(self) -> str:
        """ffmpeg を起動するたびに呼ぶ。ファイル名・CSV の接頭辞を返す。"""
        with self._lock:
            run = _Run(f"r{next(self._run_ids):04d}")
            self._runs.append(run)
            return run.name

    def segment_pattern(self, run: str) -> Path:
        return self.directory / f"{run}-%06d{SUFFIX}"

    def list_path(self, run: str) -> Path:
        return self.directory / f"{run}.csv"

    def set_anchor(self, run: str, anchor: float) -> None:
        with self._lock:
            for r in self._runs:
                if r.name == run:
                    r.anchor = anchor

    # --- 録画側から使う ---

    def list(self) -> list[Segment]:
        """書き終わったセグメントを開始時刻順に返す。"""
        with self._lock:
            out = []
            for run in self._runs:
                self._read_new_entries(run)
                if run.anchor is None:
                    continue
                for name, start, end in run.entries:
                    out.append(Segment(self.directory / name, run.anchor + start, run.anchor + end))
        out.sort(key=lambda s: s.start)
        return out

    def select(self, start: float, end: float) -> list[Segment]:
        """[start, end] にかかるセグメントを返す。"""
        return [seg for seg in self.list() if seg.start <= end and seg.end > start]

    def covers(self, t: float) -> bool:
        """t を含むセグメントまで書き終わっているか。"""
        return any(seg.end > t for seg in self.list())

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
            for run in self._runs:
                self._read_new_entries(run)
                if run.anchor is None:
                    continue
                keep = []
                for entry in run.entries:
                    # 終了時刻が cutoff より前のもの(= 完全に古いもの)だけ消す
                    if run.anchor + entry[2] < cutoff:
                        (self.directory / entry[0]).unlink(missing_ok=True)
                        removed += 1
                    else:
                        keep.append(entry)
                run.entries = keep
            # 終わったランのうち、セグメントが残っていないもの・最後までフレームが届かず使えないものは片付ける
            alive = self._runs[-1:]
            for run in self._runs[:-1]:
                if run.anchor is not None and run.entries:
                    alive.insert(-1, run)
                    continue
                # 強制終了などで CSV に載らなかった書きかけのファイルも含めて消す
                for p in self.directory.glob(f"{run.name}-*{SUFFIX}"):
                    p.unlink(missing_ok=True)
                    removed += 1
                self.list_path(run.name).unlink(missing_ok=True)
            self._runs = alive
            return removed

    def clear(self) -> None:
        with self._lock:
            for p in itertools.chain(self.directory.glob(f"*{SUFFIX}"), self.directory.glob("*.csv")):
                p.unlink(missing_ok=True)
            self._runs = []

    def _read_new_entries(self, run: _Run) -> None:
        """CSV の追記分を読む。書きかけの最終行(改行がまだない行)は次回に回す。"""
        try:
            with open(self.list_path(run.name), "rb") as f:
                f.seek(run.offset)
                data = f.read()
        except FileNotFoundError:
            return
        complete = data[: data.rfind(b"\n") + 1]
        run.offset += len(complete)
        for row in csv.reader(complete.decode("utf-8", "replace").splitlines()):
            try:
                name, start, end = row[0], float(row[1]), float(row[2])
            except (IndexError, ValueError):
                continue
            run.entries.append((name, start, end))

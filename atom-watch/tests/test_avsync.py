import shutil
import subprocess
from pathlib import Path

import pytest

from atomwatch.avsync import av_offset, is_desynced
from atomwatch.pipeline import CameraPipeline
from atomwatch.segments import SegmentStore

needs_ffmpeg = pytest.mark.skipif(
    shutil.which("ffmpeg") is None or shutil.which("ffprobe") is None, reason="ffmpeg がない"
)


def make_segment(path: Path, audio_shift: float = 0.0) -> Path:
    """映像 2 秒 + 音声のセグメント。audio_shift で音声の時刻だけをずらす(カメラの音声の時刻が飛んだ状態)。"""
    subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "testsrc=size=160x90:rate=20",
         "-itsoffset", str(audio_shift), "-f", "lavfi", "-i", "sine=r=8000", "-t", "2",
         "-map", "0:v", "-map", "1:a", "-c:v", "libx264", "-c:a", "mp2", "-f", "mpegts", str(path)],
        check=True,
    )
    return path


@needs_ffmpeg
def test_av_offset(tmp_path: Path):
    ok = make_segment(tmp_path / "ok.ts")
    bad = make_segment(tmp_path / "bad.ts", audio_shift=100)
    assert abs(av_offset(ok)) < 0.2 and not is_desynced(ok)
    assert av_offset(bad) == pytest.approx(100, abs=0.2) and is_desynced(bad)


@needs_ffmpeg
def test_av_offset_without_audio(tmp_path: Path):
    path = tmp_path / "v.ts"
    subprocess.run(["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "testsrc=size=160x90:rate=20", "-t", "1",
                    "-c:v", "libx264", "-f", "mpegts", str(path)], check=True)
    assert av_offset(path) is None and not is_desynced(path)


class FakeSource:
    def __init__(self) -> None:
        self.restarts: list[str] = []

    def restart(self, reason: str) -> None:
        self.restarts.append(reason)


@needs_ffmpeg
def test_pipeline_reconnects_once_when_audio_drifts(tmp_path: Path):
    store = SegmentStore(tmp_path / "seg")
    run = store.new_run()
    store.set_anchor(run, 0.0)
    make_segment(tmp_path / "seg" / f"{run}-000000.ts")
    make_segment(tmp_path / "seg" / f"{run}-000001.ts", audio_shift=100)
    pipe = CameraPipeline.__new__(CameraPipeline)  # 解析ループは動かさず、ずれの確認だけ試す
    pipe.segments, pipe.source, pipe._last_av_checked = store, FakeSource(), None

    store.list_path(run).write_text(f"{run}-000000.ts,0,2\n")
    pipe._check_av_sync()
    assert pipe.source.restarts == []

    store.list_path(run).write_text(f"{run}-000000.ts,0,2\n{run}-000001.ts,2,4\n")
    pipe._check_av_sync()
    assert len(pipe.source.restarts) == 1
    pipe._check_av_sync()  # 接続し直したあと新しいセグメントがまだない: 同じものを見て何度も接続し直さない
    assert len(pipe.source.restarts) == 1

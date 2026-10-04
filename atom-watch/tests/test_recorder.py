import shutil
import subprocess
from pathlib import Path

import pytest

from atomwatch.recorder import Recorder, rotation_args


def test_rotation_args():
    assert rotation_args(0, legacy=False) == ([], [])
    assert rotation_args(90, legacy=False) == (["-display_rotation:v:0", "-90"], [])
    # ffmpeg 5 以前の rotate メタデータは反時計回りに解釈される
    assert rotation_args(90, legacy=True) == ([], ["-metadata:s:v:0", "rotate=270"])
    assert rotation_args(180, legacy=True) == ([], ["-metadata:s:v:0", "rotate=180"])


@pytest.mark.skipif(shutil.which("ffmpeg") is None or shutil.which("ffprobe") is None, reason="ffmpeg がない")
def test_concat_adds_rotation_without_reencoding(tmp_path: Path):
    seg = tmp_path / "a.ts"
    subprocess.run(
        ["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "testsrc=size=320x180:rate=10", "-t", "1",
         "-c:v", "libx264", "-f", "mpegts", str(seg)],
        check=True,
    )
    out = tmp_path / "out.mp4"
    rec = Recorder.__new__(Recorder)  # スレッドや DB は使わないので _concat に要る属性だけ用意する
    rec.ffmpeg, rec._legacy_rotation = "ffmpeg", False
    rec._concat([seg], out, rotate=90)
    probe = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height:stream_side_data=rotation",
         "-of", "default=nw=1", str(out)],
        capture_output=True, text=True, check=True,
    ).stdout
    assert "width=320" in probe and "height=180" in probe  # 映像そのものは回していない
    assert "rotation=-90" in probe

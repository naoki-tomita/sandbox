import shutil
import subprocess
from pathlib import Path

import pytest

from atomwatch.recorder import Recorder, rotation_args
from atomwatch.segments import Segment


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
    rec._concat([Segment(seg, 0.0, 1.0)], out, rotate=90)
    probe = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height:stream_side_data=rotation",
         "-of", "default=nw=1", str(out)],
        capture_output=True, text=True, check=True,
    ).stdout
    assert "width=320" in probe and "height=180" in probe  # 映像そのものは回していない
    assert "rotation=-90" in probe


@pytest.mark.skipif(shutil.which("ffmpeg") is None or shutil.which("ffprobe") is None, reason="ffmpeg がない")
def test_concat_keeps_segments_on_their_own_times(tmp_path: Path):
    # カメラの録画と同じく、各セグメントは映像のキーフレームから始まり、映像(2 秒)より少し長い音声が入っている
    # (AAC は先頭に余白が入って音声が映像より前から始まってしまうので、余白のない mp2 で作る)
    segs = []
    for i in range(4):
        path = tmp_path / f"{i}.ts"
        subprocess.run(
            ["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "testsrc=size=160x90:rate=20", "-t", "2",
             "-f", "lavfi", "-i", "sine=r=8000", "-t", "2.1", "-c:v", "libx264", "-g", "100", "-sc_threshold", "0", "-c:a", "mp2",
             "-f", "mpegts", str(path)],
            check=True,
        )
        segs.append(Segment(path, 100.0 + i * 2, 102.0 + i * 2))
    out = tmp_path / "out.mp4"
    rec = Recorder.__new__(Recorder)
    rec.ffmpeg, rec._legacy_rotation = "ffmpeg", False
    rec._concat(segs, out)
    keyframes = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "packet=pts_time,flags", "-of", "csv=p=0", str(out)],
        capture_output=True, text=True, check=True,
    ).stdout
    starts = [float(line.split(",")[0]) for line in keyframes.split() if ",K" in line]
    # 音声の長さに引きずられず、セグメントの時刻どおり 2 秒ごとに並ぶ(先頭の音声エンコーダの余白ぶんは除く)
    assert [t - starts[0] for t in starts] == pytest.approx([0.0, 2.0, 4.0, 6.0], abs=0.01)

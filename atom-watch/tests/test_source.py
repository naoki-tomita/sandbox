import shutil
import subprocess
from pathlib import Path

import numpy as np
import pytest

from atomwatch.config import CameraConfig
from atomwatch.recorder import Recorder
from atomwatch.segments import SegmentStore
from atomwatch.source import StreamClock, build_command, is_stream_url, mask_url

SEG = Path("/seg/r0001-%06d.ts")
LIST = Path("/seg/r0001.csv")


def test_mask_url():
    assert mask_url("rtsp://user:secret@192.168.1.2:8554/live") == "rtsp://user:***@192.168.1.2:8554/live"
    assert mask_url("rtsp://192.168.1.2/live") == "rtsp://192.168.1.2/live"


def test_is_stream_url():
    assert is_stream_url("rtsp://x/y")
    assert not is_stream_url("/tmp/a.mp4")
    assert not is_stream_url("file:///tmp/a.mp4")


def test_build_command_rtsp():
    cam = CameraConfig(id="a", url="rtsp://h/live", hwaccel="videotoolbox", analysis_fps=3)
    cmd = build_command(cam, SEG, LIST)
    s = " ".join(cmd)
    assert "-rtsp_transport tcp" in s
    assert "-hwaccel videotoolbox" in s
    assert "-c:v copy" in s and "-f segment" in s
    assert f"-segment_list {LIST} -segment_list_type csv {SEG}" in s
    assert "fps=3:start_time=0,scale=640:360" in s
    assert cmd[-1] == "pipe:1"
    assert "-stream_loop" not in s


def test_build_command_file_loops_without_audio():
    cam = CameraConfig(id="a", url="/tmp/x.mp4", record_audio=False)
    s = " ".join(build_command(cam, SEG, LIST))
    assert "-re -stream_loop -1" in s
    assert "-an" in s and "-c:a" not in s


@pytest.mark.parametrize(
    "rotate,expected",
    [(0, "scale=640:360 "), (90, "scale=640:360,transpose=clock "), (270, "scale=640:360,transpose=cclock ")],
)
def test_build_command_rotates_analysis_frames(rotate, expected):
    cam = CameraConfig(id="a", url="rtsp://h/live", rotate=rotate)
    s = " ".join(build_command(cam, SEG, LIST))
    assert expected in s
    assert "-c:v copy" in s  # 録画は回転しても再エンコードしない


def test_stream_clock_uses_the_least_delayed_frame():
    clock = StreamClock(fps=5)
    # 接続直後はまとめて届く(遅れが大きい)→ 追いついたあとの、遅れの一番小さいフレームに合わせる
    assert clock.stamp(0, 100.0) == (100.0, True)
    ts, changed = clock.stamp(1, 100.05)  # 0.2 秒後のフレームが 0.05 秒後に届いた → 遅れが小さい方に合わせ直す
    assert changed and clock.anchor == pytest.approx(99.85) and ts == pytest.approx(100.05)
    ts, changed = clock.stamp(2, 100.6)  # 遅れて届いたフレームではアンカーを動かさない
    assert not changed and ts == pytest.approx(99.85 + 0.4)


# --- 実際の ffmpeg で、解析フレームの時刻と録画の位置が揃っていることを確かめる ---

W, H, FPS_IN, BLOCK = 160, 90, 20, 20


def frame_number(img: np.ndarray) -> int:
    """make_numbered_video で埋め込んだフレーム番号(8 ビットのブロック)を読む。"""
    gray = img.mean(axis=2) if img.ndim == 3 else img
    return sum(1 << b for b in range(8) if gray[:, b * BLOCK + 5 : b * BLOCK + 15].mean() > 128)


def make_numbered_video(path: Path) -> None:
    # フレーム番号を白黒のブロックで描いた映像。実カメラに合わせて音声が映像より先に始まるようにする
    geq = f"geq=lum='if(bitand(N\\,pow(2\\,floor(X/{BLOCK})))\\,235\\,16)':cb=128:cr=128"
    subprocess.run(
        ["ffmpeg", "-v", "error", "-f", "lavfi", "-i", f"nullsrc=s={W}x{H}:r={FPS_IN},{geq}",
         "-f", "lavfi", "-i", "sine=r=8000", "-t", "9",
         "-filter_complex", "[0]setpts=PTS+0.3/TB[v]", "-map", "[v]", "-map", "1:a",
         "-c:v", "libx264", "-g", "20", "-bf", "0", "-qp", "0", "-c:a", "mp2", "-f", "mpegts", str(path)],
        check=True,
    )


@pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="ffmpeg がない")
def test_analysis_frames_line_up_with_recorded_clip(tmp_path: Path):
    src = tmp_path / "in.ts"
    make_numbered_video(src)
    cam = CameraConfig(id="a", url=str(src), analysis_width=W, analysis_height=H, analysis_fps=5)
    store = SegmentStore(tmp_path / "seg")
    run = store.new_run()
    cmd = build_command(cam, store.segment_pattern(run), store.list_path(run))
    i = cmd.index("-re")
    del cmd[i : i + 3]  # 実時間再生・ループをやめて一気に処理する
    out = subprocess.run(cmd, capture_output=True, check=True).stdout
    frames = np.frombuffer(out, np.uint8).reshape(-1, H, W, 3)

    clock = StreamClock(cam.analysis_fps)
    # 実際の受信と同じく、フレームは 1/fps ごとに届く(0.1 秒遅れ)ものとする
    stamped = [(clock.stamp(k, 1000.1 + k / cam.analysis_fps)[0], frame_number(f)) for k, f in enumerate(frames)]
    store.set_anchor(run, clock.anchor)

    rec = Recorder.__new__(Recorder)  # スレッドや DB は使わないので _concat に要る属性だけ用意する
    rec.ffmpeg, rec._legacy_rotation = "ffmpeg", False
    segs = store.list()
    assert len(segs) >= 3
    # 実行の最初のセグメントから始まるクリップと、途中のセグメントから始まるクリップの両方を確かめる
    for first in (0, 1):
        diffs = []
        clip = tmp_path / f"clip{first}.mp4"
        rec._concat([s.path for s in segs[first:]], clip)
        video_start = segs[first].start
        for ts, n in stamped:
            t_offset = ts - video_start  # recorder が DB に保存する値。再生画面はこの位置に枠を出す
            if t_offset < 0.5 or ts > segs[-1].end - 0.5:
                continue
            got = subprocess.run(
                ["ffmpeg", "-v", "error", "-ss", f"{t_offset:.3f}", "-i", str(clip), "-frames:v", "1",
                 "-pix_fmt", "gray", "-f", "rawvideo", "-"],
                capture_output=True, check=True,
            ).stdout
            diffs.append(frame_number(np.frombuffer(got[: W * H], np.uint8).reshape(H, W)) - n)
        assert len(diffs) >= 20  # 照合を素通りしていないこと
        # 音声の AAC 変換と fps フィルタの丸めで、録画側が 3 フレーム(0.15 秒)ほど遅れる。
        # これは毎回同じだけ遅れる一定のずれで、許容する。クリップごとにばらつくずれは許さない
        assert all(abs(d) <= 4 for d in diffs), (first, diffs)
        assert max(diffs) - min(diffs) <= 2, (first, diffs)

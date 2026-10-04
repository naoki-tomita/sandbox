from pathlib import Path

from atomwatch.config import CameraConfig
from atomwatch.source import build_command, is_stream_url, mask_url


def test_mask_url():
    assert mask_url("rtsp://user:secret@192.168.1.2:8554/live") == "rtsp://user:***@192.168.1.2:8554/live"
    assert mask_url("rtsp://192.168.1.2/live") == "rtsp://192.168.1.2/live"


def test_is_stream_url():
    assert is_stream_url("rtsp://x/y")
    assert not is_stream_url("/tmp/a.mp4")
    assert not is_stream_url("file:///tmp/a.mp4")


def test_build_command_rtsp():
    cam = CameraConfig(id="a", url="rtsp://h/live", hwaccel="videotoolbox", analysis_fps=3)
    cmd = build_command(cam, Path("/seg"))
    s = " ".join(cmd)
    assert "-rtsp_transport tcp" in s
    assert "-hwaccel videotoolbox" in s
    assert "-c:v copy" in s and "-f segment" in s
    assert "fps=3,scale=640:360" in s
    assert cmd[-1] == "pipe:1"
    assert "-stream_loop" not in s


def test_build_command_file_loops_without_audio():
    cam = CameraConfig(id="a", url="/tmp/x.mp4", record_audio=False)
    s = " ".join(build_command(cam, Path("/seg")))
    assert "-re -stream_loop -1" in s
    assert "-an" in s and "-c:a" not in s

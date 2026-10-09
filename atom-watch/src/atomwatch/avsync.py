"""録画素材の音声と映像の時刻のずれを調べる。

カメラから届く音声の時刻が、何日も接続したままだと映像から大きくずれることがある(実例: 約 91 分)。
そのまま録画すると、映像は数十秒なのに音声が 91 分後に置かれ、最後のコマが止まったまま続くクリップになる。
正常なセグメントでは音声は映像の 0.1 秒以内に始まるので、それより大きくずれていたら異常とみなす。
"""

from __future__ import annotations

import subprocess
from pathlib import Path

MAX_AV_OFFSET = 1.0  # これより音声と映像の開始がずれていたら異常(秒)


def av_offset(path: Path, ffprobe: str = "ffprobe") -> float | None:
    """セグメントの「音声の開始 - 映像の開始」(秒)。音声がない・調べられないときは None。"""
    try:
        res = subprocess.run(
            [ffprobe, "-v", "error", "-show_entries", "stream=codec_type,start_time", "-of", "csv=p=0", str(path)],
            capture_output=True, text=True, timeout=10, start_new_session=True,
        )
    except (OSError, subprocess.TimeoutExpired):
        return None
    starts: dict[str, float] = {}
    for line in res.stdout.splitlines():
        kind, _, start = line.partition(",")
        try:
            starts.setdefault(kind, float(start.strip(",")))
        except ValueError:
            continue
    if "video" not in starts or "audio" not in starts:
        return None
    return starts["audio"] - starts["video"]


def is_desynced(path: Path, ffprobe: str = "ffprobe") -> bool:
    offset = av_offset(path, ffprobe)
    return offset is not None and abs(offset) > MAX_AV_OFFSET

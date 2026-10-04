"""物体検出モデル(YOLOX の ONNX 版、Apache-2.0)をダウンロードして models/ に置く。

    uv run python scripts/fetch_model.py           # nano(既定。古いラズパイ向け)
    uv run python scripts/fetch_model.py tiny      # tiny(精度が少し上。Mac やラズパイ 4/5 向け)
"""

from __future__ import annotations

import sys
import urllib.request
from pathlib import Path

BASE = "https://github.com/Megvii-BaseDetection/YOLOX/releases/download/0.1.1rc0"
MODELS = {
    "nano": "yolox_nano.onnx",  # 入力 416x416、約 3.5MB
    "tiny": "yolox_tiny.onnx",  # 入力 416x416、約 20MB
    "s": "yolox_s.onnx",  # 入力 640x640、約 35MB(重い)
}


def main() -> int:
    name = sys.argv[1] if len(sys.argv) > 1 else "nano"
    if name not in MODELS:
        print(f"使い方: fetch_model.py [{'|'.join(MODELS)}]", file=sys.stderr)
        return 2
    dest_dir = Path(__file__).resolve().parent.parent / "models"
    dest_dir.mkdir(exist_ok=True)
    dest = dest_dir / MODELS[name]
    if dest.exists():
        print(f"既にあります: {dest}")
        return 0
    url = f"{BASE}/{MODELS[name]}"
    print(f"ダウンロード中: {url}")
    tmp = dest.with_suffix(".part")
    urllib.request.urlretrieve(url, tmp)
    tmp.rename(dest)
    print(f"保存しました: {dest}")
    if name != "nano":
        print(f'config.toml の [detector] に model = "models/{MODELS[name]}" を設定してください')
    return 0


if __name__ == "__main__":
    sys.exit(main())

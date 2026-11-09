#!/bin/bash
# PLaMo 3 Translate (Preferred Networks) の翻訳サーバーを、この Mac で起動する。
# 初回はモデル (2B なら約 2.4 GB) と Python のパッケージをダウンロードする。
#
#   ./scripts/plamo-server.sh            # 2B (おすすめ)
#   ./scripts/plamo-server.sh 8b         # 8B (約 6 GB。訳はより良いが遅い)
#
# モデルのライセンスは PLaMo Community License (個人・非商用は無料)。
set -euo pipefail

SIZE="${1:-2b}"
MODEL="pfnet/plamo-3-translate-${SIZE}-MLX-4bit"
HOME_DIR="${PLAMO_HOME:-$HOME/.plamo}"
MODEL_DIR="$HOME_DIR/plamo-3-translate-${SIZE}-MLX-4bit"
PORT="${PORT:-8000}"

# transformers 5 は Python 3.10 以上が必要。macOS 付属の python3 (3.9) では動かない
find_python() {
  for candidate in python3.13 python3.12 python3.11 python3.10 python3; do
    if command -v "$candidate" >/dev/null &&
      "$candidate" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)' 2>/dev/null; then
      echo "$candidate"
      return
    fi
  done
}

mkdir -p "$HOME_DIR"
if [ ! -d "$HOME_DIR/venv" ]; then
  PYTHON="$(find_python)"
  if [ -z "$PYTHON" ]; then
    echo "Python 3.10 以上が見つかりません。brew install python などで入れてください。" >&2
    exit 1
  fi
  "$PYTHON" -m venv "$HOME_DIR/venv"
fi
# shellcheck disable=SC1091
source "$HOME_DIR/venv/bin/activate"

if [ ! -f "$MODEL_DIR/serve.py" ]; then
  pip install -U huggingface_hub
  hf download "$MODEL" --local-dir "$MODEL_DIR"
fi

cd "$MODEL_DIR"
if [ ! -f .installed ]; then
  pip install -U -r requirements-mlx.txt
  touch .installed
fi

echo "PLaMo 3 Translate ($SIZE) を http://127.0.0.1:$PORT で起動します。止めるときは Ctrl+C"
exec python serve.py --model . --trust-remote-code --host 127.0.0.1 --port "$PORT"

# atom-watch の実行用イメージ。Mac(Docker Desktop)とラズパイ(64bit OS)の両方で動くよう、
# マルチアーキテクチャの公式 Python イメージを使う。
FROM python:3.11-slim-bookworm

RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg tzdata \
 && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:0.8 /uv /usr/local/bin/uv

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/opt/venv \
    PATH=/opt/venv/bin:$PATH \
    PYTHONUNBUFFERED=1 \
    TZ=Asia/Tokyo

WORKDIR /app

# 依存パッケージだけ先に入れて、ソース変更時の再ビルドを速くする
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

# 物体検出モデルをイメージに同梱する(nano: 既定、tiny: 精度重視)
COPY scripts/fetch_model.py scripts/
ARG MODELS="nano tiny"
RUN for m in $MODELS; do python scripts/fetch_model.py "$m"; done

COPY README.md ./
COPY src ./src
RUN uv sync --frozen --no-dev

# 設定は /app/config.toml、保存先は /app/data にマウントする(compose.yaml 参照)
ENTRYPOINT ["atom-watch", "--no-caffeinate"]
CMD ["-c", "config.toml"]

# atom-watch の実行用イメージ。Mac(Docker Desktop)とラズパイ(64bit OS)の両方で動くよう、
# マルチアーキテクチャの公式 Python イメージを使う。
FROM python:3.11-slim-trixie

# RPI_FFMPEG=1 のときは、ラズパイ公式のパッケージ置き場から ffmpeg を入れる。
# Debian 版の ffmpeg では、ラズパイのハードウェアデコーダ(h264_v4l2m2m)からフレームが出てこないことがあるため。
# ラズパイ公式の置き場は Debian 13(trixie)向けなので、ベースも trixie にしている
# 置き場の署名鍵は鍵のパッケージで入れる(Web で配っている古い鍵は SHA1 署名で、trixie の apt が受け付けない)。
# 最初の 1 回は apt で検証できないので、パッケージ一覧に載っている SHA256 と照合してから入れる
ARG RPI_FFMPEG=0
ARG RPI_KEYRING=raspberrypi-archive-keyring_2025.1+rpt1_all.deb
ARG RPI_KEYRING_SHA256=2e727149d7acb8cc7f604e66d0049161039c8aa1eaf1175e54f9e69d963d60e4
RUN if [ "$RPI_FFMPEG" = "1" ]; then \
      python -c "import urllib.request; urllib.request.urlretrieve('https://archive.raspberrypi.com/debian/pool/main/r/raspberrypi-archive-keyring/$RPI_KEYRING', '/tmp/keyring.deb')" \
   && echo "$RPI_KEYRING_SHA256  /tmp/keyring.deb" | sha256sum -c - \
   && dpkg -i /tmp/keyring.deb && rm /tmp/keyring.deb \
   && echo "deb [signed-by=/usr/share/keyrings/raspberrypi-archive-keyring.pgp] http://archive.raspberrypi.com/debian/ trixie main" \
        > /etc/apt/sources.list.d/raspberrypi.list; \
    fi \
 && apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg tzdata \
 && rm -rf /var/lib/apt/lists/* \
 && ffmpeg -hide_banner -version | head -1

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

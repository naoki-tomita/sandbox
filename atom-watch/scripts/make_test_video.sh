#!/usr/bin/env bash
# カメラなしで動作確認するためのテスト動画を作る。
#   test-media/object.mp4 : 4〜10 秒目に犬の写真が画面を横切る(物体検出で dog が付くはず)
#   test-media/noise.mp4  : ノイズと明るさの揺らぎだけ(何も保存されないはず)
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p test-media
IMG=test-media/dog.jpg
if [ ! -f "$IMG" ]; then
  curl -fsSL -o "$IMG" https://raw.githubusercontent.com/Megvii-BaseDetection/YOLOX/main/assets/dog.jpg
fi

# 背景: 落ち着いた色 + 弱いノイズ。音声はサイン波(録画の音声経路の確認用)
ffmpeg -hide_banner -loglevel error -y \
  -f lavfi -i "color=c=0x4a5a48:s=1280x720:r=20,noise=alls=6:allf=t" \
  -loop 1 -i "$IMG" \
  -f lavfi -i "sine=frequency=440:sample_rate=16000" \
  -filter_complex "[1:v]scale=420:-1[d];[0:v][d]overlay=x='if(between(t,4,10),(t-4)*170-420,-2000)':y=180:shortest=1[v]" \
  -map "[v]" -map 2:a -t 20 -c:v libx264 -preset veryfast -g 20 -pix_fmt yuv420p -c:a aac -shortest \
  test-media/object.mp4

ffmpeg -hide_banner -loglevel error -y \
  -f lavfi -i "color=c=0x4a5a48:s=1280x720:r=20,noise=alls=10:allf=t,eq=brightness='0.02*sin(t)'" \
  -t 20 -c:v libx264 -preset veryfast -g 20 -pix_fmt yuv420p \
  test-media/noise.mp4

echo "作成しました: test-media/object.mp4 test-media/noise.mp4"

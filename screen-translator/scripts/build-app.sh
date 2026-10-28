#!/bin/bash
# swift build の実行ファイルを .app にまとめる。
# 画面収録の許可は .app 単位で管理されるので、実行ファイル単体ではなく .app から起動する。
set -euo pipefail

cd "$(dirname "$0")/.."

swift build -c release
BIN="$(swift build -c release --show-bin-path)/ScreenTranslator"

APP="build/Screen Translator.app"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS"
cp "$BIN" "$APP/Contents/MacOS/ScreenTranslator"
cp Resources/Info.plist "$APP/Contents/Info.plist"

# 無料のアドホック署名 (Apple Developer Program 不要)
codesign --force --sign - "$APP"

echo "作成しました: $APP"

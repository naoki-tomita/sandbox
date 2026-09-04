# uv での実行手順

各スクリプトに PEP 723 のインラインメタデータを埋めてあるので、
`uv run` するだけで依存が解決される。`pip install` も venv 作成も要らない。

## 1. ヤフオク落札相場（実売データ・依存が軽い）

```bash
cd boxing

# まず叩くURLの確認（通信しない）
uv run src/collect.py --dry-run --sources yahoo_closed

# 本番。誌名で検索してページ送りで辿る
uv run src/collect.py --mode broad --sources yahoo_closed \
    --max-pages 12 --delay 3 -o data/observations.csv
```

## 2. 駿河屋（Cloudflare のボット判定があるので要ブラウザ）

`requests` では "Just a moment..." のチャレンジページが返り、403 になる。
Playwright の実ブラウザで開く必要がある。

```bash
# 初回だけ Chromium を入れる
uv run --with playwright playwright install chromium

# 収集。--engine playwright が要点
uv run --with playwright src/collect.py \
    --mode broad --sources surugaya --engine playwright \
    --max-pages 30 --delay 3 -o data/observations-surugaya.csv
```

チャレンジが通らない場合は、`src/collect.py` の `PlaywrightFetcher` で
`headless=False` にして目視で1回通し、`.cache/` に HTML を残す手もある。
`collect.py` は取得済み HTML をキャッシュから読むので、
一度取れてしまえば以降の解析はオフラインでやり直せる。

## 3. メルカリ SOLD（同じく要ブラウザ・無限スクロールで1ページ目のみ）

```bash
uv run --with playwright src/collect.py \
    --mode issue --sources mercari_sold --engine playwright \
    --delay 3 -o data/observations-mercari.csv
```

## 4. 集計

複数ソースの観測値を1つにまとめてから集計する。

```bash
# ヘッダ1行 + 各CSVの本体を連結
{ head -1 data/observations.csv; \
  tail -q -n +2 data/observations*.csv; } > data/observations-all.csv

uv run src/estimate.py -i data/observations-all.csv -o data/valuation.csv
```

## 試運転とデバッグ

```bash
# 1ページだけ取って、号に割り当てられなかった行も残す
uv run src/collect.py --sources surugaya --engine playwright \
    --max-pages 1 --keep-unmatched

# 取得済みHTMLは .cache/ に残るので、パーサを直して --delay 0 で再実行できる
uv run src/collect.py --sources yahoo_closed --max-pages 3 --delay 0
```

**`p2: 新規0件` がいきなり出たらページ送りが効いていない。**
その場合は実際の2ページ目のURLを見て `src/sources.py` を直す。

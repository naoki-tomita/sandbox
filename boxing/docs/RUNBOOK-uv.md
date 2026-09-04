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

## 3. メルカリ SOLD（要ブラウザ・無限スクロール）

SOLD はヤフオク落札相場より長く残るので、この調査には向いている。
ただし商品はクライアント側で描画されるため、requests では中身が空になる
（i18n のテンプレートしか入っていない HTML が返る）。実ブラウザが要る。

無限スクロールなので `--scroll` で下端まで送らないと最初の数十件しか
DOM に載らない。

**`--mode broad` を使うこと。** 実際に叩いてみると、メルカリの検索は
かなり曖昧で、「ワールドボクシング 1995年2月号」で検索しても
1996年2月号やボクシングビートが返ってくる。1号ずつ検索しても精度は
上がらないうえ、168回の検索に1時間以上かかる。

誌名だけで検索してスクロールで件数を稼ぎ、あとからタイトルの
「◯年◯月号」で号に割り当てるほうが、6リクエストで済むうえ取りこぼしも
少ない。曖昧検索で混ざった別号は号の照合で落ちる。

```bash
# 誌名だけで検索し、下まで送れるだけ送る
uv run --with playwright src/collect.py \
    --mode broad --sources mercari_sold --engine playwright \
    --scroll 60 --delay 3 -o data/observations-mercari.csv
```

`--scroll` はページ高さが増えなくなった時点で打ち切るので、多めに
指定してかまわない。

**収集の最後に出る `[警告] ... 全件が N 円` は必ず読むこと。**
駿河屋では57件すべてが 240円（送料案内の金額）になっていた前例がある。
警告が出たら `.cache/` をコミットして渡してもらえれば、実際の HTML を見て
パーサを直せる。

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

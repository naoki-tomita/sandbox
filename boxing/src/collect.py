#!/usr/bin/env python3
# /// script
# requires-python = ">=3.11"
# dependencies = ["requests>=2.31", "beautifulsoup4>=4.12"]
# ///
"""各中古市場サイトの検索結果を巡回して、号ごとの価格観測値を集める。

出力は「1出品 = 1行」のロングフォーマット CSV（data/observations.csv）。
集計・推定は estimate.py が別途おこなう。生データと推定を分けておくと、
推定ロジックを変えても再クロールが要らない。

収集モードが2つある:

  broad (既定) — 誌名だけで1回検索し、ページ送りで全件を辿ってから、
      各商品タイトルの「◯年◯月号」を読んで該当する号に割り当てる。
      リクエスト数が桁違いに少なく、表記ゆれの号も拾える。
  issue — 168号それぞれについて「誌名 + 年月」で検索する。ヒット数は
      少ないが確実。ページ送り非対応のサイト向け。

    # まず何を叩くのか確認する（通信しない）
    python3 src/collect.py --dry-run

    # 駿河屋をブロード検索（在庫あり + 品切れの両方を拾う）
    python3 src/collect.py --sources surugaya --max-pages 30

    # ヤフオク落札相場も一緒に
    python3 src/collect.py --sources yahoo_closed,surugaya --delay 3

    # メルカリは JavaScript 描画なので Playwright が要る
    python3 src/collect.py --mode issue --sources mercari_sold --engine playwright

注意: 各サイトの利用規約・robots.txt に従うこと。--delay は 2 秒以上を
推奨（既定 3 秒）。短時間に大量アクセスするとブロックされる。
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import random
import sys
import time
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from issues import MAGAZINES, all_issues
from parse import extract_listings, parse_issue_from_title, title_matches_issue
from sources import SOURCES

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")

FIELDS = [
    "issue_id", "magazine", "year", "month", "issue_label", "source", "listing_type",
    "observed_on", "title", "condition", "stock", "price_jpy", "is_set", "set_size",
    "unit_price_jpy", "is_extra", "matched_issue", "url",
]


def cache_path(cache_dir: Path, url: str) -> Path:
    return cache_dir / (hashlib.sha256(url.encode()).hexdigest()[:32] + ".html")


def fetch_requests(url: str, timeout: int, retries: int = 3) -> str | None:
    import requests
    headers = {"User-Agent": UA, "Accept-Language": "ja,en;q=0.8"}
    for attempt in range(retries):
        try:
            r = requests.get(url, headers=headers, timeout=timeout)
            if r.status_code == 200:
                r.encoding = r.apparent_encoding or r.encoding
                return r.text
            if r.status_code in (429, 503):
                time.sleep(2 ** attempt * 5)
                continue
            print(f"  HTTP {r.status_code}: {url}", file=sys.stderr)
            return None
        except Exception as e:  # ネットワーク断は指数バックオフで再試行
            if attempt == retries - 1:
                print(f"  失敗: {e}", file=sys.stderr)
                return None
            time.sleep(2 ** attempt * 2)
    return None


class PlaywrightFetcher:
    """メルカリのような JavaScript 描画サイト用。"""

    def __init__(self, timeout: int):
        from playwright.sync_api import sync_playwright
        self._pw = sync_playwright().start()
        self.browser = self._pw.chromium.launch()
        self.page = self.browser.new_page(user_agent=UA, locale="ja-JP")
        self.timeout = timeout * 1000

    def fetch(self, url: str) -> str | None:
        try:
            self.page.goto(url, timeout=self.timeout, wait_until="networkidle")
            return self.page.content()
        except Exception as e:
            print(f"  失敗: {e}", file=sys.stderr)
            return None

    def close(self):
        self.browser.close()
        self._pw.stop()


class Collector:
    def __init__(self, args, writer):
        self.args = args
        self.w = writer
        self.today = date.today().isoformat()
        self.cache_dir = Path(args.cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.fetcher = PlaywrightFetcher(args.timeout) if args.engine == "playwright" else None
        self.rows = 0
        # (ソース, 誌名) -> 採用した価格。sanity_check で使う
        self.prices: dict[tuple[str, str], list[int]] = {}

    def get(self, url: str) -> str | None:
        cp = cache_path(self.cache_dir, url)
        if not self.args.no_cache and cp.exists():
            return cp.read_text(encoding="utf-8", errors="replace")
        html = self.fetcher.fetch(url) if self.fetcher else fetch_requests(url, self.args.timeout)
        if html:
            cp.write_text(html, encoding="utf-8", errors="replace")
        # 一定間隔＋ゆらぎ。連続アクセスで弾かれないように
        time.sleep(self.args.delay + random.uniform(0, self.args.delay * 0.4))
        return html

    def write(self, listing, source, magazine: str, year, month, matched: bool):
        issue_id = ""
        label = ""
        if year and month:
            key = next(k for k, v in MAGAZINES.items() if v["title"] == magazine)
            issue_id = f"{key}-{year}-{month:02d}"
            label = f"{year}年{month}月号"
        self.w.writerow({
            "issue_id": issue_id, "magazine": magazine,
            "year": year or "", "month": month or "", "issue_label": label,
            "source": source.name, "listing_type": source.listing_type,
            "observed_on": self.today, "title": listing.title,
            "condition": listing.condition, "stock": listing.stock,
            "price_jpy": listing.price_jpy, "is_set": int(listing.is_set),
            "set_size": listing.set_size,
            "unit_price_jpy": listing.unit_price_jpy if listing.set_size else "",
            "is_extra": int(listing.is_extra), "matched_issue": int(matched),
            "url": listing.url,
        })
        self.prices.setdefault((source.name, magazine), []).append(listing.price_jpy)
        self.rows += 1

    def run_broad(self, source, mag_key: str) -> None:
        """誌名だけで検索し、ページ送りで辿ってタイトルから号を割り当てる。"""
        meta = MAGAZINES[mag_key]
        lo, hi = self.args.start_year, self.args.end_year
        # エイリアス違いの検索は同じ出品を返すので、誌単位で重複を落とす。
        # ここを分けると同一出品が2〜3回数えられ、件数も信頼度も水増しされる
        seen: set[str] = set()
        for alias in meta["aliases"]:
            for page in range(1, self.args.max_pages + 1):
                url = source.url(alias, page)
                html = self.get(url)
                if not html:
                    break
                listings = extract_listings(html, source, base_url=url)
                fresh = [l for l in listings
                         if (l.url or f"{l.title}|{l.price_jpy}") not in seen]
                if not fresh:
                    # 同じ結果が返り続けたら最終ページ。ページ送りが効いて
                    # いないケースもここで止まる
                    print(f"  {alias} p{page}: 新規0件。打ち切り", file=sys.stderr)
                    break
                kept = 0
                for l in fresh:
                    seen.add(l.url or f"{l.title}|{l.price_jpy}")
                    parsed = parse_issue_from_title(l.title, meta["aliases"])
                    if parsed and lo <= parsed[0] <= hi:
                        self.write(l, source, meta["title"], parsed[0], parsed[1], True)
                        kept += 1
                    elif self.args.keep_unmatched:
                        y, m = parsed if parsed else (None, None)
                        self.write(l, source, meta["title"], y, m, False)
                print(f"  {alias} p{page}: {len(fresh)}件中 {kept}件が対象期間の号",
                      file=sys.stderr)
                if not source.paged:
                    break

    def run_issue(self, source, issues) -> None:
        """1号ずつ「誌名 + 年月」で検索する。"""
        for n, it in enumerate(issues, 1):
            url = source.url(it.query())
            html = self.get(url)
            if not html:
                continue
            listings = extract_listings(html, source, base_url=url)
            kept = 0
            for l in listings:
                matched = title_matches_issue(l.title, it.year, it.month, it.aliases)
                if not matched and not self.args.keep_unmatched:
                    continue
                self.write(l, source, it.magazine, it.year, it.month, matched)
                kept += 1
            print(f"[{n}/{len(issues)}] {it.issue_id} {source.name}: "
                  f"{len(listings)}件中 {kept}件採用", file=sys.stderr)

    def sanity_check(self) -> None:
        """明らかにおかしい抽出結果を検出して警告する。

        価格が全件同じなら、商品ごとの価格ではなくページ共通の要素
        （送料表示など）を拾っている可能性が高い。価格を含む祖先まで
        遡る処理は、商品に価格が表示されていないと遡りすぎて
        ページ全体の共通要素に当たることがある。
        """
        for (src, mag), prices in self.prices.items():
            if len(prices) < 5:
                continue
            uniq = set(prices)
            if len(uniq) == 1:
                print(f"\n[警告] {src} / {mag}: {len(prices)}件すべてが "
                      f"{uniq.pop():,}円。商品価格ではなくページ共通の要素を"
                      f"拾っている疑いが濃い。抽出結果を疑うこと", file=sys.stderr)
            elif len(uniq) <= max(2, len(prices) // 20):
                print(f"\n[警告] {src} / {mag}: {len(prices)}件で価格の種類が "
                      f"{len(uniq)}種しかない。抽出を確認すること", file=sys.stderr)

    def close(self):
        if self.fetcher:
            self.fetcher.close()


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("-o", "--out", default="data/observations.csv")
    p.add_argument("--mode", choices=["broad", "issue"], default="broad")
    p.add_argument("--sources", default="surugaya,yahoo_closed",
                   help=f"カンマ区切り。利用可能: {','.join(SOURCES)}")
    p.add_argument("--magazine", default="", help="world_boxing / boxing_magazine")
    p.add_argument("--start-year", type=int, default=1995)
    p.add_argument("--end-year", type=int, default=2001)
    p.add_argument("--max-pages", type=int, default=30, help="broad モードの上限ページ数")
    p.add_argument("--engine", choices=["requests", "playwright"], default="requests")
    p.add_argument("--delay", type=float, default=3.0, help="リクエスト間隔（秒）")
    p.add_argument("--timeout", type=int, default=30)
    p.add_argument("--cache-dir", default=".cache")
    p.add_argument("--no-cache", action="store_true")
    p.add_argument("--limit", type=int, default=0,
                   help="issue モードで先頭 N 号だけ処理（試運転用）")
    p.add_argument("--keep-unmatched", action="store_true",
                   help="号に割り当てられなかった行も残す（デバッグ用）")
    p.add_argument("--dry-run", action="store_true", help="叩くURLを出すだけで通信しない")
    args = p.parse_args()

    names = [s.strip() for s in args.sources.split(",") if s.strip()]
    unknown = [n for n in names if n not in SOURCES]
    if unknown:
        print(f"未知のソース: {unknown}", file=sys.stderr)
        return 2
    sources = [SOURCES[n] for n in names]

    mag_keys = [args.magazine] if args.magazine else list(MAGAZINES)
    issues = all_issues(args.start_year, args.end_year)
    if args.magazine:
        issues = [i for i in issues if i.magazine_key == args.magazine]
    if args.limit:
        issues = issues[:args.limit]

    if args.dry_run:
        reqs = 0
        for s in sources:
            mark = "" if s.verified else "  [URL形式が未検証]"
            if args.mode == "broad":
                pages = args.max_pages if s.paged else 1
                for k in mag_keys:
                    for alias in MAGAZINES[k]["aliases"]:
                        print(f"{s.name}\tbroad\t{alias}\tp1..p{pages}\t{s.url(alias)}{mark}")
                        reqs += pages
            else:
                for it in issues:
                    print(f"{s.name}\tissue\t{it.issue_id}\t{s.url(it.query())}{mark}")
                    reqs += 1
        print(f"\n最大 {reqs} リクエスト / 想定所要 {reqs * args.delay / 60:.0f} 分",
              file=sys.stderr)
        return 0

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open("w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS)
        w.writeheader()
        c = Collector(args, w)
        try:
            for s in sources:
                print(f"=== {s.name} ({s.listing_type}) {s.note} ===", file=sys.stderr)
                if args.mode == "broad":
                    for k in mag_keys:
                        c.run_broad(s, k)
                else:
                    c.run_issue(s, issues)
            c.sanity_check()
        finally:
            c.close()

    print(f"\n{c.rows} 行を {out} に書き出しました", file=sys.stderr)
    if c.rows == 0:
        print("0件でした。--keep-unmatched --max-pages 1 で生の抽出結果を見て、"
              "パーサが検索結果ページの構造に合っているか確認してください。", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

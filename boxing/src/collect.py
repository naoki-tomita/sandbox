#!/usr/bin/env python3
"""各中古市場サイトの検索結果を巡回して、号ごとの価格観測値を集める。

出力は「1出品 = 1行」のロングフォーマット CSV（data/observations.csv）。
集計・推定は estimate.py が別途おこなう。生データと推定を分けておくと、
推定ロジックを変えても再クロールが要らない。

    # まず何を叩くのか確認する（通信しない）
    python3 src/collect.py --dry-run --limit 3

    # 静的HTMLで取れるサイトだけ収集
    python3 src/collect.py --sources yahoo_closed,surugaya --delay 3

    # メルカリは JavaScript 描画なので Playwright が要る
    python3 src/collect.py --sources mercari_sold --engine playwright

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

from issues import all_issues
from parse import extract_listings, title_matches_issue
from sources import SOURCES

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")

FIELDS = [
    "issue_id", "magazine", "year", "month", "issue_label", "source", "listing_type",
    "observed_on", "title", "condition", "price_jpy", "is_set", "set_size",
    "unit_price_jpy", "matched_issue", "url",
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


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("-o", "--out", default="data/observations.csv")
    p.add_argument("--sources", default="yahoo_closed,surugaya",
                   help=f"カンマ区切り。利用可能: {','.join(SOURCES)}")
    p.add_argument("--magazine", default="", help="world_boxing / boxing_magazine")
    p.add_argument("--start-year", type=int, default=1995)
    p.add_argument("--end-year", type=int, default=2001)
    p.add_argument("--engine", choices=["requests", "playwright"], default="requests")
    p.add_argument("--delay", type=float, default=3.0, help="リクエスト間隔（秒）")
    p.add_argument("--timeout", type=int, default=30)
    p.add_argument("--cache-dir", default=".cache")
    p.add_argument("--no-cache", action="store_true")
    p.add_argument("--limit", type=int, default=0, help="先頭 N 号だけ処理（試運転用）")
    p.add_argument("--keep-unmatched", action="store_true",
                   help="号の一致検証に落ちた行も残す（デバッグ用）")
    p.add_argument("--dry-run", action="store_true", help="叩くURLを出すだけで通信しない")
    args = p.parse_args()

    names = [s.strip() for s in args.sources.split(",") if s.strip()]
    unknown = [n for n in names if n not in SOURCES]
    if unknown:
        print(f"未知のソース: {unknown}", file=sys.stderr)
        return 2

    issues = all_issues(args.start_year, args.end_year)
    if args.magazine:
        issues = [i for i in issues if i.magazine_key == args.magazine]
    if args.limit:
        issues = issues[:args.limit]

    if args.dry_run:
        for it in issues:
            for n in names:
                build, ltype, verified = SOURCES[n]
                mark = "" if verified else "  [URL形式が未検証]"
                print(f"{it.issue_id}\t{n}\t{build(it.query())}{mark}")
        print(f"\n{len(issues)} 号 x {len(names)} ソース = "
              f"{len(issues) * len(names)} リクエスト / "
              f"想定所要 {len(issues) * len(names) * args.delay / 60:.0f} 分",
              file=sys.stderr)
        return 0

    cache_dir = Path(args.cache_dir)
    cache_dir.mkdir(parents=True, exist_ok=True)
    fetcher = PlaywrightFetcher(args.timeout) if args.engine == "playwright" else None

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    today = date.today().isoformat()
    rows_written = 0

    try:
        with out.open("w", newline="", encoding="utf-8-sig") as f:
            w = csv.DictWriter(f, fieldnames=FIELDS)
            w.writeheader()

            total = len(issues) * len(names)
            done = 0
            for it in issues:
                for n in names:
                    build, ltype, _verified = SOURCES[n]
                    url = build(it.query())
                    done += 1

                    cp = cache_path(cache_dir, url)
                    html = None
                    if not args.no_cache and cp.exists():
                        html = cp.read_text(encoding="utf-8", errors="replace")
                    else:
                        html = (fetcher.fetch(url) if fetcher
                                else fetch_requests(url, args.timeout))
                        if html:
                            cp.write_text(html, encoding="utf-8", errors="replace")
                        # 一定間隔＋ゆらぎ。連続アクセスで弾かれないように
                        time.sleep(args.delay + random.uniform(0, args.delay * 0.4))

                    if not html:
                        continue

                    listings = extract_listings(html, n, base_url=url)
                    kept = 0
                    for l in listings:
                        matched = title_matches_issue(l.title, it.year, it.month, it.aliases)
                        if not matched and not args.keep_unmatched:
                            continue
                        w.writerow({
                            "issue_id": it.issue_id, "magazine": it.magazine,
                            "year": it.year, "month": it.month,
                            "issue_label": it.issue_label, "source": n,
                            "listing_type": ltype, "observed_on": today,
                            "title": l.title, "condition": l.condition,
                            "price_jpy": l.price_jpy, "is_set": int(l.is_set),
                            "set_size": l.set_size,
                            "unit_price_jpy": l.unit_price_jpy if l.set_size else "",
                            "matched_issue": int(matched), "url": l.url,
                        })
                        kept += 1
                        rows_written += 1
                    print(f"[{done}/{total}] {it.issue_id} {n}: "
                          f"{len(listings)}件中 {kept}件採用", file=sys.stderr)
    finally:
        if fetcher:
            fetcher.close()

    print(f"\n{rows_written} 行を {out} に書き出しました", file=sys.stderr)
    if rows_written == 0:
        print("0件でした。--keep-unmatched --limit 2 で生の抽出結果を見て、"
              "パーサが検索結果ページの構造に合っているか確認してください。", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

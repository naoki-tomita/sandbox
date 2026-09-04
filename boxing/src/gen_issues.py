#!/usr/bin/env python3
# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
"""号マスタ CSV を生成する。

各号について、主要な中古市場サイトの検索URLを埋め込む。スクレイピングを
使わず手作業で調べる場合も、この CSV の URL を順に開けば調査台帳になる。

    python3 src/gen_issues.py -o data/issues.csv
"""

import argparse
import csv
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from issues import all_issues
from sources import SOURCES

FIELDS = [
    "issue_id", "magazine", "publisher", "year", "month", "issue_label", "search_query",
] + [f"url_{name}" for name in SOURCES]


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("-o", "--out", default="data/issues.csv")
    p.add_argument("--start-year", type=int, default=1995)
    p.add_argument("--end-year", type=int, default=2001)
    args = p.parse_args()

    issues = all_issues(args.start_year, args.end_year)
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)

    with out.open("w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS)
        w.writeheader()
        for it in issues:
            q = it.query()
            row = {
                "issue_id": it.issue_id,
                "magazine": it.magazine,
                "publisher": it.publisher,
                "year": it.year,
                "month": it.month,
                "issue_label": it.issue_label,
                "search_query": q,
            }
            for name, src in SOURCES.items():
                row[f"url_{name}"] = src.url(q)
            w.writerow(row)

    print(f"{len(issues)} 号を {out} に書き出しました", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

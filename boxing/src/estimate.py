#!/usr/bin/env python3
"""観測値（observations.csv）を号単位に集計して、推定価値 CSV を作る。

    python3 src/estimate.py -i data/observations.csv -o data/valuation.csv

推定の考え方:
  1. 実際に売れた価格（落札/SOLD）の中央値を最も信頼する。
  2. 単品の成約がなければ、まとめ売りの1冊あたり単価を使う。
  3. それも無ければ、出品中・在庫の希望価格に ASKING_DISCOUNT を掛けて落とす。
     売り希望価格は成約価格より上に張り付くため、そのままでは過大評価になる。
  4. どれも無い号は、その雑誌の観測できた号全体の中央値（ベースライン）を置く。
外れ値は分位点で刈る。まとめ売りの1冊単価は単品より安く出るのが通常なので、
単品の成約がある号ではまとめ売りを推定に混ぜない。
"""

from __future__ import annotations

import argparse
import csv
import statistics
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from issues import all_issues

# 売り希望価格 -> 想定成約価格への換算係数。実測が貯まったら見直す。
ASKING_DISCOUNT = 0.7
# 上下この割合を外れ値として捨てる
TRIM = 0.1

FIELDS = [
    "issue_id", "magazine", "year", "month", "issue_label",
    "n_sold", "sold_min_jpy", "sold_median_jpy", "sold_max_jpy",
    "n_set", "set_unit_median_jpy",
    "n_asking", "asking_median_jpy",
    "estimated_value_jpy", "basis", "confidence", "sources", "notes",
]


def trimmed(values: list[int]) -> list[int]:
    if len(values) < 5:
        return sorted(values)
    v = sorted(values)
    k = max(1, int(len(v) * TRIM))
    return v[k:len(v) - k] or v


def med(values: list[int]) -> int | None:
    v = trimmed(values)
    return round(statistics.median(v)) if v else None


def load_benchmark_fallback(path: Path) -> int | None:
    """観測値が1件も無いときに使う、既知の相場アンカーからの暫定値。

    まとめ売りを含む「全般」スコープの行は個別号の相場として使えないので除く。
    増刊は通常号より明確に高いため、これも除いて通常号の水準に寄せる。
    """
    if not path.exists():
        return None
    vals = []
    for r in csv.DictReader(path.open(encoding="utf-8-sig")):
        if "増刊" in r.get("scope", "") or r.get("scope") == "全般":
            continue
        try:
            vals.append(int(r["price_jpy"]))
        except (ValueError, KeyError):
            continue
    return round(statistics.median(vals)) if vals else None


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("-i", "--inp", default="data/observations.csv")
    p.add_argument("-o", "--out", default="data/valuation.csv")
    p.add_argument("--start-year", type=int, default=1995)
    p.add_argument("--end-year", type=int, default=2001)
    p.add_argument("--benchmarks", default="data/price_benchmarks.csv")
    p.add_argument("--allow-empty", action="store_true",
                   help="観測値が無くてもベンチマーク由来の暫定値で全号を出力する")
    args = p.parse_args()

    inp = Path(args.inp)
    if not inp.exists():
        if not args.allow_empty:
            print(f"{inp} がありません。先に collect.py を実行してください。"
                  "（形だけ先に見たい場合は --allow-empty）", file=sys.stderr)
            return 1
        print(f"{inp} が無いため、全号をベンチマーク由来の暫定値で出力します。",
              file=sys.stderr)
        inp = None

    sold = defaultdict(list)       # 単品の成約価格
    set_unit = defaultdict(list)   # まとめ売りの1冊あたり単価
    asking = defaultdict(list)     # 出品中・在庫の希望価格
    srcs = defaultdict(set)

    for r in (csv.DictReader(inp.open(encoding="utf-8-sig")) if inp else []):
        if True:
            if r.get("matched_issue") == "0":
                continue
            try:
                price = int(r["price_jpy"])
            except (ValueError, KeyError):
                continue
            key = r["issue_id"]
            srcs[key].add(r["source"])
            is_set = r.get("is_set") == "1"
            if is_set:
                unit = r.get("unit_price_jpy")
                if unit:
                    set_unit[key].append(int(unit))
            elif r["listing_type"] == "sold":
                sold[key].append(price)
            else:
                asking[key].append(price)

    # 雑誌ごとのベースライン（観測できた号の成約中央値の中央値）
    baseline = {}
    per_mag = defaultdict(list)
    for key, vals in sold.items():
        m = med(vals)
        if m:
            per_mag[key.rsplit("-", 2)[0]].append(m)
    for mag, vals in per_mag.items():
        baseline[mag] = round(statistics.median(vals))

    fallback = load_benchmark_fallback(Path(args.benchmarks))

    rows = []
    for it in all_issues(args.start_year, args.end_year):
        k = it.issue_id
        s, su, a = sold[k], set_unit[k], asking[k]
        s_med, su_med, a_med = med(s), med(su), med(a)

        if s_med is not None and len(s) >= 3:
            est, basis, conf = s_med, "落札中央値", "高"
        elif s_med is not None:
            est, basis, conf = s_med, "落札中央値(少数)", "中"
        elif su_med is not None:
            est, basis, conf = su_med, "まとめ売り1冊単価", "中"
        elif a_med is not None:
            est, basis, conf = round(a_med * ASKING_DISCOUNT), \
                f"希望価格x{ASKING_DISCOUNT}", "低"
        elif it.magazine_key in baseline:
            est, basis, conf = baseline[it.magazine_key], "誌別ベースライン", "参考値"
        elif fallback is not None:
            est, basis, conf = fallback, "ベンチマーク暫定値(未収集)", "参考値"
        else:
            est, basis, conf = None, "データなし", "なし"

        rows.append({
            "issue_id": k, "magazine": it.magazine, "year": it.year, "month": it.month,
            "issue_label": it.issue_label,
            "n_sold": len(s), "sold_min_jpy": min(s) if s else "",
            "sold_median_jpy": s_med if s_med is not None else "",
            "sold_max_jpy": max(s) if s else "",
            "n_set": len(su), "set_unit_median_jpy": su_med if su_med is not None else "",
            "n_asking": len(a), "asking_median_jpy": a_med if a_med is not None else "",
            "estimated_value_jpy": est if est is not None else "",
            "basis": basis, "confidence": conf,
            "sources": ";".join(sorted(srcs[k])), "notes": "",
        })

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open("w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS)
        w.writeheader()
        w.writerows(rows)

    have = sum(1 for r in rows if r["confidence"] in ("高", "中"))
    print(f"{len(rows)} 号を {out} に書き出しました（実データ由来 {have} 号 / "
          f"ベースライン補完 {len(rows) - have} 号）", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

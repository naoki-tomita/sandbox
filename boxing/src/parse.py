"""検索結果ページから「タイトル + 価格」の組を取り出す共通パーサ。

サイトごとの DOM 構造は頻繁に変わるので、CSS セレクタに依存しきらない。
まずサイト固有セレクタを試し、外れたら「価格文字列を含む最小のブロックを
さかのぼって拾う」汎用ロジックに落とす。
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

try:
    from bs4 import BeautifulSoup
except ImportError:  # pragma: no cover
    BeautifulSoup = None

PRICE_RE = re.compile(r"(?:¥|￥)\s*([0-9][0-9,]*)|([0-9][0-9,]*)\s*円")
# 「まとめて75冊」「20冊セット」「計12点」など
SET_COUNT_RE = re.compile(r"([0-9]{1,4})\s*(?:冊|点|巻|部)")
SET_WORD_RE = re.compile(r"まとめ|セット|一括|大量|不揃い|揃い|ｾｯﾄ")
# 検索ノイズ（本誌以外）を落とす
EXCLUDE_RE = re.compile(r"複製|コピー|切り抜き|切抜|抜粋|ポスター|付録のみ|表紙のみ|ページのみ|DVD|ビデオ|VHS")

CONDITION_PATTERNS = [
    ("美品", r"美品|極美|新品同様|未読"),
    ("良", r"良品|良好|きれい|キレイ"),
    ("並", r"並|普通|通常"),
    ("難あり", r"難あり|傷み|イタミ|折れ|書き込み|書込|破れ|汚れ|シミ|日焼け|ヤケ|水濡れ|ジャンク"),
]

# サイト固有セレクタ（当たれば精度が上がる。外れても致命的ではない）
SITE_SELECTORS = {
    "yahoo_closed": ["li.Product", ".Product", "li[class*=Product]"],
    "yahoo_open": ["li.Product", ".Product", "li[class*=Product]"],
    "aucfan": ["li.item", ".itemlist li", "tr.item"],
    "surugaya": [".item", ".search_result_item", "div[class*=item]"],
    "kosho": [".product_item", ".list_item", "li.item"],
    "toudoukan": [".goods_list li", ".item", "li[class*=goods]"],
    "mercari_sold": ["li[data-testid=item-cell]", "[data-testid=item-cell]", "mer-item-thumbnail"],
}


@dataclass
class Listing:
    title: str
    price_jpy: int
    url: str = ""
    condition: str = ""
    is_set: bool = False
    set_size: int = 1
    raw: str = field(default="", repr=False)

    @property
    def unit_price_jpy(self) -> int:
        return round(self.price_jpy / self.set_size) if self.set_size > 1 else self.price_jpy


def parse_prices(text: str) -> list[int]:
    out = []
    for m in PRICE_RE.finditer(text):
        raw = m.group(1) or m.group(2)
        try:
            v = int(raw.replace(",", ""))
        except ValueError:
            continue
        # 1円未満・非現実的に高い値は誤検出（年号や商品IDの拾い間違い）として捨てる
        if 1 <= v <= 5_000_000:
            out.append(v)
    return out


def detect_condition(text: str) -> str:
    for label, pat in CONDITION_PATTERNS:
        if re.search(pat, text):
            return label
    return ""


def detect_set(title: str) -> tuple[bool, int]:
    """まとめ売りかどうかと、冊数を推定する。

    冊数が読めない「まとめ」表記は set_size=0 を返し、呼び出し側で
    1冊あたり単価が出せないものとして扱う。
    """
    counts = [int(m.group(1)) for m in SET_COUNT_RE.finditer(title)]
    counts = [c for c in counts if 2 <= c <= 1000]
    if counts:
        return True, max(counts)
    if SET_WORD_RE.search(title):
        return True, 0
    return False, 1


def _blocks_from_selectors(soup, source: str):
    for sel in SITE_SELECTORS.get(source, []):
        try:
            found = soup.select(sel)
        except Exception:
            continue
        if len(found) >= 2:
            return found
    return []


def _blocks_generic(soup):
    """価格文字列を持つ最小のブロックを、リンクを含む祖先までさかのぼって集める。"""
    blocks, seen = [], set()
    for a in soup.find_all("a"):
        node = a
        for _ in range(4):  # 高々4階層さかのぼる
            node = node.parent
            if node is None:
                break
            txt = node.get_text(" ", strip=True)
            if not txt or len(txt) > 600:
                continue
            if PRICE_RE.search(txt):
                key = id(node)
                if key not in seen:
                    seen.add(key)
                    blocks.append(node)
                break
    return blocks


def extract_listings(html: str, source: str, base_url: str = "") -> list[Listing]:
    """検索結果 HTML から Listing を取り出す。"""
    if BeautifulSoup is None:
        return _extract_regex_only(html)

    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style", "noscript"]):
        tag.decompose()

    blocks = _blocks_from_selectors(soup, source) or _blocks_generic(soup)

    listings, seen_titles = [], set()
    for b in blocks:
        text = b.get_text(" ", strip=True)
        prices = parse_prices(text)
        if not prices:
            continue
        a = b.find("a")
        title = ""
        if a is not None:
            title = a.get("title") or a.get_text(" ", strip=True)
        if not title or len(title) < 4:
            # リンクテキストが空（画像リンク等）なら、価格を除いた本文を題名扱いにする
            title = PRICE_RE.sub(" ", text).strip()
        title = re.sub(r"\s+", " ", title)[:200]
        if not title:
            continue

        href = (a.get("href") if a is not None else "") or ""
        if href.startswith("/") and base_url:
            href = base_url.rstrip("/") + href

        # 同一ブロックに複数価格（税込/税抜、即決/現在）があれば最小を採る
        price = min(prices)
        is_set, size = detect_set(title)
        key = (title, price)
        if key in seen_titles:
            continue
        seen_titles.add(key)
        listings.append(Listing(
            title=title, price_jpy=price, url=href,
            condition=detect_condition(f"{title} {text}"), is_set=is_set, set_size=size, raw=text[:300],
        ))
    return listings


def _extract_regex_only(html: str) -> list[Listing]:
    """BeautifulSoup が無い環境向けの最終手段。精度は落ちる。"""
    text = re.sub(r"<[^>]+>", " ", html)
    text = re.sub(r"\s+", " ", text)
    out = []
    for m in PRICE_RE.finditer(text):
        raw = m.group(1) or m.group(2)
        try:
            v = int(raw.replace(",", ""))
        except ValueError:
            continue
        if not (1 <= v <= 5_000_000):
            continue
        title = text[max(0, m.start() - 120):m.start()].strip()[-120:]
        is_set, size = detect_set(title)
        out.append(Listing(title=title, price_jpy=v, condition=detect_condition(title),
                           is_set=is_set, set_size=size))
    return out


def title_matches_issue(title: str, year: int, month: int, aliases: list[str]) -> bool:
    """検索結果のタイトルが、狙った号を実際に指しているかを検証する。

    検索エンジンは誌名だけの緩い一致も返すので、これを通さないと
    「1995年1月号」の行に無関係な号の価格が混入する。
    """
    if EXCLUDE_RE.search(title):
        return False
    norm = title.replace("・", "").replace(" ", "").replace("　", "").upper()
    if not any(a.replace("・", "").replace(" ", "").upper() in norm for a in aliases):
        return False
    if str(year) not in title and f"{year % 100:02d}年" not in title:
        return False
    # 「8月号」「8月」「'97/8」など
    return bool(re.search(rf"(?<![0-9]){month}\s*月", title) or
                re.search(rf"[/\-\.]\s*{month:02d}(?![0-9])", title) or
                re.search(rf"[/\-\.]\s*{month}(?![0-9])", title))

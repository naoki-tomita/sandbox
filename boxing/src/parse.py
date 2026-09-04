"""検索結果ページから「タイトル + 価格」の組を取り出す共通パーサ。

サイトごとの DOM 構造は頻繁に変わるので、CSS セレクタに依存しきらない。
まずサイト固有セレクタを試し、外れたら「価格文字列を含む最小のブロックを
さかのぼって拾う」汎用ロジックに落とす。
"""

from __future__ import annotations

import html as _html
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
# 増刊は通常号の2〜3倍。同じ号として混ぜると相場が跳ねるので別枠にする
EXTRA_RE = re.compile(r"増刊|別冊|臨時増刊|年鑑|EXTRA")
# 駿河屋は inStock=On で品切れ品も返す。品切れの価格は「最後に付いていた売値」
SOLDOUT_RE = re.compile(r"品切|売切|売り切|在庫なし|在庫切れ|SOLD\s*OUT", re.IGNORECASE)
INSTOCK_RE = re.compile(r"在庫あり|在庫有|カートに入れる|購入手続き")

CONDITION_PATTERNS = [
    ("美品", r"美品|極美|新品同様|未読"),
    ("良", r"良品|良好|きれい|キレイ"),
    ("並", r"並|普通|通常"),
    ("難あり", r"難あり|傷み|イタミ|折れ|書き込み|書込|破れ|汚れ|シミ|日焼け|ヤケ|水濡れ|ジャンク"),
]

# 送料はブロック内に混ざるので価格候補から除く
SHIPPING_RE = re.compile(r"送料[^0-9]{0,4}([0-9][0-9,]*)\s*円")

@dataclass
class Listing:
    title: str
    price_jpy: int
    url: str = ""
    condition: str = ""
    is_set: bool = False
    set_size: int = 1
    is_extra: bool = False   # 増刊・別冊
    stock: str = ""          # "在庫あり" / "品切れ" / "" (不明)
    list_price_jpy: int = 0  # 発売当時の定価。相場ではない
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


def detect_stock(text: str) -> str:
    """在庫状況。品切れ品の価格は「最後に付いていた売値」として別扱いする。"""
    if SOLDOUT_RE.search(text):
        return "品切れ"
    return "在庫あり" if INSTOCK_RE.search(text) else ""


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


def _price_from_block(text: str, price_res, strict: bool = False) -> int | None:
    """ブロックのテキストから商品価格を1つ選ぶ。

    「落札 900 円」のようなラベル付きの表記が取れればそれを優先する。
    取れなければ、送料を除いた価格候補の最小値を採る（税込/税抜、
    現在価格/即決価格が並ぶことがあるため）。
    """
    for pat in price_res:
        m = pat.search(text)
        if m:
            try:
                return int(m.group(1).replace(",", ""))
            except ValueError:
                pass
    if strict:
        # ラベルに一致しなければ価格なしとして扱う。無理に数字を拾うと
        # 送料案内や定価を商品価格として記録してしまう
        return None
    shipping = {int(m.group(1).replace(",", "")) for m in SHIPPING_RE.finditer(text)}
    cands = [v for v in parse_prices(text) if v not in shipping]
    return min(cands) if cands else None


def _extract_by_item_link(soup, source_cfg, base_url: str) -> list[Listing]:
    """商品詳細ページへのリンクを起点に1商品ずつ組み立てる。

    検索結果ページのクラス名は styled-components 等でビルドごとに変わる
    ため、セレクタ頼みだと静かに全滅する。商品URLの形だけは安定して
    いるので、そちらを軸にする。
    """
    item_re = source_cfg.item_link_re
    groups: dict[str, list] = {}
    for a in soup.find_all("a", href=True):
        m = item_re.search(a["href"])
        if m:
            groups.setdefault(m.group(1), []).append(a)

    listings = []
    for item_id, anchors in groups.items():
        # 同じ商品に画像リンクとタイトルリンクが並ぶ。テキストが長いほうが題名
        titled = max(anchors, key=lambda a: len(a.get("title") or a.get_text(" ", strip=True)))
        title = (titled.get("title") or titled.get_text(" ", strip=True)).strip()
        title = _html.unescape(re.sub(r"\s+", " ", title))[:200]
        if not title:
            continue

        # 価格を含む最小の祖先まで遡る
        node, text = titled, ""
        for _ in range(6):
            node = node.parent
            if node is None:
                break
            t = node.get_text(" ", strip=True)
            if len(t) < 3000 and PRICE_RE.search(t):
                text = t
                break
        if not text:
            continue
        # 価格が読めない商品も Listing として返す。ページ送りの打ち切り
        # 判定は「商品が並んでいたか」で行う必要があり、「価格が取れたか」
        # と混同すると、価格なしの品切れだけのページで早期終了してしまう
        price = _price_from_block(text, source_cfg.price_res,
                                  getattr(source_cfg, "strict_price", False))
        list_price = 0
        lp_re = getattr(source_cfg, "list_price_re", None)
        if lp_re:
            m = lp_re.search(text)
            if m:
                list_price = int(m.group(1).replace(",", ""))

        href = titled["href"]
        if href.startswith("/") and base_url:
            href = re.sub(r"^(https?://[^/]+).*$", r"\1", base_url) + href

        is_set, size = detect_set(title)
        listings.append(Listing(
            title=title, price_jpy=price or 0, url=href,
            condition=detect_condition(f"{title} {text}"),
            is_set=is_set, set_size=size,
            is_extra=bool(EXTRA_RE.search(title)),
            stock=detect_stock(text), list_price_jpy=list_price, raw=text[:300],
        ))
    return listings


def _blocks_generic(soup):
    """商品URLの形が分からないサイト向けの汎用抽出。

    価格文字列を持つ最小のブロックを、リンクを含む祖先までさかのぼって集める。
    """
    blocks, seen = [], set()
    for a in soup.find_all("a"):
        node = a
        for _ in range(4):
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


def extract_listings(html: str, source_cfg, base_url: str = "") -> list[Listing]:
    """検索結果 HTML から Listing を取り出す。

    source_cfg は sources.Source。item_link_re があればそれを軸に、
    無ければ汎用ロジックで抽出する。
    """
    if BeautifulSoup is None:
        return _extract_regex_only(html)

    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style", "noscript"]):
        tag.decompose()

    if getattr(source_cfg, "item_link_re", None):
        # 商品URLの形が分かっているサイトでは、結果が0件でもそれが答え。
        # ここで汎用ロジックに落とすと、厳格な価格判定をすり抜けて
        # 送料案内や定価を商品価格として拾ってしまう
        return _extract_by_item_link(soup, source_cfg, base_url)

    listings, seen = [], set()
    price_res = getattr(source_cfg, "price_res", [])
    for b in _blocks_generic(soup):
        text = b.get_text(" ", strip=True)
        price = _price_from_block(text, price_res)
        if price is None:
            continue
        a = b.find("a")
        title = ""
        if a is not None:
            title = a.get("title") or a.get_text(" ", strip=True)
        if not title or len(title) < 4:
            title = PRICE_RE.sub(" ", text).strip()
        title = re.sub(r"\s+", " ", title)[:200]
        if not title or (title, price) in seen:
            continue
        seen.add((title, price))
        href = (a.get("href") if a is not None else "") or ""
        if href.startswith("/") and base_url:
            href = re.sub(r"^(https?://[^/]+).*$", r"\1", base_url) + href
        is_set, size = detect_set(title)
        listings.append(Listing(
            title=title, price_jpy=price, url=href,
            condition=detect_condition(f"{title} {text}"),
            is_set=is_set, set_size=size,
            is_extra=bool(EXTRA_RE.search(title)),
            stock=detect_stock(text), raw=text[:300],
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
                           is_set=is_set, set_size=size,
                           is_extra=bool(EXTRA_RE.search(title)),
                           stock=("品切れ" if SOLDOUT_RE.search(title) else "")))
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


# 「1997年8月号」「97年8月号」「1997/08」「'97.8」など
_ISSUE_PATTERNS = [
    re.compile(r"(?P<y>19\d{2}|20\d{2})\s*年\s*(?P<m>1[0-2]|[1-9])\s*月"),
    re.compile(r"[''\u2019]?(?P<y>\d{2})\s*年\s*(?P<m>1[0-2]|[1-9])\s*月"),
    re.compile(r"(?P<y>19\d{2}|20\d{2})\s*[/\-.]\s*(?P<m>0?[1-9]|1[0-2])(?![0-9])"),
]


def _normalize_year(raw: str) -> int:
    y = int(raw)
    if y >= 100:
        return y
    # 2桁年。雑誌の刊行年代から、80-99 は 19xx、00-30 は 20xx と解釈する
    return 1900 + y if y >= 80 else 2000 + y


def parse_issue_from_title(title: str, aliases: list[str]) -> tuple[int, int] | None:
    """タイトルから (発行年, 月) を取り出す。ブロード検索の結果を号に割り当てる。

    誌名が一致しないもの、切り抜き等のノイズ、年月が読めないもの
    （まとめ売りなど）は None を返す。
    """
    if EXCLUDE_RE.search(title):
        return None
    norm = title.replace("・", "").replace(" ", "").replace("　", "").upper()
    if not any(a.replace("・", "").replace(" ", "").upper() in norm for a in aliases):
        return None

    for pat in _ISSUE_PATTERNS:
        m = pat.search(title)
        if not m:
            continue
        year, month = _normalize_year(m.group("y")), int(m.group("m"))
        if 1950 <= year <= 2030 and 1 <= month <= 12:
            return year, month
    return None

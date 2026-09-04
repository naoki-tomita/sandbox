"""調査対象サイトごとの検索URLビルダー。

各サイトの検索URL仕様をここに集約する。

- `verified` は「このURL形式を実URLと照合済みか」。未確認のものは
  collect.py の --dry-run で1件開いて目視確認してから使うこと。
- `paged` はページ送りに対応しているか。対応サイトはブロード検索
  （誌名だけで1回検索して全ページを辿る）が使えて、リクエスト数が
  1号ずつ叩く場合の 1/10 以下で済む。
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable
from urllib.parse import quote

# ヤフオクの検索結果は1ページ50件で、b= が先頭からのオフセット（1始まり）
YAHOO_PER_PAGE = 50


def _euc_jp_hex(query: str) -> str:
    """オークファンの検索URLで使われる EUC-JP 16進エンコード。

    例: 'ボクシング マガジン' -> '~a5dca5afa5b7a5f3a5b020a5dea5aca5b8a5f3'
    半角スペースは 0x20 としてそのまま16進化される。
    """
    return "~" + query.encode("euc-jp", errors="replace").hex()


def yahoo_closed(query: str, page: int = 1) -> str:
    """ヤフオク 落札相場（実際に売れた価格）。直近およそ4〜6か月分。"""
    base = f"https://auctions.yahoo.co.jp/closedsearch/closedsearch/{quote(query)}/0"
    if page <= 1:
        return base
    return f"{base}?b={(page - 1) * YAHOO_PER_PAGE + 1}&n={YAHOO_PER_PAGE}"


def yahoo_open(query: str, page: int = 1) -> str:
    """ヤフオク 出品中（売り手の希望価格）。"""
    base = f"https://auctions.yahoo.co.jp/search/search?p={quote(query)}"
    if page <= 1:
        return base
    return f"{base}&b={(page - 1) * YAHOO_PER_PAGE + 1}&n={YAHOO_PER_PAGE}"


def aucfan(query: str, page: int = 1) -> str:
    """オークファン。落札履歴を長期間さかのぼれる（無料は範囲が限られる）。"""
    return f"https://aucfan.com/search1/q-{_euc_jp_hex(query)}/s-ya/"


def mercari_sold(query: str, page: int = 1) -> str:
    """メルカリ SOLD（実売価格）。JavaScript描画のため Playwright が要る。

    無限スクロールなので page では送れない。1ページ目のみ。
    """
    return f"https://jp.mercari.com/search?keyword={quote(query)}&status=sold_out"


def surugaya(query: str, page: int = 1) -> str:
    """駿河屋。店頭販売価格。

    ck=true&inStock=On を付けると在庫ありと品切れの両方が出る。品切れ品の
    価格も「最後に付いていた売値」として意味があるので、在庫状況を別途
    記録したうえで拾う。
    """
    base = ("https://www.suruga-ya.jp/search?category=&search_word="
            f"{quote(query)}&ck=true&inStock=On")
    return base if page <= 1 else f"{base}&page={page}"


def kosho(query: str, page: int = 1) -> str:
    """日本の古本屋（全国古書籍商組合連合会）。古書店の売値。"""
    base = f"https://www.kosho.or.jp/products/list.php?mode=search&keyword={quote(query)}"
    return base if page <= 1 else f"{base}&pageno={page}"


def toudoukan(query: str, page: int = 1) -> str:
    """闘道館。格闘技・プロレス専門店。状態表記が細かく増刊も型番管理されている。"""
    return f"https://www.toudoukan.com/s/shop/goods/search?keyword={quote(query)}&p={page}"


@dataclass(frozen=True)
class Source:
    name: str
    build: Callable[[str, int], str]
    listing_type: str  # sold=成約価格 / asking=売り希望価格 / buyback=買取価格
    verified: bool     # URL形式を実URLと照合済みか
    paged: bool        # ページ送りに対応しているか
    note: str = ""

    def url(self, query: str, page: int = 1) -> str:
        return self.build(query, page)


_ALL = [
    Source("yahoo_closed", yahoo_closed, "sold", True, True,
           "落札相場。直近4〜6か月分のみ"),
    Source("yahoo_open", yahoo_open, "asking", True, True, "出品中"),
    Source("aucfan", aucfan, "sold", True, False, "長期の落札履歴。無料は範囲制限あり"),
    Source("mercari_sold", mercari_sold, "sold", True, False,
           "要 --engine playwright。無限スクロールで1ページ目のみ"),
    Source("surugaya", surugaya, "asking", True, True,
           "在庫あり＋品切れの両方。ページ送りパラメータは要確認"),
    Source("kosho", kosho, "asking", False, True, "URL形式が未確認"),
    Source("toudoukan", toudoukan, "asking", False, True, "URL形式が未確認"),
]

SOURCES = {s.name: s for s in _ALL}

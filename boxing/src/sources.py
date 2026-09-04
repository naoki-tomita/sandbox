"""調査対象サイトごとの検索URLビルダー。

各サイトの検索URL仕様をここに集約する。`verified` は「このURL形式を
実際にブラウザで開いて検索結果が出ることを確認済みか」を表す。
未確認のものは collect.py の --dry-run で1件開いて目視確認してから使うこと。
"""

from urllib.parse import quote


def _euc_jp_hex(query: str) -> str:
    """オークファンの検索URLで使われる EUC-JP 16進エンコード。

    例: 'ボクシング マガジン' -> '~a5dca5afa5b7a5f3a5b020a5dea5aca5b8a5f3'
    半角スペースは 0x20 としてそのまま16進化される。
    """
    return "~" + query.encode("euc-jp", errors="replace").hex()


def yahoo_closed(query: str) -> str:
    """ヤフオク 落札相場（実際に売れた価格）。直近およそ4〜6か月分。"""
    return f"https://auctions.yahoo.co.jp/closedsearch/closedsearch/{quote(query)}/0"


def yahoo_open(query: str) -> str:
    """ヤフオク 出品中（売り手の希望価格）。"""
    return f"https://auctions.yahoo.co.jp/search/search?p={quote(query)}"


def aucfan(query: str) -> str:
    """オークファン。落札履歴を長期間さかのぼれる（無料は範囲が限られる）。"""
    return f"https://aucfan.com/search1/q-{_euc_jp_hex(query)}/s-ya/"


def mercari_sold(query: str) -> str:
    """メルカリ SOLD（実売価格）。JavaScript描画のため Playwright が要る。"""
    return f"https://jp.mercari.com/search?keyword={quote(query)}&status=sold_out"


def surugaya(query: str) -> str:
    """駿河屋。店頭販売価格。買取価格も併記されることがある。"""
    return f"https://www.suruga-ya.jp/search?category=&search_word={quote(query)}"


def kosho(query: str) -> str:
    """日本の古本屋（全国古書籍商組合連合会）。古書店の売値。"""
    return f"https://www.kosho.or.jp/products/list.php?mode=search&keyword={quote(query)}"


def toudoukan(query: str) -> str:
    """闘道館。格闘技・プロレス専門店。状態表記が細かい。"""
    return f"https://www.toudoukan.com/s/shop/goods/search?keyword={quote(query)}"


# name -> (builder, listing_type, verified)
#   listing_type: sold=成約価格 / asking=売り希望価格 / buyback=買取価格
SOURCES = {
    "yahoo_closed": (yahoo_closed, "sold", True),
    "yahoo_open": (yahoo_open, "asking", True),
    "aucfan": (aucfan, "sold", True),
    "mercari_sold": (mercari_sold, "sold", True),
    "surugaya": (surugaya, "asking", True),
    "kosho": (kosho, "asking", False),
    "toudoukan": (toudoukan, "asking", False),
}

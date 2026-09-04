"""調査対象の号マスタ。

ワールドボクシング / ボクシング・マガジン はいずれも対象期間中は月刊で、
1995年1月号〜2001年12月号でそれぞれ84号。増刊号は刊行スケジュールが
不定なのでマスタには入れず、収集結果のタイトルから拾い上げる方針。
"""

from dataclasses import dataclass

MAGAZINES = {
    "world_boxing": {
        "title": "ワールドボクシング",
        "publisher": "日本スポーツ出版社",
        # 表記ゆれ。検索時に OR 展開して取りこぼしを防ぐ。
        "aliases": ["ワールドボクシング", "ワールド・ボクシング", "WORLD BOXING"],
    },
    "boxing_magazine": {
        "title": "ボクシング・マガジン",
        "publisher": "ベースボール・マガジン社",
        "aliases": ["ボクシングマガジン", "ボクシング・マガジン", "ボクマガ"],
    },
}

START_YEAR, END_YEAR = 1995, 2001


@dataclass(frozen=True)
class Issue:
    magazine_key: str
    magazine: str
    publisher: str
    year: int
    month: int

    @property
    def issue_label(self) -> str:
        return f"{self.year}年{self.month}月号"

    @property
    def issue_id(self) -> str:
        return f"{self.magazine_key}-{self.year}-{self.month:02d}"

    def query(self, alias: str | None = None) -> str:
        """検索クエリ。誌名 + 発行年月。"""
        name = alias or MAGAZINES[self.magazine_key]["aliases"][0]
        return f"{name} {self.year}年{self.month}月号"

    @property
    def aliases(self) -> list[str]:
        return MAGAZINES[self.magazine_key]["aliases"]


def all_issues(start_year: int = START_YEAR, end_year: int = END_YEAR) -> list[Issue]:
    out = []
    for key, meta in MAGAZINES.items():
        for year in range(start_year, end_year + 1):
            for month in range(1, 13):
                out.append(Issue(key, meta["title"], meta["publisher"], year, month))
    return out

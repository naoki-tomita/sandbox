"""古いイベントの削除。保存日数と合計容量(全カメラ合計)の上限で判定する。"""

from __future__ import annotations

import time
from pathlib import Path

from .config import RetentionConfig
from .db import Database


def delete_event_files(data_dir: Path, row: dict) -> None:
    for key in ("video_path", "thumb_path"):
        rel = row.get(key)
        if rel:
            (data_dir / rel).unlink(missing_ok=True)


def enforce(db: Database, data_dir: Path, cfg: RetentionConfig, now: float | None = None) -> int:
    """削除したイベント数を返す。星付きのイベントは keep_starred なら消さない。"""
    now = time.time() if now is None else now
    include_starred = not cfg.keep_starred
    removed = 0

    if cfg.days > 0:
        cutoff = now - cfg.days * 86400
        while batch := db.oldest_events(older_than=cutoff, include_starred=include_starred):
            for ev in batch:
                if row := db.delete_event(ev["id"]):
                    delete_event_files(data_dir, row)
                    removed += 1

    if cfg.max_gb > 0:
        limit = int(cfg.max_gb * 1024**3)
        total = db.total_size()
        while total > limit:
            batch = db.oldest_events(include_starred=include_starred, limit=20)
            if not batch:
                break
            for ev in batch:
                if total <= limit:
                    break
                if row := db.delete_event(ev["id"]):
                    delete_event_files(data_dir, row)
                    total -= int(row["size_bytes"])
                    removed += 1
    return removed

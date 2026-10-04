"""SQLite へのアクセス。解析スレッドとウェブの両方から使うので、1 接続をロックで直列化する。"""

from __future__ import annotations

import sqlite3
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable, Sequence

SCHEMA_VERSION = 1

_SCHEMA = """
CREATE TABLE IF NOT EXISTS cameras (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  camera_id TEXT NOT NULL REFERENCES cameras(id),
  started_at REAL NOT NULL,
  ended_at REAL NOT NULL,
  video_start REAL NOT NULL,
  duration REAL NOT NULL,
  video_path TEXT NOT NULL,
  thumb_path TEXT,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  peak_motion REAL NOT NULL DEFAULT 0,
  starred INTEGER NOT NULL DEFAULT 0,
  created_at REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS events_camera_started ON events(camera_id, started_at);
CREATE INDEX IF NOT EXISTS events_started ON events(started_at);
CREATE TABLE IF NOT EXISTS event_tags (
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  max_conf REAL NOT NULL,
  hits INTEGER NOT NULL,
  PRIMARY KEY (event_id, tag)
);
CREATE INDEX IF NOT EXISTS event_tags_tag ON event_tags(tag);
CREATE TABLE IF NOT EXISTS detections (
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  t_offset REAL NOT NULL,
  label TEXT NOT NULL,
  conf REAL NOT NULL,
  x REAL NOT NULL, y REAL NOT NULL, w REAL NOT NULL, h REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS detections_event ON detections(event_id);
CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL);
"""


@dataclass(frozen=True)
class NewEvent:
    camera_id: str
    started_at: float
    ended_at: float
    video_start: float
    duration: float
    video_path: str  # データディレクトリからの相対パス
    thumb_path: str | None
    size_bytes: int
    peak_motion: float
    tags: dict[str, tuple[float, int]]  # tag -> (max_conf, hits)
    detections: Sequence[tuple[float, str, float, tuple[float, float, float, float]]]  # (t_offset, label, conf, box)


class Database:
    def __init__(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(str(path), check_same_thread=False, isolation_level=None)
        self._conn.row_factory = sqlite3.Row
        self._lock = threading.Lock()
        with self._lock:
            self._conn.execute("PRAGMA journal_mode=WAL")
            self._conn.execute("PRAGMA foreign_keys=ON")
            self._conn.executescript(_SCHEMA)
            row = self._conn.execute("SELECT version FROM schema_version").fetchone()
            if row is None:
                self._conn.execute("INSERT INTO schema_version VALUES (?)", (SCHEMA_VERSION,))

    def close(self) -> None:
        with self._lock:
            self._conn.close()

    def _query(self, sql: str, params: Iterable[Any] = ()) -> list[sqlite3.Row]:
        with self._lock:
            return self._conn.execute(sql, tuple(params)).fetchall()

    # --- カメラ ---

    def upsert_cameras(self, cameras: Iterable[tuple[str, str]]) -> None:
        now = time.time()
        with self._lock:
            for cam_id, name in cameras:
                self._conn.execute(
                    "INSERT INTO cameras(id, name, created_at) VALUES (?, ?, ?) "
                    "ON CONFLICT(id) DO UPDATE SET name = excluded.name",
                    (cam_id, name, now),
                )

    def cameras(self) -> list[dict[str, Any]]:
        return [dict(r) for r in self._query("SELECT id, name FROM cameras ORDER BY created_at, id")]

    # --- イベント ---

    def insert_event(self, ev: NewEvent) -> int:
        with self._lock:
            self._conn.execute("BEGIN")
            try:
                cur = self._conn.execute(
                    "INSERT INTO events(camera_id, started_at, ended_at, video_start, duration, video_path,"
                    " thumb_path, size_bytes, peak_motion, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
                    (ev.camera_id, ev.started_at, ev.ended_at, ev.video_start, ev.duration, ev.video_path,
                     ev.thumb_path, ev.size_bytes, ev.peak_motion, time.time()),
                )
                event_id = int(cur.lastrowid)
                self._conn.executemany(
                    "INSERT INTO event_tags(event_id, tag, max_conf, hits) VALUES (?,?,?,?)",
                    [(event_id, tag, conf, hits) for tag, (conf, hits) in ev.tags.items()],
                )
                self._conn.executemany(
                    "INSERT INTO detections(event_id, t_offset, label, conf, x, y, w, h) VALUES (?,?,?,?,?,?,?,?)",
                    [(event_id, t, label, conf, *box) for t, label, conf, box in ev.detections],
                )
                self._conn.execute("COMMIT")
            except BaseException:
                self._conn.execute("ROLLBACK")
                raise
        return event_id

    def list_events(
        self,
        *,
        cameras: Sequence[str] = (),
        tags: Sequence[str] = (),
        since: float | None = None,
        until: float | None = None,
        starred: bool | None = None,
        before_id: int | None = None,
        limit: int = 50,
    ) -> list[dict[str, Any]]:
        """新しい順。tags は「すべてを含む」(AND)で絞り込む。before_id でページング。"""
        where, params = [], []
        if cameras:
            where.append(f"e.camera_id IN ({','.join('?' * len(cameras))})")
            params += list(cameras)
        for tag in tags:
            where.append("EXISTS (SELECT 1 FROM event_tags t WHERE t.event_id = e.id AND t.tag = ?)")
            params.append(tag)
        if since is not None:
            where.append("e.started_at >= ?")
            params.append(since)
        if until is not None:
            where.append("e.started_at < ?")
            params.append(until)
        if starred is not None:
            where.append("e.starred = ?")
            params.append(1 if starred else 0)
        if before_id is not None:
            where.append("e.id < ?")
            params.append(before_id)
        sql = "SELECT e.*, c.name AS camera_name FROM events e LEFT JOIN cameras c ON c.id = e.camera_id"
        if where:
            sql += " WHERE " + " AND ".join(where)
        sql += " ORDER BY e.id DESC LIMIT ?"
        params.append(limit)
        rows = [dict(r) for r in self._query(sql, params)]
        self._attach_tags(rows)
        return rows

    def get_event(self, event_id: int) -> dict[str, Any] | None:
        rows = self._query(
            "SELECT e.*, c.name AS camera_name FROM events e LEFT JOIN cameras c ON c.id = e.camera_id"
            " WHERE e.id = ?",
            (event_id,),
        )
        if not rows:
            return None
        ev = dict(rows[0])
        self._attach_tags([ev])
        ev["detections"] = [
            dict(r)
            for r in self._query(
                "SELECT t_offset, label, conf, x, y, w, h FROM detections WHERE event_id = ? ORDER BY t_offset",
                (event_id,),
            )
        ]
        return ev

    def _attach_tags(self, rows: list[dict[str, Any]]) -> None:
        if not rows:
            return
        ids = [r["id"] for r in rows]
        tag_rows = self._query(
            f"SELECT event_id, tag, max_conf, hits FROM event_tags WHERE event_id IN ({','.join('?' * len(ids))})"
            " ORDER BY max_conf DESC",
            ids,
        )
        by_id: dict[int, list[dict[str, Any]]] = {i: [] for i in ids}
        for t in tag_rows:
            by_id[t["event_id"]].append({"tag": t["tag"], "max_conf": t["max_conf"], "hits": t["hits"]})
        for r in rows:
            r["tags"] = by_id[r["id"]]

    def set_starred(self, event_id: int, starred: bool) -> bool:
        with self._lock:
            cur = self._conn.execute("UPDATE events SET starred = ? WHERE id = ?", (1 if starred else 0, event_id))
            return cur.rowcount > 0

    def delete_event(self, event_id: int) -> dict[str, Any] | None:
        """行を消し、消した行(ファイルの削除用)を返す。"""
        with self._lock:
            row = self._conn.execute("SELECT * FROM events WHERE id = ?", (event_id,)).fetchone()
            if row is None:
                return None
            self._conn.execute("DELETE FROM events WHERE id = ?", (event_id,))
            return dict(row)

    def tag_counts(self, cameras: Sequence[str] = ()) -> list[dict[str, Any]]:
        sql = "SELECT t.tag, COUNT(*) AS count FROM event_tags t"
        params: list[Any] = []
        if cameras:
            sql += f" JOIN events e ON e.id = t.event_id WHERE e.camera_id IN ({','.join('?' * len(cameras))})"
            params += list(cameras)
        sql += " GROUP BY t.tag ORDER BY count DESC, t.tag"
        return [dict(r) for r in self._query(sql, params)]

    def count_since(self, camera_id: str, since: float) -> int:
        row = self._query(
            "SELECT COUNT(*) AS n FROM events WHERE camera_id = ? AND started_at >= ?", (camera_id, since)
        )[0]
        return int(row["n"])

    def total_size(self) -> int:
        return int(self._query("SELECT COALESCE(SUM(size_bytes), 0) AS s FROM events")[0]["s"])

    def oldest_events(self, *, older_than: float | None = None, include_starred: bool = False, limit: int = 100):
        where, params = [], []
        if older_than is not None:
            where.append("started_at < ?")
            params.append(older_than)
        if not include_starred:
            where.append("starred = 0")
        sql = "SELECT id, size_bytes FROM events"
        if where:
            sql += " WHERE " + " AND ".join(where)
        sql += " ORDER BY started_at LIMIT ?"
        params.append(limit)
        return [dict(r) for r in self._query(sql, params)]

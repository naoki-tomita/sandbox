"""閲覧用のウェブ API と画面(素の HTML/JS)。"""

from __future__ import annotations

import base64
import secrets
import time
from pathlib import Path
from typing import Any

import cv2
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from ..db import Database
from ..retention import delete_event_files
from ..status import StatusRegistry

STATIC_DIR = Path(__file__).parent / "static"


class StarBody(BaseModel):
    starred: bool


def _with_urls(ev: dict[str, Any]) -> dict[str, Any]:
    ev["video_url"] = f"/media/{ev['video_path']}"
    ev["thumb_url"] = f"/media/{ev['thumb_path']}" if ev.get("thumb_path") else None
    return ev


def _day_range(date: str) -> tuple[float, float]:
    try:
        t = time.strptime(date, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(400, "date は YYYY-MM-DD 形式で指定してください")
    start = time.mktime((t.tm_year, t.tm_mon, t.tm_mday, 0, 0, 0, 0, 0, -1))
    end = time.mktime((t.tm_year, t.tm_mon, t.tm_mday + 1, 0, 0, 0, 0, 0, -1))
    return start, end


def create_app(
    db: Database,
    data_dir: Path,
    registry: StatusRegistry,
    *,
    auth_user: str = "",
    auth_password: str = "",
    detector_name: str = "",
) -> FastAPI:
    app = FastAPI(title="atom-watch", docs_url=None, redoc_url=None, openapi_url=None)
    clips_root = (data_dir / "clips").resolve()

    if auth_user:
        expected = base64.b64encode(f"{auth_user}:{auth_password}".encode()).decode()

        @app.middleware("http")
        async def basic_auth(request: Request, call_next):
            header = request.headers.get("authorization", "")
            if not (header.startswith("Basic ") and secrets.compare_digest(header[6:].strip(), expected)):
                return Response(status_code=401, headers={"WWW-Authenticate": 'Basic realm="atom-watch"'})
            return await call_next(request)

    @app.get("/api/cameras")
    def cameras() -> list[dict[str, Any]]:
        out = []
        known = {c["id"]: c for c in db.cameras()}
        for cam_id, st in registry.cameras.items():
            out.append({**st.to_dict(), "active": True})
            known.pop(cam_id, None)
        # 設定から外したカメラも、過去のイベントを絞り込めるように返す
        for cam in known.values():
            out.append({"id": cam["id"], "name": cam["name"], "active": False})
        return out

    @app.get("/api/cameras/{camera_id}/live.jpg")
    def live(camera_id: str) -> Response:
        st = registry.cameras.get(camera_id)
        if st is None:
            raise HTTPException(404, "カメラがありません")
        frame = st.latest_frame()
        if frame is None:
            raise HTTPException(503, "まだ映像がありません")
        ok, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 75])
        if not ok:
            raise HTTPException(500, "JPEG に変換できませんでした")
        return Response(buf.tobytes(), media_type="image/jpeg", headers={"Cache-Control": "no-store"})

    @app.get("/api/events")
    def events(
        camera: list[str] = Query(default=[]),
        tag: list[str] = Query(default=[]),
        date: str | None = None,
        starred: bool | None = None,
        before: int | None = None,
        limit: int = Query(default=60, ge=1, le=200),
    ) -> dict[str, Any]:
        since = until = None
        if date:
            since, until = _day_range(date)
        rows = db.list_events(
            cameras=camera, tags=tag, since=since, until=until, starred=starred, before_id=before, limit=limit
        )
        next_cursor = rows[-1]["id"] if len(rows) == limit else None
        return {"events": [_with_urls(r) for r in rows], "next": next_cursor}

    @app.get("/api/events/{event_id}")
    def event(event_id: int) -> dict[str, Any]:
        ev = db.get_event(event_id)
        if ev is None:
            raise HTTPException(404, "イベントがありません")
        return _with_urls(ev)

    @app.delete("/api/events/{event_id}")
    def delete_event(event_id: int) -> dict[str, Any]:
        row = db.delete_event(event_id)
        if row is None:
            raise HTTPException(404, "イベントがありません")
        delete_event_files(data_dir, row)
        return {"deleted": event_id}

    @app.post("/api/events/{event_id}/star")
    def star(event_id: int, body: StarBody) -> dict[str, Any]:
        if not db.set_starred(event_id, body.starred):
            raise HTTPException(404, "イベントがありません")
        return {"id": event_id, "starred": body.starred}

    @app.get("/api/tags")
    def tags(camera: list[str] = Query(default=[])) -> list[dict[str, Any]]:
        return db.tag_counts(camera)

    @app.get("/api/status")
    def status() -> dict[str, Any]:
        return {
            "started_at": registry.started_at,
            "detector": detector_name or None,
            "detector_ms": round(registry.detector_ms, 1),
            "detector_queue": registry.detector_queue,
            "detector_dropped": registry.detector_dropped,
            "disk_bytes": registry.disk_bytes,
            "cameras": [st.to_dict() for st in registry.cameras.values()],
        }

    @app.get("/media/{path:path}")
    def media(path: str) -> FileResponse:
        target = (data_dir / path).resolve()
        # データディレクトリ(clips)の外を指すパスは拒否する
        if not target.is_relative_to(clips_root) or not target.is_file():
            raise HTTPException(404, "ファイルがありません")
        return FileResponse(target, headers={"Cache-Control": "private, max-age=86400"})

    @app.get("/")
    def index() -> FileResponse:
        return FileResponse(STATIC_DIR / "index.html", headers={"Cache-Control": "no-cache"})

    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

    @app.exception_handler(HTTPException)
    async def http_error(_: Request, exc: HTTPException):
        return JSONResponse({"error": exc.detail}, status_code=exc.status_code, headers=exc.headers)

    return app

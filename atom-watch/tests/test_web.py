import base64
import time

import numpy as np
import pytest
from fastapi.testclient import TestClient

from atomwatch.config import RetentionConfig
from atomwatch.db import Database, NewEvent
from atomwatch.retention import enforce
from atomwatch.status import StatusRegistry
from atomwatch.web.app import create_app


def add_event(db, data_dir, cam, started, tags, size=1000, name=None):
    name = name or f"{cam}-{started}"
    rel = f"clips/{cam}/day/{name}.mp4"
    path = data_dir / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(bytes(range(256)) * (size // 256 + 1))
    return db.insert_event(
        NewEvent(
            camera_id=cam, started_at=started, ended_at=started + 5, video_start=started - 5, duration=15,
            video_path=rel, thumb_path=None, size_bytes=size, peak_motion=0.1,
            tags={t: (0.9, 2) for t in tags},
            detections=[(5.0, tags[0], 0.9, (0.1, 0.1, 0.2, 0.2))] if tags else [],
        )
    )


@pytest.fixture
def env(tmp_path):
    db = Database(tmp_path / "t.db")
    db.upsert_cameras([("a", "玄関"), ("b", "庭")])
    reg = StatusRegistry()
    st = reg.add("a", "玄関")
    st.connected = True
    st.set_frame(np.zeros((36, 64, 3), dtype=np.uint8), time.time())
    reg.add("b", "庭")
    yield db, tmp_path, reg
    db.close()


def test_list_filter_and_paging(env):
    db, data_dir, reg = env
    now = time.time()
    e1 = add_event(db, data_dir, "a", now - 30, ["person", "day"])
    e2 = add_event(db, data_dir, "b", now - 20, ["cat", "day"])
    e3 = add_event(db, data_dir, "a", now - 10, ["person", "cat", "day"])
    c = TestClient(create_app(db, data_dir, reg))

    ids = lambda r: [e["id"] for e in r.json()["events"]]
    assert ids(c.get("/api/events")) == [e3, e2, e1]
    assert ids(c.get("/api/events", params={"camera": "a"})) == [e3, e1]
    assert ids(c.get("/api/events", params=[("camera", "a"), ("camera", "b")])) == [e3, e2, e1]
    assert ids(c.get("/api/events", params={"tag": "cat"})) == [e3, e2]
    assert ids(c.get("/api/events", params=[("tag", "cat"), ("tag", "person")])) == [e3]
    today = time.strftime("%Y-%m-%d", time.localtime(now - 10))
    assert e3 in ids(c.get("/api/events", params={"date": today}))
    assert ids(c.get("/api/events", params={"date": "2000-01-01"})) == []

    page = c.get("/api/events", params={"limit": 2}).json()
    assert [e["id"] for e in page["events"]] == [e3, e2] and page["next"] == e2
    assert ids(c.get("/api/events", params={"limit": 2, "before": page["next"]})) == [e1]

    ev = c.get(f"/api/events/{e3}").json()
    assert ev["camera_name"] == "玄関"
    assert {t["tag"] for t in ev["tags"]} == {"person", "cat", "day"}
    assert ev["detections"][0]["label"] == "person"
    assert ev["video_url"].startswith("/media/clips/a/")

    tags = {t["tag"]: t["count"] for t in c.get("/api/tags").json()}
    assert tags["person"] == 2 and tags["cat"] == 2
    tags_b = {t["tag"]: t["count"] for t in c.get("/api/tags", params={"camera": "b"}).json()}
    assert "person" not in tags_b


def test_star_and_delete(env):
    db, data_dir, reg = env
    e = add_event(db, data_dir, "a", time.time(), ["person"])
    c = TestClient(create_app(db, data_dir, reg))
    assert c.post(f"/api/events/{e}/star", json={"starred": True}).status_code == 200
    assert [x["id"] for x in c.get("/api/events", params={"starred": "true"}).json()["events"]] == [e]
    video = data_dir / db.get_event(e)["video_path"]
    assert video.exists()
    assert c.delete(f"/api/events/{e}").status_code == 200
    assert not video.exists()
    assert c.get(f"/api/events/{e}").status_code == 404
    assert c.delete(f"/api/events/{e}").status_code == 404


def test_media_range_and_traversal(env):
    db, data_dir, reg = env
    e = add_event(db, data_dir, "a", time.time(), ["person"], size=4096)
    (data_dir / "t.db").exists()
    c = TestClient(create_app(db, data_dir, reg))
    url = c.get(f"/api/events/{e}").json()["video_url"]
    r = c.get(url, headers={"Range": "bytes=0-99"})
    assert r.status_code == 206 and len(r.content) == 100
    assert c.get("/media/../t.db").status_code == 404
    assert c.get("/media/clips/../t.db").status_code == 404
    assert c.get("/media/%2e%2e/t.db").status_code == 404


def test_cameras_live_and_status(env):
    db, data_dir, reg = env
    db.upsert_cameras([("old", "昔のカメラ")])
    c = TestClient(create_app(db, data_dir, reg))
    cams = {x["id"]: x for x in c.get("/api/cameras").json()}
    assert cams["a"]["active"] and cams["a"]["connected"]
    assert cams["old"]["active"] is False
    r = c.get("/api/cameras/a/live.jpg")
    assert r.status_code == 200 and r.headers["content-type"] == "image/jpeg"
    assert c.get("/api/cameras/b/live.jpg").status_code == 503
    assert c.get("/api/cameras/zzz/live.jpg").status_code == 404
    assert len(c.get("/api/status").json()["cameras"]) == 2
    assert c.get("/").status_code == 200
    assert c.get("/static/app.js").status_code == 200


def test_basic_auth(env):
    db, data_dir, reg = env
    c = TestClient(create_app(db, data_dir, reg, auth_user="me", auth_password="pw"))
    assert c.get("/api/events").status_code == 401
    token = base64.b64encode(b"me:pw").decode()
    assert c.get("/api/events", headers={"Authorization": f"Basic {token}"}).status_code == 200
    bad = base64.b64encode(b"me:nope").decode()
    assert c.get("/", headers={"Authorization": f"Basic {bad}"}).status_code == 401


def test_retention_by_age_and_size(env):
    db, data_dir, _ = env
    now = time.time()
    old = add_event(db, data_dir, "a", now - 20 * 86400, ["person"])
    old_star = add_event(db, data_dir, "a", now - 21 * 86400, ["person"])
    db.set_starred(old_star, True)
    recent = [add_event(db, data_dir, "a", now - i * 100, ["person"], size=1000) for i in range(5, 0, -1)]
    removed = enforce(db, data_dir, RetentionConfig(days=14, max_gb=0), now=now)
    assert removed == 1 and db.get_event(old) is None and db.get_event(old_star) is not None
    # 容量上限: 3000 バイト + 星付き 1000 → 星付きは数えるが消さない
    removed = enforce(db, data_dir, RetentionConfig(days=0, max_gb=3500 / 1024**3), now=now)
    remaining = [e["id"] for e in db.list_events(limit=100)]
    assert old_star in remaining
    assert db.total_size() <= 3500
    assert recent[-1] in remaining and recent[0] not in remaining

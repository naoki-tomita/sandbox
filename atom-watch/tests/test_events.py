from atomwatch.detector import Detection
from atomwatch.events import EventTracker, filter_detections
from atomwatch.motion import NO_MOTION, MotionResult

MOVE = MotionResult(active=True, score=0.05, boxes=[(0.4, 0.4, 0.2, 0.2)])
PERSON = Detection("person", 0.8, (0.45, 0.45, 0.1, 0.1))


def run(tracker, start, end, motion, step=0.2):
    out = []
    t = start
    while t < end:
        out += tracker.update(t, motion)
        t += step
    return out


def test_unconfirmed_motion_is_discarded():
    tr = EventTracker(min_hits=2, pre_roll=5, post_roll=5)
    assert run(tr, 0, 3, MOVE) == []
    assert tr.state == "motion"
    assert run(tr, 3, 10, NO_MOTION) == []
    assert tr.state == "idle"


def test_confirmed_event_has_pre_and_post_roll():
    tr = EventTracker(min_hits=2, pre_roll=5, post_roll=5)
    run(tr, 100, 101, MOVE)
    tr.add_detections(100.5, [PERSON], frame="f1")
    tr.add_detections(100.9, [PERSON], frame="f2")
    assert tr.state == "recording"
    run(tr, 101, 104, MOVE)
    done = run(tr, 104, 112, NO_MOTION)
    assert len(done) == 1
    ev = done[0]
    assert ev.confirmed
    assert ev.clip_start == 95
    assert abs(ev.clip_end - (ev.ended_at + 5)) < 1e-9
    assert ev.tags["person"].hits == 2
    assert ev.best_frame == "f1"


def test_single_hit_is_not_enough():
    tr = EventTracker(min_hits=2)
    run(tr, 0, 1, MOVE)
    tr.add_detections(0.5, [PERSON])
    assert run(tr, 1, 10, NO_MOTION) == []


def test_keep_unclassified_tags_motion():
    tr = EventTracker(min_hits=2, keep_unclassified=True)
    run(tr, 0, 1, MOVE)
    done = run(tr, 1, 10, NO_MOTION)
    assert len(done) == 1 and "motion" in done[0].tags


def test_long_event_is_split():
    tr = EventTracker(min_hits=1, pre_roll=5, post_roll=5, max_event=30)
    run(tr, 0, 1, MOVE)
    tr.add_detections(0.5, [PERSON])
    done = run(tr, 1, 31, MOVE)
    assert len(done) == 1
    assert done[0].clip_end == done[0].started_at + 30 or abs(done[0].clip_end - 30) < 0.3
    # 続きは余白なしで始まっている
    assert tr.state == "motion"
    assert tr.clip_start is not None and tr.clip_start >= 29.9


def test_flush_returns_confirmed_event():
    tr = EventTracker(min_hits=1)
    run(tr, 0, 2, MOVE)
    tr.add_detections(1.0, [PERSON])
    done = tr.flush(2.5)
    assert len(done) == 1 and done[0].clip_end == 2.5
    assert tr.state == "idle"


def test_late_detection_after_event_end_is_ignored():
    tr = EventTracker(min_hits=1)
    run(tr, 0, 1, MOVE)
    run(tr, 1, 10, NO_MOTION)
    tr.add_detections(0.5, [PERSON])
    assert tr.state == "idle"


def test_filter_detections_by_target_conf_and_overlap():
    motion_boxes = [(0.4, 0.4, 0.2, 0.2)]
    dets = [
        PERSON,  # 対象・動き領域と重なる
        Detection("person", 0.2, (0.45, 0.45, 0.1, 0.1)),  # 信頼度不足
        Detection("chair", 0.9, (0.45, 0.45, 0.1, 0.1)),  # 対象外
        Detection("car", 0.9, (0.0, 0.0, 0.1, 0.1)),  # 止まっている車(動き領域と重ならない)
    ]
    out = filter_detections(dets, motion_boxes, ["person", "car"], 0.4)
    assert out == [PERSON]
    out = filter_detections(dets, motion_boxes, ["person", "car"], 0.4, require_overlap=False)
    assert [d.label for d in out] == ["person", "car"]

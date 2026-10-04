import time

from atomwatch.segments import FILENAME_FORMAT, SegmentStore


def make(store, t):
    p = store.directory / (time.strftime(FILENAME_FORMAT, time.localtime(t)) + ".ts")
    p.write_bytes(b"x")
    return p


def test_select_and_end_times(tmp_path):
    store = SegmentStore(tmp_path / "seg", keep_seconds=10)
    base = 1_700_000_000
    for i in range(5):
        make(store, base + i * 2)
    segs = store.list()
    assert [s.start for s in segs] == [base + i * 2 for i in range(5)]
    assert segs[0].end == base + 2 and segs[-1].end is None
    sel = store.select(base + 3, base + 5)
    assert [s.start for s in sel] == [base + 2, base + 4]
    assert store.has_segment_after(base + 7)
    assert not store.has_segment_after(base + 8)


def test_prune_respects_keep_and_holds(tmp_path):
    store = SegmentStore(tmp_path / "seg", keep_seconds=10)
    base = 1_700_000_000
    for i in range(20):
        make(store, base + i * 2)
    now = base + 40
    token = store.hold(base + 10)
    store.prune(now)
    assert store.list()[0].start == base + 8  # end(base+10) >= hold なので残る
    store.release(token)
    store.prune(now)
    assert store.list()[0].start == base + 28  # end(base+30) >= now - keep
    store.prune(now, protect_since=base + 29)
    assert store.list()[0].start == base + 28


def test_ignores_unrelated_files(tmp_path):
    store = SegmentStore(tmp_path / "seg")
    (store.directory / "junk.ts").write_bytes(b"x")
    assert store.list() == []

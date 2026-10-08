from atomwatch.segments import SegmentStore


def write_list(store, run, entries, partial=""):
    """ffmpeg の -segment_list(CSV)と同じ形式で一覧を書き、セグメントのファイルも作る。"""
    lines = []
    for i, (start, end) in enumerate(entries):
        name = f"{run}-{i:06d}.ts"
        (store.directory / name).write_bytes(b"x")
        lines.append(f"{name},{start:.6f},{end:.6f}\n")
    store.list_path(run).write_text("".join(lines) + partial)


def test_times_come_from_list_and_anchor(tmp_path):
    store = SegmentStore(tmp_path / "seg", keep_seconds=10)
    run = store.new_run()
    write_list(store, run, [(0, 2.1), (2.1, 4.1), (4.1, 6.1)])
    assert store.list() == []  # アンカーが決まるまでは使わない
    base = 1_700_000_000.0
    store.set_anchor(run, base)
    segs = store.list()
    assert [(s.start, s.end) for s in segs] == [(base, base + 2.1), (base + 2.1, base + 4.1), (base + 4.1, base + 6.1)]
    sel = store.select(base + 3, base + 5)
    assert [s.path.name for s in sel] == [f"{run}-000001.ts", f"{run}-000002.ts"]
    assert store.covers(base + 6)
    assert not store.covers(base + 6.2)


def test_reads_only_appended_complete_lines(tmp_path):
    store = SegmentStore(tmp_path / "seg")
    run = store.new_run()
    store.set_anchor(run, 100.0)
    write_list(store, run, [(0, 2)], partial=f"{run}-000001.ts,2.0")  # 2 行目は書きかけ
    assert len(store.list()) == 1
    write_list(store, run, [(0, 2), (2, 4)])
    assert [s.end for s in store.list()] == [102.0, 104.0]


def test_runs_have_their_own_anchor(tmp_path):
    store = SegmentStore(tmp_path / "seg")
    r1 = store.new_run()
    write_list(store, r1, [(0, 2), (2, 4)])
    store.set_anchor(r1, 100.0)
    r2 = store.new_run()  # 再接続: ストリーム時刻は 0 から始まり直す
    write_list(store, r2, [(0, 2)])
    store.set_anchor(r2, 110.0)
    assert [(s.path.name, s.start) for s in store.list()] == [
        (f"{r1}-000000.ts", 100.0),
        (f"{r1}-000001.ts", 102.0),
        (f"{r2}-000000.ts", 110.0),
    ]


def test_prune_respects_keep_and_holds(tmp_path):
    store = SegmentStore(tmp_path / "seg", keep_seconds=10)
    run = store.new_run()
    base = 1_700_000_000.0
    store.set_anchor(run, base)
    write_list(store, run, [(i * 2, i * 2 + 2) for i in range(20)])
    now = base + 40
    token = store.hold(base + 10)
    store.prune(now)
    assert store.list()[0].start == base + 8  # end(base+10) >= hold なので残る
    store.release(token)
    store.prune(now)
    assert store.list()[0].start == base + 28  # end(base+30) >= now - keep
    assert not (store.directory / f"{run}-000000.ts").exists()
    store.prune(now, protect_since=base + 29)
    assert store.list()[0].start == base + 28


def test_prune_cleans_up_finished_runs(tmp_path):
    store = SegmentStore(tmp_path / "seg", keep_seconds=10)
    dead = store.new_run()  # 最後までフレームが届かなかった接続
    write_list(store, dead, [(0, 2)])
    (store.directory / f"{dead}-000001.ts").write_bytes(b"x")  # 強制終了で一覧に載らなかったファイル
    old = store.new_run()
    store.set_anchor(old, 0.0)
    write_list(store, old, [(0, 2)])
    current = store.new_run()
    store.set_anchor(current, 100.0)
    write_list(store, current, [(0, 2)])
    store.prune(now=105.0)
    assert sorted(p.name for p in store.directory.iterdir()) == [f"{current}-000000.ts", f"{current}.csv"]


def test_clear_removes_everything(tmp_path):
    store = SegmentStore(tmp_path / "seg")
    run = store.new_run()
    store.set_anchor(run, 0.0)
    write_list(store, run, [(0, 2)])
    store.clear()
    assert list(store.directory.iterdir()) == []
    assert store.list() == []

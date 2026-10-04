import numpy as np

from atomwatch.motion import MotionDetector

H, W = 360, 640


def background(seed=0):
    rng = np.random.default_rng(seed)
    base = np.full((H, W, 3), 90, dtype=np.uint8)
    return base, rng


def noisy(base, rng):
    noise = rng.integers(-3, 4, size=base.shape)
    return np.clip(base.astype(int) + noise, 0, 255).astype(np.uint8)


def warm_up(md, base, rng, n=20):
    for _ in range(n):
        md.update(noisy(base, rng))


def with_box(base, x, y, w=60, h=60, value=230):
    f = base.copy()
    f[y : y + h, x : x + w] = value
    return f


def test_static_scene_has_no_motion():
    base, rng = background()
    md = MotionDetector((H, W), warmup_frames=5)
    results = [md.update(noisy(base, rng)) for _ in range(30)]
    assert not any(r.active for r in results)


def test_moving_object_is_detected_with_box():
    base, rng = background()
    md = MotionDetector((H, W), warmup_frames=5)
    warm_up(md, base, rng)
    r = md.update(with_box(noisy(base, rng), 300, 150))
    assert r.active
    assert not r.lighting_change
    # 箱の位置(正規化座標)に重なる動き領域があること
    x, y = 330 / W, 180 / H
    assert any(bx <= x <= bx + bw and by <= y <= by + bh for bx, by, bw, bh in r.boxes)


def test_lighting_change_is_ignored_and_background_resets():
    base, rng = background()
    md = MotionDetector((H, W), warmup_frames=3)
    warm_up(md, base, rng)
    bright = np.full_like(base, 200)
    r = md.update(bright)
    assert r.lighting_change
    assert not r.active
    # リセット後のウォームアップ中も動きなし
    assert not md.update(bright).active


def test_masked_region_is_ignored():
    base, rng = background()
    # 右下(時刻表示の想定)をマスク
    md = MotionDetector((H, W), mask_regions=[[0.7, 0.8, 0.3, 0.2]], warmup_frames=5)
    warm_up(md, base, rng)
    r = md.update(with_box(noisy(base, rng), 520, 300, w=80, h=40))
    assert not r.active


def test_tiny_change_below_min_area_is_ignored():
    base, rng = background()
    md = MotionDetector((H, W), min_area=0.01, warmup_frames=5)
    warm_up(md, base, rng)
    r = md.update(with_box(noisy(base, rng), 100, 100, w=12, h=12))
    assert not r.active

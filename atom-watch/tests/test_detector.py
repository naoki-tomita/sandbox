import numpy as np

from atomwatch.detector import _make_grids, postprocess, preprocess


def test_preprocess_letterbox():
    frame = np.zeros((360, 640, 3), dtype=np.uint8)
    blob, ratio = preprocess(frame, (416, 416))
    assert blob.shape == (1, 3, 416, 416) and blob.dtype == np.float32
    assert ratio == 416 / 640
    # 下側はパディング(114)
    assert blob[0, 0, -1, 0] == 114


def test_postprocess_decodes_and_nms():
    hw = (416, 416)
    grids, strides = _make_grids(hw)
    n = len(grids)
    assert n == 52 * 52 + 26 * 26 + 13 * 13
    raw = np.zeros((n, 85), dtype=np.float32)
    raw[:, 4] = 0.0  # objectness 0 → 何も出ない
    # stride 8 の (x=20, y=10) のセルに人(class 0)を置く。中心 = (20.5*8, 10.5*8) 付近
    i = 10 * 52 + 20
    raw[i, 0:2] = 0.5
    raw[i, 2:4] = np.log(4.0)  # 幅・高さ = 4 * 8 = 32px
    raw[i, 4] = 0.9
    raw[i, 5] = 0.9
    # 同じ場所に少しずれた重複(NMS で消える)
    raw[i + 1, 0:2] = -0.4
    raw[i + 1, 2:4] = np.log(4.0)
    raw[i + 1, 4] = 0.8
    raw[i + 1, 5] = 0.8
    dets = postprocess(raw, grids, strides, ratio=1.0, frame_hw=hw, conf_threshold=0.3, nms_threshold=0.45)
    assert len(dets) == 1
    d = dets[0]
    assert d.label == "person"
    assert abs(d.conf - 0.81) < 1e-5
    x, y, w, h = d.box
    assert abs(x * 416 - (164 - 16)) < 1 and abs(y * 416 - (84 - 16)) < 1
    assert abs(w * 416 - 32) < 1 and abs(h * 416 - 32) < 1


def test_postprocess_nothing_above_threshold():
    grids, strides = _make_grids((416, 416))
    raw = np.zeros((len(grids), 85), dtype=np.float32)
    assert postprocess(raw, grids, strides, ratio=1.0, frame_hw=(416, 416), conf_threshold=0.3, nms_threshold=0.45) == []

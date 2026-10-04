from pathlib import Path

import pytest

from atomwatch.config import ConfigError, default_segment_dir, parse_config, single_camera


def test_defaults_are_merged_and_overridden(tmp_path):
    cfg = parse_config(
        {
            "data_dir": "d",
            "defaults": {"analysis_fps": 3, "targets": ["person"]},
            "cameras": [
                {"id": "a", "url": "rtsp://x/1"},
                {"id": "b", "url": "rtsp://x/2", "targets": ["cat"], "name": "庭"},
            ],
            "web": {"port": 9000, "auth": {"user": "u", "password": "p"}},
            "detector": {"model": "models/m.onnx"},
        },
        base_dir=tmp_path,
    )
    a, b = cfg.cameras
    assert a.analysis_fps == 3 and b.analysis_fps == 3
    assert a.targets == ["person"] and b.targets == ["cat"]
    assert b.display_name == "庭" and a.display_name == "a"
    assert cfg.web.port == 9000 and cfg.web.auth_user == "u"
    assert cfg.data_dir == tmp_path / "d"
    assert cfg.detector.model == str(tmp_path / "models/m.onnx")


@pytest.mark.parametrize(
    "raw",
    [
        {"cameras": [{"id": "a", "url": "x"}, {"id": "a", "url": "y"}]},  # 重複
        {"cameras": [{"id": "bad id", "url": "x"}]},  # 不正な id
        {"cameras": [{"id": "a", "url": "x", "unknown_key": 1}]},  # 綴り間違い
        {"cameras": [{"id": "a", "url": "x", "mask": [[0, 0, 2, 1]]}]},  # mask の範囲外
        {"defaults": {"url": "x"}},  # defaults に url は書けない
        {"cameras": [{"id": "a", "url": "x", "rotate": 45}]},  # rotate は 90 度単位
        {"typo": 1},
    ],
)
def test_invalid_configs(raw):
    with pytest.raises(ConfigError):
        parse_config(raw)


def test_rotate_swaps_analysis_size():
    cfg = parse_config({"cameras": [{"id": "a", "url": "x", "rotate": 90}, {"id": "b", "url": "y", "rotate": 180}]})
    a, b = cfg.cameras
    assert a.analysis_size == (360, 640)
    assert b.analysis_size == (640, 360)


def test_single_camera_uses_defaults():
    cfg = parse_config({"defaults": {"analysis_fps": 2}, "cameras": [{"id": "a", "url": "x"}]})
    cfg = single_camera(cfg, "rtsp://cam/live")
    assert [c.id for c in cfg.cameras] == ["cam1"]
    assert cfg.cameras[0].analysis_fps == 2


def test_example_config_parses():
    import tomllib

    path = Path(__file__).parent.parent / "config.example.toml"
    cfg = parse_config(tomllib.loads(path.read_text()), base_dir=path.parent)
    assert len(cfg.cameras) == 2


def test_segment_dir_is_relative_to_config(tmp_path):
    assert parse_config({}, base_dir=tmp_path).segment_dir is None
    assert parse_config({"segment_dir": "seg"}, base_dir=tmp_path).segment_dir == tmp_path / "seg"
    assert parse_config({"segment_dir": "/abs/seg"}, base_dir=tmp_path).segment_dir == Path("/abs/seg")


def test_default_segment_dir_prefers_shm(tmp_path):
    shm = tmp_path / "shm"
    data = tmp_path / "data"
    assert default_segment_dir(data, shm=shm) == data / "segments"  # /dev/shm がない(macOS など)
    shm.mkdir()
    assert default_segment_dir(data, shm=shm) == shm / "atom-watch"

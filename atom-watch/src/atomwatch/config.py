"""設定の読み込み。

TOML の `[defaults]` を全カメラの既定値とし、`[[cameras]]` の各要素で上書きして
`CameraConfig` を作る。綴り間違いに気付けるよう、未知のキーはエラーにする。
"""

from __future__ import annotations

import os
import re
import tomllib
from dataclasses import dataclass, field, fields, replace
from pathlib import Path
from typing import Any

DEFAULT_TARGETS = ["person", "cat", "dog", "bird", "car", "bicycle", "motorcycle"]


class ConfigError(Exception):
    pass


@dataclass(frozen=True)
class CameraConfig:
    id: str
    url: str
    name: str = ""
    enabled: bool = True
    # 解析用フレーム(ffmpeg で縮小・間引きして受け取る)
    analysis_width: int = 640
    analysis_height: int = 360
    analysis_fps: float = 5.0
    # 映像を時計回りに回す角度(0/90/180/270)。縦置き・逆さ付けのカメラ用。解析・ライブ・録画のすべてに効く
    # analysis_width/height は回転前(カメラの向きのまま)のサイズ、mask は回転後の画面での位置
    rotate: int = 0
    # ffmpeg 入力まわり
    hwaccel: str = ""  # "videotoolbox"(Mac) / "v4l2m2m" 系(ラズパイ)など。空なら使わない
    rtsp_transport: str = "tcp"
    input_args: list[str] = field(default_factory=list)  # 上級者向け: -i の前に足す ffmpeg 引数
    record_audio: bool = True
    segment_seconds: int = 2
    # 動き検知
    mask: list[list[float]] = field(default_factory=list)  # 無視する領域 [x, y, w, h](0〜1)
    min_area: float = 0.003  # 動いた領域の最小面積(画面比)
    lighting_change_ratio: float = 0.6  # これ以上が一度に変わったら照明変化とみなす
    motion_sensitivity: float = 25.0  # MOG2 の varThreshold。小さいほど敏感
    # 物体検出
    detect_interval: float = 0.5  # 動きがある間の推論間隔(秒)
    targets: list[str] = field(default_factory=lambda: list(DEFAULT_TARGETS))
    min_confidence: float = 0.4
    min_hits: int = 2  # イベント確定に必要な検出回数
    require_overlap: bool = True  # 検出枠が動き領域と重なるものだけ数える
    keep_unclassified: bool = False  # 対象物が検出されなかった動きも motion タグで残す
    # イベントの区切り
    pre_roll: float = 5.0
    post_roll: float = 5.0
    max_event: float = 300.0

    @property
    def display_name(self) -> str:
        return self.name or self.id

    @property
    def analysis_size(self) -> tuple[int, int]:
        """回転後の解析フレームの (幅, 高さ)。"""
        if self.rotate in (90, 270):
            return self.analysis_height, self.analysis_width
        return self.analysis_width, self.analysis_height


@dataclass(frozen=True)
class DetectorConfig:
    model: str = "models/yolox_nano.onnx"
    workers: int = 1
    threads: int = 0  # ONNX Runtime のスレッド数。0 なら自動
    nms_threshold: float = 0.45


@dataclass(frozen=True)
class WebConfig:
    host: str = "0.0.0.0"
    port: int = 8080
    auth_user: str = ""
    auth_password: str = ""


@dataclass(frozen=True)
class RetentionConfig:
    days: float = 14
    max_gb: float = 20
    keep_starred: bool = True


@dataclass(frozen=True)
class Config:
    data_dir: Path
    cameras: list[CameraConfig]
    detector: DetectorConfig = DetectorConfig()
    web: WebConfig = WebConfig()
    retention: RetentionConfig = RetentionConfig()
    recorder_workers: int = 1
    # 録画素材(セグメント)の置き場所。None なら default_segment_dir で決める
    segment_dir: Path | None = None
    # [defaults] の生の値。--url で 1 台構成にするときにも既定値を効かせるために保持する
    camera_defaults: dict[str, Any] = field(default_factory=dict)


_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,32}$")
_CAMERA_KEYS = {f.name for f in fields(CameraConfig)}


def _check_keys(section: str, data: dict[str, Any], allowed: set[str]) -> None:
    unknown = set(data) - allowed
    if unknown:
        raise ConfigError(f"[{section}] に未知のキーがあります: {', '.join(sorted(unknown))}")


def _build(cls, section: str, data: dict[str, Any]):
    allowed = {f.name for f in fields(cls)}
    _check_keys(section, data, allowed)
    return cls(**data)


def _validate_camera(cam: CameraConfig) -> None:
    if not _ID_RE.match(cam.id):
        raise ConfigError(f"カメラ id '{cam.id}' は英数字・_・- の 1〜32 文字にしてください")
    if not cam.url:
        raise ConfigError(f"カメラ '{cam.id}' の url がありません")
    for region in cam.mask:
        if len(region) != 4 or not all(0.0 <= float(v) <= 1.0 for v in region):
            raise ConfigError(f"カメラ '{cam.id}' の mask は [x, y, w, h](0〜1)の配列で指定してください")
    if cam.analysis_fps <= 0 or cam.analysis_width <= 0 or cam.analysis_height <= 0:
        raise ConfigError(f"カメラ '{cam.id}' の解析解像度/fps が不正です")
    if cam.analysis_width % 2 or cam.analysis_height % 2:
        raise ConfigError(f"カメラ '{cam.id}' の解析解像度は偶数にしてください")
    if cam.rotate not in (0, 90, 180, 270):
        raise ConfigError(f"カメラ '{cam.id}' の rotate は 0・90・180・270 のどれかにしてください")


def parse_config(raw: dict[str, Any], base_dir: Path = Path(".")) -> Config:
    top_keys = {"data_dir", "segment_dir", "recorder_workers", "defaults", "cameras", "detector", "web", "retention"}
    _check_keys("(トップレベル)", raw, top_keys)

    defaults = dict(raw.get("defaults", {}))
    _check_keys("defaults", defaults, _CAMERA_KEYS - {"id", "url", "name", "enabled"})

    cameras: list[CameraConfig] = []
    seen: set[str] = set()
    for i, cam_raw in enumerate(raw.get("cameras", [])):
        _check_keys(f"cameras[{i}]", cam_raw, _CAMERA_KEYS)
        cam = CameraConfig(**{**defaults, **cam_raw})
        _validate_camera(cam)
        if cam.id in seen:
            raise ConfigError(f"カメラ id '{cam.id}' が重複しています")
        seen.add(cam.id)
        cameras.append(cam)

    web_raw = dict(raw.get("web", {}))
    auth = web_raw.pop("auth", {})
    _check_keys("web.auth", auth, {"user", "password"})
    web_raw["auth_user"] = auth.get("user", "")
    web_raw["auth_password"] = auth.get("password", "")

    detector = _build(DetectorConfig, "detector", dict(raw.get("detector", {})))
    model = Path(detector.model)
    if not model.is_absolute():
        detector = replace(detector, model=str(base_dir / model))
    data_dir = Path(raw.get("data_dir", "data"))
    if not data_dir.is_absolute():
        data_dir = base_dir / data_dir
    segment_dir = Path(raw["segment_dir"]) if raw.get("segment_dir") else None
    if segment_dir is not None and not segment_dir.is_absolute():
        segment_dir = base_dir / segment_dir

    return Config(
        data_dir=data_dir,
        cameras=cameras,
        detector=detector,
        web=_build(WebConfig, "web", web_raw),
        retention=_build(RetentionConfig, "retention", dict(raw.get("retention", {}))),
        recorder_workers=int(raw.get("recorder_workers", 1)),
        segment_dir=segment_dir,
        camera_defaults=defaults,
    )


def default_segment_dir(data_dir: Path, shm: Path = Path("/dev/shm")) -> Path:
    """セグメントの既定の置き場所。

    セグメントは数秒ごとに書いては消すだけの一時ファイルなので、使えるならメモリ上の /dev/shm(tmpfs)に置き、
    SD カードの書き込みを減らす。/dev/shm がない環境(macOS など)では data_dir の下に置く。
    """
    if shm.is_dir() and os.access(shm, os.W_OK):
        return shm / "atom-watch"
    return data_dir / "segments"


def load_config(path: Path | None) -> Config:
    """設定ファイルを読む。path が None なら既定値だけ(カメラなし)の設定を返す。"""
    if path is None:
        return parse_config({})
    with open(path, "rb") as f:
        raw = tomllib.load(f)
    # 相対パスは設定ファイルの置き場所を基準に解決する
    return parse_config(raw, base_dir=path.resolve().parent)


def single_camera(config: Config, url: str) -> Config:
    """--url 指定時: 設定ファイルのカメラ定義を無視し、cam1 の 1 台構成にする。"""
    cam = CameraConfig(**{**config.camera_defaults, "id": "cam1", "url": url})
    _validate_camera(cam)
    return replace(config, cameras=[cam])

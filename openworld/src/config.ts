/** ゲーム全体の定数。調整値はここに集約する。 */
export const CONFIG = {
  /** 固定ステップ (秒) */
  fixedDt: 1 / 60,

  chunk: {
    /** 1 チャンクの一辺 (m)。world.json の cellSize で割り切れること */
    size: 64,
    /** 詳細メッシュを置く半径（チャンク数） */
    renderRadius: 6,
    /** 当たり判定を置く半径（チャンク数）。プレイヤーの周囲だけ */
    physicsRadius: 1,
    /** 1 フレームで新しく作る詳細メッシュ数の上限 */
    buildsPerFrame: 3,
    /** 遠景メッシュの間引き（何セルごとに 1 頂点か） */
    farStep: 8,
  },

  player: {
    radius: 0.4,
    /** カプセルの円筒部の半分の高さ。全高 = 2 * (halfHeight + radius) */
    halfHeight: 0.5,
    walkSpeed: 6,
    sprintSpeed: 11,
    swimSpeed: 3.5,
    jumpSpeed: 9,
    gravity: 24,
    groundAccel: 14,
    airAccel: 3,
    maxSlopeDeg: 50,
    stepHeight: 0.5,
  },

  camera: {
    fov: 60,
    far: 6000,
    distance: 7,
    minDistance: 2.5,
    maxDistance: 25,
    minPitch: -0.35,
    maxPitch: 1.3,
    sensitivity: 0.0025,
    targetHeight: 1.6,
  },

  freeCamera: { speed: 40, fastMultiplier: 5 },

  time: {
    /** ゲーム内 1 日の長さ（実時間の秒） */
    dayLength: 720,
    startHour: 9,
  },

  fog: { near: 300, far: 2400 },
  shadow: { size: 2048, extent: 70 },
} as const;

/**
 * 手続きアニメーションのポーズ（three 非依存の純関数）。
 *
 * ポーズは「チャンネル名 → 値」の表。値は関節の回転（ラジアン）か、hipsY（腰の上下 m）など。
 * キャラクターは +Z を向く。符号の約束:
 * - 脚・腕の .x: 負 = 前へ振る、正 = 後ろへ振る
 * - 膝 (shin.x): 正 = 曲げる（足先が後ろへ）。肘 (lowerArm.x): 負 = 曲げる（手が前へ）
 * - 背骨 (spine.x / chest.x): 正 = 前かがみ
 * - 腕の .z: 左腕は正、右腕は負で体から離れる
 */

export type Pose = Record<string, number>;

const TAU = Math.PI * 2;
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
export const smoothstep = (e0: number, e1: number, x: number) => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

/** 重み付きでポーズを足し合わせる（無いチャンネルは 0 とみなす） */
export function blend(parts: [Pose, number][]): Pose {
  const out: Pose = {};
  for (const [pose, w] of parts) {
    if (w <= 0) continue;
    for (const k in pose) out[k] = (out[k] ?? 0) + pose[k] * w;
  }
  return out;
}

/** 腕を自然に下ろした基本姿勢 */
const REST: Pose = {
  'upperArmL.z': 0.12,
  'upperArmR.z': -0.12,
  'lowerArmL.x': -0.15,
  'lowerArmR.x': -0.15,
  'capeU.x': 0.06,
};

export function idle(t: number): Pose {
  const breath = Math.sin(t * 2.1);
  const sway = Math.sin(t * 0.45);
  return {
    ...REST,
    hipsY: 0.004 * breath,
    'hips.z': 0.025 * sway,
    'spine.z': -0.02 * sway,
    'chest.x': 0.025 * breath,
    'head.y': 0.18 * Math.sin(t * 0.31) * Math.sin(t * 0.17),
    'head.x': 0.03 * Math.sin(t * 0.23),
    'upperArmL.z': 0.12 + 0.015 * breath,
    'upperArmR.z': -0.12 - 0.015 * breath,
    'thighL.z': 0.03,
    'thighR.z': -0.03,
  };
}

/** 歩行サイクル。phase はラジアン（2π で左右 1 歩ずつ） */
export function walk(phase: number): Pose {
  const s = Math.sin(phase);
  const c = Math.cos(phase);
  const swing = 0.42;
  return {
    ...REST,
    hipsY: 0.03 * (Math.abs(c) - 0.7),
    'hips.y': 0.12 * s,
    'hips.z': 0.04 * c,
    'spine.x': 0.05,
    'chest.y': -0.16 * s,
    'head.x': -0.04,
    'head.y': 0.04 * s,
    'thighL.x': -swing * s,
    'thighR.x': swing * s,
    'shinL.x': 0.1 + 0.85 * Math.max(0, c),
    'shinR.x': 0.1 + 0.85 * Math.max(0, -c),
    'footL.x': 0.25 * s - 0.15 * Math.max(0, c),
    'footR.x': -0.25 * s - 0.15 * Math.max(0, -c),
    'upperArmL.x': 0.38 * s,
    'upperArmR.x': -0.38 * s,
    'lowerArmL.x': -0.25 - 0.2 * Math.max(0, -s),
    'lowerArmR.x': -0.25 - 0.2 * Math.max(0, s),
    'capeU.x': 0.22 + 0.04 * Math.abs(c),
    'capeL.x': 0.08 * c,
  };
}

/** 走行サイクル */
export function run(phase: number): Pose {
  const s = Math.sin(phase);
  const c = Math.cos(phase);
  return {
    ...REST,
    hipsY: 0.06 * (Math.abs(c) - 0.6) - 0.03,
    'hips.y': 0.18 * s,
    'spine.x': 0.22,
    'chest.y': -0.28 * s,
    'chest.x': 0.05,
    'head.x': -0.2,
    'thighL.x': -0.8 * s - 0.15,
    'thighR.x': 0.8 * s - 0.15,
    'shinL.x': 0.35 + 1.45 * Math.max(0, c),
    'shinR.x': 0.35 + 1.45 * Math.max(0, -c),
    'footL.x': 0.35 * s,
    'footR.x': -0.35 * s,
    'upperArmL.x': 0.75 * s,
    'upperArmR.x': -0.75 * s,
    'upperArmL.z': 0.2,
    'upperArmR.z': -0.2,
    'lowerArmL.x': -1.35,
    'lowerArmR.x': -1.35,
    'capeU.x': 0.75 + 0.08 * Math.sin(phase * 2),
    'capeL.x': 0.35 + 0.15 * Math.sin(phase * 2 + 1),
  };
}

/** 跳び上がり中（上昇） */
export function jumpUp(): Pose {
  return {
    ...REST,
    hipsY: 0.02,
    'spine.x': -0.04,
    'head.x': -0.1,
    'thighL.x': -1.0,
    'shinL.x': 1.3,
    'footL.x': 0.2,
    'thighR.x': 0.15,
    'shinR.x': 0.55,
    'footR.x': 0.3,
    'upperArmL.x': -0.5,
    'upperArmR.x': 0.4,
    'upperArmL.z': 0.45,
    'upperArmR.z': -0.45,
    'lowerArmL.x': -0.6,
    'lowerArmR.x': -0.4,
    'capeU.x': 0.25,
    'capeL.x': -0.2,
  };
}

/** 落下中。t で手足を少し泳がせる */
export function fall(t: number): Pose {
  const w = Math.sin(t * 6);
  return {
    ...REST,
    'spine.x': -0.08,
    'head.x': 0.15,
    'thighL.x': -0.35 + 0.1 * w,
    'thighR.x': 0.1 - 0.1 * w,
    'shinL.x': 0.6,
    'shinR.x': 0.45,
    'thighL.z': 0.12,
    'thighR.z': -0.12,
    'upperArmL.x': -0.3,
    'upperArmR.x': -0.3,
    'upperArmL.z': 1.05 + 0.08 * w,
    'upperArmR.z': -1.05 + 0.08 * w,
    'lowerArmL.x': -0.3,
    'lowerArmR.x': -0.3,
    'capeU.x': 1.2 + 0.1 * w,
    'capeL.x': 0.4,
  };
}

/** 着地の沈み込み（加算用）。k = 0..1 */
export function landing(k: number): Pose {
  return {
    hipsY: -0.2 * k,
    'thighL.x': -0.55 * k,
    'thighR.x': -0.55 * k,
    'shinL.x': 1.1 * k,
    'shinR.x': 1.1 * k,
    'footL.x': -0.55 * k,
    'footR.x': -0.55 * k,
    'spine.x': 0.3 * k,
    'head.x': -0.2 * k,
    'upperArmL.x': -0.3 * k,
    'upperArmR.x': -0.3 * k,
    'upperArmL.z': 0.25 * k,
    'upperArmR.z': -0.25 * k,
  };
}

/** 平泳ぎ（体を水平にして進む）。phase は 2π で 1 かき */
export function swimStroke(phase: number): Pose {
  const s = Math.sin(phase);
  const pull = Math.max(0, s); // 腕をかく区間
  const reach = Math.max(0, -s); // 腕を前へ伸ばす区間
  const kick = Math.max(0, Math.sin(phase + 1.2));
  return {
    rootPitch: 1.3,
    hipsY: 0,
    'head.x': -0.95,
    'neck.x': -0.2,
    'upperArmL.x': -2.7 + 0.9 * pull,
    'upperArmR.x': -2.7 + 0.9 * pull,
    'upperArmL.z': 0.25 + 1.0 * pull,
    'upperArmR.z': -0.25 - 1.0 * pull,
    'lowerArmL.x': -0.2 - 0.9 * pull + 0.1 * reach,
    'lowerArmR.x': -0.2 - 0.9 * pull + 0.1 * reach,
    'thighL.x': -0.1 - 0.6 * (1 - kick),
    'thighR.x': -0.1 - 0.6 * (1 - kick),
    'thighL.z': 0.1 + 0.4 * (1 - kick),
    'thighR.z': -0.1 - 0.4 * (1 - kick),
    'shinL.x': 0.2 + 1.3 * (1 - kick),
    'shinR.x': 0.2 + 1.3 * (1 - kick),
    'footL.x': 0.6,
    'footR.x': 0.6,
    // 体が水平なのでマントは背中に沿って後ろへ流す
    'capeU.x': -0.1,
    'capeL.x': 0.15 * Math.sin(phase * 2),
  };
}

/** 立ち泳ぎ */
export function treadWater(t: number): Pose {
  const a = Math.sin(t * 2.4);
  const b = Math.sin(t * 2.4 + Math.PI);
  return {
    hipsY: 0.03 * Math.sin(t * 4.8),
    'spine.x': 0.08,
    'head.x': -0.08,
    'thighL.x': -0.4 + 0.3 * a,
    'thighR.x': -0.4 + 0.3 * b,
    'shinL.x': 0.8 + 0.4 * b,
    'shinR.x': 0.8 + 0.4 * a,
    'upperArmL.x': -0.5,
    'upperArmR.x': -0.5,
    'upperArmL.z': 0.75 + 0.3 * a,
    'upperArmR.z': -0.75 - 0.3 * a,
    'lowerArmL.x': -0.5,
    'lowerArmR.x': -0.5,
    'capeU.x': 0.9,
    'capeL.x': 0.3,
  };
}

export const CYCLE = TAU;

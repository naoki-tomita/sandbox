/**
 * 馬の手続きアニメーション（three 非依存の純関数）。ポーズの形式は人型と同じ（player/character/poses.ts）。
 *
 * 馬は +Z を向く。脚は 4 本で、それぞれ upper（肩・股）→ lower（膝・飛節）→ hoof（球節）の 3 関節。
 * 脚の名前: fl = 左前, fr = 右前, hl = 左後, hr = 右後。
 * 符号の約束（人型と同じ）: 脚の .x は負 = 前へ振る、正 = 後ろへ振る。
 * - 前脚の膝 (lower.x): 正 = 曲げる（蹄が後ろへ）
 * - 後脚の飛節 (lower.x): 負 = 曲げる（蹄が前へ）
 * - neck.x: 正 = 首を前へ倒す（下げる）。head.x: 正 = 鼻先を下げる
 * - bodyY: 胴の上下 (m)。bodyPitch: 正 = 前のめり
 */
import { blend, smoothstep, type Pose } from '../player/character/poses.ts';

export type Leg = 'fl' | 'fr' | 'hl' | 'hr';
export const LEGS: Leg[] = ['fl', 'fr', 'hl', 'hr'];

/** 立っているときの脚の角度（後脚は股から斜め後ろへ下り、飛節で垂直に戻る） */
const LEG_REST: Pose = {
  'hl.upper.x': 0.28,
  'hr.upper.x': 0.28,
  'hl.lower.x': -0.38,
  'hr.lower.x': -0.38,
  'hl.hoof.x': 0.1,
  'hr.hoof.x': 0.1,
};

/** 首と頭の基本の角度（首は斜め前へ立ち、顔は下を向く） */
const NECK_REST = 0.62;
const HEAD_REST = 0.3;

interface Gait {
  /** 各脚の位相のずれ (0..1) */
  offsets: Record<Leg, number>;
  /** 接地している割合 */
  duty: number;
  /** 脚を振る角度 (rad) */
  swing: number;
  /** 振り出すときの膝の曲げ (rad) */
  lift: number;
}

/** 常歩（なみあし）: 4 拍。左後 → 左前 → 右後 → 右前 */
const WALK: Gait = { offsets: { hl: 0, fl: 0.25, hr: 0.5, fr: 0.75 }, duty: 0.62, swing: 0.36, lift: 0.75 };
/** 速歩（はやあし）: 対角の 2 本ずつ */
const TROT: Gait = { offsets: { fl: 0, hr: 0, fr: 0.5, hl: 0.5 }, duty: 0.45, swing: 0.45, lift: 1.1 };
/** 襲歩（しゅうほ）: 後ろ 2 本 → 前 2 本の順に大きく伸び縮みする */
const GALLOP: Gait = { offsets: { hl: 0, hr: 0.1, fl: 0.42, fr: 0.52 }, duty: 0.32, swing: 0.62, lift: 1.4 };

/** 1 周期（4 本が 1 歩ずつ）で進む距離 (m)。速いほど歩幅が広い */
export function strideLength(speed: number): number {
  return 1.7 + 0.28 * speed;
}

/** 速さ (m/s) に対する各歩法の重み */
export function gaitWeights(speed: number): { walk: number; trot: number; gallop: number } {
  const trotIn = smoothstep(2.6, 4.2, speed);
  const gallopIn = smoothstep(9, 12, speed);
  return { walk: 1 - trotIn, trot: trotIn * (1 - gallopIn), gallop: gallopIn };
}

/** 1 本の脚の角度。p は位相 (0..1) */
function legAngles(leg: Leg, p: number, g: Gait): Pose {
  const front = leg[0] === 'f';
  let upper: number;
  let bend = 0;
  if (p < g.duty) {
    // 接地中: 前から後ろへ一定の速さで掻く
    upper = -g.swing + (2 * g.swing * p) / g.duty;
  } else {
    // 振り出し: 後ろから前へ戻しつつ膝を曲げる
    const s = (p - g.duty) / (1 - g.duty);
    upper = g.swing * Math.cos(Math.PI * s);
    bend = Math.sin(Math.PI * Math.min(1, s * 1.15));
  }
  return front
    ? {
        [`${leg}.upper.x`]: upper,
        [`${leg}.lower.x`]: g.lift * bend,
        [`${leg}.hoof.x`]: 0.9 * g.lift * bend,
      }
    : {
        [`${leg}.upper.x`]: upper * 0.9 - 0.25 * g.lift * bend,
        [`${leg}.lower.x`]: -0.7 * g.lift * bend,
        [`${leg}.hoof.x`]: 0.8 * g.lift * bend,
      };
}

function gaitLegs(phase: number, g: Gait): Pose {
  const out: Pose = {};
  for (const leg of LEGS) {
    const p = (((phase + g.offsets[leg]) % 1) + 1) % 1;
    Object.assign(out, legAngles(leg, p, g));
  }
  return out;
}

/** 立ち姿（息づかい・耳・尻尾の揺れ。graze = 1 で草を食む） */
export function horseIdle(t: number, graze = 0): Pose {
  const breath = Math.sin(t * 1.6);
  const swish = Math.sin(t * 2.3) * Math.max(0, Math.sin(t * 0.37));
  const chew = graze * Math.sin(t * 7) * 0.04;
  return {
    ...LEG_REST,
    bodyY: 0.006 * breath,
    'neck.x': NECK_REST + graze * 1.05 + 0.02 * breath,
    'neck.y': 0.12 * Math.sin(t * 0.21) * (1 - graze),
    'head.x': HEAD_REST + graze * 0.25 + chew,
    'tail.x': 0.1,
    'tail.y': 0.35 * swish,
    'tail.z': 0.05 * Math.sin(t * 0.9),
    'ear.x': 0.15 * Math.max(0, Math.sin(t * 0.53)),
    // 時々、後脚の片方を休める
    'hr.lower.x': -0.38 - 0.25 * smoothstep(0.6, 0.9, Math.sin(t * 0.11)),
    'hr.hoof.x': 0.1 + 0.4 * smoothstep(0.6, 0.9, Math.sin(t * 0.11)),
  };
}

/** 常歩。首をうなずくように振る */
export function horseWalk(phase: number): Pose {
  const a = phase * Math.PI * 2;
  return blend([
    [LEG_REST, 1],
    [
      {
        ...gaitLegs(phase, WALK),
        bodyY: 0.018 * Math.cos(a * 2),
        bodyRoll: 0.02 * Math.sin(a),
        'neck.x': NECK_REST + 0.06 + 0.07 * Math.sin(a * 2),
        'head.x': HEAD_REST + 0.05 - 0.04 * Math.sin(a * 2),
        'tail.x': 0.15,
        'tail.y': 0.12 * Math.sin(a),
      },
      1,
    ],
  ]);
}

/** 速歩。2 拍で胴が上下に弾む */
export function horseTrot(phase: number): Pose {
  const a = phase * Math.PI * 2;
  return blend([
    [LEG_REST, 1],
    [
      {
        ...gaitLegs(phase, TROT),
        bodyY: 0.05 * Math.cos(a * 2),
        'neck.x': NECK_REST - 0.05 + 0.03 * Math.cos(a * 2),
        'head.x': HEAD_REST + 0.1,
        'tail.x': 0.4,
        'tail.y': 0.06 * Math.sin(a),
      },
      1,
    ],
  ]);
}

/** 襲歩。胴が前後に揺れ、首を前へ伸ばす */
export function horseGallop(phase: number): Pose {
  const a = phase * Math.PI * 2;
  return blend([
    [LEG_REST, 1],
    [
      {
        ...gaitLegs(phase, GALLOP),
        bodyY: 0.09 * Math.cos(a - 0.6),
        bodyPitch: 0.07 * Math.sin(a - 0.3),
        'neck.x': NECK_REST + 0.32 + 0.12 * Math.sin(a + 0.8),
        'head.x': HEAD_REST - 0.12,
        'tail.x': 1.05 + 0.1 * Math.sin(a),
        'tail.y': 0.08 * Math.sin(a * 2),
        'ear.x': 0.35,
      },
      1,
    ],
  ]);
}

/** 跳躍。k = 0..1（踏み切り → 空中 → 着地） */
export function horseJump(k: number): Pose {
  const tuck = Math.sin(Math.PI * Math.min(1, Math.max(0, k)));
  return {
    ...LEG_REST,
    bodyPitch: -0.22 * Math.cos(Math.PI * k),
    'fl.upper.x': -0.9 * tuck,
    'fr.upper.x': -0.85 * tuck,
    'fl.lower.x': 1.9 * tuck,
    'fr.lower.x': 1.85 * tuck,
    'fl.hoof.x': 0.6 * tuck,
    'fr.hoof.x': 0.6 * tuck,
    'hl.upper.x': 0.28 + 0.55 * tuck,
    'hr.upper.x': 0.28 + 0.6 * tuck,
    'hl.lower.x': -0.38 - 0.3 * tuck,
    'hr.lower.x': -0.38 - 0.3 * tuck,
    'hl.hoof.x': 0.1 + 0.5 * tuck,
    'hr.hoof.x': 0.1 + 0.5 * tuck,
    'neck.x': NECK_REST + 0.25 * tuck,
    'head.x': HEAD_REST,
    'tail.x': 1.1,
    'ear.x': 0.3,
  };
}

/**
 * 乗り手の姿勢（人型のポーズ）。鞍にまたがり、手綱を握る。
 * bounce は馬の胴の上下 (m)、gallop は襲歩の重み、jump は跳躍中の重み。
 */
export function riderPose(t: number, bounce: number, gallop: number, jump: number): Pose {
  const lean = 0.08 + 0.32 * gallop + 0.25 * jump;
  return {
    hipsY: -0.35 * bounce,
    'hips.x': -0.05,
    'spine.x': lean * 0.6,
    'chest.x': lean * 0.4 + 0.02 * Math.sin(t * 1.7),
    'head.x': -lean * 0.8,
    // 腿は斜め前下へ開いて胴をはさみ、すねは真下へ（あぶみに足を掛ける）
    'thighL.x': -0.8 - 0.15 * gallop,
    'thighR.x': -0.8 - 0.15 * gallop,
    'thighL.z': 0.62,
    'thighR.z': -0.62,
    'shinL.x': 0.85 + 0.2 * gallop,
    'shinR.x': 0.85 + 0.2 * gallop,
    'shinL.z': -0.45,
    'shinR.z': 0.45,
    'footL.x': -0.15,
    'footR.x': -0.15,
    'upperArmL.x': -0.5 - 0.25 * gallop,
    'upperArmR.x': -0.5 - 0.25 * gallop,
    'upperArmL.z': 0.18,
    'upperArmR.z': -0.18,
    'lowerArmL.x': -0.85 + 0.2 * gallop,
    'lowerArmR.x': -0.85 + 0.2 * gallop,
    'lowerArmL.y': -0.3,
    'lowerArmR.y': 0.3,
    'capeU.x': 0.3 + 0.9 * gallop,
    'capeL.x': 0.15 + 0.3 * gallop + 0.1 * Math.sin(t * 9) * gallop,
  };
}

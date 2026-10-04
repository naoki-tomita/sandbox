/**
 * 馬の状態（速さ・接地・上下の速さ）から毎フレームのポーズを合成する（three 非依存）。
 * 脚の周期は進んだ距離に合わせて回す（蹄が地面を滑らない）。
 */
import { blend, smoothstep, type Pose } from '../player/character/poses.ts';
import { gaitWeights, horseGallop, horseIdle, horseJump, horseTrot, horseWalk, strideLength } from './horsePoses.ts';

export interface HorseAnimInput {
  dt: number;
  /** 水平方向の速さ (m/s) */
  speed: number;
  /** 上下方向の速さ (m/s) */
  vy: number;
  airborne: boolean;
  /** 乗り手がいない（立ち止まっていると草を食む） */
  idleFree: boolean;
  /** 跳躍の初速（空中ポーズの進み具合の計算用） */
  jumpSpeed: number;
}

const approach = (cur: number, target: number, rate: number, dt: number) => cur + (target - cur) * (1 - Math.exp(-rate * dt));

export class HorseAnimator {
  phase = 0;
  time = 0;
  private move = 0;
  private air = 0;
  private graze = 0;
  /** 草を食み始めるまでの静止時間 */
  private still = 0;
  /** 直近のポーズの胴の上下（乗り手の姿勢に使う） */
  bounce = 0;
  /** 襲歩の重み（乗り手の前傾に使う） */
  gallop = 0;
  /** 空中の重み */
  airWeight = 0;

  constructor(seed = 0) {
    // 何頭もいるときに動きがそろわないよう、時間をずらす
    this.time = seed * 7.3;
  }

  update(input: HorseAnimInput): Pose {
    const { dt, speed, vy } = input;
    this.time += dt;
    this.move = approach(this.move, smoothstep(0.1, 0.9, speed), 8, dt);
    this.air = approach(this.air, input.airborne ? 1 : 0, 12, dt);
    if (!input.airborne) this.phase = (this.phase + (dt * speed) / strideLength(speed)) % 1000;

    // 乗り手がいなくて立ち止まっていると、しばらくして草を食む（20 秒周期で 8 秒ほど）
    this.still = speed < 0.2 && input.idleFree ? this.still + dt : 0;
    const wantsGraze = this.still > 4 && this.time % 20 < 8;
    this.graze = approach(this.graze, wantsGraze ? 1 : 0, 1.5, dt);

    const w = gaitWeights(speed);
    const moving = blend([
      [horseWalk(this.phase), w.walk],
      [horseTrot(this.phase), w.trot],
      [horseGallop(this.phase), w.gallop],
    ]);
    const k = 0.5 - vy / (2 * Math.max(1, input.jumpSpeed));
    const pose = blend([
      [horseIdle(this.time, this.graze), (1 - this.move) * (1 - this.air)],
      [moving, this.move * (1 - this.air)],
      [horseJump(Math.min(1, Math.max(0, k))), this.air],
    ]);
    this.bounce = pose.bodyY ?? 0;
    this.gallop = w.gallop * this.move * (1 - this.air);
    this.airWeight = this.air;
    return pose;
  }
}

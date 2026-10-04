/**
 * キャラクターの状態（速度・接地・泳ぎ）から、毎フレームのポーズを合成する（three 非依存）。
 * 状態の切り替えはブレンド重みを滑らかに動かして行い、着地の沈み込みは加算で重ねる。
 */
import { blend, fall, idle, jumpUp, landing, run, smoothstep, swimStroke, treadWater, walk, type Pose } from './poses.ts';

export type Locomotion = 'ground' | 'air' | 'swim';

export interface AnimInput {
  dt: number;
  /** 水平方向の速さ (m/s) */
  speed: number;
  /** 上下方向の速さ (m/s) */
  vy: number;
  mode: Locomotion;
  /** 向き (ラジアン)。旋回時の体の傾きに使う */
  facing: number;
}

/** 1 周期（左右 1 歩ずつ）で進む距離 (m)。速いほど歩幅が広い */
const strideLength = (speed: number) => 1.5 + 0.11 * speed;

const approach = (cur: number, target: number, rate: number, dt: number) => cur + (target - cur) * (1 - Math.exp(-rate * dt));

export class CharacterAnimator {
  /** 歩行・走行の位相 */
  phase = 0;
  /** 泳ぎの位相 */
  swimPhase = 0;
  time = 0;
  private air = 0;
  private swim = 0;
  private move = 0;
  private runW = 0;
  private up = 0;
  private land = 0;
  private bank = 0;
  private prevMode: Locomotion = 'ground';
  private prevVy = 0;
  private prevFacing: number | null = null;

  update(input: AnimInput): Pose {
    const { dt, speed, vy, mode } = input;
    this.time += dt;

    // 着地: 空中から接地に変わった瞬間、落下速度に応じた沈み込みを入れる
    if (this.prevMode === 'air' && mode === 'ground' && this.prevVy < -3) {
      this.land = Math.max(this.land, Math.min(1, 0.3 + -this.prevVy / 18));
    }
    this.land *= Math.exp(-7 * dt);
    this.prevMode = mode;
    this.prevVy = vy;

    this.air = approach(this.air, mode === 'air' ? 1 : 0, 10, dt);
    this.swim = approach(this.swim, mode === 'swim' ? 1 : 0, 6, dt);
    this.move = approach(this.move, smoothstep(0.15, 1.2, speed), 10, dt);
    this.runW = approach(this.runW, smoothstep(4, 9, speed), 6, dt);
    this.up = approach(this.up, smoothstep(-1.5, 2, vy), 12, dt);

    if (mode === 'swim') {
      this.swimPhase += dt * (1.8 + 0.6 * speed);
    } else {
      // 地面を滑らないよう、進んだ距離に合わせて脚を回す（空中では惰性で少し回す）
      const rate = mode === 'ground' ? speed / strideLength(speed) : 0.3;
      this.phase = (this.phase + dt * rate * Math.PI * 2) % (Math.PI * 2 * 1000);
    }

    // 旋回時に内側へ傾ける
    let turnRate = 0;
    if (this.prevFacing !== null && dt > 0) {
      const d = Math.atan2(Math.sin(input.facing - this.prevFacing), Math.cos(input.facing - this.prevFacing));
      turnRate = d / dt;
    }
    this.prevFacing = input.facing;
    const bankTarget = mode === 'ground' ? Math.max(-0.3, Math.min(0.3, turnRate * speed * 0.03)) : 0;
    this.bank = approach(this.bank, bankTarget, 8, dt);

    const ground = blend([
      [idle(this.time), 1 - this.move],
      [walk(this.phase), this.move * (1 - this.runW)],
      [run(this.phase), this.move * this.runW],
    ]);
    const airborne = blend([
      [jumpUp(), this.up],
      [fall(this.time), 1 - this.up],
    ]);
    const stroke = smoothstep(0.4, 1.5, speed);
    const water = blend([
      [swimStroke(this.swimPhase), stroke],
      [treadWater(this.time), 1 - stroke],
    ]);
    const onLand = 1 - this.swim;
    const pose = blend([
      [ground, onLand * (1 - this.air)],
      [airborne, onLand * this.air],
      [water, this.swim],
      [landing(this.land), 1],
    ]);
    // 左旋回 (facing 増加) では左 (+X) へ傾く = Z 軸回りは負
    pose.rootRoll = (pose.rootRoll ?? 0) - this.bank;
    // まばたき（約 3.5 秒ごとに 0.12 秒）
    pose.blink = this.time % 3.5 < 0.12 ? 1 : 0;
    return pose;
  }
}

import * as THREE from 'three';
import { CONFIG } from '../config.ts';
import type { Input } from '../core/Input.ts';
import { RAPIER, type Physics } from '../physics/Physics.ts';
import type { ComposedWorld } from '../worldgen/compose.ts';

export type MoveMode = 'ground' | 'air' | 'swim';

/**
 * プレイヤーの移動。Rapier のキネマティック・キャラクターコントローラで地形や配置物と衝突させる。
 * 位置 (position) は足元。
 */
export class PlayerController {
  readonly position = new THREE.Vector3();
  private readonly prev = new THREE.Vector3();
  readonly velocity = new THREE.Vector3();
  /** 見た目の向き (ラジアン)。0 = +Z */
  facing = 0;
  mode: MoveMode = 'air';
  /** 馬に乗っている（当たり判定を切り、位置は馬に合わせる） */
  mounted = false;

  private readonly body: RAPIER.RigidBody;
  private readonly collider: RAPIER.Collider;
  private readonly controller: RAPIER.KinematicCharacterController;
  private readonly centerOffset: number;

  constructor(
    physics: Physics,
    private readonly world: ComposedWorld,
  ) {
    const p = CONFIG.player;
    this.centerOffset = p.halfHeight + p.radius;
    this.body = physics.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased());
    this.collider = physics.world.createCollider(RAPIER.ColliderDesc.capsule(p.halfHeight, p.radius), this.body);
    this.controller = physics.world.createCharacterController(0.03);
    this.controller.setMaxSlopeClimbAngle((p.maxSlopeDeg * Math.PI) / 180);
    this.controller.setMinSlopeSlideAngle(((p.maxSlopeDeg + 5) * Math.PI) / 180);
    this.controller.enableAutostep(p.stepHeight, 0.3, false);
    this.controller.enableSnapToGround(0.5);
    this.controller.setSlideEnabled(true);
  }

  get excludeCollider(): RAPIER.Collider {
    return this.collider;
  }

  /** 地面の上（y を指定すればその高さ）に置き直す（スポーン・テレポート・下馬） */
  teleport(x: number, z: number, facing = this.facing, y = this.world.heights.sample(x, z) + 0.2): void {
    this.position.set(x, y, z);
    this.prev.copy(this.position);
    this.velocity.set(0, 0, 0);
    this.facing = facing;
    this.body.setTranslation({ x, y: y + this.centerOffset, z }, true);
  }

  /** 馬に乗る / 降りる */
  setMounted(mounted: boolean): void {
    this.mounted = mounted;
    this.collider.setEnabled(!mounted);
    this.velocity.set(0, 0, 0);
    this.mode = mounted ? 'ground' : 'air';
  }

  /** 乗馬中: 位置を馬の足元に合わせる（HUD・当たり判定の範囲・カメラの基準になる） */
  follow(pos: THREE.Vector3, velocity: THREE.Vector3, facing: number): void {
    this.prev.copy(this.position);
    this.position.copy(pos);
    this.velocity.copy(velocity);
    this.facing = facing;
    this.body.setTranslation({ x: pos.x, y: pos.y + this.centerOffset, z: pos.z }, true);
  }

  /** 固定ステップ 1 回分。cameraYaw はカメラの向き（移動方向の基準） */
  update(dt: number, input: Input, cameraYaw: number, jump: boolean): void {
    const p = CONFIG.player;
    this.prev.copy(this.position);

    // カメラ基準の移動方向（カメラは yaw=0 のとき -Z を向く）
    const fx = -Math.sin(cameraYaw);
    const fz = -Math.cos(cameraYaw);
    let wx = fx * input.moveZ + -fz * input.moveX;
    let wz = fz * input.moveZ + fx * input.moveX;
    const wl = Math.hypot(wx, wz);
    if (wl > 1) {
      wx /= wl;
      wz /= wl;
    }

    const waterLevel = this.world.waterLevelAt(this.position.x, this.position.z);
    const depth = waterLevel - this.position.y;
    const swimming = depth > 1.2;
    const speed = swimming ? p.swimSpeed : input.sprint ? p.sprintSpeed : p.walkSpeed;
    const accel = this.mode === 'ground' || swimming ? p.groundAccel : p.airAccel;
    const k = 1 - Math.exp(-accel * dt);
    this.velocity.x += (wx * speed - this.velocity.x) * k;
    this.velocity.z += (wz * speed - this.velocity.z) * k;

    if (swimming) {
      // 肩まで浸かる高さに浮く。ジャンプで水から跳ね上がる
      const target = waterLevel - 1.3;
      this.velocity.y = THREE.MathUtils.clamp((target - this.position.y) * 3, -3, 4);
      if (jump) this.velocity.y = 5;
    } else if (this.mode === 'ground') {
      this.velocity.y = jump ? p.jumpSpeed : -1;
    } else {
      this.velocity.y = Math.max(this.velocity.y - p.gravity * dt, -55);
    }

    const desired = { x: this.velocity.x * dt, y: this.velocity.y * dt, z: this.velocity.z * dt };
    this.controller.computeColliderMovement(this.collider, desired);
    const mv = this.controller.computedMovement();
    const grounded = this.controller.computedGrounded();
    const t = this.body.translation();
    this.body.setNextKinematicTranslation({ x: t.x + mv.x, y: t.y + mv.y, z: t.z + mv.z });
    this.position.set(t.x + mv.x, t.y + mv.y - this.centerOffset, t.z + mv.z);

    // 天井に当たったら上昇をやめる
    if (desired.y > 0 && mv.y < desired.y * 0.5) this.velocity.y = 0;
    this.mode = swimming ? 'swim' : grounded && this.velocity.y <= 0 ? 'ground' : 'air';
    if (this.mode === 'ground') this.velocity.y = 0;

    // 壁などで止められた分は速度からも消す
    if (dt > 0) {
      this.velocity.x = mv.x / dt;
      this.velocity.z = mv.z / dt;
    }
    if (wl > 0.1) {
      const target = Math.atan2(wx, wz);
      let d = target - this.facing;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.facing += d * (1 - Math.exp(-12 * dt));
    }

    // 地形を突き抜けた場合の保険
    const ground = this.world.heights.sample(this.position.x, this.position.z);
    if (this.position.y < ground - 2) this.teleport(this.position.x, this.position.z);
  }

  /** 描画用に前ステップとの間を補間した位置 */
  interpolated(alpha: number, out: THREE.Vector3): THREE.Vector3 {
    return out.copy(this.prev).lerp(this.position, alpha);
  }
}

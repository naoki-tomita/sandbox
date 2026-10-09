import * as THREE from 'three';
import { CONFIG } from '../config.ts';
import { RAPIER, type Physics } from '../physics/Physics.ts';
import type { ComposedWorld } from '../worldgen/compose.ts';
import { HorseAnimator } from './HorseAnimator.ts';
import { HorseModel, type Coat } from './HorseModel.ts';

/** 馬への指示（乗り手の入力、または指笛で呼ばれたときの自動操縦） */
export interface HorseControl {
  /** 進みたい方向（ワールド座標、長さ 0..1） */
  dirX: number;
  dirZ: number;
  /** 目標の速さ (m/s) */
  speed: number;
  jump: boolean;
}

/** 当たり判定（地形・配置物）がプレイヤーの周辺にしか無いので、それより遠いときは高さグリッドに沿わせて動かす */
const PHYSICS_REACH = 60;

/**
 * 乗れる馬。位置 (position) は足元の中心。正面は facing の方向で、向いている方へしか進まない
 * （入力の方向へは旋回の速さの範囲で向きを変える）。深い水には入らない。
 */
export class Horse {
  readonly position = new THREE.Vector3();
  private readonly prev = new THREE.Vector3();
  readonly velocity = new THREE.Vector3();
  facing = 0;
  private prevFacing = 0;
  /** 前へ進む速さ (m/s) */
  speed = 0;
  grounded = true;
  ridden = false;
  readonly model: HorseModel;
  private readonly animator: HorseAnimator;
  private readonly body: RAPIER.RigidBody;
  readonly collider: RAPIER.Collider;
  private readonly controller: RAPIER.KinematicCharacterController;
  private readonly centerOffset: number;
  private readonly renderPos = new THREE.Vector3();
  private readonly reins: THREE.LineSegments;

  constructor(
    scene: THREE.Scene,
    private readonly physics: Physics,
    private readonly world: ComposedWorld,
    readonly id: string,
    x: number,
    z: number,
    facing: number,
    coat: Coat,
    seed: number,
  ) {
    const h = CONFIG.horse;
    this.model = new HorseModel(coat);
    this.animator = new HorseAnimator(seed);
    scene.add(this.model.root);
    this.centerOffset = h.halfHeight + h.radius;
    this.body = physics.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased());
    this.collider = physics.world.createCollider(RAPIER.ColliderDesc.capsule(h.halfHeight, h.radius), this.body);
    this.controller = physics.world.createCharacterController(0.03);
    this.controller.setMaxSlopeClimbAngle((h.maxSlopeDeg * Math.PI) / 180);
    this.controller.setMinSlopeSlideAngle(((h.maxSlopeDeg + 5) * Math.PI) / 180);
    this.controller.enableAutostep(h.stepHeight, 0.3, false);
    this.controller.enableSnapToGround(0.6);
    this.controller.setSlideEnabled(true);

    // 手綱（ハミから乗り手の手、または鞍の前橋へ）
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3));
    this.reins = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x2e1c10 }));
    this.reins.frustumCulled = false;
    scene.add(this.reins);

    this.teleport(x, z, facing);
  }

  teleport(x: number, z: number, facing = this.facing): void {
    const y = this.world.heights.sample(x, z) + 0.05;
    this.position.set(x, y, z);
    this.prev.copy(this.position);
    this.velocity.set(0, 0, 0);
    this.speed = 0;
    this.facing = this.prevFacing = facing;
    this.body.setTranslation({ x, y: y + this.centerOffset, z }, true);
  }

  /**
   * 前方（ahead m 先）の水の深さ。足場は下向きのレイで調べるので、橋や桟橋の上なら水深は 0 以下になる。
   * 当たり判定の外（near = false）では地面の高さで代用する。
   */
  private depthAhead(ahead: number, near: boolean): number {
    const x = this.position.x + Math.sin(this.facing) * ahead;
    const z = this.position.z + Math.cos(this.facing) * ahead;
    let floor = this.world.heights.sample(x, z);
    if (near) {
      const top = this.position.y + 1.5;
      const hit = this.physics.castRay({ x, y: top, z }, { x: 0, y: -1, z: 0 }, 8, this.collider);
      if (hit !== null) floor = top - hit;
    }
    return this.world.waterLevelAt(x, z) - floor;
  }

  /**
   * 固定ステップ 1 回分。control が null なら止まる（乗り手も指示もなく止まっていれば物理は動かさない）。
   * near = プレイヤーの周辺（当たり判定がある範囲）にいるか。
   */
  step(dt: number, control: HorseControl | null, near: boolean): void {
    const h = CONFIG.horse;
    this.prev.copy(this.position);
    this.prevFacing = this.facing;
    if (!control && this.speed === 0 && this.grounded && !this.ridden) return;

    // 向き: 指示の方向へ旋回する。真後ろに近いほど減速して小回りする
    let target = 0;
    if (control && Math.hypot(control.dirX, control.dirZ) > 0.1) {
      const want = Math.atan2(control.dirX, control.dirZ);
      const diff = Math.atan2(Math.sin(want - this.facing), Math.cos(want - this.facing));
      if (this.grounded) {
        const rate = THREE.MathUtils.lerp(h.turnSlow, h.turnFast, THREE.MathUtils.smoothstep(this.speed, 4, h.gallopSpeed));
        this.facing += THREE.MathUtils.clamp(diff, -rate * dt, rate * dt);
      }
      target = control.speed * (Math.abs(diff) > 1.8 ? 0.25 : 1);
    }
    // 深い水の手前では止まる（すでに深みにいるときは、より深い方へだけ進まない）
    const here = this.world.waterLevelAt(this.position.x, this.position.z) - this.position.y;
    const ahead = this.depthAhead(1.8, near);
    const blocked = ahead > h.maxWadeDepth && ahead > here + 0.05;
    if (blocked) {
      target = 0;
      this.speed = Math.min(this.speed, 0.5);
    }
    if (this.grounded) {
      const rate = target > this.speed ? h.accel : h.brake;
      this.speed += THREE.MathUtils.clamp(target - this.speed, -rate * dt, rate * dt);
      if (this.speed < 0.02 && target === 0) this.speed = 0;
    }

    const fx = Math.sin(this.facing);
    const fz = Math.cos(this.facing);
    if (this.grounded) this.velocity.y = control?.jump ? h.jumpSpeed : -1;
    else this.velocity.y = Math.max(this.velocity.y - h.gravity * dt, -55);
    this.velocity.x = fx * this.speed;
    this.velocity.z = fz * this.speed;

    if (!near) {
      // 当たり判定の外: 高さグリッドに沿って進む（跳躍はしない）
      this.position.x += this.velocity.x * dt;
      this.position.z += this.velocity.z * dt;
      this.position.y = this.world.heights.sample(this.position.x, this.position.z) + 0.05;
      this.velocity.y = 0;
      this.grounded = true;
      this.body.setNextKinematicTranslation({ x: this.position.x, y: this.position.y + this.centerOffset, z: this.position.z });
      return;
    }

    const desired = { x: this.velocity.x * dt, y: this.velocity.y * dt, z: this.velocity.z * dt };
    this.controller.computeColliderMovement(this.collider, desired);
    const mv = this.controller.computedMovement();
    const t = this.body.translation();
    this.body.setNextKinematicTranslation({ x: t.x + mv.x, y: t.y + mv.y, z: t.z + mv.z });
    this.position.set(t.x + mv.x, t.y + mv.y - this.centerOffset, t.z + mv.z);
    if (desired.y > 0 && mv.y < desired.y * 0.5) this.velocity.y = 0;
    this.grounded = this.controller.computedGrounded() && this.velocity.y <= 0;
    if (this.grounded) this.velocity.y = 0;
    // 壁や登れない斜面に当たったら速さも落とす（坂道では進む量が少し減るだけなので落とさない）
    if (dt > 0 && this.grounded) {
      let wall = false;
      for (let i = 0; i < this.controller.numComputedCollisions(); i++) {
        if ((this.controller.computedCollision(i)?.normal1.y ?? 1) < 0.6) wall = true;
      }
      if (wall) this.speed = Math.max(0, Math.min(this.speed, (mv.x * fx + mv.z * fz) / dt + 1));
    }

    const ground = this.world.heights.sample(this.position.x, this.position.z);
    if (this.position.y < ground - 2) this.teleport(this.position.x, this.position.z);
  }

  /** 描画の更新。補間した位置に置き、ポーズを合成する */
  render(alpha: number, dt: number): void {
    this.renderPos.copy(this.prev).lerp(this.position, alpha);
    const df = Math.atan2(Math.sin(this.facing - this.prevFacing), Math.cos(this.facing - this.prevFacing));
    this.model.root.position.copy(this.renderPos);
    this.model.root.rotation.y = this.prevFacing + df * alpha;
    const pose = this.animator.update({
      dt,
      speed: Math.hypot(this.velocity.x, this.velocity.z),
      vy: this.velocity.y,
      airborne: !this.grounded,
      idleFree: !this.ridden,
      jumpSpeed: CONFIG.horse.jumpSpeed,
    });
    this.model.apply(pose);
    this.model.root.updateMatrixWorld(true);
  }

  /** 手綱を張る。hands が与えられれば乗り手の手へ、無ければ鞍の前橋へ（render の後に呼ぶ） */
  updateReins(hands: [THREE.Vector3, THREE.Vector3] | null): void {
    const pos = this.reins.geometry.getAttribute('position') as THREE.BufferAttribute;
    const a = this.model.bitL.getWorldPosition(new THREE.Vector3());
    const b = this.model.bitR.getWorldPosition(new THREE.Vector3());
    let ha: THREE.Vector3;
    let hb: THREE.Vector3;
    if (hands) [ha, hb] = hands;
    else {
      ha = hb = this.model.saddle.localToWorld(new THREE.Vector3(0, 0.05, 0.25));
    }
    pos.setXYZ(0, a.x, a.y, a.z);
    pos.setXYZ(1, ha.x, ha.y, ha.z);
    pos.setXYZ(2, b.x, b.y, b.z);
    pos.setXYZ(3, hb.x, hb.y, hb.z);
    pos.needsUpdate = true;
  }

  /** 鞍の座面のワールド座標（render の後に呼ぶ） */
  saddleWorld(out: THREE.Vector3): THREE.Vector3 {
    return this.model.saddle.getWorldPosition(out);
  }

  /** 胴の前後の傾き（乗り手の姿勢を合わせる） */
  get bodyPitch(): number {
    return this.model.saddle.parent!.parent!.rotation.x;
  }

  get animState(): { bounce: number; gallop: number; air: number; time: number } {
    return { bounce: this.animator.bounce, gallop: this.animator.gallop, air: this.animator.airWeight, time: this.animator.time };
  }

  setVisible(v: boolean): void {
    this.model.root.visible = v;
    this.reins.visible = v;
  }

  /** プレイヤーの周辺（当たり判定のある範囲）にいるか */
  static isNear(horse: Horse, px: number, pz: number): boolean {
    return Math.hypot(horse.position.x - px, horse.position.z - pz) < PHYSICS_REACH;
  }
}

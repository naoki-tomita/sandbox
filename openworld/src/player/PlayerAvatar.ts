import * as THREE from 'three';
import { riderPose } from '../mount/horsePoses.ts';
import { CharacterAnimator, type Locomotion } from './character/CharacterAnimator.ts';
import { CharacterModel, HIP_HEIGHT } from './character/CharacterModel.ts';

/** プレイヤーの見た目。モデル（関節の階層）と手続きアニメーションをつなぐ */
export class PlayerAvatar {
  readonly model = new CharacterModel();
  readonly animator = new CharacterAnimator();

  constructor(scene: THREE.Scene) {
    this.model.root.name = 'player';
    scene.add(this.model.root);
  }

  /**
   * @param velocity 物理ステップでの速度（水平の速さと上下の速さに使う）
   */
  update(dt: number, pos: THREE.Vector3, facing: number, velocity: THREE.Vector3, mode: Locomotion): void {
    this.model.root.position.copy(pos);
    this.model.root.rotation.y = facing;
    const pose = this.animator.update({ dt, speed: Math.hypot(velocity.x, velocity.z), vy: velocity.y, mode, facing });
    this.model.apply(pose);
  }

  /**
   * 乗馬中: 鞍の上にまたがらせる。
   * @param saddle 鞍の座面のワールド座標  @param pitch 馬の胴の前後の傾き
   */
  updateRiding(dt: number, saddle: THREE.Vector3, facing: number, pitch: number, horse: { bounce: number; gallop: number; air: number }): void {
    this.animator.time += dt;
    const t = this.animator.time;
    this.model.root.position.set(saddle.x, saddle.y - HIP_HEIGHT + 0.07, saddle.z);
    this.model.root.rotation.y = facing;
    const pose = riderPose(t, horse.bounce, horse.gallop, horse.air);
    pose.rootPitch = pitch;
    pose.blink = t % 3.5 < 0.12 ? 1 : 0;
    this.model.apply(pose);
    this.model.root.updateMatrixWorld(true);
  }

  /** 両手のワールド座標（手綱を張るのに使う） */
  hands(): [THREE.Vector3, THREE.Vector3] {
    const j = this.model.joints;
    return [j.handL.localToWorld(new THREE.Vector3(0, -0.05, 0.02)), j.handR.localToWorld(new THREE.Vector3(0, -0.05, 0.02))];
  }
}

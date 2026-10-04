import * as THREE from 'three';
import { CharacterAnimator, type Locomotion } from './character/CharacterAnimator.ts';
import { CharacterModel } from './character/CharacterModel.ts';

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
}

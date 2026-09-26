import * as THREE from 'three';
import { CONFIG } from '../config.ts';
import type { Input } from '../core/Input.ts';

/**
 * デバッグ用の自由飛行カメラ（T で切り替え）。地形や当たり判定を無視して飛べる。
 * WASD 移動 / Space 上昇 / C 下降 / Shift 高速。
 */
export class FreeCamera {
  yaw = 0;
  pitch = 0;
  readonly position = new THREE.Vector3();

  constructor(private readonly camera: THREE.PerspectiveCamera) {}

  /** 現在のカメラ姿勢から開始する */
  begin(): void {
    this.position.copy(this.camera.position);
    const e = new THREE.Euler().setFromQuaternion(this.camera.quaternion, 'YXZ');
    this.yaw = e.y;
    this.pitch = e.x;
  }

  look(dx: number, dy: number): void {
    const s = CONFIG.camera.sensitivity;
    this.yaw -= dx * s;
    this.pitch = THREE.MathUtils.clamp(this.pitch - dy * s, -1.55, 1.55);
  }

  update(dt: number, input: Input): void {
    const c = CONFIG.freeCamera;
    const speed = c.speed * (input.sprint ? c.fastMultiplier : 1);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
    const up = (input.isDown('Space') ? 1 : 0) - (input.isDown('KeyC') ? 1 : 0);
    this.position
      .addScaledVector(forward, input.moveZ * speed * dt)
      .addScaledVector(right, input.moveX * speed * dt)
      .addScaledVector(new THREE.Vector3(0, 1, 0), up * speed * dt);
    this.camera.position.copy(this.position);
    this.camera.quaternion.copy(q);
  }
}

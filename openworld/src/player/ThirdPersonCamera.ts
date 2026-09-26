import * as THREE from 'three';
import { CONFIG } from '../config.ts';
import type { Physics, RAPIER } from '../physics/Physics.ts';
import type { ComposedWorld } from '../worldgen/compose.ts';

/**
 * 三人称オービットカメラ。yaw=0 のときカメラは -Z を向く（プレイヤーの +Z 側から見る）。
 * カメラとプレイヤーの間に障害物があれば手前に寄せ、地面の下には潜らない。
 */
export class ThirdPersonCamera {
  yaw = 0;
  pitch = 0.35;
  distance: number = CONFIG.camera.distance;
  private currentDistance: number = CONFIG.camera.distance;
  private readonly target = new THREE.Vector3();

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly physics: Physics,
    private readonly world: ComposedWorld,
  ) {}

  look(dx: number, dy: number, wheel: number): void {
    const c = CONFIG.camera;
    this.yaw -= dx * c.sensitivity;
    this.pitch = THREE.MathUtils.clamp(this.pitch + dy * c.sensitivity, c.minPitch, c.maxPitch);
    this.distance = THREE.MathUtils.clamp(this.distance * (1 + wheel * 0.12), c.minDistance, c.maxDistance);
  }

  update(dt: number, playerPos: THREE.Vector3, exclude: RAPIER.Collider): void {
    this.target.set(playerPos.x, playerPos.y + CONFIG.camera.targetHeight, playerPos.z);
    const cp = Math.cos(this.pitch);
    const dir = new THREE.Vector3(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp);

    let dist = this.distance;
    const hit = this.physics.castRay(this.target, dir, dist + 0.3, exclude);
    if (hit !== null) dist = Math.max(0.5, hit - 0.3);
    // 遠ざかるときはゆっくり、近づくときは即座に
    this.currentDistance = dist < this.currentDistance ? dist : this.currentDistance + (dist - this.currentDistance) * (1 - Math.exp(-4 * dt));

    const pos = this.target.clone().addScaledVector(dir, this.currentDistance);
    const ground = this.world.heights.sample(pos.x, pos.z) + 0.4;
    if (pos.y < ground) pos.y = ground;
    this.camera.position.copy(pos);
    this.camera.lookAt(this.target);
  }
}

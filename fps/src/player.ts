import * as THREE from 'three';
import {
  PLAYER_HEIGHT, PLAYER_SPEED, PLAYER_RADIUS,
  PLAYER_HP_MAX, AMMO_MAG, AMMO_RESERVE, CELL,
} from './config';
import type { Input } from './input';
import type { World } from './world';

export class Player {
  hp      = PLAYER_HP_MAX;
  ammo    = AMMO_MAG;
  reserve = AMMO_RESERVE;
  score   = 0;
  kills   = 0;
  reloading   = false;
  reloadTimer: ReturnType<typeof setTimeout> | null = null;
  alive   = true;

  constructor(private camera: THREE.PerspectiveCamera) {}

  reset(): void {
    this.hp          = PLAYER_HP_MAX;
    this.ammo        = AMMO_MAG;
    this.reserve     = AMMO_RESERVE;
    this.score       = 0;
    this.kills       = 0;
    this.reloading   = false;
    this.reloadTimer = null;
    this.alive       = true;
    this.camera.position.set(CELL * 1.5, PLAYER_HEIGHT, CELL * 1.5);
  }

  update(dt: number, input: Input, world: World): void {
    const dir = new THREE.Vector3();
    if (input.isDown('KeyW')    || input.isDown('ArrowUp'))    dir.z -= 1;
    if (input.isDown('KeyS')    || input.isDown('ArrowDown'))  dir.z += 1;
    if (input.isDown('KeyA')    || input.isDown('ArrowLeft'))  dir.x -= 1;
    if (input.isDown('KeyD')    || input.isDown('ArrowRight')) dir.x += 1;
    dir.normalize();

    const moveWorld = dir.applyEuler(new THREE.Euler(0, input.yaw, 0));
    const nx = this.camera.position.x + moveWorld.x * PLAYER_SPEED * dt;
    const nz = this.camera.position.z + moveWorld.z * PLAYER_SPEED * dt;

    if (!world.wallHit(nx, this.camera.position.z, PLAYER_RADIUS)) this.camera.position.x = nx;
    if (!world.wallHit(this.camera.position.x, nz, PLAYER_RADIUS)) this.camera.position.z = nz;
    this.camera.position.y = PLAYER_HEIGHT;

    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = input.yaw;
    this.camera.rotation.x = input.pitch;
  }
}

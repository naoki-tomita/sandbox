import * as THREE from 'three';
import { BULLET_SPEED, BULLET_LIFE, SHOOT_DELAY_MS, AMMO_MAG, RELOAD_MS } from './config';
import type { Bullet } from './types';
import type { Player } from './player';

export class Weapon {
  private gunGroup: THREE.Group;
  private recoilT      = 0;
  private traces: Bullet[] = [];
  lastShootTime = 0;

  constructor(
    private camera: THREE.PerspectiveCamera,
    private scene:  THREE.Scene,
  ) {
    this.gunGroup = this.buildGun();
  }

  private buildGun(): THREE.Group {
    const grp   = new THREE.Group();
    const dark  = new THREE.MeshLambertMaterial({ color: 0x222222 });
    const metal = new THREE.MeshLambertMaterial({ color: 0x444455 });

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.11, 0.42), dark);
    grp.add(body);

    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.36), metal);
    barrel.position.set(0, 0.04, -0.36);
    grp.add(barrel);

    const scope = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.14), dark);
    scope.position.set(0, 0.1, -0.04);
    grp.add(scope);

    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.14, 0.09), dark);
    grip.position.set(0, -0.12, 0.08);
    grp.add(grip);

    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.12, 0.07), metal);
    mag.position.set(0, -0.1, -0.02);
    grp.add(mag);

    grp.position.set(0.22, -0.17, -0.38);
    this.camera.add(grp);
    return grp;
  }

  private spawnMuzzleFlash(): void {
    const geo   = new THREE.SphereGeometry(0.07, 6, 4);
    const mat   = new THREE.MeshBasicMaterial({ color: 0xffee88 });
    const flash = new THREE.Mesh(geo, mat);
    flash.position.set(0, 0.04, -0.58);
    this.gunGroup.add(flash);
    setTimeout(() => this.gunGroup.remove(flash), 55);
  }

  canFire(now: number, player: Player): boolean {
    return now - this.lastShootTime >= SHOOT_DELAY_MS && !player.reloading && player.alive;
  }

  fire(now: number): THREE.Raycaster {
    this.lastShootTime = now;
    this.spawnMuzzleFlash();
    this.recoilT = 1;

    const rc = new THREE.Raycaster();
    rc.setFromCamera(new THREE.Vector2(0, 0), this.camera);

    const traceGeo = new THREE.BoxGeometry(0.015, 0.015, 0.5);
    const traceMat = new THREE.MeshBasicMaterial({ color: 0xffffaa });
    const trace    = new THREE.Mesh(traceGeo, traceMat);
    const start    = rc.ray.origin.clone().addScaledVector(rc.ray.direction, 0.8);
    trace.position.copy(start);
    trace.lookAt(start.clone().addScaledVector(rc.ray.direction, 5));
    this.scene.add(trace);
    this.traces.push({
      mesh: trace,
      vel:  rc.ray.direction.clone().multiplyScalar(BULLET_SPEED),
      life: BULLET_LIFE,
    });

    return rc;
  }

  startReload(player: Player, onStart: () => void, onDone: () => void): void {
    if (player.reloading || player.reserve <= 0 || player.ammo === AMMO_MAG) return;
    player.reloading = true;
    onStart();
    player.reloadTimer = setTimeout(() => {
      const need    = AMMO_MAG - player.ammo;
      const load    = Math.min(need, player.reserve);
      player.ammo    += load;
      player.reserve -= load;
      player.reloading   = false;
      player.reloadTimer = null;
      onDone();
    }, RELOAD_MS);
  }

  update(dt: number): void {
    if (this.recoilT > 0) {
      this.recoilT = Math.max(0, this.recoilT - dt * 8);
      this.gunGroup.position.z = -0.38 + this.recoilT * 0.07;
    }

    this.traces.forEach(b => {
      b.mesh.position.addScaledVector(b.vel, dt);
      b.life -= dt;
    });
    this.traces = this.traces.filter(b => {
      if (b.life <= 0) { this.scene.remove(b.mesh); return false; }
      return true;
    });
  }

  clear(): void {
    this.traces.forEach(b => this.scene.remove(b.mesh));
    this.traces = [];
  }
}

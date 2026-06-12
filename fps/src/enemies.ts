import * as THREE from 'three';
import {
  ENEMY_HP, ENEMY_SPEED_BASE, ENEMY_ALERT_R, ENEMY_SHOOT_R,
  ENEMY_SHOOT_CD_MIN, ENEMY_SHOOT_CD_MAX,
  ENEMY_BULLET_SPEED, ENEMY_BULLET_LIFE, ENEMY_INACCURACY, ENEMY_DAMAGE,
} from './config';
import type { Enemy, Bullet } from './types';
import type { World } from './world';
import { shuffleArr } from './utils';

export class EnemyManager {
  private enemies: Enemy[] = [];
  private bullets: Bullet[] = [];
  enemiesLeft = 0;

  constructor(private scene: THREE.Scene, private world: World) {}

  spawnWave(wave: number, playerPos: THREE.Vector3): void {
    const count = 3 + (wave - 1) * 2;
    this.enemiesLeft = count;

    const pool = this.world.openCells.filter(c => {
      const dx = c.x - playerPos.x;
      const dy = c.y - playerPos.z;
      return Math.sqrt(dx * dx + dy * dy) > 16;
    });
    shuffleArr(pool);

    const actual = Math.min(count, pool.length);
    for (let i = 0; i < actual; i++) {
      this.spawnEnemy(pool[i].x, pool[i].y, wave);
    }
    if (count > pool.length) this.enemiesLeft = pool.length;
  }

  private spawnEnemy(x: number, z: number, wave: number): void {
    const grp = new THREE.Group();

    const bodyMat = new THREE.MeshLambertMaterial({ color: 0xcc1111 });
    const body    = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.1, 0.38), bodyMat);
    body.position.y = 0.55;
    grp.add(body);

    const headMat = new THREE.MeshLambertMaterial({ color: 0xe84444 });
    const head    = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.44, 0.44), headMat);
    head.position.y = 1.32;
    grp.add(head);

    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffff00 });
    ([-0.12, 0.12] as number[]).forEach(ox => {
      const eye = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.05), eyeMat);
      eye.position.set(ox, 1.35, -0.22);
      grp.add(eye);
    });

    grp.position.set(x, 0, z);
    this.scene.add(grp);

    const cd = ENEMY_SHOOT_CD_MIN + Math.random() * (ENEMY_SHOOT_CD_MAX - ENEMY_SHOOT_CD_MIN);
    this.enemies.push({
      mesh:         grp,
      headMesh:     head,
      hp:           ENEMY_HP,
      maxHp:        ENEMY_HP,
      pos:          new THREE.Vector3(x, 0, z),
      patrolTarget: this.world.randomOpenCell(),
      state:        'patrol',
      shootCd:      cd,
      lastShot:     0,
      speed:        ENEMY_SPEED_BASE + (wave - 1) * 0.3,
      dead:         false,
    });
  }

  update(dt: number, now: number, playerPos: THREE.Vector3): void {
    const pFlat = playerPos.clone();
    pFlat.y = 0;

    for (const e of this.enemies) {
      if (e.dead) continue;

      const dist = e.pos.distanceTo(pFlat);
      e.state = dist < ENEMY_SHOOT_R ? 'shoot' : dist < ENEMY_ALERT_R ? 'chase' : 'patrol';

      if (e.state === 'patrol') {
        if (e.pos.distanceTo(e.patrolTarget) < 0.8) e.patrolTarget = this.world.randomOpenCell();
      }

      if (e.state !== 'shoot') {
        const target = e.state === 'patrol' ? e.patrolTarget : pFlat.clone();
        const dir = target.clone().sub(e.pos);
        dir.y = 0;
        if (dir.length() > 0.1) {
          dir.normalize();
          const spd = e.state === 'chase' ? e.speed * 1.6 : e.speed;
          const nx  = e.pos.x + dir.x * spd * dt;
          const nz  = e.pos.z + dir.z * spd * dt;
          if (!this.world.wallHit(nx, e.pos.z, 0.28)) e.pos.x = nx;
          if (!this.world.wallHit(e.pos.x, nz, 0.28)) e.pos.z = nz;
          e.mesh.rotation.y = Math.atan2(dir.x, dir.z);
        }
      } else {
        const fd = pFlat.clone().sub(e.pos);
        fd.y = 0;
        if (fd.length() > 0.01) e.mesh.rotation.y = Math.atan2(fd.x, fd.z);
      }

      e.mesh.position.copy(e.pos);

      if (e.state === 'shoot' && now - e.lastShot > e.shootCd) {
        this.enemyShoot(e, playerPos);
        e.lastShot = now;
      }
    }

    this.enemies = this.enemies.filter(e => {
      if (e.dead) { this.scene.remove(e.mesh); return false; }
      return true;
    });
  }

  private enemyShoot(e: Enemy, playerPos: THREE.Vector3): void {
    const origin = e.pos.clone();
    origin.y = 1.3;

    const dir = playerPos.clone().sub(origin).normalize();
    dir.x += (Math.random() - 0.5) * ENEMY_INACCURACY;
    dir.y += (Math.random() - 0.5) * ENEMY_INACCURACY;
    dir.z += (Math.random() - 0.5) * ENEMY_INACCURACY;
    dir.normalize();

    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 5, 5),
      new THREE.MeshBasicMaterial({ color: 0xff7700 }),
    );
    mesh.position.copy(origin);
    this.scene.add(mesh);

    this.bullets.push({ mesh, vel: dir.multiplyScalar(ENEMY_BULLET_SPEED), life: ENEMY_BULLET_LIFE });
  }

  updateBullets(dt: number, playerPos: THREE.Vector3): number {
    let totalDamage = 0;

    this.bullets.forEach(b => {
      b.mesh.position.addScaledVector(b.vel, dt);
      b.life -= dt;
      if (b.life > 0 && b.mesh.position.distanceTo(playerPos) < 0.45) {
        totalDamage += ENEMY_DAMAGE;
        b.life = 0;
      }
      if (b.life > 0 && this.world.wallHit(b.mesh.position.x, b.mesh.position.z, 0.05)) {
        b.life = 0;
      }
    });

    this.bullets = this.bullets.filter(b => {
      if (b.life <= 0) { this.scene.remove(b.mesh); return false; }
      return true;
    });

    return totalDamage;
  }

  raycastHit(rc: THREE.Raycaster): { enemy: Enemy; headshot: boolean } | null {
    const targets = this.enemies.filter(e => !e.dead).map(e => e.mesh);
    const hits    = rc.intersectObjects(targets, true);
    if (hits.length === 0) return null;

    const hitObject = hits[0].object;
    const e = this.enemies.find(en => en.mesh === hitObject || en.mesh.children.includes(hitObject));
    if (!e || e.dead) return null;

    return { enemy: e, headshot: hitObject === e.headMesh };
  }

  applyDamage(e: Enemy, dmg: number): boolean {
    e.hp -= dmg;
    if (e.hp <= 0) {
      e.dead = true;
      this.enemiesLeft--;
      return true;
    }
    return false;
  }

  aliveCount(): number {
    return this.enemies.filter(e => !e.dead).length + Math.max(0, this.enemiesLeft);
  }

  isWaveCleared(): boolean {
    return this.enemies.length === 0 && this.enemiesLeft <= 0;
  }

  markWavePending(): void {
    this.enemiesLeft = -1;
  }

  clear(): void {
    this.enemies.forEach(e => this.scene.remove(e.mesh));
    this.bullets.forEach(b => this.scene.remove(b.mesh));
    this.enemies = [];
    this.bullets = [];
    this.enemiesLeft = 0;
  }
}

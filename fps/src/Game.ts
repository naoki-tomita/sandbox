import * as THREE from 'three';
import type { GameState } from './types';
import { World }         from './world';
import { Input }         from './input';
import { Player }        from './player';
import { Weapon }        from './weapon';
import { EnemyManager }  from './enemies';
import * as UI           from './ui';

export class Game {
  private scene:    THREE.Scene;
  private camera:   THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private clock:    THREE.Clock;

  private gameState: GameState = 'menu';
  private wave = 1;

  private world:         World;
  private input:         Input;
  private player:        Player;
  private weapon:        Weapon;
  private enemyManager:  EnemyManager;

  constructor(canvas: HTMLCanvasElement) {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1a2e);
    this.scene.fog = new THREE.Fog(0x1a1a2e, 30, 70);

    this.camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.05, 80);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.clock = new THREE.Clock();

    this.world        = new World(this.scene);
    this.player       = new Player(this.camera);
    this.weapon       = new Weapon(this.camera, this.scene);
    this.enemyManager = new EnemyManager(this.scene, this.world);
    this.input        = new Input({
      onFire:            () => { if (this.gameState === 'playing') this.tryShoot(); },
      onRequestLock:     () => { if (this.gameState === 'playing') this.input.requestLock(); },
      onReload:          () => { if (this.gameState === 'playing') this.triggerReload(); },
      onPause:           () => this.togglePause(),
      onPointerLockLost: () => this.togglePause(),
    });

    this.scene.add(this.camera);
    window.addEventListener('resize', this.onResize);

    UI.bindButtons({
      onStart:   () => this.start(),
      onRestart: () => { UI.hideGameOver(); this.start(); },
      onResume:  () => this.resume(),
    });
  }

  start(): void {
    this.weapon.clear();
    this.enemyManager.clear();

    this.wave = 1;
    this.player.reset();
    this.input.resetLook();

    this.enemyManager.spawnWave(this.wave, this.camera.position);

    UI.hideMenu();
    UI.hideGameOver();
    UI.showHUD();
    this.updateHUD();

    this.gameState = 'playing';
    this.input.requestLock();
    this.input.showTouchControls();
    this.clock.start();
    requestAnimationFrame(this.loop);
  }

  private tryShoot(): void {
    const now = performance.now();
    if (!this.weapon.canFire(now, this.player)) {
      if (this.player.ammo <= 0) this.triggerReload();
      return;
    }

    this.player.ammo--;
    const rc  = this.weapon.fire(now);
    const hit = this.enemyManager.raycastHit(rc);

    if (hit) {
      const dmg    = hit.headshot ? 100 : 25;
      const killed = this.enemyManager.applyDamage(hit.enemy, dmg);
      if (killed) {
        this.player.kills++;
        this.player.score += hit.headshot ? 300 * this.wave : 100 * this.wave;
        UI.showKillMsg();
      } else {
        UI.flashHitMarker();
      }
    }

    this.updateHUD();
  }

  private triggerReload(): void {
    this.weapon.startReload(
      this.player,
      () => UI.setReloading(true),
      () => { UI.setReloading(false); this.updateHUD(); },
    );
  }

  private triggerGameOver(): void {
    this.gameState = 'gameover';
    if (this.player.reloadTimer !== null) clearTimeout(this.player.reloadTimer);
    this.input.exitLock();
    this.input.hideTouchControls();
    UI.showGameOver({ score: this.player.score, kills: this.player.kills, wave: this.wave });
  }

  private togglePause(): void {
    if (this.gameState === 'playing') {
      this.gameState = 'paused';
      this.input.exitLock();
      this.input.hideTouchControls();
      UI.showPause();
    }
  }

  private resume(): void {
    if (this.gameState !== 'paused') return;
    UI.hidePause();
    this.gameState = 'playing';
    this.input.requestLock();
    this.input.showTouchControls();
    this.clock.getDelta(); // drain accumulated delta
    requestAnimationFrame(this.loop);
  }

  private checkWave(): void {
    if (this.enemyManager.isWaveCleared() && this.gameState === 'playing') {
      this.enemyManager.markWavePending();
      this.wave++;
      UI.announceWave(this.wave);
      setTimeout(() => {
        if (this.gameState === 'playing') {
          this.enemyManager.spawnWave(this.wave, this.camera.position);
        }
      }, 3000);
    }
  }

  private updateHUD(): void {
    UI.updateHUD({
      score:            this.player.score,
      wave:             this.wave,
      enemiesRemaining: this.enemyManager.aliveCount(),
      hp:               this.player.hp,
      ammo:             this.player.ammo,
      reserve:          this.player.reserve,
    });
  }

  private loop = (): void => {
    if (this.gameState !== 'playing') return;
    requestAnimationFrame(this.loop);

    const dt  = Math.min(this.clock.getDelta(), 0.05);
    const now = performance.now();

    if (this.input.firing) this.tryShoot(); // hold-to-fire (touch); rate-limited by Weapon

    this.player.update(dt, this.input, this.world);
    this.weapon.update(dt);
    this.enemyManager.update(dt, now, this.camera.position);

    const dmg = this.enemyManager.updateBullets(dt, this.camera.position);
    if (dmg > 0) {
      this.player.hp = Math.max(0, this.player.hp - dmg);
      this.updateHUD();
      if (this.player.hp <= 0 && this.player.alive) {
        this.player.alive = false;
        this.triggerGameOver();
      }
    }

    this.checkWave();
    this.renderer.render(this.scene, this.camera);
  };

  private onResize = (): void => {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
  };
}

import * as THREE from 'three';
import { CONFIG } from './config.ts';
import { Input } from './core/Input.ts';
import { Loop } from './core/Loop.ts';
import { DebugHud } from './debug/DebugHud.ts';
import { FreeCamera } from './debug/FreeCamera.ts';
import type { Horse, HorseControl } from './mount/Horse.ts';
import { Horses } from './mount/Horses.ts';
import { Physics } from './physics/Physics.ts';
import { PlayerAvatar } from './player/PlayerAvatar.ts';
import { PlayerController } from './player/PlayerController.ts';
import { ThirdPersonCamera } from './player/ThirdPersonCamera.ts';
import { ChunkManager } from './world/ChunkManager.ts';
import { Grass } from './world/Grass.ts';
import { Props } from './world/Props.ts';
import { Sky } from './world/Sky.ts';
import { TextureSet, type TextureData } from './world/textureSet.ts';
import { Water } from './world/Water.ts';
import type { ComposedWorld } from './worldgen/compose.ts';

/**
 * コンポジションルート。サブシステムを生成し、固定ステップ（物理）と描画フレームを回す。
 *
 * URL パラメータ（確認・デバッグ用）:
 *   ?x=..&z=..  開始位置   ?facing=度  開始時の向き   ?t=時   時刻 (0..24)
 *   ?debug=1    HUD と marker を表示
 *   ?free=1     フリーカメラで開始（&h=地面からの高さ &pitch=見下ろす角度。向きは facing）
 *   ?autoplay=1 ポインターロックなしで即開始（自動テスト用。マウス視点は無効）
 *   ?camDist=m  三人称カメラの距離
 *   ?quality=low 軽量モード（草 1/4・影の解像度半分・アンチエイリアスなし）
 */
export class Game {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly input: Input;
  readonly physics = new Physics(CONFIG.fixedDt);
  readonly sky: Sky;
  readonly terrain: ChunkManager;
  readonly textures: TextureSet;
  private readonly grass: Grass;
  private readonly water: Water;
  readonly props: Props;
  readonly player: PlayerController;
  readonly avatar: PlayerAvatar;
  readonly horses: Horses;
  /** 乗っている馬 / 最後に乗った馬（指笛で優先して呼ぶ） */
  riding: Horse | null = null;
  private lastHorse: Horse | null = null;
  private readonly prompt = document.getElementById('prompt')!;
  private message: { text: string; until: number } | null = null;
  private readonly tpc: ThirdPersonCamera;
  private readonly free: FreeCamera;
  private readonly hud = new DebugHud();
  private readonly loop: Loop;
  private readonly overlay = document.getElementById('overlay')!;
  private readonly autoplay: boolean;
  private active = false;
  freeMode = false;
  private readonly renderPos = new THREE.Vector3();

  constructor(
    canvas: HTMLCanvasElement,
    readonly world: ComposedWorld,
    textureData: TextureData,
    params: URLSearchParams,
  ) {
    const low = params.get('quality') === 'low';
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !low });
    this.renderer.setPixelRatio(low ? 1 : Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.camera = new THREE.PerspectiveCamera(CONFIG.camera.fov, 1, 0.1, CONFIG.camera.far);
    this.resize();
    window.addEventListener('resize', () => this.resize());

    this.input = new Input(canvas);
    this.sky = new Sky(this.scene, this.renderer);
    this.textures = new TextureSet(textureData, this.renderer.capabilities.getMaxAnisotropy());
    this.terrain = new ChunkManager(this.scene, this.physics, world, this.textures);
    this.water = new Water(this.scene, world, this.textures.waterNormal);
    this.grass = new Grass(this.scene, world, low ? CONFIG.grass.count / 4 : CONFIG.grass.count);
    if (low) this.sky.sun.shadow.mapSize.set(1024, 1024);
    this.props = new Props(this.scene, world, this.textures);
    this.player = new PlayerController(this.physics, world);
    this.avatar = new PlayerAvatar(this.scene);
    this.horses = new Horses(this.scene, this.physics, world);
    this.tpc = new ThirdPersonCamera(this.camera, this.physics, world);
    this.free = new FreeCamera(this.camera);

    const num = (k: string) => (params.has(k) && Number.isFinite(Number(params.get(k))) ? Number(params.get(k)) : null);
    const [sx, sz] = world.def.spawn.at;
    const facing = ((num('facing') ?? world.def.spawn.facing) * Math.PI) / 180;
    this.teleport(num('x') ?? sx, num('z') ?? sz, facing);
    this.tpc.yaw = facing + Math.PI; // プレイヤーの背後から見る
    if (num('t') !== null) this.sky.hour = num('t')! % 24;
    if (num('camDist') !== null) this.tpc.distance = num('camDist')!;
    if (params.get('debug') === '1') this.setDebug(true);
    this.autoplay = params.get('autoplay') === '1';

    // 開始位置の周辺は最初にまとめて作る（ポップイン防止）
    this.terrain.updateRender(this.player.position.x, this.player.position.z, Infinity);

    if (params.get('free') === '1') {
      // 上空から見下ろす: h = 地面からの高さ, pitch = 見下ろす角度（度）
      this.toggleFree();
      const x = this.player.position.x;
      const z = this.player.position.z;
      this.free.position.set(x, world.heights.sample(x, z) + (num('h') ?? 60), z);
      this.free.yaw = facing + Math.PI;
      this.free.pitch = (-(num('pitch') ?? 30) * Math.PI) / 180;
      this.free.update(0, this.input);
      this.terrain.updateRender(x, z, Infinity);
    }

    this.overlay.addEventListener('click', () => this.input.requestLock());
    document.addEventListener('pointerlockchange', () => this.setActive(this.input.locked));
    document.getElementById('startPrompt')!.textContent = 'クリックで開始';
    this.overlay.classList.add('ready');
    if (this.autoplay) this.setActive(true);

    this.loop = new Loop(CONFIG.fixedDt, (dt) => this.fixedStep(dt), (a, dt, raw) => this.frame(a, dt, raw));
  }

  start(): void {
    this.loop.start();
  }

  /** プレイヤーを任意地点へ移動（地面の上に置く）。乗馬中は馬ごと */
  teleport(x: number, z: number, facing?: number): void {
    if (this.riding) {
      this.riding.teleport(x, z, facing);
      this.player.follow(this.riding.position, this.riding.velocity, this.riding.facing);
    } else {
      this.player.teleport(x, z, facing);
    }
    this.terrain.updatePhysics(x, z);
    this.physics.step();
  }

  private say(text: string): void {
    this.message = { text, until: performance.now() + 2500 };
  }

  /** E: 近くの馬に乗る / 乗っている馬から降りる */
  private toggleMount(): void {
    const h = this.riding;
    if (h) {
      if (h.speed > 2.5 || !h.grounded) return this.say('止まってから降りよう');
      // 左側、だめなら右側に降りる（壁や深い水の上には降りない）
      for (const side of [1, -1]) {
        const dx = Math.cos(h.facing) * side;
        const dz = -Math.sin(h.facing) * side;
        const from = { x: h.position.x, y: h.position.y + 1, z: h.position.z };
        if (this.physics.castRay(from, { x: dx, y: 0, z: dz }, 1.9, h.collider) !== null) continue;
        const x = h.position.x + dx * 1.5;
        const z = h.position.z + dz * 1.5;
        if (this.world.waterLevelAt(x, z) - h.position.y > 1) continue;
        this.dismountAt(x, z, Math.max(h.position.y, this.world.heights.sample(x, z)) + 0.2);
        return;
      }
      return this.say('ここでは降りられない');
    }
    if (this.player.mode !== 'ground') return;
    const p = this.player.position;
    const near = this.horses.nearest(p.x, p.z, CONFIG.horse.mountRange);
    if (!near || near.speed > 1 || !near.grounded) return;
    near.ridden = true;
    this.riding = this.lastHorse = near;
    this.player.setMounted(true);
    this.player.follow(near.position, near.velocity, near.facing);
    this.tpc.targetHeight = 2.6;
    this.tpc.extraDistance = 2.5;
  }

  private dismountAt(x: number, z: number, y: number): void {
    const h = this.riding;
    if (!h) return;
    h.ridden = false;
    this.riding = null;
    this.player.setMounted(false);
    this.player.teleport(x, z, h.facing, y);
    this.tpc.targetHeight = CONFIG.camera.targetHeight;
    this.tpc.extraDistance = 0;
  }

  /** Q: 指笛で馬を呼ぶ */
  private whistle(): void {
    if (this.riding) return;
    const p = this.player.position;
    const h = this.horses.whistle(p.x, p.z, this.lastHorse);
    this.say(h ? '指笛を吹いた' : '指笛を吹いた…（近くに馬はいないようだ）');
  }

  /** 乗馬中の入力 → 馬への指示（カメラ基準の方向。W で速歩、Shift で襲歩） */
  private rideControl(jump: boolean): HorseControl {
    const input = this.input;
    const fx = -Math.sin(this.tpc.yaw);
    const fz = -Math.cos(this.tpc.yaw);
    let dirX = fx * input.moveZ + -fz * input.moveX;
    let dirZ = fz * input.moveZ + fx * input.moveX;
    const l = Math.hypot(dirX, dirZ);
    if (l > 1) {
      dirX /= l;
      dirZ /= l;
    }
    const h = CONFIG.horse;
    return { dirX, dirZ, speed: input.sprint ? h.gallopSpeed : h.trotSpeed, jump };
  }

  private updatePrompt(): void {
    let html = '';
    if (this.message && performance.now() < this.message.until) html = this.message.text;
    else if (this.freeMode || !this.active) html = '';
    else if (this.riding) html = '<kbd>E</kbd>降りる　<kbd>Shift</kbd>駆ける　<kbd>Space</kbd>跳ぶ';
    else {
      const p = this.player.position;
      if (this.player.mode === 'ground' && this.horses.nearest(p.x, p.z, CONFIG.horse.mountRange)) html = '<kbd>E</kbd>乗る';
    }
    if (this.prompt.innerHTML !== html) this.prompt.innerHTML = html;
  }

  private setActive(v: boolean): void {
    this.active = v || this.autoplay;
    this.overlay.classList.toggle('hidden', this.active);
    this.input.consumeJump();
  }

  private setDebug(v: boolean): void {
    this.hud.toggle(v);
    this.props.setMarkersVisible(v);
  }

  private toggleFree(): void {
    this.freeMode = !this.freeMode;
    if (this.freeMode) this.free.begin();
  }

  private resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private fixedStep(dt: number): void {
    if (!this.active || this.freeMode) return;
    const p = this.player.position;
    this.terrain.updatePhysics(p.x, p.z);
    const jump = this.input.consumeJump();
    if (this.riding) {
      const h = this.riding;
      h.step(dt, this.rideControl(jump), true);
      this.player.follow(h.position, h.velocity, h.facing);
      // 崖から深い水に落ちたときなどは、馬から投げ出されて泳ぐ
      if (this.world.waterLevelAt(h.position.x, h.position.z) - h.position.y > 1.5) this.dismountAt(h.position.x, h.position.z, h.position.y + 1);
    } else {
      this.player.update(dt, this.input, this.tpc.yaw, jump);
    }
    this.horses.step(dt, p);
    this.physics.step();
  }

  private frame(alpha: number, frameDt: number, rawDt: number): void {
    const input = this.input;
    if (input.pressed('F3')) this.setDebug(!this.hud.visible);
    if (input.pressed('KeyT')) this.toggleFree();
    if (this.freeMode && input.pressed('KeyG')) {
      this.teleport(this.free.position.x, this.free.position.z);
      this.toggleFree();
    }
    if (this.active && !this.freeMode) {
      if (input.interact) this.toggleMount();
      if (input.whistle) this.whistle();
    }
    if (input.pressed('BracketLeft')) this.sky.hour = (this.sky.hour + 23) % 24;
    if (input.pressed('BracketRight')) this.sky.hour = (this.sky.hour + 1) % 24;

    const look = input.consumeLook();
    if (this.freeMode) this.free.look(look.dx, look.dy);
    else this.tpc.look(look.dx, look.dy, look.wheel);

    const dt = this.active ? frameDt : 0;
    if (this.riding) {
      // 馬を先に置き、その鞍に乗り手をまたがらせ、最後に手綱を手へ張る
      const h = this.riding;
      h.render(alpha, dt);
      this.renderPos.copy(h.model.root.position);
      this.avatar.updateRiding(dt, h.saddleWorld(new THREE.Vector3()), h.model.root.rotation.y, h.bodyPitch, h.animState);
      h.updateReins(this.avatar.hands());
    } else {
      this.player.interpolated(alpha, this.renderPos);
      this.avatar.update(dt, this.renderPos, this.player.facing, this.player.velocity, this.player.mode);
    }
    if (this.freeMode) {
      if (this.active) this.free.update(frameDt, input);
    } else {
      this.tpc.update(frameDt, this.renderPos, this.riding ? this.riding.collider : this.player.excludeCollider);
    }

    const focus = this.freeMode ? this.free.position : this.renderPos;
    this.terrain.updateRender(focus.x, focus.z);
    this.sky.update(this.active ? frameDt : 0, focus);
    this.grass.update(frameDt, focus);
    this.props.update(focus);
    this.horses.render(alpha, dt, focus);
    this.updatePrompt();
    this.water.update(frameDt);

    const p = this.player.position;
    const h = Math.floor(this.sky.hour);
    const m = Math.floor((this.sky.hour - h) * 60);
    this.hud.update(rawDt, [
      ['位置', `${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}`],
      ['カメラ', this.freeMode ? `フリー ${focus.x.toFixed(0)}, ${this.camera.position.y.toFixed(0)}, ${focus.z.toFixed(0)}` : '三人称'],
      ['状態', `${this.riding ? '乗馬' : this.player.mode}  速度 ${Math.hypot(this.player.velocity.x, this.player.velocity.z).toFixed(1)} m/s`],
      ['地表', `${this.world.surfaceAt(p.x, p.z)}  水面 ${this.world.waterLevelAt(p.x, p.z).toFixed(1)} m`],
      ['時刻', `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`],
      ['チャンク', `描画 ${this.terrain.loadedMeshes} / 物理 ${this.terrain.loadedColliders}`],
      ['配置物', `${this.props.count}`],
      ['描画', `${this.renderer.info.render.calls} calls  ${(this.renderer.info.render.triangles / 1000).toFixed(0)}k tris`],
    ]);

    this.renderer.render(this.scene, this.camera);
    input.endFrame();
  }
}

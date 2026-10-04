import * as THREE from 'three';
import { CONFIG } from './config.ts';
import { Input } from './core/Input.ts';
import { Loop } from './core/Loop.ts';
import { DebugHud } from './debug/DebugHud.ts';
import { FreeCamera } from './debug/FreeCamera.ts';
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

  /** プレイヤーを任意地点へ移動（地面の上に置く） */
  teleport(x: number, z: number, facing?: number): void {
    this.player.teleport(x, z, facing);
    this.terrain.updatePhysics(x, z);
    this.physics.step();
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
    this.player.update(dt, this.input, this.tpc.yaw, this.input.consumeJump());
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
    if (input.pressed('BracketLeft')) this.sky.hour = (this.sky.hour + 23) % 24;
    if (input.pressed('BracketRight')) this.sky.hour = (this.sky.hour + 1) % 24;

    const look = input.consumeLook();
    if (this.freeMode) this.free.look(look.dx, look.dy);
    else this.tpc.look(look.dx, look.dy, look.wheel);

    this.player.interpolated(alpha, this.renderPos);
    this.avatar.update(this.active ? frameDt : 0, this.renderPos, this.player.facing, this.player.velocity, this.player.mode);
    if (this.freeMode) {
      if (this.active) this.free.update(frameDt, input);
    } else {
      this.tpc.update(frameDt, this.renderPos, this.player.excludeCollider);
    }

    const focus = this.freeMode ? this.free.position : this.renderPos;
    this.terrain.updateRender(focus.x, focus.z);
    this.sky.update(this.active ? frameDt : 0, focus);
    this.grass.update(frameDt, focus);
    this.props.update(focus);
    this.water.update(frameDt);

    const p = this.player.position;
    const h = Math.floor(this.sky.hour);
    const m = Math.floor((this.sky.hour - h) * 60);
    this.hud.update(rawDt, [
      ['位置', `${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}`],
      ['カメラ', this.freeMode ? `フリー ${focus.x.toFixed(0)}, ${this.camera.position.y.toFixed(0)}, ${focus.z.toFixed(0)}` : '三人称'],
      ['状態', `${this.player.mode}  速度 ${Math.hypot(this.player.velocity.x, this.player.velocity.z).toFixed(1)} m/s`],
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

import * as THREE from 'three';
import { Sky as SkyShader } from 'three/addons/objects/Sky.js';
import { CONFIG } from '../config.ts';

/**
 * 空・太陽・環境光・フォグと昼夜サイクル。
 * hour は 0..24。6 時に日の出、18 時に日の入り。
 */
export class Sky {
  hour: number = CONFIG.time.startHour;
  readonly sun = new THREE.DirectionalLight(0xffffff, 3);
  private readonly moon = new THREE.DirectionalLight(0x8899cc, 0);
  private readonly hemi = new THREE.HemisphereLight(0xbfd8ff, 0x5a5040, 1);
  private readonly sky = new SkyShader();
  private readonly sunDir = new THREE.Vector3();
  private readonly fog: THREE.Fog;

  constructor(
    scene: THREE.Scene,
    private readonly renderer: THREE.WebGLRenderer,
  ) {
    this.sky.scale.setScalar(CONFIG.camera.far * 0.9);
    const u = this.sky.material.uniforms;
    u.turbidity.value = 6;
    u.rayleigh.value = 1.6;
    u.mieCoefficient.value = 0.005;
    u.mieDirectionalG.value = 0.8;
    scene.add(this.sky);

    this.sun.castShadow = true;
    const s = CONFIG.shadow;
    this.sun.shadow.mapSize.set(s.size, s.size);
    const cam = this.sun.shadow.camera;
    cam.left = cam.bottom = -s.extent;
    cam.right = cam.top = s.extent;
    cam.near = 1;
    cam.far = 600;
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.05;
    scene.add(this.sun, this.sun.target, this.moon, this.moon.target, this.hemi);

    this.fog = new THREE.Fog(0xbfd4e6, CONFIG.fog.near, CONFIG.fog.far);
    scene.fog = this.fog;
  }

  /** 太陽の高さ (-1..1)。正午で最大 */
  get sunHeight(): number {
    return this.sunDir.y;
  }

  update(dt: number, focus: THREE.Vector3): void {
    this.hour = (this.hour + (dt * 24) / CONFIG.time.dayLength) % 24;
    // 日の出 6 時に東 (+x)、正午に真上寄り、18 時に西へ沈む。軌道は少し南 (+z) に傾ける
    const a = ((this.hour - 6) / 24) * Math.PI * 2;
    this.sunDir.set(Math.cos(a), Math.sin(a), 0.35).normalize();
    this.sky.material.uniforms.sunPosition.value.copy(this.sunDir);

    const day = THREE.MathUtils.smoothstep(this.sunDir.y, -0.08, 0.25);
    const dusk = 1 - THREE.MathUtils.smoothstep(Math.abs(this.sunDir.y - 0.05), 0, 0.22);

    this.sun.intensity = 3.2 * day;
    this.sun.color.setHSL(0.1, 0.6 * dusk + 0.1, 0.55 + 0.4 * (1 - dusk));
    this.moon.intensity = 0.35 * (1 - day);
    this.hemi.intensity = 0.25 + 1.1 * day;

    // 影はプレイヤー周辺だけ。ライトはフォーカス点から光源方向へ離して置く
    const lightDir = this.sunDir.y > -0.05 ? this.sunDir : this.sunDir.clone().negate();
    const snap = 2; // 影のちらつきを抑えるためフォーカスを格子にスナップ
    const fx = Math.round(focus.x / snap) * snap;
    const fz = Math.round(focus.z / snap) * snap;
    this.sun.target.position.set(fx, focus.y, fz);
    this.sun.position.set(fx + lightDir.x * 300, focus.y + Math.max(0.1, lightDir.y) * 300, fz + lightDir.z * 300);
    this.moon.target.position.copy(this.sun.target.position);
    this.moon.position.set(fx - this.sunDir.x * 300, focus.y + 200, fz - this.sunDir.z * 300);

    const dayFog = new THREE.Color(0xbfd4e6);
    const duskFog = new THREE.Color(0xe0a27a);
    const nightFog = new THREE.Color(0x0d1626);
    const c = nightFog.clone().lerp(dayFog, day).lerp(duskFog, dusk * 0.6);
    this.fog.color.copy(c);
    this.renderer.toneMappingExposure = 0.35 + 0.35 * day;
  }
}

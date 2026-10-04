import * as THREE from 'three';
import type { Pose } from './poses.ts';

/**
 * プリミティブを関節の階層に組んだ人型キャラクター（全高約 1.8m、足元が原点、+Z が正面）。
 * 緑のチュニックに赤いマント、背中に剣を背負った旅人。
 *
 * 階層: root → body(傾き用) → hips → { thigh → shin → foot, spine → chest → { neck → head, upperArm → lowerArm → hand, cape } }
 */

const COLORS = {
  skin: 0xf1c7a2,
  hair: 0x6a3d22,
  tunic: 0x2e6a48,
  trim: 0xc9a24a,
  belt: 0x5a3a20,
  pants: 0xcdbb96,
  boots: 0x4b3020,
  gloves: 0x6e4a2c,
  cape: 0x9a2e2a,
  eye: 0x1e1a18,
  metal: 0xb9b2a4,
  scabbard: 0x3a2818,
};

const JOINTS = [
  'hips', 'spine', 'chest', 'neck', 'head',
  'upperArmL', 'lowerArmL', 'handL', 'upperArmR', 'lowerArmR', 'handR',
  'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR',
  'capeU', 'capeL',
] as const;
export type Joint = (typeof JOINTS)[number];

/** 腰の高さ (m) */
const HIP_HEIGHT = 0.965;

function mat(color: number, roughness = 0.85): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 });
}

/** マントの 1 枚: 上辺 top・下辺 bottom の台形で、背中に沿って横方向に少し丸める */
function capePanel(top: number, bottom: number, height: number): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(1, height, 6, 1).translate(0, -height / 2, 0);
  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const t = -pos.getY(i) / height; // 0 = 上辺, 1 = 下辺
    const x = pos.getX(i) * (top + (bottom - top) * t);
    pos.setXYZ(i, x, pos.getY(i), -6 * x * x * 0.35);
  }
  g.computeVertexNormals();
  return g;
}

export class CharacterModel {
  readonly root = new THREE.Group();
  /** 泳ぎ・旋回の傾き用（腰の高さを中心に回る） */
  private readonly body = new THREE.Group();
  readonly joints = {} as Record<Joint, THREE.Group>;
  private readonly eyes: THREE.Mesh[] = [];

  constructor() {
    const m = {
      skin: mat(COLORS.skin, 0.7),
      hair: mat(COLORS.hair, 0.9),
      tunic: mat(COLORS.tunic),
      trim: mat(COLORS.trim, 0.5),
      belt: mat(COLORS.belt, 0.7),
      pants: mat(COLORS.pants),
      boots: mat(COLORS.boots, 0.75),
      gloves: mat(COLORS.gloves, 0.8),
      cape: new THREE.MeshStandardMaterial({ color: COLORS.cape, roughness: 0.9, side: THREE.DoubleSide }),
      eye: mat(COLORS.eye, 0.3),
      metal: new THREE.MeshStandardMaterial({ color: COLORS.metal, roughness: 0.35, metalness: 0.8 }),
      scabbard: mat(COLORS.scabbard, 0.6),
    };
    for (const j of JOINTS) {
      this.joints[j] = new THREE.Group();
      this.joints[j].name = j;
    }
    const J = this.joints;
    const add = (parent: THREE.Object3D, geo: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0) => {
      const mesh = new THREE.Mesh(geo, material);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    };
    const capsule = (r: number, len: number) => new THREE.CapsuleGeometry(r, len, 4, 10);
    const joint = (parent: THREE.Object3D, j: Joint, x: number, y: number, z: number) => {
      J[j].position.set(x, y, z);
      parent.add(J[j]);
      return J[j];
    };

    // 傾きの中心を腰の高さにする
    this.body.position.y = HIP_HEIGHT;
    this.root.add(this.body);
    const hips = joint(this.body, 'hips', 0, 0, 0);

    // --- 腰まわり: チュニックの裾・ベルト ---
    add(hips, new THREE.CylinderGeometry(0.155, 0.2, 0.26, 14).scale(1, 1, 0.78), m.tunic, 0, -0.08, 0);
    add(hips, new THREE.TorusGeometry(0.2, 0.012, 6, 18).rotateX(Math.PI / 2).scale(1, 1, 0.78), m.trim, 0, -0.205, 0);
    add(hips, new THREE.CylinderGeometry(0.158, 0.158, 0.06, 14).scale(1, 1, 0.8), m.belt, 0, 0.06, 0);
    add(hips, new THREE.BoxGeometry(0.06, 0.05, 0.02), m.trim, 0, 0.06, 0.13);
    add(hips, new THREE.BoxGeometry(0.08, 0.1, 0.05), m.belt, 0.13, -0.01, 0.05); // ポーチ

    // --- 脚 ---
    for (const [side, sx] of [['L', 1], ['R', -1]] as const) {
      const thigh = joint(hips, `thigh${side}`, 0.095 * sx, -0.04, 0);
      add(thigh, capsule(0.075, 0.26), m.pants, 0, -0.2, 0);
      const shin = joint(thigh, `shin${side}`, 0, -0.42, 0);
      add(shin, capsule(0.064, 0.29), m.boots, 0, -0.21, 0);
      add(shin, new THREE.CylinderGeometry(0.078, 0.07, 0.07, 10), m.boots, 0, -0.03, 0); // ブーツの折り返し
      const foot = joint(shin, `foot${side}`, 0, -0.42, 0);
      add(foot, new THREE.BoxGeometry(0.11, 0.08, 0.25).translate(0, 0, 0.045), m.boots, 0, -0.045, 0);
    }

    // --- 胴 ---
    const spine = joint(hips, 'spine', 0, 0.05, 0);
    add(spine, new THREE.CylinderGeometry(0.15, 0.155, 0.2, 14).scale(1, 1, 0.75), m.tunic, 0, 0.1, 0);
    const chest = joint(spine, 'chest', 0, 0.2, 0);
    add(chest, new THREE.CylinderGeometry(0.19, 0.15, 0.3, 14).scale(1, 1, 0.72), m.tunic, 0, 0.13, 0);
    add(chest, new THREE.SphereGeometry(0.19, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.35, 0.72), m.tunic, 0, 0.28, 0);
    // 襟元の金の縁取りとV字の胸元
    add(chest, new THREE.TorusGeometry(0.075, 0.013, 6, 16).rotateX(Math.PI / 2), m.trim, 0, 0.3, 0.005);
    add(chest, new THREE.BoxGeometry(0.06, 0.1, 0.01).rotateX(-0.25), m.skin, 0, 0.25, 0.125);
    // 背中の剣（斜めに背負う）
    const sword = new THREE.Group();
    sword.position.set(0, 0.12, -0.15);
    sword.rotation.z = 0.6;
    chest.add(sword);
    add(sword, new THREE.BoxGeometry(0.07, 0.62, 0.035), m.scabbard, 0, -0.05, 0);
    add(sword, new THREE.BoxGeometry(0.075, 0.04, 0.04), m.metal, 0, -0.36, 0);
    add(sword, new THREE.BoxGeometry(0.2, 0.035, 0.045), m.metal, 0, 0.27, 0); // 鍔
    add(sword, new THREE.CylinderGeometry(0.018, 0.018, 0.14, 8), m.belt, 0, 0.35, 0); // 柄
    add(sword, new THREE.SphereGeometry(0.028, 8, 6), m.metal, 0, 0.43, 0);
    // 剣帯（たすき掛け）
    add(chest, new THREE.TorusGeometry(0.2, 0.012, 4, 24).scale(1, 1.35, 0.72).rotateZ(-0.6), m.belt, 0, 0.14, 0);

    // --- 首・頭 ---
    const neck = joint(chest, 'neck', 0, 0.32, 0);
    add(neck, new THREE.CylinderGeometry(0.048, 0.055, 0.1, 10), m.skin, 0, 0.03, 0);
    const head = joint(neck, 'head', 0, 0.08, 0);
    add(head, new THREE.SphereGeometry(0.115, 18, 14).scale(0.92, 1.05, 1), m.skin, 0, 0.11, 0.005);
    // 髪: 後頭部から頭頂を覆う半球 + 前髪 + 後ろ髪
    add(head, new THREE.SphereGeometry(0.125, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.55).scale(0.95, 1.05, 1.03), m.hair, 0, 0.125, -0.006);
    add(head, new THREE.SphereGeometry(0.1, 12, 8).scale(1.05, 0.9, 0.7), m.hair, 0, 0.08, -0.065);
    for (const [x, rz] of [[-0.05, 0.4], [0, 0], [0.05, -0.4], [0.075, -0.7], [-0.075, 0.7]] as const) {
      add(head, new THREE.ConeGeometry(0.035, 0.08, 5).rotateX(Math.PI).rotateZ(rz), m.hair, x, 0.2, 0.095);
    }
    for (const sx of [1, -1]) {
      const eye = add(head, new THREE.SphereGeometry(0.016, 8, 6).scale(1, 1.25, 0.6), m.eye, 0.04 * sx, 0.115, 0.1);
      this.eyes.push(eye);
      add(head, new THREE.BoxGeometry(0.04, 0.008, 0.01), m.hair, 0.042 * sx, 0.148, 0.103); // 眉
      add(head, new THREE.SphereGeometry(0.025, 8, 6).scale(0.5, 1, 0.8), m.skin, 0.105 * sx, 0.105, 0); // 耳
    }
    add(head, new THREE.ConeGeometry(0.014, 0.035, 6).rotateX(Math.PI / 2), m.skin, 0, 0.09, 0.115); // 鼻

    // --- 腕 ---
    for (const [side, sx] of [['L', 1], ['R', -1]] as const) {
      add(chest, new THREE.SphereGeometry(0.075, 12, 8), m.tunic, 0.2 * sx, 0.255, 0); // 肩
      const upper = joint(chest, `upperArm${side}`, 0.205 * sx, 0.25, 0);
      add(upper, capsule(0.055, 0.18), m.tunic, 0, -0.13, 0);
      const lower = joint(upper, `lowerArm${side}`, 0, -0.29, 0);
      add(lower, capsule(0.046, 0.17), m.skin, 0, -0.11, 0);
      add(lower, new THREE.CylinderGeometry(0.054, 0.05, 0.11, 10), m.gloves, 0, -0.18, 0); // 籠手
      const hand = joint(lower, `hand${side}`, 0, -0.245, 0);
      add(hand, new THREE.SphereGeometry(0.048, 10, 8).scale(0.8, 1.15, 1), m.gloves, 0, -0.04, 0.005);
    }

    // --- マント（上下 2 枚で、上はなびき、下はさらに折れる） ---
    const capeU = joint(chest, 'capeU', 0, 0.27, -0.135);
    add(capeU, capePanel(0.34, 0.38, 0.32), m.cape);
    const capeL = joint(capeU, 'capeL', 0, -0.32, 0);
    add(capeL, capePanel(0.38, 0.42, 0.24), m.cape);

    this.root.name = 'character';
  }

  /** ポーズを関節に適用する。無いチャンネルは 0 */
  apply(pose: Pose): void {
    const J = this.joints;
    for (const j of JOINTS) J[j].rotation.set(pose[`${j}.x`] ?? 0, pose[`${j}.y`] ?? 0, pose[`${j}.z`] ?? 0);
    J.hips.position.y = pose.hipsY ?? 0;
    this.body.rotation.set(pose.rootPitch ?? 0, 0, pose.rootRoll ?? 0);
    const blink = 1 - 0.85 * (pose.blink ?? 0);
    for (const e of this.eyes) e.scale.y = blink;
  }
}

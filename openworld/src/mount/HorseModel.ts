import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Pose } from '../player/character/poses.ts';
import { LEGS } from './horsePoses.ts';

/**
 * プリミティブを関節の階層に組んだ馬（き甲の高さ約 1.55m、足元が原点、+Z が正面）。鞍と頭絡を付けている。
 *
 * 階層: root → body(上下・傾き) → { neck → head → ear, tail, 脚 x4: upper → lower → hoof }
 * 描画負荷を抑えるため、関節ごと・材質ごとにジオメトリを 1 つにまとめる。
 */

export type Coat = 'bay' | 'chestnut' | 'black' | 'grey' | 'dun';
export const COATS: Coat[] = ['bay', 'chestnut', 'black', 'grey', 'dun'];

/** 毛色: 体 / たてがみ・尾 / 脚先 */
const COAT_COLORS: Record<Coat, [number, number, number]> = {
  bay: [0x7a4526, 0x1e1713, 0x2a1f19], // 鹿毛
  chestnut: [0x9a5226, 0x7a3a18, 0x8a4a22], // 栗毛
  black: [0x2a2523, 0x151211, 0x1d1917], // 青毛
  grey: [0xd8d3cb, 0xbdb6ac, 0xa9a198], // 芦毛
  dun: [0xc39f6e, 0x3a2b1e, 0x4a3828], // 河原毛
};

const COLORS = {
  hoof: 0x2e2722,
  eye: 0x120e0c,
  leather: 0x5a3820,
  darkLeather: 0x3a2414,
  blanket: 0x2c4f7a,
  trim: 0xc9a24a,
  metal: 0xb9b2a4,
};

/** 胴（上下・傾きの中心）の高さ */
const BODY_Y = 1.2;

type JointName = 'neck' | 'head' | 'earL' | 'earR' | 'tail' | `${(typeof LEGS)[number]}.${'upper' | 'lower' | 'hoof'}`;

function mat(color: number, roughness = 0.8, metalness = 0): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

export class HorseModel {
  readonly root = new THREE.Group();
  /** 胴。上下動・前後の傾き・左右の傾きを受け持つ */
  private readonly body = new THREE.Group();
  private readonly joints = new Map<JointName, THREE.Group>();
  /** 鞍の座面（乗り手の腰の位置） */
  readonly saddle = new THREE.Object3D();
  /** 手綱の付け根（ハミの左右） */
  readonly bitL = new THREE.Object3D();
  readonly bitR = new THREE.Object3D();
  /** 関節ごと・材質ごとにまとめる前のジオメトリ */
  private readonly pending = new Map<THREE.Object3D, Map<THREE.Material, THREE.BufferGeometry[]>>();

  constructor(coat: Coat = 'bay') {
    const [coatColor, maneColor, legColor] = COAT_COLORS[coat];
    const m = {
      coat: mat(coatColor, 0.65),
      mane: mat(maneColor, 0.9),
      leg: mat(legColor, 0.7),
      hoof: mat(COLORS.hoof, 0.6),
      eye: mat(COLORS.eye, 0.25),
      leather: mat(COLORS.leather, 0.6),
      darkLeather: mat(COLORS.darkLeather, 0.6),
      blanket: new THREE.MeshStandardMaterial({ color: COLORS.blanket, roughness: 0.95, side: THREE.DoubleSide }),
      trim: mat(COLORS.trim, 0.45, 0.3),
      metal: mat(COLORS.metal, 0.35, 0.8),
    };
    const add = (parent: THREE.Object3D, geo: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0) => {
      let byMat = this.pending.get(parent);
      if (!byMat) this.pending.set(parent, (byMat = new Map()));
      let list = byMat.get(material);
      if (!list) byMat.set(material, (list = []));
      list.push(geo.translate(x, y, z));
    };
    const joint = (parent: THREE.Object3D, name: JointName, x: number, y: number, z: number) => {
      const g = new THREE.Group();
      g.name = name;
      g.position.set(x, y, z);
      parent.add(g);
      this.joints.set(name, g);
      return g;
    };
    const sphere = (r: number, sx = 1, sy = 1, sz = 1) => new THREE.SphereGeometry(r, 14, 10).scale(sx, sy, sz);
    /** Z 方向に寝かせた円柱（rTop が +Z 側） */
    const zcyl = (rTop: number, rBottom: number, len: number, seg = 12) => new THREE.CylinderGeometry(rTop, rBottom, len, seg).rotateX(Math.PI / 2);
    /** 下へ垂れる円柱（上端が原点） */
    const hang = (rTop: number, rBottom: number, len: number, seg = 10) => new THREE.CylinderGeometry(rTop, rBottom, len, seg).translate(0, -len / 2, 0);

    this.body.position.y = BODY_Y;
    this.root.add(this.body);
    // 胴の中の座標は地面基準で書けるように、子の原点を地面に戻す
    const b = new THREE.Group();
    b.position.y = -BODY_Y;
    this.body.add(b);

    // --- 胴 ---
    add(b, new THREE.CapsuleGeometry(0.34, 0.95, 6, 16).rotateX(Math.PI / 2).scale(0.88, 1, 1), m.coat, 0, 1.2, -0.02);
    add(b, sphere(0.37, 0.86, 1, 0.9), m.coat, 0, 1.17, 0.6); // 胸
    add(b, sphere(0.39, 0.95, 0.92, 1), m.coat, 0, 1.25, -0.6); // 尻
    add(b, sphere(0.22, 0.8, 1, 1.4), m.coat, 0, 1.4, 0.42); // き甲
    for (const sx of [1, -1]) {
      add(b, sphere(0.2, 0.6, 1.3, 1), m.coat, 0.15 * sx, 1.02, 0.6); // 肩の筋肉
      add(b, sphere(0.24, 0.6, 1.2, 1.05), m.coat, 0.15 * sx, 1.08, -0.6); // 腿の筋肉
    }

    // --- 鞍（鞍下の毛布・座面・前橋・後橋・あぶみ） ---
    add(b, new THREE.CylinderGeometry(0.37, 0.37, 0.68, 18, 1, true, Math.PI - 1.15, 2.3).rotateX(Math.PI / 2), m.blanket, 0, 1.2, -0.04);
    add(b, new THREE.CylinderGeometry(0.375, 0.375, 0.66, 18, 1, true, Math.PI - 1.16, 0.05).rotateX(Math.PI / 2), m.trim, 0, 1.2, -0.04);
    add(b, new THREE.CylinderGeometry(0.375, 0.375, 0.66, 18, 1, true, Math.PI + 1.11, 0.05).rotateX(Math.PI / 2), m.trim, 0, 1.2, -0.04);
    add(b, new THREE.CylinderGeometry(0.395, 0.395, 0.5, 16, 1, false, Math.PI - 0.75, 1.5).rotateX(Math.PI / 2), m.leather, 0, 1.2, -0.04);
    add(b, new THREE.BoxGeometry(0.2, 0.12, 0.08).rotateX(0.3), m.darkLeather, 0, 1.62, 0.22); // 前橋
    add(b, new THREE.BoxGeometry(0.3, 0.13, 0.07).rotateX(-0.35), m.darkLeather, 0, 1.63, -0.3); // 後橋
    for (const sx of [1, -1]) {
      add(b, new THREE.BoxGeometry(0.025, 0.46, 0.045), m.darkLeather, 0.37 * sx, 1.33, 0.0);
      add(b, new THREE.TorusGeometry(0.055, 0.012, 5, 10).rotateY(Math.PI / 2), m.metal, 0.37 * sx, 1.07, 0.0);
    }
    add(b, new THREE.CylinderGeometry(0.352, 0.352, 0.07, 18, 1, true).rotateX(Math.PI / 2).scale(0.9, 1, 1), m.darkLeather, 0, 1.2, 0.18); // 腹帯
    this.saddle.position.set(0, 1.6, -0.05);
    b.add(this.saddle);

    // --- 脚（前: 肩 → 膝 → 球節、後: 股 → 飛節 → 球節） ---
    for (const leg of LEGS) {
      const front = leg[0] === 'f';
      const sx = leg[1] === 'l' ? 1 : -1;
      const upper = joint(b, `${leg}.upper`, 0.19 * sx, front ? 1.08 : 1.12, front ? 0.62 : -0.64);
      if (front) {
        add(upper, hang(0.1, 0.06, 0.48), m.coat);
        add(upper, sphere(0.065), m.leg, 0, -0.48, 0); // 膝
      } else {
        add(upper, hang(0.13, 0.065, 0.5), m.coat);
        add(upper, sphere(0.06, 1, 1, 1.3), m.leg, 0, -0.5, -0.02); // 飛節
      }
      const lower = joint(upper, `${leg}.lower`, 0, front ? -0.48 : -0.5, 0);
      add(lower, hang(0.05, 0.043, front ? 0.44 : 0.46), m.leg);
      const hoof = joint(lower, `${leg}.hoof`, 0, front ? -0.44 : -0.46, 0);
      add(hoof, sphere(0.052), m.leg); // 球節
      add(hoof, hang(0.045, 0.05, 0.1).rotateX(-0.25), m.leg);
      add(hoof, new THREE.CylinderGeometry(0.058, 0.074, 0.075, 12), m.hoof, 0, -0.125, 0.02);
    }

    // --- 首・たてがみ ---
    const neck = joint(b, 'neck', 0, 1.36, 0.74);
    add(neck, new THREE.CylinderGeometry(0.15, 0.25, 0.82, 14).translate(0, 0.41, 0).scale(0.72, 1, 1), m.coat);
    add(neck, sphere(0.16, 0.7, 1, 0.9), m.coat, 0, 0.8, 0); // うなじ
    add(neck, new THREE.BoxGeometry(0.07, 0.78, 0.1).translate(0, 0.42, 0), m.mane, 0.03, 0, -0.15);
    add(neck, new THREE.BoxGeometry(0.04, 0.7, 0.06).translate(0, 0.42, 0).rotateZ(0.08), m.mane, 0.07, 0, -0.13);

    // --- 頭（局所座標で +Z が鼻先） ---
    const head = joint(neck, 'head', 0, 0.82, 0);
    add(head, zcyl(0.085, 0.13, 0.6, 12).scale(0.82, 1.15, 1), m.coat, 0, 0, 0.24);
    add(head, sphere(0.14, 0.85, 1, 1), m.coat, 0, 0, -0.02); // 頭頂
    add(head, sphere(0.11, 0.85, 0.9, 1), m.coat, 0, -0.07, 0.04); // 頬
    add(head, sphere(0.095, 0.95, 0.85, 1), m.coat, 0, -0.01, 0.53); // 鼻先
    add(head, sphere(0.045, 1, 0.45, 1.6), m.mane, 0, 0.135, -0.04); // 前髪
    for (const sx of [1, -1]) {
      add(head, sphere(0.024, 0.6, 1, 1), m.eye, 0.105 * sx, 0.05, 0.12);
      add(head, sphere(0.018, 0.5, 1, 1), m.eye, 0.07 * sx, -0.01, 0.6); // 鼻孔
      const ear = joint(head, sx > 0 ? 'earL' : 'earR', 0.065 * sx, 0.12, -0.05);
      add(ear, new THREE.ConeGeometry(0.035, 0.15, 6).scale(1, 1, 0.6).translate(0, 0.07, 0).rotateX(-0.9).rotateZ(-0.2 * sx), m.coat);
    }
    // 頭絡（鼻革・頬革・項革）とハミ
    add(head, new THREE.TorusGeometry(0.1, 0.012, 5, 16).scale(0.9, 1.05, 1), m.darkLeather, 0, -0.01, 0.4);
    add(head, new THREE.TorusGeometry(0.13, 0.012, 5, 16).rotateX(0.35).scale(0.95, 1, 1), m.darkLeather, 0, 0.0, 0.03);
    for (const sx of [1, -1]) {
      add(head, new THREE.BoxGeometry(0.015, 0.025, 0.38).rotateX(0.12), m.darkLeather, 0.1 * sx, -0.02, 0.22);
      add(head, sphere(0.022), m.metal, 0.085 * sx, -0.07, 0.46);
    }
    this.bitL.position.set(0.09, -0.07, 0.46);
    this.bitR.position.set(-0.09, -0.07, 0.46);
    head.add(this.bitL, this.bitR);

    // --- 尾 ---
    const tail = joint(b, 'tail', 0, 1.36, -0.96);
    add(tail, hang(0.06, 0.05, 0.22), m.mane);
    add(tail, hang(0.07, 0.15, 0.8, 10).scale(1, 1, 0.55), m.mane, 0, -0.18, 0);

    // 関節ごと・材質ごとに 1 つのメッシュにまとめる
    for (const [parent, byMat] of this.pending) {
      for (const [material, geos] of byMat) {
        const mesh = new THREE.Mesh(geos.length === 1 ? geos[0] : mergeGeometries(geos), material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        parent.add(mesh);
      }
    }
    this.pending.clear();
    this.root.name = 'horse';
  }

  /** ポーズを関節に適用する。無いチャンネルは 0 */
  apply(pose: Pose): void {
    for (const [name, g] of this.joints) {
      const key = name === 'earL' || name === 'earR' ? 'ear' : name;
      g.rotation.set(pose[`${key}.x`] ?? 0, pose[`${key}.y`] ?? 0, pose[`${key}.z`] ?? 0);
    }
    this.body.position.y = BODY_Y + (pose.bodyY ?? 0);
    this.body.rotation.set(pose.bodyPitch ?? 0, 0, pose.bodyRoll ?? 0);
  }
}

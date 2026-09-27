import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32 } from '../core/random.ts';
import type { ObjectType } from '../worldgen/catalog.ts';
import type { ComposedWorld } from '../worldgen/compose.ts';

/**
 * 配置物の描画。区画・種類・パーツ（色）ごとに InstancedMesh にまとめて描く。
 * モデルは仮のプリミティブ。正面は +Z（rotation 0 で +Z を向く）。
 */

interface Part {
  geo: THREE.BufferGeometry;
  color: number;
  emissive?: number;
  /** インスタンスごとの明るさのばらつき */
  vary?: number;
}

const C = {
  trunk: 0x6b4a2f,
  pine: 0x2f5d3a,
  oak: 0x4d7f34,
  bush: 0x5b8c3a,
  stone: 0x8a8580,
  wall: 0xe6dcc3,
  roof: 0xa8452f,
  wood: 0x7a5a3a,
  water: 0x3a7fb0,
};

const at = (g: THREE.BufferGeometry, x: number, y: number, z: number) => g.translate(x, y, z);
const merge = (...gs: THREE.BufferGeometry[]) => mergeGeometries(gs.map((g) => (g.index ? g.toNonIndexed() : g)));

function cyl(rTop: number, rBottom: number, h: number, seg = 8): THREE.BufferGeometry {
  return new THREE.CylinderGeometry(rTop, rBottom, h, seg);
}

function gableRoof(width: number, height: number, length: number): THREE.BufferGeometry {
  const shape = new THREE.Shape([
    new THREE.Vector2(-width / 2, 0),
    new THREE.Vector2(width / 2, 0),
    new THREE.Vector2(0, height),
  ]);
  const g = new THREE.ExtrudeGeometry(shape, { depth: length, bevelEnabled: false });
  g.translate(0, 0, -length / 2);
  g.rotateY(Math.PI / 2);
  return g;
}

function buildModels(): Record<ObjectType, Part[]> {
  return {
    pine: [
      { geo: at(cyl(0.22, 0.35, 3, 6), 0, 1.5, 0), color: C.trunk },
      {
        geo: merge(
          at(new THREE.ConeGeometry(2.4, 4, 7), 0, 4, 0),
          at(new THREE.ConeGeometry(1.9, 3.5, 7), 0, 6, 0),
          at(new THREE.ConeGeometry(1.3, 3, 7), 0, 8, 0),
        ),
        color: C.pine,
        vary: 0.15,
      },
    ],
    oak: [
      { geo: at(cyl(0.3, 0.45, 3.6, 6), 0, 1.8, 0), color: C.trunk },
      {
        geo: merge(
          at(new THREE.IcosahedronGeometry(3, 0).scale(1, 0.8, 1), 0, 5.4, 0),
          at(new THREE.IcosahedronGeometry(2, 0), 1.3, 6.4, 0.6),
          at(new THREE.IcosahedronGeometry(1.8, 0), -1.2, 6.1, -0.8),
        ),
        color: C.oak,
        vary: 0.15,
      },
    ],
    bush: [{ geo: at(new THREE.IcosahedronGeometry(0.9, 0).scale(1, 0.7, 1), 0, 0.4, 0), color: C.bush, vary: 0.15 }],
    rock: [{ geo: at(new THREE.DodecahedronGeometry(0.75, 0).scale(1, 0.7, 1.1), 0, 0.25, 0), color: C.stone, vary: 0.1 }],
    boulder: [{ geo: at(new THREE.DodecahedronGeometry(2.3, 0).scale(1.1, 0.75, 1), 0, 1, 0), color: C.stone, vary: 0.1 }],
    house: [
      { geo: at(new THREE.BoxGeometry(8, 4, 6), 0, 2, 0), color: C.wall },
      { geo: at(gableRoof(6.8, 2.5, 8.8), 0, 4, 0), color: C.roof },
      { geo: at(new THREE.BoxGeometry(1.2, 2.2, 0.1), 0, 1.1, 3.02), color: C.wood },
    ],
    tower: [
      { geo: at(cyl(2.2, 2.5, 12, 10), 0, 6, 0), color: C.stone },
      { geo: at(cyl(3.2, 3.2, 0.6, 10), 0, 12.3, 0), color: C.wood },
      { geo: at(new THREE.ConeGeometry(3.4, 3, 10), 0, 14.1, 0), color: C.roof },
    ],
    well: [
      { geo: at(cyl(1.1, 1.1, 1, 12), 0, 0.5, 0), color: C.stone },
      { geo: at(new THREE.CircleGeometry(0.9, 12).rotateX(-Math.PI / 2), 0, 0.85, 0), color: C.water },
      {
        geo: merge(
          at(new THREE.BoxGeometry(0.15, 2.2, 0.15), -1, 1.1, 0),
          at(new THREE.BoxGeometry(0.15, 2.2, 0.15), 1, 1.1, 0),
          at(new THREE.BoxGeometry(2.6, 0.12, 1.4), 0, 2.2, 0),
        ),
        color: C.wood,
      },
    ],
    sign: [
      {
        geo: merge(at(new THREE.BoxGeometry(0.15, 1.6, 0.15), 0, 0.8, 0), at(new THREE.BoxGeometry(1.2, 0.6, 0.08), 0, 1.5, 0.05)),
        color: C.wood,
      },
    ],
    campfire: [
      {
        geo: merge(
          at(cyl(0.08, 0.08, 1, 5).rotateZ(Math.PI / 2), 0, 0.1, 0),
          at(cyl(0.08, 0.08, 1, 5).rotateZ(Math.PI / 2).rotateY(Math.PI / 3), 0, 0.15, 0),
          at(cyl(0.08, 0.08, 1, 5).rotateZ(Math.PI / 2).rotateY(-Math.PI / 3), 0, 0.2, 0),
        ),
        color: C.wood,
      },
      { geo: at(new THREE.ConeGeometry(0.35, 0.9, 6), 0, 0.55, 0), color: 0xff8a20, emissive: 0xff6a00 },
    ],
    marker: [{ geo: at(new THREE.SphereGeometry(0.6, 10, 8), 0, 1, 0), color: 0xff00ff, emissive: 0xaa00aa }],
  };
}

const SINK: Partial<Record<ObjectType, number>> = { pine: 0.3, oak: 0.3, bush: 0.2, rock: 0.15, boulder: 0.5 };

/** 区画の一辺 (m)。区画ごとに InstancedMesh を分けて視錐台カリング（影の描画も含む）を効かせる */
const SECTOR = 256;

export class Props {
  private readonly markers: THREE.InstancedMesh[] = [];
  readonly count: number;

  constructor(scene: THREE.Scene, world: ComposedWorld) {
    const models = buildModels();
    const groups = new Map<string, { type: ObjectType; objects: typeof world.objects }>();
    for (const o of world.objects) {
      const key = `${o.type}:${Math.floor(o.x / SECTOR)},${Math.floor(o.z / SECTOR)}`;
      let g = groups.get(key);
      if (!g) groups.set(key, (g = { type: o.type, objects: [] }));
      g.objects.push(o);
    }
    this.count = world.objects.length;
    const materials = new Map<Part, THREE.MeshLambertMaterial>();
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const color = new THREE.Color();
    for (const [key, { type, objects }] of groups) {
      const rand = mulberry32(objects.length * 7919 + key.length);
      for (const part of models[type]) {
        let mat = materials.get(part);
        if (!mat) {
          mat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
          if (part.emissive) mat.emissive = new THREE.Color(part.emissive);
          materials.set(part, mat);
        }
        const mesh = new THREE.InstancedMesh(part.geo, mat, objects.length);
        objects.forEach((o, i) => {
          q.setFromAxisAngle(up, o.rotation);
          const s = o.scale;
          m.compose(new THREE.Vector3(o.x, o.y - (SINK[type] ?? 0) * s, o.z), q, new THREE.Vector3(s, s, s));
          mesh.setMatrixAt(i, m);
          color.set(part.color).multiplyScalar(1 + (rand() - 0.5) * 2 * (part.vary ?? 0));
          mesh.setColorAt(i, color);
        });
        mesh.computeBoundingSphere();
        mesh.castShadow = type !== 'marker';
        mesh.receiveShadow = true;
        mesh.name = `props-${key}`;
        if (type === 'marker') {
          mesh.visible = false;
          this.markers.push(mesh);
        }
        scene.add(mesh);
      }
    }
  }

  /** marker（イベント用の目印）の表示切り替え（デバッグ用） */
  setMarkersVisible(v: boolean): void {
    this.markers.forEach((m) => (m.visible = v));
  }
}

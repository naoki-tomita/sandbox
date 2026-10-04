import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32 } from '../core/random.ts';
import type { ObjectType } from '../worldgen/catalog.ts';
import type { ComposedWorld } from '../worldgen/compose.ts';
import { SURFACE_INDEX } from '../worldgen/surface.ts';
import type { TextureSet } from './textureSet.ts';
import { patternLayer, type PropPattern } from './textures.ts';

/**
 * 配置物の描画。区画・種類・パーツ（色 + 模様）ごとに InstancedMesh にまとめて描く。
 * モデルはプリミティブの組み合わせ。正面は +Z（rotation 0 で +Z を向く）。
 * 模様はワールド座標の三方向投影で貼る（UV 不要。回転しても板目は水平のまま）。
 */

interface Part {
  geo: THREE.BufferGeometry;
  color: number;
  /** 模様（テクスチャ配列の層）。'rock' は地表の岩テクスチャ */
  pattern?: PropPattern | 'rock';
  /** 模様 1 枚が覆う大きさ (m) */
  tile?: number;
  emissive?: number;
  /** インスタンスごとの明るさのばらつき */
  vary?: number;
}

const C = {
  trunk: 0x6b4a2f,
  pine: 0x2f5a38,
  oak: 0x4f7d34,
  bush: 0x557f36,
  stone: 0x9a948c,
  darkStone: 0x77726c,
  wall: 0xe8dfc8,
  roof: 0xa8452f,
  wood: 0x8a643e,
  darkWood: 0x4e3622,
  window: 0x2a3848,
  water: 0x3a7fb0,
  canvas: 0xd6c8a4,
  red: 0xb8322a,
  white: 0xf2efe8,
};

const at = (g: THREE.BufferGeometry, x: number, y: number, z: number) => g.translate(x, y, z);
const merge = (...gs: THREE.BufferGeometry[]) =>
  mergeGeometries(gs.map((g) => (g.index ? g.toNonIndexed() : g)).map((g) => (g.deleteAttribute('uv'), g)));
const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const cyl = (rTop: number, rBottom: number, h: number, seg = 8) => new THREE.CylinderGeometry(rTop, rBottom, h, seg);

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

/** 少し歪ませた塊（葉のかたまり・岩） */
function lump(radius: number, detail: number, seed: number, amount = 0.18): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(radius, detail);
  const rand = mulberry32(seed);
  const pos = g.getAttribute('position');
  const seen = new Map<string, number>();
  for (let i = 0; i < pos.count; i++) {
    const key = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
    let k = seen.get(key);
    if (k === undefined) seen.set(key, (k = 1 + (rand() - 0.5) * 2 * amount));
    pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k, pos.getZ(i) * k);
  }
  g.computeVertexNormals();
  return g;
}

function buildModels(): Record<ObjectType, Part[]> {
  const fencePosts = (len: number, count: number, h: number) =>
    Array.from({ length: count }, (_, i) => at(box(0.14, h, 0.14), -len / 2 + (len * i) / (count - 1), h / 2, 0));
  return {
    pine: [
      { geo: at(cyl(0.2, 0.36, 3.2, 7), 0, 1.6, 0), color: C.trunk, pattern: 'bark', tile: 1.5 },
      {
        geo: merge(
          at(new THREE.ConeGeometry(2.6, 3.6, 8).rotateY(0.3), 0, 3.4, 0),
          at(new THREE.ConeGeometry(2.2, 3.4, 8).rotateY(0.9), 0.1, 5.0, 0.05),
          at(new THREE.ConeGeometry(1.7, 3.0, 8).rotateY(0.2), -0.05, 6.6, 0),
          at(new THREE.ConeGeometry(1.1, 2.6, 7).rotateY(1.3), 0, 8.1, -0.05),
          at(new THREE.ConeGeometry(0.55, 1.6, 6), 0, 9.4, 0),
        ),
        color: C.pine,
        pattern: 'leaves',
        tile: 2,
        vary: 0.15,
      },
    ],
    oak: [
      {
        geo: merge(
          at(cyl(0.3, 0.5, 3.8, 7), 0, 1.9, 0),
          at(cyl(0.12, 0.2, 2.2, 5).rotateZ(0.8), 0.8, 3.8, 0),
          at(cyl(0.12, 0.2, 2.0, 5).rotateZ(-0.7).rotateY(1.2), -0.5, 3.7, 0.5),
        ),
        color: C.trunk,
        pattern: 'bark',
        tile: 1.5,
      },
      {
        geo: merge(
          at(lump(2.6, 1, 1).scale(1.1, 0.8, 1.1), 0, 5.6, 0),
          at(lump(1.9, 1, 2), 1.8, 5.2, 0.6),
          at(lump(1.8, 1, 3), -1.5, 5.3, -0.9),
          at(lump(1.7, 1, 4), 0.2, 6.9, -0.6),
          at(lump(1.5, 1, 5), -0.6, 5.0, 1.6),
        ),
        color: C.oak,
        pattern: 'leaves',
        tile: 2.5,
        vary: 0.15,
      },
    ],
    bush: [
      {
        geo: merge(at(lump(0.8, 1, 6).scale(1, 0.75, 1), 0, 0.45, 0), at(lump(0.55, 1, 7), 0.55, 0.35, 0.3)),
        color: C.bush,
        pattern: 'leaves',
        tile: 1.2,
        vary: 0.15,
      },
    ],
    rock: [{ geo: at(lump(0.75, 1, 8, 0.25).scale(1, 0.7, 1.1), 0, 0.25, 0), color: C.stone, pattern: 'rock', tile: 3, vary: 0.1 }],
    boulder: [{ geo: at(lump(2.3, 1, 9, 0.22).scale(1.1, 0.75, 1), 0, 1, 0), color: C.stone, pattern: 'rock', tile: 6, vary: 0.1 }],
    house: [
      { geo: at(box(8.4, 0.7, 6.4), 0, 0.35, 0), color: C.darkStone, pattern: 'stonework', tile: 2.5 },
      { geo: at(box(8, 3.6, 6), 0, 2.5, 0), color: C.wall, pattern: 'plaster', tile: 4, vary: 0.05 },
      {
        geo: merge(
          // 柱と梁（ハーフティンバー）
          ...[-4, 4].flatMap((x) => [-3, 3].map((z) => at(box(0.28, 3.6, 0.28), x, 2.5, z))),
          at(box(8.2, 0.22, 0.12), 0, 2.5, 3.02),
          at(box(8.2, 0.22, 0.12), 0, 2.5, -3.02),
          at(box(0.12, 0.22, 6.2), 4.02, 2.5, 0),
          at(box(0.12, 0.22, 6.2), -4.02, 2.5, 0),
          at(box(8.3, 0.25, 6.3), 0, 4.3, 0),
          // 扉と窓枠
          at(box(1.3, 2.3, 0.1), 0, 1.85, 3.04),
          ...[-2.6, 2.6].flatMap((x) => [at(box(1.2, 1.1, 0.1), x, 2.9, 3.03), at(box(1.2, 1.1, 0.1), x, 2.9, -3.03)]),
          at(box(0.1, 1.1, 1.2), 4.03, 2.9, 0),
          at(box(0.1, 1.1, 1.2), -4.03, 2.9, 0),
        ),
        color: C.darkWood,
        pattern: 'wood',
        tile: 2,
      },
      {
        geo: merge(
          at(box(0.95, 0.85, 0.12), -2.6, 2.9, 3.06),
          at(box(0.95, 0.85, 0.12), 2.6, 2.9, 3.06),
          at(box(0.95, 0.85, 0.12), -2.6, 2.9, -3.06),
          at(box(0.95, 0.85, 0.12), 2.6, 2.9, -3.06),
          at(box(0.12, 0.85, 0.95), 4.06, 2.9, 0),
          at(box(0.12, 0.85, 0.95), -4.06, 2.9, 0),
        ),
        color: C.window,
      },
      { geo: at(box(1.0, 2.0, 0.08), 0, 1.75, 3.1), color: C.wood, pattern: 'wood', tile: 1.5 },
      { geo: at(gableRoof(7.4, 2.7, 9.2), 0, 4.4, 0), color: C.roof, pattern: 'rooftile', tile: 2.5, vary: 0.08 },
      { geo: at(box(0.75, 2.2, 0.75), 2.4, 6.3, -1.2), color: C.darkStone, pattern: 'stonework', tile: 1.5 },
    ],
    tower: [
      { geo: at(cyl(2.2, 2.6, 12, 12), 0, 6, 0), color: C.stone, pattern: 'stonework', tile: 3 },
      { geo: at(cyl(3.2, 3.2, 0.6, 12), 0, 12.3, 0), color: C.wood, pattern: 'wood', tile: 2 },
      {
        geo: merge(...Array.from({ length: 8 }, (_, i) => at(box(0.2, 1.4, 0.2), Math.cos((i / 8) * Math.PI * 2) * 3, 13.3, Math.sin((i / 8) * Math.PI * 2) * 3))),
        color: C.darkWood,
      },
      { geo: at(new THREE.ConeGeometry(3.6, 3.2, 12), 0, 15.6, 0), color: C.roof, pattern: 'rooftile', tile: 2 },
      { geo: merge(at(box(0.5, 1.2, 0.3), 0, 8, 2.45), at(box(0.3, 1.2, 0.5), 2.45, 5, 0), at(box(1.2, 2.2, 0.3), 0, 1.1, 2.55)), color: C.window },
    ],
    well: [
      { geo: at(cyl(1.1, 1.15, 1, 14), 0, 0.5, 0), color: C.stone, pattern: 'stonework', tile: 1.5 },
      { geo: at(new THREE.CircleGeometry(0.9, 14).rotateX(-Math.PI / 2), 0, 0.85, 0), color: C.water },
      {
        geo: merge(
          at(box(0.15, 2.2, 0.15), -1, 1.1, 0),
          at(box(0.15, 2.2, 0.15), 1, 1.1, 0),
          at(cyl(0.12, 0.12, 2, 6).rotateZ(Math.PI / 2), 0, 1.7, 0),
        ),
        color: C.wood,
        pattern: 'wood',
        tile: 1.5,
      },
      { geo: at(gableRoof(1.8, 0.8, 2.6), 0, 2.2, 0), color: C.roof, pattern: 'rooftile', tile: 1.5 },
    ],
    sign: [
      {
        geo: merge(at(box(0.15, 1.6, 0.15), 0, 0.8, 0), at(box(1.2, 0.6, 0.08), 0, 1.5, 0.05)),
        color: C.wood,
        pattern: 'wood',
        tile: 1,
      },
    ],
    campfire: [
      {
        geo: merge(
          ...Array.from({ length: 8 }, (_, i) => at(lump(0.18, 0, 20 + i), Math.cos((i / 8) * Math.PI * 2) * 0.75, 0.08, Math.sin((i / 8) * Math.PI * 2) * 0.75)),
        ),
        color: C.darkStone,
        pattern: 'rock',
        tile: 1,
      },
      {
        geo: merge(
          at(cyl(0.08, 0.08, 1, 5).rotateZ(Math.PI / 2), 0, 0.1, 0),
          at(cyl(0.08, 0.08, 1, 5).rotateZ(Math.PI / 2).rotateY(Math.PI / 3), 0, 0.15, 0),
          at(cyl(0.08, 0.08, 1, 5).rotateZ(Math.PI / 2).rotateY(-Math.PI / 3), 0, 0.2, 0),
        ),
        color: C.darkWood,
        pattern: 'bark',
        tile: 1,
      },
      { geo: merge(at(new THREE.ConeGeometry(0.35, 0.9, 6), 0, 0.55, 0), at(new THREE.ConeGeometry(0.2, 0.6, 5), 0.15, 0.5, 0.1)), color: 0xff8a20, emissive: 0xff6a00 },
    ],
    marker: [{ geo: at(new THREE.SphereGeometry(0.6, 10, 8), 0, 1, 0), color: 0xff00ff, emissive: 0xaa00aa }],
    lighthouse: [
      { geo: at(cyl(3.4, 3.6, 1.2, 16), 0, 0.6, 0), color: C.darkStone, pattern: 'stonework', tile: 2 },
      {
        geo: merge(at(cyl(2.55, 3, 5, 16), 0, 3.7, 0), at(cyl(1.95, 2.25, 4, 16), 0, 12.2, 0)),
        color: C.white,
        pattern: 'plaster',
        tile: 3,
      },
      { geo: merge(at(cyl(2.25, 2.55, 4.2, 16), 0, 8.1, 0), at(cyl(1.8, 1.95, 1.2, 16), 0, 14.8, 0)), color: C.red, pattern: 'plaster', tile: 3 },
      { geo: at(cyl(2.8, 2.8, 0.35, 16), 0, 15.6, 0), color: C.darkWood, pattern: 'wood', tile: 2 },
      { geo: at(cyl(1.4, 1.4, 2.0, 10), 0, 16.8, 0), color: 0xfff2b0, emissive: 0xffc860 },
      { geo: at(new THREE.ConeGeometry(1.8, 1.8, 12), 0, 18.7, 0), color: C.red },
      { geo: merge(at(box(0.9, 2.1, 0.3), 0, 2.2, 3.0), at(box(0.5, 0.9, 0.3), 0, 7.5, 2.5), at(box(0.5, 0.9, 0.3), 0, 11.5, 2.15)), color: C.window },
    ],
    pier: [
      { geo: at(box(3, 0.3, 20), 0, -0.15, 0), color: C.wood, pattern: 'wood', tile: 1.5, vary: 0.05 },
      {
        geo: merge(...[-1.4, 1.4].flatMap((x) => Array.from({ length: 6 }, (_, i) => at(cyl(0.16, 0.16, 7, 6), x, -3.4, -9.5 + i * 3.8)))),
        color: C.darkWood,
        pattern: 'bark',
        tile: 1.5,
      },
    ],
    bridge: [
      { geo: at(box(3.2, 0.35, 16), 0, -0.18, 0), color: C.wood, pattern: 'wood', tile: 1.5 },
      {
        geo: merge(
          ...[-1.5, 1.5].flatMap((x) => [
            ...Array.from({ length: 5 }, (_, i) => at(box(0.16, 1.1, 0.16), x, 0.55, -7.6 + i * 3.8)),
            at(box(0.1, 0.1, 15.4), x, 1.05, 0),
            at(box(0.08, 0.08, 15.4), x, 0.55, 0),
          ]),
          at(box(0.3, 0.3, 16.4), -1.45, -0.5, 0),
          at(box(0.3, 0.3, 16.4), 1.45, -0.5, 0),
        ),
        color: C.darkWood,
        pattern: 'wood',
        tile: 1.5,
      },
    ],
    fence: [
      {
        geo: merge(...fencePosts(4, 3, 1.2), at(box(4.1, 0.1, 0.08), 0, 0.95, 0.06), at(box(4.1, 0.1, 0.08), 0, 0.5, 0.06)),
        color: C.wood,
        pattern: 'wood',
        tile: 1,
        vary: 0.08,
      },
    ],
    ruin_wall: [
      {
        geo: merge(
          at(box(6, 1.2, 1), 0, 0.6, 0),
          at(box(2.2, 1.6, 1), -1.9, 2, 0),
          at(box(1.4, 0.9, 1), -0.1, 1.65, 0),
          at(box(1.5, 2.1, 1), 2.25, 2.25, 0),
          at(box(0.7, 0.5, 0.9), 1.1, 1.45, 0.05),
          at(lump(0.4, 0, 30), 0.8, 0.2, 1.1),
          at(lump(0.3, 0, 31), -2.3, 0.15, -1.0),
        ),
        color: C.stone,
        pattern: 'stonework',
        tile: 2,
        vary: 0.08,
      },
    ],
    ruin_pillar: [
      {
        geo: merge(at(box(1.6, 0.5, 1.6), 0, 0.25, 0), at(cyl(0.55, 0.6, 4.2, 10), 0, 2.6, 0), at(cyl(0.45, 0.55, 0.6, 10).rotateZ(0.2), 0.08, 4.95, 0)),
        color: C.stone,
        pattern: 'stonework',
        tile: 2,
        vary: 0.08,
      },
    ],
    tent: [
      { geo: at(gableRoof(3, 2, 4).rotateY(Math.PI / 2), 0, 0, 0), color: C.canvas, pattern: 'plaster', tile: 2, vary: 0.1 },
      { geo: merge(at(box(0.1, 2.1, 0.1), 0, 1.05, 2.05), at(box(0.1, 2.1, 0.1), 0, 1.05, -2.05)), color: C.darkWood },
    ],
    barrel: [
      { geo: at(cyl(0.42, 0.42, 1, 12), 0, 0.5, 0), color: C.wood, pattern: 'wood', tile: 0.8, vary: 0.1 },
      { geo: merge(at(cyl(0.45, 0.45, 0.08, 12), 0, 0.2, 0), at(cyl(0.45, 0.45, 0.08, 12), 0, 0.8, 0)), color: 0x3a3a3a },
    ],
    crate: [
      { geo: at(box(1, 1, 1), 0, 0.5, 0), color: C.wood, pattern: 'wood', tile: 1, vary: 0.12 },
      {
        geo: merge(...[-0.47, 0.47].flatMap((x) => [-0.47, 0.47].map((z) => at(box(0.1, 1.02, 0.1), x, 0.5, z)))),
        color: C.darkWood,
      },
    ],
  };
}

const SINK: Partial<Record<ObjectType, number>> = { pine: 0.3, oak: 0.3, bush: 0.2, rock: 0.15, boulder: 0.5, ruin_pillar: 0.1 };

/** 区画の一辺 (m)。区画ごとに InstancedMesh を分けて視錐台カリング（影の描画も含む）を効かせる */
const SECTOR = 256;

function createPropMaterial(part: Part, tex: TextureSet): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
  if (part.emissive) mat.emissive = new THREE.Color(part.emissive);
  if (!part.pattern) return mat;
  const layer = part.pattern === 'rock' ? SURFACE_INDEX.rock : patternLayer(part.pattern);
  // 地表の岩は色付きなので明るさの平均 (約 0.47) で割って模様だけ取り出す
  const gain = part.pattern === 'rock' ? 1 / 0.47 : 2;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      uLayers: { value: tex.layers },
      uLayer: { value: layer },
      uTile: { value: part.tile ?? 2 },
      uGain: { value: gain },
    });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPWorld;\nvarying vec3 vPNormal;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
mat4 pm = modelMatrix;
#ifdef USE_INSTANCING
pm = modelMatrix * instanceMatrix;
#endif
vPWorld = (pm * vec4(transformed, 1.0)).xyz;
vPNormal = normalize(mat3(pm) * normal);`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform highp sampler2DArray uLayers;
uniform float uLayer;
uniform float uTile;
uniform float uGain;
varying vec3 vPWorld;
varying vec3 vPNormal;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
{
  vec3 b = pow(abs(normalize(vPNormal)), vec3(4.0));
  b /= (b.x + b.y + b.z);
  vec3 p = vPWorld / uTile;
  vec3 t = texture(uLayers, vec3(p.zy, uLayer)).rgb * b.x
         + texture(uLayers, vec3(p.xz, uLayer)).rgb * b.y
         + texture(uLayers, vec3(p.xy, uLayer)).rgb * b.z;
  diffuseColor.rgb *= clamp(t * uGain, 0.0, 1.6);
}`,
      );
  };
  return mat;
}

export class Props {
  private readonly markers: THREE.InstancedMesh[] = [];
  readonly count: number;

  constructor(scene: THREE.Scene, world: ComposedWorld, tex: TextureSet) {
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
        if (!mat) materials.set(part, (mat = createPropMaterial(part, tex)));
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
        mesh.castShadow = type !== 'marker' && !part.emissive;
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

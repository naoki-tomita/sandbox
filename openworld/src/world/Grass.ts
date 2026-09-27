import * as THREE from 'three';
import { CONFIG } from '../config.ts';
import type { ComposedWorld } from '../worldgen/compose.ts';
import { SURFACES, type Surface } from '../worldgen/surface.ts';

/** 地表ごとの草の密度 (0..1) */
const DENSITY: Partial<Record<Surface, number>> = { grass: 1, forest: 0.45, dirt: 0.12 };

/**
 * プレイヤー周辺の草。草 1 本ごとの位置は GPU で決める:
 * - 各草は 2R 四方の格子内の固定オフセットを持ち、フォーカス点の周囲 R に来るよう周期的に折り返す（ワールドに固定され、動いても滑らない）
 * - 地形の高さテクスチャから接地させ、密度テクスチャ（地表・傾斜・水中から CPU で計算）で間引く
 * - 半径の縁でフェードアウト、風で揺れる、ごく一部は花
 */
export class Grass {
  private readonly uniforms = {
    uCenter: { value: new THREE.Vector2() },
    uTime: { value: 0 },
  };

  constructor(scene: THREE.Scene, world: ComposedWorld, count: number = CONFIG.grass.count) {
    const grid = world.heights;
    const n = grid.n;
    const heightTex = new THREE.DataTexture(grid.data, n, n, THREE.RedFormat, THREE.FloatType);
    heightTex.needsUpdate = true;
    const dens = new Uint8Array(n * n);
    const cs = grid.cellSize;
    for (let iz = 0; iz < n; iz++) {
      for (let ix = 0; ix < n; ix++) {
        const i = grid.index(ix, iz);
        let d = DENSITY[SURFACES[world.surface[i]]] ?? 0;
        if (d > 0) {
          d *= 1 - THREE.MathUtils.smoothstep(grid.slope(ix, iz), 0.5, 0.8);
          if (grid.data[i] < world.waterLevelAt(ix * cs, iz * cs) + 0.15) d = 0;
        }
        dens[i] = Math.round(d * 255);
      }
    }
    const densTex = new THREE.DataTexture(dens, n, n, THREE.RedFormat, THREE.UnsignedByteType);
    densTex.magFilter = densTex.minFilter = THREE.LinearFilter;
    densTex.needsUpdate = true;

    const { radius } = CONFIG.grass;
    // 草 1 本: 幅 1、高さ 1 の 3 段の細い三角帯（先端で 1 点）。y が 0..1
    const blade = new THREE.BufferGeometry();
    const w = 0.045;
    blade.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([-w, 0, 0, w, 0, 0, -w * 0.8, 0.35, 0, w * 0.8, 0.35, 0, -w * 0.5, 0.7, 0, w * 0.5, 0.7, 0, 0, 1, 0], 3),
    );
    blade.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(21).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
    blade.setIndex([0, 1, 2, 1, 3, 2, 2, 3, 4, 3, 5, 4, 4, 5, 6]);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = blade.index;
    geo.attributes.position = blade.attributes.position;
    geo.attributes.normal = blade.attributes.normal;
    const offsets = new Float32Array(count * 3);
    let seed = 12345;
    const rand = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < count; i++) {
      offsets[i * 3] = rand() * radius * 2;
      offsets[i * 3 + 1] = rand() * radius * 2;
      offsets[i * 3 + 2] = rand();
    }
    geo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(offsets, 3));
    geo.instanceCount = count;

    const mat = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
    const u = this.uniforms;
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, u, {
        uHeight: { value: heightTex },
        uDensity: { value: densTex },
        uRadius: { value: radius },
        uCell: { value: cs },
        uGridN: { value: n },
      });
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
attribute vec3 aOffset;
uniform highp sampler2D uHeight;
uniform sampler2D uDensity;
uniform vec2 uCenter;
uniform float uRadius;
uniform float uTime;
uniform float uCell;
uniform float uGridN;
varying float vTip;
varying float vRnd;
float grassGround(vec2 p) {
  vec2 g = clamp(p / uCell, vec2(0.0), vec2(uGridN - 1.001));
  ivec2 i = ivec2(floor(g));
  vec2 f = g - vec2(i);
  float a = texelFetch(uHeight, i, 0).r;
  float b = texelFetch(uHeight, i + ivec2(1, 0), 0).r;
  float c = texelFetch(uHeight, i + ivec2(0, 1), 0).r;
  float d = texelFetch(uHeight, i + ivec2(1, 1), 0).r;
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}`,
        )
        .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3(0.0, 1.0, 0.0);')
        .replace(
          '#include <begin_vertex>',
          `float span = 2.0 * uRadius;
vec2 p = aOffset.xy + span * floor((uCenter - aOffset.xy) / span + 0.5);
float rnd = aOffset.z;
float dens = texture(uDensity, (p / uCell + 0.5) / uGridN).r;
float fade = 1.0 - smoothstep(uRadius * 0.55, uRadius, distance(p, uCenter));
float keep = step(rnd, dens);
float hgt = (0.22 + 0.4 * fract(rnd * 7.13)) * keep * fade * (0.55 + 0.45 * dens);
float ang = fract(rnd * 13.7) * 6.2831;
vec3 local = position;
local.y *= hgt;
local.x *= 0.8 + 0.5 * fract(rnd * 3.7);
local = vec3(local.x * cos(ang), local.y, local.x * sin(ang));
vec2 wind = vec2(sin(uTime * 1.4 + p.x * 0.21 + p.y * 0.13), cos(uTime * 1.1 + p.x * 0.17 - p.y * 0.19)) * 0.22 + vec2(0.16, 0.06);
local.xz += wind * position.y * position.y * hgt;
vec3 transformed = vec3(p.x, grassGround(p), p.y) + local;
vTip = position.y;
vRnd = rnd;`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vTip;\nvarying float vRnd;')
        // 両面描画でも裏面の法線を反転させない（草は上向きの法線で照らす）
        .replace('#include <normal_fragment_begin>', 'float faceDirection = 1.0;\nvec3 normal = normalize(vNormal);\nvec3 nonPerturbedNormal = normal;')
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
{
  vec3 base = vec3(0.09, 0.15, 0.04);
  vec3 tip = mix(vec3(0.26, 0.34, 0.11), vec3(0.38, 0.38, 0.15), fract(vRnd * 5.3));
  vec3 col = mix(base, tip, vTip) * (0.8 + 0.4 * fract(vRnd * 17.1));
  float flower = step(0.985, fract(vRnd * 41.7)) * step(0.82, vTip);
  vec3 petal = fract(vRnd * 91.3) < 0.4 ? vec3(0.9, 0.85, 0.3) : fract(vRnd * 91.3) < 0.7 ? vec3(0.85, 0.85, 0.9) : vec3(0.55, 0.35, 0.8);
  diffuseColor.rgb = mix(col, petal, flower);
}`,
        );
    };
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.receiveShadow = true;
    mesh.name = 'grass';
    scene.add(mesh);
  }

  update(dt: number, focus: THREE.Vector3): void {
    this.uniforms.uTime.value += dt;
    this.uniforms.uCenter.value.set(focus.x, focus.z);
  }
}

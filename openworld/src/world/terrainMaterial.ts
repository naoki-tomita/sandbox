import * as THREE from 'three';
import { SURFACE_INDEX, SURFACES, type Surface } from '../worldgen/surface.ts';
import type { TextureSet } from './textureSet.ts';

/** 地表ごとのテクスチャ 1 枚が覆う大きさ (m) */
const TILE_METERS: Record<Surface, number> = {
  grass: 3.5, forest: 4, dirt: 4, road: 3, sand: 6, rock: 14, snow: 10, riverbed: 3,
};

export interface TerrainUniforms {
  uFocus: { value: THREE.Vector2 };
  uHoleRadius: { value: number };
}

/**
 * 地形マテリアル。頂点の地表の重み（splatA/splatB）とテクスチャ配列から画素ごとに色を決める。
 * - 境界はテクスチャの凹凸の高さで切り替える（高い方が勝つ）ので自然に入り組む
 * - 急斜面は画素単位で岩にする（岩は三方向投影で崖でも伸びない）
 * - 大きな色ムラで繰り返し模様を目立たなくする
 * - 凹凸の高さからバンプ（陰影）を付ける
 * hole 指定時は、フォーカス点の周囲を捨てる（遠景メッシュ用。詳細チャンクとの重なり防止）
 */
export function createTerrainMaterial(tex: TextureSet, hole: TerrainUniforms | null): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const scales = SURFACES.map((s) => TILE_METERS[s]);
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      uLayers: { value: tex.layers },
      uMacro: { value: tex.macro },
      uTile: { value: scales },
      uFocus: hole?.uFocus ?? { value: new THREE.Vector2() },
      uHoleRadius: hole?.uHoleRadius ?? { value: 0 },
    });
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute vec4 splatA;
attribute vec4 splatB;
varying vec4 vSplatA;
varying vec4 vSplatB;
varying vec3 vTWorld;
varying vec3 vTNormal;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vSplatA = splatA;
vSplatB = splatB;
vTWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
vTNormal = normal;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform highp sampler2DArray uLayers;
uniform sampler2D uMacro;
uniform float uTile[${SURFACES.length}];
uniform vec2 uFocus;
uniform float uHoleRadius;
varying vec4 vSplatA;
varying vec4 vSplatB;
varying vec3 vTWorld;
varying vec3 vTNormal;
float gTerrainH = 0.0;

vec4 terrainLayer(int i, vec3 p, vec3 n) {
  float s = uTile[i];
  if (i == ${SURFACE_INDEX.rock}) {
    vec3 b = pow(abs(n), vec3(4.0));
    b /= (b.x + b.y + b.z);
    return texture(uLayers, vec3(p.zy / s, float(i))) * b.x
         + texture(uLayers, vec3(p.xz / s, float(i))) * b.y
         + texture(uLayers, vec3(p.xy / s, float(i))) * b.z;
  }
  return texture(uLayers, vec3(p.xz / s, float(i)));
}

vec3 terrainPerturb(vec3 surfPos, vec3 surfNorm, vec2 dHdxy, float faceDir) {
  vec3 sx = normalize(dFdx(surfPos));
  vec3 sy = normalize(dFdy(surfPos));
  vec3 r1 = cross(sy, surfNorm);
  vec3 r2 = cross(surfNorm, sx);
  float det = dot(sx, r1) * faceDir;
  vec3 grad = sign(det) * (dHdxy.x * r1 + dHdxy.y * r2);
  return normalize(abs(det) * surfNorm - grad);
}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
if (uHoleRadius > 0.0 && distance(vTWorld.xz, uFocus) < uHoleRadius) discard;
{
  vec3 n = normalize(vTNormal);
  vec4 macro = texture(uMacro, vTWorld.xz / 160.0);
  vec4 macro2 = texture(uMacro, vTWorld.xz / 830.0 + 0.37);
  float w[8] = float[8](vSplatA.x, vSplatA.y, vSplatA.z, vSplatA.w, vSplatB.x, vSplatB.y, vSplatB.z, vSplatB.w);
  // 急斜面は岩（境界はノイズで揺らす）。道・雪は残す
  float steep = smoothstep(0.28, 0.42, 1.0 - n.y + (macro.b - 0.5) * 0.12);
  w[${SURFACE_INDEX.rock}] += steep * 1.5 * (1.0 - w[${SURFACE_INDEX.road}]);
  vec4 t[8];
  float v[8];
  float top = -1.0;
  for (int i = 0; i < 8; i++) {
    v[i] = -1.0;
    if (w[i] > 0.02) {
      t[i] = terrainLayer(i, vTWorld, n);
      v[i] = w[i] + t[i].a * 0.55;
      top = max(top, v[i]);
    }
  }
  vec3 col = vec3(0.0);
  float hsum = 0.0;
  float fsum = 0.0;
  for (int i = 0; i < 8; i++) {
    float f = max(v[i] - top + 0.18, 0.0);
    if (f > 0.0) {
      col += t[i].rgb * f;
      hsum += t[i].a * f;
      fsum += f;
    }
  }
  col /= max(fsum, 1e-4);
  gTerrainH = hsum / max(fsum, 1e-4);
  // 大きな色ムラ（明るさと色味）
  col *= 0.86 + 0.28 * macro.r;
  col = mix(col, col * vec3(1.1, 1.02, 0.82), (macro2.g - 0.5) * 0.8);
  diffuseColor.rgb *= col;
}`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
{
  // 近くだけバンプを効かせる（遠方はちらつくので弱める）
  float bumpFade = 1.0 - smoothstep(30.0, 90.0, length(vViewPosition));
  vec2 dH = vec2(dFdx(gTerrainH), dFdy(gTerrainH)) * 1.2 * bumpFade;
  normal = terrainPerturb(-vViewPosition, normal, dH, faceDirection);
}`,
      );
  };
  return mat;
}

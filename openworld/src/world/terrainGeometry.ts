import * as THREE from 'three';
import { hashSeed } from '../core/random.ts';
import type { ComposedWorld } from '../worldgen/compose.ts';
import { SURFACE_COLORS, SURFACES } from '../worldgen/surface.ts';

const LINEAR_COLORS = SURFACES.map((s) => {
  const [r, g, b] = SURFACE_COLORS[s];
  return new THREE.Color().setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace);
});

/** 頂点ごとの小さな色ムラ（0.92..1.08） */
function jitter(ix: number, iz: number): number {
  return 0.92 + (hashSeed(ix, iz) % 1000) / 1000 * 0.16;
}

/**
 * グリッドの一部から地形メッシュを作る。
 * @param step 何セルごとに 1 頂点を置くか（1 = 詳細、>1 = 遠景）
 */
export function buildTerrainGeometry(
  world: ComposedWorld,
  ix0: number,
  iz0: number,
  cells: number,
  step: number,
): THREE.BufferGeometry {
  const grid = world.heights;
  const cs = grid.cellSize;
  const verts = cells / step + 1;
  const pos = new Float32Array(verts * verts * 3);
  const nor = new Float32Array(verts * verts * 3);
  const col = new Float32Array(verts * verts * 3);
  let k = 0;
  for (let vz = 0; vz < verts; vz++) {
    for (let vx = 0; vx < verts; vx++, k++) {
      const ix = ix0 + vx * step;
      const iz = iz0 + vz * step;
      const h = grid.get(ix, iz);
      pos[k * 3] = ix * cs;
      pos[k * 3 + 1] = h;
      pos[k * 3 + 2] = iz * cs;
      // 法線はグリッド全体から求めるのでチャンク境界でも継ぎ目が出ない
      const e = step;
      const gx = (grid.get(ix + e, iz) - grid.get(ix - e, iz)) / (2 * e * cs);
      const gz = (grid.get(ix, iz + e) - grid.get(ix, iz - e)) / (2 * e * cs);
      const inv = 1 / Math.sqrt(gx * gx + 1 + gz * gz);
      nor[k * 3] = -gx * inv;
      nor[k * 3 + 1] = inv;
      nor[k * 3 + 2] = -gz * inv;
      const c = LINEAR_COLORS[world.surface[grid.index(Math.min(ix, grid.n - 1), Math.min(iz, grid.n - 1))]];
      const j = jitter(ix, iz);
      col[k * 3] = c.r * j;
      col[k * 3 + 1] = c.g * j;
      col[k * 3 + 2] = c.b * j;
    }
  }
  const idx = new Uint32Array((verts - 1) * (verts - 1) * 6);
  let t = 0;
  for (let vz = 0; vz < verts - 1; vz++) {
    for (let vx = 0; vx < verts - 1; vx++) {
      const a = vz * verts + vx;
      const b = a + 1;
      const c = a + verts;
      const d = c + 1;
      idx[t++] = a; idx[t++] = c; idx[t++] = b;
      idx[t++] = b; idx[t++] = c; idx[t++] = d;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeBoundingSphere();
  return geo;
}

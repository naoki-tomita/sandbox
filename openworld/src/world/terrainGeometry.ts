import * as THREE from 'three';
import type { ComposedWorld } from '../worldgen/compose.ts';

/** 近傍の地表を 3x3 でぼかした重み（中心 4, 辺 2, 角 1）。境界を滑らかに混ぜるため */
const KERNEL = [1, 2, 1, 2, 4, 2, 1, 2, 1].map((k) => k / 16);

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
  // 地表 8 種の重み。splatA = grass forest dirt road, splatB = sand rock snow riverbed
  const splat = new Float32Array(verts * verts * 8);
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
      const n = grid.n - 1;
      for (let dz = -1, kk = 0; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++, kk++) {
          const sx = Math.max(0, Math.min(n, ix + dx * step));
          const sz = Math.max(0, Math.min(n, iz + dz * step));
          splat[k * 8 + world.surface[grid.index(sx, sz)]] += KERNEL[kk];
        }
      }
    }
  }
  const splatA = new Float32Array(verts * verts * 4);
  const splatB = new Float32Array(verts * verts * 4);
  for (let i = 0; i < verts * verts; i++) {
    for (let j = 0; j < 4; j++) {
      splatA[i * 4 + j] = splat[i * 8 + j];
      splatB[i * 4 + j] = splat[i * 8 + 4 + j];
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
  geo.setAttribute('splatA', new THREE.BufferAttribute(splatA, 4));
  geo.setAttribute('splatB', new THREE.BufferAttribute(splatB, 4));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeBoundingSphere();
  return geo;
}

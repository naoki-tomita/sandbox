import type { Area, Vec2 } from './schema.ts';

export interface Bounds {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

/** 点と線分の距離と、線分上の位置 t (0..1) */
export function segmentDistance(px: number, pz: number, a: Vec2, b: Vec2): { d: number; t: number } {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const len2 = dx * dx + dz * dz;
  let t = len2 > 0 ? ((px - a[0]) * dx + (pz - a[1]) * dz) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = a[0] + dx * t - px;
  const cz = a[1] + dz * t - pz;
  return { d: Math.sqrt(cx * cx + cz * cz), t };
}

/** 折れ線への最短距離と、最寄り区間の index・区間内位置 */
export function polylineDistance(px: number, pz: number, pts: Vec2[]): { d: number; seg: number; t: number } {
  let best = { d: Infinity, seg: 0, t: 0 };
  for (let i = 0; i < pts.length - 1; i++) {
    const r = segmentDistance(px, pz, pts[i], pts[i + 1]);
    if (r.d < best.d) best = { d: r.d, seg: i, t: r.t };
  }
  return best;
}

export function pointInPolygon(px: number, pz: number, pts: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i];
    const [xj, zj] = pts[j];
    if (zi > pz !== zj > pz && px < ((xj - xi) * (pz - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** 符号付き距離。領域の内側で負、境界で 0、外側で正 (m) */
export function areaDistance(area: Area, x: number, z: number): number {
  switch (area.kind) {
    case 'circle':
      return Math.hypot(x - area.at[0], z - area.at[1]) - area.radius;
    case 'rect': {
      const cx = (area.min[0] + area.max[0]) / 2;
      const cz = (area.min[1] + area.max[1]) / 2;
      const hx = (area.max[0] - area.min[0]) / 2;
      const hz = (area.max[1] - area.min[1]) / 2;
      const qx = Math.abs(x - cx) - hx;
      const qz = Math.abs(z - cz) - hz;
      return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0);
    }
    case 'polygon': {
      const pts = area.points;
      let d = Infinity;
      for (let i = 0; i < pts.length; i++) {
        d = Math.min(d, segmentDistance(x, z, pts[i], pts[(i + 1) % pts.length]).d);
      }
      return pointInPolygon(x, z, pts) ? -d : d;
    }
  }
}

export function areaBounds(area: Area, pad = 0): Bounds {
  switch (area.kind) {
    case 'circle':
      return {
        minX: area.at[0] - area.radius - pad,
        minZ: area.at[1] - area.radius - pad,
        maxX: area.at[0] + area.radius + pad,
        maxZ: area.at[1] + area.radius + pad,
      };
    case 'rect':
      return { minX: area.min[0] - pad, minZ: area.min[1] - pad, maxX: area.max[0] + pad, maxZ: area.max[1] + pad };
    case 'polygon':
      return pointsBounds(area.points, pad);
  }
}

export function pointsBounds(pts: Vec2[], pad = 0): Bounds {
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (const [x, z] of pts) {
    minX = Math.min(minX, x);
    minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x);
    maxZ = Math.max(maxZ, z);
  }
  return { minX: minX - pad, minZ: minZ - pad, maxX: maxX + pad, maxZ: maxZ + pad };
}

export function unionBounds(a: Bounds | null, b: Bounds): Bounds {
  if (!a) return { ...b };
  return {
    minX: Math.min(a.minX, b.minX),
    minZ: Math.min(a.minZ, b.minZ),
    maxX: Math.max(a.maxX, b.maxX),
    maxZ: Math.max(a.maxZ, b.maxZ),
  };
}

export function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/**
 * 領域の影響度 0..1。内側で 1、境界から外へ falloff (m) かけて 0 に滑らかに落ちる。
 */
export function areaWeight(area: Area, x: number, z: number, falloff: number): number {
  const d = areaDistance(area, x, z);
  if (d <= 0) return 1;
  if (falloff <= 0 || d >= falloff) return 0;
  return 1 - smoothstep(0, falloff, d);
}

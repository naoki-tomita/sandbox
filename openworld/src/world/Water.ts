import * as THREE from 'three';
import type { ComposedWorld, WaterBody } from '../worldgen/compose.ts';
import type { Area, Vec2 } from '../worldgen/schema.ts';

/** 海・湖・川の水面。今は平らな半透明面（波などは後で） */
export class Water {
  readonly material = new THREE.MeshStandardMaterial({
    color: 0x2f6f9a,
    roughness: 0.12,
    metalness: 0.05,
    transparent: true,
    opacity: 0.82,
    // 水中から見上げたときも水面が見えるように両面描画
    side: THREE.DoubleSide,
  });

  constructor(scene: THREE.Scene, world: ComposedWorld) {
    const { size, seaLevel } = world.def;
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(size * 6, size * 6).rotateX(-Math.PI / 2), this.material);
    sea.position.set(size / 2, seaLevel, size / 2);
    sea.name = 'sea';
    sea.receiveShadow = true;
    scene.add(sea);
    for (const body of world.waters) {
      const mesh = new THREE.Mesh(waterGeometry(body), this.material);
      mesh.name = `water-${body.name}`;
      mesh.receiveShadow = true;
      // 同じ高さの海面・他の水面と重なったときのちらつき防止
      mesh.renderOrder = 1;
      scene.add(mesh);
    }
  }
}

function areaOutline(area: Area): Vec2[] {
  switch (area.kind) {
    case 'circle':
      return Array.from({ length: 48 }, (_, i) => {
        const a = (i / 48) * Math.PI * 2;
        return [area.at[0] + Math.cos(a) * area.radius, area.at[1] + Math.sin(a) * area.radius] as Vec2;
      });
    case 'rect':
      return [area.min, [area.max[0], area.min[1]], area.max, [area.min[0], area.max[1]]];
    case 'polygon':
      return area.points;
  }
}

function waterGeometry(body: WaterBody): THREE.BufferGeometry {
  if (body.kind === 'area') {
    // Shape は XY 平面。(x, -z) で作って X 軸回りに -90° 回すと (x, 0, z) になる
    const shape = new THREE.Shape(areaOutline(body.area).map(([x, z]) => new THREE.Vector2(x, -z)));
    const g = new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2);
    g.translate(0, body.level, 0);
    return g;
  }
  // 川: 折れ線に沿った帯。各点で前後の向きの平均に直交する方向へ幅を取る
  const pts = body.points;
  const pos: number[] = [];
  const idx: number[] = [];
  pts.forEach((p, i) => {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const len = Math.hypot(dx, dz) || 1;
    const nx = (-dz / len) * (body.width / 2);
    const nz = (dx / len) * (body.width / 2);
    pos.push(p[0] + nx, body.levels[i], p[1] + nz, p[0] - nx, body.levels[i], p[1] - nz);
    if (i > 0) {
      const k = i * 2;
      // 上から見て反時計回り（表面が上を向く）
      idx.push(k - 2, k, k - 1, k - 1, k, k + 1);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.setAttribute('normal', new THREE.Float32BufferAttribute(pos.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  return g;
}

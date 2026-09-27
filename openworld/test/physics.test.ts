/** 地形の当たり判定（Rapier heightfield）が描画用の高さグリッドと一致することを確認する */
import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { initPhysics, Physics } from '../src/physics/Physics.ts';
import { ChunkManager } from '../src/world/ChunkManager.ts';
import { composeWorld } from '../src/worldgen/compose.ts';
import { parseWorldData } from '../src/worldgen/schema.ts';

beforeAll(async () => {
  await initPhysics();
});

describe('ChunkManager の当たり判定', () => {
  it('レイキャストの高さがグリッドの高さと一致する（x/z の向きが正しい）', () => {
    const d = parseWorldData(
      {
        name: 't', size: 256, cellSize: 2, seed: 3, seaLevel: 0,
        base: { height: 20, amplitude: 15, scale: 60 }, border: { width: 0 },
        spawn: { at: [128, 128] }, regions: ['r'],
      },
      { r: { ops: [{ op: 'hill', at: [100, 150], radius: 40, height: 30 }] } },
    );
    const world = composeWorld(d.world, d.regions);
    const physics = new Physics(1 / 60);
    const chunks = new ChunkManager(new THREE.Scene(), physics, world);
    chunks.updatePhysics(128, 128);
    physics.step();
    for (const [x, z] of [[70, 90], [100, 150], [150, 110], [180, 175], [127, 129]]) {
      const hit = physics.castRay({ x, y: 500, z }, { x: 0, y: -1, z: 0 }, 1000);
      expect(hit).not.toBeNull();
      // セル内の三角形分割の違いで僅かにずれるので 0.25m まで許容
      expect(Math.abs(500 - hit! - world.heights.sample(x, z))).toBeLessThan(0.25);
    }
    // x と z を取り違えていれば丘の位置がずれて大きく外れる
    const onHill = 500 - physics.castRay({ x: 100, y: 500, z: 150 }, { x: 0, y: -1, z: 0 }, 1000)!;
    expect(Math.abs(onHill - world.heights.sample(150, 100))).toBeGreaterThan(5);
  });
});

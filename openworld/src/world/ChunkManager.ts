import * as THREE from 'three';
import { CONFIG } from '../config.ts';
import { RAPIER, type Physics } from '../physics/Physics.ts';
import { CATALOG } from '../worldgen/catalog.ts';
import type { ComposedWorld, PlacedObject } from '../worldgen/compose.ts';
import { buildTerrainGeometry } from './terrainGeometry.ts';

/**
 * 地形のストリーミング。
 * - 遠景: マップ全体の低解像度メッシュを常に表示
 * - 詳細: プレイヤー周辺のチャンクだけ高解像度メッシュを生成/破棄
 * - 当たり判定: さらに狭い範囲のチャンクだけ heightfield と配置物のコライダーを置く
 */
export class ChunkManager {
  readonly perSide: number;
  private readonly cellsPerChunk: number;
  private readonly meshes = new Map<number, THREE.Mesh>();
  private readonly colliders = new Map<number, RAPIER.Collider[]>();
  private readonly objectsByChunk = new Map<number, PlacedObject[]>();
  private readonly material = new THREE.MeshLambertMaterial({ vertexColors: true });
  /**
   * 遠景用。詳細チャンクが確実に敷き詰められている半径の内側は捨てて、詳細メッシュと重ならないようにする。
   * （中心が renderRadius 内のチャンクを読むので、半径 renderRadius*size - 対角の半分 までは必ず詳細がある）
   */
  private readonly farUniforms = {
    uFocus: { value: new THREE.Vector2() },
    uHoleRadius: { value: (CONFIG.chunk.renderRadius - 0.75) * CONFIG.chunk.size },
  };
  private readonly farMaterial = this.createFarMaterial();
  private readonly group = new THREE.Group();

  constructor(
    scene: THREE.Scene,
    private readonly physics: Physics,
    private readonly world: ComposedWorld,
  ) {
    const { size, cellSize } = world.def;
    this.perSide = size / CONFIG.chunk.size;
    this.cellsPerChunk = CONFIG.chunk.size / cellSize;
    for (const o of world.objects) {
      const key = this.keyAt(o.x, o.z);
      if (key === null) continue;
      let list = this.objectsByChunk.get(key);
      if (!list) this.objectsByChunk.set(key, (list = []));
      list.push(o);
    }
    scene.add(this.group);
    this.buildFar();
    this.addBoundaryWalls();
  }

  get loadedMeshes(): number {
    return this.meshes.size;
  }

  get loadedColliders(): number {
    return this.colliders.size;
  }

  private keyAt(x: number, z: number): number | null {
    const cx = Math.floor(x / CONFIG.chunk.size);
    const cz = Math.floor(z / CONFIG.chunk.size);
    if (cx < 0 || cz < 0 || cx >= this.perSide || cz >= this.perSide) return null;
    return cz * this.perSide + cx;
  }

  private buildFar(): void {
    const n = this.world.heights.n - 1;
    const geo = buildTerrainGeometry(this.world, 0, 0, n, CONFIG.chunk.farStep);
    const mesh = new THREE.Mesh(geo, this.farMaterial);
    mesh.receiveShadow = true;
    mesh.name = 'terrain-far';
    this.group.add(mesh);
  }

  private createFarMaterial(): THREE.MeshLambertMaterial {
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.farUniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vFarXZ;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFarXZ = (modelMatrix * vec4(transformed, 1.0)).xz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vFarXZ;\nuniform vec2 uFocus;\nuniform float uHoleRadius;')
        .replace('void main() {', 'void main() {\n  if (distance(vFarXZ, uFocus) < uHoleRadius) discard;');
    };
    return mat;
  }

  /** マップの外に出られないよう四辺に見えない壁を置く */
  private addBoundaryWalls(): void {
    const s = this.world.def.size;
    const h = 500;
    const t = 1;
    for (const [x, z, hx, hz] of [
      [s / 2, -t, s / 2, t],
      [s / 2, s + t, s / 2, t],
      [-t, s / 2, t, s / 2],
      [s + t, s / 2, t, s / 2],
    ]) {
      this.physics.addFixed(RAPIER.ColliderDesc.cuboid(hx, h, hz).setTranslation(x, 0, z));
    }
  }

  /** 詳細メッシュの生成/破棄。近い順に budget 個まで作る */
  updateRender(x: number, z: number, budget: number = CONFIG.chunk.buildsPerFrame): void {
    const R = CONFIG.chunk.renderRadius;
    const size = CONFIG.chunk.size;
    const fcx = x / size - 0.5;
    const fcz = z / size - 0.5;
    for (const [key, mesh] of this.meshes) {
      const cx = key % this.perSide;
      const cz = Math.floor(key / this.perSide);
      if (Math.hypot(cx - fcx, cz - fcz) > R + 1.5) {
        this.group.remove(mesh);
        mesh.geometry.dispose();
        this.meshes.delete(key);
      }
    }
    const wanted: [number, number][] = [];
    for (let cz = Math.floor(fcz - R); cz <= Math.ceil(fcz + R); cz++) {
      for (let cx = Math.floor(fcx - R); cx <= Math.ceil(fcx + R); cx++) {
        if (cx < 0 || cz < 0 || cx >= this.perSide || cz >= this.perSide) continue;
        const d = Math.hypot(cx - fcx, cz - fcz);
        const key = cz * this.perSide + cx;
        if (d <= R && !this.meshes.has(key)) wanted.push([d, key]);
      }
    }
    wanted.sort((a, b) => a[0] - b[0]);
    for (const [, key] of wanted.slice(0, budget)) this.buildMesh(key);
    // 作りかけの間に遠景の穴が見えないよう、未ロードの最も近いチャンクまで穴を縮める
    const full = (R - 0.75) * size;
    const pending = wanted.length > budget ? wanted[budget][0] * size - size * 0.75 : Infinity;
    this.farUniforms.uHoleRadius.value = Math.max(0, Math.min(full, pending));
    this.farUniforms.uFocus.value.set(x, z);
  }

  private buildMesh(key: number): void {
    const cx = key % this.perSide;
    const cz = Math.floor(key / this.perSide);
    const c = this.cellsPerChunk;
    const mesh = new THREE.Mesh(buildTerrainGeometry(this.world, cx * c, cz * c, c, 1), this.material);
    mesh.receiveShadow = true;
    mesh.name = `chunk-${cx}-${cz}`;
    this.group.add(mesh);
    this.meshes.set(key, mesh);
  }

  /** 当たり判定の生成/破棄。プレイヤーが移動する前に毎ステップ呼ぶ（同期） */
  updatePhysics(x: number, z: number): void {
    const R = CONFIG.chunk.physicsRadius;
    const pcx = Math.floor(x / CONFIG.chunk.size);
    const pcz = Math.floor(z / CONFIG.chunk.size);
    for (const [key, list] of this.colliders) {
      const cx = key % this.perSide;
      const cz = Math.floor(key / this.perSide);
      if (Math.abs(cx - pcx) > R + 1 || Math.abs(cz - pcz) > R + 1) {
        list.forEach((col) => this.physics.remove(col));
        this.colliders.delete(key);
      }
    }
    for (let cz = pcz - R; cz <= pcz + R; cz++) {
      for (let cx = pcx - R; cx <= pcx + R; cx++) {
        if (cx < 0 || cz < 0 || cx >= this.perSide || cz >= this.perSide) continue;
        const key = cz * this.perSide + cx;
        if (!this.colliders.has(key)) this.colliders.set(key, this.buildColliders(cx, cz));
      }
    }
  }

  private buildColliders(cx: number, cz: number): RAPIER.Collider[] {
    const grid = this.world.heights;
    const c = this.cellsPerChunk;
    const size = CONFIG.chunk.size;
    // Rapier の heightfield は z 方向の添字が最も速く変わる並び（列優先）
    const heights = new Float32Array((c + 1) * (c + 1));
    for (let ix = 0; ix <= c; ix++) {
      for (let iz = 0; iz <= c; iz++) heights[ix * (c + 1) + iz] = grid.get(cx * c + ix, cz * c + iz);
    }
    const list = [
      this.physics.addFixed(
        RAPIER.ColliderDesc.heightfield(c, c, heights, { x: size, y: 1, z: size }).setTranslation(
          cx * size + size / 2,
          0,
          cz * size + size / 2,
        ),
      ),
    ];
    for (const o of this.objectsByChunk.get(cz * this.perSide + cx) ?? []) {
      const desc = objectCollider(o);
      if (desc) list.push(this.physics.addFixed(desc));
    }
    return list;
  }
}

function objectCollider(o: PlacedObject): RAPIER.ColliderDesc | null {
  const shape = CATALOG[o.type].collider;
  const s = o.scale;
  const q = { x: 0, y: Math.sin(o.rotation / 2), z: 0, w: Math.cos(o.rotation / 2) };
  switch (shape.kind) {
    case 'none':
      return null;
    case 'cylinder':
      return RAPIER.ColliderDesc.cylinder((shape.height * s) / 2, shape.radius * s).setTranslation(o.x, o.y + (shape.height * s) / 2, o.z);
    case 'ball':
      return RAPIER.ColliderDesc.ball(shape.radius * s).setTranslation(o.x, o.y + shape.radius * s * 0.5, o.z);
    case 'box': {
      const [w, h, d] = shape.size;
      return RAPIER.ColliderDesc.cuboid((w * s) / 2, (h * s) / 2, (d * s) / 2)
        .setTranslation(o.x, o.y + (h * s) / 2, o.z)
        .setRotation(q);
    }
  }
}

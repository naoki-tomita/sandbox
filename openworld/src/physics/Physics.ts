import RAPIER from '@dimforge/rapier3d-compat';

export { RAPIER };

/** Rapier の WASM を初期化する。ゲーム開始前に 1 回だけ呼ぶ */
export async function initPhysics(): Promise<void> {
  await RAPIER.init();
}

/**
 * Rapier World の薄いラッパー。重力はキャラクター側で扱うので World の重力は使わない。
 */
export class Physics {
  readonly world: RAPIER.World;

  constructor(dt: number) {
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this.world.timestep = dt;
  }

  step(): void {
    this.world.step();
  }

  addFixed(desc: RAPIER.ColliderDesc): RAPIER.Collider {
    return this.world.createCollider(desc);
  }

  remove(collider: RAPIER.Collider): void {
    this.world.removeCollider(collider, false);
  }

  /** 下向きなどのレイキャスト。当たった距離を返す（なければ null） */
  castRay(
    from: { x: number; y: number; z: number },
    dir: { x: number; y: number; z: number },
    maxDist: number,
    exclude?: RAPIER.Collider,
  ): number | null {
    const hit = this.world.castRay(new RAPIER.Ray(from, dir), maxDist, true, undefined, undefined, exclude);
    return hit ? hit.timeOfImpact : null;
  }
}

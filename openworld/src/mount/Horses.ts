import * as THREE from 'three';
import { CONFIG } from '../config.ts';
import type { Physics } from '../physics/Physics.ts';
import type { ComposedWorld } from '../worldgen/compose.ts';
import { Horse, type HorseControl } from './Horse.ts';
import { COATS, type Coat } from './HorseModel.ts';

/** これより遠い馬は描かない (m) */
const DRAW_DISTANCE = 350;

/**
 * ワールドの馬（world の objects の type "horse"）をまとめて扱う。
 * 乗られていない馬の毎ステップの更新、指笛で呼ばれた馬の自動操縦、遠い馬の非表示。
 */
export class Horses {
  readonly list: Horse[] = [];
  /** 指笛で呼ばれて向かってきている馬 */
  private called: { horse: Horse; time: number; stuck: number } | null = null;

  constructor(scene: THREE.Scene, physics: Physics, world: ComposedWorld) {
    world.objects
      .filter((o) => o.type === 'horse')
      .forEach((o, i) => {
        const coat = (COATS as string[]).includes(o.props.coat as string) ? (o.props.coat as Coat) : COATS[i % COATS.length];
        this.list.push(new Horse(scene, physics, world, o.id ?? `horse_${i}`, o.x, o.z, o.rotation, coat, i));
      });
  }

  /** (x, z) から range 以内でいちばん近い、乗られていない馬 */
  nearest(x: number, z: number, range: number): Horse | null {
    let best: Horse | null = null;
    let bestD = range;
    for (const h of this.list) {
      const d = Math.hypot(h.position.x - x, h.position.z - z);
      if (!h.ridden && d < bestD) {
        best = h;
        bestD = d;
      }
    }
    return best;
  }

  /**
   * 指笛: preferred（最後に乗った馬）か、届く範囲でいちばん近い馬を呼ぶ。呼べた馬を返す。
   */
  whistle(x: number, z: number, preferred: Horse | null): Horse | null {
    const range = CONFIG.horse.whistleRange;
    const horse =
      preferred && !preferred.ridden && Math.hypot(preferred.position.x - x, preferred.position.z - z) < range
        ? preferred
        : this.nearest(x, z, range);
    this.called = horse ? { horse, time: 0, stuck: 0 } : null;
    return horse;
  }

  /** 乗られていない馬の固定ステップ。player = プレイヤーの足元 */
  step(dt: number, player: THREE.Vector3): void {
    if (this.called?.horse.ridden) this.called = null;
    const c = this.called;
    for (const h of this.list) {
      if (h.ridden) continue;
      let control: HorseControl | null = null;
      if (c && c.horse === h) {
        const dx = player.x - h.position.x;
        const dz = player.z - h.position.z;
        const d = Math.hypot(dx, dz);
        c.time += dt;
        c.stuck = h.speed < 0.5 ? c.stuck + dt : 0;
        if (d < 4 || c.time > 90 || (c.time > 2 && c.stuck > 3)) {
          this.called = null;
        } else {
          const speed = d > 45 ? CONFIG.horse.gallopSpeed : d > 12 ? CONFIG.horse.trotSpeed : CONFIG.horse.walkSpeed + 1;
          control = { dirX: dx / d, dirZ: dz / d, speed, jump: false };
        }
      }
      h.step(dt, control, Horse.isNear(h, player.x, player.z));
    }
  }

  /** 乗られていない馬の描画更新（遠い馬は隠す） */
  render(alpha: number, dt: number, focus: THREE.Vector3): void {
    for (const h of this.list) {
      if (h.ridden) continue;
      const visible = Math.hypot(h.position.x - focus.x, h.position.z - focus.z) < DRAW_DISTANCE;
      h.setVisible(visible);
      if (!visible) continue;
      h.render(alpha, dt);
      h.updateReins(null);
    }
  }
}

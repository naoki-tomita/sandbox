import * as THREE from 'three';
import { CONFIG } from '../config.ts';

/** 仮のプレイヤー表示（カプセル + 向きがわかる鼻先）。後で GLTF モデルに差し替える */
export class PlayerAvatar {
  readonly root = new THREE.Group();

  constructor(scene: THREE.Scene) {
    const p = CONFIG.player;
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(p.radius, p.halfHeight * 2, 6, 12),
      new THREE.MeshLambertMaterial({ color: 0x3f6fd8 }),
    );
    body.position.y = p.halfHeight + p.radius;
    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.18, 0.3), new THREE.MeshLambertMaterial({ color: 0xf2c14e }));
    nose.position.set(0, 1.45, p.radius);
    for (const m of [body, nose]) {
      m.castShadow = true;
      this.root.add(m);
    }
    this.root.name = 'player';
    scene.add(this.root);
  }

  set(pos: THREE.Vector3, facing: number): void {
    this.root.position.copy(pos);
    this.root.rotation.y = facing;
  }
}

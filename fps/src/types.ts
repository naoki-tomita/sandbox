import type * as THREE from 'three';

export type GameState  = 'menu' | 'playing' | 'paused' | 'gameover';
export type EnemyState = 'patrol' | 'chase' | 'shoot';

export interface WallBox {
  minX: number; maxX: number;
  minZ: number; maxZ: number;
}

export interface Bullet {
  mesh: THREE.Mesh;
  vel:  THREE.Vector3;
  life: number;
}

export interface Enemy {
  mesh:         THREE.Group;
  headMesh:     THREE.Mesh;
  hp:           number;
  maxHp:        number;
  pos:          THREE.Vector3;
  patrolTarget: THREE.Vector3;
  state:        EnemyState;
  shootCd:      number;
  lastShot:     number;
  speed:        number;
  dead:         boolean;
}

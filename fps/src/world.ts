import * as THREE from 'three';
import { CELL, WALL_H, MAZE, ROWS, COLS } from './config';
import type { WallBox } from './types';

export class World {
  private wallBoxes: WallBox[] = [];
  private cells: THREE.Vector2[] = [];

  constructor(private scene: THREE.Scene) {
    this.buildGeometry();
    this.addLighting();
  }

  private buildGeometry(): void {
    const floorGeo = new THREE.PlaneGeometry(COLS * CELL, ROWS * CELL);
    const floorMat = new THREE.MeshLambertMaterial({ color: 0x555566 });
    const floor    = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(COLS * CELL / 2, 0, ROWS * CELL / 2);
    floor.receiveShadow = true;
    this.scene.add(floor);

    const ceilGeo = new THREE.PlaneGeometry(COLS * CELL, ROWS * CELL);
    const ceilMat = new THREE.MeshLambertMaterial({ color: 0x3a3a4a });
    const ceil    = new THREE.Mesh(ceilGeo, ceilMat);
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(COLS * CELL / 2, WALL_H, ROWS * CELL / 2);
    this.scene.add(ceil);

    const wallColors = [0x9a7050, 0x8a6040, 0xaa8060, 0x7a5535];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cx = c * CELL + CELL / 2;
        const cz = r * CELL + CELL / 2;
        if (MAZE[r][c] === 1) {
          const geo  = new THREE.BoxGeometry(CELL, WALL_H, CELL);
          const mat  = new THREE.MeshLambertMaterial({
            color: wallColors[(r * COLS + c) % wallColors.length],
          });
          const mesh = new THREE.Mesh(geo, mat);
          mesh.position.set(cx, WALL_H / 2, cz);
          mesh.castShadow    = true;
          mesh.receiveShadow = true;
          this.scene.add(mesh);
          this.wallBoxes.push({
            minX: c * CELL, maxX: (c + 1) * CELL,
            minZ: r * CELL, maxZ: (r + 1) * CELL,
          });
        } else {
          this.cells.push(new THREE.Vector2(cx, cz));
        }
      }
    }
  }

  private addLighting(): void {
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.2));
    this.scene.add(new THREE.HemisphereLight(0xaabbff, 0x554433, 0.6));

    const positions: [number, number][] = [
      [2,2],[4,4],[6,2],[2,6],[8,8],
      [10,6],[6,10],[10,10],[12,4],[4,12],
      [14,2],[2,14],[14,14],[12,12],[8,4],[4,8],
    ];
    positions.forEach(([c, r]) => {
      const pl = new THREE.PointLight(0xfff0cc, 2.5, 22);
      pl.position.set(c * CELL, WALL_H - 0.2, r * CELL);
      this.scene.add(pl);
    });
  }

  wallHit(x: number, z: number, r: number): boolean {
    for (const w of this.wallBoxes) {
      if (x + r > w.minX && x - r < w.maxX && z + r > w.minZ && z - r < w.maxZ) return true;
    }
    return false;
  }

  randomOpenCell(): THREE.Vector3 {
    const c = this.cells[Math.floor(Math.random() * this.cells.length)];
    return new THREE.Vector3(c.x, 0, c.y);
  }

  get openCells(): THREE.Vector2[] {
    return this.cells;
  }
}

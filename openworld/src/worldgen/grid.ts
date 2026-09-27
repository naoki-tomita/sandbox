/**
 * マップ全体の高さグリッド。頂点 (ix, iz) はワールド座標 (ix * cellSize, iz * cellSize)。
 * ワールドは x, z ともに 0..size の範囲。
 */
export class HeightGrid {
  readonly n: number;
  readonly data: Float32Array;

  constructor(
    readonly size: number,
    readonly cellSize: number,
  ) {
    this.n = Math.round(size / cellSize) + 1;
    this.data = new Float32Array(this.n * this.n);
  }

  index(ix: number, iz: number): number {
    return iz * this.n + ix;
  }

  get(ix: number, iz: number): number {
    const n = this.n - 1;
    return this.data[(iz < 0 ? 0 : iz > n ? n : iz) * this.n + (ix < 0 ? 0 : ix > n ? n : ix)];
  }

  /** 双線形補間した高さ。範囲外は端の値 */
  sample(x: number, z: number): number {
    const fx = Math.max(0, Math.min(this.n - 1.0001, x / this.cellSize));
    const fz = Math.max(0, Math.min(this.n - 1.0001, z / this.cellSize));
    const ix = Math.floor(fx);
    const iz = Math.floor(fz);
    const tx = fx - ix;
    const tz = fz - iz;
    const h00 = this.get(ix, iz);
    const h10 = this.get(ix + 1, iz);
    const h01 = this.get(ix, iz + 1);
    const h11 = this.get(ix + 1, iz + 1);
    return (h00 * (1 - tx) + h10 * tx) * (1 - tz) + (h01 * (1 - tx) + h11 * tx) * tz;
  }

  /** 頂点での勾配 (dh/dx, dh/dz)。中心差分 */
  gradient(ix: number, iz: number): [number, number] {
    const c = this.cellSize * 2;
    return [(this.get(ix + 1, iz) - this.get(ix - 1, iz)) / c, (this.get(ix, iz + 1) - this.get(ix, iz - 1)) / c];
  }

  /** 頂点での傾斜 (rise / run。1 = 45°) */
  slope(ix: number, iz: number): number {
    const [gx, gz] = this.gradient(ix, iz);
    return Math.sqrt(gx * gx + gz * gz);
  }

  /** 任意地点の傾斜（最寄り頂点） */
  slopeAt(x: number, z: number): number {
    return this.slope(Math.round(x / this.cellSize), Math.round(z / this.cellSize));
  }

  /** ワールド座標の範囲 → クランプ済みの頂点 index 範囲 */
  indexRange(minX: number, minZ: number, maxX: number, maxZ: number): [number, number, number, number] {
    const n = this.n - 1;
    const cs = this.cellSize;
    return [
      Math.max(0, Math.floor(minX / cs)),
      Math.max(0, Math.floor(minZ / cs)),
      Math.min(n, Math.ceil(maxX / cs)),
      Math.min(n, Math.ceil(maxZ / cs)),
    ];
  }
}

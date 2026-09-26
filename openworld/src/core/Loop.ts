/**
 * 固定ステップのゲームループ。物理は dt 固定で進め、描画は毎フレーム alpha（補間率）付きで呼ぶ。
 */
export class Loop {
  private acc = 0;
  private last = 0;
  private raf = 0;

  constructor(
    private readonly fixedDt: number,
    private readonly step: (dt: number) => void,
    private readonly render: (alpha: number, frameDt: number, rawDt: number) => void,
  ) {}

  start(): void {
    this.last = performance.now();
    const tick = (now: number) => {
      this.raf = requestAnimationFrame(tick);
      this.advance((now - this.last) / 1000);
      this.last = now;
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
  }

  /** 経過時間を進める。タブ復帰時などの巨大な dt は 0.25 秒で打ち切る（rawDt は打ち切り前の値） */
  advance(frameDt: number): number {
    const dt = Math.min(Math.max(frameDt, 0), 0.25);
    this.acc += dt;
    let steps = 0;
    while (this.acc >= this.fixedDt) {
      this.step(this.fixedDt);
      this.acc -= this.fixedDt;
      steps++;
    }
    this.render(this.acc / this.fixedDt, dt, frameDt);
    return steps;
  }
}

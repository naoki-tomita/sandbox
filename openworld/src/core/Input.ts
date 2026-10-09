/**
 * 生の入力（キーボード・マウス）をゲームのアクションに変換する。
 * タッチ操作を足すときは moveX/moveZ・look などの供給元を増やせばよい。
 */
export class Input {
  private readonly held = new Set<string>();
  private readonly pressedThisFrame = new Set<string>();
  private jumpQueued = false;
  private lookDX = 0;
  private lookDY = 0;
  private wheel = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'F3' || e.code === 'Space' || e.code === 'Tab') e.preventDefault();
      if (!e.repeat) {
        this.pressedThisFrame.add(e.code);
        if (e.code === 'Space') this.jumpQueued = true;
      }
      this.held.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.held.delete(e.code));
    window.addEventListener('blur', () => this.held.clear());
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.lookDX += e.movementX;
      this.lookDY += e.movementY;
    });
    canvas.addEventListener('wheel', (e) => {
      this.wheel += Math.sign(e.deltaY);
      e.preventDefault();
    }, { passive: false });
  }

  get locked(): boolean {
    return document.pointerLockElement === this.canvas;
  }

  requestLock(): void {
    const p = this.canvas.requestPointerLock() as unknown;
    if (p instanceof Promise) p.catch(() => {});
  }

  isDown(code: string): boolean {
    return this.held.has(code);
  }

  /** このフレームで押された瞬間か */
  pressed(code: string): boolean {
    return this.pressedThisFrame.has(code);
  }

  /** 左右 (-1..1)。右が + */
  get moveX(): number {
    return (this.isDown('KeyD') || this.isDown('ArrowRight') ? 1 : 0) - (this.isDown('KeyA') || this.isDown('ArrowLeft') ? 1 : 0);
  }

  /** 前後 (-1..1)。前が + */
  get moveZ(): number {
    return (this.isDown('KeyW') || this.isDown('ArrowUp') ? 1 : 0) - (this.isDown('KeyS') || this.isDown('ArrowDown') ? 1 : 0);
  }

  /** 調べる・乗り降り（押した瞬間） */
  get interact(): boolean {
    return this.pressed('KeyE');
  }

  /** 指笛（押した瞬間） */
  get whistle(): boolean {
    return this.pressed('KeyQ');
  }

  get sprint(): boolean {
    return this.isDown('ShiftLeft') || this.isDown('ShiftRight');
  }

  /** ジャンプ入力を 1 回だけ取り出す（固定ステップ側で消費する） */
  consumeJump(): boolean {
    const j = this.jumpQueued;
    this.jumpQueued = false;
    return j;
  }

  /** 視点移動量（ピクセル）とホイール量を取り出す */
  consumeLook(): { dx: number; dy: number; wheel: number } {
    const r = { dx: this.lookDX, dy: this.lookDY, wheel: this.wheel };
    this.lookDX = this.lookDY = this.wheel = 0;
    return r;
  }

  endFrame(): void {
    this.pressedThisFrame.clear();
  }
}

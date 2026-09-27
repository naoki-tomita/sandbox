/** F3 で表示するデバッグ情報 */
export class DebugHud {
  private readonly el: HTMLElement;
  private fps = 60;
  visible = false;

  constructor() {
    this.el = document.getElementById('debugHud')!;
  }

  toggle(v = !this.visible): void {
    this.visible = v;
    this.el.classList.toggle('hidden', !v);
  }

  update(frameDt: number, lines: [string, string][]): void {
    if (frameDt > 0) this.fps += (1 / frameDt - this.fps) * Math.min(1, frameDt * 3);
    if (!this.visible) return;
    this.el.textContent = [['FPS', this.fps.toFixed(0)] as [string, string], ...lines].map(([k, v]) => `${k.padEnd(9)} ${v}`).join('\n');
  }
}

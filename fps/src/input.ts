export interface InputCallbacks {
  onFire():            void; // left-click while pointer is locked
  onRequestLock():     void; // left-click while pointer is NOT locked
  onReload():          void; // R key
  onPause():           void; // Escape key
  onPointerLockLost(): void; // pointer lock released
}

export class Input {
  private keys: Record<string, boolean> = {};
  yaw   = 0;
  pitch = 0;
  isLocked = false;

  constructor(private callbacks: InputCallbacks) {
    document.addEventListener('keydown',         this.onKeyDown);
    document.addEventListener('keyup',           this.onKeyUp);
    document.addEventListener('mousemove',       this.onMouseMove);
    document.addEventListener('mousedown',       this.onMouseDown);
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
  }

  isDown(code: string): boolean {
    return !!this.keys[code];
  }

  resetLook(): void {
    this.yaw   = 0;
    this.pitch = 0;
  }

  requestLock(): void { document.body.requestPointerLock(); }
  exitLock():    void { document.exitPointerLock(); }

  private onKeyDown = (e: KeyboardEvent): void => {
    this.keys[e.code] = true;
    if (e.code === 'KeyR')    this.callbacks.onReload();
    if (e.code === 'Escape')  this.callbacks.onPause();
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys[e.code] = false;
  };

  private onMouseMove = (e: MouseEvent): void => {
    if (!this.isLocked) return;
    const sens = 0.0018;
    this.yaw   -= e.movementX * sens;
    this.pitch -= e.movementY * sens;
    this.pitch  = Math.max(-Math.PI * 0.45, Math.min(Math.PI * 0.45, this.pitch));
  };

  private onMouseDown = (e: MouseEvent): void => {
    if (e.button !== 0) return;
    if (!this.isLocked) { this.callbacks.onRequestLock(); return; }
    this.callbacks.onFire();
  };

  private onPointerLockChange = (): void => {
    this.isLocked = document.pointerLockElement === document.body;
    if (!this.isLocked) this.callbacks.onPointerLockLost();
  };
}

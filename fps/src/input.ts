export interface InputCallbacks {
  onFire():            void; // left-click while pointer is locked / fire button
  onRequestLock():     void; // left-click while pointer is NOT locked
  onReload():          void; // R key / reload button
  onPause():           void; // Escape key / pause button
  onPointerLockLost(): void; // pointer lock released
}

const PITCH_LIMIT = Math.PI * 0.45;

export class Input {
  private keys: Record<string, boolean> = {};
  yaw   = 0;
  pitch = 0;
  isLocked = false;

  // analog move axes (-1..1) driven by the touch joystick; keyboard adds to these
  moveX = 0; // strafe: -1 left .. +1 right
  moveZ = 0; // forward: -1 forward .. +1 back

  firing = false; // true while the touch fire button is held

  // true on touch-primary devices (phones/tablets): pointer lock is unavailable,
  // so looking is done by dragging and on-screen buttons replace mouse/keys.
  readonly isTouch: boolean;

  constructor(private callbacks: InputCallbacks) {
    this.isTouch = matchMedia('(hover: none) and (pointer: coarse)').matches;

    document.addEventListener('keydown',           this.onKeyDown);
    document.addEventListener('keyup',             this.onKeyUp);
    document.addEventListener('mousemove',         this.onMouseMove);
    document.addEventListener('mousedown',         this.onMouseDown);
    document.addEventListener('pointerlockchange', this.onPointerLockChange);

    if (this.isTouch) this.setupTouch();
  }

  isDown(code: string): boolean {
    return !!this.keys[code];
  }

  resetLook(): void {
    this.yaw    = 0;
    this.pitch  = 0;
    this.moveX  = 0;
    this.moveZ  = 0;
    this.firing = false;
  }

  // Pointer lock is mouse-only; on touch devices these are no-ops.
  requestLock(): void { if (!this.isTouch) document.body.requestPointerLock(); }
  exitLock():    void { if (!this.isTouch) document.exitPointerLock(); }

  showTouchControls(): void { this.toggleTouchControls(true); }
  hideTouchControls(): void { this.toggleTouchControls(false); }

  private toggleTouchControls(visible: boolean): void {
    if (!this.isTouch) return;
    document.getElementById('touchControls')?.classList.toggle('hidden', !visible);
  }

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
    this.pitch  = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, this.pitch));
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

  // ───── Touch controls ─────
  private setupTouch(): void {
    this.setupJoystick();
    this.setupLook();
    this.setupButtons();
  }

  private setupJoystick(): void {
    const zone  = document.getElementById('moveZone');
    const stick = document.getElementById('moveStick');
    if (!zone || !stick) return;

    const MAX_R = 50; // px travel that maps to full speed
    let touchId: number | null = null;
    let cx = 0, cy = 0;

    const update = (t: Touch): void => {
      let dx = t.clientX - cx;
      let dy = t.clientY - cy;
      const len = Math.hypot(dx, dy);
      if (len > MAX_R) { dx = dx / len * MAX_R; dy = dy / len * MAX_R; }
      stick.style.transform = `translate(${dx}px, ${dy}px)`;
      this.moveX = dx / MAX_R;        // right is +x
      this.moveZ = dy / MAX_R;        // down is +z (backward); up gives -z (forward)
    };

    const reset = (): void => {
      touchId = null;
      this.moveX = 0;
      this.moveZ = 0;
      stick.style.transform = 'translate(0px, 0px)';
    };

    zone.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (touchId !== null) return;
      const t = e.changedTouches[0];
      touchId = t.identifier;
      const r = zone.getBoundingClientRect();
      cx = r.left + r.width  / 2;
      cy = r.top  + r.height / 2;
      update(t);
    }, { passive: false });

    zone.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === touchId) update(t);
      }
    }, { passive: false });

    const end = (e: TouchEvent): void => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === touchId) reset();
      }
    };
    zone.addEventListener('touchend',    end);
    zone.addEventListener('touchcancel', end);
  }

  private setupLook(): void {
    const zone = document.getElementById('lookZone');
    if (!zone) return;

    const sens = 0.004;
    let touchId: number | null = null;
    let lastX = 0, lastY = 0;

    zone.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (touchId !== null) return;
      const t = e.changedTouches[0];
      touchId = t.identifier;
      lastX = t.clientX;
      lastY = t.clientY;
    }, { passive: false });

    zone.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier !== touchId) continue;
        this.yaw   -= (t.clientX - lastX) * sens;
        this.pitch -= (t.clientY - lastY) * sens;
        this.pitch  = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, this.pitch));
        lastX = t.clientX;
        lastY = t.clientY;
      }
    }, { passive: false });

    const end = (e: TouchEvent): void => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === touchId) touchId = null;
      }
    };
    zone.addEventListener('touchend',    end);
    zone.addEventListener('touchcancel', end);
  }

  private setupButtons(): void {
    const fireBtn   = document.getElementById('fireBtn');
    const reloadBtn = document.getElementById('reloadBtn');
    const pauseBtn  = document.getElementById('pauseBtn');

    fireBtn?.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.firing = true;
      this.callbacks.onFire();
    }, { passive: false });
    const stopFire = (e: TouchEvent): void => { e.preventDefault(); this.firing = false; };
    fireBtn?.addEventListener('touchend',    stopFire, { passive: false });
    fireBtn?.addEventListener('touchcancel', stopFire, { passive: false });

    reloadBtn?.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.callbacks.onReload();
    }, { passive: false });

    pauseBtn?.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.callbacks.onPause();
    }, { passive: false });
  }
}

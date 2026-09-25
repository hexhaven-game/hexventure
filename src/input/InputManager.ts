import * as THREE from 'three';

// Keyboard state plus mouse position/clicks on the canvas. "pressed" lasts one frame.
export class InputManager {
  readonly mouse = new THREE.Vector2(); // normalized device coordinates
  hasMouse = false;
  private down = new Set<string>();
  private pressed = new Set<string>();
  private clicks = 0;
  private rightClicks = 0;
  private wheelDelta = 0;

  constructor(canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', (e) => {
      if (['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'F3'].includes(e.code)) e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
      this.down.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => this.down.clear());
    canvas.addEventListener('pointermove', (e) => {
      const r = canvas.getBoundingClientRect();
      this.mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      this.hasMouse = true;
    });
    canvas.addEventListener('pointerleave', () => (this.hasMouse = false));
    canvas.addEventListener('pointerdown', (e) => {
      if (e.button === 0) this.clicks++;
      if (e.button === 2) this.rightClicks++;
      // mouse buttons also count as keys: 'Mouse0' (left), 'Mouse2' (right)
      this.pressed.add(`Mouse${e.button}`);
      this.down.add(`Mouse${e.button}`);
    });
    window.addEventListener('pointerup', (e) => this.down.delete(`Mouse${e.button}`));
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.wheelDelta += e.deltaY;
      },
      { passive: false },
    );
  }

  isDown(...codes: string[]) {
    return codes.some((c) => this.down.has(c));
  }

  wasPressed(code: string) {
    return this.pressed.has(code);
  }

  consumeClick() {
    const c = this.clicks > 0;
    this.clicks = 0;
    return c;
  }

  consumeRightClick() {
    const c = this.rightClicks > 0;
    this.rightClicks = 0;
    return c;
  }

  get wheel() {
    return this.wheelDelta;
  }

  // call at the end of every frame
  endFrame() {
    this.pressed.clear();
    this.clicks = 0;
    this.rightClicks = 0;
    this.wheelDelta = 0;
  }
}

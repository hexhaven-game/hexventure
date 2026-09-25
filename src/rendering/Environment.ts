import * as THREE from 'three';
import { PLAY_CAMERA } from '../game/config';

const SKY = 0xa9dff0;

export class Environment {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  pixelRatio: number;
  private maxRatio: number;
  private slow = 0;
  private fast = 0;

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.maxRatio = Math.min(window.devicePixelRatio, 2);
    this.pixelRatio = this.maxRatio;
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(SKY);
    this.scene.fog = new THREE.Fog(SKY, 160, 380);

    this.camera = new THREE.PerspectiveCamera(PLAY_CAMERA.fov, container.clientWidth / container.clientHeight, 0.5, 700);

    window.addEventListener('resize', () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      this.renderer.setSize(w, h);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    });
  }

  // Keep the frame rate up: render at a lower resolution while frames are slow (> 18 ms for a
  // while), and step back up once there is plenty of headroom again.
  adapt(dt: number) {
    if (dt > 0.018) this.slow += dt;
    else this.slow = Math.max(0, this.slow - dt * 0.5);
    this.fast = dt < 0.0125 ? this.fast + dt : 0;
    let next = this.pixelRatio;
    if (this.slow > 1 && this.pixelRatio > 1) next = Math.max(1, this.pixelRatio - 0.25);
    else if (this.fast > 4 && this.pixelRatio < this.maxRatio) next = Math.min(this.maxRatio, this.pixelRatio + 0.25);
    if (next !== this.pixelRatio) {
      this.pixelRatio = next;
      this.renderer.setPixelRatio(next);
      this.slow = 0;
      this.fast = 0;
    }
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}

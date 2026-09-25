import * as THREE from 'three';
import { BUILD_CAMERA } from '../game/config';
import type { InputManager } from '../input/InputManager';
import { clamp, damp } from '../utils/math';

// Higher, more top-down view for building. WASD pans, the mouse wheel zooms.
export class BuildCameraController {
  readonly focus = new THREE.Vector3();
  private distance = BUILD_CAMERA.distance;
  private goalDistance = BUILD_CAMERA.distance;

  enter(from: THREE.Vector3) {
    this.focus.set(from.x, 0, from.z);
  }

  update(dt: number, input: InputManager) {
    let dx = 0;
    let dz = 0;
    if (input.isDown('KeyW', 'ArrowUp')) dz -= 1;
    if (input.isDown('KeyS', 'ArrowDown')) dz += 1;
    if (input.isDown('KeyA', 'ArrowLeft')) dx -= 1;
    if (input.isDown('KeyD', 'ArrowRight')) dx += 1;
    const speed = BUILD_CAMERA.panSpeed * (this.distance / BUILD_CAMERA.distance);
    this.focus.x += dx * speed * dt;
    this.focus.z += dz * speed * dt;
    if (input.wheel) {
      this.goalDistance = clamp(this.goalDistance * Math.exp(input.wheel * 0.001), BUILD_CAMERA.minDistance, BUILD_CAMERA.maxDistance);
    }
    this.distance = damp(this.distance, this.goalDistance, 10, dt);
  }

  desired(outPos: THREE.Vector3, outLook: THREE.Vector3) {
    const p = THREE.MathUtils.degToRad(BUILD_CAMERA.pitchDeg);
    outLook.copy(this.focus);
    outPos.set(0, Math.sin(p) * this.distance, Math.cos(p) * this.distance).add(outLook);
  }
}

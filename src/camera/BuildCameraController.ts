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
    // pan along the screen (the view is turned a little, as in Hexhaven)
    let fwd = 0;
    let side = 0;
    if (input.isDown('KeyW', 'ArrowUp')) fwd += 1;
    if (input.isDown('KeyS', 'ArrowDown')) fwd -= 1;
    if (input.isDown('KeyA', 'ArrowLeft')) side -= 1;
    if (input.isDown('KeyD', 'ArrowRight')) side += 1;
    const yaw = THREE.MathUtils.degToRad(BUILD_CAMERA.yawDeg);
    const speed = BUILD_CAMERA.panSpeed * (this.distance / BUILD_CAMERA.distance);
    this.focus.x += (-Math.sin(yaw) * fwd + Math.cos(yaw) * side) * speed * dt;
    this.focus.z += (-Math.cos(yaw) * fwd - Math.sin(yaw) * side) * speed * dt;
    if (input.wheel) {
      this.goalDistance = clamp(this.goalDistance * Math.exp(input.wheel * 0.001), BUILD_CAMERA.minDistance, BUILD_CAMERA.maxDistance);
    }
    this.distance = damp(this.distance, this.goalDistance, 10, dt);
  }

  desired(outPos: THREE.Vector3, outLook: THREE.Vector3) {
    const p = THREE.MathUtils.degToRad(BUILD_CAMERA.pitchDeg);
    const yaw = THREE.MathUtils.degToRad(BUILD_CAMERA.yawDeg);
    const flat = Math.cos(p) * this.distance;
    outLook.copy(this.focus);
    outPos.set(Math.sin(yaw) * flat, Math.sin(p) * this.distance, Math.cos(yaw) * flat).add(outLook);
  }
}

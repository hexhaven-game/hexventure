import * as THREE from 'three';
import { PLAY_CAMERA } from '../game/config';

// Fixed-angle adventure camera: looks down at ~50°, always from the same side, and eases after
// the player. The player can't rotate it.
export class PlayCameraController {
  private follow = new THREE.Vector3();
  private initialized = false;

  update(dt: number, player: THREE.Vector3) {
    if (!this.initialized) {
      this.follow.copy(player);
      this.initialized = true;
    }
    this.follow.lerp(player, 1 - Math.exp(-PLAY_CAMERA.follow * dt));
  }

  snap(player: THREE.Vector3) {
    this.follow.copy(player);
  }

  // where the camera wants to be, and the point it looks at
  desired(outPos: THREE.Vector3, outLook: THREE.Vector3) {
    const p = THREE.MathUtils.degToRad(PLAY_CAMERA.pitchDeg);
    outLook.copy(this.follow).setY(this.follow.y + PLAY_CAMERA.lookHeight);
    outPos.set(0, Math.sin(p) * PLAY_CAMERA.distance, Math.cos(p) * PLAY_CAMERA.distance).add(outLook);
  }
}

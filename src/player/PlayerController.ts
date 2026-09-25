import * as THREE from 'three';
import { PLAYER } from '../game/config';
import type { InputManager } from '../input/InputManager';
import { damp, dampAngle, dampFactor } from '../utils/math';
import type { WorldCollision } from '../world/Collision';
import type { Player } from './Player';

// WASD relative to the camera, smooth acceleration and turning, knockback from hits.
export class PlayerController {
  readonly velocity = new THREE.Vector3();
  groundY = 0;
  private knock = new THREE.Vector3();
  private player: Player;
  private input: InputManager;
  private collision: WorldCollision;
  private forward = new THREE.Vector3();
  private right = new THREE.Vector3();
  private wish = new THREE.Vector3();

  constructor(player: Player, input: InputManager, collision: WorldCollision) {
    this.player = player;
    this.input = input;
    this.collision = collision;
  }

  teleport(p: THREE.Vector3) {
    this.player.root.position.copy(p);
    this.groundY = p.y;
    this.velocity.set(0, 0, 0);
    this.knock.set(0, 0, 0);
  }

  knockback(dir: THREE.Vector3, strength: number) {
    this.knock.set(dir.x, 0, dir.z).normalize().multiplyScalar(strength);
  }

  // returns 0..1: how much the player is walking (drives the animation)
  update(dt: number, camera: THREE.Camera, enabled: boolean): number {
    camera.getWorldDirection(this.forward);
    this.forward.y = 0;
    this.forward.normalize();
    this.right.crossVectors(this.forward, THREE.Object3D.DEFAULT_UP);

    this.wish.set(0, 0, 0);
    if (enabled) {
      const i = this.input;
      if (i.isDown('KeyW', 'ArrowUp')) this.wish.add(this.forward);
      if (i.isDown('KeyS', 'ArrowDown')) this.wish.sub(this.forward);
      if (i.isDown('KeyD', 'ArrowRight')) this.wish.add(this.right);
      if (i.isDown('KeyA', 'ArrowLeft')) this.wish.sub(this.right);
    }
    if (this.wish.lengthSq() > 0) this.wish.normalize();
    const speed = PLAYER.speed * (this.player.attacking ? 0.35 : 1);
    this.velocity.lerp(this.wish.multiplyScalar(speed), dampFactor(PLAYER.accel, dt));

    const root = this.player.root;
    const vx = this.velocity.x + this.knock.x;
    const vz = this.velocity.z + this.knock.z;
    this.knock.multiplyScalar(Math.exp(-9 * dt));
    this.groundY = this.collision.move(root.position, vx * dt, vz * dt, PLAYER.radius, this.groundY);
    root.position.y = damp(root.position.y, this.groundY, 18, dt);

    const planar = Math.hypot(this.velocity.x, this.velocity.z);
    if (planar > 0.3 && !this.player.attacking) {
      root.rotation.y = dampAngle(root.rotation.y, Math.atan2(this.velocity.x, this.velocity.z), 14, dt);
    }
    return Math.min(1, planar / PLAYER.speed);
  }
}

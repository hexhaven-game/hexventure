import * as THREE from 'three';
import { FLASK, PLAYER, ROLL, STAMINA } from '../game/config';
import type { InputManager } from '../input/InputManager';
import { damp, dampAngle, dampFactor } from '../utils/math';
import type { WorldCollision } from '../world/Collision';
import type { Player } from './Player';
import type { PlayerStats } from './PlayerStats';

// WASD relative to the camera, dodge roll (Shift) with invulnerability frames, drinking the flask
// (Q), knockback from hits.
export class PlayerController {
  readonly velocity = new THREE.Vector3();
  groundY = 0;
  rollT = -1;
  drinkT = -1;
  private rollDir = new THREE.Vector3();
  private healed = false;
  private knock = new THREE.Vector3();
  private player: Player;
  private input: InputManager;
  private collision: WorldCollision;
  private stats: PlayerStats;
  private forward = new THREE.Vector3();
  private right = new THREE.Vector3();
  private wish = new THREE.Vector3();

  constructor(player: Player, input: InputManager, collision: WorldCollision, stats: PlayerStats) {
    this.player = player;
    this.input = input;
    this.collision = collision;
    this.stats = stats;
  }

  get rolling() {
    return this.rollT >= 0;
  }

  get drinking() {
    return this.drinkT >= 0;
  }

  get iframes() {
    return this.rollT >= ROLL.iFrom && this.rollT <= ROLL.iTo;
  }

  teleport(p: THREE.Vector3) {
    this.player.root.position.copy(p);
    this.groundY = p.y;
    this.velocity.set(0, 0, 0);
    this.knock.set(0, 0, 0);
    this.rollT = -1;
    this.drinkT = -1;
  }

  knockback(dir: THREE.Vector3, strength: number) {
    this.knock.set(dir.x, 0, dir.z).normalize().multiplyScalar(strength);
    this.drinkT = -1; // a hit interrupts drinking
  }

  // can the player start an attack now
  get free() {
    return !this.rolling && !this.drinking;
  }

  // returns 0..1: how much the player is walking (drives the animation)
  update(dt: number, camera: THREE.Camera, enabled: boolean): number {
    camera.getWorldDirection(this.forward);
    this.forward.y = 0;
    this.forward.normalize();
    this.right.crossVectors(this.forward, THREE.Object3D.DEFAULT_UP);

    this.wish.set(0, 0, 0);
    const i = this.input;
    if (enabled) {
      if (i.isDown('KeyW', 'ArrowUp')) this.wish.add(this.forward);
      if (i.isDown('KeyS', 'ArrowDown')) this.wish.sub(this.forward);
      if (i.isDown('KeyD', 'ArrowRight')) this.wish.add(this.right);
      if (i.isDown('KeyA', 'ArrowLeft')) this.wish.sub(this.right);
    }
    if (this.wish.lengthSq() > 0) this.wish.normalize();
    const root = this.player.root;

    // dodge roll: in the direction you hold, or forward
    if (enabled && (i.wasPressed('ShiftLeft') || i.wasPressed('ShiftRight') || i.consumeRightClick()) && this.free && !this.player.attacking) {
      if (this.stats.spend(STAMINA.roll)) {
        this.rollT = 0;
        if (this.wish.lengthSq() > 0) this.rollDir.copy(this.wish);
        else this.rollDir.set(Math.sin(root.rotation.y), 0, Math.cos(root.rotation.y));
        root.rotation.y = Math.atan2(this.rollDir.x, this.rollDir.z);
      }
    }
    // flask: heals one heart, slows you down while drinking
    if (enabled && i.wasPressed('KeyQ') && this.free && this.stats.flasks > 0 && this.stats.hearts < this.stats.maxHearts) {
      this.drinkT = 0;
      this.healed = false;
      this.stats.flasks--;
    }

    if (this.rolling) {
      this.rollT += dt;
      const k = this.rollT / ROLL.time;
      this.velocity.copy(this.rollDir).multiplyScalar(ROLL.speed * (1 - k * 0.6));
      if (this.rollT >= ROLL.time) this.rollT = -1;
    } else {
      const slow = this.player.attacking ? 0.35 : this.drinking ? 0.3 : 1;
      this.velocity.lerp(this.wish.multiplyScalar(PLAYER.speed * slow), dampFactor(PLAYER.accel, dt));
    }
    if (this.drinking) {
      this.drinkT += dt;
      if (!this.healed && this.drinkT >= FLASK.healAt) {
        this.healed = true;
        this.stats.hearts = Math.min(this.stats.maxHearts, this.stats.hearts + 1);
      }
      if (this.drinkT >= FLASK.drink) this.drinkT = -1;
    }

    const vx = this.velocity.x + this.knock.x;
    const vz = this.velocity.z + this.knock.z;
    this.knock.multiplyScalar(Math.exp(-9 * dt));
    this.groundY = this.collision.move(root.position, vx * dt, vz * dt, PLAYER.radius, this.groundY);
    root.position.y = damp(root.position.y, this.groundY, 18, dt);

    const planar = Math.hypot(this.velocity.x, this.velocity.z);
    if (planar > 0.3 && !this.player.attacking && !this.rolling) {
      root.rotation.y = dampAngle(root.rotation.y, Math.atan2(this.velocity.x, this.velocity.z), 14, dt);
    }
    return this.rolling ? 0 : Math.min(1, planar / PLAYER.speed);
  }

  // turn to face a point instantly (attacks snap towards the nearest enemy)
  faceTowards(p: THREE.Vector3) {
    const root = this.player.root;
    root.rotation.y = Math.atan2(p.x - root.position.x, p.z - root.position.z);
  }
}

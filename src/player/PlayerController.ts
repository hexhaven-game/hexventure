import * as THREE from 'three';
import { FLASK, PLAYER, ROLL } from '../game/config';
import type { InputManager } from '../input/InputManager';
import { damp, dampAngle, dampFactor } from '../utils/math';
import type { WorldCollision } from '../world/Collision';
import type { Player } from './Player';
import type { PlayerCombat } from './PlayerCombat';
import type { PlayerStats } from './PlayerStats';

// Movement: WASD relative to the camera, a dodge roll (Shift) with invulnerability frames, the
// flask (Q), knockback and a short hit-stun. While attacking you are committed: the attack moves
// you (a step into the swing), not the keys. The hero faces the aim point (mouse, lock-on target).
export class PlayerController {
  readonly velocity = new THREE.Vector3();
  groundY = 0;
  rollT = -1;
  rollId = 0; // counts rolls (a flame trail burns each enemy once per roll)
  drinkT = -1;
  stun = 0; // seconds of hit-stun left
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
    this.stun = 0;
  }

  knockback(dir: THREE.Vector3, strength: number) {
    this.knock.set(dir.x, 0, dir.z).normalize().multiplyScalar(strength);
    this.drinkT = -1; // a hit interrupts drinking
    this.stun = 0.3;
  }

  // the direction the keys point (camera relative), or zero
  get moveWish() {
    return this.wish;
  }

  // returns 0..1: how much the player is walking (drives the animation)
  // `aim`: the point the hero should face (mouse or lock-on target), if any
  update(dt: number, camera: THREE.Camera, enabled: boolean, combat: PlayerCombat, aim: THREE.Vector3 | null): number {
    camera.getWorldDirection(this.forward);
    this.forward.y = 0;
    this.forward.normalize();
    this.right.crossVectors(this.forward, THREE.Object3D.DEFAULT_UP);
    this.stun = Math.max(0, this.stun - dt);
    const free = enabled && this.stun <= 0;

    this.wish.set(0, 0, 0);
    const i = this.input;
    if (free) {
      if (i.isDown('KeyW', 'ArrowUp')) this.wish.add(this.forward);
      if (i.isDown('KeyS', 'ArrowDown')) this.wish.sub(this.forward);
      if (i.isDown('KeyD', 'ArrowRight')) this.wish.add(this.right);
      if (i.isDown('KeyA', 'ArrowLeft')) this.wish.sub(this.right);
    }
    if (this.wish.lengthSq() > 0) this.wish.normalize();
    const root = this.player.root;

    // dodge roll: in the direction you hold, or backwards from the aim; cancels an attack's recovery
    if (free && (i.wasPressed('ShiftLeft') || i.wasPressed('ShiftRight')) && !this.rolling && !this.drinking && combat.canRoll) {
      if (this.stats.spend(this.stats.rollCost)) {
        combat.cancel();
        this.rollT = 0;
        this.rollId++;
        if (this.wish.lengthSq() > 0) this.rollDir.copy(this.wish);
        else this.rollDir.set(-Math.sin(root.rotation.y), 0, -Math.cos(root.rotation.y)); // a backstep
        root.rotation.y = Math.atan2(this.rollDir.x, this.rollDir.z);
      }
    }
    // flask: heals one heart, slows you down while drinking
    if (free && i.wasPressed('KeyQ') && !this.rolling && !combat.busy && !this.drinking && this.stats.flasks > 0 && this.stats.hearts < this.stats.maxHearts) {
      this.drinkT = 0;
      this.healed = false;
      this.stats.flasks--;
    }

    const attack = combat.attack;
    if (this.rolling) {
      this.rollT += dt;
      const k = this.rollT / ROLL.time;
      this.velocity.copy(this.rollDir).multiplyScalar(ROLL.speed * (1 - k * 0.6));
      if (this.rollT >= ROLL.time) this.rollT = -1;
    } else if (attack) {
      // committed: a step into the swing during the hit, otherwise planted
      const phase = combat.phase;
      const f = new THREE.Vector3(Math.sin(root.rotation.y), 0, Math.cos(root.rotation.y));
      const step = phase === 'active' ? attack.def.lunge * (1 - combat.phaseProgress) : phase === 'windup' ? 1 : 0;
      this.velocity.copy(f).multiplyScalar(step);
    } else {
      const slow = combat.charge >= 0 ? 0.35 : this.drinking ? 0.3 : 1;
      this.velocity.lerp(this.wish.multiplyScalar(PLAYER.speed * slow * this.stats.speedMul), dampFactor(PLAYER.accel, dt));
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

    // facing: the aim point when there is one (you can walk one way and look another), otherwise
    // where you walk. Attacks turn only in their wind-up.
    const turnable = !this.rolling && (!attack || combat.phase === 'windup') && this.stun <= 0;
    if (turnable) {
      const planar = Math.hypot(this.velocity.x, this.velocity.z);
      if (aim) {
        const a = Math.atan2(aim.x - root.position.x, aim.z - root.position.z);
        root.rotation.y = dampAngle(root.rotation.y, a, attack ? 30 : 18, dt);
      } else if (planar > 0.3) {
        root.rotation.y = dampAngle(root.rotation.y, Math.atan2(this.velocity.x, this.velocity.z), 14, dt);
      }
    }
    return this.rolling || attack ? 0 : Math.min(1, Math.hypot(this.velocity.x, this.velocity.z) / PLAYER.speed);
  }

  // turn to face a point instantly (the first frame of an attack)
  faceTowards(p: THREE.Vector3) {
    const root = this.player.root;
    root.rotation.y = Math.atan2(p.x - root.position.x, p.z - root.position.z);
  }
}

import * as THREE from 'three';
import { TAU, damp, dampAngle } from '../utils/math';
import type { WorldCollision } from '../world/Collision';

export type EnemyState = 'idle' | 'chase' | 'windup' | 'lunge' | 'recover' | 'dead';

const SIGHT = 9;
const GIVE_UP = 15;
const REACH = 1.8;
const RADIUS = 0.6;

// A little slime: wanders near home, hops after the player, winds up and lunges.
export class Enemy {
  readonly root = new THREE.Group();
  state: EnemyState = 'idle';
  hp = 2;
  lastHitSwing = -1;
  private body: THREE.Mesh;
  private mat: THREE.MeshStandardMaterial;
  private home: THREE.Vector3;
  private groundY: number;
  private stateT = 0;
  private hop = Math.random() * TAU;
  private knock = new THREE.Vector3();
  private lungeDir = new THREE.Vector3();
  private wander = new THREE.Vector3();
  private wanderT = 0;
  private flashT = 0;
  private hitDone = false;
  private deathT = 0;

  readonly tileKey: string;

  constructor(pos: THREE.Vector3, tileKey: string) {
    this.tileKey = tileKey;
    this.home = pos.clone();
    this.groundY = pos.y;
    this.root.position.copy(pos);
    this.wander.copy(pos);
    this.mat = new THREE.MeshStandardMaterial({ color: 0x7b6cff, roughness: 0.25, emissive: 0x000000 });
    this.body = new THREE.Mesh(new THREE.SphereGeometry(0.7, 20, 14), this.mat);
    this.body.castShadow = true;
    const white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });
    const black = new THREE.MeshStandardMaterial({ color: 0x1d1b26, roughness: 0.4 });
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), white);
      eye.position.set(side * 0.24, 0.18, 0.58);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), black);
      pupil.position.set(0, 0, 0.12);
      eye.add(pupil);
      this.body.add(eye);
    }
    this.root.add(this.body);
  }

  get alive() {
    return this.state !== 'dead';
  }

  get removable() {
    return this.state === 'dead' && this.deathT > 0.35;
  }

  // returns true when this hit killed it
  hit(from: THREE.Vector3): boolean {
    if (!this.alive) return false;
    this.hp--;
    this.flashT = 0.15;
    this.knock.subVectors(this.root.position, from).setY(0).normalize().multiplyScalar(11);
    if (this.hp <= 0) {
      this.state = 'dead';
      this.deathT = 0;
      return true;
    }
    this.setState('recover');
    return false;
  }

  private setState(s: EnemyState) {
    this.state = s;
    this.stateT = 0;
    this.hitDone = false;
  }

  update(dt: number, player: THREE.Vector3, collision: WorldCollision, onHitPlayer: (dir: THREE.Vector3) => void) {
    this.stateT += dt;
    this.flashT = Math.max(0, this.flashT - dt);
    this.mat.emissive.setScalar(this.flashT > 0 ? 0.9 : 0);

    if (this.state === 'dead') {
      this.deathT += dt;
      const k = Math.max(0, 1 - this.deathT / 0.3);
      this.body.scale.set(1 + (1 - k) * 0.6, k * 0.8, 1 + (1 - k) * 0.6);
      return;
    }

    const toPlayer = new THREE.Vector3().subVectors(player, this.root.position).setY(0);
    const dist = toPlayer.length();
    const fromHome = this.root.position.distanceTo(this.home);
    let move = new THREE.Vector3();
    let speed = 0;

    switch (this.state) {
      case 'idle':
        this.wanderT -= dt;
        if (this.wanderT <= 0) {
          const a = Math.random() * TAU;
          this.wander.set(this.home.x + Math.cos(a) * 2.5, this.home.y, this.home.z + Math.sin(a) * 2.5);
          this.wanderT = 2 + Math.random() * 2;
        }
        move.subVectors(this.wander, this.root.position).setY(0);
        speed = move.length() > 0.3 ? 1.2 : 0;
        if (dist < SIGHT) this.setState('chase');
        break;
      case 'chase':
        move.copy(toPlayer);
        speed = 3.3;
        if (dist < REACH) this.setState('windup');
        else if (dist > GIVE_UP || fromHome > GIVE_UP + 2) this.setState('idle');
        break;
      case 'windup':
        if (this.stateT > 0.5) {
          this.lungeDir.copy(toPlayer).normalize();
          this.setState('lunge');
        }
        break;
      case 'lunge':
        move.copy(this.lungeDir);
        speed = 9;
        if (!this.hitDone && dist < 1.25) {
          this.hitDone = true;
          onHitPlayer(this.lungeDir.clone());
        }
        if (this.stateT > 0.2) this.setState('recover');
        break;
      case 'recover':
        if (this.stateT > 1.0) this.setState(dist < SIGHT ? 'chase' : 'idle');
        break;
    }

    if (move.lengthSq() > 0) move.normalize();
    const vx = move.x * speed + this.knock.x;
    const vz = move.z * speed + this.knock.z;
    this.knock.multiplyScalar(Math.exp(-8 * dt));
    this.groundY = collision.move(this.root.position, vx * dt, vz * dt, RADIUS, this.groundY);
    this.root.position.y = damp(this.root.position.y, this.groundY, 15, dt);
    if (this.state !== 'lunge') this.root.rotation.y = dampAngle(this.root.rotation.y, Math.atan2(toPlayer.x, toPlayer.z), dist < SIGHT ? 8 : 2, dt);

    // squash and hop
    const moving = speed > 0 ? 1 : 0;
    this.hop += dt * (moving ? 9 : 3);
    const bounce = Math.abs(Math.sin(this.hop));
    let sy = 1 - (1 - bounce) * 0.18 * (moving ? 1 : 0.4);
    if (this.state === 'windup') sy = 0.7 - Math.sin(this.stateT * 30) * 0.04;
    this.body.scale.set(1 / Math.sqrt(sy), sy, 1 / Math.sqrt(sy));
    this.body.position.y = 0.52 * sy + (moving ? bounce * 0.35 : 0);
  }
}

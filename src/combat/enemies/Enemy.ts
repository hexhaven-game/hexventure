import * as THREE from 'three';
import { dampAngle, damp } from '../../utils/math';
import type { WorldCollision } from '../../world/Collision';

export type EnemyKind = 'slime' | 'husk' | 'spitter' | 'bat' | 'boar' | 'rockling' | 'wisp';

// elites: a tougher version with one twist
export type Elite = 'swift' | 'armored' | 'splitting';
export const ELITE_NAME: Record<Elite, string> = { swift: 'Swift', armored: 'Armoured', splitting: 'Splitting' };
const ELITE_COLOR: Record<Elite, number> = { swift: 0x5ad0ff, armored: 0xffc040, splitting: 0x9dff6a };

// what an enemy may know about and do to the world
export interface EnemyCtx {
  player: THREE.Vector3; // feet
  collision: WorldCollision;
  hurtPlayer: (from: THREE.Vector3, damage: number, knock: number, source?: Enemy) => void;
  shoot: (from: THREE.Vector3, target: THREE.Vector3, kind?: 'thorn' | 'rock' | 'orb') => void;
  // a ring on the ground that warns where a big attack lands
  telegraph: (at: THREE.Vector3, radius: number, time: number) => void;
  // a big landing: dust ring, hurts the player inside `radius`
  slam: (at: THREE.Vector3, radius: number, knock: number) => void;
  summon: (kind: EnemyKind, at: THREE.Vector3, tileKey: string) => void;
}

// states in which an enemy is about to attack: they start with a warning glint
const TELLS = ['windup', 'scrape', 'slam', 'throw', 'crouch', 'squash'];

// Shared behaviour: hit points, flash and knockback when hit, a stagger unless the enemy has
// poise, dying, and moving with the same collision as the player. Subclasses only decide
// where to go and when to attack (think).
export abstract class Enemy {
  readonly root = new THREE.Group();
  readonly body = new THREE.Group(); // animated part
  readonly kind: EnemyKind;
  readonly tileKey: string;
  hp: number;
  readonly maxHp: number;
  bossName: string | null = null; // minibosses and bosses get a health bar
  elite: Elite | null = null;
  state = 'idle';
  stateT = 0;
  lastHitSwing = -1;
  abstract readonly radius: number;
  abstract readonly embers: number;
  protected flying = false;
  protected poiseArmor = false; // keeps attacking when hit (until its poise breaks)
  protected weight = 1; // how far hits push it
  protected home: THREE.Vector3;
  protected groundY: number;
  protected move = new THREE.Vector3();
  protected speed = 0;
  protected knock = new THREE.Vector3();
  // poise: hits wear it down; when it breaks the enemy sinks down for a moment and the next hit
  // is a critical (double damage). Heavy attacks break it faster.
  poiseMax = 0;
  poise = 0;
  private poiseRest = 0;
  // a warning glint just before an attack (read by the combat system)
  told = false;
  private tellT = 0;
  private flashT = 0;
  private flashMats: THREE.MeshStandardMaterial[] = [];
  private deathT = 0;
  private dead = false;

  constructor(kind: EnemyKind, pos: THREE.Vector3, tileKey: string, hp: number) {
    this.kind = kind;
    this.tileKey = tileKey;
    this.hp = hp;
    this.maxHp = hp;
    this.home = pos.clone();
    this.groundY = pos.y;
    this.root.position.copy(pos);
    this.root.add(this.body);
  }

  // a material that flashes white when hit
  protected mat(color: number, roughness = 0.5): THREE.MeshStandardMaterial {
    const m = new THREE.MeshStandardMaterial({ color, roughness });
    this.flashMats.push(m);
    return m;
  }

  protected finish() {
    this.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = true;
    });
  }

  // make this an elite: more health, bigger, a coloured glow, and its twist
  makeElite(kind: Elite) {
    this.elite = kind;
    const extra = kind === 'armored' ? 2 : 1.5;
    this.hp = Math.ceil(this.hp * extra);
    (this as { maxHp: number }).maxHp = this.hp;
    this.body.scale.multiplyScalar(1.2);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.9, 1.15, 32).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: ELITE_COLOR[kind], transparent: true, opacity: 0.7, depthWrite: false }),
    );
    ring.position.y = 0.06;
    ring.scale.setScalar(this.radius * 1.4 + 0.3);
    this.root.add(ring);
    for (const m of this.flashMats) m.emissive.setHex(ELITE_COLOR[kind]).multiplyScalar(0.15);
    this.glow = ELITE_COLOR[kind];
  }

  private glow = 0;

  get displayName() {
    return this.bossName ?? (this.elite ? `${ELITE_NAME[this.elite]} ${this.kind}` : null);
  }

  get alive() {
    return !this.dead;
  }

  get removable() {
    return this.dead && this.deathT > 0.35;
  }

  protected setState(s: string) {
    this.state = s;
    this.stateT = 0;
    if (TELLS.includes(s)) {
      this.tellT = 0.3;
      this.told = true;
    }
  }

  // bosses set poiseMax; everyone else breaks according to their weight
  get poiseLimit() {
    return this.poiseMax || Math.min(8, Math.max(1.5, this.weight * 1.5));
  }

  get broken() {
    return this.state === 'broken';
  }

  protected toPlayer(ctx: EnemyCtx) {
    const dir = new THREE.Vector3(ctx.player.x - this.root.position.x, 0, ctx.player.z - this.root.position.z);
    const dist = dir.length();
    if (dist > 1e-4) dir.divideScalar(dist);
    return { dir, dist };
  }

  protected face(dir: THREE.Vector3, rate: number, dt: number) {
    this.root.rotation.y = dampAngle(this.root.rotation.y, Math.atan2(dir.x, dir.z), rate, dt);
  }

  protected get forward() {
    return new THREE.Vector3(Math.sin(this.root.rotation.y), 0, Math.cos(this.root.rotation.y));
  }

  hit(from: THREE.Vector3, damage: number, poiseDamage = 1): { killed: boolean; crit: boolean; broke: boolean } {
    const out = { killed: false, crit: false, broke: false };
    if (this.dead) return out;
    if (this.broken) {
      out.crit = true;
      damage *= 2;
    }
    this.hp -= this.elite === 'armored' ? damage * 0.75 : damage;
    this.flashT = 0.14;
    const push = out.crit ? 16 : 10;
    this.knock.set(this.root.position.x - from.x, 0, this.root.position.z - from.z).normalize().multiplyScalar(push / this.weight);
    if (this.hp <= 0) {
      this.dead = true;
      this.deathT = 0;
      out.killed = true;
      return out;
    }
    if (out.crit) {
      this.setState('stagger');
      return out;
    }
    this.poise += poiseDamage;
    this.poiseRest = 2.5;
    if (this.poise >= this.poiseLimit) {
      this.poise = 0;
      this.setState('broken');
      out.broke = true;
    } else if (!this.poiseArmor) this.setState('stagger');
    return out;
  }

  update(dt: number, ctx: EnemyCtx) {
    this.stateT += dt;
    this.flashT = Math.max(0, this.flashT - dt);
    for (const m of this.flashMats) {
      if (this.flashT > 0) m.emissive.setScalar(0.85);
      else if (this.glow) m.emissive.setHex(this.glow).multiplyScalar(0.18 + Math.sin(this.stateT * 4) * 0.05);
      else m.emissive.setScalar(0);
    }
    if (this.dead) {
      this.deathT += dt;
      const k = Math.max(0, 1 - this.deathT / 0.3);
      this.body.scale.set(1 + (1 - k) * 0.5, Math.max(0.01, k), 1 + (1 - k) * 0.5);
      return;
    }
    this.move.set(0, 0, 0);
    this.speed = 0;
    this.poiseRest -= dt;
    if (this.poiseRest <= 0) this.poise = Math.max(0, this.poise - dt * 1.5);
    this.tellT = Math.max(0, this.tellT - dt);
    if (this.tellT > 0 && this.flashT <= 0) {
      // the glint: a warm pulse over the whole body
      for (const m of this.flashMats) m.emissive.setRGB(0.55 * this.tellT / 0.3 + 0.1, 0.45 * this.tellT / 0.3 + 0.08, 0.2 * this.tellT / 0.3);
    }
    if (this.state === 'stagger') {
      if (this.stateT > 0.35) this.setState('chase');
    } else if (this.state === 'broken') {
      // knocked off balance: sinks down, open to a critical hit
      const k = Math.min(1, this.stateT / 0.15);
      this.body.rotation.x = -0.35 * k * (this.stateT > 1.3 ? (1.6 - this.stateT) / 0.3 : 1);
      if (this.stateT > 1.6) {
        this.body.rotation.x = 0;
        this.setState('chase');
      }
    } else this.think(dt, ctx);

    if (this.elite === 'swift') this.speed *= 1.5;
    const vx = this.move.x * this.speed + this.knock.x;
    const vz = this.move.z * this.speed + this.knock.z;
    this.knock.multiplyScalar(Math.exp(-8 * dt));
    if (this.flying) {
      this.root.position.x += vx * dt;
      this.root.position.z += vz * dt;
    } else {
      this.groundY = ctx.collision.move(this.root.position, vx * dt, vz * dt, this.radius, this.groundY);
      this.root.position.y = damp(this.root.position.y, this.groundY, 15, dt);
    }
  }

  protected abstract think(dt: number, ctx: EnemyCtx): void;
}

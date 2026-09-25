import * as THREE from 'three';
import { PLAYER } from '../game/config';
import type { Player } from '../player/Player';
import type { PlayerCombat } from '../player/PlayerCombat';
import type { PlayerController } from '../player/PlayerController';
import type { PlayerStats } from '../player/PlayerStats';
import type { Particles } from '../rendering/Particles';
import type { WorldCollision } from '../world/Collision';
import type { HexTile } from '../world/HexTile';
import type { Enemy, EnemyCtx } from './enemies/Enemy';
import type { Rings } from '../rendering/Rings';
import { Projectiles } from './Projectiles';
import { createEnemy } from './spawns';


const COLORS: Record<string, number[]> = {
  slime: [0x7b6cff, 0x9d8fff],
  husk: [0xe6dcc6, 0x5d6670],
  spitter: [0xc2405a, 0x4caf50],
  bat: [0x4a3a66, 0xffe066],
  boar: [0x7a4b2e, 0xc98a6a],
  rockling: [0x8f8a80, 0x4affd0],
  wisp: [0xbff8ff, 0x3ad8ff],
};

interface Deps {
  scene: THREE.Scene;
  player: Player;
  controller: PlayerController;
  attacks: PlayerCombat;
  stats: PlayerStats;
  collision: WorldCollision;
  particles: Particles;
  rings: Rings;
  onHurt: () => void;
  onDown: () => void;
  onKill: (e: Enemy) => void;
  // a sword hit landed (for hit-stop, shake and sparks)
  onHit: (e: Enemy, r: { crit: boolean; broke: boolean; killed: boolean; heavy: boolean }) => void;
  // an enemy is about to attack
  onTell: (e: Enemy) => void;
}

// The sword, taking hits, thorns, and all enemies.
export class CombatSystem {
  readonly enemies: Enemy[] = [];
  invulnerable = 0;
  blight = 0; // how far the Blight has spread (enemies get tougher)
  private d: Deps;
  private projectiles: Projectiles;
  private ctx: EnemyCtx;

  constructor(deps: Deps) {
    this.d = deps;
    this.projectiles = new Projectiles(deps.scene);
    this.ctx = {
      player: deps.player.root.position,
      collision: deps.collision,
      hurtPlayer: (from, damage, knock, source) => this.hurtPlayer(from, damage, knock, source),
      shoot: (from, target, kind) => this.projectiles.shoot(from, target, kind),
      telegraph: (at, radius, time) => deps.rings.telegraph(at, radius, time),
      slam: (at, radius, knock) => {
        deps.rings.shock(at, radius * 1.3, 0xf1dea4);
        deps.particles.burst(at.clone().setY(at.y + 0.3), [0xc9a77a, 0xf1dea4, 0x9edd62], 30, 7, 0.22, 3);
        const p = deps.player.root.position;
        if (Math.hypot(p.x - at.x, p.z - at.z) < radius) this.hurtPlayer(at, 1, knock);
      },
      summon: (kind, at, tileKey) => {
        const y = deps.collision.groundAt(at.x, at.z);
        if (y === null) return;
        const e = createEnemy({ kind, x: at.x, z: at.z }, y, { key: tileKey, coord: { q: 0, r: 0 } }, this.blight);
        this.enemies.push(e);
        deps.scene.add(e.root);
        deps.particles.burst(at.clone().setY(y + 0.5), COLORS[e.kind], 12, 3, 0.14);
      },
    };
  }

  spawnFor(tile: HexTile, poof = true) {
    for (const s of tile.spawns) {
      const y = this.d.collision.groundAt(s.x, s.z) ?? tile.groundHeight;
      const e = createEnemy(s, y, tile, this.blight);
      this.enemies.push(e);
      this.d.scene.add(e.root);
      if (poof) this.d.particles.burst(new THREE.Vector3(s.x, y + 0.5, s.z), COLORS[e.kind], 12, 3, 0.14);
    }
  }

  clear() {
    for (const e of this.enemies) this.d.scene.remove(e.root);
    this.enemies.length = 0;
    this.projectiles.clear();
  }

  // take away the enemies of one tile (before the Blight respawns them as elites)
  removeOn(tileKey: string) {
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      if (this.enemies[i].tileKey !== tileKey) continue;
      this.d.scene.remove(this.enemies[i].root);
      this.enemies.splice(i, 1);
    }
  }

  aliveOn(tileKey: string) {
    return this.enemies.some((e) => e.alive && e.tileKey === tileKey);
  }

  private hurtPlayer(from: THREE.Vector3, damage: number, knock: number, source?: Enemy) {
    const { stats, controller } = this.d;
    if (this.invulnerable > 0 || controller.iframes || stats.hearts <= 0) return false;
    // Thorn Mail: whoever hits you gets hurt too
    if (source && stats.has('thornmail') && source.alive) this.damage(source, 1);
    stats.hearts = Math.max(0, stats.hearts - damage);
    this.invulnerable = PLAYER.invulnerable;
    this.d.player.hurt();
    const p = this.d.player.root.position;
    controller.knockback(new THREE.Vector3(p.x - from.x, 0, p.z - from.z), knock);
    this.d.particles.burst(p.clone().setY(p.y + 1.1), [0xff5a5a, 0xffffff], 12, 4, 0.12);
    this.d.onHurt();
    if (stats.hearts <= 0) this.d.onDown();
    return true;
  }

  private burned = new WeakMap<Enemy, number>();

  // any damage to an enemy, from any source; handles deaths (and splitting elites)
  private damage(e: Enemy, amount: number, poise = 1) {
    const r = e.hit(this.d.player.root.position, amount, poise);
    if (r.broke) this.d.rings.shock(e.root.position.clone(), 1.6 + e.radius, 0xffd070);
    if (!r.killed) return r;
    const at = e.root.position.clone().setY(e.root.position.y + 0.8);
    this.d.particles.burst(at, [...COLORS[e.kind], 0xffffff], 26, 6, 0.2, 4);
    if (e.elite === 'splitting') {
      for (const a of [0, Math.PI]) this.ctx.summon('slime', e.root.position.clone().add(new THREE.Vector3(Math.cos(a) * 1.4, 0, Math.sin(a) * 1.4)), e.tileKey);
    }
    this.d.onKill(e);
    return r;
  }

  update(dt: number) {
    const { player, particles, stats } = this.d;
    const pos = player.root.position;
    this.invulnerable = Math.max(0, this.invulnerable - dt);

    // Flame Trail: rolling through enemies burns them (once per enemy per roll)
    if (this.d.controller.rolling && stats.has('flametrail')) {
      const id = this.d.controller.rollId;
      for (const e of this.enemies) {
        if (!e.alive || this.burned.get(e) === id) continue;
        if (Math.hypot(e.root.position.x - pos.x, e.root.position.z - pos.z) < 1.2 + e.radius) {
          this.burned.set(e, id);
          this.damage(e, 1);
          particles.burst(e.root.position.clone().setY(e.root.position.y + 0.6), [0xff6a10, 0xffb040], 10, 3, 0.12);
        }
      }
    }

    // the sword only hits during an attack's active window, each enemy once per attack
    const a = this.d.attacks.attack;
    if (a && this.d.attacks.phase === 'active') {
      const fx = Math.sin(player.facing);
      const fz = Math.cos(player.facing);
      const half = THREE.MathUtils.degToRad(a.def.halfArc);
      for (const e of this.enemies) {
        if (!e.alive || a.hits.has(e)) continue;
        const dx = e.root.position.x - pos.x;
        const dz = e.root.position.z - pos.z;
        const dist = Math.hypot(dx, dz);
        if (dist > a.def.reach * stats.reachMul + e.radius * 0.6) continue;
        if (dist > 0.4 && Math.acos(Math.max(-1, Math.min(1, (dx * fx + dz * fz) / dist))) > half) continue;
        a.hits.add(e);
        const r = this.damage(e, stats.damage * a.def.damage * a.power, a.def.poise * a.power);
        this.d.onHit(e, { ...r, heavy: a.kind === 'heavy' || a.kind === 'light3' });
        const at = e.root.position.clone().setY(e.root.position.y + 0.8);
        // sparks fly away from the blade
        for (let k = 0; k < (r.crit ? 22 : 12); k++) {
          const dir = new THREE.Vector3(dx, 0, dz).normalize();
          particles.spawn({
            pos: at,
            vel: new THREE.Vector3(dir.x * 6 + (Math.random() - 0.5) * 5, 2 + Math.random() * 4, dir.z * 6 + (Math.random() - 0.5) * 5),
            color: r.crit ? 0xffd070 : k % 2 ? 0xffffff : 0xffe27a,
            size: 0.06 + Math.random() * 0.08,
            life: 0.25 + Math.random() * 0.25,
            gravity: 12,
          });
        }
      }
    }

    for (const e of this.enemies) {
      e.update(dt, this.ctx);
      if (e.told) {
        e.told = false;
        this.d.onTell(e);
      }
    }
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      if (this.enemies[i].removable) {
        this.d.scene.remove(this.enemies[i].root);
        this.enemies.splice(i, 1);
      }
    }
    this.projectiles.update(dt, pos.clone().setY(pos.y + 1), (dir) => {
      const from = pos.clone().sub(dir);
      return this.hurtPlayer(from, 1, 7) || !this.d.controller.iframes;
    });
  }
}

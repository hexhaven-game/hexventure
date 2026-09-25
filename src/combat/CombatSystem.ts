import * as THREE from 'three';
import { PLAYER } from '../game/config';
import type { Player } from '../player/Player';
import type { PlayerController } from '../player/PlayerController';
import type { PlayerStats } from '../player/PlayerStats';
import type { Particles } from '../rendering/Particles';
import type { WorldCollision } from '../world/Collision';
import type { HexTile } from '../world/HexTile';
import type { Enemy, EnemyCtx } from './enemies/Enemy';
import type { Rings } from '../rendering/Rings';
import { Projectiles } from './Projectiles';
import { createEnemy } from './spawns';

const SWORD_REACH = 2.4;
const SWORD_ARC = THREE.MathUtils.degToRad(80); // half angle in front of the player

const COLORS: Record<string, number[]> = {
  slime: [0x7b6cff, 0x9d8fff],
  husk: [0xe6dcc6, 0x5d6670],
  spitter: [0xc2405a, 0x4caf50],
  bat: [0x4a3a66, 0xffe066],
  boar: [0x7a4b2e, 0xc98a6a],
};

interface Deps {
  scene: THREE.Scene;
  player: Player;
  controller: PlayerController;
  stats: PlayerStats;
  collision: WorldCollision;
  particles: Particles;
  rings: Rings;
  onHurt: () => void;
  onDown: () => void;
  onKill: (e: Enemy) => void;
}

// The sword, taking hits, thorns, and all enemies.
export class CombatSystem {
  readonly enemies: Enemy[] = [];
  invulnerable = 0;
  private d: Deps;
  private projectiles: Projectiles;
  private ctx: EnemyCtx;

  constructor(deps: Deps) {
    this.d = deps;
    this.projectiles = new Projectiles(deps.scene);
    this.ctx = {
      player: deps.player.root.position,
      collision: deps.collision,
      hurtPlayer: (from, damage, knock) => this.hurtPlayer(from, damage, knock),
      shoot: (from, target) => this.projectiles.shoot(from, target),
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
        const e = createEnemy({ kind, x: at.x, z: at.z }, y, { key: tileKey, coord: { q: 0, r: 0 } });
        this.enemies.push(e);
        deps.scene.add(e.root);
        deps.particles.burst(at.clone().setY(y + 0.5), COLORS[e.kind], 12, 3, 0.14);
      },
    };
  }

  spawnFor(tile: HexTile, poof = true) {
    for (const s of tile.spawns) {
      const y = this.d.collision.groundAt(s.x, s.z) ?? tile.groundHeight;
      const e = createEnemy(s, y, tile);
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

  aliveOn(tileKey: string) {
    return this.enemies.some((e) => e.alive && e.tileKey === tileKey);
  }

  private hurtPlayer(from: THREE.Vector3, damage: number, knock: number) {
    const { stats, controller } = this.d;
    if (this.invulnerable > 0 || controller.iframes || stats.hearts <= 0) return false;
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

  update(dt: number) {
    const { player, particles, stats } = this.d;
    const pos = player.root.position;
    this.invulnerable = Math.max(0, this.invulnerable - dt);

    // sword hits land in the middle of the swing, once per enemy per swing
    const s = player.swing;
    if (s > 0.15 && s < 0.8) {
      const fx = Math.sin(player.facing);
      const fz = Math.cos(player.facing);
      for (const e of this.enemies) {
        if (!e.alive || e.lastHitSwing === player.swingId) continue;
        const dx = e.root.position.x - pos.x;
        const dz = e.root.position.z - pos.z;
        const dist = Math.hypot(dx, dz);
        if (dist > SWORD_REACH + e.radius * 0.5) continue;
        if (dist > 0.3 && Math.acos(Math.max(-1, Math.min(1, (dx * fx + dz * fz) / dist))) > SWORD_ARC) continue;
        e.lastHitSwing = player.swingId;
        const at = e.root.position.clone().setY(e.root.position.y + 0.8);
        const killed = e.hit(pos, stats.damage);
        particles.burst(at, [0xffffff, 0xffe27a], 10, 5, 0.1, 2);
        if (killed) {
          particles.burst(at, [...COLORS[e.kind], 0xffffff], 26, 6, 0.2, 4);
          this.d.onKill(e);
        }
      }
    }

    for (const e of this.enemies) e.update(dt, this.ctx);
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

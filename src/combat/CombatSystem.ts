import * as THREE from 'three';
import { PLAYER } from '../game/config';
import type { Player } from '../player/Player';
import type { PlayerController } from '../player/PlayerController';
import type { Particles } from '../rendering/Particles';
import type { WorldCollision } from '../world/Collision';
import { Enemy } from './Enemy';

const SWORD_REACH = 2.4;
const SWORD_ARC = THREE.MathUtils.degToRad(80); // half angle in front of the player

interface Deps {
  scene: THREE.Scene;
  player: Player;
  controller: PlayerController;
  collision: WorldCollision;
  particles: Particles;
  onHearts: (hearts: number) => void;
  onDown: () => void;
  onKill: (e: Enemy) => void;
}

// Hearts, the sword, and the enemies.
export class CombatSystem {
  readonly enemies: Enemy[] = [];
  hearts = PLAYER.maxHearts;
  invulnerable = 0;
  private d: Deps;

  constructor(deps: Deps) {
    this.d = deps;
  }

  spawnEnemy(pos: THREE.Vector3, tileKey: string, poof = true) {
    const e = new Enemy(pos, tileKey);
    this.enemies.push(e);
    this.d.scene.add(e.root);
    if (poof) this.d.particles.burst(pos.clone().setY(pos.y + 0.5), [0x9d8fff, 0xffffff], 12, 3, 0.14);
  }

  clear() {
    for (const e of this.enemies) this.d.scene.remove(e.root);
    this.enemies.length = 0;
  }

  attack() {
    this.d.player.startAttack();
  }

  resetHearts() {
    this.hearts = PLAYER.maxHearts;
    this.invulnerable = 0;
    this.d.onHearts(this.hearts);
  }

  update(dt: number) {
    const { player, particles } = this.d;
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
        if (dist > SWORD_REACH) continue;
        if (dist > 0.3 && Math.acos(Math.max(-1, Math.min(1, (dx * fx + dz * fz) / dist))) > SWORD_ARC) continue;
        e.lastHitSwing = player.swingId;
        const at = e.root.position.clone().setY(e.root.position.y + 0.6);
        const killed = e.hit(pos);
        particles.burst(at, [0xffffff, 0xffe27a], 10, 5, 0.1, 2);
        if (killed) {
          particles.burst(at, [0x7b6cff, 0x9d8fff, 0xffffff], 26, 6, 0.2, 4);
          this.d.onKill(e);
        }
      }
    }

    for (const e of this.enemies) {
      e.update(dt, pos, this.d.collision, (dir) => this.damagePlayer(dir));
    }
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      if (this.enemies[i].removable) {
        this.d.scene.remove(this.enemies[i].root);
        this.enemies.splice(i, 1);
      }
    }
  }

  private damagePlayer(dir: THREE.Vector3) {
    if (this.invulnerable > 0 || this.hearts <= 0) return;
    this.hearts--;
    this.invulnerable = PLAYER.invulnerable;
    this.d.player.hurt();
    this.d.controller.knockback(dir, 10);
    this.d.particles.burst(this.d.player.root.position.clone().setY(1.1), [0xff5a5a, 0xffffff], 12, 4, 0.12);
    this.d.onHearts(this.hearts);
    if (this.hearts <= 0) this.d.onDown();
  }
}

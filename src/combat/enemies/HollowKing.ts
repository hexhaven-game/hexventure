import * as THREE from 'three';
import { Warden } from './Warden';
import type { EnemyCtx } from './Enemy';

// The boss: a crowned, bigger Warden. Below half health it enrages: faster swings and leaps,
// and bats swarm in to help.
export class HollowKing extends Warden {
  readonly embers: number = 400;
  private enraged = false;

  constructor(pos: THREE.Vector3, tileKey: string, hp = 36) {
    super(pos, tileKey, hp, 'The Hollow King', 2.1);
    this.poiseMax = 14;
    const gold = new THREE.MeshStandardMaterial({ color: 0xf0c040, emissive: 0x6a4a00, emissiveIntensity: 0.4, roughness: 0.3 });
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.3, 0.22, 8, 1, true), gold);
    crown.position.y = 2.28;
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.25, 4), gold);
      spike.position.set(Math.cos(a) * 0.32, 2.48, Math.sin(a) * 0.32);
      this.body.add(spike);
    }
    this.body.add(crown);
    this.finish();
  }

  protected think(dt: number, ctx: EnemyCtx) {
    if (!this.enraged && this.hp <= this.maxHp / 2) {
      this.enraged = true;
      this.pace = 1.45;
      this.leapCooldown = 0.5;
      for (const a of [0, Math.PI]) {
        const at = this.root.position.clone().add(new THREE.Vector3(Math.cos(a) * 3, 0, Math.sin(a) * 3));
        ctx.summon('bat', at, this.tileKey);
      }
    }
    super.think(dt, ctx);
  }
}

import * as THREE from 'three';
import { Husk } from './Husk';
import type { EnemyCtx } from './Enemy';

// Miniboss: a giant husk. Big sword swings, and a leap that crashes down where you stood
// (a ring on the ground shows where). Stay mobile, punish the long recoveries.
export class Warden extends Husk {
  readonly radius: number = 1.1;
  readonly embers: number = 120;
  protected leapCooldown = 3;
  private leapFrom = new THREE.Vector3();
  private leapTo = new THREE.Vector3();

  constructor(pos: THREE.Vector3, tileKey: string, hp = 16, name = 'Grove Warden', size = 1.7) {
    super(pos, tileKey, hp);
    this.poiseMax = 9;
    this.bossName = name;
    this.body.scale.setScalar(size);
    this.reach = 2.7 * size * 0.9;
    this.weight = 6;
  }

  protected think(dt: number, ctx: EnemyCtx) {
    const { dir, dist } = this.toPlayer(ctx);
    this.leapCooldown -= dt;
    if (this.state === 'chase' && this.leapCooldown <= 0 && dist > 4 && dist < 12) {
      this.leapFrom.copy(this.root.position);
      this.leapTo.set(ctx.player.x, this.root.position.y, ctx.player.z);
      ctx.telegraph(this.leapTo, 3.4, 0.9);
      this.setState('crouch');
    }
    switch (this.state) {
      case 'crouch':
        this.face(dir, 6, dt);
        this.body.position.y = -0.3 * Math.min(1, this.stateT / 0.5);
        if (this.stateT > 0.5 / this.pace) this.setState('leap');
        return;
      case 'leap': {
        const k = Math.min(1, this.stateT / 0.45);
        const x = this.leapFrom.x + (this.leapTo.x - this.leapFrom.x) * k;
        const z = this.leapFrom.z + (this.leapTo.z - this.leapFrom.z) * k;
        this.move.set(x - this.root.position.x, 0, z - this.root.position.z);
        this.speed = this.move.length() / Math.max(dt, 1e-3);
        if (this.speed > 0) this.move.normalize();
        this.body.position.y = Math.sin(k * Math.PI) * 4;
        if (k >= 1) {
          this.body.position.y = 0;
          ctx.slam(this.root.position, 3.4, 16);
          this.leapCooldown = 4.5 / this.pace;
          this.setState('recover');
        }
        return;
      }
    }
    this.body.position.y = 0;
    this.huskThink(dt, ctx);
  }
}

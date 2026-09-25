import * as THREE from 'three';
import { TAU } from '../../utils/math';
import { Enemy, type EnemyCtx } from './Enemy';

// Miniboss: a huge slime. Hops after you, then jumps high and lands on a marked spot. Every few
// hits it sheds a small slime.
export class SlimeKing extends Enemy {
  readonly radius = 1.6;
  readonly embers = 110;
  private blob: THREE.Mesh;
  private hop = Math.random() * TAU;
  private jumpFrom = new THREE.Vector3();
  private jumpTo = new THREE.Vector3();
  private cooldown = 2.5;
  private shedAt: number;

  constructor(pos: THREE.Vector3, tileKey: string, hp = 14) {
    super('slime', pos, tileKey, hp);
    this.poiseMax = 9;
    this.bossName = 'Slime King';
    this.poiseArmor = true;
    this.weight = 6;
    this.shedAt = hp - 4;
    this.blob = new THREE.Mesh(new THREE.SphereGeometry(1.7, 24, 18), this.mat(0x5fd07a, 0.2));
    const white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });
    const black = new THREE.MeshStandardMaterial({ color: 0x1d1b26, roughness: 0.4 });
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 10), white);
      eye.position.set(side * 0.55, 0.45, 1.4);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 6), black);
      pupil.position.z = 0.26;
      eye.add(pupil);
      this.blob.add(eye);
    }
    const gold = new THREE.MeshStandardMaterial({ color: 0xf0c040, roughness: 0.3 });
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.55, 0.4, 8, 1, true), gold);
    crown.position.y = 1.7;
    this.blob.add(crown);
    this.body.add(this.blob);
    this.finish();
  }

  protected think(dt: number, ctx: EnemyCtx) {
    const { dir, dist } = this.toPlayer(ctx);
    this.cooldown -= dt;
    if (this.hp <= this.shedAt) {
      this.shedAt -= 4;
      ctx.summon('slime', this.root.position.clone().addScaledVector(dir, -2.2), this.tileKey);
    }
    let lift = 0;
    switch (this.state) {
      case 'idle':
        if (dist < 11) this.setState('chase');
        break;
      case 'chase':
        this.move.copy(dir);
        this.speed = 2.6;
        if (this.cooldown <= 0 && dist < 11) {
          this.jumpFrom.copy(this.root.position);
          this.jumpTo.set(ctx.player.x, this.root.position.y, ctx.player.z);
          ctx.telegraph(this.jumpTo, 3.2, 1.0);
          this.setState('squash');
        } else if (dist < 2.4) {
          this.setState('squash');
          this.jumpFrom.copy(this.root.position);
          this.jumpTo.copy(this.root.position);
          ctx.telegraph(this.jumpTo, 3.2, 0.7);
        }
        break;
      case 'squash':
        if (this.stateT > 0.55) this.setState('jump');
        break;
      case 'jump': {
        const k = Math.min(1, this.stateT / 0.5);
        const x = this.jumpFrom.x + (this.jumpTo.x - this.jumpFrom.x) * k;
        const z = this.jumpFrom.z + (this.jumpTo.z - this.jumpFrom.z) * k;
        this.move.set(x - this.root.position.x, 0, z - this.root.position.z);
        this.speed = this.move.length() / Math.max(dt, 1e-3);
        if (this.speed > 0) this.move.normalize();
        lift = Math.sin(k * Math.PI) * 5;
        if (k >= 1) {
          ctx.slam(this.root.position, 3.2, 14);
          this.cooldown = 3.5;
          this.setState('recover');
        }
        break;
      }
      case 'recover':
        if (this.stateT > 1.2) this.setState('chase');
        break;
    }
    if (this.state !== 'jump' && this.move.lengthSq() > 0) this.move.normalize();
    this.face(dir, 4, dt);
    const moving = this.speed > 0 && this.state === 'chase' ? 1 : 0;
    this.hop += dt * (moving ? 6 : 2);
    const bounce = Math.abs(Math.sin(this.hop));
    let sy = 1 - (1 - bounce) * 0.12 * (moving ? 1 : 0.4);
    if (this.state === 'squash') sy = 0.65;
    if (this.state === 'recover' && this.stateT < 0.3) sy = 0.75;
    this.blob.scale.set(1 / Math.sqrt(sy), sy, 1 / Math.sqrt(sy));
    this.blob.position.y = 1.3 * sy + (moving ? bounce * 0.5 : 0) + lift;
  }
}

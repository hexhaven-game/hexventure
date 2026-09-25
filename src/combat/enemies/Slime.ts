import * as THREE from 'three';
import { TAU } from '../../utils/math';
import { Enemy, type EnemyCtx } from './Enemy';

// Hops around its home, chases, winds up and lunges. The basic enemy.
export class Slime extends Enemy {
  readonly radius = 0.6;
  readonly embers = 10;
  private hop = Math.random() * TAU;
  private wander = new THREE.Vector3();
  private wanderT = 0;
  private lunge = new THREE.Vector3();
  private struck = false;
  private blob: THREE.Mesh;

  constructor(pos: THREE.Vector3, tileKey: string, hp = 2) {
    super('slime', pos, tileKey, hp);
    this.blob = new THREE.Mesh(new THREE.SphereGeometry(0.7, 20, 14), this.mat(0x7b6cff, 0.25));
    const white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });
    const black = new THREE.MeshStandardMaterial({ color: 0x1d1b26, roughness: 0.4 });
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), white);
      eye.position.set(side * 0.24, 0.18, 0.58);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), black);
      pupil.position.z = 0.12;
      eye.add(pupil);
      this.blob.add(eye);
    }
    this.body.add(this.blob);
    this.finish();
  }

  protected think(dt: number, ctx: EnemyCtx) {
    const { dir, dist } = this.toPlayer(ctx);
    switch (this.state) {
      case 'idle':
        this.wanderT -= dt;
        if (this.wanderT <= 0) {
          const a = Math.random() * TAU;
          this.wander.set(this.home.x + Math.cos(a) * 2.5, 0, this.home.z + Math.sin(a) * 2.5);
          this.wanderT = 2 + Math.random() * 2;
        }
        this.move.set(this.wander.x - this.root.position.x, 0, this.wander.z - this.root.position.z);
        this.speed = this.move.length() > 0.3 ? 1.2 : 0;
        if (dist < 9) this.setState('chase');
        break;
      case 'chase':
        this.move.copy(dir);
        this.speed = 3.3;
        if (dist < 1.8) this.setState('windup');
        else if (dist > 15 || this.root.position.distanceTo(this.home) > 17) this.setState('idle');
        break;
      case 'windup':
        if (this.stateT > 0.5) {
          this.lunge.copy(dir);
          this.struck = false;
          this.setState('lunge');
        }
        break;
      case 'lunge':
        this.move.copy(this.lunge);
        this.speed = 9;
        if (!this.struck && dist < 1.25) {
          this.struck = true;
          ctx.hurtPlayer(this.root.position, 1, 9);
        }
        if (this.stateT > 0.2) this.setState('recover');
        break;
      case 'recover':
        if (this.stateT > 1.0) this.setState(dist < 9 ? 'chase' : 'idle');
        break;
    }
    if (this.move.lengthSq() > 0) this.move.normalize();
    if (this.state !== 'lunge') this.face(dir, dist < 9 ? 8 : 2, dt);

    const moving = this.speed > 0 ? 1 : 0;
    this.hop += dt * (moving ? 9 : 3);
    const bounce = Math.abs(Math.sin(this.hop));
    let sy = 1 - (1 - bounce) * 0.18 * (moving ? 1 : 0.4);
    if (this.state === 'windup') sy = 0.7 - Math.sin(this.stateT * 30) * 0.04;
    this.blob.scale.set(1 / Math.sqrt(sy), sy, 1 / Math.sqrt(sy));
    this.blob.position.y = 0.52 * sy + (moving ? bounce * 0.35 : 0);
  }
}

import * as THREE from 'three';
import { Enemy, type EnemyCtx } from './Enemy';

// Hill enemy: a heavy little rock golem. Throws stones from a distance and slams the ground
// (red ring) when you get close. Slow, tough, not staggered.
export class Rockling extends Enemy {
  readonly radius = 0.8;
  readonly embers = 28;
  private cooldown = 1.5;
  private armL = new THREE.Mesh();
  private armR = new THREE.Mesh();

  constructor(pos: THREE.Vector3, tileKey: string, hp = 6) {
    super('rockling', pos, tileKey, hp);
    this.poise = true;
    this.weight = 4;
    const stone = this.mat(0x8f8a80, 0.95);
    const dark = this.mat(0x6d6860, 0.95);
    const body = new THREE.Mesh(new THREE.DodecahedronGeometry(0.9, 0), stone);
    body.scale.set(1, 0.85, 0.9);
    body.position.y = 0.95;
    const head = new THREE.Mesh(new THREE.DodecahedronGeometry(0.45, 0), dark);
    head.position.set(0, 1.85, 0.1);
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x9dffea, emissive: 0x4affd0, emissiveIntensity: 1.3 });
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 4), eyeMat);
      eye.position.set(s * 0.16, 1.9, 0.48);
      this.body.add(eye);
    }
    this.armL = new THREE.Mesh(new THREE.DodecahedronGeometry(0.38, 0), dark);
    this.armR = this.armL.clone();
    this.armL.position.set(-0.95, 0.9, 0.2);
    this.armR.position.set(0.95, 0.9, 0.2);
    this.body.add(body, head, this.armL, this.armR);
    this.finish();
  }

  protected think(dt: number, ctx: EnemyCtx) {
    const { dir, dist } = this.toPlayer(ctx);
    this.cooldown -= dt;
    switch (this.state) {
      case 'idle':
        if (dist < 12) this.setState('chase');
        break;
      case 'chase':
        this.face(dir, 4, dt);
        this.move.copy(dir);
        this.speed = dist > 2.6 ? 1.5 : 0;
        if (dist < 2.8 && this.cooldown <= 0) {
          ctx.telegraph(this.root.position, 2.8, 0.7);
          this.setState('slam');
        } else if (dist > 5 && dist < 13 && this.cooldown <= 0) this.setState('throw');
        if (dist > 17) this.setState('idle');
        break;
      case 'slam':
        this.armL.position.y = this.armR.position.y = 0.9 + Math.min(1, this.stateT / 0.5) * 1.2;
        if (this.stateT > 0.7) {
          this.armL.position.y = this.armR.position.y = 0.3;
          ctx.slam(this.root.position, 2.8, 14);
          this.cooldown = 2.2;
          this.setState('recover');
        }
        break;
      case 'throw':
        this.face(dir, 8, dt);
        this.armR.position.y = 0.9 + Math.min(1, this.stateT / 0.5) * 1.1;
        if (this.stateT > 0.6) {
          const from = this.root.position.clone().add(new THREE.Vector3(0, 2.2, 0)).addScaledVector(this.forward, 0.8);
          ctx.shoot(from, ctx.player.clone().setY(ctx.player.y + 1), 'rock');
          this.cooldown = 2.6;
          this.setState('recover');
        }
        break;
      case 'recover':
        this.armL.position.y += (0.9 - this.armL.position.y) * Math.min(1, dt * 6);
        this.armR.position.y += (0.9 - this.armR.position.y) * Math.min(1, dt * 6);
        if (this.stateT > 1.0) this.setState('chase');
        break;
    }
    if (this.move.lengthSq() > 0) this.move.normalize();
    this.body.rotation.z = this.speed > 0 ? Math.sin(this.stateT * 6) * 0.06 : 0;
  }
}

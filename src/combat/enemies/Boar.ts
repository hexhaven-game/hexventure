import * as THREE from 'three';
import { TAU } from '../../utils/math';
import { Enemy, type EnemyCtx } from './Enemy';

// Grazes, then scrapes the ground and charges in a straight line. If it runs into a tree or a
// cliff it is stunned for a moment: that's your opening.
export class Boar extends Enemy {
  readonly radius = 0.8;
  readonly embers = 30;
  private charge = new THREE.Vector3();
  private struck = false;
  private last = new THREE.Vector3();
  private step = Math.random() * TAU;
  private wanderT = 0;
  private wander = new THREE.Vector3();
  private head: THREE.Group;
  private legs: THREE.Mesh[] = [];

  constructor(pos: THREE.Vector3, tileKey: string, hp = 5) {
    super('boar', pos, tileKey, hp);
    this.weight = 2.5;
    const fur = this.mat(0x7a4b2e, 0.8);
    const dark = this.mat(0x4f301c, 0.8);
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.5, 0.9, 4, 10).rotateX(Math.PI / 2), fur);
    torso.position.y = 0.85;
    const mane = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.3, 1.0), dark);
    mane.position.set(0, 1.35, 0.1);
    this.head = new THREE.Group();
    this.head.position.set(0, 0.85, 0.85);
    const skull = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.55, 0.6), fur);
    const snout = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.25, 8).rotateX(Math.PI / 2), this.mat(0xc98a6a));
    snout.position.z = 0.4;
    const tuskMat = this.mat(0xfff6e0, 0.4);
    for (const s of [-1, 1]) {
      const tusk = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.3, 5), tuskMat);
      tusk.position.set(s * 0.2, -0.05, 0.45);
      tusk.rotation.x = -0.8;
      this.head.add(tusk);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), new THREE.MeshStandardMaterial({ color: 0x111111 }));
      eye.position.set(s * 0.2, 0.12, 0.3);
      this.head.add(eye);
    }
    this.head.add(skull, snout);
    for (const [x, z] of [[-0.3, 0.45], [0.3, 0.45], [-0.3, -0.45], [0.3, -0.45]]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.08, 0.5, 6).translate(0, -0.25, 0), dark);
      leg.position.set(x, 0.5, z);
      this.legs.push(leg);
      this.body.add(leg);
    }
    this.body.add(torso, mane, this.head);
    this.finish();
  }

  protected think(dt: number, ctx: EnemyCtx) {
    const { dir, dist } = this.toPlayer(ctx);
    let legSpeed = 0;
    switch (this.state) {
      case 'idle':
        this.wanderT -= dt;
        if (this.wanderT <= 0) {
          const a = Math.random() * TAU;
          this.wander.set(this.home.x + Math.cos(a) * 3, 0, this.home.z + Math.sin(a) * 3);
          this.wanderT = 3 + Math.random() * 3;
        }
        this.move.set(this.wander.x - this.root.position.x, 0, this.wander.z - this.root.position.z);
        if (this.move.length() > 0.4) {
          this.move.normalize();
          this.speed = 1.2;
          this.face(this.move, 3, dt);
          legSpeed = 6;
        }
        this.head.rotation.x = 0.4 + Math.sin(this.stateT * 2) * 0.1; // grazing
        if (dist < 9) this.setState('chase');
        break;
      case 'chase':
        this.face(dir, 5, dt);
        this.head.rotation.x = 0;
        if (this.stateT > 0.3) this.setState('scrape');
        if (dist > 15) this.setState('idle');
        break;
      case 'scrape':
        this.face(dir, 4, dt);
        this.legs[0].rotation.x = Math.sin(this.stateT * 22) * 0.7;
        this.head.rotation.x = -0.25;
        if (this.stateT > 0.85) {
          this.charge.copy(this.forward);
          this.struck = false;
          this.last.copy(this.root.position);
          this.setState('charge');
        }
        break;
      case 'charge': {
        this.poiseArmor = true;
        this.move.copy(this.charge);
        this.speed = 13;
        legSpeed = 22;
        if (!this.struck && dist < 1.4) {
          this.struck = true;
          ctx.hurtPlayer(this.root.position, 1, 16, this);
        }
        const moved = this.root.position.distanceTo(this.last);
        this.last.copy(this.root.position);
        if (this.stateT > 0.1 && moved < 13 * dt * 0.3) {
          this.poiseArmor = false;
          this.setState('stunned'); // ran into something
        } else if (this.stateT > 1.1) {
          this.poiseArmor = false;
          this.setState('recover');
        }
        break;
      }
      case 'stunned':
        this.head.rotation.z = Math.sin(this.stateT * 10) * 0.25;
        if (this.stateT > 1.6) {
          this.head.rotation.z = 0;
          this.setState('chase');
        }
        break;
      case 'recover':
        if (this.stateT > 0.7) this.setState('chase');
        break;
    }
    if (this.move.lengthSq() > 0 && this.state !== 'idle') this.move.normalize();
    this.step += dt * legSpeed;
    if (legSpeed > 0) {
      this.legs.forEach((l, i) => (l.rotation.x = Math.sin(this.step + (i % 2 ? Math.PI : 0)) * 0.6));
    }
  }
}

import * as THREE from 'three';
import { Enemy, type EnemyCtx } from './Enemy';

// A slow, armoured knight. Raises its sword for a long moment, then brings it down in an arc.
// Has poise: hitting it doesn't stop the swing, so roll away and punish the recovery.
export class Husk extends Enemy {
  readonly radius: number = 0.6;
  readonly embers: number = 25;
  protected arm = new THREE.Group();
  protected struck = false;
  protected step = 0;
  protected legL = new THREE.Group();
  protected legR = new THREE.Group();
  protected reach = 2.7;
  protected pace = 1; // >1 is faster: shorter wind-ups, quicker steps

  constructor(pos: THREE.Vector3, tileKey: string, hp = 4) {
    super('husk', pos, tileKey, hp);
    this.poiseArmor = true;
    this.weight = 2.2;
    const bone = this.mat(0xe6dcc6, 0.7);
    const iron = this.mat(0x5d6670, 0.45);
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.38, 0.55, 4, 10), iron);
    torso.position.y = 1.15;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), bone);
    head.position.y = 1.85;
    const helm = new THREE.Mesh(new THREE.ConeGeometry(0.36, 0.5, 8), iron);
    helm.position.y = 2.12;
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0xff5040, emissive: 0xff3020, emissiveIntensity: 1.5 });
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), eyeMat);
      eye.position.set(s * 0.1, 1.86, 0.27);
      this.body.add(eye);
    }
    for (const [leg, x] of [[this.legL, -0.18], [this.legR, 0.18]] as [THREE.Group, number][]) {
      leg.position.set(x, 0.7, 0);
      const l = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.45, 3, 8), bone);
      l.position.y = -0.35;
      leg.add(l);
      this.body.add(leg);
    }
    // sword arm: pivot at the shoulder
    this.arm.position.set(0.5, 1.45, 0);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 1.7), this.mat(0xb8c2cc, 0.3));
    blade.position.set(0, -0.2, 0.95);
    const hilt = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.1, 0.1), iron);
    hilt.position.set(0, -0.2, 0.12);
    this.arm.add(blade, hilt);
    this.body.add(torso, head, helm, this.arm);
    this.finish();
  }

  protected think(dt: number, ctx: EnemyCtx) {
    this.huskThink(dt, ctx);
  }

  protected huskThink(dt: number, ctx: EnemyCtx) {
    const { dir, dist } = this.toPlayer(ctx);
    switch (this.state) {
      case 'idle':
        if (dist < 10) this.setState('chase');
        break;
      case 'chase':
        this.move.copy(dir);
        this.speed = 2.3 * this.pace;
        this.face(dir, 6, dt);
        if (dist < this.reach - 0.2) this.setState('windup');
        else if (dist > 16) this.setState('idle');
        break;
      case 'windup':
        this.face(dir, 2.5, dt); // tracks you slowly: rolling to the side works
        this.arm.rotation.x = -2.3 * Math.min(1, this.stateT / (0.5 / this.pace));
        if (this.stateT > 0.75 / this.pace) {
          this.struck = false;
          this.setState('strike');
        }
        break;
      case 'strike': {
        this.arm.rotation.x = -2.3 + Math.min(1, this.stateT / 0.15) * 3.1;
        this.move.copy(this.forward);
        this.speed = this.stateT < 0.15 ? 4 : 0;
        if (!this.struck && this.stateT > 0.08) {
          this.struck = true;
          const f = this.forward;
          const inFront = dir.dot(f) > Math.cos(THREE.MathUtils.degToRad(70));
          if (dist < this.reach && inFront) ctx.hurtPlayer(this.root.position, 1, 13, this);
        }
        if (this.stateT > 0.3) this.setState('recover');
        break;
      }
      case 'recover':
        this.arm.rotation.x *= 0.9;
        if (this.stateT > 1.1 / this.pace) this.setState('chase');
        break;
    }
    const walking = this.speed > 0 && this.state === 'chase';
    this.step += dt * (walking ? 7 : 0);
    this.legL.rotation.x = Math.sin(this.step) * 0.5;
    this.legR.rotation.x = -Math.sin(this.step) * 0.5;
    this.body.position.y = walking ? Math.abs(Math.sin(this.step)) * 0.05 : 0;
    if (this.state === 'chase' || this.state === 'idle') this.arm.rotation.x = -0.4;
  }
}

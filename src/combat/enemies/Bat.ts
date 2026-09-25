import * as THREE from 'three';
import { TAU } from '../../utils/math';
import { Enemy, type EnemyCtx } from './Enemy';

// Flutters in circles around you, then dives. One hit kills it; timing is the trick.
export class Bat extends Enemy {
  readonly radius = 0.4;
  readonly embers = 8;
  private wingL = new THREE.Group();
  private wingR = new THREE.Group();
  private angle = Math.random() * TAU;
  private height = 1.8;
  private attackIn = 2 + Math.random();
  private dive = new THREE.Vector3();
  private struck = false;
  private flap = Math.random() * TAU;

  constructor(pos: THREE.Vector3, tileKey: string, hp = 1) {
    super('bat', pos, tileKey, hp);
    this.flying = true;
    this.weight = 0.8;
    const fur = this.mat(0x4a3a66, 0.6);
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), fur);
    const ears = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.2, 4), fur);
    ears.position.set(0.1, 0.28, 0);
    const ear2 = ears.clone();
    ear2.position.x = -0.1;
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0xffe066, emissive: 0xffc020, emissiveIntensity: 1.2 });
    for (const s of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 4), eyeMat);
      e.position.set(s * 0.1, 0.05, 0.25);
      body.add(e);
    }
    const wingGeo = new THREE.BoxGeometry(0.7, 0.04, 0.4).translate(0.35, 0, 0);
    const wing = this.mat(0x33284a, 0.7);
    this.wingR.add(new THREE.Mesh(wingGeo, wing));
    this.wingL.add(new THREE.Mesh(wingGeo, wing));
    this.wingL.rotation.y = Math.PI;
    this.body.add(body, ears, ear2, this.wingL, this.wingR);
    this.body.position.y = this.height;
    this.finish();
  }

  protected think(dt: number, ctx: EnemyCtx) {
    const { dir, dist } = this.toPlayer(ctx);
    let targetH = 1.8;
    const toward = (x: number, z: number, speed: number) => {
      this.move.set(x - this.root.position.x, 0, z - this.root.position.z);
      const d = this.move.length();
      if (d > 0.05) this.move.divideScalar(d);
      this.speed = Math.min(speed, d * 4);
    };
    switch (this.state) {
      case 'idle':
        this.angle += dt * 1.2;
        toward(this.home.x + Math.cos(this.angle) * 3, this.home.z + Math.sin(this.angle) * 3, 3);
        if (dist < 10) this.setState('chase');
        break;
      case 'chase':
        this.angle += dt * 1.8;
        toward(ctx.player.x + Math.cos(this.angle) * 4, ctx.player.z + Math.sin(this.angle) * 4, 6);
        this.attackIn -= dt;
        if (this.attackIn <= 0) {
          this.dive.copy(dir);
          this.struck = false;
          this.setState('dive');
        }
        if (dist > 16) this.setState('idle');
        break;
      case 'dive':
        targetH = 0.9;
        this.move.copy(this.dive);
        this.speed = 10;
        if (!this.struck && dist < 1.0) {
          this.struck = true;
          ctx.hurtPlayer(this.root.position, 1, 6, this);
        }
        if (this.stateT > 0.55) {
          this.attackIn = 1.8 + Math.random() * 1.4;
          this.setState('chase');
        }
        break;
      case 'stagger':
        break;
    }
    this.face(this.state === 'dive' ? this.dive : dir, 10, dt);
    this.height += (targetH - this.height) * Math.min(1, dt * 6);
    this.flap += dt * 22;
    this.wingR.rotation.z = Math.sin(this.flap) * 0.7;
    this.wingL.rotation.z = -Math.sin(this.flap) * 0.7;
    this.body.position.y = this.height + Math.sin(this.flap * 0.5) * 0.08;
    const g = ctx.collision.groundAt(this.root.position.x, this.root.position.z);
    this.root.position.y += ((g ?? 0) - this.root.position.y) * Math.min(1, dt * 5);
  }
}

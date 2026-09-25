import * as THREE from 'three';
import { Enemy, type EnemyCtx } from './Enemy';

// A rooted plant that turns towards you, swells up and spits a thorn. Roll through the thorn,
// or get close: it can't move.
export class Spitter extends Enemy {
  readonly radius = 0.7;
  readonly embers = 15;
  private bulb: THREE.Mesh;
  private bulbMat: THREE.MeshStandardMaterial;
  private cooldown = 1 + Math.random();

  constructor(pos: THREE.Vector3, tileKey: string, hp = 2) {
    super('spitter', pos, tileKey, hp);
    this.weight = 99;
    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 1.1, 7), this.mat(0x3f8f3a));
    stalk.position.y = 0.55;
    this.bulbMat = this.mat(0xc2405a, 0.35);
    this.bulb = new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 10), this.bulbMat);
    this.bulb.position.y = 1.3;
    const mouth = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.3, 8).rotateX(Math.PI / 2), this.mat(0x6e1f30));
    mouth.position.set(0, 1.3, 0.45);
    for (let i = 0; i < 4; i++) {
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), this.mat(0x4caf50, 0.6));
      const a = (i / 4) * Math.PI * 2;
      leaf.scale.set(1, 0.25, 0.55);
      leaf.position.set(Math.cos(a) * 0.4, 0.12, Math.sin(a) * 0.4);
      leaf.rotation.y = -a;
      this.body.add(leaf);
    }
    this.body.add(stalk, this.bulb, mouth);
    this.finish();
  }

  protected think(dt: number, ctx: EnemyCtx) {
    const { dir, dist } = this.toPlayer(ctx);
    this.cooldown -= dt;
    if (dist < 16) this.face(dir, 5, dt);
    if (this.state !== 'windup' && this.cooldown <= 0 && dist < 15) this.setState('windup');
    if (this.state === 'windup') {
      const k = Math.min(1, this.stateT / 0.6);
      this.bulb.scale.setScalar(1 + k * 0.35);
      this.bulbMat.color.setHex(0xc2405a).lerp(new THREE.Color(0xff9a5a), k);
      if (this.stateT > 0.6) {
        const from = this.root.position.clone().add(new THREE.Vector3(0, 1.3, 0)).addScaledVector(this.forward, 0.6);
        ctx.shoot(from, ctx.player.clone().setY(ctx.player.y + 1));
        this.cooldown = 2.2;
        this.setState('idle');
      }
    } else {
      this.bulb.scale.setScalar(1 + Math.sin(this.stateT * 3) * 0.04);
      this.bulbMat.color.setHex(0xc2405a);
    }
  }
}

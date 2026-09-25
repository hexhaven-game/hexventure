import * as THREE from 'three';
import { TAU } from '../../utils/math';
import { Enemy, type EnemyCtx } from './Enemy';

// Water enemy: a glowing marsh wisp that floats over the water, keeps its distance and fires
// slow orbs. Chase it to the shore; it dies in two hits.
export class Wisp extends Enemy {
  readonly radius = 0.45;
  readonly embers = 14;
  private core: THREE.Mesh;
  private angle = Math.random() * TAU;
  private cooldown = 1.5 + Math.random();

  constructor(pos: THREE.Vector3, tileKey: string, hp = 2) {
    super('wisp', pos, tileKey, hp);
    this.flying = true;
    this.weight = 0.8;
    this.core = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.35, 1),
      new THREE.MeshStandardMaterial({ color: 0xbff8ff, emissive: 0x3ad8ff, emissiveIntensity: 1.6, roughness: 0.2 }),
    );
    const halo = new THREE.Mesh(new THREE.SphereGeometry(0.6, 12, 8), this.mat(0x7fe9ff, 0.2));
    (halo.material as THREE.MeshStandardMaterial).transparent = true;
    (halo.material as THREE.MeshStandardMaterial).opacity = 0.35;
    this.body.add(this.core, halo);
    this.body.position.y = 1.9;
    this.finish();
  }

  protected think(dt: number, ctx: EnemyCtx) {
    const { dir, dist } = this.toPlayer(ctx);
    this.cooldown -= dt;
    this.angle += dt * 0.9;
    // hover around home, drift away from the player when they come close
    const tx = this.home.x + Math.cos(this.angle) * 3 - (dist < 5 ? dir.x * 3 : 0);
    const tz = this.home.z + Math.sin(this.angle) * 3 - (dist < 5 ? dir.z * 3 : 0);
    this.move.set(tx - this.root.position.x, 0, tz - this.root.position.z);
    const d = this.move.length();
    if (d > 0.05) this.move.divideScalar(d);
    this.speed = Math.min(3, d * 2);
    if (dist < 14 && this.cooldown <= 0) {
      ctx.shoot(this.root.position.clone().setY(this.root.position.y + 1.9), ctx.player.clone().setY(ctx.player.y + 1), 'orb');
      this.cooldown = 2.4 + Math.random();
    }
    this.face(dir, 4, dt);
    this.body.position.y = 1.9 + Math.sin(this.stateT * 2.5) * 0.25;
    this.core.rotation.y += dt * 2;
  }
}

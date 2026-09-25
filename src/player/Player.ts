import * as THREE from 'three';
import { clamp, easeOutCubic } from '../utils/math';

const SWING_TIME = 0.28;

// Placeholder hero: capsule body, round head, little limbs, all animated procedurally.
// The model faces +z; root.rotation.y turns it.
export class Player {
  readonly root = new THREE.Group();
  private body = new THREE.Group(); // bobs while walking
  private armL = new THREE.Group();
  private armR = new THREE.Group();
  private legL = new THREE.Group();
  private legR = new THREE.Group();
  private swordPivot = new THREE.Group();
  private swoosh: THREE.Mesh;
  private mats: THREE.MeshStandardMaterial[] = [];
  private phase = 0;
  private time = 0;
  private swingT = -1;
  private hurtT = 0;
  swingId = 0;

  constructor() {
    const m = (color: number, roughness = 0.6) => {
      const mm = new THREE.MeshStandardMaterial({ color, roughness });
      this.mats.push(mm);
      return mm;
    };
    const tunic = m(0x2f9e6e);
    const skin = m(0xf2c8a0);
    const hair = m(0x8a4e2b);
    const dark = m(0x2d2a33);
    const boot = m(0x6b4226);

    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.4, 4, 12), tunic);
    torso.position.y = 0.95;
    const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.335, 0.335, 0.1, 14), m(0x7a4a26));
    belt.position.y = 0.82;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.36, 16, 12), skin);
    head.position.y = 1.62;
    const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.38, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), hair);
    hairCap.position.set(0, 1.66, -0.03);
    hairCap.rotation.x = -0.25;
    const eyeGeo = new THREE.SphereGeometry(0.05, 8, 6);
    const eyeL = new THREE.Mesh(eyeGeo, dark);
    eyeL.position.set(-0.13, 1.62, 0.32);
    const eyeR = eyeL.clone();
    eyeR.position.x = 0.13;
    this.body.add(torso, belt, head, hairCap, eyeL, eyeR);

    const limb = (len: number, r: number, mat: THREE.Material) => {
      const l = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 3, 8), mat);
      l.position.y = -(len / 2 + r * 0.6);
      return l;
    };
    this.armL.position.set(-0.42, 1.22, 0);
    this.armR.position.set(0.42, 1.22, 0);
    this.armL.add(limb(0.32, 0.09, tunic));
    this.armR.add(limb(0.32, 0.09, tunic));
    for (const arm of [this.armL, this.armR]) {
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), skin);
      hand.position.y = -0.52;
      arm.add(hand);
    }
    this.legL.position.set(-0.16, 0.56, 0);
    this.legR.position.set(0.16, 0.56, 0);
    for (const leg of [this.legL, this.legR]) {
      leg.add(limb(0.24, 0.11, dark));
      const foot = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), boot);
      foot.scale.set(1, 0.7, 1.4);
      foot.position.set(0, -0.48, 0.05);
      leg.add(foot);
    }
    this.body.add(this.armL, this.armR, this.legL, this.legR);

    // sword: a pivot at chest height that sweeps across the front
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 1.2), m(0xe8eef2, 0.25));
    blade.position.z = 0.95;
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.08, 0.08), m(0xf0c040, 0.35));
    guard.position.z = 0.33;
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.26, 6).rotateX(Math.PI / 2), m(0x5a3a22));
    grip.position.z = 0.18;
    this.swordPivot.add(blade, guard, grip);
    this.swordPivot.position.y = 1.0;
    this.swordPivot.visible = false;
    this.swoosh = new THREE.Mesh(
      new THREE.RingGeometry(0.6, 1.75, 24, 1, -Math.PI * 0.4, Math.PI * 0.8).rotateX(-Math.PI / 2).rotateY(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }),
    );
    this.swoosh.position.y = 1.0;

    this.root.add(this.body, this.swordPivot, this.swoosh);
    this.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && o !== this.swoosh) o.castShadow = true;
    });
  }

  get attacking() {
    return this.swingT >= 0;
  }

  // 0..1 through the swing, or -1
  get swing() {
    return this.swingT < 0 ? -1 : this.swingT / SWING_TIME;
  }

  get facing() {
    return this.root.rotation.y;
  }

  startAttack() {
    if (this.attacking) return false;
    this.swingT = 0;
    this.swingId++;
    return true;
  }

  hurt() {
    this.hurtT = 1;
  }

  animate(dt: number, moving: number, invulnerable: boolean) {
    this.time += dt;
    this.phase += dt * 11 * moving;
    const s = Math.sin(this.phase);
    this.legL.rotation.x = s * 0.75 * moving;
    this.legR.rotation.x = -s * 0.75 * moving;
    this.armL.rotation.x = -s * 0.6 * moving;
    this.armR.rotation.x = s * 0.6 * moving;
    this.body.position.y = Math.abs(Math.cos(this.phase)) * 0.07 * moving;
    this.body.scale.y = 1 + Math.sin(this.time * 2.2) * 0.012 * (1 - moving);

    if (this.swingT >= 0) {
      this.swingT += dt;
      const k = clamp(this.swingT / SWING_TIME, 0, 1);
      const e = easeOutCubic(k);
      this.swordPivot.visible = true;
      this.swordPivot.rotation.y = 1.5 - e * 3.0; // right to left
      this.armR.rotation.x = -1.3;
      this.armR.rotation.z = 0.4 - e * 0.8;
      (this.swoosh.material as THREE.MeshBasicMaterial).opacity = Math.sin(k * Math.PI) * 0.45;
      this.swoosh.rotation.y = 0.9 - e * 1.8;
      if (k >= 1) {
        this.swingT = -1;
        this.swordPivot.visible = false;
        this.armR.rotation.z = 0;
        (this.swoosh.material as THREE.MeshBasicMaterial).opacity = 0;
      }
    }

    // hit: a red flash, then blinking while invulnerable
    this.hurtT = Math.max(0, this.hurtT - dt * 5);
    for (const mm of this.mats) mm.emissive.setRGB(this.hurtT * 0.9, 0, 0);
    this.body.visible = !invulnerable || Math.floor(this.time * 14) % 2 === 0;
  }
}

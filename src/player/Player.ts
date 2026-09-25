import * as THREE from 'three';
import { easeOutCubic } from '../utils/math';
import type { Arc, Phase } from './PlayerCombat';

// What the combat system tells the model to show this frame.
export interface Pose {
  moving: number; // 0..1 walking
  roll: number; // 0..1 through a roll, or -1
  drinking: boolean;
  hurt: number; // 0..1 hit-stun
  invulnerable: boolean;
  arc: Arc | null;
  phase: Phase | null;
  p: number; // 0..1 through the phase
  charge: number; // 0..1 charging a heavy attack, or -1
}

// sword yaw (turn around the body) at the start/end of each swing. The hero faces +z, so a
// negative yaw is their right-hand side and a positive yaw their left.
const SWEEP: Record<Arc, [number, number]> = {
  rl: [-1.9, 1.7], // from the right across to the left
  lr: [1.8, -1.8], // back from the left to the right
  wide: [-2.3, 2.6], // the finisher: a big sweep all the way round
  overhead: [-0.15, -0.15],
};
const IDLE = { yaw: -0.55, pitch: 0.55 }; // resting in the right hand, point forward and down

// Placeholder hero: capsule body, round head, little limbs, all animated procedurally. The sword is
// always in hand; swings sweep it clearly from one side to the other.
// The model faces +z; root.rotation.y turns it.
export class Player {
  readonly root = new THREE.Group();
  private body = new THREE.Group();
  private armL = new THREE.Group();
  private armR = new THREE.Group();
  private legL = new THREE.Group();
  private legR = new THREE.Group();
  private sword = new THREE.Group(); // pivot at the shoulder line; the blade points along +z
  private bladeMat: THREE.MeshStandardMaterial;
  private flask: THREE.Mesh;
  private mats: THREE.MeshStandardMaterial[] = [];
  private phase = 0;
  private time = 0;
  private hurtFlash = 0;
  private yaw = IDLE.yaw;
  private pitch = IDLE.pitch;

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
    // the hero's right is -x (it faces +z)
    this.armL.position.set(0.42, 1.22, 0);
    this.armR.position.set(-0.42, 1.22, 0);
    this.armL.add(limb(0.32, 0.09, tunic));
    this.armR.add(limb(0.32, 0.09, tunic));
    for (const arm of [this.armL, this.armR]) {
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), skin);
      hand.position.y = -0.52;
      arm.add(hand);
    }
    this.legL.position.set(0.16, 0.56, 0);
    this.legR.position.set(-0.16, 0.56, 0);
    for (const leg of [this.legL, this.legR]) {
      leg.add(limb(0.24, 0.11, dark));
      const foot = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), boot);
      foot.scale.set(1, 0.7, 1.4);
      foot.position.set(0, -0.48, 0.05);
      leg.add(foot);
    }
    this.body.add(this.armL, this.armR, this.legL, this.legR);

    // sword: grip at the pivot, the blade reaching out along +z
    this.bladeMat = new THREE.MeshStandardMaterial({ color: 0xe8eef2, roughness: 0.25, metalness: 0.1 });
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 1.25), this.bladeMat);
    blade.position.z = 1.0;
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.08, 0.08), m(0xf0c040, 0.35));
    guard.position.z = 0.36;
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.28, 6).rotateX(Math.PI / 2), m(0x5a3a22));
    grip.position.z = 0.2;
    this.sword.add(blade, guard, grip);
    this.sword.position.set(-0.28, 1.08, 0.08); // at the right shoulder
    this.body.add(this.sword);

    this.flask = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.12, 0.28, 8),
      new THREE.MeshStandardMaterial({ color: 0xffa24a, emissive: 0xff7a1a, emissiveIntensity: 0.6, roughness: 0.3 }),
    );
    this.flask.position.set(0, -0.62, 0.05);
    this.flask.visible = false;
    this.armL.add(this.flask);

    this.root.add(this.body);
    this.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = true;
    });
  }

  get facing() {
    return this.root.rotation.y;
  }

  // world positions of the blade's base and tip (for the sword trail)
  blade(base: THREE.Vector3, tip: THREE.Vector3) {
    this.sword.updateWorldMatrix(true, false);
    base.set(0, 0, 0.45).applyMatrix4(this.sword.matrixWorld);
    tip.set(0, 0, 1.62).applyMatrix4(this.sword.matrixWorld);
  }

  hurt() {
    this.hurtFlash = 1;
  }

  animate(dt: number, pose: Pose) {
    this.time += dt;
    const moving = pose.phase ? 0 : pose.moving;
    this.phase += dt * 11 * moving;
    const s = Math.sin(this.phase);
    this.legL.rotation.x = s * 0.75 * moving;
    this.legR.rotation.x = -s * 0.75 * moving;
    this.armL.rotation.set(-s * 0.6 * moving, 0, 0);
    this.body.position.y = Math.abs(Math.cos(this.phase)) * 0.07 * moving;
    this.body.rotation.set(0, 0, 0);
    this.body.scale.set(1, 1 + Math.sin(this.time * 2.2) * 0.012 * (1 - moving), 1);

    // ---- sword and right arm
    let yaw = IDLE.yaw + Math.sin(this.phase) * 0.1 * moving;
    let pitch = IDLE.pitch;
    let twist = 0;
    let lean = 0;
    let follow = 12; // how quickly the sword follows (fast during the hit itself)
    if (pose.charge >= 0) {
      // heavy attack held: sword raised high behind the head, trembling when full
      yaw = -0.2;
      pitch = -2.35 + (pose.charge >= 1 ? Math.sin(this.time * 60) * 0.03 : 0);
      lean = -0.12;
    } else if (pose.arc && pose.phase) {
      const [from, to] = SWEEP[pose.arc];
      const p = pose.p;
      if (pose.arc === 'overhead') {
        if (pose.phase === 'windup') pitch = -2.35;
        else if (pose.phase === 'active') {
          pitch = -2.35 + easeOutCubic(p) * 3.2;
          follow = 60;
        } else pitch = 0.85 + (IDLE.pitch - 0.85) * easeOutCubic(p);
        yaw = -0.15;
        lean = pose.phase === 'active' ? 0.25 : pose.phase === 'recover' ? 0.25 * (1 - p) : -0.1;
      } else {
        // wind up to one side, sweep fast across, follow through and settle
        if (pose.phase === 'windup') {
          yaw = from * easeOutCubic(p) + IDLE.yaw * (1 - easeOutCubic(p));
          pitch = 0.1;
        } else if (pose.phase === 'active') {
          yaw = from + (to - from) * easeOutCubic(p);
          pitch = 0.12;
          follow = 60;
        } else {
          const k = easeOutCubic(p);
          yaw = to + (IDLE.yaw - to) * k;
          pitch = 0.12 + (IDLE.pitch - 0.12) * k;
        }
        twist = -yaw * 0.28; // the body turns with the swing
        lean = pose.arc === 'wide' && pose.phase === 'active' ? 0.12 : 0;
      }
    }
    this.yaw += (yaw - this.yaw) * Math.min(1, dt * follow);
    this.pitch += (pitch - this.pitch) * Math.min(1, dt * follow);
    this.sword.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    this.body.rotation.y = twist;
    this.body.rotation.x = lean;
    // the right arm reaches along the sword
    this.armR.rotation.set(-1.1 + this.pitch * 0.55, 0, -0.1 - this.yaw * 0.2, 'YXZ');
    this.armR.rotation.y = this.yaw * 0.6;
    const glow = pose.charge >= 0 ? 0.25 + pose.charge * 0.6 : 0;
    this.bladeMat.emissive.setRGB(glow, glow * 0.8, glow * 0.4);

    // ---- roll: tuck in and tumble forward
    if (pose.roll >= 0) {
      this.body.rotation.x = pose.roll * Math.PI * 2;
      this.body.position.y = 0.25 + Math.sin(pose.roll * Math.PI) * 0.33;
      this.body.scale.setScalar(0.85);
    }
    // ---- flask in the left hand
    this.flask.visible = pose.drinking;
    if (pose.drinking) this.armL.rotation.set(-2.1, 0, -0.5);
    // ---- hit: thrown back a little
    if (pose.hurt > 0) this.body.rotation.x = -0.35 * pose.hurt;

    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 5);
    for (const mm of this.mats) mm.emissive.setRGB(this.hurtFlash * 0.9, 0, 0);
    this.body.visible = !pose.invulnerable || pose.hurt > 0 || Math.floor(this.time * 14) % 2 === 0;
  }
}

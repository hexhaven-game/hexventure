import * as THREE from 'three';
import { easeOutCubic } from '../utils/math';
import type { Arc, Phase } from './PlayerCombat';

// What the combat system tells the model to show this frame.
export interface Pose {
  moving: number; // 0..1 walking
  roll: number; // 0..1 through a step, or -1
  guard: boolean;
  drinking: boolean;
  hurt: number; // 0..1 hit-stun
  invulnerable: boolean;
  arc: Arc | null;
  phase: Phase | null;
  p: number; // 0..1 through the phase
  charge: number; // 0..1 charging a heavy attack, or -1
}

// Arm poses. The right arm swings from the shoulder and the sword continues the arm, so every
// swing moves as one piece. yaw: turn around the body (negative = the hero's right, positive =
// their left). pitch: 0 hangs down, -PI/2 points forward, -PI points up. bend: how far the blade
// tips forward from the arm.
interface ArmPose {
  yaw: number;
  pitch: number;
  bend: number;
}
const IDLE: ArmPose = { yaw: -0.3, pitch: -0.5, bend: -1.05 }; // at the side, point forward
const SWEEP: Record<Arc, [number, number]> = {
  rl: [-1.9, 1.6], // from the right across to the left
  lr: [1.7, -1.8], // back from the left to the right
  wide: [-2.3, 2.5], // the finisher: a big sweep all the way round
  overhead: [-0.1, -0.1],
};
const HIGH = -2.75; // sword raised up and back over the head (heavy attack)

// Placeholder hero: capsule body, round head, little limbs, all animated procedurally. The sword is
// always in hand; swings sweep it clearly from one side to the other.
// The model faces +z; root.rotation.y turns it.
export class Player {
  readonly root = new THREE.Group();
  private pivot = new THREE.Group(); // at the waist: rolls and leans turn around here
  private body = new THREE.Group();
  private armL = new THREE.Group();
  private armR = new THREE.Group();
  private legL = new THREE.Group();
  private legR = new THREE.Group();
  private sword = new THREE.Group(); // in the right hand; the blade continues the arm (-y)
  private bladeMat: THREE.MeshStandardMaterial;
  private flask: THREE.Mesh;
  private mats: THREE.MeshStandardMaterial[] = [];
  private phase = 0;
  private time = 0;
  private hurtFlash = 0;
  private deflectT = 0;
  private arm: ArmPose = { ...IDLE };

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

    // sword: held in the right hand, the blade continuing the arm (-y)
    this.bladeMat = new THREE.MeshStandardMaterial({ color: 0xe8eef2, roughness: 0.25, metalness: 0.1 });
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.25, 0.05), this.bladeMat);
    blade.position.y = -0.82;
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.08, 0.08), m(0xf0c040, 0.35));
    guard.position.y = -0.18;
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.26, 6), m(0x5a3a22));
    grip.position.y = 0.0;
    this.sword.add(blade, guard, grip);
    this.sword.position.set(0, -0.56, 0); // at the hand
    this.armR.add(this.sword);

    this.flask = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.12, 0.28, 8),
      new THREE.MeshStandardMaterial({ color: 0xffa24a, emissive: 0xff7a1a, emissiveIntensity: 0.6, roughness: 0.3 }),
    );
    this.flask.position.set(0, -0.62, 0.05);
    this.flask.visible = false;
    this.armL.add(this.flask);

    // the body hangs from a pivot at the waist, so rolls turn around the middle
    this.pivot.position.y = 0.8;
    this.body.position.y = -0.8;
    this.pivot.add(this.body);
    this.root.add(this.pivot);
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
    base.set(0, -0.35, 0).applyMatrix4(this.sword.matrixWorld);
    tip.set(0, -1.45, 0).applyMatrix4(this.sword.matrixWorld);
  }

  deflectFlash() {
    this.deflectT = 1;
  }

  hurt() {
    this.hurtFlash = 1;
  }

  animate(dt: number, pose: Pose) {
    this.time += dt;
    const moving = pose.phase || pose.charge >= 0 ? 0 : pose.moving;
    this.phase += dt * 11 * moving;
    const s = Math.sin(this.phase);
    this.legL.rotation.x = s * 0.75 * moving;
    this.legR.rotation.x = -s * 0.75 * moving;
    this.armL.rotation.set(-s * 0.6 * moving - 0.15, 0, 0);
    this.body.position.y = -0.8 + Math.abs(Math.cos(this.phase)) * 0.07 * moving;
    this.body.scale.set(1, 1 + Math.sin(this.time * 2.2) * 0.012 * (1 - moving), 1);

    // ---- the sword arm
    const want: ArmPose = { yaw: IDLE.yaw, pitch: IDLE.pitch - s * 0.15 * moving, bend: IDLE.bend };
    let follow = 14; // how quickly the arm follows its pose (very fast during a hit)
    let twist = 0;
    let lean = 0;
    let crouch = 0;
    if (pose.guard) {
      // guard: the sword held across the front, body turned a little behind it
      want.yaw = 1.05; // the arm across the chest, the blade level in front
      want.pitch = -1.55;
      want.bend = 0;
      twist = 0.3;
      crouch = 0.08;
      follow = 28;
    } else if (pose.charge >= 0) {
      // heavy attack held: raised high, body coiled back; trembling when fully charged
      want.yaw = -0.1;
      want.pitch = HIGH + (pose.charge >= 1 ? Math.sin(this.time * 55) * 0.04 : 0);
      want.bend = -0.25;
      lean = -0.12 - pose.charge * 0.06;
      crouch = pose.charge * 0.08;
      follow = 10;
    } else if (pose.arc && pose.phase) {
      const p = pose.p;
      const e = easeOutCubic(p);
      if (pose.arc === 'overhead') {
        want.yaw = -0.1;
        want.bend = -0.25;
        if (pose.phase === 'windup') want.pitch = HIGH;
        else if (pose.phase === 'active') {
          want.pitch = HIGH + e * 2.1; // down in front
          follow = 70;
          lean = 0.3 * e;
          crouch = 0.12 * e;
        } else {
          want.pitch = HIGH + 2.1 + (IDLE.pitch - HIGH - 2.1) * e;
          want.bend = -0.25 + (IDLE.bend + 0.25) * e;
          lean = 0.3 * (1 - e);
          crouch = 0.12 * (1 - e);
        }
      } else {
        // wind up to one side, sweep fast across at chest height, follow through, settle
        const [from, to] = SWEEP[pose.arc];
        want.bend = -0.2;
        if (pose.phase === 'windup') {
          want.yaw = IDLE.yaw + (from - IDLE.yaw) * e;
          want.pitch = IDLE.pitch + (-1.3 - IDLE.pitch) * e;
        } else if (pose.phase === 'active') {
          want.yaw = from + (to - from) * e;
          want.pitch = -1.4;
          follow = 70;
        } else {
          want.yaw = to + (IDLE.yaw - to) * e;
          want.pitch = -1.4 + (IDLE.pitch + 1.4) * e;
          want.bend = -0.2 + (IDLE.bend + 0.2) * e;
        }
        twist = want.yaw * 0.3; // the body turns with the swing
        lean = pose.phase === 'active' ? 0.1 : 0;
      }
    }
    const k = Math.min(1, dt * follow);
    this.arm.yaw += (want.yaw - this.arm.yaw) * k;
    this.arm.pitch += (want.pitch - this.arm.pitch) * k;
    this.arm.bend += (want.bend - this.arm.bend) * k;
    this.armR.rotation.set(this.arm.pitch, this.arm.yaw, 0, 'YXZ');
    this.sword.rotation.set(this.arm.bend, 0, 0);
    this.body.rotation.set(0, twist, 0);
    this.pivot.rotation.set(lean, 0, 0);
    this.pivot.position.y = 0.8 - crouch;
    this.deflectT = Math.max(0, this.deflectT - dt * 4);
    const glow = pose.charge >= 0 ? 0.2 + pose.charge * 0.7 : this.deflectT * 1.2;
    this.bladeMat.emissive.setRGB(glow, glow * 0.75, glow * 0.35);

    // ---- step: a low, quick dash; leaning into it, legs apart
    if (pose.roll >= 0) {
      const r = Math.sin(Math.min(1, pose.roll) * Math.PI);
      this.pivot.rotation.x = 0.35 * r;
      this.pivot.position.y = 0.8 - 0.14 * r;
      this.legL.rotation.x = 0.7 * r;
      this.legR.rotation.x = -0.9 * r;
      this.armL.rotation.x = 0.5 * r;
    }
    // ---- guard: the left hand comes up to brace the blade
    if (pose.guard) this.armL.rotation.set(-1.45, -0.7, 0, 'YXZ');
    // ---- flask in the left hand
    this.flask.visible = pose.drinking;
    if (pose.drinking) this.armL.rotation.set(-2.1, 0, -0.5);
    // ---- hit: thrown back a little
    if (pose.hurt > 0) this.pivot.rotation.x = -0.35 * pose.hurt;

    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 5);
    for (const mm of this.mats) mm.emissive.setRGB(this.hurtFlash * 0.9, 0, 0);
    this.body.visible = !pose.invulnerable || pose.hurt > 0 || Math.floor(this.time * 14) % 2 === 0;
  }
}


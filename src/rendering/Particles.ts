import * as THREE from 'three';
import { TAU } from '../utils/math';

interface Particle {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  color: THREE.Color;
  size: number;
  life: number;
  age: number;
  gravity: number;
}

// Small low-poly bits (dust, sparks, leaves) in one instanced draw call.
export class Particles {
  private mesh: THREE.InstancedMesh;
  private items: Particle[] = [];
  private dummy = new THREE.Object3D();
  private cap: number;

  constructor(scene: THREE.Scene, cap = 800) {
    this.cap = cap;
    this.mesh = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(1, 0),
      new THREE.MeshStandardMaterial({ roughness: 0.7 }),
      cap,
    );
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.setColorAt(0, new THREE.Color());
    scene.add(this.mesh);
  }

  spawn(p: { pos: THREE.Vector3; vel: THREE.Vector3; color: number; size: number; life: number; gravity?: number }) {
    if (this.items.length >= this.cap) this.items.shift();
    this.items.push({
      pos: p.pos.clone(),
      vel: p.vel.clone(),
      color: new THREE.Color(p.color),
      size: p.size,
      life: p.life,
      age: 0,
      gravity: p.gravity ?? 9,
    });
  }

  // a round burst going out and up
  burst(at: THREE.Vector3, colors: number[], count: number, speed = 4, size = 0.15, up = 3) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * TAU;
      const s = speed * (0.4 + Math.random() * 0.6);
      this.spawn({
        pos: at,
        vel: new THREE.Vector3(Math.cos(a) * s, up * (0.5 + Math.random()), Math.sin(a) * s),
        color: colors[i % colors.length],
        size: size * (0.6 + Math.random() * 0.8),
        life: 0.5 + Math.random() * 0.5,
      });
    }
  }

  clear() {
    this.items.length = 0;
  }

  update(dt: number) {
    let n = 0;
    this.items = this.items.filter((p) => {
      p.age += dt;
      if (p.age >= p.life) return false;
      p.vel.y -= p.gravity * dt;
      p.vel.multiplyScalar(Math.exp(-2 * dt));
      p.pos.addScaledVector(p.vel, dt);
      const k = 1 - p.age / p.life;
      this.dummy.position.copy(p.pos);
      this.dummy.rotation.set(p.age * 5, p.age * 3, 0);
      this.dummy.scale.setScalar(p.size * Math.sqrt(k));
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(n, this.dummy.matrix);
      this.mesh.setColorAt(n, p.color);
      n++;
      return true;
    });
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

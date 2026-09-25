import * as THREE from 'three';

interface Ring {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  t: number;
  dur: number;
  kind: 'warn' | 'shock';
  radius: number;
}

const GEO = new THREE.RingGeometry(0.86, 1, 48).rotateX(-Math.PI / 2);
const DISC = new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2);

// Rings on the ground: red warnings where a big attack will land, and white shockwaves
// (tiles landing, slams).
export class Rings {
  private items: Ring[] = [];
  private scene: THREE.Scene;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  private add(at: THREE.Vector3, radius: number, dur: number, kind: Ring['kind'], color: number, geo: THREE.BufferGeometry = GEO) {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(at.x, at.y + 0.08, at.z);
    mesh.scale.setScalar(radius);
    mesh.renderOrder = 3;
    this.scene.add(mesh);
    this.items.push({ mesh, mat, t: 0, dur, kind, radius });
  }

  telegraph(at: THREE.Vector3, radius: number, time: number) {
    this.add(at, radius, time, 'warn', 0xff4a3a);
    this.add(at, radius, time, 'warn', 0xff4a3a, DISC);
  }

  shock(at: THREE.Vector3, radius: number, color = 0xffffff) {
    this.add(at, radius, 0.55, 'shock', color);
  }

  clear() {
    for (const r of this.items) {
      this.scene.remove(r.mesh);
      r.mat.dispose();
    }
    this.items = [];
  }

  update(dt: number) {
    this.items = this.items.filter((r) => {
      r.t += dt;
      const k = Math.min(1, r.t / r.dur);
      if (r.kind === 'warn') {
        // the fill grows towards the edge: when it reaches it, the hit lands
        const isDisc = r.mesh.geometry === DISC;
        r.mat.opacity = isDisc ? 0.22 : 0.75;
        if (isDisc) r.mesh.scale.setScalar(r.radius * Math.max(0.01, k));
      } else {
        r.mesh.scale.setScalar(r.radius * (0.4 + k * 0.9));
        r.mat.opacity = 0.85 * (1 - k);
      }
      if (k >= 1) {
        this.scene.remove(r.mesh);
        r.mat.dispose();
        return false;
      }
      return true;
    });
  }
}

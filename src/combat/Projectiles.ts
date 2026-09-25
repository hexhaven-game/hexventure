import * as THREE from 'three';

interface Thorn {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
}

const KINDS = {
  thorn: {
    geo: new THREE.ConeGeometry(0.12, 0.6, 6).rotateX(Math.PI / 2),
    mat: new THREE.MeshStandardMaterial({ color: 0x3d2a1e, emissive: 0x8a2a10, emissiveIntensity: 0.6, roughness: 0.5 }),
    speed: 13,
  },
  rock: {
    geo: new THREE.DodecahedronGeometry(0.35, 0),
    mat: new THREE.MeshStandardMaterial({ color: 0x8f8a80, roughness: 0.95 }),
    speed: 11,
  },
  orb: {
    geo: new THREE.IcosahedronGeometry(0.25, 1),
    mat: new THREE.MeshStandardMaterial({ color: 0xbff8ff, emissive: 0x3ad8ff, emissiveIntensity: 1.5 }),
    speed: 7,
  },
};

// Thorns (Spitters), stones (Rocklings) and orbs (Wisps): fly straight, hurt on contact
// (unless you roll through them).
export class Projectiles {
  private items: Thorn[] = [];
  private scene: THREE.Scene;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  shoot(from: THREE.Vector3, target: THREE.Vector3, kind: keyof typeof KINDS = 'thorn') {
    const k = KINDS[kind];
    const mesh = new THREE.Mesh(k.geo, k.mat);
    mesh.position.copy(from);
    const vel = new THREE.Vector3().subVectors(target, from).normalize().multiplyScalar(k.speed);
    mesh.lookAt(target);
    mesh.castShadow = true;
    this.scene.add(mesh);
    this.items.push({ mesh, vel, life: 2.2 });
  }

  clear() {
    for (const t of this.items) this.scene.remove(t.mesh);
    this.items = [];
  }

  // `chest` is the player's centre; onHit gets the thorn's direction
  update(dt: number, chest: THREE.Vector3, onHit: (dir: THREE.Vector3) => boolean) {
    this.items = this.items.filter((t) => {
      t.life -= dt;
      t.mesh.position.addScaledVector(t.vel, dt);
      let gone = t.life <= 0;
      if (!gone && t.mesh.position.distanceTo(chest) < 0.75) gone = onHit(t.vel.clone().normalize());
      if (gone) this.scene.remove(t.mesh);
      return !gone;
    });
  }
}

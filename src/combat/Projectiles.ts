import * as THREE from 'three';

interface Thorn {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
}

const GEO = new THREE.ConeGeometry(0.12, 0.6, 6).rotateX(Math.PI / 2);
const MAT = new THREE.MeshStandardMaterial({ color: 0x3d2a1e, emissive: 0x8a2a10, emissiveIntensity: 0.6, roughness: 0.5 });
const SPEED = 13;

// Thorns spat by Spitters: fly straight, hurt on contact (unless you roll through them).
export class Projectiles {
  private items: Thorn[] = [];
  private scene: THREE.Scene;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  shoot(from: THREE.Vector3, target: THREE.Vector3) {
    const mesh = new THREE.Mesh(GEO, MAT);
    mesh.position.copy(from);
    const vel = new THREE.Vector3().subVectors(target, from).normalize().multiplyScalar(SPEED);
    mesh.lookAt(target);
    mesh.castShadow = true;
    this.scene.add(mesh);
    this.items.push({ mesh, vel, life: 1.8 });
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

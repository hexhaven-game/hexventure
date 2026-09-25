import * as THREE from 'three';

// Where you fell: your embers wait here. Walk into it to take them back.
export class EmberPile {
  readonly object = new THREE.Group();
  readonly embers: number;
  private orb: THREE.Mesh;
  private time = 0;

  constructor(at: THREE.Vector3, embers: number) {
    this.embers = embers;
    this.orb = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.35, 1),
      new THREE.MeshStandardMaterial({ color: 0xffb040, emissive: 0xff6a10, emissiveIntensity: 2, roughness: 0.3 }),
    );
    const glow = new THREE.Mesh(
      new THREE.CircleGeometry(1.2, 24).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xff8a2a, transparent: true, opacity: 0.35, depthWrite: false }),
    );
    glow.position.y = 0.06;
    this.object.add(this.orb, glow);
    this.object.position.copy(at);
  }

  update(dt: number) {
    this.time += dt;
    this.orb.position.y = 0.9 + Math.sin(this.time * 2.5) * 0.15;
    this.orb.rotation.y += dt * 1.5;
  }
}

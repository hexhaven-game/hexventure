import * as THREE from 'three';

// Soft sky light plus one warm sun whose shadow box follows what the camera looks at.
export class Lighting {
  readonly sun: THREE.DirectionalLight;
  private offset = new THREE.Vector3(-22, 48, 26);
  private extent = 0;

  constructor(scene: THREE.Scene) {
    scene.add(new THREE.HemisphereLight(0xe2f5ff, 0x6f9150, 1.35));
    this.sun = new THREE.DirectionalLight(0xfff1d6, 2.3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.04;
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 200;
    this.setExtent(38);
    scene.add(this.sun, this.sun.target);
  }

  // half size of the shadow box: small and sharp while playing, big in build mode
  setExtent(e: number) {
    if (e === this.extent) return;
    this.extent = e;
    const cam = this.sun.shadow.camera;
    cam.left = -e;
    cam.right = e;
    cam.top = e;
    cam.bottom = -e;
    cam.updateProjectionMatrix();
  }

  update(focus: THREE.Vector3) {
    this.sun.target.position.copy(focus);
    this.sun.position.copy(focus).add(this.offset);
  }
}

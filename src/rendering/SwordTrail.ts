import * as THREE from 'three';

const MAX = 24; // samples kept
const LIFE = 0.16; // seconds a sample lasts

interface Sample {
  base: THREE.Vector3;
  tip: THREE.Vector3;
  age: number;
}

// A ribbon along the path of the blade: it shows the arc of every swing (which side it came from
// and where it went), bright at the blade and fading behind it.
export class SwordTrail {
  private samples: Sample[] = [];
  private geo = new THREE.BufferGeometry();
  private pos = new Float32Array(MAX * 2 * 3);
  private alpha = new Float32Array(MAX * 2);
  private mat: THREE.ShaderMaterial;

  constructor(scene: THREE.Scene) {
    const index: number[] = [];
    for (let i = 0; i < MAX - 1; i++) {
      const a = i * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    this.geo.setIndex(index);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: { uColor: { value: new THREE.Color(0xffffff) } },
      vertexShader: /* glsl */ `
        attribute float aAlpha;
        varying float vA;
        void main() { vA = aAlpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        varying float vA;
        void main() { gl_FragColor = vec4(uColor, vA); }
      `,
    });
    const mesh = new THREE.Mesh(this.geo, this.mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 4;
    scene.add(mesh);
  }

  // `emit`: the blade is cutting; `heavy` makes the trail warmer
  update(dt: number, emit: boolean, base: THREE.Vector3, tip: THREE.Vector3, heavy = false) {
    for (const s of this.samples) s.age += dt;
    this.samples = this.samples.filter((s) => s.age < LIFE);
    if (emit) {
      this.samples.unshift({ base: base.clone(), tip: tip.clone(), age: 0 });
      if (this.samples.length > MAX) this.samples.length = MAX;
    }
    this.mat.uniforms.uColor.value.setHex(heavy ? 0xffd9a0 : 0xf2fbff);
    const n = this.samples.length;
    this.samples.forEach((s, i) => {
      s.base.toArray(this.pos, i * 6);
      s.tip.toArray(this.pos, i * 6 + 3);
      const fade = (1 - s.age / LIFE) * (1 - i / MAX);
      this.alpha[i * 2] = fade * 0.15; // near the hilt: faint
      this.alpha[i * 2 + 1] = fade * 0.75; // at the tip: bright
    });
    this.geo.setDrawRange(0, Math.max(0, n - 1) * 6);
    (this.geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.getAttribute('aAlpha') as THREE.BufferAttribute).needsUpdate = true;
  }
}

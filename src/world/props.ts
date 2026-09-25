import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TAU } from '../utils/math';
import type { Collider } from './HexTile';

// Low-poly placeholder props with soft, rounded shapes. Geometries and materials are shared.

export const COLORS = {
  grassA: 0x78cc55,
  grassB: 0x9edd62,
  forestFloor: 0x4f963c,
  hillTop: 0xb4d66a,
  sand: 0xf1dea4,
  wetSand: 0xc9b27a,
  dirt: 0x9a6a44,
  dirtDark: 0x6f4b31,
  lip: 0x5aa844,
  rock: 0xa3a9ae,
  rockDark: 0x80878f,
  trunk: 0x8a5a36,
  bush: 0x3f9a45,
  wood: 0xb07a48,
  woodDark: 0x7d5332,
};
const LEAVES = [0x5cbf4a, 0x49a843, 0x6fcf55, 0x3f9a3d];
const PETALS = [0xffffff, 0xffd54a, 0xff8fb1, 0xb58cff, 0xff7a59];

const mats = new Map<string, THREE.MeshStandardMaterial>();
export function mat(color: number, roughness = 0.82): THREE.MeshStandardMaterial {
  const k = `${color}|${roughness}`;
  let m = mats.get(k);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 });
    mats.set(k, m);
  }
  return m;
}

export interface Prop {
  object: THREE.Object3D;
  collider?: Collider | Collider[]; // local to the prop's position
  fade?: { height: number; radius: number };
}

function shadowed<T extends THREE.Object3D>(o: T): T {
  o.traverse((c) => {
    if ((c as THREE.Mesh).isMesh) {
      c.castShadow = true;
      c.receiveShadow = true;
    }
  });
  return o;
}

// ---------- trees ----------
const TRUNK_GEO = new THREE.CylinderGeometry(0.22, 0.34, 2.2, 7).translate(0, 1.1, 0);
const ico = (r: number, x: number, y: number, z: number) => new THREE.IcosahedronGeometry(r, 1).translate(x, y, z);
let canopyGeos: THREE.BufferGeometry[] | null = null;
function canopies() {
  if (!canopyGeos) {
    canopyGeos = [
      [ico(1.6, 0, 3.0, 0), ico(1.2, 0.5, 4.1, 0.3), ico(1.0, -0.6, 3.9, -0.4)],
      [ico(1.4, 0, 2.9, 0), ico(1.2, 0, 4.0, 0), ico(0.8, 0, 4.9, 0)],
      [ico(1.5, 0.6, 3.0, 0), ico(1.5, -0.7, 3.1, 0.2), ico(1.2, 0, 4.0, -0.2)],
    ].map((parts) => mergeGeometries(parts)!);
  }
  return canopyGeos;
}

export function tree(rng: () => number, scale = 1): Prop {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(TRUNK_GEO, mat(COLORS.trunk));
  const leaves = LEAVES[Math.floor(rng() * LEAVES.length)];
  const canopy = new THREE.Mesh(canopies()[Math.floor(rng() * 3)], mat(leaves, 0.7));
  g.add(trunk, canopy);
  g.rotation.y = rng() * TAU;
  g.scale.setScalar(scale);
  return {
    object: shadowed(g),
    collider: { kind: 'circle', x: 0, z: 0, r: 0.55 * scale },
    fade: { height: 3.6 * scale, radius: 1.9 * scale },
  };
}

// ---------- bushes ----------
const BUSH_GEO = mergeGeometries([
  new THREE.IcosahedronGeometry(0.75, 1).translate(0, 0.45, 0),
  new THREE.IcosahedronGeometry(0.55, 1).translate(0.55, 0.35, 0.2),
  new THREE.IcosahedronGeometry(0.5, 1).translate(-0.5, 0.3, -0.1),
])!;
export function bush(rng: () => number, scale = 1): Prop {
  const m = new THREE.Mesh(BUSH_GEO, mat(rng() < 0.5 ? COLORS.bush : 0x4aa84a, 0.75));
  m.rotation.y = rng() * TAU;
  m.scale.setScalar(scale);
  return { object: shadowed(m) };
}

// ---------- rocks ----------
const ROCK_GEO = new THREE.DodecahedronGeometry(1, 0);
export function rock(rng: () => number, size: number): Prop {
  const m = new THREE.Mesh(ROCK_GEO, mat(rng() < 0.5 ? COLORS.rock : COLORS.rockDark, 0.9));
  m.scale.set(size, size * (0.6 + rng() * 0.25), size * (0.8 + rng() * 0.2));
  m.rotation.set(rng() * 0.3, rng() * TAU, rng() * 0.3);
  m.position.y = size * 0.2;
  const big = size >= 0.9;
  return {
    object: shadowed(m),
    collider: big ? { kind: 'circle', x: 0, z: 0, r: size * 0.95 } : undefined,
  };
}

// ---------- flowers and grass (instanced per patch) ----------
const HEAD_GEO = new THREE.IcosahedronGeometry(0.13, 0);
const STEM_GEO = new THREE.CylinderGeometry(0.025, 0.025, 0.36, 3).translate(0, 0.18, 0);
const TUFT_GEO = new THREE.ConeGeometry(0.09, 0.55, 4).translate(0, 0.27, 0);
const HEAD_MAT = new THREE.MeshStandardMaterial({ roughness: 0.6 });
const TUFT_MAT = new THREE.MeshStandardMaterial({ roughness: 0.8 });

export function flowers(rng: () => number, points: { x: number; z: number }[]): THREE.Object3D {
  const g = new THREE.Group();
  const heads = new THREE.InstancedMesh(HEAD_GEO, HEAD_MAT, points.length);
  const stems = new THREE.InstancedMesh(STEM_GEO, mat(0x3f8f3a), points.length);
  const d = new THREE.Object3D();
  const c = new THREE.Color();
  points.forEach((p, i) => {
    d.position.set(p.x, 0, p.z);
    d.rotation.set(0, 0, 0);
    d.scale.setScalar(0.8 + rng() * 0.5);
    d.updateMatrix();
    stems.setMatrixAt(i, d.matrix);
    d.position.y = 0.36 * d.scale.y;
    d.updateMatrix();
    heads.setMatrixAt(i, d.matrix);
    heads.setColorAt(i, c.setHex(PETALS[Math.floor(rng() * PETALS.length)]));
  });
  heads.receiveShadow = true;
  stems.receiveShadow = true;
  g.add(stems, heads);
  return g;
}

export function grass(rng: () => number, points: { x: number; z: number }[]): THREE.Object3D {
  const n = points.length * 3;
  const m = new THREE.InstancedMesh(TUFT_GEO, TUFT_MAT, n);
  const d = new THREE.Object3D();
  const c = new THREE.Color();
  let i = 0;
  for (const p of points) {
    for (let k = 0; k < 3; k++) {
      d.position.set(p.x + (rng() - 0.5) * 0.3, 0, p.z + (rng() - 0.5) * 0.3);
      d.rotation.set((rng() - 0.5) * 0.6, rng() * TAU, (rng() - 0.5) * 0.6);
      d.scale.setScalar(0.7 + rng() * 0.6);
      d.updateMatrix();
      m.setMatrixAt(i, d.matrix);
      m.setColorAt(i, c.setHex(COLORS.grassA).offsetHSL(0, 0, (rng() - 0.6) * 0.12));
      i++;
    }
  }
  m.receiveShadow = true;
  return m;
}

// ---------- lily pads ----------
const PAD_GEO = new THREE.CylinderGeometry(0.7, 0.7, 0.05, 12, 1, false, 0.3, TAU - 0.6);
export function lilyPad(rng: () => number): Prop {
  const m = new THREE.Mesh(PAD_GEO, mat(0x58b84a, 0.6));
  m.rotation.y = rng() * TAU;
  m.scale.setScalar(0.7 + rng() * 0.6);
  m.receiveShadow = true;
  return { object: m };
}

// ---------- the home house (faces +z, towards the camera) ----------
export function house(): Prop {
  const g = new THREE.Group();
  const walls = new THREE.Mesh(new THREE.BoxGeometry(4.2, 2.8, 3.6), mat(0xf6ead2));
  walls.position.y = 1.4;
  const roof = new THREE.Mesh(new THREE.ConeGeometry(3.6, 2.2, 4), mat(0xd9534f, 0.7));
  roof.rotation.y = Math.PI / 4;
  roof.scale.set(1.2, 1, 1.02);
  roof.position.y = 3.9;
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.5, 0.12), mat(COLORS.woodDark));
  door.position.set(0.6, 0.75, 1.82);
  const win = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.7, 0.1), mat(0x7cc7e8, 0.3));
  win.position.set(-1.1, 1.6, 1.82);
  const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.4, 0.55), mat(0xb9a58e));
  chimney.position.set(-1.1, 4.3, -0.6);
  const step = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.2, 0.7), mat(COLORS.rock));
  step.position.set(0.6, 0.1, 2.1);
  g.add(walls, roof, door, win, chimney, step);
  return {
    object: shadowed(g),
    // four circles instead of a box, so the footprint still fits when the tile is rotated
    collider: [-1, 1].flatMap((sx) => [-1, 1].map((sz): Collider => ({ kind: 'circle', x: sx * 1.15, z: sz * 0.95, r: 1.3 }))),
    fade: { height: 5, radius: 3 },
  };
}

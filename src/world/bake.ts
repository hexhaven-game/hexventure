import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { occlusionPatch } from '../rendering/Occlusion';
import type { HexTile } from './HexTile';

// One shared material for all baked props: colours live in the vertices.
export const BAKED_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78 });
occlusionPatch(BAKED_MAT);

const inv = new THREE.Matrix4();
const rel = new THREE.Matrix4();
const col = new THREE.Color();

// every mesh under `root` as a non-indexed, vertex-coloured geometry in the space of `space`
function collect(root: THREE.Object3D, space: THREE.Matrix4, parts: THREE.BufferGeometry[]) {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
    rel.multiplyMatrices(space, m.matrixWorld);
    g.applyMatrix4(rel);
    col.copy((m.material as THREE.MeshStandardMaterial).color);
    const n = g.getAttribute('position').count;
    const c = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      c[i * 3] = col.r;
      c[i * 3 + 1] = col.g;
      c[i * 3 + 2] = col.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    parts.push(g);
  });
}

function merge(parts: THREE.BufferGeometry[]) {
  const merged = parts.length ? mergeGeometries(parts) : null;
  for (const p of parts) p.dispose();
  return merged;
}

// A multi-part model (like the bridge) as a single mesh.
export function mergeToMesh(root: THREE.Object3D): THREE.Mesh {
  root.updateMatrixWorld(true);
  const parts: THREE.BufferGeometry[] = [];
  collect(root, inv.copy(root.matrixWorld).invert(), parts);
  const mesh = new THREE.Mesh(merge(parts) ?? new THREE.BufferGeometry(), BAKED_MAT);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// After a tile has landed, merge its static props (trees, rocks, bushes, the house, lily pads)
// into one mesh. Instanced flowers/grass and animated things (the chest) stay as they are.
export function bakeDecor(tile: HexTile) {
  tile.group.updateMatrixWorld(true);
  inv.copy(tile.group.matrixWorld).invert();
  const parts: THREE.BufferGeometry[] = [];
  const baked = new Set<THREE.Object3D>();
  for (const d of tile.decor) {
    if (d.object.userData.keep) continue;
    let instanced = false;
    d.object.traverse((o) => {
      if ((o as THREE.InstancedMesh).isInstancedMesh) instanced = true;
    });
    if (instanced) continue;
    collect(d.object, inv, parts);
    baked.add(d.object);
  }
  const merged = merge(parts);
  if (!merged) return;
  const mesh = new THREE.Mesh(merged, BAKED_MAT);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  for (const o of baked) tile.group.remove(o);
  tile.decor = tile.decor.filter((d) => !baked.has(d.object));
  tile.group.add(mesh);
  tile.ownGeometries.push(merged);
}

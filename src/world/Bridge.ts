import * as THREE from 'three';
import { BRIDGE_Y, WATER_BED } from '../game/config';
import { INNER_RADIUS } from './HexGrid';
import { mergeToMesh } from './bake';
import { COLORS, mat } from './props';

export const BRIDGE_HALF_WIDTH = 1.3; // walkable half width of the deck

// A wooden bridge along local +x, spanning one hex from edge to edge.
// Rotate it by -directionAngle(dir) to point it at a neighbour. Built from parts, merged into one mesh.
export function createBridge(): THREE.Object3D {
  const g = new THREE.Group();
  const length = INNER_RADIUS * 2 + 0.6;
  const planks = 14;
  const plankLen = length / planks;
  for (let i = 0; i < planks; i++) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(plankLen - 0.08, 0.22, 3.0), mat(i % 2 ? COLORS.wood : 0xa66f40));
    p.position.set(-length / 2 + plankLen * (i + 0.5), BRIDGE_Y - 0.11, 0);
    g.add(p);
  }
  for (const side of [-1, 1]) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(length, 0.22, 0.22), mat(COLORS.woodDark));
    beam.position.set(0, BRIDGE_Y - 0.2, side * 1.45);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(length - 0.4, 0.14, 0.14), mat(COLORS.woodDark));
    rail.position.set(0, BRIDGE_Y + 0.95, side * 1.45);
    g.add(beam, rail);
    for (let i = 0; i <= 6; i++) {
      const x = -length / 2 + 0.3 + ((length - 0.6) * i) / 6;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.1, 1.1, 6), mat(COLORS.woodDark));
      post.position.set(x, BRIDGE_Y + 0.45, side * 1.45);
      g.add(post);
      if (i % 3 === 0) {
        const pile = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, BRIDGE_Y - WATER_BED + 0.2, 7), mat(COLORS.woodDark));
        pile.position.set(x, (BRIDGE_Y + WATER_BED) / 2 - 0.1, side * 1.45);
        g.add(pile);
      }
    }
  }
  return mergeToMesh(g);
}

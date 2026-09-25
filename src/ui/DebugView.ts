import * as THREE from 'three';
import type { HexTile } from '../world/HexTile';

// F3: draws every collider as a red outline on the ground.
export class DebugView {
  readonly group = new THREE.Group();
  private mat = new THREE.LineBasicMaterial({ color: 0xff3355 });

  constructor(scene: THREE.Scene) {
    this.group.visible = false;
    scene.add(this.group);
  }

  rebuild(tiles: Iterable<HexTile>) {
    for (const c of [...this.group.children]) {
      this.group.remove(c);
      (c as THREE.Line).geometry.dispose();
    }
    for (const t of tiles) {
      const y = t.groundHeight + 0.12;
      for (const c of t.colliders) {
        const pts: THREE.Vector3[] = [];
        if (c.kind === 'circle') {
          for (let i = 0; i < 20; i++) {
            const a = (i / 20) * Math.PI * 2;
            pts.push(new THREE.Vector3(c.x + Math.cos(a) * c.r, y, c.z + Math.sin(a) * c.r));
          }
        } else {
          pts.push(
            new THREE.Vector3(c.minX, y, c.minZ),
            new THREE.Vector3(c.maxX, y, c.minZ),
            new THREE.Vector3(c.maxX, y, c.maxZ),
            new THREE.Vector3(c.minX, y, c.maxZ),
          );
        }
        this.group.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), this.mat));
      }
    }
  }
}

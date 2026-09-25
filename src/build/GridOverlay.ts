import * as THREE from 'three';
import { HEX_RADIUS, WATER_LEVEL } from '../game/config';
import { hexCorners, hexKey, hexToWorld, type HexCoord } from '../world/HexGrid';
import type { HexTile } from '../world/HexTile';

const FILL_GEO = new THREE.CircleGeometry(HEX_RADIUS * 0.93, 6, Math.PI / 6).rotateX(-Math.PI / 2);

// The build-mode board: thin outlines on every tile and soft markers where you can build.
// Nothing of this exists in play mode.
export class GridOverlay {
  readonly group = new THREE.Group();
  private fills = new Map<string, THREE.Mesh>();
  private hovered: string | null = null;
  private lineMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 });
  private slotLineMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 });

  constructor(scene: THREE.Scene) {
    this.group.visible = false;
    this.group.renderOrder = 5;
    scene.add(this.group);
  }

  private outline(center: THREE.Vector3, y: number, mat: THREE.LineBasicMaterial, scale = 0.995) {
    const pts = hexCorners(HEX_RADIUS * scale).map((p) => new THREE.Vector3(p.x + center.x, y, p.z + center.z));
    const line = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), mat);
    this.group.add(line);
  }

  // targets: where the current build option may go (empty slots, or water tiles for a bridge)
  rebuild(tiles: Iterable<HexTile>, targets: { coord: HexCoord; y: number; color: number }[]) {
    for (const c of [...this.group.children]) {
      this.group.remove(c);
      const o = c as THREE.Mesh;
      if (o.geometry !== FILL_GEO) o.geometry.dispose();
      if (o.material !== this.lineMat && o.material !== this.slotLineMat) (o.material as THREE.Material).dispose();
    }
    this.fills.clear();
    for (const t of tiles) {
      const y = (t.type === 'water' ? WATER_LEVEL : t.groundHeight) + 0.08;
      this.outline(t.center, y, this.lineMat);
    }
    for (const target of targets) {
      const c = hexToWorld(target.coord);
      const fill = new THREE.Mesh(
        FILL_GEO,
        new THREE.MeshBasicMaterial({ color: target.color, transparent: true, opacity: 0.22, depthWrite: false }),
      );
      fill.position.set(c.x, target.y + 0.04, c.z);
      this.group.add(fill);
      this.fills.set(hexKey(target.coord), fill);
      this.outline(c, target.y + 0.06, this.slotLineMat, 0.93);
    }
    this.hovered = null;
  }

  setHover(key: string | null) {
    if (key === this.hovered) return;
    const set = (k: string | null, o: number) => {
      const f = k ? this.fills.get(k) : undefined;
      if (f) (f.material as THREE.MeshBasicMaterial).opacity = o;
    };
    set(this.hovered, 0.22);
    set(key, 0.5);
    this.hovered = key;
  }

  get visible() {
    return this.group.visible;
  }

  set visible(v: boolean) {
    this.group.visible = v;
  }
}

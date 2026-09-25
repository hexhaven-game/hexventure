import * as THREE from 'three';
import { createBridge } from '../world/Bridge';
import { directionAngle, hexToWorld, type HexCoord } from '../world/HexGrid';
import type { HexTile } from '../world/HexTile';

// What you are about to place, floating above the slot: the real tile (so you can see how it will
// lie and rotate it), or a see-through bridge.
export class TilePreview {
  readonly group = new THREE.Group();
  private bridge: THREE.Object3D;
  private tile: HexTile | null = null;
  private time = 0;

  constructor(scene: THREE.Scene) {
    this.group.visible = false;
    scene.add(this.group);
    this.bridge = createBridge();
    this.bridge.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.material = (m.material as THREE.MeshStandardMaterial).clone();
      Object.assign(m.material, { transparent: true, opacity: 0.6, depthWrite: false });
      m.castShadow = false;
    });
    this.bridge.visible = false;
    this.group.add(this.bridge);
  }

  showTile(tile: HexTile) {
    if (this.tile !== tile) {
      if (this.tile) this.group.remove(this.tile.group);
      this.tile = tile;
      this.group.add(tile.group);
    }
    tile.group.visible = true;
    this.bridge.visible = false;
    this.group.visible = true;
  }

  showBridge(coord: HexCoord, dir: number) {
    if (this.tile) this.tile.group.visible = false;
    hexToWorld(coord, this.bridge.position);
    this.bridge.rotation.y = -directionAngle(dir);
    this.bridge.visible = true;
    this.group.visible = true;
  }

  // hand the tile over to the world (or let it go when it is thrown away)
  release(tile: HexTile) {
    if (this.tile !== tile) return;
    this.group.remove(tile.group);
    tile.group.visible = true;
    this.tile = null;
  }

  hide() {
    this.group.visible = false;
  }

  update(dt: number) {
    this.time += dt;
    this.group.position.y = 1.0 + Math.sin(this.time * 3.5) * 0.15;
  }
}

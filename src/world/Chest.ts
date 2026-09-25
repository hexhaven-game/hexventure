import * as THREE from 'three';
import { damp } from '../utils/math';
import { mat } from './props';
import type { Collider } from './HexTile';

// A small treasure chest. It lives inside its tile's group (so it rises with the tile).
export class Chest {
  readonly object = new THREE.Group();
  readonly worldPosition: THREE.Vector3;
  readonly collider: Collider;
  opened = false;
  private lid = new THREE.Group();
  private lidAngle = 0;

  readonly tileKey: string;

  constructor(local: THREE.Vector3, tileCenter: THREE.Vector3, facing: number, tileKey: string) {
    this.tileKey = tileKey;
    const wood = mat(0x9a5a2e);
    const gold = mat(0xf0c040, 0.35);
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.7, 0.85), wood);
    base.position.y = 0.35;
    const band = new THREE.Mesh(new THREE.BoxGeometry(1.34, 0.12, 0.89), gold);
    band.position.y = 0.55;
    const lidBox = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.34, 0.85), wood);
    lidBox.position.set(0, 0.17, 0.425);
    const lock = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.24, 0.06), gold);
    lock.position.set(0, 0.1, 0.86);
    this.lid.position.set(0, 0.7, -0.425); // hinge at the back
    this.lid.add(lidBox, lock);
    this.object.add(base, band, this.lid);
    this.object.traverse((c) => {
      if ((c as THREE.Mesh).isMesh) {
        c.castShadow = true;
        c.receiveShadow = true;
      }
    });
    this.object.userData.keep = true; // animated, so never merged into the tile
    this.object.position.copy(local);
    this.object.rotation.y = facing;
    this.worldPosition = local.clone().add(tileCenter);
    const r = 0.75;
    this.collider = {
      kind: 'box',
      minX: this.worldPosition.x - r,
      maxX: this.worldPosition.x + r,
      minZ: this.worldPosition.z - r,
      maxZ: this.worldPosition.z + r,
    };
  }

  open(instant = false) {
    this.opened = true;
    if (instant) this.lidAngle = -1.9;
  }

  update(dt: number) {
    this.lidAngle = damp(this.lidAngle, this.opened ? -1.9 : 0, 7, dt);
    this.lid.rotation.x = this.lidAngle;
  }
}

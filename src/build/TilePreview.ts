import * as THREE from 'three';
import { ELEVATION_HEIGHT, HEX_RADIUS } from '../game/config';
import { createLandingMaterial } from '../rendering/LandingMaterial';
import { clamp } from '../utils/math';
import { createBridge } from '../world/Bridge';
import { directionAngle, hexToWorld, INNER_RADIUS, type HexCoord } from '../world/HexGrid';
import type { HexTile } from '../world/HexTile';
import { stairSteps } from '../world/props';
import { STAIRS } from '../world/stairs';

export interface HeldState {
  pos: THREE.Vector3;
  rot: THREE.Euler;
  scale: number;
}

const ghostly = (o: THREE.Object3D) => {
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    if (!m.isMesh) return;
    m.material = (m.material as THREE.MeshStandardMaterial).clone();
    Object.assign(m.material, { transparent: true, opacity: 0.6, depthWrite: false });
    m.castShadow = false;
  });
  return o;
};

// What you are about to place (as in Hexhaven): the real tile follows the cursor on a spring,
// tilts into its motion and hovers over a valid spot, where a landing marker ripples.
// Bridges and stairs show as see-through ghosts on their spot.
export class TilePreview {
  private scene: THREE.Scene;
  private bridge: THREE.Object3D;
  private stairs: THREE.Object3D;
  private landing: THREE.Mesh;
  private landingMat = createLandingMaterial();
  private tile: HexTile | null = null;
  private st: { pos: THREE.Vector3; vel: THREE.Vector3; scale: number } | null = null;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.bridge = ghostly(createBridge());
    this.stairs = ghostly(stairSteps(STAIRS.length, STAIRS.width, ELEVATION_HEIGHT));
    this.landing = new THREE.Mesh(new THREE.CircleGeometry(HEX_RADIUS, 6, Math.PI / 6).rotateX(-Math.PI / 2), this.landingMat);
    this.landing.renderOrder = 2;
    for (const o of [this.bridge, this.stairs, this.landing]) {
      o.visible = false;
      scene.add(o);
    }
  }

  // the tile in hand (built by the game for this spot, type and rotation)
  holdTile(tile: HexTile | null) {
    if (tile === this.tile) return;
    if (this.tile) this.scene.remove(this.tile.group);
    this.tile = tile;
    if (tile) {
      this.scene.add(tile.group);
      tile.group.visible = false;
      this.st = null;
    }
  }

  showBridge(coord: HexCoord | null, dir = 0) {
    this.bridge.visible = !!coord;
    if (!coord) return;
    hexToWorld(coord, this.bridge.position);
    this.bridge.rotation.y = -directionAngle(dir);
  }

  showStairs(coord: HexCoord | null, dir = 0) {
    this.stairs.visible = !!coord;
    if (!coord) return;
    const a = directionAngle(dir);
    const c = hexToWorld(coord);
    this.stairs.position.set(c.x + Math.cos(a) * INNER_RADIUS, 0.05, c.z + Math.sin(a) * INNER_RADIUS);
    this.stairs.rotation.y = -(a + Math.PI);
  }

  // Hand the held tile over for its drop; it keeps its current transform.
  take(tile: HexTile): HeldState | null {
    if (tile !== this.tile || !this.st) return null;
    const out = { pos: tile.group.position.clone(), rot: tile.group.rotation.clone(), scale: this.st.scale };
    this.tile = null;
    this.st = null;
    this.landing.visible = false;
    return out;
  }

  hide() {
    if (this.tile) this.tile.group.visible = false;
    this.st = null;
    this.bridge.visible = false;
    this.stairs.visible = false;
    this.landing.visible = false;
  }

  // cursor: where the mouse points on the ground; slot: the centre of a valid spot under it
  update(dt: number, time: number, cursor: THREE.Vector3 | null, slot: THREE.Vector3 | null, color: number) {
    this.landingMat.uniforms.uTime.value = time;
    this.landing.visible = !!slot && (!!this.tile || this.bridge.visible || this.stairs.visible);
    if (slot) {
      this.landing.position.set(slot.x, slot.y + 0.12, slot.z);
      this.landingMat.uniforms.uColor.value.set(color);
    }
    const t = this.tile;
    if (!t) return;
    if (!cursor && !slot) {
      t.group.visible = false;
      this.st = null;
      return;
    }
    const target = slot
      ? new THREE.Vector3(slot.x, 4 + Math.sin(time * 2.6) * 0.4, slot.z)
      : new THREE.Vector3(cursor!.x, 7 + Math.sin(time * 2.6) * 0.4, cursor!.z);
    if (!this.st) this.st = { pos: target.clone(), vel: new THREE.Vector3(), scale: 0.4 };
    const st = this.st;
    // spring towards the target: snappy over a valid spot, looser while roaming
    const stiffness = slot ? 120 : 70;
    const damping = slot ? 16 : 12;
    const acc = target.clone().sub(st.pos).multiplyScalar(stiffness).addScaledVector(st.vel, -damping);
    st.vel.addScaledVector(acc, dt);
    st.pos.addScaledVector(st.vel, dt);
    st.scale += ((slot ? 1 : 0.7) - st.scale) * Math.min(1, dt * 10);
    t.group.visible = true;
    t.group.position.copy(st.pos);
    t.group.scale.setScalar(st.scale);
    t.group.rotation.set(clamp(st.vel.z * 0.006, -0.3, 0.3), Math.sin(time * 1.3) * 0.05, clamp(-st.vel.x * 0.006, -0.3, 0.3));
  }
}

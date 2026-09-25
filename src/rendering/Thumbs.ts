import * as THREE from 'three';
import { HEX_RADIUS, TILE_BASE } from '../game/config';
import type { Card } from '../game/Deck';
import { createBridge } from '../world/Bridge';
import { directionAngle } from '../world/HexGrid';
import type { HexTile } from '../world/HexTile';
import { COLORS, mat } from '../world/props';
import type { TileFactory } from '../world/TileFactory';

const FAR = { q: 999, r: 999 }; // tiles built for pictures live far away from the world

// Little pictures of tiles for the HUD (as in Hexhaven): one per card, and the stack, a pile of
// tile slabs with the next tile on top. Rendered once offscreen and cached as data URLs.
export class Thumbs {
  private factory: TileFactory;
  private renderer: THREE.WebGLRenderer | null = null;
  private scene = new THREE.Scene();
  private cache = new Map<string, string>();

  constructor(factory: TileFactory) {
    this.factory = factory;
    this.scene.add(new THREE.HemisphereLight(0xfff8ee, 0x7fa4c8, 1.7));
    const sun = new THREE.DirectionalLight(0xfff0d6, 2.2);
    sun.position.set(30, 60, 40);
    this.scene.add(sun);
  }

  private r() {
    if (!this.renderer) {
      this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.1;
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    }
    return this.renderer;
  }

  // the tile a card places, as a model centred at the origin
  private model(card: Card): { object: THREE.Object3D; tile: HexTile } {
    const type = card === 'bridge' ? 'water' : card === 'stairs' ? 'hill' : card;
    const tile = this.factory.create(FAR, type, { rotation: 0, stairs: card === 'stairs' ? 5 : undefined, chest: type === 'forest' });
    tile.group.position.set(0, 0, 0);
    if (card === 'bridge') {
      const b = createBridge();
      b.rotation.y = -directionAngle(1);
      tile.group.add(b);
    }
    return { object: tile.group, tile };
  }

  private shoot(object: THREE.Object3D, w: number, h: number, cam: THREE.PerspectiveCamera) {
    const r = this.r();
    r.setSize(w, h, false);
    this.scene.add(object);
    r.render(this.scene, cam);
    const url = r.domElement.toDataURL('image/png');
    this.scene.remove(object);
    return url;
  }

  card(card: Card): string {
    const id = `card|${card}`;
    const hit = this.cache.get(id);
    if (hit) return hit;
    const { object, tile } = this.model(card);
    const cam = new THREE.PerspectiveCamera(30, 1, 1, 500);
    cam.position.set(0, 32, 34);
    cam.lookAt(0, 1.5, 0);
    const url = this.shoot(object, 220, 220, cam);
    this.factory.dispose(tile);
    this.cache.set(id, url);
    return url;
  }

  // a pile of `n` slabs with `top` lying on it
  stack(top: Card | null, n: number): string {
    const id = `stack|${top}|${n}`;
    const hit = this.cache.get(id);
    if (hit) return hit;
    const group = new THREE.Group();
    const slab = 3;
    const tops = [0x62b84a, 0x8fd35a, 0x84c955, 0xb2aa98];
    const prism = new THREE.CylinderGeometry(HEX_RADIUS, HEX_RADIUS, slab * 0.92, 6);
    // the top tile's own sides reach down to TILE_BASE; the slabs pile up below that
    for (let i = 0; i < n; i++) {
      const s = new THREE.Mesh(prism, [mat(COLORS.dirt), mat(tops[i % tops.length]), mat(COLORS.dirtDark)]);
      s.position.y = TILE_BASE - slab * (i + 0.5);
      s.rotation.y = (i % 2) * 0.05;
      group.add(s);
    }
    let tile: HexTile | null = null;
    if (top) {
      const m = this.model(top);
      tile = m.tile;
      group.add(m.object);
    }
    const h = -TILE_BASE + n * slab; // total height below the tile top
    const cam = new THREE.PerspectiveCamera(24, 200 / 320, 1, 800);
    cam.position.set(0, 36 - h * 0.25, 70 + h * 0.45);
    cam.lookAt(0, -h * 0.5 + 1, 0);
    const url = this.shoot(group, 200, 320, cam);
    if (tile) this.factory.dispose(tile);
    this.cache.set(id, url);
    return url;
  }
}

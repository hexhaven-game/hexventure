import * as THREE from 'three';
import { ELEVATION_HEIGHT, WATER_LEVEL } from '../game/config';
import type { Card } from '../game/Deck';
import type { InputManager } from '../input/InputManager';
import { HexGrid, directionAngle, hexKey, hexToWorld, worldToHex, type HexCoord } from '../world/HexGrid';
import type { HexTile, TileType } from '../world/HexTile';
import type { GridOverlay } from './GridOverlay';
import type { TilePreview } from './TilePreview';

export interface Target {
  coord: HexCoord;
  dirs?: number[]; // bridges and stairs: the sides they can face
}

interface Deps {
  grid: HexGrid;
  overlay: GridOverlay;
  preview: TilePreview;
  input: InputManager;
  camera: THREE.Camera;
  targets: (card: Card) => Target[]; // where a card may go right now
  previewTile: (coord: HexCoord, type: TileType, rotation: number) => HexTile;
  place: (coord: HexCoord, card: Card, rotation: number, dir: number | null) => void;
}

const COLOR: Partial<Record<Card, number>> = { bridge: 0xffd35a, stairs: 0xffd35a, lair: 0xd06a5a, boss: 0xb070ff, shrine: 0x8ef0ff };

// Pick a card from your hand, hover an allowed spot (the tile floats there), R / right-click to
// rotate, click to place.
export class BuildController {
  card: Card | null = null;
  rotation = 0;
  private d: Deps;
  private valid = new Map<string, Target>();
  private raycaster = new THREE.Raycaster();
  private plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private hit = new THREE.Vector3();
  private time = 0;
  private lastAt: HexCoord | null = null;

  constructor(deps: Deps) {
    this.d = deps;
  }

  enter() {
    this.refresh();
    this.d.overlay.visible = true;
  }

  exit() {
    this.d.overlay.visible = false;
    this.d.preview.hide();
    this.d.preview.holdTile(null);
  }

  select(card: Card | null) {
    this.card = card;
    this.lastAt = null;
    this.refresh();
  }

  get targetCount() {
    return this.valid.size;
  }

  // recompute where the selected card may go and redraw the board
  refresh() {
    this.valid.clear();
    const shown: { coord: HexCoord; y: number; color: number }[] = [];
    if (this.card) {
      for (const t of this.d.targets(this.card)) {
        this.valid.set(hexKey(t.coord), t);
        const tile = this.d.grid.get(t.coord);
        const y = tile ? (tile.type === 'water' ? WATER_LEVEL : tile.groundHeight) : 0;
        shown.push({ coord: t.coord, y, color: COLOR[this.card] ?? 0xffffff });
      }
    }
    this.d.overlay.rebuild(this.d.grid.tiles.values(), shown);
  }

  update(dt: number) {
    this.time += dt;
    const input = this.d.input;
    const card = this.card;
    const onto = card === 'bridge' || card === 'stairs';
    if (!onto && (input.wasPressed('KeyR') || input.consumeRightClick())) this.rotation = (this.rotation + 1) % 6;

    const cursor = this.pick();
    const h = cursor ? worldToHex(cursor.x, cursor.z) : null;
    const target = h ? this.valid.get(hexKey(h)) ?? null : null;
    this.d.overlay.setHover(target ? hexKey(target.coord) : null);

    let dir: number | null = null;
    if (target?.dirs?.length) {
      // the side nearest to the cursor
      const c = hexToWorld(target.coord);
      const a = Math.atan2(cursor!.z - c.z, cursor!.x - c.x);
      dir = target.dirs.reduce((best, d) => (angleGap(directionAngle(d), a) < angleGap(directionAngle(best), a) ? d : best));
    }
    this.d.preview.showBridge(card === 'bridge' && target ? target.coord : null, dir ?? 0);
    this.d.preview.showStairs(card === 'stairs' && target ? target.coord : null, dir ?? 0);
    if (card && !onto) {
      // the real tile: for a valid spot, or following the cursor at the last one
      if (target) this.lastAt = target.coord;
      if (this.lastAt && !this.valid.has(hexKey(this.lastAt))) this.lastAt = null;
      const at = target?.coord ?? this.lastAt ?? [...this.valid.values()][0]?.coord ?? null;
      this.d.preview.holdTile(at ? this.d.previewTile(at, card as TileType, this.rotation) : null);
    } else this.d.preview.holdTile(null);
    const slot = target ? hexToWorld(target.coord) : null;
    if (slot && target) {
      const tile = this.d.grid.get(target.coord);
      slot.y = tile ? (tile.type === 'water' ? WATER_LEVEL : tile.groundHeight) : 0;
    }
    this.d.preview.update(dt, this.time, cursor, slot, (card && COLOR[card]) ?? 0xffffff);

    if (input.consumeClick() && target && card) {
      this.d.place(target.coord, card, this.rotation, dir);
      this.refresh();
    }
  }

  private pick(): THREE.Vector3 | null {
    if (!this.d.input.hasMouse) return null;
    this.raycaster.setFromCamera(this.d.input.mouse, this.d.camera);
    this.plane.constant = this.card === 'bridge' ? -WATER_LEVEL : this.card === 'stairs' ? -ELEVATION_HEIGHT : 0;
    if (!this.raycaster.ray.intersectPlane(this.plane, this.hit)) return null;
    return this.hit.clone();
  }
}

function angleGap(a: number, b: number) {
  const d = Math.abs(a - b) % (Math.PI * 2);
  return d > Math.PI ? Math.PI * 2 - d : d;
}

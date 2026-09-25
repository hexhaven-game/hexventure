import * as THREE from 'three';
import { WATER_LEVEL } from '../game/config';
import type { InputManager } from '../input/InputManager';
import { HexGrid, hexKey, worldToHex, type HexCoord } from '../world/HexGrid';
import type { HexTile, TileType } from '../world/HexTile';
import type { GridOverlay } from './GridOverlay';
import type { TilePreview } from './TilePreview';

export type BuildOption = 'meadow' | 'forest' | 'water' | 'hill' | 'bridge';
export const BUILD_OPTIONS: BuildOption[] = ['meadow', 'forest', 'water', 'hill', 'bridge'];

interface Deps {
  grid: HexGrid;
  overlay: GridOverlay;
  preview: TilePreview;
  input: InputManager;
  camera: THREE.Camera;
  // the tile that would be placed here (the game keeps it, so placing it gives exactly this tile)
  previewTile: (coord: HexCoord, type: TileType, rotation: number) => HexTile;
  place: (coord: HexCoord, option: BuildOption, rotation: number) => void;
}

// Pick a tile type, hover an allowed hex (the tile floats there), R / right-click to rotate,
// click to place.
export class BuildController {
  selected: BuildOption = 'forest';
  rotation = 0;
  private d: Deps;
  private valid = new Map<string, HexCoord>();
  private hovered: HexCoord | null = null;
  private raycaster = new THREE.Raycaster();
  private plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private hit = new THREE.Vector3();

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
    this.hovered = null;
  }

  select(option: BuildOption) {
    this.selected = option;
    this.refresh();
  }

  // recompute where the selected option may go and redraw the board
  refresh() {
    this.valid.clear();
    const targets: { coord: HexCoord; y: number; color: number }[] = [];
    if (this.selected === 'bridge') {
      for (const t of this.d.grid.tiles.values()) {
        if (this.d.grid.bridgeDirection(t) === null) continue;
        this.valid.set(t.key, t.coord);
        targets.push({ coord: t.coord, y: WATER_LEVEL, color: 0xffd35a });
      }
    } else {
      for (const c of this.d.grid.emptySlots()) {
        this.valid.set(hexKey(c), c);
        targets.push({ coord: c, y: 0, color: 0xffffff });
      }
    }
    this.d.overlay.rebuild(this.d.grid.tiles.values(), targets);
  }

  get bridgeTargets() {
    return this.selected === 'bridge' ? this.valid.size : -1;
  }

  update(dt: number) {
    const input = this.d.input;
    if (input.wasPressed('KeyR') || input.consumeRightClick()) this.rotation = (this.rotation + 1) % 6;
    this.d.preview.update(dt);

    const h = this.pick();
    const key = h ? hexKey(h) : null;
    const ok = key !== null && this.valid.has(key);
    this.hovered = ok ? h : null;
    this.d.overlay.setHover(ok ? key : null);
    if (ok && h) {
      if (this.selected === 'bridge') this.d.preview.showBridge(h, this.d.grid.bridgeDirection(this.d.grid.get(h)!) ?? 0);
      else this.d.preview.showTile(this.d.previewTile(h, this.selected, this.rotation));
    } else this.d.preview.hide();

    if (input.consumeClick() && this.hovered) {
      this.d.place(this.hovered, this.selected, this.rotation);
      this.d.preview.hide();
      this.refresh();
    }
  }

  private pick(): HexCoord | null {
    if (!this.d.input.hasMouse) return null;
    this.raycaster.setFromCamera(this.d.input.mouse, this.d.camera);
    this.plane.constant = this.selected === 'bridge' ? -WATER_LEVEL : 0;
    if (!this.raycaster.ray.intersectPlane(this.plane, this.hit)) return null;
    return worldToHex(this.hit.x, this.hit.z);
  }
}

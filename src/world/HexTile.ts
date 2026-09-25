import * as THREE from 'three';
import { ELEVATION_HEIGHT } from '../game/config';
import { hexKey, hexToWorld, type HexCoord } from './HexGrid';

export type TileType = 'home' | 'meadow' | 'forest' | 'water' | 'hill';

export type Collider =
  | { kind: 'circle'; x: number; z: number; r: number }
  | { kind: 'box'; minX: number; maxX: number; minZ: number; maxZ: number };

// something big that fades out when it hides the player from the camera
export interface Fadeable {
  object: THREE.Object3D;
  center: THREE.Vector3; // world space
  radius: number;
}

// decoration that pops in (scale 0 -> 1) while the tile rises
export interface DecorItem {
  object: THREE.Object3D;
  scale: THREE.Vector3;
  delay: number; // 0..1 of the placement animation
}

export class HexTile {
  readonly coord: HexCoord;
  readonly type: TileType;
  readonly key: string;
  readonly center: THREE.Vector3;
  readonly group = new THREE.Group();
  readonly edges = new THREE.Group(); // parts that depend on the neighbours (beaches)

  top: THREE.Mesh | null = null;
  bed: THREE.Mesh | null = null; // water tiles: the shaped lake bed with its beaches
  decor: DecorItem[] = [];
  colliders: Collider[] = [];
  fadeables: Fadeable[] = [];
  bridgeDir: number | null = null; // set once a bridge is walkable
  bridgePending = false; // a bridge is rising here
  playerSpawn: THREE.Vector3 | null = null;
  enemySpawn: THREE.Vector3 | null = null;
  chestSpawn: THREE.Vector3 | null = null; // local
  ready = false; // walkable once the placement animation has finished
  rotation = 0; // in 60° steps; turns the decoration layout
  hasChest = false;
  chestOpened = false;
  enemyAlive = false; // the forest slime is still around
  ownGeometries: THREE.BufferGeometry[] = []; // unique to this tile, freed when a preview is thrown away

  constructor(coord: HexCoord, type: TileType) {
    this.coord = coord;
    this.type = type;
    this.key = hexKey(coord);
    this.center = hexToWorld(coord);
    this.group.position.copy(this.center);
    this.group.add(this.edges);
  }

  get elevation() {
    return this.type === 'hill' ? 1 : 0;
  }

  get groundHeight() {
    return this.elevation * ELEVATION_HEIGHT;
  }

  get isLand() {
    return this.type !== 'water';
  }
}

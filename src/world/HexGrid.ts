import * as THREE from 'three';
import { HEX_RADIUS } from '../game/config';
import type { HexTile } from './HexTile';

// Pointy-top hexagons in axial coordinates (q, r).

export interface HexCoord {
  q: number;
  r: number;
}

export const SQRT3 = Math.sqrt(3);
export const INNER_RADIUS = (HEX_RADIUS * SQRT3) / 2; // centre to the middle of an edge

// neighbour directions; d and d + 3 are opposite
export const DIRECTIONS: readonly HexCoord[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

export const hexKey = (h: HexCoord) => `${h.q + 0},${h.r + 0}`;

export function hexToWorld(h: HexCoord, out = new THREE.Vector3()): THREE.Vector3 {
  return out.set(HEX_RADIUS * SQRT3 * (h.q + h.r / 2), 0, HEX_RADIUS * 1.5 * h.r);
}

export function worldToHex(x: number, z: number): HexCoord {
  const q = ((SQRT3 / 3) * x - z / 3) / HEX_RADIUS;
  const r = ((2 / 3) * z) / HEX_RADIUS;
  return hexRound(q, r);
}

function hexRound(q: number, r: number): HexCoord {
  const s = -q - r;
  let rq = Math.round(q);
  let rr = Math.round(r);
  const rs = Math.round(s);
  const dq = Math.abs(rq - q);
  const dr = Math.abs(rr - r);
  const ds = Math.abs(rs - s);
  if (dq > dr && dq > ds) rq = -rr - rs;
  else if (dr > ds) rr = -rq - rs;
  return { q: rq + 0, r: rr + 0 };
}

export const neighbor = (h: HexCoord, dir: number): HexCoord => {
  const d = DIRECTIONS[((dir % 6) + 6) % 6];
  return { q: h.q + d.q, r: h.r + d.r };
};

export function getNeighbors(h: HexCoord): HexCoord[] {
  return DIRECTIONS.map((d) => ({ q: h.q + d.q, r: h.r + d.r }));
}

// world angle (atan2(z, x)) of a neighbour direction
const DIR_ANGLES = DIRECTIONS.map((d) => {
  const v = hexToWorld(d);
  return Math.atan2(v.z, v.x);
});
export const directionAngle = (dir: number) => DIR_ANGLES[((dir % 6) + 6) % 6];

// the two corners of the edge that faces neighbour `dir`, in local tile space
export function edgeCorners(dir: number, radius = HEX_RADIUS): [THREE.Vector3, THREE.Vector3] {
  const a = directionAngle(dir);
  const c0 = new THREE.Vector3(Math.cos(a - Math.PI / 6) * radius, 0, Math.sin(a - Math.PI / 6) * radius);
  const c1 = new THREE.Vector3(Math.cos(a + Math.PI / 6) * radius, 0, Math.sin(a + Math.PI / 6) * radius);
  return [c0, c1];
}

export function hexCorners(radius = HEX_RADIUS): THREE.Vector3[] {
  return Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 180) * (60 * i - 30);
    return new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius);
  });
}

// is a local point inside a hex with the given inner radius
export function insideHex(x: number, z: number, inner = INNER_RADIUS) {
  const ax = Math.abs(x);
  return ax <= inner && ax / 2 + (Math.abs(z) * SQRT3) / 2 <= inner;
}

// distance from a local point to the edge facing `dir`
export function distanceToEdge(x: number, z: number, dir: number) {
  const a = directionAngle(dir);
  return INNER_RADIUS - (x * Math.cos(a) + z * Math.sin(a));
}

const isFlatLand = (t?: HexTile) => !!t && t.type !== 'water' && t.elevation === 0;

export class HexGrid {
  readonly tiles = new Map<string, HexTile>();

  get(h: HexCoord) {
    return this.tiles.get(hexKey(h));
  }

  add(tile: HexTile) {
    this.tiles.set(tile.key, tile);
  }

  // every empty hex that touches the world: where a new tile may go
  emptySlots(): HexCoord[] {
    const out = new Map<string, HexCoord>();
    for (const t of this.tiles.values()) {
      for (const n of getNeighbors(t.coord)) {
        const k = hexKey(n);
        if (!this.tiles.has(k)) out.set(k, n);
      }
    }
    return [...out.values()];
  }

  // a water tile can carry a bridge when land lies on two opposite sides
  bridgeDirection(tile: HexTile): number | null {
    if (tile.type !== 'water' || tile.bridgeDir !== null || tile.bridgePending) return null;
    for (let d = 0; d < 3; d++) {
      if (isFlatLand(this.get(neighbor(tile.coord, d))) && isFlatLand(this.get(neighbor(tile.coord, d + 3)))) return d;
    }
    return null;
  }
}

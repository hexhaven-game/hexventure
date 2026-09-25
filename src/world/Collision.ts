import * as THREE from 'three';
import { BRIDGE_Y, STEP_HEIGHT } from '../game/config';
import { TAU } from '../utils/math';
import { BRIDGE_HALF_WIDTH } from './Bridge';
import { HexGrid, INNER_RADIUS, directionAngle, getNeighbors, worldToHex } from './HexGrid';
import type { Collider, HexTile } from './HexTile';
import { stairsHeight } from './stairs';

// Simple and predictable: the ground height comes from the hex under a point (water has none,
// except on a bridge), steps higher than STEP_HEIGHT are walls (cliffs), and props are circles
// or boxes that push you out.
export class WorldCollision {
  private grid: HexGrid;

  constructor(grid: HexGrid) {
    this.grid = grid;
  }

  groundAt(x: number, z: number): number | null {
    const tile = this.grid.get(worldToHex(x, z));
    if (!tile || !tile.ready) return null;
    if (tile.type === 'water') return this.onBridge(tile, x, z) ? BRIDGE_Y : null;
    if (tile.stairsDir !== null) {
      const s = stairsHeight(x - tile.center.x, z - tile.center.z, tile.stairsDir);
      if (s !== null) return s;
    }
    return tile.groundHeight;
  }

  onBridge(tile: HexTile, x: number, z: number) {
    if (tile.bridgeDir === null) return false;
    const a = directionAngle(tile.bridgeDir);
    const lx = x - tile.center.x;
    const lz = z - tile.center.z;
    const u = lx * Math.cos(a) + lz * Math.sin(a);
    const v = -lx * Math.sin(a) + lz * Math.cos(a);
    return Math.abs(u) <= INNER_RADIUS + 0.5 && Math.abs(v) <= BRIDGE_HALF_WIDTH;
  }

  // the whole footprint (centre + a ring) must be on ground within one step of `fromY`
  canStand(x: number, z: number, radius: number, fromY: number) {
    const ok = (px: number, pz: number) => {
      const g = this.groundAt(px, pz);
      return g !== null && Math.abs(g - fromY) <= STEP_HEIGHT;
    };
    if (!ok(x, z)) return false;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      if (!ok(x + Math.cos(a) * radius, z + Math.sin(a) * radius)) return false;
    }
    return true;
  }

  collidersNear(x: number, z: number): Collider[] {
    const h = worldToHex(x, z);
    const out: Collider[] = [];
    for (const c of [h, ...getNeighbors(h)]) {
      const t = this.grid.get(c);
      if (t?.ready) out.push(...t.colliders);
    }
    return out;
  }

  // Moves `pos` by (dx, dz), sliding along blocked axes, and returns the ground height there.
  move(pos: THREE.Vector3, dx: number, dz: number, radius: number, groundY: number): number {
    if (this.canStand(pos.x + dx, pos.z, radius, groundY)) pos.x += dx;
    if (this.canStand(pos.x, pos.z + dz, radius, groundY)) pos.z += dz;
    for (const c of this.collidersNear(pos.x, pos.z)) {
      const px = pos.x;
      const pz = pos.z;
      if (pushOut(pos, c, radius) && !this.canStand(pos.x, pos.z, radius, groundY)) {
        pos.x = px;
        pos.z = pz;
      }
    }
    return this.groundAt(pos.x, pos.z) ?? groundY;
  }
}

function pushOut(pos: THREE.Vector3, c: Collider, r: number): boolean {
  if (c.kind === 'circle') {
    const dx = pos.x - c.x;
    const dz = pos.z - c.z;
    const d = Math.hypot(dx, dz);
    const min = c.r + r;
    if (d >= min) return false;
    if (d < 1e-4) pos.x = c.x + min;
    else {
      pos.x = c.x + (dx / d) * min;
      pos.z = c.z + (dz / d) * min;
    }
    return true;
  }
  const qx = Math.min(c.maxX, Math.max(c.minX, pos.x));
  const qz = Math.min(c.maxZ, Math.max(c.minZ, pos.z));
  const dx = pos.x - qx;
  const dz = pos.z - qz;
  const d = Math.hypot(dx, dz);
  if (d >= r) return false;
  if (d > 1e-4) {
    pos.x = qx + (dx / d) * r;
    pos.z = qz + (dz / d) * r;
    return true;
  }
  // centre inside the box: leave by the nearest side
  const opts = [
    { v: pos.x - c.minX, x: c.minX - r, z: pos.z },
    { v: c.maxX - pos.x, x: c.maxX + r, z: pos.z },
    { v: pos.z - c.minZ, x: pos.x, z: c.minZ - r },
    { v: c.maxZ - pos.z, x: pos.x, z: c.maxZ + r },
  ].sort((a, b) => a.v - b.v);
  pos.x = opts[0].x;
  pos.z = opts[0].z;
  return true;
}

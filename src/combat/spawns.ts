import * as THREE from 'three';
import { HEX_RADIUS } from '../game/config';
import { hashString, mulberry32 } from '../utils/math';
import { INNER_RADIUS, insideHex } from '../world/HexGrid';
import type { HexTile } from '../world/HexTile';
import { Bat } from './enemies/Bat';
import { Boar } from './enemies/Boar';
import type { Enemy, EnemyKind } from './enemies/Enemy';
import { HollowKing } from './enemies/HollowKing';
import { Husk } from './enemies/Husk';
import { SlimeKing } from './enemies/SlimeKing';
import { Warden } from './enemies/Warden';
import { Slime } from './enemies/Slime';
import { Spitter } from './enemies/Spitter';

export type SpawnKind = EnemyKind | 'warden' | 'slimeking' | 'king';

export interface SpawnPoint {
  kind: SpawnKind;
  x: number;
  z: number;
}

// how far a tile is from home: the further out, the more dangerous
export const dangerOf = (tile: HexTile) => (Math.abs(tile.coord.q) + Math.abs(tile.coord.r) + Math.abs(tile.coord.q + tile.coord.r)) / 2;

// Which enemies a tile gets, and where. Fixed per tile (seeded), so resting respawns the same set.
export function planSpawns(tile: HexTile): SpawnPoint[] {
  const danger = dangerOf(tile);
  const rng = mulberry32(hashString(`${tile.key}:spawns`));
  const out: SpawnPoint[] = [];
  const spot = (near?: THREE.Vector3, spread = 5): { x: number; z: number } | null => {
    for (let i = 0; i < 40; i++) {
      const ox = near ? near.x - tile.center.x : 0;
      const oz = near ? near.z - tile.center.z : 0;
      const x = ox + (rng() * 2 - 1) * spread;
      const z = oz + (rng() * 2 - 1) * spread;
      if (!insideHex(x, z, INNER_RADIUS - 1.8)) continue;
      const wx = tile.center.x + x;
      const wz = tile.center.z + z;
      const clear = tile.colliders.every((c) =>
        c.kind === 'circle'
          ? Math.hypot(c.x - wx, c.z - wz) > c.r + 1.2
          : wx < c.minX - 1.2 || wx > c.maxX + 1.2 || wz < c.minZ - 1.2 || wz > c.maxZ + 1.2,
      );
      if (clear && out.every((o) => Math.hypot(o.x - wx, o.z - wz) > 1.8)) return { x: wx, z: wz };
    }
    return null;
  };
  const add = (kind: SpawnKind, near?: THREE.Vector3, spread?: number) => {
    const p = spot(near, spread);
    if (p) out.push({ kind, ...p });
  };
  const chance = (p: number) => rng() < p;

  switch (tile.type) {
    case 'forest': {
      const clearing = tile.enemySpawn ?? tile.center;
      add('slime', clearing, 2.5);
      if (danger >= 2) add('slime', clearing, 3);
      if (danger >= 1 && chance(0.5)) add('bat', clearing, 3);
      if (danger >= 2 && chance(0.7)) add('husk', clearing, 3);
      if (danger >= 3 && chance(0.5)) add('spitter', undefined, HEX_RADIUS * 0.6);
      break;
    }
    case 'meadow':
      if (danger >= 1 && chance(0.4)) add('slime');
      if (danger >= 2 && chance(0.6)) add('boar');
      if (danger >= 2 && chance(0.3)) add('spitter');
      break;
    case 'water':
      if (danger >= 2 && chance(0.4)) add('bat', tile.center, 2);
      break;
    case 'lair':
      out.push({ kind: chance(0.5) ? 'warden' : 'slimeking', x: tile.enemySpawn!.x, z: tile.enemySpawn!.z });
      break;
    case 'boss':
      out.push({ kind: 'king', x: tile.enemySpawn!.x, z: tile.enemySpawn!.z });
      break;
  }
  return out;
}

export function createEnemy(p: SpawnPoint, y: number, tile: { key: string; coord: HexTile['coord'] }): Enemy {
  const pos = new THREE.Vector3(p.x, y, p.z);
  const extra = Math.floor(dangerOf(tile as HexTile) / 3); // tougher further out
  switch (p.kind) {
    case 'husk':
      return new Husk(pos, tile.key, 4 + extra);
    case 'spitter':
      return new Spitter(pos, tile.key, 2 + extra);
    case 'bat':
      return new Bat(pos, tile.key, 1);
    case 'boar':
      return new Boar(pos, tile.key, 5 + extra);
    case 'warden':
      return new Warden(pos, tile.key, 16 + extra * 2);
    case 'slimeking':
      return new SlimeKing(pos, tile.key, 14 + extra * 2);
    case 'king':
      return new HollowKing(pos, tile.key, 36 + extra * 2);
    default:
      return new Slime(pos, tile.key, 2 + extra);
  }
}

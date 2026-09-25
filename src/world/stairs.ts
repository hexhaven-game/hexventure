import { ELEVATION_HEIGHT } from '../game/config';
import { directionAngle, distanceToEdge } from './HexGrid';

export const STAIRS = { length: 6.6, width: 3.2 };

// Height of the stairs at a local point of a hill tile, or null when the point is not on them.
// The stairs start at ground level on the edge facing `dir` and climb to the top of the hill.
export function stairsHeight(lx: number, lz: number, dir: number, pad = 0): number | null {
  const a = directionAngle(dir);
  const u = distanceToEdge(lx, lz, dir); // 0 on the edge, growing inwards
  const v = -lx * Math.sin(a) + lz * Math.cos(a); // across the stairs
  if (u < -0.05 || u > STAIRS.length || Math.abs(v) > STAIRS.width / 2 + pad) return null;
  return ELEVATION_HEIGHT * Math.max(0, u) / STAIRS.length;
}

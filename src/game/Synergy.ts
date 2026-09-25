import { getNeighbors, hexKey, type HexCoord, HexGrid } from '../world/HexGrid';
import type { HexTile, TileType } from '../world/HexTile';
import type { Card } from './Deck';

// How tiles work together (as in Dorfromantik / Hexhaven), so where you place matters:
// - Deep Forest: every third forest in one connected forest is deep: a chest and an elite.
// - Highlands: every second hill in one connected range gets a chest on top (reach it by stairs).
// - Riverbank: every meadow next to water makes shrine upgrades 5% cheaper (up to 30%).
// - Goals: a new patch of meadow, forest or water may come with a goal: grow it to a size for
//   two extra tiles.

const GROWABLE: TileType[] = ['meadow', 'forest', 'water'];

export interface Goal {
  anchor: string; // key of the tile the patch started with
  type: TileType;
  target: number;
  done: boolean;
}

// the connected patch of `type` that `coord` belongs to (or would join), including coord itself
export function patchSize(grid: HexGrid, coord: HexCoord, type: TileType): number {
  const seen = new Set<string>([hexKey(coord)]);
  const queue = [coord];
  while (queue.length) {
    const c = queue.pop()!;
    for (const n of getNeighbors(c)) {
      const k = hexKey(n);
      if (seen.has(k)) continue;
      const t = grid.tiles.get(k);
      if (t && t.type === type) {
        seen.add(k);
        queue.push(n);
      }
    }
  }
  return seen.size;
}

export const isRiverbank = (grid: HexGrid, t: HexTile) =>
  t.type === 'meadow' && getNeighbors(t.coord).some((n) => grid.get(n)?.type === 'water');

export function riverbankCut(grid: HexGrid) {
  let n = 0;
  for (const t of grid.tiles.values()) if (isRiverbank(grid, t)) n++;
  return Math.min(0.3, n * 0.05);
}

// what placing `card` at `coord` would bring (shown while hovering in build mode)
export function placementHints(grid: HexGrid, coord: HexCoord, card: Card, goals: Goal[]): string[] {
  const out: string[] = [];
  if (card === 'forest' && patchSize(grid, coord, 'forest') % 3 === 0) out.push('Deep Forest: a chest and an elite');
  if (card === 'hill' && patchSize(grid, coord, 'hill') % 2 === 0) out.push('Highlands: a chest on top');
  if (card === 'meadow' && getNeighbors(coord).some((n) => grid.get(n)?.type === 'water')) out.push('Riverbank: shrine 5% cheaper');
  if (card === 'water' && getNeighbors(coord).some((n) => grid.get(n)?.type === 'meadow')) out.push('Riverbank: shrine 5% cheaper');
  for (const g of goals) {
    if (g.done || g.type !== card) continue;
    const anchor = grid.tiles.get(g.anchor);
    if (!anchor) continue;
    // does this spot touch the goal's patch?
    const grown = patchSize(grid, coord, card);
    const now = patchSize(grid, anchor.coord, card);
    if (grown > now) out.push(grown >= g.target ? `Completes a goal: +2 tiles` : `Goal ${grown}/${g.target}`);
  }
  return out;
}

// after placing: a brand new patch may start a goal (at most two open at once)
export function maybeGoal(grid: HexGrid, tile: HexTile, goals: Goal[]): Goal | null {
  if (!GROWABLE.includes(tile.type)) return null;
  if (goals.filter((g) => !g.done).length >= 2) return null;
  if (patchSize(grid, tile.coord, tile.type) !== 1) return null;
  if (Math.random() > 0.6) return null;
  const g: Goal = { anchor: tile.key, type: tile.type, target: 3 + Math.floor(Math.random() * 3), done: false };
  goals.push(g);
  return g;
}

// goals reached by the latest placement
export function completedGoals(grid: HexGrid, goals: Goal[]): Goal[] {
  const out: Goal[] = [];
  for (const g of goals) {
    if (g.done) continue;
    const anchor = grid.tiles.get(g.anchor);
    if (anchor && patchSize(grid, anchor.coord, g.type) >= g.target) {
      g.done = true;
      out.push(g);
    }
  }
  return out;
}

export function goalProgress(grid: HexGrid, g: Goal) {
  const anchor = grid.tiles.get(g.anchor);
  return anchor ? patchSize(grid, anchor.coord, g.type) : 0;
}

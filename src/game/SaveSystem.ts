import type { StatKind } from '../player/PlayerStats';
import type { TileType } from '../world/HexTile';
import type { Card } from './Deck';

// Saves live in localStorage: one autosave plus three manual slots.

export type Slot = 'auto' | '1' | '2' | '3';
export const SLOTS: Slot[] = ['auto', '1', '2', '3'];

export interface TileSave {
  q: number;
  r: number;
  type: TileType;
  rot: number;
  chest: boolean;
  opened: boolean;
  bridge: number | null;
  stairs?: number | null;
  cleared?: boolean;
}

export interface SaveData {
  v: 3;
  savedAt: number;
  tiles: TileSave[]; // in placement order
  player: { x: number; z: number; yaw: number };
  stats: { level: Record<StatKind, number>; hearts: number; flasks: number; embers: number };
  deck: { count: number; offer: Card[]; boss?: boolean };
  pile: { x: number; z: number; embers: number } | null;
  forests: number;
  fragments: number;
  won?: boolean;
}

const key = (slot: Slot) => `hexadventure-save-${slot}`;

export const SaveSystem = {
  read(slot: Slot): SaveData | null {
    try {
      const d = JSON.parse(localStorage.getItem(key(slot)) ?? 'null');
      return d && d.v === 3 && Array.isArray(d.tiles) ? (d as SaveData) : null;
    } catch {
      return null;
    }
  },

  write(slot: Slot, data: SaveData): boolean {
    try {
      localStorage.setItem(key(slot), JSON.stringify(data));
      return true;
    } catch {
      return false;
    }
  },

  remove(slot: Slot) {
    try {
      localStorage.removeItem(key(slot));
    } catch {
      /* storage unavailable */
    }
  },

  // "12 tiles · 3 fragments · 25-09-2026 14:05"
  describe(d: SaveData): string {
    const t = new Date(d.savedAt);
    const two = (n: number) => String(n).padStart(2, '0');
    const when = `${two(t.getDate())}-${two(t.getMonth() + 1)}-${t.getFullYear()} ${two(t.getHours())}:${two(t.getMinutes())}`;
    return `${d.tiles.length} tiles · ${d.fragments} fragment${d.fragments === 1 ? '' : 's'} · ${when}`;
  },
};

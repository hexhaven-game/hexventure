import { RUN } from './config';
import type { TileType } from '../world/HexTile';

// A tile you can place: terrain, a special tile, or a bridge / stairs (placed onto a tile).
export type Card = Exclude<TileType, 'home'> | 'bridge' | 'stairs';

// cards that need a particular spot; they are only offered when that spot exists
export const NEEDS_SPOT: Card[] = ['bridge', 'stairs', 'lair', 'boss'];

const WEIGHTS: [Card, number][] = [
  ['meadow', 3],
  ['forest', 3],
  ['water', 1.5],
  ['hill', 1.1],
  ['bridge', 0.9],
  ['stairs', 0.8],
  ['shrine', 0.35],
  ['lair', 0.7],
];

// The run's tiles, as in Hexhaven: `count` is how many tiles you have left (the stack), and each
// time you place one you choose it from an offer of three. Choosing costs nothing extra; when the
// count reaches zero there is nothing to choose.
export class Deck {
  count = 0;
  offer: Card[] = [];
  boss = false; // after three fragments the boss tile is always one of the options
  private sinceLair = 0;
  private sinceShrine = 0;

  // decides whether a card has somewhere to go right now (set by the game)
  canUse: (c: Card) => boolean = () => true;

  static fresh(canUse: (c: Card) => boolean): Deck {
    const d = new Deck();
    d.canUse = canUse;
    d.count = RUN.startTiles;
    d.deal(['forest', 'meadow', 'hill']);
    return d;
  }

  private random(): Card {
    const total = WEIGHTS.reduce((s, [, w]) => s + w, 0);
    let r = Math.random() * total;
    for (const [c, w] of WEIGHTS) {
      r -= w;
      if (r <= 0) return c;
    }
    return 'meadow';
  }

  // a fresh choice of three (different) tiles that can all be placed
  deal(first?: Card[]) {
    if (this.count <= 0) {
      this.offer = [];
      return;
    }
    const out: Card[] = first ? [...first] : [];
    // don't let the special tiles stay away for too long
    if (!first && this.sinceLair >= 5 && this.canUse('lair')) out.push('lair');
    if (!first && this.sinceShrine >= 9 && this.canUse('shrine')) out.push('shrine');
    for (let tries = 0; out.length < RUN.handSize && tries < 60; tries++) {
      const c = this.random();
      if (out.includes(c)) continue;
      if (NEEDS_SPOT.includes(c) && !this.canUse(c)) continue;
      out.push(c);
    }
    if (this.boss) {
      if (!out.includes('boss')) out[out.length - 1] = 'boss';
    }
    this.sinceLair = out.includes('lair') ? 0 : this.sinceLair + 1;
    this.sinceShrine = out.includes('shrine') ? 0 : this.sinceShrine + 1;
    this.offer = out;
  }

  // place option i: one tile less, and a new choice
  take(i: number) {
    const c = this.offer[i];
    if (c === 'boss') this.boss = false;
    this.count = Math.max(0, this.count - 1);
    this.deal();
  }

  add(n: number) {
    const was = this.count;
    this.count += n;
    if (was <= 0 || !this.offer.length) this.deal();
  }

  // an option that lost its spot (the world changed) is swapped for another
  recheck() {
    if (this.count <= 0) return;
    const bad = this.offer.filter((c) => c !== 'boss' && NEEDS_SPOT.includes(c) && !this.canUse(c));
    if (!bad.length) return;
    const keep = this.offer.filter((c) => !bad.includes(c));
    this.deal(keep);
  }

  get empty() {
    return this.count <= 0;
  }
}

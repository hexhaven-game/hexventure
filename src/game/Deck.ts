import { RUN } from './config';
import type { TileType } from '../world/HexTile';

// A tile you can hold: terrain, a special tile, or a bridge / stairs (placed onto a tile).
export type Card = Exclude<TileType, 'home'> | 'bridge' | 'stairs';

// cards that need a particular spot; they only come into your hand when that spot exists
export const NEEDS_SPOT: Card[] = ['bridge', 'stairs', 'lair', 'boss'];

const WEIGHTS: [Card, number][] = [
  ['meadow', 3],
  ['forest', 3],
  ['water', 1.5],
  ['hill', 1.1],
  ['bridge', 0.7],
  ['stairs', 0.6],
  ['shrine', 0.3],
  ['lair', 0.45],
];

// The run's tiles: a face-down stack and a hand of three you choose from (as in Hexhaven).
export class Deck {
  stack: Card[] = [];
  hand: Card[] = [];

  // decides whether a card has somewhere to go right now (set by the game)
  canUse: (c: Card) => boolean = () => true;

  static fresh(): Deck {
    const d = new Deck();
    // a friendly opening hand, a shrine and a lair somewhere in the stack, the rest random
    d.hand = ['forest', 'meadow', 'hill'];
    d.add(RUN.startTiles);
    d.stack.splice(2, 0, 'shrine');
    d.stack.splice(5, 0, 'lair');
    return d;
  }

  random(): Card {
    const total = WEIGHTS.reduce((s, [, w]) => s + w, 0);
    let r = Math.random() * total;
    for (const [c, w] of WEIGHTS) {
      r -= w;
      if (r <= 0) return c;
    }
    return 'meadow';
  }

  add(n: number) {
    for (let i = 0; i < n; i++) this.stack.push(this.random());
    this.fillHand();
  }

  // Draws up to a full hand. A card that needs a spot that doesn't exist yet goes back under
  // the stack instead of clogging your hand.
  fillHand() {
    let tries = this.stack.length;
    while (this.hand.length < RUN.handSize && this.stack.length && tries-- > 0) {
      const c = this.stack.shift()!;
      if (NEEDS_SPOT.includes(c) && !this.canUse(c)) this.stack.push(c);
      else this.hand.push(c);
    }
  }

  // cards in hand that lost their spot go back as well (called after the world changes)
  recheck() {
    const stuck = this.hand.filter((c) => c !== 'boss' && NEEDS_SPOT.includes(c) && !this.canUse(c));
    if (!stuck.length || !this.stack.some((c) => !NEEDS_SPOT.includes(c))) return;
    this.hand = this.hand.filter((c) => !stuck.includes(c));
    this.stack.push(...stuck);
    this.fillHand();
  }

  use(index: number) {
    this.hand.splice(index, 1);
    this.fillHand();
  }

  get empty() {
    return this.hand.length === 0;
  }
}

import { FLASK, PLAYER, RUN, STAMINA } from '../game/config';
import type { RelicId } from '../game/Relics';

export type StatKind = 'hearts' | 'stamina' | 'damage';

// Everything the hearth can level up, plus the run's currency (embers) and the flask.
export class PlayerStats {
  level: Record<StatKind, number> = { hearts: 0, stamina: 0, damage: 0 };
  hearts = PLAYER.maxHearts;
  stamina: number = STAMINA.max;
  flasks: number = FLASK.charges;
  embers = 0;
  relics: RelicId[] = [];
  bonusFlasks = 0; // from the Hearthstone
  costCut = 0; // shrine discount from riverbank meadows (0..0.3)
  private wait = 0;

  has(r: RelicId) {
    return this.relics.includes(r);
  }

  get maxHearts() {
    return Math.min(RUN.maxHearts + 1, PLAYER.maxHearts + this.level.hearts + (this.has('emberheart') ? 1 : 0));
  }

  get maxFlasks() {
    return FLASK.charges + this.bonusFlasks + (this.has('deepflask') ? 1 : 0);
  }

  get speedMul() {
    return this.has('boots') ? 1.15 : 1;
  }

  get rollCost() {
    return STAMINA.roll * (this.has('featherroll') ? 0.6 : 1);
  }

  get reachMul() {
    return this.has('longblade') ? 1.25 : 1;
  }

  get emberMul() {
    return this.has('magnet') ? 1.5 : 1;
  }

  get maxStamina() {
    return STAMINA.max + this.level.stamina * STAMINA.perLevel;
  }

  get damage() {
    return 1 + this.level.damage * 0.5 + (this.has('whetstone') ? 0.5 : 0);
  }

  get totalLevel() {
    return this.level.hearts + this.level.stamina + this.level.damage;
  }

  // embers needed for the next level of anything
  get levelCost() {
    return Math.round(40 * Math.pow(1.45, this.totalLevel) * (1 - this.costCut));
  }

  canLevel(kind: StatKind) {
    if (kind === 'hearts' && PLAYER.maxHearts + this.level.hearts >= RUN.maxHearts) return false;
    return this.embers >= this.levelCost;
  }

  levelUp(kind: StatKind) {
    if (!this.canLevel(kind)) return false;
    this.embers -= this.levelCost;
    this.level[kind]++;
    this.restore();
    return true;
  }

  // soulslike: any stamina left lets you act (you may go a little below zero)
  spend(amount: number) {
    if (this.stamina <= 0) return false;
    this.stamina -= amount;
    this.wait = STAMINA.delay;
    return true;
  }

  update(dt: number) {
    this.wait -= dt;
    if (this.wait <= 0) this.stamina = Math.min(this.maxStamina, this.stamina + STAMINA.regen * dt);
  }

  // a fresh run
  reset() {
    this.level = { hearts: 0, stamina: 0, damage: 0 };
    this.embers = 0;
    this.relics = [];
    this.bonusFlasks = 0;
    this.costCut = 0;
    this.restore();
  }

  // resting at the hearth
  restore() {
    this.hearts = this.maxHearts;
    this.stamina = this.maxStamina;
    this.flasks = this.maxFlasks;
  }
}

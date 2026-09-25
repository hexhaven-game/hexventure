import { FLASK, PLAYER, RUN, STAMINA } from '../game/config';

export type StatKind = 'hearts' | 'stamina' | 'damage';

// Everything the hearth can level up, plus the run's currency (embers) and the flask.
export class PlayerStats {
  level: Record<StatKind, number> = { hearts: 0, stamina: 0, damage: 0 };
  hearts = PLAYER.maxHearts;
  stamina: number = STAMINA.max;
  flasks: number = FLASK.charges;
  embers = 0;
  private wait = 0;

  get maxHearts() {
    return Math.min(RUN.maxHearts, PLAYER.maxHearts + this.level.hearts);
  }

  get maxStamina() {
    return STAMINA.max + this.level.stamina * STAMINA.perLevel;
  }

  get damage() {
    return 1 + this.level.damage * 0.5;
  }

  get totalLevel() {
    return this.level.hearts + this.level.stamina + this.level.damage;
  }

  // embers needed for the next level of anything
  get levelCost() {
    return Math.round(40 * Math.pow(1.45, this.totalLevel));
  }

  canLevel(kind: StatKind) {
    if (kind === 'hearts' && this.maxHearts >= RUN.maxHearts) return false;
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
    this.restore();
  }

  // resting at the hearth
  restore() {
    this.hearts = this.maxHearts;
    this.stamina = this.maxStamina;
    this.flasks = FLASK.charges;
  }
}

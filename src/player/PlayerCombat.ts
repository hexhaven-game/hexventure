import type { PlayerStats } from './PlayerStats';

// Souls-style attacks. Every attack has three phases: a wind-up (anticipation), a short active
// window (the only moment it hits) and a recovery you are committed to. Light attacks chain into
// a three-hit combo, but only from the second half of the recovery, and one press is buffered at
// most: mashing doesn't make you faster, rhythm does. The heavy attack charges while held.

export type AttackKind = 'light1' | 'light2' | 'light3' | 'heavy';
// rl: from the right to the left, lr: back from the left to the right, wide: a big finishing sweep
export type Arc = 'rl' | 'lr' | 'wide' | 'overhead';
export type Phase = 'windup' | 'active' | 'recover';

export interface AttackDef {
  windup: number;
  active: number;
  recover: number;
  damage: number; // times the sword's damage
  poise: number; // poise damage to the enemy
  stamina: number;
  lunge: number; // step forward during the active window
  arc: Arc;
  reach: number;
  halfArc: number; // degrees either side of facing
  chainAt: number; // 0..1 into the recovery from which the next light attack may start (1 = never)
}

export const ATTACKS: Record<AttackKind, AttackDef> = {
  light1: { windup: 0.13, active: 0.11, recover: 0.34, damage: 1, poise: 1, stamina: 18, lunge: 5, arc: 'rl', reach: 2.5, halfArc: 80, chainAt: 0.4 },
  light2: { windup: 0.11, active: 0.11, recover: 0.34, damage: 1, poise: 1, stamina: 18, lunge: 5, arc: 'lr', reach: 2.5, halfArc: 80, chainAt: 0.4 },
  light3: { windup: 0.2, active: 0.15, recover: 0.5, damage: 1.7, poise: 2.5, stamina: 24, lunge: 8, arc: 'wide', reach: 2.9, halfArc: 115, chainAt: 1 },
  heavy: { windup: 0.1, active: 0.15, recover: 0.55, damage: 2.3, poise: 4, stamina: 32, lunge: 8, arc: 'overhead', reach: 2.9, halfArc: 55, chainAt: 1 },
};

const COMBO: AttackKind[] = ['light1', 'light2', 'light3'];
const BUFFER = 0.3; // a press is remembered this long
const MIN_CHARGE = 0.12;
const FULL_CHARGE = 0.7;

export interface AttackState {
  kind: AttackKind;
  def: AttackDef;
  t: number;
  id: number;
  power: number; // heavy attacks: 1..1.6 with charge
  hits: Set<unknown>;
}

export class PlayerCombat {
  attack: AttackState | null = null;
  charge = -1; // seconds the heavy attack has been held, or -1
  private stats: PlayerStats;
  private combo = 0;
  private buffered = 0; // seconds left on a buffered light press
  private nextId = 0;

  constructor(stats: PlayerStats) {
    this.stats = stats;
  }

  get def() {
    return this.attack?.def ?? null;
  }

  get phase(): Phase | null {
    const a = this.attack;
    if (!a) return null;
    if (a.t < a.def.windup) return 'windup';
    if (a.t < a.def.windup + a.def.active) return 'active';
    return 'recover';
  }

  // 0..1 through the current phase
  get phaseProgress() {
    const a = this.attack;
    if (!a) return 0;
    const d = a.def;
    if (a.t < d.windup) return a.t / d.windup;
    if (a.t < d.windup + d.active) return (a.t - d.windup) / d.active;
    return Math.min(1, (a.t - d.windup - d.active) / d.recover);
  }

  get chargeLevel() {
    return this.charge < 0 ? -1 : Math.min(1, this.charge / FULL_CHARGE);
  }

  get busy() {
    return !!this.attack || this.charge >= 0;
  }

  // a roll may cancel the recovery (not the wind-up or the hit itself), or a charge
  get canRoll() {
    return !this.attack || this.phase === 'recover';
  }

  cancel() {
    this.attack = null;
    this.charge = -1;
    this.buffered = 0;
    this.combo = 0;
  }

  // `light`: the light button was pressed this frame; `heavyDown`: the heavy button is held.
  // Returns the attack that started this frame, if any.
  update(dt: number, light: boolean, heavyDown: boolean, canAct: boolean): AttackState | null {
    let started: AttackState | null = null;
    if (light && canAct) this.buffered = BUFFER;
    this.buffered = Math.max(0, this.buffered - dt);

    // heavy: charge while held, strike on release
    if (canAct && heavyDown && !this.attack && this.charge < 0 && this.stats.stamina > 0) this.charge = 0;
    if (this.charge >= 0) {
      this.charge += dt;
      if (!heavyDown || this.charge > 1.3) {
        const power = 1 + 0.6 * Math.min(1, Math.max(0, this.charge - MIN_CHARGE) / (FULL_CHARGE - MIN_CHARGE));
        this.charge = -1;
        started = this.start('heavy', power);
      }
    }

    const a = this.attack;
    if (a) {
      a.t += dt;
      const d = a.def;
      const rec = (a.t - d.windup - d.active) / d.recover;
      // chain the next light attack from the second half of the recovery
      if (this.buffered > 0 && rec >= d.chainAt && a.kind !== 'heavy' && this.combo < COMBO.length) {
        this.buffered = 0;
        started = this.start(COMBO[this.combo]);
      } else if (a.t >= d.windup + d.active + d.recover) {
        this.attack = null;
        this.combo = 0;
      }
    }
    if (!this.attack && this.charge < 0 && this.buffered > 0 && canAct) {
      this.buffered = 0;
      started = this.start(COMBO[0]);
    }
    return started;
  }

  private start(kind: AttackKind, power = 1): AttackState | null {
    const def = ATTACKS[kind];
    if (!this.stats.spend(def.stamina)) {
      this.attack = null;
      this.combo = 0;
      return null;
    }
    this.combo = kind === 'heavy' ? 0 : COMBO.indexOf(kind) + 1;
    this.attack = { kind, def, t: 0, id: ++this.nextId, power, hits: new Set() };
    return this.attack;
  }
}

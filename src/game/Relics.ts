// Relics: small run modifiers found in chests and lairs. You choose 1 of 3; they last the run.

export type RelicId =
  | 'emberheart'
  | 'deepflask'
  | 'boots'
  | 'featherroll'
  | 'whetstone'
  | 'fang'
  | 'magnet'
  | 'thornmail'
  | 'secondwind'
  | 'flametrail'
  | 'longblade'
  | 'tilefinder';

export interface Relic {
  id: RelicId;
  name: string;
  desc: string;
  color: number;
}

export const RELICS: Record<RelicId, Relic> = {
  emberheart: { id: 'emberheart', name: 'Ember Heart', desc: '+1 heart', color: 0xff5470 },
  deepflask: { id: 'deepflask', name: 'Deep Flask', desc: '+1 flask charge', color: 0xffa24a },
  boots: { id: 'boots', name: 'Swift Boots', desc: 'Walk 15% faster', color: 0x7ec8e8 },
  featherroll: { id: 'featherroll', name: 'Feather Step', desc: 'Stepping costs 40% less stamina', color: 0xd8f0ff },
  whetstone: { id: 'whetstone', name: 'Whetstone', desc: 'Sword +0.5 damage', color: 0xb8c2cc },
  fang: { id: 'fang', name: 'Hungry Fang', desc: 'Every third kill heals a heart', color: 0xc83a5a },
  magnet: { id: 'magnet', name: 'Ember Magnet', desc: '+50% embers from enemies', color: 0xff8a2a },
  thornmail: { id: 'thornmail', name: 'Thorn Mail', desc: 'Enemies that hit you take 1 damage', color: 0x5aa844 },
  secondwind: { id: 'secondwind', name: 'Second Wind', desc: 'The first time you fall, get up with 1 heart', color: 0xfff0a0 },
  flametrail: { id: 'flametrail', name: 'Flame Trail', desc: 'Stepping through enemies burns them', color: 0xff6a10 },
  longblade: { id: 'longblade', name: 'Long Blade', desc: 'Sword reaches 25% further', color: 0x9aa8b8 },
  tilefinder: { id: 'tilefinder', name: 'Cartographer', desc: 'Chests give +1 tile', color: 0xf1dea4 },
};

// three different relics you don't have yet (fewer if you have almost all)
export function relicChoice(owned: RelicId[]): RelicId[] {
  const pool = (Object.keys(RELICS) as RelicId[]).filter((r) => !owned.includes(r));
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, 3);
}

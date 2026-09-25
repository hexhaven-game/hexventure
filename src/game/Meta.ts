// What carries over between runs: Memories (earned by clearing areas, cleansing the Blight,
// beating lairs and the boss) spent at the Hearthstone on permanent unlocks, and the highest
// Blight level you have unlocked (harder runs, more memories).

export type UnlockId = 'stack' | 'keepsake' | 'hearth' | 'embers';

export const UNLOCKS: Record<UnlockId, { name: string; desc: string; cost: number }> = {
  stack: { name: 'Bigger Stack', desc: 'Start every run with 2 more tiles', cost: 25 },
  hearth: { name: 'Warm Hearth', desc: '+1 flask charge, every run', cost: 35 },
  embers: { name: 'Ember Purse', desc: 'Start every run with 60 embers', cost: 30 },
  keepsake: { name: 'Keepsake', desc: 'Start every run with a relic of your choice', cost: 50 },
};

export interface MetaData {
  memories: number;
  unlocks: UnlockId[];
  runs: number;
  wins: number;
  maxBlight: number; // highest Blight level you may start a run at
}

const KEY = 'hexadventure-meta';

export const Meta = {
  read(): MetaData {
    try {
      const d = JSON.parse(localStorage.getItem(KEY) ?? 'null');
      if (d && typeof d.memories === 'number') return { memories: 0, unlocks: [], runs: 0, wins: 0, maxBlight: 0, ...d };
    } catch {
      /* storage unavailable */
    }
    return { memories: 0, unlocks: [], runs: 0, wins: 0, maxBlight: 0 };
  },

  write(d: MetaData) {
    try {
      localStorage.setItem(KEY, JSON.stringify(d));
    } catch {
      /* storage unavailable */
    }
  },

  update(fn: (d: MetaData) => void) {
    const d = Meta.read();
    fn(d);
    Meta.write(d);
    return d;
  },

  has(id: UnlockId) {
    return Meta.read().unlocks.includes(id);
  },
};

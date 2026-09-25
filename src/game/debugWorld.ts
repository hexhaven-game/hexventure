import type { TileSave } from './SaveSystem';

// A ready-built world with a bit of everything, for testing: meadows, forests (slimes and chests),
// water with two bridges, hills with cliffs. Also the backdrop of the title screen.
const t = (q: number, r: number, type: TileSave['type'], rot = 0, extra: Partial<TileSave> = {}): TileSave => ({
  q,
  r,
  type,
  rot,
  chest: type === 'forest',
  opened: false,
  enemy: type === 'forest',
  bridge: null,
  ...extra,
});

export const DEBUG_WORLD: TileSave[] = [
  t(0, 0, 'home'),
  t(1, 0, 'forest', 1),
  t(1, -1, 'meadow', 2),
  t(0, -1, 'hill'),
  t(-1, 0, 'hill', 3),
  t(-1, 1, 'meadow', 4),
  t(0, 1, 'water', 0, { bridge: 2 }), // home <-> south meadow
  t(0, 2, 'meadow', 5),
  t(1, 1, 'water', 0, { bridge: 1 }), // east forest <-> south meadow
  t(2, 0, 'forest', 3),
  t(2, -1, 'forest', 5, { chest: false }),
  t(-1, 2, 'forest', 2),
  t(-2, 2, 'water'),
  t(-2, 1, 'hill', 1),
  t(1, 2, 'meadow', 3),
  t(2, 1, 'forest', 4),
  t(-1, 3, 'meadow', 1),
];

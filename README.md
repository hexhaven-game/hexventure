# Hexventure

A playable prototype: a roguelike run mixed with soulslike combat, in a world you build from hex
tiles as you go.
Three.js + TypeScript + Vite, with a fixed, slightly top-down miniature camera. All graphics are
simple low-poly placeholders made in code.

Live: https://hexhaven-game.github.io/hexventure/ (deployed by GitHub Actions on every push to `main`).

## Run

```bash
npm install
npm run dev      # http://localhost:5201
npm run build    # type check + production build into dist/
```

## The loop

A roguelike run, soulslike fights, and a world you build yourself:

1. **Build.** You start at your hearth (the home tile, with a campfire). Bottom right is your stack
   of tiles; you hold three. Place them next to your land. The further a tile is from home, the
   more dangerous it is.
2. **Explore and fight.** Stamina for swings and dodge rolls (with invulnerability), a flask with
   three heals, enemies with readable wind-ups.
3. **Earn.** Enemies drop embers. Beating everything on a tile earns a new tile. Chests give tiles
   and embers. Lairs (miniboss tiles) give World Fragments.
4. **Die, souls-style.** Your embers stay where you fell and you wake at the hearth; get back to
   them before you die again. Resting at the campfire heals and refills the flask, but the
   enemies return.
5. **Grow.** Spend embers at a Shrine tile: more hearts, more stamina, a stronger sword.
6. **Win the run.** Three fragments put the Boss tile in your hand. Place it far from home and beat
   the Hollow King.

Bridges, stairs, lairs and the boss only come into your hand when there is a place for them.

### Enemies

| Enemy | Where | How it fights | How to beat it |
| --- | --- | --- | --- |
| Slime | forests, meadows | hops closer, winds up, lunges | the basic one |
| Bat | forests, water (danger 1+) | circles you, then dives | time your swing |
| Husk | forests (danger 2+) | slow knight, long wind-up, heavy swing, not staggered by hits | roll aside, hit the recovery |
| Boar | meadows (danger 2+) | scrapes, then charges straight | dodge so it hits a tree or cliff: it is stunned |
| Thornspitter | danger 2–3 | rooted plant that spits thorns | roll through the thorns or get close |
| Grove Warden (miniboss) | lair | giant husk; leaps and slams (red ring) | stay mobile |
| Slime King (miniboss) | lair | jumps onto a marked spot, sheds slimes | watch the ring |
| The Hollow King (boss) | boss tile | crowned Warden; enrages at half health and calls bats | everything above |

## Controls

| Play mode | | Build mode | |
| --- | --- | --- | --- |
| WASD / arrows | move | 1–3 or click | pick a tile from your hand |
| Space | sword | mouse | the tile follows the cursor and hovers over a free spot |
| Shift / right-click | dodge roll | R / right-click | rotate the tile 60° |
| Q | drink from the flask | click | drop it |
| E | rest, use a shrine, open a chest | WASD, wheel | pan, zoom |
| Tab | build mode | Tab | back to play |
| Esc | pause (save, load, title) | | |
| F3 | debug view | | |

## Title screen, saves and the debug world

- The title screen shows the debug world assembling itself; the camera slowly circles it. The
  version number opens the changelog (the same `CHANGELOG.md` as in this repo).
- **New world** starts a run. **Debug world** starts in a ready-built world with every tile and
  enemy type, a shrine, a lair and the boss arena, plus 300 embers. Handy for testing.
- The game autosaves (after building, fights, chests, resting, switching modes and every 20
  seconds). **Esc** opens the pause menu with Save (3 slots) and Load.

## Performance

- Once a tile has landed, all its props are merged into one mesh (one draw call per tile); the
  bridge is one mesh too. The debug world renders in about 180 draw calls, shadows included.
- Trees in front of the player are thinned out in the shader (dithered to 25%), so the merged
  meshes can stay merged.
- The resolution drops a step when frames get slow and goes back up when there is room again.
- F3 shows FPS, frame time, pixel ratio, draw calls and triangles.

## Tuning

Everything worth tweaking is in [`src/game/config.ts`](src/game/config.ts): hex size, elevation,
water level, player speed, both cameras (FOV 30, pitch, distance), the placement animation and the
chest chance.

## Code layout

```text
src/
  game/        Game.ts (main loop, modes, the run), config.ts, Deck.ts, SaveSystem.ts, debugWorld.ts
  world/       HexGrid.ts (axial coords: hexToWorld, worldToHex, getNeighbors), HexTile.ts,
               TileFactory.ts (terrain, shores, decoration), props.ts, Bridge.ts, Chest.ts,
               Collision.ts (ground height per hex, step/cliff check, circle colliders),
               bake.ts (merges props into one mesh), stairs.ts, EmberPile.ts
  player/      Player.ts (model + procedural animation), PlayerController.ts (move, roll, flask),
               PlayerStats.ts (hearts, stamina, embers, levels)
  camera/      PlayCameraController.ts, BuildCameraController.ts
  build/       BuildController.ts, TilePreview.ts, GridOverlay.ts
  combat/      CombatSystem.ts, Projectiles.ts, spawns.ts (who lives where),
               enemies/ (Enemy base + Slime, Bat, Husk, Boar, Spitter, Warden, SlimeKing, HollowKing)
  rendering/   Environment.ts, Lighting.ts, Particles.ts, Rings.ts, Occlusion.ts, WaterMaterial.ts,
               LandingMaterial.ts
  input/       InputManager.ts
  ui/          HUD.ts, Menu.ts (title, pause, save/load), DebugView.ts
```

In dev mode the game is available in the console as `window.game`.

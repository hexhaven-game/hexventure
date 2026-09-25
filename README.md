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

A roguelike run, soulslike fights, and a world you build yourself. It is designed to keep asking
something new of you from the first tile to the boss:

1. **Build (choices that matter).** Bottom right is your stack of tiles, as in Hexhaven: each time
   you choose 1 of 3. Where you put it matters:
   - every third forest in a forest is a **Deep Forest** (chest + elite),
   - every second hill in a range gets a **chest on top** (reach it with stairs),
   - meadows by the water (**Riverbank**) make the shrine cheaper,
   - new patches can come with a **goal** (grow it to 3–5 for two tiles).
   The further from home, the more dangerous.
2. **Explore and fight.** Stamina for swings and dodge rolls (with invulnerability), a flask, and
   enemies with readable wind-ups. Elites (Swift, Armoured, Splitting) show up further out.
3. **Earn.** Clearing a tile gives a tile; chests give tiles or, further out, a **relic** (1 of 3,
   for this run); lairs give World Fragments and a relic.
4. **Pressure: the Blight.** Every few tiles (and every rest) it takes a tile at the edge of your
   land: all elites there. Cleansing it pays well. It keeps you moving and stops safe farming.
5. **Die, souls-style.** Your embers stay where you fell; get back to them before you die again.
   Resting heals and refills the flask, but the enemies return (and the Blight ticks).
6. **Grow.** Spend embers at a Shrine: hearts, stamina, sword.
7. **Win the run.** Three fragments make the Boss tile appear among your choices. Place it far out
   and beat the Hollow King.
8. **Between runs: the Hearthstone.** Memories (from clearing, cleansing, lairs and the boss) buy
   permanent unlocks, and a win unlocks a higher Blight level: harder, faster, more memories.

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
| Rockling | hills (danger 1+) | throws stones, slams the ground up close (red ring) | fight it on the hilltop, dodge the stones |
| Marsh Wisp | water (danger 1+) | floats over the water, keeps its distance, fires slow orbs | catch it near the shore |
| The Hollow King (boss) | boss tile | crowned Warden; enrages at half health and calls bats | everything above |

Any enemy can be an **elite**: Swift (faster), Armoured (takes less damage, much more health) or
Splitting (breaks into slimes). Elites have a coloured ring, a health bar and drop double embers.

## Controls

| Play mode | | Build mode | |
| --- | --- | --- | --- |
| WASD / arrows | move | 1–3 or click | choose one of three tiles |
| mouse | aim (the hero faces the cursor) | mouse | the tile follows the cursor and hovers over a free spot |
| click / Space | attack: a three-hit combo, in rhythm | R / right-click | rotate the tile 60° |
| hold R | charged heavy attack | click | drop it |
| right mouse | guard; press as a hit lands to deflect | WASD, wheel | pan, zoom |
| Shift | step (a quick dodge; cancels an attack's recovery) | | |
| F | lock on | Tab | back to play |
| Q | drink from the flask | | |
| E | rest, use a shrine, open a chest | | |
| Tab / Esc / F3 | build mode / pause / debug view | | |

### Combat

Every attack has a wind-up, a short active moment (the only time it hits) and a recovery you
are committed to. Light attacks chain into a combo from the second half of the recovery, and
only one press is remembered, so rhythm matters, not mashing. Hits cause a brief hit-stop and
camera shake. Enemies have poise: wear it down and they are broken for a moment, and the next
hit is a critical. A white glint warns you just before an enemy attacks.

Defence works like Sekiro: hold right mouse to guard (blocks cost stamina, your posture; at zero
the guard breaks). Press it just as a hit lands to **deflect**: no damage, and a big hit to the
attacker's poise, so deflecting well is the fastest way to break an enemy. Attacks marked with a
red ring on the ground can't be blocked; step out of them.

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
  game/        Game.ts (main loop, modes, the run), config.ts, Deck.ts, Synergy.ts, Relics.ts,
               Meta.ts (between runs), SaveSystem.ts, debugWorld.ts
  world/       HexGrid.ts (axial coords: hexToWorld, worldToHex, getNeighbors), HexTile.ts,
               TileFactory.ts (terrain, shores, decoration), props.ts, Bridge.ts, Chest.ts,
               Collision.ts (ground height per hex, step/cliff check, circle colliders),
               bake.ts (merges props into one mesh), stairs.ts, EmberPile.ts
  player/      Player.ts (model + procedural animation), PlayerController.ts (move, roll, flask),
               PlayerStats.ts (hearts, stamina, embers, levels)
  camera/      PlayCameraController.ts, BuildCameraController.ts
  build/       BuildController.ts, TilePreview.ts, GridOverlay.ts
  combat/      CombatSystem.ts, Projectiles.ts, spawns.ts (who lives where),
               enemies/ (Enemy base with elites + Slime, Bat, Husk, Boar, Spitter, Rockling, Wisp,
               Warden, SlimeKing, HollowKing)
  rendering/   Environment.ts, Lighting.ts, Particles.ts, Rings.ts, Occlusion.ts, WaterMaterial.ts,
               LandingMaterial.ts
  input/       InputManager.ts
  ui/          HUD.ts, Menu.ts (title, pause, save/load), DebugView.ts
```

In dev mode the game is available in the console as `window.game`.

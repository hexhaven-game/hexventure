# Hexventure

A small playable prototype of one idea: **place hex tiles → a world appears → walk through it**.
Three.js + TypeScript + Vite, with a fixed, slightly top-down miniature camera. All graphics are
simple low-poly placeholders made in code.

Live: https://hexhaven-game.github.io/hexventure/ (deployed by GitHub Actions on every push to `main`).

## Run

```bash
npm install
npm run dev      # http://localhost:5201
npm run build    # type check + production build into dist/
```

## Controls

| Play mode | | Build mode | |
| --- | --- | --- | --- |
| WASD / arrows | move | 1–5 or click | pick Meadow, Forest, Water, Hill, Bridge |
| Space | sword | mouse | hover a free hex: the tile floats there |
| E | open a chest | R / right-click | rotate the tile 60° |
| Tab | build mode | click | place |
| Esc | pause (save, load, title) | | |
| F3 | debug view | WASD, wheel | pan, zoom |
| | | Tab | back to play |

## Title screen, saves and the debug world

- The title screen shows the debug world assembling itself; the camera slowly circles it.
- **New world** starts with one home tile. **Debug world** starts in a ready-built world with every
  tile type, two bridges, five forests with slimes and chests. Handy for testing.
- The game autosaves (after building, opening a chest, beating a slime, switching modes and every
  20 seconds). **Continue** picks up the autosave; **Esc** opens the pause menu with Save (3 slots)
  and Load. Saves live in the browser's localStorage.

## What's in it

- One home tile to start; tiles can only go next to existing ones (unlimited tiles).
- Meadow, Forest (with a slime and sometimes a chest; the first forest always has one), Water
  (not walkable, lower, with a sandy shore) and Hill (one level up, rocky cliffs you can't climb).
- Bridge: only on a water tile with land on two opposite sides; it turns to fit and is walkable.
- Tiles rise out of the ground and their props pop in, with a ring of dust.
- In play mode there are no outlines or markers; grass, forest floor and sand are coloured in
  world space so neighbouring tiles read as one landscape.
- Trees and the house fade to 25% when they hide the player.
- Three hearts, a sword swing, a slime with 2 HP (idle → chase → wind up → lunge), knockback,
  hit flash and particles. Fainting sends you home with full hearts.

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
  game/        Game.ts (main loop, modes, placing), config.ts, SaveSystem.ts, debugWorld.ts
  world/       HexGrid.ts (axial coords: hexToWorld, worldToHex, getNeighbors), HexTile.ts,
               TileFactory.ts (terrain, shores, decoration), props.ts, Bridge.ts, Chest.ts,
               Collision.ts (ground height per hex, step/cliff check, circle colliders),
               bake.ts (merges props into one mesh)
  player/      Player.ts (model + procedural animation), PlayerController.ts
  camera/      PlayCameraController.ts, BuildCameraController.ts
  build/       BuildController.ts, TilePreview.ts, GridOverlay.ts
  combat/      Enemy.ts, CombatSystem.ts
  rendering/   Environment.ts, Lighting.ts, Particles.ts, Occlusion.ts, WaterMaterial.ts
  input/       InputManager.ts
  ui/          HUD.ts, Menu.ts (title, pause, save/load), DebugView.ts
```

In dev mode the game is available in the console as `window.game`.

import * as THREE from 'three';
import { BuildController, BUILD_OPTIONS, type BuildOption } from '../build/BuildController';
import { GridOverlay } from '../build/GridOverlay';
import { TilePreview } from '../build/TilePreview';
import { BuildCameraController } from '../camera/BuildCameraController';
import { PlayCameraController } from '../camera/PlayCameraController';
import { CombatSystem } from '../combat/CombatSystem';
import { InputManager } from '../input/InputManager';
import { Player } from '../player/Player';
import { PlayerController } from '../player/PlayerController';
import { Environment } from '../rendering/Environment';
import { Lighting } from '../rendering/Lighting';
import { Occlusion } from '../rendering/Occlusion';
import { Particles } from '../rendering/Particles';
import { DebugView } from '../ui/DebugView';
import { HUD } from '../ui/HUD';
import { Menu } from '../ui/Menu';
import { clamp, dampFactor, easeOutBack, easeOutCubic, hashString, mulberry32, TAU } from '../utils/math';
import { createBridge } from '../world/Bridge';
import { Chest } from '../world/Chest';
import { WorldCollision } from '../world/Collision';
import { HexGrid, directionAngle, hexKey, worldToHex, type HexCoord } from '../world/HexGrid';
import type { HexTile, TileType } from '../world/HexTile';
import { TileFactory } from '../world/TileFactory';
import { bakeDecor } from '../world/bake';
import { BRIDGE_Y, CHEST_CHANCE, HEX_RADIUS, PLACE_ANIM, PLAYER, WATER_BED, WATER_LEVEL } from './config';
import { DEBUG_WORLD } from './debugWorld';
import { SaveSystem, type SaveData, type Slot, type TileSave } from './SaveSystem';

type Mode = 'title' | 'play' | 'build';

interface Rising {
  tile: HexTile;
  t: number; // starts below 0 for a delayed rise
  landed: boolean;
}

interface BridgeRise {
  tile: HexTile;
  object: THREE.Object3D;
  dir: number;
  t: number;
}

interface PlaceOptions {
  instant?: boolean;
  delay?: number; // seconds before it starts rising
  chest?: boolean; // from a save; otherwise decided by chestFor()
  enemy?: boolean;
  opened?: boolean;
}

const AUTOSAVE_EVERY = 20; // seconds

export class Game {
  private env: Environment;
  private lighting: Lighting;
  private input: InputManager;
  private hud = new HUD();
  private menu: Menu;
  private grid = new HexGrid();
  private factory: TileFactory;
  private collision: WorldCollision;
  private particles: Particles;
  private occlusion = new Occlusion();
  private player = new Player();
  private controller: PlayerController;
  private playCam = new PlayCameraController();
  private buildCam = new BuildCameraController();
  private overlay: GridOverlay;
  private preview: TilePreview;
  private build: BuildController;
  private combat: CombatSystem;
  private debugView: DebugView;
  private chests: Chest[] = [];
  private rising: Rising[] = [];
  private bridges: BridgeRise[] = [];

  private mode: Mode = 'title';
  private paused = false;
  private inGame = false; // a world is being played (the title backdrop is not)
  private transition = 0; // seconds left of a slow camera move (mode changes, title -> play)
  private camPos = new THREE.Vector3();
  private camLook = new THREE.Vector3();
  private wantPos = new THREE.Vector3();
  private wantLook = new THREE.Vector3();
  private orbit = 0.6;
  private timer = new THREE.Timer();
  private time = 0;
  private forests = 0;
  private fragments = 0;
  private home: HexTile | null = null;
  private debug = false;
  private fps = 60;
  private downTimer = -1;
  private autosaveTimer = AUTOSAVE_EVERY;
  private held: { id: string; tile: HexTile } | null = null; // the tile floating under the cursor

  constructor(container: HTMLElement) {
    this.env = new Environment(container);
    this.lighting = new Lighting(this.env.scene);
    this.input = new InputManager(this.env.renderer.domElement);
    this.factory = new TileFactory(this.grid);
    this.collision = new WorldCollision(this.grid);
    this.particles = new Particles(this.env.scene);
    this.controller = new PlayerController(this.player, this.input, this.collision);
    this.overlay = new GridOverlay(this.env.scene);
    this.preview = new TilePreview(this.env.scene);
    this.debugView = new DebugView(this.env.scene);
    this.build = new BuildController({
      grid: this.grid,
      overlay: this.overlay,
      preview: this.preview,
      input: this.input,
      camera: this.env.camera,
      previewTile: (coord, type, rotation) => this.previewTile(coord, type, rotation),
      place: (coord, option, rotation) => {
        if (option === 'bridge') this.placeBridge(coord);
        else this.placeTile(coord, option, rotation);
        this.autosave();
      },
    });
    this.combat = new CombatSystem({
      scene: this.env.scene,
      player: this.player,
      controller: this.controller,
      collision: this.collision,
      particles: this.particles,
      onHearts: (n) => this.hud.setHearts(n, PLAYER.maxHearts),
      onDown: () => {
        this.downTimer = 1.1;
        this.hud.message('You fainted… back home you go.');
      },
      onKill: (e) => {
        const tile = this.grid.tiles.get(e.tileKey);
        if (tile) tile.enemyAlive = false;
        this.autosave();
      },
    });
    this.menu = new Menu({
      canResume: () => this.inGame,
      resume: () => this.enterPlay(),
      newWorld: () => this.startNew(),
      debugWorld: () => this.startDebug(),
      load: (slot) => this.load(slot),
      save: (slot) => this.save(slot),
      toTitle: () => this.toTitle(),
    });
    this.hud.onSelect = (o) => this.select(o);
    this.hud.setHearts(this.combat.hearts, PLAYER.maxHearts);
    this.hud.setSelected(this.build.selected);

    this.env.scene.add(this.player.root);
    this.player.root.visible = false;

    // title screen: the debug world assembles itself in rings behind the menu
    this.buildWorld(DEBUG_WORLD, true);
    this.titleCamera(0, this.camPos, this.camLook);
    this.menu.showTitle();

    window.addEventListener('beforeunload', () => this.autosave());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.autosave();
    });
  }

  start() {
    const loop = () => {
      this.frame();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  // ---------- worlds: new, debug, save, load ----------
  private clearWorld() {
    this.dropHeld();
    this.build.exit();
    for (const t of this.grid.tiles.values()) {
      this.env.scene.remove(t.group);
      this.factory.dispose(t);
    }
    this.grid.tiles.clear();
    this.combat.clear();
    this.particles.clear();
    this.chests = [];
    this.rising = [];
    this.bridges = [];
    this.forests = 0;
    this.fragments = 0;
    this.home = null;
    this.downTimer = -1;
    if (this.debug) this.debugView.rebuild([]);
  }

  // builds tiles from a list (a save or the debug world); `rise` animates them in rings
  private buildWorld(tiles: TileSave[], rise: boolean) {
    for (const s of tiles) {
      const tile = this.placeTile({ q: s.q, r: s.r }, s.type, s.rot, {
        instant: !rise,
        delay: rise ? 0.25 + Math.hypot(s.q + s.r / 2, s.r) * 0.28 + Math.random() * 0.15 : 0,
        chest: s.chest,
        enemy: s.enemy,
        opened: s.opened,
      });
      if (s.bridge !== null) this.addBridge(tile, s.bridge);
    }
    this.home = [...this.grid.tiles.values()].find((t) => t.type === 'home') ?? null;
  }

  private startNew() {
    this.clearWorld();
    this.placeTile({ q: 0, r: 0 }, 'home', 0, { delay: 0.2 });
    this.home = this.grid.get({ q: 0, r: 0 })!;
    this.beginGame(this.home.playerSpawn!, 0, PLAYER.maxHearts);
    this.hud.message('Press Tab to build your world', 3);
  }

  private startDebug() {
    this.clearWorld();
    this.buildWorld(DEBUG_WORLD, false);
    this.beginGame(this.home!.playerSpawn!, 0, PLAYER.maxHearts);
    this.hud.message('Debug world', 1.6);
  }

  private load(slot: Slot) {
    const d = SaveSystem.read(slot);
    if (!d) return;
    this.clearWorld();
    this.buildWorld(d.tiles, false);
    this.forests = d.forests;
    this.fragments = d.fragments;
    const at = new THREE.Vector3(d.player.x, 0, d.player.z);
    at.y = this.collision.groundAt(at.x, at.z) ?? 0;
    this.beginGame(at, d.player.yaw, d.hearts);
  }

  private beginGame(at: THREE.Vector3, yaw: number, hearts: number) {
    this.inGame = true;
    this.player.root.visible = true;
    this.controller.teleport(at);
    this.player.root.rotation.y = yaw;
    this.combat.hearts = hearts;
    this.hud.setHearts(hearts, PLAYER.maxHearts);
    this.autosaveTimer = AUTOSAVE_EVERY;
    this.enterPlay();
    this.transition = 2.2; // a longer glide down from the title view
  }

  private serialize(): SaveData {
    const p = this.player.root.position;
    return {
      v: 1,
      savedAt: Date.now(),
      tiles: [...this.grid.tiles.values()].map((t) => ({
        q: t.coord.q,
        r: t.coord.r,
        type: t.type,
        rot: t.rotation,
        chest: t.hasChest,
        opened: t.chestOpened,
        enemy: t.enemyAlive,
        bridge: t.bridgeDir ?? (t.bridgePending ? this.bridges.find((b) => b.tile === t)?.dir ?? null : null),
      })),
      player: { x: p.x, z: p.z, yaw: this.player.root.rotation.y },
      hearts: Math.max(1, this.combat.hearts),
      forests: this.forests,
      fragments: this.fragments,
    };
  }

  private save(slot: Slot) {
    return this.inGame && SaveSystem.write(slot, this.serialize());
  }

  private autosave() {
    if (this.inGame) this.save('auto');
    this.autosaveTimer = AUTOSAVE_EVERY;
  }

  // ---------- placing ----------
  // the first forest always has a chest; after that it depends on the spot (so the preview matches)
  private chestFor(coord: HexCoord, type: TileType) {
    return type === 'forest' && (this.forests === 0 || mulberry32(hashString(`${hexKey(coord)}:chest`))() < CHEST_CHANCE);
  }

  previewTile(coord: HexCoord, type: TileType, rotation: number): HexTile {
    const id = `${hexKey(coord)}|${type}|${rotation}`;
    if (this.held?.id === id) return this.held.tile;
    this.dropHeld();
    const tile = this.factory.create(coord, type, { chest: this.chestFor(coord, type), rotation });
    this.held = { id, tile };
    return tile;
  }

  private dropHeld() {
    if (!this.held) return;
    this.preview.release(this.held.tile);
    this.factory.dispose(this.held.tile);
    this.held = null;
  }

  placeTile(coord: HexCoord, type: TileType, rotation = 0, opts: PlaceOptions = {}): HexTile {
    let tile: HexTile;
    if (opts.chest === undefined && this.held?.id === `${hexKey(coord)}|${type}|${rotation}`) {
      tile = this.held.tile; // exactly the tile you were looking at
      this.preview.release(tile);
      this.held = null;
    } else {
      this.dropHeld();
      tile = this.factory.create(coord, type, { chest: opts.chest ?? this.chestFor(coord, type), rotation });
    }
    if (type === 'forest') this.forests++;
    tile.enemyAlive = !!tile.enemySpawn && opts.enemy !== false;
    this.grid.add(tile);
    this.env.scene.add(tile.group);
    this.factory.refreshAround(tile);
    if (tile.chestSpawn) {
      const c = new Chest(tile.chestSpawn.clone(), tile.center, Math.atan2(-tile.chestSpawn.x, -tile.chestSpawn.z), tile.key);
      if (opts.opened) {
        c.open(true);
        tile.chestOpened = true;
      }
      tile.group.add(c.object);
      tile.decor.push({ object: c.object, scale: c.object.scale.clone(), delay: 0.5 });
      tile.colliders.push(c.collider);
      this.chests.push(c);
    }
    if (opts.instant) {
      tile.ready = true;
      bakeDecor(tile);
      if (tile.enemyAlive) this.combat.spawnEnemy(tile.enemySpawn!, tile.key, false);
    } else {
      for (const d of tile.decor) d.object.scale.setScalar(0.0001);
      tile.group.position.y = -6;
      this.rising.push({ tile, t: -(opts.delay ?? 0) / PLACE_ANIM, landed: false });
    }
    if (this.debug) this.debugView.rebuild(this.grid.tiles.values());
    return tile;
  }

  // a bridge that is simply there (loading a save, the debug world)
  private addBridge(tile: HexTile, dir: number) {
    const b = createBridge();
    b.rotation.y = -directionAngle(dir);
    tile.group.add(b);
    tile.bridgeDir = dir;
  }

  placeBridge(coord: HexCoord) {
    const tile = this.grid.get(coord);
    if (!tile) return;
    const dir = this.grid.bridgeDirection(tile);
    if (dir === null) return;
    const b = createBridge();
    b.rotation.y = -directionAngle(dir);
    b.position.y = WATER_BED - 1;
    b.scale.set(0.3, 1, 1);
    tile.group.add(b);
    tile.bridgePending = true; // walkable once it has risen
    this.bridges.push({ tile, object: b, dir, t: 0 });
    this.particles.burst(tile.center.clone().setY(WATER_LEVEL + 0.2), [0xffffff, 0x9be7f2], 30, 6, 0.16, 3);
  }

  private updatePlacements(dt: number) {
    this.rising = this.rising.filter((r) => {
      r.t += dt / PLACE_ANIM;
      if (r.t < 0) return true;
      const k = clamp(r.t, 0, 1);
      // rise with a small overshoot, then the props pop up one after another
      r.tile.group.position.y = -6 * (1 - easeOutBack(Math.min(1, k * 1.25)));
      for (const d of r.tile.decor) {
        const local = clamp((k - d.delay) / 0.3, 0, 1);
        d.object.scale.copy(d.scale).multiplyScalar(Math.max(0.0001, easeOutBack(local)));
      }
      if (!r.landed && k > 0.62) {
        r.landed = true;
        this.dustRing(r.tile);
      }
      if (k >= 1) {
        r.tile.group.position.y = 0;
        r.tile.ready = true;
        bakeDecor(r.tile);
        if (r.tile.enemyAlive) this.combat.spawnEnemy(r.tile.enemySpawn!, r.tile.key);
        return false;
      }
      return true;
    });
    this.bridges = this.bridges.filter((b) => {
      b.t += dt / 0.55;
      const k = clamp(b.t, 0, 1);
      b.object.position.y = (WATER_BED - 1) * (1 - easeOutBack(k));
      b.object.scale.x = 0.3 + 0.7 * easeOutCubic(k);
      if (k >= 1) {
        b.object.position.y = 0;
        b.object.scale.x = 1;
        b.tile.bridgeDir = b.dir;
        b.tile.bridgePending = false;
        this.particles.burst(b.tile.center.clone().setY(BRIDGE_Y + 0.3), [0xb07a48, 0xf1dea4], 16, 4, 0.14);
        return false;
      }
      return true;
    });
  }

  private dustRing(tile: HexTile) {
    const y = tile.groundHeight + 0.3;
    const colors = tile.type === 'water' ? [0xffffff, 0x9be7f2] : [0xc9a77a, 0x9edd62, 0xf1dea4];
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * TAU;
      const r = HEX_RADIUS * 0.85;
      this.particles.spawn({
        pos: new THREE.Vector3(tile.center.x + Math.cos(a) * r, y, tile.center.z + Math.sin(a) * r),
        vel: new THREE.Vector3(Math.cos(a) * 3, 2 + Math.random() * 2, Math.sin(a) * 3),
        color: colors[i % colors.length],
        size: 0.25 + Math.random() * 0.2,
        life: 0.6 + Math.random() * 0.4,
        gravity: 5,
      });
    }
  }

  // ---------- modes ----------
  private enterPlay() {
    this.menu.hideTitle();
    this.build.exit();
    this.dropHeld();
    this.mode = 'play';
    this.paused = false;
    this.lighting.setExtent(38);
    this.playCam.snap(this.player.root.position);
    this.transition = 1.2;
    this.hud.setMode('play');
  }

  private enterBuild() {
    this.mode = 'build';
    this.buildCam.enter(this.player.root.position);
    this.build.enter();
    this.lighting.setExtent(110);
    this.transition = 1.2;
    this.hud.setMode('build');
    this.updateBuildNote();
  }

  private toTitle() {
    this.autosave();
    this.build.exit();
    this.dropHeld();
    this.mode = 'title';
    this.paused = false;
    this.transition = 2;
    this.hud.setPrompt(null);
    this.lighting.setExtent(110);
    this.menu.showTitle();
  }

  private pause() {
    this.paused = true;
    this.menu.showPause(() => {
      this.paused = false;
    });
  }

  private select(o: BuildOption) {
    this.build.select(o);
    this.hud.setSelected(o);
    this.updateBuildNote();
  }

  private updateBuildNote() {
    const n = this.build.bridgeTargets;
    this.hud.setBuildNote(
      n === 0 ? 'A bridge needs a water tile with land on two opposite sides.' : n > 0 ? 'Click a highlighted water tile.' : '',
    );
  }

  // slow orbit around the world; the world sits to the right of the menu
  private titleCamera(dt: number, outPos: THREE.Vector3, outLook: THREE.Vector3) {
    this.orbit += dt * 0.05;
    const tiles = [...this.grid.tiles.values()];
    const center = new THREE.Vector3();
    for (const t of tiles) center.add(t.center);
    if (tiles.length) center.divideScalar(tiles.length);
    let extent = HEX_RADIUS;
    for (const t of tiles) extent = Math.max(extent, t.center.distanceTo(center) + HEX_RADIUS);
    const d = 30 + extent * 2.4;
    const pitch = THREE.MathUtils.degToRad(40);
    outPos.set(Math.sin(this.orbit) * Math.cos(pitch) * d, Math.sin(pitch) * d, Math.cos(this.orbit) * Math.cos(pitch) * d).add(center);
    const right = new THREE.Vector3(Math.cos(this.orbit), 0, -Math.sin(this.orbit));
    outLook.copy(center).addScaledVector(right, -extent * 0.55);
  }

  // ---------- frame ----------
  private frame() {
    this.timer.update();
    const dt = Math.min(this.timer.getDelta(), 1 / 20);
    this.time += dt;
    this.fps += (1 / Math.max(dt, 1e-4) - this.fps) * 0.05;
    const input = this.input;

    if (input.wasPressed('Escape')) {
      if (this.menu.modalOpen) this.menu.closeModal();
      else if (this.mode === 'build') this.enterPlay();
      else if (this.mode === 'play') this.pause();
    }
    if (input.wasPressed('F3')) {
      this.debug = !this.debug;
      this.debugView.group.visible = this.debug;
      if (this.debug) this.debugView.rebuild(this.grid.tiles.values());
    }
    const active = this.mode !== 'title' && !this.paused && !this.menu.modalOpen;
    if (active && input.wasPressed('Tab')) {
      if (this.mode === 'play') this.enterBuild();
      else this.enterPlay();
      this.autosave();
    }

    let moving = 0;
    if (this.mode === 'play') {
      const canAct = active && this.downTimer < 0;
      if (active) {
        moving = this.controller.update(dt, this.env.camera, canAct);
        if (canAct && input.wasPressed('Space')) this.combat.attack();
        this.combat.update(dt);
        this.updateChests(canAct);
        if (this.downTimer >= 0) {
          this.downTimer -= dt;
          if (this.downTimer < 0) this.respawn();
        }
        this.autosaveTimer -= dt;
        if (this.autosaveTimer <= 0) this.autosave();
      }
      this.playCam.update(dt, this.player.root.position);
      this.playCam.desired(this.wantPos, this.wantLook);
      input.consumeClick();
    } else if (this.mode === 'build') {
      if (active) {
        for (let i = 0; i < BUILD_OPTIONS.length; i++) if (input.wasPressed(`Digit${i + 1}`)) this.select(BUILD_OPTIONS[i]);
        this.buildCam.update(dt, input);
        this.build.update(dt);
      }
      this.buildCam.desired(this.wantPos, this.wantLook);
      this.hud.setPrompt(null);
      this.updateBuildNote();
    } else {
      this.titleCamera(dt, this.wantPos, this.wantLook);
      input.consumeClick();
    }

    this.player.animate(dt, moving, this.combat.invulnerable > 0);
    for (const c of this.chests) c.update(dt);
    this.updatePlacements(dt);
    this.factory.update(this.time);
    this.particles.update(dt);

    // camera: glide slowly while switching modes, otherwise follow tightly
    this.transition = Math.max(0, this.transition - dt);
    // (the play camera already eases after the player, so here it can follow almost directly)
    const rate = this.transition > 0 ? 2.6 : this.mode === 'title' ? 4 : this.mode === 'play' ? 40 : 14;
    this.camPos.lerp(this.wantPos, dampFactor(rate, dt));
    this.camLook.lerp(this.wantLook, dampFactor(rate, dt));
    this.env.camera.position.copy(this.camPos);
    this.env.camera.lookAt(this.camLook);

    const chestHeight = this.player.root.position.clone().setY(this.player.root.position.y + 1);
    this.occlusion.update(this.env.camera.position, chestHeight, dt, this.mode === 'play');
    this.lighting.update(this.mode === 'play' ? this.player.root.position : this.camLook);
    this.overlay.visible = this.mode === 'build' || (this.debug && this.mode !== 'title');

    if (this.debug) this.showDebug();
    else this.hud.setDebug(null);

    this.env.adapt(dt);
    this.env.render();
    input.endFrame();
  }

  private updateChests(canAct: boolean) {
    const p = this.player.root.position;
    let near: Chest | null = null;
    for (const c of this.chests) {
      if (c.opened) continue;
      if (Math.hypot(c.worldPosition.x - p.x, c.worldPosition.z - p.z) < 2.4) near = c;
    }
    this.hud.setPrompt(near ? 'E  Open chest' : null);
    if (near && canAct && this.input.wasPressed('KeyE')) {
      near.open();
      const tile = this.grid.tiles.get(near.tileKey);
      if (tile) tile.chestOpened = true;
      this.fragments++;
      const at = near.worldPosition.clone().setY(near.worldPosition.y + 1);
      this.particles.burst(at, [0xffe27a, 0xffffff, 0xf0c040], 30, 4, 0.14, 6);
      this.hud.message(this.fragments > 1 ? `You found a World Fragment! (${this.fragments})` : 'You found a World Fragment!');
      this.autosave();
    }
  }

  private respawn() {
    if (this.home?.playerSpawn) this.controller.teleport(this.home.playerSpawn);
    this.playCam.snap(this.player.root.position);
    this.combat.resetHearts();
  }

  private showDebug() {
    const p = this.player.root.position;
    const h = worldToHex(p.x, p.z);
    const t = this.grid.get(h);
    const c = this.env.camera.position;
    this.hud.setDebug(
      [
        `FPS      ${this.fps.toFixed(0)}`,
        `mode     ${this.mode}${this.paused ? ' (paused)' : ''}`,
        `player   ${p.x.toFixed(1)}, ${p.y.toFixed(2)}, ${p.z.toFixed(1)}`,
        `hex      ${h.q}, ${h.r}  ${t ? t.type : 'empty'}`,
        `camera   ${c.x.toFixed(1)}, ${c.y.toFixed(1)}, ${c.z.toFixed(1)}`,
        `tiles    ${this.grid.tiles.size}   enemies ${this.combat.enemies.length}`,
        `frame    ${(1000 / this.fps).toFixed(1)} ms   pixel ratio ${this.env.pixelRatio.toFixed(2)}`,
        `draws    ${this.env.renderer.info.render.calls}   tris ${(this.env.renderer.info.render.triangles / 1000).toFixed(0)}k`,
      ].join('\n'),
    );
  }
}

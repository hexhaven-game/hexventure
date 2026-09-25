import * as THREE from 'three';
import { BuildController, type Target } from '../build/BuildController';
import { GridOverlay } from '../build/GridOverlay';
import { TilePreview, type HeldState } from '../build/TilePreview';
import { BuildCameraController } from '../camera/BuildCameraController';
import { PlayCameraController } from '../camera/PlayCameraController';
import { CombatSystem } from '../combat/CombatSystem';
import type { Enemy } from '../combat/enemies/Enemy';
import { dangerOf, planSpawns } from '../combat/spawns';
import { InputManager } from '../input/InputManager';
import { Player } from '../player/Player';
import { PlayerController } from '../player/PlayerController';
import { PlayerStats } from '../player/PlayerStats';
import { Environment } from '../rendering/Environment';
import { Lighting } from '../rendering/Lighting';
import { Occlusion } from '../rendering/Occlusion';
import { Particles } from '../rendering/Particles';
import { Rings } from '../rendering/Rings';
import { Thumbs } from '../rendering/Thumbs';
import { DebugView } from '../ui/DebugView';
import { HUD } from '../ui/HUD';
import { Menu } from '../ui/Menu';
import { clamp, dampFactor, easeOutBack, easeOutCubic, hashString, mulberry32, TAU } from '../utils/math';
import { bakeDecor } from '../world/bake';
import { createBridge } from '../world/Bridge';
import { Chest } from '../world/Chest';
import { WorldCollision } from '../world/Collision';
import { EmberPile } from '../world/EmberPile';
import {
  DIRECTIONS,
  HexGrid,
  INNER_RADIUS,
  directionAngle,
  hexKey,
  neighbor,
  worldToHex,
  type HexCoord,
} from '../world/HexGrid';
import type { HexTile, TileType } from '../world/HexTile';
import { TileFactory } from '../world/TileFactory';
import { BRIDGE_Y, BUILD_CAMERA, CHEST_CHANCE, HEX_RADIUS, PLACE_ANIM, PLAY_CAMERA, RUN, STAMINA, WATER_BED, WATER_LEVEL } from './config';
import { DEBUG_WORLD } from './debugWorld';
import { Deck, type Card } from './Deck';
import { SaveSystem, type SaveData, type Slot, type TileSave } from './SaveSystem';

type Mode = 'title' | 'play' | 'build';

interface Rising {
  tile: HexTile;
  t: number; // starts below 0 for a delayed rise
  landed: boolean;
  from: HeldState | null; // dropped from the hand (Hexhaven-style), otherwise it rises from below
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
  opened?: boolean;
  stairs?: number | null;
  cleared?: boolean;
  from?: HeldState | null;
}

const AUTOSAVE_EVERY = 20; // seconds
const USE_RANGE = 2.6;

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
  private rings: Rings;
  private occlusion = new Occlusion();
  private player = new Player();
  private stats = new PlayerStats();
  private deck = new Deck();
  private thumbs: Thumbs;
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
  private animated: THREE.Object3D[] = []; // campfire flames, shrine crystals
  private pile: EmberPile | null = null;

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
  private frames = 0;
  private forests = 0;
  private fragments = 0;
  private placed = 0;
  private won = false;
  private handIndex = 0;
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
    this.thumbs = new Thumbs(this.factory);
    this.collision = new WorldCollision(this.grid);
    this.particles = new Particles(this.env.scene);
    this.rings = new Rings(this.env.scene);
    this.controller = new PlayerController(this.player, this.input, this.collision, this.stats);
    this.overlay = new GridOverlay(this.env.scene);
    this.preview = new TilePreview(this.env.scene);
    this.debugView = new DebugView(this.env.scene);
    this.build = new BuildController({
      grid: this.grid,
      overlay: this.overlay,
      preview: this.preview,
      input: this.input,
      camera: this.env.camera,
      targets: (card) => this.targetsFor(card),
      previewTile: (coord, type, rotation) => this.previewTile(coord, type, rotation),
      place: (coord, card, rotation, dir) => this.playCard(coord, card, rotation, dir),
    });
    this.combat = new CombatSystem({
      scene: this.env.scene,
      player: this.player,
      controller: this.controller,
      stats: this.stats,
      collision: this.collision,
      particles: this.particles,
      rings: this.rings,
      onHurt: () => {},
      onDown: () => this.die(),
      onKill: (e) => this.onKill(e),
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
    this.hud.onSelect = (i) => this.selectCard(i);
    this.deck.canUse = (c) => this.targetsFor(c).length > 0;

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
    this.rings.clear();
    if (this.pile) this.env.scene.remove(this.pile.object);
    this.pile = null;
    this.chests = [];
    this.rising = [];
    this.bridges = [];
    this.animated = [];
    this.forests = 0;
    this.fragments = 0;
    this.placed = 0;
    this.won = false;
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
        opened: s.opened,
        stairs: s.stairs ?? null,
        cleared: s.cleared,
      });
      if (s.bridge !== null) this.addBridge(tile, s.bridge);
    }
    this.home = [...this.grid.tiles.values()].find((t) => t.type === 'home') ?? null;
  }

  private startNew() {
    this.clearWorld();
    this.stats.reset();
    this.placeTile({ q: 0, r: 0 }, 'home', 0, { delay: 0.2 });
    this.home = this.grid.get({ q: 0, r: 0 })!;
    this.deck = Deck.fresh((c) => this.targetsFor(c).length > 0);
    this.beginGame(this.home.playerSpawn!, 0);
    this.hud.message('Press Tab to build: choose 1 of 3 tiles each time', 3.2);
  }

  private startDebug() {
    this.clearWorld();
    this.stats.reset();
    this.stats.embers = 300; // enough to try the shrine
    this.buildWorld(DEBUG_WORLD, false);
    this.deck = Deck.fresh((c) => this.targetsFor(c).length > 0);
    this.beginGame(this.home!.playerSpawn!, 0);
    this.hud.message('Debug world · 300 embers to spend at the shrine', 2.4);
  }

  private load(slot: Slot) {
    const d = SaveSystem.read(slot);
    if (!d) return;
    this.clearWorld();
    this.stats.reset();
    this.stats.level = { ...d.stats.level };
    this.stats.restore();
    this.stats.hearts = Math.max(1, d.stats.hearts);
    this.stats.flasks = d.stats.flasks;
    this.stats.embers = d.stats.embers;
    this.deck = new Deck();
    this.deck.canUse = (c) => this.targetsFor(c).length > 0;
    this.buildWorld(d.tiles, false);
    this.deck.count = d.deck.count;
    this.deck.offer = [...d.deck.offer];
    this.deck.boss = !!d.deck.boss;
    this.deck.recheck();
    this.forests = d.forests;
    this.fragments = d.fragments;
    this.won = !!d.won;
    if (d.pile) this.dropPile(new THREE.Vector3(d.pile.x, this.collision.groundAt(d.pile.x, d.pile.z) ?? 0, d.pile.z), d.pile.embers);
    const at = new THREE.Vector3(d.player.x, 0, d.player.z);
    at.y = this.collision.groundAt(at.x, at.z) ?? 0;
    this.beginGame(at, d.player.yaw);
  }

  private beginGame(at: THREE.Vector3, yaw: number) {
    this.inGame = true;
    this.player.root.visible = true;
    this.controller.teleport(at);
    this.player.root.rotation.y = yaw;
    this.handIndex = 0;
    this.autosaveTimer = AUTOSAVE_EVERY;
    this.enterPlay();
    this.transition = 2.2; // a longer glide down from the title view
  }

  private serialize(): SaveData {
    const p = this.player.root.position;
    return {
      v: 3,
      savedAt: Date.now(),
      tiles: [...this.grid.tiles.values()].map((t) => ({
        q: t.coord.q,
        r: t.coord.r,
        type: t.type,
        rot: t.rotation,
        chest: t.hasChest,
        opened: t.chestOpened,
        bridge: t.bridgeDir ?? (t.bridgePending ? this.bridges.find((b) => b.tile === t)?.dir ?? null : null),
        stairs: t.stairsDir,
        cleared: t.cleared,
      })),
      player: { x: p.x, z: p.z, yaw: this.player.root.rotation.y },
      stats: { level: { ...this.stats.level }, hearts: this.stats.hearts, flasks: this.stats.flasks, embers: this.stats.embers },
      deck: { count: this.deck.count, offer: [...this.deck.offer], boss: this.deck.boss },
      pile: this.pile ? { x: this.pile.object.position.x, z: this.pile.object.position.z, embers: this.pile.embers } : null,
      forests: this.forests,
      fragments: this.fragments,
      won: this.won,
    };
  }

  private save(slot: Slot) {
    return this.inGame && SaveSystem.write(slot, this.serialize());
  }

  private autosave() {
    if (this.inGame && this.downTimer < 0) this.save('auto');
    this.autosaveTimer = AUTOSAVE_EVERY;
  }

  // ---------- where cards can go ----------
  private targetsFor(card: Card): Target[] {
    const out: Target[] = [];
    if (card === 'bridge') {
      for (const t of this.grid.tiles.values()) {
        if (t.type !== 'water' || t.bridgeDir !== null || t.bridgePending || !t.ready) continue;
        const dirs = [0, 1, 2].filter((d) => this.flatLand(neighbor(t.coord, d)) && this.flatLand(neighbor(t.coord, d + 3)));
        if (dirs.length) out.push({ coord: t.coord, dirs });
      }
      return out;
    }
    if (card === 'stairs') {
      for (const t of this.grid.tiles.values()) {
        if (t.type !== 'hill' || t.stairsDir !== null || !t.ready) continue;
        const dirs = DIRECTIONS.map((_, d) => d).filter((d) => this.stairsFit(t, d));
        if (dirs.length) out.push({ coord: t.coord, dirs });
      }
      return out;
    }
    const minDanger = card === 'lair' ? 2 : card === 'boss' ? 3 : 0;
    for (const c of this.grid.emptySlots()) {
      if ((Math.abs(c.q) + Math.abs(c.r) + Math.abs(c.q + c.r)) / 2 >= minDanger) out.push({ coord: c });
    }
    return out;
  }

  private flatLand(c: HexCoord) {
    const t = this.grid.get(c);
    return !!t && t.ready && t.isLand && t.elevation === 0;
  }

  // stairs need flat land in front, with room to step off (no tree right at the foot)
  private stairsFit(hill: HexTile, dir: number) {
    const below = this.grid.get(neighbor(hill.coord, dir));
    if (!below || !this.flatLand(below.coord)) return false;
    const a = directionAngle(dir);
    const foot = new THREE.Vector3(hill.center.x + Math.cos(a) * (INNER_RADIUS + 1.6), 0, hill.center.z + Math.sin(a) * (INNER_RADIUS + 1.6));
    return below.colliders.every((c) =>
      c.kind === 'circle'
        ? Math.hypot(c.x - foot.x, c.z - foot.z) > c.r + 1.4
        : foot.x < c.minX - 1.4 || foot.x > c.maxX + 1.4 || foot.z < c.minZ - 1.4 || foot.z > c.maxZ + 1.4,
    );
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
    if (this.held.tile.group.parent) this.preview.holdTile(null);
    this.factory.dispose(this.held.tile);
    this.held = null;
  }

  // keep a sensible choice selected: the same slot if possible, else the first usable option
  private pickCard() {
    const offer = this.deck.offer;
    if (this.deck.empty || !offer.length) {
      this.build.select(null);
      return;
    }
    if (!(this.handIndex < offer.length && this.deck.canUse(offer[this.handIndex]))) {
      this.handIndex = Math.max(0, offer.findIndex((c) => this.deck.canUse(c)));
    }
    this.build.select(offer[this.handIndex] ?? null);
  }

  private selectCard(i: number) {
    if (i < 0 || i >= this.deck.offer.length || !this.deck.canUse(this.deck.offer[i])) return;
    this.handIndex = i;
    this.build.select(this.deck.offer[i]);
  }

  private playCard(coord: HexCoord, card: Card, rotation: number, dir: number | null) {
    if (card === 'bridge') this.placeBridge(coord, dir ?? 0);
    else if (card === 'stairs') this.placeStairs(coord, dir ?? 0);
    else {
      const id = `${hexKey(coord)}|${card}|${rotation}`;
      const from = this.held?.id === id ? this.preview.take(this.held.tile) : null;
      this.placeTile(coord, card, rotation, { from });
    }
    this.placed++;
    this.deck.take(this.handIndex);
    this.pickCard();
    if (this.deck.empty) this.hud.message('No tiles left: clear areas and open chests to find more', 3.2);
    this.autosave();
  }

  placeTile(coord: HexCoord, type: TileType, rotation = 0, opts: PlaceOptions = {}): HexTile {
    let tile: HexTile;
    if (opts.chest === undefined && this.held?.id === `${hexKey(coord)}|${type}|${rotation}`) {
      tile = this.held.tile; // exactly the tile you were looking at
      this.held = null;
    } else {
      this.dropHeld();
      tile = this.factory.create(coord, type, { chest: opts.chest ?? this.chestFor(coord, type), rotation, stairs: opts.stairs ?? null });
    }
    if (type === 'forest') this.forests++;
    tile.cleared = !!opts.cleared;
    this.grid.add(tile);
    if (!tile.group.parent) this.env.scene.add(tile.group);
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
    tile.group.traverse((o) => {
      if (o.userData.anim) this.animated.push(o);
    });
    // who lives here (lairs and the boss arena stay empty once beaten)
    tile.spawns = (tile.type === 'lair' || tile.type === 'boss') && tile.cleared ? [] : planSpawns(tile);
    if (opts.instant) {
      tile.ready = true;
      bakeDecor(tile);
      this.combat.spawnFor(tile, false);
    } else if (opts.from) {
      this.rising.push({ tile, t: 0, landed: false, from: opts.from });
    } else {
      for (const d of tile.decor) d.object.scale.setScalar(0.0001);
      tile.group.position.y = -6;
      this.rising.push({ tile, t: -(opts.delay ?? 0) / PLACE_ANIM, landed: false, from: null });
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

  placeBridge(coord: HexCoord, dir: number) {
    const tile = this.grid.get(coord);
    if (!tile) return;
    const b = createBridge();
    b.rotation.y = -directionAngle(dir);
    b.position.y = WATER_BED - 1;
    b.scale.set(0.3, 1, 1);
    tile.group.add(b);
    tile.bridgePending = true; // walkable once it has risen
    this.bridges.push({ tile, object: b, dir, t: 0 });
    this.particles.burst(tile.center.clone().setY(WATER_LEVEL + 0.2), [0xffffff, 0x9be7f2], 30, 6, 0.16, 3);
  }

  // stairs rebuild the hill with a slope cut into the chosen side
  private placeStairs(coord: HexCoord, dir: number) {
    const old = this.grid.get(coord);
    if (!old || old.type !== 'hill') return;
    this.env.scene.remove(old.group);
    this.factory.dispose(old);
    const tile = this.factory.create(coord, 'hill', { rotation: old.rotation, stairs: dir });
    tile.cleared = old.cleared;
    tile.ready = true;
    this.grid.add(tile);
    this.env.scene.add(tile.group);
    this.factory.refreshAround(tile);
    bakeDecor(tile);
    const a = directionAngle(dir);
    const foot = tile.center.clone().add(new THREE.Vector3(Math.cos(a) * (INNER_RADIUS - 3), 1.2, Math.sin(a) * (INNER_RADIUS - 3)));
    this.particles.burst(foot, [0xb9b2a2, 0xa9a292, 0xf1dea4], 30, 6, 0.2, 4);
    this.rings.shock(foot.clone().setY(0), 4, 0xf1dea4);
    if (this.debug) this.debugView.rebuild(this.grid.tiles.values());
  }

  private updatePlacements(dt: number) {
    this.rising = this.rising.filter((r) => {
      const g = r.tile.group;
      const c = r.tile.center;
      if (r.from) {
        // dropped from the hand: fall, then squash and bounce (as in Hexhaven)
        r.t += dt / 0.45;
        const k = clamp(r.t, 0, 1);
        const f = r.from;
        const fall = Math.min(1, k / 0.55);
        const e = fall * fall;
        g.position.set(c.x + (f.pos.x - c.x) * (1 - e), 0, c.z + (f.pos.z - c.z) * (1 - e));
        g.rotation.set(f.rot.x * (1 - e), f.rot.y * (1 - e), f.rot.z * (1 - e));
        if (k < 0.55) {
          g.position.y = f.pos.y * (1 - e);
          const s = f.scale + (1 - f.scale) * e;
          g.scale.set(s * 0.97, s * 1.03, s * 0.97);
        } else {
          if (!r.landed) {
            r.landed = true;
            this.dustRing(r.tile);
            this.rings.shock(new THREE.Vector3(c.x, r.tile.groundHeight, c.z), HEX_RADIUS * 1.05);
          }
          const b = (k - 0.55) / 0.45;
          const wob = Math.sin(b * Math.PI * 2.5) * (1 - b);
          g.position.y = Math.max(0, Math.sin(b * Math.PI) * 0.6 * (1 - b));
          g.scale.set(1 + wob * 0.05, 1 - wob * 0.09, 1 + wob * 0.05);
        }
      } else {
        r.t += dt / PLACE_ANIM;
        if (r.t < 0) return true;
        const k = clamp(r.t, 0, 1);
        // rise with a small overshoot, then the props pop up one after another
        g.position.y = -6 * (1 - easeOutBack(Math.min(1, k * 1.25)));
        for (const d of r.tile.decor) {
          const local = clamp((k - d.delay) / 0.3, 0, 1);
          d.object.scale.copy(d.scale).multiplyScalar(Math.max(0.0001, easeOutBack(local)));
        }
        if (!r.landed && k > 0.62) {
          r.landed = true;
          this.dustRing(r.tile);
        }
      }
      if (r.t >= 1) {
        g.position.copy(c);
        g.rotation.set(0, 0, 0);
        g.scale.setScalar(1);
        r.tile.ready = true;
        bakeDecor(r.tile);
        if (this.inGame) this.combat.spawnFor(r.tile);
        this.deck.recheck();
        if (this.mode === 'build') this.pickCard();
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

  // ---------- fighting, dying, resting ----------
  private onKill(e: Enemy) {
    this.stats.embers += e.embers;
    const tile = this.grid.tiles.get(e.tileKey);
    if (!tile) return;
    if (e.bossName && tile.type === 'lair') {
      tile.cleared = true;
      tile.spawns = [];
      this.fragments++;
      this.hud.banner('World Fragment obtained');
      if (this.fragments >= RUN.fragmentsToWin && !this.deck.boss && !this.won) {
        this.deck.boss = true;
        if (this.deck.count <= 0) this.deck.count = 1;
        this.deck.deal();
        this.hud.message('The Hollow King stirs. The Boss tile is one of your choices: place it far from home.', 4.5);
      } else this.hud.message(`${this.fragments} of ${RUN.fragmentsToWin} fragments`, 2.6);
    } else if (e.bossName && tile.type === 'boss') {
      tile.cleared = true;
      tile.spawns = [];
      this.won = true;
      this.hud.banner('Victory');
      window.setTimeout(() => {
        this.paused = true;
        this.menu.showWin(
          `You broke the Hollow King's hold in ${this.placed} tiles, at level ${this.stats.totalLevel + 1}.`,
          () => this.startNew(),
          () => {
            this.paused = false;
          },
        );
      }, 1800);
    } else if (!tile.cleared && tile.spawns.length && !this.combat.aliveOn(tile.key)) {
      tile.cleared = true;
      this.deck.add(1);
      this.hud.banner('Area cleared');
      this.hud.message('+1 tile in your stack', 2);
    }
    this.autosave();
  }

  private die() {
    this.downTimer = 2.2;
    this.hud.banner('You died', 'bad');
    // your embers stay where you fell; an older pile is lost
    if (this.pile) {
      this.env.scene.remove(this.pile.object);
      this.pile = null;
    }
    if (this.stats.embers > 0) this.dropPile(this.player.root.position.clone(), this.stats.embers);
    this.stats.embers = 0;
  }

  private dropPile(at: THREE.Vector3, embers: number) {
    this.pile = new EmberPile(at, embers);
    this.env.scene.add(this.pile.object);
  }

  // Resting heals you and refills the flask, but everything you killed comes back.
  private rest(message = true) {
    this.stats.restore();
    this.combat.clear();
    for (const t of this.grid.tiles.values()) if (t.ready) this.combat.spawnFor(t, false);
    if (message) this.hud.message('You rest by the fire. The enemies have returned.', 2.6);
    this.autosave();
  }

  private respawn() {
    this.player.root.rotation.x = 0;
    if (this.home?.playerSpawn) this.controller.teleport(this.home.playerSpawn);
    this.playCam.snap(this.player.root.position);
    this.rest(false);
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
    this.pickCard();
    this.build.enter();
    this.lighting.setExtent(110);
    this.transition = 1.2;
    this.hud.setMode('build');
  }

  private toTitle() {
    this.autosave();
    this.build.exit();
    this.dropHeld();
    this.mode = 'title';
    this.paused = false;
    this.transition = 2;
    this.hud.setPrompt(null);
    this.hud.setBoss(null);
    this.lighting.setExtent(110);
    this.menu.showTitle();
  }

  private pause() {
    this.paused = true;
    this.menu.showPause(() => {
      this.paused = false;
    });
  }

  private buildNote() {
    const card = this.deck.offer[this.handIndex];
    if (this.deck.empty || !card) return 'No tiles left. Clear areas and open chests to find more.';
    if (this.build.targetCount === 0) {
      if (card === 'lair') return 'A lair must go at least two tiles from home.';
      if (card === 'boss') return 'The boss must go at least three tiles from home.';
      return 'Nowhere to put this one yet.';
    }
    if (card !== 'bridge' && card !== 'stairs') return 'Choose 1 tile to place';
    if (card === 'bridge') return 'Click a highlighted water tile.';
    if (card === 'stairs') return 'Click a highlighted hill, near the side the stairs should face.';
    return '';
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
    if (active && input.wasPressed('Tab') && this.downTimer < 0) {
      if (this.mode === 'play') this.enterBuild();
      else this.enterPlay();
      this.autosave();
    }

    let moving = 0;
    if (this.mode === 'play') {
      const canAct = active && this.downTimer < 0;
      if (active) {
        moving = this.controller.update(dt, this.env.camera, canAct);
        if (canAct && input.wasPressed('Space') && this.controller.free && !this.player.attacking && this.stats.spend(STAMINA.attack)) {
          this.player.startAttack();
        }
        this.stats.update(dt);
        this.combat.update(dt);
        this.interactions(canAct);
        if (this.downTimer >= 0) {
          // fall over
          this.player.root.rotation.x += (-1.45 - this.player.root.rotation.x) * Math.min(1, dt * 6);
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
        for (let i = 0; i < 4; i++) if (input.wasPressed(`Digit${i + 1}`)) this.selectCard(i);
        this.buildCam.update(dt, input);
        this.build.update(dt);
      }
      this.buildCam.desired(this.wantPos, this.wantLook);
      this.hud.setPrompt(null);
      this.hud.setBuildNote(this.buildNote());
    } else {
      this.titleCamera(dt, this.wantPos, this.wantLook);
      input.consumeClick();
    }

    const roll = this.controller.rolling ? this.controller.rollT / 0.42 : -1;
    this.player.animate(dt, moving, this.combat.invulnerable > 0, roll, this.controller.drinking);
    for (const c of this.chests) c.update(dt);
    for (const o of this.animated) {
      if (o.userData.anim === 'flame') o.scale.set(1 + Math.sin(this.time * 17) * 0.08, 0.85 + Math.random() * 0.3, 1 + Math.cos(this.time * 13) * 0.08);
      else {
        o.rotation.y += dt * 0.8;
        o.position.y = 2.2 + Math.sin(this.time * 2) * 0.15;
      }
    }
    this.pile?.update(dt);
    this.updatePlacements(dt);
    this.factory.update(this.time);
    this.particles.update(dt);
    this.rings.update(dt);

    // camera: glide slowly while switching modes, otherwise follow tightly
    this.transition = Math.max(0, this.transition - dt);
    // (the play camera already eases after the player, so here it can follow almost directly)
    const rate = this.transition > 0 ? 2.6 : this.mode === 'title' ? 4 : this.mode === 'play' ? 40 : 14;
    this.camPos.lerp(this.wantPos, dampFactor(rate, dt));
    this.camLook.lerp(this.wantLook, dampFactor(rate, dt));
    this.env.camera.position.copy(this.camPos);
    this.env.camera.lookAt(this.camLook);
    const fov = this.mode === 'build' ? BUILD_CAMERA.fov : PLAY_CAMERA.fov;
    if (Math.abs(this.env.camera.fov - fov) > 0.01) {
      this.env.camera.fov += (fov - this.env.camera.fov) * dampFactor(4, dt);
      this.env.camera.updateProjectionMatrix();
    }

    const chestHeight = this.player.root.position.clone().setY(this.player.root.position.y + 1);
    this.occlusion.update(this.env.camera.position, chestHeight, dt, this.mode === 'play');
    this.lighting.update(this.mode === 'play' ? this.player.root.position : this.camLook);
    this.overlay.visible = this.mode === 'build' || (this.debug && this.mode !== 'title');

    if (this.inGame) {
      this.hud.setVitals(this.stats);
      this.hud.setCurrency(this.stats.embers, this.fragments, RUN.fragmentsToWin);
      this.hud.setDeck(this.deck.offer, this.deck.count, this.mode === 'build' ? this.handIndex : -1, this.mode === 'build', (c) => this.deck.canUse(c), this.thumbs);
      this.updateBossBar();
    }
    if (this.debug) this.showDebug();
    else this.hud.setDebug(null);

    this.env.adapt(dt);
    this.env.render();
    input.endFrame();
    // show the page once the world has been drawn (no flash of an empty page)
    if (++this.frames === 3) document.body.classList.add('ready');
  }

  private updateBossBar() {
    const p = this.player.root.position;
    const boss = this.mode === 'play'
      ? this.combat.enemies.find((e) => e.bossName && e.alive && e.state !== 'idle' && e.root.position.distanceTo(p) < 24)
      : undefined;
    this.hud.setBoss(boss?.bossName ?? null, boss?.hp, boss?.maxHp);
  }

  // E: open a chest, rest at the campfire, use a shrine; walking over your ember pile takes it back
  private interactions(canAct: boolean) {
    const p = this.player.root.position;
    const near = (v: THREE.Vector3 | null) => !!v && Math.hypot(v.x - p.x, v.z - p.z) < USE_RANGE && Math.abs(v.y - p.y) < 1.5;

    if (this.pile && this.downTimer < 0 && Math.hypot(this.pile.object.position.x - p.x, this.pile.object.position.z - p.z) < 1.4) {
      this.stats.embers += this.pile.embers;
      this.particles.burst(this.pile.object.position.clone().setY(p.y + 1), [0xffb040, 0xff6a10, 0xffffff], 24, 4, 0.14, 4);
      this.hud.message(`Recovered ${this.pile.embers} embers`, 2);
      this.env.scene.remove(this.pile.object);
      this.pile = null;
      this.autosave();
    }

    let prompt: string | null = null;
    let use: (() => void) | null = null;
    const chest = this.chests.find((c) => !c.opened && near(c.worldPosition));
    const tile = this.grid.get(worldToHex(p.x, p.z));
    if (chest) {
      prompt = 'E  Open chest';
      use = () => this.openChest(chest);
    } else if (this.home && near(this.home.interact)) {
      prompt = 'E  Rest at the campfire';
      use = () => this.rest();
    } else if (tile?.type === 'shrine' && near(tile.interact)) {
      prompt = 'E  Use the shrine';
      use = () => {
        this.paused = true;
        this.menu.showShrine(
          this.stats,
          (k) => {
            if (this.stats.levelUp(k)) this.autosave();
          },
          () => {
            this.paused = false;
          },
        );
      };
    }
    this.hud.setPrompt(prompt);
    if (use && canAct && this.input.wasPressed('KeyE')) use();
  }

  private openChest(chest: Chest) {
    chest.open();
    const tile = this.grid.tiles.get(chest.tileKey);
    if (tile) tile.chestOpened = true;
    const far = tile ? dangerOf(tile) >= 2 : false;
    const tiles = far ? 3 : 2;
    const embers = far ? 60 : 30;
    this.deck.add(tiles);
    this.stats.embers += embers;
    const at = chest.worldPosition.clone().setY(chest.worldPosition.y + 1);
    this.particles.burst(at, [0xffe27a, 0xffffff, 0xf0c040], 30, 4, 0.14, 6);
    this.hud.message(`Treasure: +${tiles} tiles, +${embers} embers`);
    this.autosave();
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
        `hex      ${h.q}, ${h.r}  ${t ? `${t.type} · danger ${dangerOf(t)}` : 'empty'}`,
        `camera   ${c.x.toFixed(1)}, ${c.y.toFixed(1)}, ${c.z.toFixed(1)}`,
        `tiles    ${this.grid.tiles.size}   enemies ${this.combat.enemies.length}   tiles left ${this.deck.count}`,
        `frame    ${(1000 / this.fps).toFixed(1)} ms   pixel ratio ${this.env.pixelRatio.toFixed(2)}`,
        `draws    ${this.env.renderer.info.render.calls}   tris ${(this.env.renderer.info.render.triangles / 1000).toFixed(0)}k`,
      ].join('\n'),
    );
  }
}

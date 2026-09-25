import * as THREE from 'three';
import { HEX_RADIUS, TILE_BASE, WATER_BED, WATER_LEVEL } from '../game/config';
import { createWaterMaterial } from '../rendering/WaterMaterial';
import { fbm, hash2, hashString, mulberry32, smoothstep } from '../utils/math';
import {
  DIRECTIONS,
  HexGrid,
  INNER_RADIUS,
  directionAngle,
  distanceToEdge,
  edgeCorners,
  hexCorners,
  hexToWorld,
  insideHex,
  neighbor,
  type HexCoord,
} from './HexGrid';
import { HexTile, type Collider, type TileType } from './HexTile';
import {
  COLORS, blightCrystal, bush, campfire, deadTree, flowers, grass, house, lilyPad, rock, shrine, stairSteps, standingStone, tree,
  type Prop,
} from './props';
import { STAIRS, stairsHeight } from './stairs';

type V3 = [number, number, number];

// push a triangle whose winding faces `n`
function pushTri(pos: number[], a: V3, b: V3, c: V3, n: V3) {
  const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const cx = e1[1] * e2[2] - e1[2] * e2[1];
  const cy = e1[2] * e2[0] - e1[0] * e2[2];
  const cz = e1[0] * e2[1] - e1[1] * e2[0];
  if (cx * n[0] + cy * n[1] + cz * n[2] < 0) pos.push(...a, ...c, ...b);
  else pos.push(...a, ...b, ...c);
}
const UP: V3 = [0, 1, 0];

// a flat hexagon split into many small triangles, so vertex colours can vary smoothly
function hexTop(y: number, n: number, radius = HEX_RADIUS): THREE.BufferGeometry {
  const corners = hexCorners(radius);
  const pos: number[] = [];
  for (let i = 0; i < 6; i++) {
    const A = corners[i];
    const B = corners[(i + 1) % 6];
    const P = (a: number, b: number): V3 => [((a * A.x + b * B.x) / n), y, (a * A.z + b * B.z) / n];
    for (let a = 0; a < n; a++) {
      for (let b = 0; a + b < n; b++) {
        pushTri(pos, P(a, b), P(a + 1, b), P(a, b + 1), UP);
        if (a + b + 1 < n) pushTri(pos, P(a + 1, b), P(a + 1, b + 1), P(a, b + 1), UP);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const count = pos.length / 3;
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(count).fill([0, 1, 0]).flat(), 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(new Array(count * 3).fill(1), 3));
  return g;
}

interface Band {
  from: number;
  to: number;
  top: number;
  bottom: number;
}

// Vertical sides of a tile, in horizontal colour bands. With `gapDir`, that side is split around
// the stairs: there the wall only starts at ground level.
function sides(dirs: number[], bands: Band[], gapDir: number | null = null): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const ct = new THREE.Color();
  const cb = new THREE.Color();
  const segments: [THREE.Vector3, THREE.Vector3, number, Band[]][] = [];
  for (const d of dirs) {
    const [c0, c1] = edgeCorners(d);
    if (d !== gapDir) {
      segments.push([c0, c1, d, bands]);
      continue;
    }
    const a = directionAngle(d);
    const across = (p: THREE.Vector3) => -p.x * Math.sin(a) + p.z * Math.cos(a);
    const at = (v: number) => c0.clone().lerp(c1, (v - across(c0)) / (across(c1) - across(c0)));
    const w = STAIRS.width / 2;
    const [pa, pb] = across(c0) < across(c1) ? [at(-w), at(w)] : [at(w), at(-w)];
    const low = bands.filter((b) => b.to < 0).map((b) => ({ ...b, from: Math.min(b.from, 0) }));
    segments.push([c0, pa, d, bands], [pa, pb, d, low], [pb, c1, d, bands]);
  }
  for (const [c0, c1, d, segBands] of segments) {
    const a = directionAngle(d);
    const n: V3 = [Math.cos(a), 0, Math.sin(a)];
    for (const band of segBands) {
      ct.setHex(band.top);
      cb.setHex(band.bottom);
      const a0: V3 = [c0.x, band.from, c0.z];
      const a1: V3 = [c1.x, band.from, c1.z];
      const b0: V3 = [c0.x, band.to, c0.z];
      const b1: V3 = [c1.x, band.to, c1.z];
      for (const [p, q, r] of [[a0, a1, b1], [a0, b1, b0]] as [V3, V3, V3][]) {
        const before = pos.length;
        pushTri(pos, p, q, r, n);
        for (let i = before; i < pos.length; i += 3) {
          const c = pos[i + 1] === band.from ? ct : cb;
          col.push(c.r, c.g, c.b);
        }
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

const SHORE_WIDTH = 4.2; // how far a beach runs into the water

// distance from a point (relative to a hex centre) to that hex; 0 inside
function hexDistance(x: number, z: number) {
  if (insideHex(x, z)) return 0;
  let best = Infinity;
  const corners = hexCorners();
  for (let i = 0; i < 6; i++) {
    const a = corners[i];
    const b = corners[(i + 1) % 6];
    const abx = b.x - a.x;
    const abz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((x - a.x) * abx + (z - a.z) * abz) / (abx * abx + abz * abz)));
    best = Math.min(best, Math.hypot(x - (a.x + abx * t), z - (a.z + abz * t)));
  }
  return best;
}

// finds free spots inside a hex for decoration
class Scatter {
  private used: { x: number; z: number; r: number }[] = [];
  private rng: () => number;
  constructor(rng: () => number) {
    this.rng = rng;
  }
  reserve(x: number, z: number, r: number) {
    this.used.push({ x, z, r });
  }
  free(x: number, z: number, r: number) {
    return !this.used.some((u) => (u.x - x) ** 2 + (u.z - z) ** 2 < (u.r + r) ** 2);
  }
  find(r: number, opts: { minCenter?: number; maxCenter?: number; margin?: number } = {}, reserve = true) {
    for (let i = 0; i < 50; i++) {
      const x = (this.rng() * 2 - 1) * HEX_RADIUS;
      const z = (this.rng() * 2 - 1) * HEX_RADIUS;
      if (!insideHex(x, z, INNER_RADIUS - (opts.margin ?? 0.4))) continue;
      const dc = Math.hypot(x, z);
      if (opts.minCenter !== undefined && dc < opts.minCenter) continue;
      if (opts.maxCenter !== undefined && dc > opts.maxCenter) continue;
      if (!this.free(x, z, r)) continue;
      if (reserve) this.reserve(x, z, r);
      return { x, z };
    }
    return null;
  }
  // loose clusters of small things (flowers, grass) that avoid the big props
  clusters(count: number, perCluster: number, spread: number) {
    const out: { x: number; z: number }[] = [];
    for (let i = 0; i < count; i++) {
      const c = this.find(0.2, {}, false);
      if (!c) continue;
      for (let k = 0; k < perCluster; k++) {
        const x = c.x + (this.rng() - 0.5) * spread;
        const z = c.z + (this.rng() - 0.5) * spread;
        if (insideHex(x, z, INNER_RADIUS - 0.2) && this.free(x, z, 0.15)) out.push({ x, z });
      }
    }
    return out;
  }
}

export class TileFactory {
  private grid: HexGrid;
  readonly water = createWaterMaterial();
  private terrain = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 });

  constructor(grid: HexGrid) {
    this.grid = grid;
  }

  update(time: number) {
    this.water.uniforms.uTime.value = time;
  }

  create(coord: HexCoord, type: TileType, opts: { chest?: boolean; rotation?: number; stairs?: number | null } = {}): HexTile {
    const tile = new HexTile(coord, type);
    if (type === 'hill' && opts.stairs !== undefined) tile.stairsDir = opts.stairs;
    tile.rotation = (((opts.rotation ?? 0) % 6) + 6) % 6;
    tile.hasChest = type === 'forest' && !!opts.chest;
    const rng = mulberry32(hashString(`${tile.key}:${type}`));
    if (type === 'water') this.buildWaterBody(tile);
    else this.buildLandBody(tile);
    this.populate(tile, rng, opts.chest ?? false);
    if (tile.stairsDir !== null) this.addStairs(tile);
    // look right against the current neighbours already (also while it is only a preview)
    this.recolor(tile);
    this.rebuildEdges(tile);
    return tile;
  }

  // free what only this tile uses (shared prop geometry stays)
  dispose(tile: HexTile) {
    for (const g of tile.ownGeometries) g.dispose();
    for (const c of tile.edges.children) (c as THREE.Mesh).geometry.dispose();
  }

  // Recolour and rebuild the edge-dependent parts of a tile and its neighbours after a change.
  refreshAround(tile: HexTile) {
    const list = [tile, ...DIRECTIONS.map((_, d) => this.grid.get(neighbor(tile.coord, d)))];
    for (const t of list) {
      if (!t) continue;
      this.recolor(t);
      this.rebuildEdges(t);
    }
  }

  // ---------- bodies ----------
  private buildLandBody(tile: HexTile) {
    const y = tile.groundHeight;
    const top = new THREE.Mesh(hexTop(y, 12), this.terrain);
    tile.ownGeometries.push(top.geometry);
    if (tile.stairsDir !== null) {
      // cut the stairs' slope into the hill top
      const pos = top.geometry.getAttribute('position');
      for (let i = 0; i < pos.count; i++) {
        const h = stairsHeight(pos.getX(i), pos.getZ(i), tile.stairsDir, 0.1);
        if (h !== null) pos.setY(i, Math.min(y, h));
      }
      top.geometry.computeVertexNormals();
    }
    top.receiveShadow = true;
    tile.top = top;
    const bands: Band[] =
      tile.type === 'hill'
        ? [
            { from: y, to: y - 0.3, top: COLORS.lip, bottom: COLORS.lip },
            { from: y - 0.3, to: y - 1.1, top: COLORS.rock, bottom: COLORS.rockDark },
            { from: y - 1.1, to: y - 1.8, top: 0x9097a0, bottom: 0x8a9199 },
            { from: y - 1.8, to: TILE_BASE, top: COLORS.rockDark, bottom: 0x5c636b },
          ]
        : [
            { from: y, to: y - 0.3, top: COLORS.lip, bottom: COLORS.lip },
            { from: y - 0.3, to: TILE_BASE, top: COLORS.dirt, bottom: COLORS.dirtDark },
          ];
    const side = new THREE.Mesh(sides([0, 1, 2, 3, 4, 5], bands, tile.stairsDir), this.terrain);
    side.receiveShadow = true;
    side.castShadow = tile.type === 'hill';
    tile.ownGeometries.push(side.geometry);
    tile.group.add(top, side);
  }

  private buildWaterBody(tile: HexTile) {
    // the bed gets its shape (beaches) in shapeBed, once the neighbours are known
    const bed = new THREE.Mesh(hexTop(WATER_BED, 18), this.terrain);
    bed.receiveShadow = true;
    tile.bed = bed;
    const surface = new THREE.Mesh(hexTop(WATER_LEVEL, 8), this.water);
    tile.ownGeometries.push(bed.geometry, surface.geometry);
    surface.renderOrder = 1;
    tile.group.add(bed, surface);
  }

  // The lake bed slopes up to land height along every shore: its height follows the distance to
  // the nearest flat land (or the edge of the world) in world space, so neighbouring water tiles
  // join without seams and beaches round off nicely around land corners.
  private shapeBed(tile: HexTile) {
    const bed = tile.bed;
    if (!bed) return;
    const shores: THREE.Vector3[] = [];
    DIRECTIONS.forEach((_, d) => {
      const c = neighbor(tile.coord, d);
      const n = this.grid.get(c);
      if (!n || (n.isLand && n.elevation === 0)) shores.push(hexToWorld(c));
    });
    const pos = bed.geometry.getAttribute('position');
    const col = bed.geometry.getAttribute('color');
    const sand = new THREE.Color(COLORS.sand);
    const wet = new THREE.Color(COLORS.wetSand);
    const deep = new THREE.Color(0x8fb58a);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const wx = pos.getX(i) + tile.center.x;
      const wz = pos.getZ(i) + tile.center.z;
      let dist = Infinity;
      for (const s of shores) dist = Math.min(dist, hexDistance(wx - s.x, wz - s.z));
      const t = Math.min(1, dist / SHORE_WIDTH);
      const wobble = (fbm(wx * 0.35, wz * 0.35) - 0.5) * 0.25 * t * (1 - t) * 4;
      pos.setY(i, WATER_BED * smoothstep(0, 1, t) + wobble);
      const n = fbm(wx * 0.2, wz * 0.2);
      if (t < 0.35) c.copy(sand).lerp(wet, smoothstep(0.12, 0.35, t));
      else c.copy(wet).lerp(deep, smoothstep(0.35, 1, t) * (0.4 + n * 0.4));
      col.setXYZ(i, c.r, c.g, c.b);
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
    bed.geometry.computeVertexNormals();
    bed.geometry.computeBoundingSphere();
  }

  // Land colour: one grass palette in world space (so tiles join), darker forest floor that fades
  // out at the border with other land, and sand along water.
  private recolor(tile: HexTile) {
    if (!tile.top) return;
    const g = tile.top.geometry;
    const pos = g.getAttribute('position');
    const col = g.getAttribute('color');
    const nb = DIRECTIONS.map((_, d) => this.grid.get(neighbor(tile.coord, d)));
    const grassA = new THREE.Color(COLORS.grassA);
    const grassB = new THREE.Color(COLORS.grassB);
    const forest = new THREE.Color(COLORS.forestFloor);
    const hill = new THREE.Color(COLORS.hillTop);
    const sand = new THREE.Color(COLORS.sand);
    const lairTint = new THREE.Color(0x5f7d48);
    const bossTint = new THREE.Color(0x6d5f7a);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const lx = pos.getX(i);
      const lz = pos.getZ(i);
      const wx = lx + tile.center.x;
      const wz = lz + tile.center.z;
      c.copy(grassA).lerp(grassB, fbm(wx * 0.06, wz * 0.06));
      c.offsetHSL(0, 0, (hash2(wx * 3.1, wz * 3.1) - 0.5) * 0.04);
      if (tile.type === 'forest') {
        let f = 1;
        nb.forEach((n, d) => {
          if (n && n.type !== 'forest' && n.type !== 'water') f = Math.min(f, smoothstep(0, 5, distanceToEdge(lx, lz, d)));
        });
        c.lerp(forest, f * (0.45 + 0.35 * fbm(wx * 0.15, wz * 0.15)));
      }
      if (tile.type === 'hill') c.lerp(hill, 0.35);
      const fromCenter = Math.hypot(lx, lz) / HEX_RADIUS;
      if (tile.type === 'lair') c.lerp(lairTint, 0.45 * (1 - fromCenter * 0.6));
      if (tile.type === 'boss') c.lerp(bossTint, 0.6 * (1 - fromCenter * 0.5));
      if (tile.elevation === 0) {
        nb.forEach((n, d) => {
          if (n?.type === 'water') c.lerp(sand, 1 - smoothstep(0.8, 2.6, distanceToEdge(lx, lz, d)));
        });
      }
      col.setXYZ(i, c.r, c.g, c.b);
    }
    col.needsUpdate = true;
  }

  // Water tiles get a sandy beach sloping into the water along every edge that isn't more water
  // or a cliff, and an outer wall where the world ends.
  private rebuildEdges(tile: HexTile) {
    for (const child of [...tile.edges.children]) {
      tile.edges.remove(child);
      (child as THREE.Mesh).geometry.dispose();
    }
    if (tile.type !== 'water') return;
    this.shapeBed(tile);
    // where the world ends, a wall under the beach so the pond reads as part of the island
    const voidDirs = DIRECTIONS.map((_, d) => d).filter((d) => !this.grid.get(neighbor(tile.coord, d)));
    if (voidDirs.length) {
      const wall = new THREE.Mesh(
        sides(voidDirs, [
          { from: 0, to: -0.3, top: COLORS.sand, bottom: COLORS.sand },
          { from: -0.3, to: TILE_BASE, top: COLORS.dirt, bottom: COLORS.dirtDark },
        ]),
        this.terrain,
      );
      tile.edges.add(wall);
    }
  }

  // stone steps on the stairs' slope, merged with the other props once the tile has landed
  private addStairs(tile: HexTile) {
    const d = tile.stairsDir!;
    const a = directionAngle(d);
    const steps = stairSteps(STAIRS.length, STAIRS.width, tile.groundHeight);
    // the steps' local +x runs from the edge inwards
    steps.rotation.y = -(a + Math.PI);
    steps.position.set(Math.cos(a) * INNER_RADIUS, 0, Math.sin(a) * INNER_RADIUS);
    tile.group.add(steps);
    tile.decor.push({ object: steps, scale: steps.scale.clone(), delay: 0.2 });
  }

  // ---------- decoration ----------
  private populate(tile: HexTile, rng: () => number, chest: boolean) {
    const s = new Scatter(rng);
    const y = tile.groundHeight;
    const cx = tile.center.x;
    const cz = tile.center.z;
    // the layout is made unrotated; everything turns with the tile's rotation when it is added
    const theta = (tile.rotation * Math.PI) / 3;
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    const rot = (x: number, z: number): [number, number] => [x * cos - z * sin, x * sin + z * cos];
    const add = (p: Prop, x: number, z: number, delay = 0.3 + rng() * 0.4) => {
      const [rx, rz] = rot(x, z);
      p.object.position.x = rx;
      p.object.position.z = rz;
      p.object.position.y += y;
      p.object.rotation.y -= theta;
      tile.group.add(p.object);
      tile.decor.push({ object: p.object, scale: p.object.scale.clone(), delay });
      const cols = p.collider ? ([] as Collider[]).concat(p.collider) : [];
      for (const c of cols) tile.colliders.push(toWorld(c, cx + rx, cz + rz, theta));
      if (p.fade) {
        tile.fadeables.push({
          object: p.object,
          center: new THREE.Vector3(cx + rx, y + p.fade.height, cz + rz),
          radius: p.fade.radius,
        });
      }
    };
    const worldSpot = (x: number, z: number) => {
      const [rx, rz] = rot(x, z);
      return new THREE.Vector3(cx + rx, y, cz + rz);
    };
    const scatter = (n: number, r: number, make: () => Prop, opts?: Parameters<Scatter['find']>[1]) => {
      for (let i = 0; i < n; i++) {
        const p = s.find(r, opts);
        if (p) add(make(), p.x, p.z);
      }
    };
    const smallThings = (flowerClusters: number, grassClusters: number) => {
      const f = s.clusters(flowerClusters, 6, 1.6);
      if (f.length) add({ object: flowers(rng, f) }, 0, 0, 0.6);
      const gr = s.clusters(grassClusters, 4, 1.4);
      if (gr.length) add({ object: grass(rng, gr) }, 0, 0, 0.55);
    };

    // stairs: keep their path free of props (the layout is made unrotated, so turn it back)
    if (tile.stairsDir !== null) {
      const a = directionAngle(tile.stairsDir);
      for (let u = 0.3; u < STAIRS.length + 1; u += 1.1) {
        const px = Math.cos(a) * (INNER_RADIUS - u);
        const pz = Math.sin(a) * (INNER_RADIUS - u);
        s.reserve(px * cos + pz * sin, -px * sin + pz * cos, STAIRS.width / 2 + 0.7);
      }
    }
    const interactAt = (x: number, z: number) => {
      tile.interact = worldSpot(x, z);
    };

    switch (tile.type) {
      case 'shrine': {
        add(shrine(), 0, 0, 0.35);
        s.reserve(0, 0, 3.4);
        interactAt(0, 2.2);
        scatter(3, 1.8, () => tree(rng, 0.9 + rng() * 0.3), { minCenter: 5.5 });
        scatter(4, 0.9, () => bush(rng, 0.7 + rng() * 0.4), { minCenter: 4.5 });
        smallThings(16, 10);
        break;
      }
      case 'lair': {
        // a ring of standing stones around an open arena
        for (let i = 0; i < 9; i++) {
          if (i === 4) continue; // a gap to walk in
          const a = (i / 9) * Math.PI * 2 + Math.PI / 2;
          add(standingStone(rng), Math.cos(a) * 6.8, Math.sin(a) * 6.8, 0.3 + i * 0.03);
        }
        s.reserve(0, 0, 7.6);
        tile.enemySpawn = worldSpot(0, 0);
        scatter(4, 1.4, () => tree(rng, 0.9 + rng() * 0.3), { margin: 0.1 });
        smallThings(2, 8);
        break;
      }
      case 'boss': {
        add(deadTree(rng), 0, -6.2, 0.3);
        s.reserve(0, -6.2, 1.6);
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * Math.PI * 2;
          add(standingStone(rng, true), Math.cos(a) * 7.4, Math.sin(a) * 7.4, 0.35 + i * 0.03);
        }
        s.reserve(0, 0, 7.8);
        tile.enemySpawn = worldSpot(0, 0.5);
        for (let i = 0; i < 8; i++) {
          const a = rng() * Math.PI * 2;
          const r = 8 + rng() * 0.6;
          if (insideHex(Math.cos(a) * r, Math.sin(a) * r, INNER_RADIUS - 0.4)) add(blightCrystal(rng), Math.cos(a) * r, Math.sin(a) * r, 0.6);
        }
        break;
      }
      case 'home': {
        add(house(), -2.2, -2.6, 0.3);
        add(campfire(), 1.2, 0.6, 0.45);
        s.reserve(1.2, 0.6, 1.8);
        interactAt(1.2, 1.9);
        s.reserve(-2.2, -2.6, 3.6);
        s.reserve(0.6, 0.2, 1.6); // path to the door
        tile.playerSpawn = worldSpot(1.8, 2.8);
        s.reserve(1.8, 2.8, 2.2);
        scatter(7, 1.8, () => tree(rng, 0.9 + rng() * 0.35), { minCenter: 5.5 });
        add(rock(rng, 1.1), 4.2, -3.6);
        s.reserve(4.2, -3.6, 1.3);
        scatter(4, 0.7, () => rock(rng, 0.35 + rng() * 0.3));
        scatter(4, 1.0, () => bush(rng, 0.8 + rng() * 0.4));
        smallThings(9, 10);
        break;
      }
      case 'meadow': {
        scatter(4, 1.8, () => tree(rng, 0.9 + rng() * 0.4), { minCenter: 3 });
        scatter(1, 1.3, () => rock(rng, 1.0 + rng() * 0.3));
        scatter(4, 0.7, () => rock(rng, 0.3 + rng() * 0.35));
        scatter(4, 1.0, () => bush(rng, 0.7 + rng() * 0.4));
        smallThings(13, 14);
        break;
      }
      case 'forest': {
        s.reserve(0, 0, 3.8); // a small clearing to fight in
        tile.enemySpawn = worldSpot(0.5, 0.8);
        if (chest) {
          const a = rng() * Math.PI * 2;
          s.reserve(Math.cos(a) * 5.2, Math.sin(a) * 5.2, 1.8);
          const [rx, rz] = rot(Math.cos(a) * 5.2, Math.sin(a) * 5.2);
          tile.chestSpawn = new THREE.Vector3(rx, y, rz);
        }
        scatter(34, 1.25, () => tree(rng, 0.85 + rng() * 0.5), { margin: 0.1 });
        scatter(12, 0.9, () => bush(rng, 0.8 + rng() * 0.5));
        scatter(2, 1.2, () => rock(rng, 0.95 + rng() * 0.3));
        scatter(3, 0.6, () => rock(rng, 0.3 + rng() * 0.3));
        smallThings(3, 10);
        break;
      }
      case 'hill': {
        // rocks along the rim make the cliff read as rocky from above
        scatter(10, 1.0, () => rock(rng, 0.6 + rng() * 0.6), { minCenter: INNER_RADIUS * 0.72, margin: 0.2 });
        scatter(3, 1.8, () => tree(rng, 0.9 + rng() * 0.3), { maxCenter: 6 });
        scatter(3, 0.9, () => bush(rng, 0.7 + rng() * 0.3));
        smallThings(5, 10);
        break;
      }
      case 'water': {
        const n = 3 + Math.floor(rng() * 3);
        for (let i = 0; i < n; i++) {
          const p = s.find(1, { maxCenter: 4 }); // stay in the deep middle, clear of the beaches
          if (!p) continue;
          const pad = lilyPad(rng);
          pad.object.position.y = WATER_LEVEL + 0.03 - y;
          add(pad, p.x, p.z, 0.6);
        }
        break;
      }
    }
  }
}

// a prop's collider in world space, turned with the tile (boxes become their bounding box)
function toWorld(c: Collider, x: number, z: number, theta: number): Collider {
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  if (c.kind === 'circle') return { kind: 'circle', x: x + c.x * cos - c.z * sin, z: z + c.x * sin + c.z * cos, r: c.r };
  const xs: number[] = [];
  const zs: number[] = [];
  for (const [px, pz] of [[c.minX, c.minZ], [c.maxX, c.minZ], [c.maxX, c.maxZ], [c.minX, c.maxZ]]) {
    xs.push(x + px * cos - pz * sin);
    zs.push(z + px * sin + pz * cos);
  }
  return { kind: 'box', minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
}

// All tuning numbers in one place. Distances are world units.

export const HEX_RADIUS = 10; // corner-to-centre of one hex (pointy top)
export const ELEVATION_HEIGHT = 2.5; // one level of elevation (hill)

export const WATER_LEVEL = -0.4;
export const WATER_BED = -1.3;
export const TILE_BASE = -5; // bottom of the tile sides
export const BRIDGE_Y = 0.15; // top of the bridge deck
export const STEP_HEIGHT = 0.4; // biggest height difference you can walk over

export const PLAYER = {
  speed: 7,
  accel: 16,
  radius: 0.45,
  maxHearts: 3,
  invulnerable: 1.0, // seconds after taking a hit
};

export const PLAY_CAMERA = {
  fov: 30,
  pitchDeg: 52, // looking down
  distance: 44,
  lookHeight: 1,
  follow: 9, // how quickly the camera catches up with the player
};

// the same view as Hexhaven: offset (2, 13, 14) there, so ~43° down and turned 8°, FOV 34
export const BUILD_CAMERA = {
  fov: 34,
  pitchDeg: 42.6,
  yawDeg: 8.1,
  distance: 150,
  minDistance: 60,
  maxDistance: 260,
  panSpeed: 55,
};

export const PLACE_ANIM = 0.6; // seconds a new tile takes to rise into place
export const CHEST_CHANCE = 0.4; // forest tiles after the first

// ---------- soulslike ----------
export const STAMINA = { max: 100, regen: 60, delay: 0.5, attack: 22, roll: 28, perLevel: 20 };
export const ROLL = { time: 0.42, speed: 12.5, iFrom: 0.03, iTo: 0.32 };
export const FLASK = { charges: 3, drink: 0.8, healAt: 0.5 };

// ---------- the run ----------
export const RUN = {
  startTiles: 8, // tiles you start a run with (the stack)
  handSize: 3,
  fragmentsToWin: 3,
  maxHearts: 7,
};

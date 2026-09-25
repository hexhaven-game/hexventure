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

export const BUILD_CAMERA = {
  pitchDeg: 72,
  distance: 130,
  minDistance: 70,
  maxDistance: 260,
  panSpeed: 55,
};

export const PLACE_ANIM = 0.6; // seconds a new tile takes to rise into place
export const CHEST_CHANCE = 0.4; // forest tiles after the first

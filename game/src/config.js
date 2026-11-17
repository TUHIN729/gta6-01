// Harbor Heat — tuning, palette and world constants.
// One logical playfield: a 3600 x 3600 open city the camera roams over.
// Every number the simulation needs lives here, so no rule below depends on the screen size.

export const WORLD = { width: 3600, height: 3600 };
export const VIEW = { width: 1280, height: 720 };
export const STEP = 1 / 60;

export const ROAD = { spacing: 360, width: 96 };
export const CITY = {
  roads: [180, 540, 900, 1260, 1620, 1980, 2340, 2700, 3060, 3420],
  beachY: 3240,
  waterY: 3420,
};

export const PLAYER = {
  radius: 13,
  walkSpeed: 210,
  sprintSpeed: 330,
  health: 100,
  punchRange: 36,
  punchDamage: 12,
};

export const CAR = {
  length: 54,
  width: 26,
  accel: 420,
  brake: 640,
  maxSpeed: 520,
  reverseMax: 170,
  steer: 2.7,
  grip: 0.94,
  offroadGrip: 0.72,
};

export const TRAFFIC = { count: 22, minSpeed: 120, maxSpeed: 205 };
export const PEDS = { count: 34, walkSpeed: 55 };
export const POLICE = { maxCars: 6, maxFoot: 4, carSpeed: 565, footSpeed: 265 };

export const WEAPON = {
  pistolDamage: 26,
  pistolRange: 430,
  pistolRate: 0.22,
  bulletSpeed: 920,
  magSize: 12,
  reloadTime: 1.1,
};

export const WANTED = {
  decayDelay: 14,
  decayRate: 0.35,
  max: 5,
  stealCar: 1,
  shoot: 1,
  hitPed: 1,
  killCop: 2,
};

export const MISSIONS = [
  { id: 'pickup', title: 'The Pickup', brief: 'Marla needs a package from the docks. Go get it.', reward: 300 },
  { id: 'wheels', title: 'Borrowed Wheels', brief: 'A crimson coupe waits by the plaza. Bring it to the chop shop.', reward: 500 },
  { id: 'heat', title: 'Heat Wave', brief: 'The cops are on you. Lose them and reach the safehouse.', reward: 400 },
  { id: 'harbor', title: 'The Harbor Job', brief: 'Grab the cash case at the bank and vanish. The whole city will be looking.', reward: 1000 },
];

export const PALETTE = {
  grass: '#5d8a4a',
  grassDark: '#527c41',
  sand: '#d9c27a',
  water: '#2e6f8e',
  waterDeep: '#245a76',
  road: '#33373d',
  roadEdge: '#4a4f57',
  sidewalk: '#8d9299',
  laneDash: '#e8d44d',
  roof: ['#b0563a', '#7a6a9e', '#4a7a8c', '#9e7a4a', '#6a8c4a', '#8c4a5e', '#5a6a8c', '#a35a2e'],
  buildingEdge: '#2c2c30',
  park: '#4a7a3d',
  tree: '#2f6b2f',
  treeLight: '#4a8c3d',
  player: '#f2c94c',
  playerDark: '#2b2b30',
  ped: ['#e5534b', '#4fc3f7', '#f2a65a', '#9b7ede', '#7ede8a', '#e58ab0'],
  policeCar: '#2f6fb2',
  policeLight: ['#ff2e2e', '#2e6bff'],
  carColors: ['#c23b2e', '#2e7fc2', '#e8e8e8', '#2b2b30', '#e8a13c', '#5a9e4b', '#7a4a9e', '#c2c2c2'],
  hudPanel: 'rgba(12, 14, 20, 0.72)',
  hudText: '#f4f6f8',
  hudMuted: '#aab2bd',
  hudGold: '#f2c94c',
  hudRed: '#ff5252',
  hudGreen: '#7ede8a',
  marker: '#ffd23e',
  markerSafe: '#7ede8a',
  night: 'rgba(10, 12, 40, 0.34)',
  dusk: 'rgba(255, 120, 40, 0.10)',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
export const SAVE_KEY = 'harbor-heat.save.v1';
export const BEST_KEY = 'harbor-heat.best.v1';
export const GAME_TITLE = 'Harbor Heat';
export const GAME_SUBTITLE = 'A Solmar Bay Story';

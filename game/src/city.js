// Solmar Bay itself: a deterministic city built from a seed. A grid of roads
// divides the map into blocks; each block holds buildings, a park, a parking lot
// or a landmark (docks, plaza, bank, safehouse, garage, chop shop). The world
// module asks this file for collisions and for named places; the renderer asks
// it for what to draw.

import { CITY, PALETTE, ROAD, WORLD } from './config.js';
import { intRange, pick, range } from './random.js';

export const PLACES = {
  spawn: { x: 1620, y: 1620, name: 'Marla\u2019s Garage' },
  docks: { x: 3300, y: 2340, name: 'East Docks' },
  plaza: { x: 1980, y: 900, name: 'Palm Plaza' },
  chopShop: { x: 540, y: 2700, name: 'Chop Shop' },
  safehouse: { x: 900, y: 540, name: 'Safehouse' },
  bank: { x: 2340, y: 1620, name: 'Solmar Bank' },
  hospital: { x: 1260, y: 2340, name: 'St. Anselm Hospital' },
  beach: { x: 1800, y: 3300, name: 'Sunset Beach' },
};

/** True when the point is on a road (including the road's sidewalk edge). */
export function onRoad(x, y) {
  const half = ROAD.width / 2;
  for (const road of CITY.roads) {
    if (Math.abs(x - road) <= half || Math.abs(y - road) <= half) return true;
  }
  return false;
}

/** True when the point is on a road's driving surface (not the sidewalk strip). */
export function onDriveSurface(x, y) {
  const half = ROAD.width / 2 - 14;
  for (const road of CITY.roads) {
    if (Math.abs(x - road) <= half || Math.abs(y - road) <= half) return true;
  }
  return false;
}

/** The nearest road coordinate on one axis, for lane keeping. */
export function nearestRoad(value) {
  let best = CITY.roads[0];
  let bestDist = Math.abs(value - best);
  for (const road of CITY.roads) {
    const dist = Math.abs(value - road);
    if (dist < bestDist) {
      bestDist = dist;
      best = road;
    }
  }
  return best;
}

function blockRects() {
  const rects = [];
  const half = ROAD.width / 2;
  for (let i = 0; i < CITY.roads.length - 1; i += 1) {
    for (let j = 0; j < CITY.roads.length - 1; j += 1) {
      rects.push({
        x: CITY.roads[i] + half,
        y: CITY.roads[j] + half,
        width: CITY.roads[i + 1] - CITY.roads[i] - ROAD.width,
        height: CITY.roads[j + 1] - CITY.roads[j] - ROAD.width,
      });
    }
  }
  return rects;
}

/**
 * Build the city: buildings (solid rectangles), parks, trees, and the parked
 * cars that sit waiting to be stolen. Everything derives from the seed.
 */
export function buildCity(random) {
  const buildings = [];
  const parks = [];
  const trees = [];
  const parked = [];
  const blocks = blockRects();

  for (const block of blocks) {
    const roll = random();
    const isPark = roll < 0.14;
    const isLot = roll >= 0.14 && roll < 0.24;
    if (block.y + block.height > CITY.beachY) continue; // beach strip stays open
    if (isPark) {
      parks.push(block);
      const treeCount = intRange(random, 5, 9);
      for (let i = 0; i < treeCount; i += 1) {
        trees.push({
          x: range(random, block.x + 20, block.x + block.width - 20),
          y: range(random, block.y + 20, block.y + block.height - 20),
          r: range(random, 9, 15),
        });
      }
      continue;
    }
    if (isLot) {
      const carCount = intRange(random, 2, 4);
      for (let i = 0; i < carCount; i += 1) {
        parked.push({
          x: block.x + 30 + i * 52,
          y: block.y + block.height / 2,
          angle: Math.PI / 2,
          color: pick(random, ['#c23b2e', '#2e7fc2', '#e8e8e8', '#e8a13c', '#5a9e4b']),
          model: pick(random, ['sedan', 'hatch', 'coupe']),
        });
      }
      continue;
    }
    const cols = random() < 0.5 ? 2 : 1;
    const rows = random() < 0.5 ? 2 : 1;
    const gap = 14;
    const cellW = (block.width - gap * (cols + 1)) / cols;
    const cellH = (block.height - gap * (rows + 1)) / rows;
    for (let c = 0; c < cols; c += 1) {
      for (let r = 0; r < rows; r += 1) {
        const w = cellW * range(random, 0.72, 0.96);
        const h = cellH * range(random, 0.72, 0.96);
        const x = block.x + gap + c * (cellW + gap) + (cellW - w) / 2;
        const y = block.y + gap + r * (cellH + gap) + (cellH - h) / 2;
        buildings.push({
          x, y, width: w, height: h,
          roof: pick(random, PALETTE.roof),
          floors: intRange(random, 1, 4),
          tall: random() < 0.18,
        });
      }
    }
    if (random() < 0.6) {
      trees.push({
        x: block.x + range(random, 16, block.width - 16),
        y: block.y + range(random, 16, block.height - 16),
        r: range(random, 8, 13),
      });
    }
  }

  // Palm trees along the beach promenade.
  for (let x = 120; x < WORLD.width; x += 90) {
    trees.push({ x: x + range(random, -14, 14), y: CITY.beachY + 24, r: 12, palm: true });
  }

  return { buildings, parks, trees, parked };
}

/**
 * Push a circle (player or pedestrian) out of every building it overlaps.
 * Returns true when a collision happened.
 */
export function collideCircleBuildings(city, x, y, radius) {
  let hit = false;
  for (const b of city.buildings) {
    const closestX = Math.max(b.x, Math.min(x, b.x + b.width));
    const closestY = Math.max(b.y, Math.min(y, b.y + b.height));
    const dx = x - closestX;
    const dy = y - closestY;
    const distSq = dx * dx + dy * dy;
    if (distSq < radius * radius) {
      hit = true;
      const dist = Math.sqrt(distSq) || 0.001;
      const push = radius - dist;
      x += (dx / dist) * push;
      y += (dy / dist) * push;
    }
  }
  return { x, y, hit };
}

/** True when a circle overlaps any building. */
export function circleHitsBuilding(city, x, y, radius) {
  for (const b of city.buildings) {
    const closestX = Math.max(b.x, Math.min(x, b.x + b.width));
    const closestY = Math.max(b.y, Math.min(y, b.y + b.height));
    const dx = x - closestX;
    const dy = y - closestY;
    if (dx * dx + dy * dy < radius * radius) return true;
  }
  return false;
}

/** Resolve a car's oriented rectangle against buildings: slide it out along the push axis. */
export function collideCarBuildings(city, car) {
  const cos = Math.cos(car.angle);
  const sin = Math.sin(car.angle);
  const halfL = 27;
  const halfW = 13;
  let hit = false;
  for (const b of city.buildings) {
    // Transform the building centre into the car's local frame.
    const cx = b.x + b.width / 2 - car.x;
    const cy = b.y + b.height / 2 - car.y;
    const localX = cx * cos + cy * sin;
    const localY = -cx * sin + cy * cos;
    const reachX = halfL + (Math.abs(b.width / 2) * Math.abs(cos) + Math.abs(b.height / 2) * Math.abs(sin));
    const reachY = halfW + (Math.abs(b.width / 2) * Math.abs(sin) + Math.abs(b.height / 2) * Math.abs(cos));
    if (Math.abs(localX) < reachX && Math.abs(localY) < reachY) {
      hit = true;
      const pushX = reachX - Math.abs(localX);
      const pushY = reachY - Math.abs(localY);
      if (pushX < pushY) {
        car.x -= Math.sign(localX || 1) * pushX * cos;
        car.y -= Math.sign(localX || 1) * pushX * sin;
      } else {
        car.x += Math.sign(localY || 1) * pushY * sin;
        car.y -= Math.sign(localY || 1) * pushY * cos;
      }
      car.speed *= 0.45;
    }
  }
  return hit;
}

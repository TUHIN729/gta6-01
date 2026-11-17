// Harbor Heat's rules and state, with no drawing and no browser in it: the
// player on foot and by car, traffic, pedestrians, police, the wanted level,
// missions and story, combat, pickups, particles and the day cycle. step()
// advances one fixed step and returns what happened as bit flags, so the
// caller can react (sounds, announcements) without the world knowing about
// screens or audio. Nothing here allocates per frame after createWorld returns.

import {
  CAR, CITY, MISSIONS, PALETTE, PEDS, PLAYER, POLICE, STEP, TRAFFIC,
  WANTED, WEAPON, WORLD,
} from './config.js';
import { buildCity, circleHitsBuilding, collideCarBuildings, collideCircleBuildings, nearestRoad, onDriveSurface, onRoad, PLACES } from './city.js';
import { intRange, pick, range } from './random.js';

export const EVENT_HIT = 1;
export const EVENT_PICKUP = 2;
export const EVENT_OVER = 4;
export const EVENT_MISSION = 8;
export const EVENT_WANTED_UP = 16;
export const EVENT_SHOT = 32;
export const EVENT_CRASH = 64;

export const CAR_KIND = { traffic: 'traffic', parked: 'parked', police: 'police', player: 'player' };

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

function dist(ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  return Math.sqrt(dx * dx + dy * dy);
}

function angleTo(ax, ay, bx, by) {
  return Math.atan2(by - ay, bx - ax);
}

function angleDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function carOverlaps(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const along = Math.abs(dx * Math.cos(a.angle) + dy * Math.sin(a.angle));
  const across = Math.abs(-dx * Math.sin(a.angle) + dy * Math.cos(a.angle));
  return along < 52 && across < 26;
}

function makeCar(id, x, y, angle, color, model, kind) {
  return {
    id, x, y, angle, speed: 0, color, model, kind,
    health: 100, wreck: false, driver: kind === 'traffic',
    trafficAxis: 'v', trafficRoad: 0, trafficDir: 1,
    smoke: 0, siren: 0, stuck: 0,
  };
}

function makePed(x, y, color) {
  return {
    x, y, angle: 0, color, speed: 0, health: 100, down: false,
    road: 0, axis: 'v', dir: 1, side: 1, flee: 0, wait: 0,
    walkPhase: Math.random() * 6,
  };
}

/** The mission script: each mission is a list of steps the player works through. */
function missionSteps(missionId) {
  if (missionId === 'pickup') {
    return [
      { type: 'goto', target: PLACES.docks, label: 'Drive to the East Docks', radius: 70 },
      { type: 'pickup', target: PLACES.docks, label: 'Grab the package', radius: 46 },
      { type: 'goto', target: PLACES.spawn, label: 'Deliver the package to Marla\u2019s Garage', radius: 80 },
    ];
  }
  if (missionId === 'wheels') {
    return [
      { type: 'goto', target: PLACES.plaza, label: 'Find the crimson coupe at Palm Plaza', radius: 90 },
      { type: 'steal', target: PLACES.plaza, label: 'Take the coupe (E to get in)', radius: 70 },
      { type: 'deliver', target: PLACES.chopShop, label: 'Deliver the coupe to the Chop Shop', radius: 90, needCar: 'coupe' },
    ];
  }
  if (missionId === 'heat') {
    return [
      { type: 'escape', target: PLACES.safehouse, label: 'Lose the cops — reach the Safehouse', radius: 90 },
    ];
  }
  return [
    { type: 'goto', target: PLACES.bank, label: 'Get to Solmar Bank', radius: 80 },
    { type: 'grab', target: PLACES.bank, label: 'Grab the cash case', radius: 46 },
    { type: 'escape', target: PLACES.safehouse, label: 'Escape to the Safehouse with the cash', radius: 90 },
  ];
}

const DIALOGUE = {
  pickup: [
    ['Marla', 'Dana. You\u2019re back in Solmar Bay. Good. I\u2019ve got work, if you want it.'],
    ['Marla', 'A package is waiting at the East Docks. Bring it to my garage. No questions.'],
  ],
  wheels: [
    ['Marla', 'Next job. A crimson coupe is parked at Palm Plaza. It isn\u2019t theirs anymore.'],
    ['Marla', 'Drop it at the Chop Shop on the west side. Don\u2019t scratch it. Much.'],
  ],
  heat: [
    ['Marla', 'The cops are all over you, Dana. Shake them and get to the Safehouse.'],
    ['Dana', 'I didn\u2019t even do anything this time. Well. Not much.'],
  ],
  harbor: [
    ['Marla', 'Last one. The bank on Meridian Row. Take the case, walk out, disappear.'],
    ['Dana', 'If this goes sideways, I never met you.'],
    ['Marla', 'It won\u2019t. You\u2019re the best wheel in Solmar Bay. Now go.'],
  ],
};

export function createWorld(random) {
  const city = buildCity(random);
  const cars = [];
  const peds = [];
  const policeFoot = [];
  const bullets = [];
  const particles = [];
  const skids = [];
  const pickups = [];
  let nextCarId = 1;

  const player = {
    x: PLACES.spawn.x, y: PLACES.spawn.y, angle: -Math.PI / 2,
    health: PLAYER.health, inCar: false, carId: 0,
    ammo: WEAPON.magSize, reload: 0, fireCooldown: 0,
    punchCooldown: 0, invulnerable: 0, dead: false,
  };

  const state = {
    city, cars, peds, policeFoot, bullets, particles, skids, pickups,
    player, time: 0, clock: 17.5, money: 0, wanted: 0, wantedFloat: 0,
    wantedTimer: 0, missionIndex: 0, missionStep: 0, missionActive: true,
    storyDone: false, dialogue: null, dialogueUntil: 0,
    message: '', messageUntil: 0, camera: { x: player.x, y: player.y },
    stats: { carsStolen: 0, missionsDone: 0, shotsFired: 0, arrests: 0 },
    spawn: { x: PLACES.spawn.x, y: PLACES.spawn.y },
  };

  function currentMission() {
    return MISSIONS[state.missionIndex] || null;
  }

  function currentStep() {
    const mission = currentMission();
    if (!mission) return null;
    return missionSteps(mission.id)[state.missionStep] || null;
  }

  function say(speaker, text, seconds) {
    state.dialogue = { speaker, text };
    state.dialogueUntil = state.time + (seconds || 4.5);
  }

  function flash(text, seconds) {
    state.message = text;
    state.messageUntil = state.time + (seconds || 3);
  }

  function addWanted(amount) {
    const before = state.wanted;
    state.wantedFloat = clamp(state.wantedFloat + amount, 0, WANTED.max);
    state.wanted = Math.ceil(state.wantedFloat);
    state.wantedTimer = 0;
    if (state.wanted > before) return EVENT_WANTED_UP;
    return 0;
  }

  function spawnParticles(x, y, count, color, speed, life) {
    for (let i = 0; i < count; i += 1) {
      if (particles.length > 220) return;
      const angle = random() * Math.PI * 2;
      const sp = range(random, speed * 0.3, speed);
      particles.push({
        x, y, vx: Math.cos(angle) * sp, vy: Math.sin(angle) * sp,
        life: range(random, life * 0.5, life), maxLife: life, color, size: range(random, 2, 5),
      });
    }
  }

  function spawnPickup(x, y, kind) {
    pickups.push({ x, y, kind, bob: random() * 6 });
  }

  function placeTrafficCar(car) {
    const axis = random() < 0.5 ? 'v' : 'h';
    const road = pick(random, CITY.roads);
    const dir = random() < 0.5 ? 1 : -1;
    const lane = 22;
    car.trafficAxis = axis;
    car.trafficRoad = road;
    car.trafficDir = dir;
    if (axis === 'v') {
      car.x = road + (dir > 0 ? lane : -lane);
      car.y = range(random, 120, WORLD.height - 120);
      car.angle = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    } else {
      car.y = road + (dir > 0 ? lane : -lane);
      car.x = range(random, 120, WORLD.width - 120);
      car.angle = dir > 0 ? 0 : Math.PI;
    }
    car.speed = range(random, TRAFFIC.minSpeed, TRAFFIC.maxSpeed);
  }

  function spawnTraffic() {
    for (let i = 0; i < TRAFFIC.count; i += 1) {
      const car = makeCar(nextCarId++, 0, 0, 0, pick(random, PALETTE.carColors), pick(random, ['sedan', 'hatch', 'coupe']), 'traffic');
      placeTrafficCar(car);
      cars.push(car);
    }
  }

  function spawnParked() {
    for (const spot of city.parked) {
      const car = makeCar(nextCarId++, spot.x, spot.y, spot.angle, spot.color, spot.model, 'parked');
      car.driver = false;
      cars.push(car);
    }
    // The mission coupe, crimson, at Palm Plaza.
    const coupe = makeCar(nextCarId++, PLACES.plaza.x + 40, PLACES.plaza.y + 30, Math.PI / 2, '#c23b2e', 'coupe', 'parked');
    coupe.driver = false;
    coupe.missionCar = true;
    cars.push(coupe);
  }

  function spawnPeds() {
    for (let i = 0; i < PEDS.count; i += 1) {
      const road = pick(random, CITY.roads);
      const axis = random() < 0.5 ? 'v' : 'h';
      const side = random() < 0.5 ? 1 : -1;
      const offset = 60 * side;
      const ped = makePed(
        axis === 'v' ? road + offset : range(random, 150, WORLD.width - 150),
        axis === 'v' ? range(random, 150, WORLD.height - 150) : road + offset,
        pick(random, PALETTE.ped),
      );
      ped.road = road;
      ped.axis = axis;
      ped.dir = random() < 0.5 ? 1 : -1;
      ped.side = side;
      peds.push(ped);
    }
  }

  function spawnInitialPickups() {
    spawnPickup(PLACES.spawn.x + 120, PLACES.spawn.y - 60, 'health');
    spawnPickup(PLACES.hospital.x + 60, PLACES.hospital.y, 'health');
    spawnPickup(PLACES.beach.x, PLACES.beach.y - 60, 'cash');
    spawnPickup(PLACES.plaza.x - 80, PLACES.plaza.y + 80, 'cash');
    spawnPickup(PLACES.docks.x - 60, PLACES.docks.y + 120, 'health');
  }

  function reset() {
    cars.length = 0;
    peds.length = 0;
    policeFoot.length = 0;
    bullets.length = 0;
    particles.length = 0;
    skids.length = 0;
    pickups.length = 0;
    nextCarId = 1;
    player.x = PLACES.spawn.x;
    player.y = PLACES.spawn.y;
    player.angle = -Math.PI / 2;
    player.health = PLAYER.health;
    player.inCar = false;
    player.carId = 0;
    player.ammo = WEAPON.magSize;
    player.reload = 0;
    player.fireCooldown = 0;
    player.punchCooldown = 0;
    player.invulnerable = 0;
    player.dead = false;
    state.time = 0;
    state.clock = 17.5;
    state.money = 0;
    state.wanted = 0;
    state.wantedFloat = 0;
    state.wantedTimer = 0;
    state.missionIndex = 0;
    state.missionStep = 0;
    state.missionActive = true;
    state.storyDone = false;
    state.dialogue = null;
    state.message = '';
    state.camera.x = player.x;
    state.camera.y = player.y;
    state.stats = { carsStolen: 0, missionsDone: 0, shotsFired: 0, arrests: 0 };
    spawnTraffic();
    spawnParked();
    spawnPeds();
    spawnInitialPickups();
    const mission = currentMission();
    if (mission) {
      for (const line of DIALOGUE[mission.id]) say(line[0], line[1], 5);
      flash(`Mission: ${mission.title} — ${mission.brief}`, 6);
    }
  }

  function playerCar() {
    if (!player.inCar) return null;
    for (const car of cars) if (car.id === player.carId) return car;
    return null;
  }

  function nearestCar(x, y, maxDist) {
    let best = null;
    let bestDist = maxDist;
    for (const car of cars) {
      if (car.wreck) continue;
      const d = dist(x, y, car.x, car.y);
      if (d < bestDist) {
        bestDist = d;
        best = car;
      }
    }
    return best;
  }

  function enterCar(car) {
    if (car.kind === 'traffic' && car.driver) {
      car.driver = false;
      addWanted(WANTED.stealCar);
      state.stats.carsStolen += 1;
      flash('Car stolen! The owner ran off — the cops noticed.', 3);
      const ped = makePed(car.x + 30, car.y + 30, pick(random, PALETTE.ped));
      ped.flee = 6;
      peds.push(ped);
    } else if (car.kind === 'parked') {
      addWanted(WANTED.stealCar);
      state.stats.carsStolen += 1;
      flash('Hot-wired. That car is yours now.', 3);
    }
    car.kind = 'player';
    player.inCar = true;
    player.carId = car.id;
    player.x = car.x;
    player.y = car.y;
  }

  function exitCar() {
    const car = playerCar();
    if (!car) return;
    const sideX = car.x + Math.cos(car.angle + Math.PI / 2) * 34;
    const sideY = car.y + Math.sin(car.angle + Math.PI / 2) * 34;
    player.x = sideX;
    player.y = sideY;
    player.inCar = false;
    player.carId = 0;
    car.kind = 'parked';
    car.speed = 0;
    const fixed = collideCircleBuildings(city, player.x, player.y, PLAYER.radius);
    player.x = fixed.x;
    player.y = fixed.y;
  }

  function fireBullet(fromX, fromY, angle, friendly, damage) {
    bullets.push({
      x: fromX, y: fromY, vx: Math.cos(angle) * WEAPON.bulletSpeed,
      vy: Math.sin(angle) * WEAPON.bulletSpeed, life: WEAPON.pistolRange / WEAPON.bulletSpeed,
      friendly, damage,
    });
    spawnParticles(fromX + Math.cos(angle) * 18, fromY + Math.sin(angle) * 18, 3, '#ffd23e', 120, 0.15);
  }

  function stepPlayer(dt, ctl) {
    if (player.dead) return 0;
    let events = 0;
    if (player.fireCooldown > 0) player.fireCooldown -= dt;
    if (player.punchCooldown > 0) player.punchCooldown -= dt;
    if (player.reload > 0) {
      player.reload -= dt;
      if (player.reload <= 0) player.ammo = WEAPON.magSize;
    }
    if (player.invulnerable > 0) player.invulnerable -= dt;

    const car = playerCar();
    if (car) {
      // Driving.
      const steer = ctl.moveX;
      const speedSign = car.speed >= 0 ? 1 : -1;
      car.angle += steer * CAR.steer * clamp(Math.abs(car.speed) / 220, 0, 1) * speedSign * dt;
      if (ctl.moveY < 0) car.speed += CAR.accel * dt;
      else if (ctl.moveY > 0) car.speed -= CAR.brake * dt;
      else car.speed *= Math.pow(0.4, dt);
      const onRoadSurface = onDriveSurface(car.x, car.y);
      const maxSpeed = onRoadSurface ? CAR.maxSpeed : CAR.maxSpeed * 0.55;
      car.speed = clamp(car.speed, -CAR.reverseMax, maxSpeed);
      if (ctl.brake) {
        car.speed *= Math.pow(0.12, dt);
        if (Math.abs(car.speed) > 180 && skids.length < 300) {
          skids.push({ x: car.x, y: car.y, angle: car.angle, life: 6 });
        }
      }
      const nx = car.x + Math.cos(car.angle) * car.speed * dt;
      const ny = car.y + Math.sin(car.angle) * car.speed * dt;
      car.x = clamp(nx, 30, WORLD.width - 30);
      car.y = clamp(ny, 30, WORLD.height - 30);
      if (collideCarBuildings(city, car)) events |= EVENT_CRASH;
      if (car.health < 40) {
        car.smoke += dt;
        if (random() < dt * 8) spawnParticles(car.x, car.y, 1, '#888888', 40, 0.8);
      }
      if (car.health <= 0 && !car.wreck) {
        car.wreck = true;
        spawnParticles(car.x, car.y, 24, '#ff8833', 220, 0.9);
        spawnParticles(car.x, car.y, 16, '#555555', 90, 1.4);
        flash('Your car is wrecked! Get out and run.', 3);
        exitCar();
      }
      player.x = car.x;
      player.y = car.y;
      player.angle = car.angle;
      if (ctl.fire && player.fireCooldown <= 0 && player.reload <= 0 && player.ammo > 0) {
        player.fireCooldown = WEAPON.pistolRate;
        player.ammo -= 1;
        state.stats.shotsFired += 1;
        fireBullet(car.x, car.y, ctl.aimAngle, true, WEAPON.pistolDamage);
        events |= EVENT_SHOT;
        events |= addWanted(0.4);
      }
      if (ctl.enter) exitCar();
      return events;
    }

    // On foot.
    const speed = ctl.sprint ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
    let mx = ctl.moveX;
    let my = ctl.moveY;
    const len = Math.sqrt(mx * mx + my * my);
    if (len > 1) {
      mx /= len;
      my /= len;
    }
    player.x = clamp(player.x + mx * speed * dt, 20, WORLD.width - 20);
    player.y = clamp(player.y + my * speed * dt, 20, WORLD.height - 20);
    const fixed = collideCircleBuildings(city, player.x, player.y, PLAYER.radius);
    player.x = fixed.x;
    player.y = fixed.y;
    if (mx !== 0 || my !== 0) player.angle = Math.atan2(my, mx);
    else if (ctl.aimAngle !== undefined) player.angle = ctl.aimAngle;

    if (ctl.fire && player.fireCooldown <= 0 && player.reload <= 0) {
      if (player.ammo > 0) {
        player.fireCooldown = WEAPON.pistolRate;
        player.ammo -= 1;
        state.stats.shotsFired += 1;
        fireBullet(player.x + Math.cos(player.angle) * 16, player.y + Math.sin(player.angle) * 16, player.angle, true, WEAPON.pistolDamage);
        events |= EVENT_SHOT;
        events |= addWanted(0.5);
      } else {
        player.reload = WEAPON.reloadTime;
      }
    }
    if (ctl.reload && player.ammo < WEAPON.magSize && player.reload <= 0) player.reload = WEAPON.reloadTime;
    if (ctl.punch && player.punchCooldown <= 0) {
      player.punchCooldown = 0.45;
      let hitAny = false;
      for (const ped of peds) {
        if (ped.down) continue;
        if (dist(player.x, player.y, ped.x, ped.y) < PLAYER.punchRange + 12) {
          ped.health -= PLAYER.punchDamage;
          ped.flee = 5;
          hitAny = true;
          if (ped.health <= 0) {
            ped.down = true;
            events |= addWanted(WANTED.hitPed);
            spawnPickup(ped.x, ped.y, 'cash');
          }
        }
      }
      if (!hitAny) {
        // Punch the air: nothing.
      } else {
        events |= EVENT_SHOT;
      }
    }
    if (ctl.enter) {
      const near = nearestCar(player.x, player.y, 78);
      if (near) enterCar(near);
    }
    if (ctl.interact) {
      const step = currentStep();
      if (step && (step.type === 'pickup' || step.type === 'grab')) {
        const t = step.target;
        if (dist(player.x, player.y, t.x, t.y) < step.radius + 30) advanceMission();
      }
    }
    return events;
  }

  function stepTraffic(dt) {
    for (const car of cars) {
      if (car.kind !== 'traffic') continue;
      // Slow for the car ahead in the same lane.
      let ahead = null;
      let aheadDist = 90;
      for (const other of cars) {
        if (other === car || other.kind === 'parked') continue;
        const dx = other.x - car.x;
        const dy = other.y - car.y;
        const along = dx * Math.cos(car.angle) + dy * Math.sin(car.angle);
        const across = Math.abs(-dx * Math.sin(car.angle) + dy * Math.cos(car.angle));
        if (along > 0 && along < aheadDist && across < 24) {
          aheadDist = along;
          ahead = other;
        }
      }
      car.cruise = car.cruise || range(random, TRAFFIC.minSpeed, TRAFFIC.maxSpeed);
      const want = ahead ? Math.min(car.cruise, ahead.speed) : car.cruise;
      car.speed += clamp(want - car.speed, -260 * dt, 160 * dt);
      car.x += Math.cos(car.angle) * car.speed * dt;
      car.y += Math.sin(car.angle) * car.speed * dt;
      // At an intersection, sometimes turn onto the cross road.
      const roadX = nearestRoad(car.x);
      const roadY = nearestRoad(car.y);
      const onCross = Math.abs(car.x - roadX) < 6 && Math.abs(car.y - roadY) < 6;
      if (onCross && random() < dt * 0.35) {
        const turn = random() < 0.5 ? 1 : -1;
        if (car.trafficAxis === 'v') {
          car.trafficAxis = 'h';
          car.trafficRoad = roadY;
          car.angle = turn > 0 ? 0 : Math.PI;
          car.trafficDir = turn;
          car.y = roadY + (turn > 0 ? 22 : -22);
        } else {
          car.trafficAxis = 'v';
          car.trafficRoad = roadX;
          car.angle = turn > 0 ? Math.PI / 2 : -Math.PI / 2;
          car.trafficDir = turn;
          car.x = roadX + (turn > 0 ? 22 : -22);
        }
      }
      // Wrap around the map edges so traffic never runs out.
      if (car.x < 60) car.x = WORLD.width - 80;
      if (car.x > WORLD.width - 60) car.x = 80;
      if (car.y < 60) car.y = WORLD.height - 80;
      if (car.y > WORLD.height - 60) car.y = 80;
    }
    // Car-to-car bumps.
    for (let i = 0; i < cars.length; i += 1) {
      for (let j = i + 1; j < cars.length; j += 1) {
        const a = cars[i];
        const b = cars[j];
        if (a.kind === 'parked' || b.kind === 'parked') continue;
        if (carOverlaps(a, b)) {
          const push = 30;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const d = Math.sqrt(dx * dx + dy * dy) || 1;
          a.x -= (dx / d) * push * 0.5;
          a.y -= (dy / d) * push * 0.5;
          b.x += (dx / d) * push * 0.5;
          b.y += (dy / d) * push * 0.5;
          a.speed *= 0.7;
          b.speed *= 0.7;
          if (a.kind === 'player' || b.kind === 'player') {
            const pc = a.kind === 'player' ? a : b;
            pc.health -= 1;
            if (random() < 0.1) spawnParticles((a.x + b.x) / 2, (a.y + b.y) / 2, 4, '#ffcc33', 100, 0.4);
          }
        }
      }
    }
  }

  function stepPeds(dt) {
    for (const ped of peds) {
      if (ped.down) continue;
      ped.walkPhase += dt * 6;
      if (ped.flee > 0) {
        ped.flee -= dt;
        const away = angleTo(player.x, player.y, ped.x, ped.y);
        ped.x = clamp(ped.x + Math.cos(away) * 150 * dt, 20, WORLD.width - 20);
        ped.y = clamp(ped.y + Math.sin(away) * 150 * dt, 20, WORLD.height - 20);
        ped.angle = away;
        continue;
      }
      if (ped.wait > 0) {
        ped.wait -= dt;
        continue;
      }
      const speed = PEDS.walkSpeed;
      if (ped.axis === 'v') {
        ped.y += ped.dir * speed * dt;
        ped.angle = ped.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
        if (ped.y < 140 || ped.y > WORLD.height - 140) ped.dir *= -1;
      } else {
        ped.x += ped.dir * speed * dt;
        ped.angle = ped.dir > 0 ? 0 : Math.PI;
        if (ped.x < 140 || ped.x > WORLD.width - 140) ped.dir *= -1;
      }
      // At an intersection, sometimes turn or pause.
      const roadX = nearestRoad(ped.x);
      const roadY = nearestRoad(ped.y);
      if (Math.abs(ped.x - roadX) < 4 && Math.abs(ped.y - roadY) < 4 && random() < dt * 0.5) {
        if (random() < 0.3) {
          ped.wait = range(random, 1, 3);
        } else {
          const newAxis = ped.axis === 'v' ? 'h' : 'v';
          ped.axis = newAxis;
          ped.dir = random() < 0.5 ? 1 : -1;
          if (newAxis === 'v') ped.x = roadX + 60 * ped.side;
          else ped.y = roadY + 60 * ped.side;
        }
      }
      const fixed = collideCircleBuildings(city, ped.x, ped.y, 12);
      ped.x = fixed.x;
      ped.y = fixed.y;
    }
  }

  function spawnPoliceCar() {
    const edge = pick(random, ['n', 's', 'e', 'w']);
    let x = 0;
    let y = 0;
    if (edge === 'n') { x = pick(random, CITY.roads); y = 180; }
    if (edge === 's') { x = pick(random, CITY.roads); y = WORLD.height - 180; }
    if (edge === 'e') { x = WORLD.width - 180; y = pick(random, CITY.roads); }
    if (edge === 'w') { x = 180; y = pick(random, CITY.roads); }
    const car = makeCar(nextCarId++, x, y, angleTo(x, y, player.x, player.y), PALETTE.policeCar, 'sedan', 'police');
    car.speed = POLICE.carSpeed * 0.6;
    cars.push(car);
    return car;
  }

  function stepPolice(dt) {
    const wantCars = Math.min(state.wanted, POLICE.maxCars);
    let haveCars = 0;
    for (const car of cars) if (car.kind === 'police') haveCars += 1;
    if (state.wanted > 0 && haveCars < wantCars && random() < dt * 0.8) spawnPoliceCar();
    // Remove police cars that fell far behind when the heat is off.
    if (state.wanted === 0) {
      for (let i = cars.length - 1; i >= 0; i -= 1) {
        if (cars[i].kind === 'police' && dist(cars[i].x, cars[i].y, player.x, player.y) > 1400) cars.splice(i, 1);
      }
    }
    for (const car of cars) {
      if (car.kind !== 'police') continue;
      car.siren += dt;
      const targetAngle = angleTo(car.x, car.y, player.x, player.y);
      const diff = angleDiff(car.angle, targetAngle);
      car.angle += clamp(diff, -2.4 * dt, 2.4 * dt);
      car.speed = clamp(car.speed + 320 * dt, 0, POLICE.carSpeed);
      car.x += Math.cos(car.angle) * car.speed * dt;
      car.y += Math.sin(car.angle) * car.speed * dt;
      car.x = clamp(car.x, 30, WORLD.width - 30);
      car.y = clamp(car.y, 30, WORLD.height - 30);
      if (collideCarBuildings(city, car)) car.speed *= 0.5;
      const d = dist(car.x, car.y, player.x, player.y);
      if (d < 60) {
        // Ram.
        if (player.inCar) {
          const pc = playerCar();
          if (pc) {
            pc.health -= 14 * dt * 4;
            car.speed *= 0.6;
            if (random() < dt * 6) spawnParticles(car.x, car.y, 3, '#ffcc33', 120, 0.4);
          }
        } else if (player.invulnerable <= 0) {
          player.health -= 22 * dt * 4;
          player.invulnerable = 0.4;
        }
      }
      // Drop a foot officer when close to a player on foot.
      if (!player.inCar && d < 260 && policeFoot.length < POLICE.maxFoot && random() < dt * 0.5) {
        policeFoot.push({
          x: car.x + 30, y: car.y + 30, angle: targetAngle,
          health: 60, fireCooldown: range(random, 0.4, 1), arrest: 0, walkPhase: 0,
        });
      }
    }
    for (let i = policeFoot.length - 1; i >= 0; i -= 1) {
      const cop = policeFoot[i];
      cop.walkPhase += dt * 6;
      const d = dist(cop.x, cop.y, player.x, player.y);
      if (state.wanted === 0 || d > 900) {
        policeFoot.splice(i, 1);
        continue;
      }
      const targetAngle = angleTo(cop.x, cop.y, player.x, player.y);
      cop.angle = targetAngle;
      if (d > 46) {
        cop.x += Math.cos(targetAngle) * POLICE.footSpeed * dt;
        cop.y += Math.sin(targetAngle) * POLICE.footSpeed * dt;
        const fixed = collideCircleBuildings(city, cop.x, cop.y, 12);
        cop.x = fixed.x;
        cop.y = fixed.y;
        cop.arrest = 0;
      } else {
        cop.arrest += dt;
        if (cop.arrest > 1.6) {
          player.health = 0;
          state.stats.arrests += 1;
          flash('BUSTED! The Solmar Bay PD hauled you in.', 4);
        }
      }
      cop.fireCooldown -= dt;
      if (d < 320 && d > 60 && cop.fireCooldown <= 0 && !player.inCar) {
        cop.fireCooldown = range(random, 0.9, 1.6);
        fireBullet(cop.x, cop.y, targetAngle + range(random, -0.08, 0.08), false, 9);
      }
    }
  }

  function stepBullets(dt) {
    for (let i = bullets.length - 1; i >= 0; i -= 1) {
      const b = bullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      let dead = b.life <= 0 || b.x < 0 || b.y < 0 || b.x > WORLD.width || b.y > WORLD.height;
      if (!dead) {
        // Buildings stop bullets.
        if (circleHitsBuilding(city, b.x, b.y, 2)) dead = true;
      }
      if (!dead && b.friendly) {
        for (const ped of peds) {
          if (ped.down) continue;
          if (dist(b.x, b.y, ped.x, ped.y) < 16) {
            ped.health -= b.damage;
            ped.flee = 6;
            dead = true;
            spawnParticles(b.x, b.y, 5, '#e5534b', 90, 0.4);
            if (ped.health <= 0) {
              ped.down = true;
              addWanted(WANTED.hitPed);
              spawnPickup(ped.x, ped.y, 'cash');
            }
            break;
          }
        }
        if (!dead) {
          for (const cop of policeFoot) {
            if (dist(b.x, b.y, cop.x, cop.y) < 16) {
              cop.health -= b.damage;
              dead = true;
              spawnParticles(b.x, b.y, 5, '#e5534b', 90, 0.4);
              if (cop.health <= 0) {
                cop.health = -999;
                addWanted(WANTED.killCop);
              }
              break;
            }
          }
        }
        if (!dead) {
          for (const car of cars) {
            if (car.kind === 'player') continue;
            if (carOverlaps({ x: b.x, y: b.y, angle: 0 }, car)) {
              // Cheap point-in-car test via local frame.
              const dx = b.x - car.x;
              const dy = b.y - car.y;
              const along = Math.abs(dx * Math.cos(car.angle) + dy * Math.sin(car.angle));
              const across = Math.abs(-dx * Math.sin(car.angle) + dy * Math.cos(car.angle));
              if (along < 30 && across < 15) {
                car.health -= b.damage;
                dead = true;
                spawnParticles(b.x, b.y, 4, '#ffcc33', 100, 0.3);
                if (car.health <= 0 && !car.wreck) {
                  car.wreck = true;
                  spawnParticles(car.x, car.y, 20, '#ff8833', 200, 0.8);
                  if (car.kind === 'police') addWanted(1);
                }
                break;
              }
            }
          }
        }
      }
      if (!dead && !b.friendly && !player.inCar) {
        if (dist(b.x, b.y, player.x, player.y) < 15 && player.invulnerable <= 0) {
          player.health -= b.damage;
          player.invulnerable = 0.3;
          dead = true;
          spawnParticles(b.x, b.y, 4, '#e5534b', 90, 0.4);
        }
      }
      if (!dead && !b.friendly && player.inCar) {
        const pc = playerCar();
        if (pc && dist(b.x, b.y, pc.x, pc.y) < 26) {
          pc.health -= b.damage * 0.4;
          dead = true;
        }
      }
      if (dead) bullets.splice(i, 1);
    }
    // Remove dead cops.
    for (let i = policeFoot.length - 1; i >= 0; i -= 1) {
      if (policeFoot[i].health <= 0) {
        spawnParticles(policeFoot[i].x, policeFoot[i].y, 8, '#e5534b', 100, 0.5);
        policeFoot.splice(i, 1);
      }
    }
  }

  function stepPickups(dt) {
    for (let i = pickups.length - 1; i >= 0; i -= 1) {
      const p = pickups[i];
      p.bob += dt * 3;
      if (dist(player.x, player.y, p.x, p.y) < 34) {
        if (p.kind === 'health') {
          player.health = Math.min(PLAYER.health, player.health + 40);
          flash('Health +40', 2);
        } else {
          state.money += 50;
          flash('Found $50', 2);
        }
        pickups.splice(i, 1);
      }
    }
  }

  function advanceMission() {
    const mission = currentMission();
    if (!mission) return;
    const steps = missionSteps(mission.id);
    state.missionStep += 1;
    if (state.missionStep >= steps.length) {
      state.money += mission.reward;
      state.stats.missionsDone += 1;
      flash(`Mission complete: ${mission.title} — +$${mission.reward}`, 5);
      say('Marla', `Good work, Dana. $${mission.reward} is yours.`, 4);
      state.missionIndex += 1;
      state.missionStep = 0;
      const next = currentMission();
      if (next) {
        for (const line of DIALOGUE[next.id]) say(line[0], line[1], 5);
        flash(`New mission: ${next.title} — ${next.brief}`, 6);
        if (next.id === 'heat') {
          state.wantedFloat = 3;
          state.wanted = 3;
          state.wantedTimer = 0;
          flash('The cops are on you — 3 stars!', 4);
        }
      } else {
        state.storyDone = true;
        state.missionActive = false;
        flash('Story complete! Solmar Bay is yours — free roam.', 6);
        say('Marla', 'That\u2019s the whole board, Dana. The city is yours now.', 5);
      }
    }
  }

  function stepMissions(dt) {
    const mission = currentMission();
    if (!mission || !state.missionActive) return 0;
    const step = currentStep();
    if (!step) return 0;
    const t = step.target;
    const d = dist(player.x, player.y, t.x, t.y);
    if (step.type === 'goto' && d < step.radius) {
      advanceMission();
      return EVENT_MISSION;
    }
    if ((step.type === 'pickup' || step.type === 'grab') && d < step.radius) {
      // Walking into the marker grabs it (Q also works).
      advanceMission();
      if (step.type === 'grab') {
        addWanted(2);
        flash('Cash case grabbed! Run!', 3);
      }
      return EVENT_MISSION;
    }
    if (step.type === 'steal') {
      const car = playerCar();
      if (car && car.missionCar) {
        advanceMission();
        return EVENT_MISSION;
      }
      if (player.inCar) {
        // In the wrong car: nudge the player.
        if (d < step.radius && state.time % 1 < dt) flash('That\u2019s not the coupe. The crimson one!', 2);
      }
    }
    if (step.type === 'deliver') {
      const car = playerCar();
      if (car && car.missionCar && d < step.radius) {
        advanceMission();
        return EVENT_MISSION;
      }
    }
    if (step.type === 'escape') {
      if (d < step.radius) {
        state.wantedFloat = 0;
        state.wanted = 0;
        advanceMission();
        return EVENT_MISSION;
      }
    }
    return 0;
  }

  function stepWanted(dt) {
    if (state.wantedFloat <= 0) {
      state.wanted = 0;
      return;
    }
    state.wantedTimer += dt;
    if (state.wantedTimer > WANTED.decayDelay) {
      // Wanted fades only when no police car is close.
      let nearCop = false;
      for (const car of cars) {
        if (car.kind === 'police' && dist(car.x, car.y, player.x, player.y) < 500) {
          nearCop = true;
          break;
        }
      }
      if (!nearCop && policeFoot.length === 0) {
        state.wantedFloat = Math.max(0, state.wantedFloat - WANTED.decayRate * dt);
        state.wanted = Math.ceil(state.wantedFloat);
      }
    }
  }

  function stepParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i -= 1) {
      const p = particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.pow(0.2, dt);
      p.vy *= Math.pow(0.2, dt);
      p.life -= dt;
      if (p.life <= 0) particles.splice(i, 1);
    }
    for (let i = skids.length - 1; i >= 0; i -= 1) {
      skids[i].life -= dt;
      if (skids[i].life <= 0) skids.splice(i, 1);
    }
  }

  /**
   * One fixed step. `ctl` carries the player's intent for this step:
   * moveX/moveY (-1..1), sprint, brake, aimAngle, fire, enter, punch,
   * reload, interact. With `harmless` set (the title screen's backdrop) the
   * city lives but nothing can hurt or score.
   */
  function step(dt, ctl, harmless) {
    let events = 0;
    state.time += dt;
    state.clock = (17.5 + state.time / 90) % 24;

    if (!harmless) events |= stepPlayer(dt, ctl);
    else {
      // Title backdrop: traffic and peds drift, player idles.
      player.angle += dt * 0.2;
    }
    stepTraffic(dt);
    stepPeds(dt);
    if (!harmless) {
      stepPolice(dt);
      stepBullets(dt);
      stepPickups(dt);
      events |= stepMissions(dt);
      stepWanted(dt);
      // Car-vs-pedestrian: a fast car hitting a ped is a crime.
      const pc = playerCar();
      if (pc && Math.abs(pc.speed) > 120) {
        for (const ped of peds) {
          if (ped.down) continue;
          if (dist(pc.x, pc.y, ped.x, ped.y) < 26) {
            ped.down = true;
            ped.health = 0;
            events |= addWanted(WANTED.hitPed);
            spawnParticles(ped.x, ped.y, 8, '#e5534b', 120, 0.5);
            spawnPickup(ped.x, ped.y, 'cash');
            pc.health -= 4;
          }
        }
      }
    }
    stepParticles(dt);

    // Camera follows smoothly.
    const targetX = clamp(player.x, 640, WORLD.width - 640);
    const targetY = clamp(player.y, 360, WORLD.height - 360);
    state.camera.x += (targetX - state.camera.x) * Math.min(1, dt * 5);
    state.camera.y += (targetY - state.camera.y) * Math.min(1, dt * 5);

    if (player.health <= 0 && !player.dead) {
      player.dead = true;
      events |= EVENT_OVER;
    }
    return events;
  }

  function dayFactor() {
    // 0 = deep night, 1 = bright day. Golden hour at 17:30 start.
    const hour = state.clock;
    if (hour >= 7 && hour < 16) return 1;
    if (hour >= 16 && hour < 19) return 0.85;
    if (hour >= 19 && hour < 20) return 0.55;
    if (hour >= 20 || hour < 5) return 0.3;
    if (hour >= 5 && hour < 7) return 0.6;
    return 1;
  }

  reset();
  return {
    state, reset, step, currentMission, currentStep, dayFactor,
    playerCar, nearestCar, enterCar, exitCar, addWanted, say, flash,
    missionSteps, spawnPoliceCar,
  };
}

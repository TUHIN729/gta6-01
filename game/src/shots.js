// The screenshot scenes behind ?shot=start|play|chase|end. Each one plays the
// real rules forward from a fresh world for a fixed number of steps, steered
// by a simple autopilot (drive toward the mission marker, steer around
// buildings, keep the throttle down), so the frame is what real play looks
// like and the same seed always gives the same frame.
import { CITY, STEP, WORLD } from './config.js';
import { PLACES, circleHitsBuilding } from './city.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const START_SECONDS = 4;
const PLAY_SECONDS = 14;
const CHASE_SECONDS = 12;
const END_SECONDS = 9;

function angleDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

/**
 * Steer a car toward a target: throttle on, steer by the angle to the target,
 * and swerve when a building sits right ahead.
 */
function driveToward(state, targetX, targetY) {
  const car = state.player.inCar ? state.cars.find((c) => c.id === state.player.carId) : null;
  if (!car) return { moveX: 0, moveY: 0, sprint: false, brake: false, aimAngle: 0, fire: false, enter: false, punch: false, reload: false, interact: false };
  const targetAngle = Math.atan2(targetY - car.y, targetX - car.x);
  let steer = clamp(angleDiff(car.angle, targetAngle) * 1.6, -1, 1);
  // Look ahead: if a building blocks the nose, steer hard away.
  const aheadX = car.x + Math.cos(car.angle) * 90;
  const aheadY = car.y + Math.sin(car.angle) * 90;
  if (circleHitsBuilding(state.city, aheadX, aheadY, 20)) steer = steer >= 0 ? 1 : -1;
  return {
    moveX: steer, moveY: -1, sprint: false, brake: false,
    aimAngle: targetAngle, fire: false, enter: false, punch: false, reload: false, interact: false,
  };
}

/** Walk toward a target on foot, with a simple sidestep around buildings. */
function walkToward(state, targetX, targetY) {
  const dx = targetX - state.player.x;
  const dy = targetY - state.player.y;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  let mx = dx / len;
  let my = dy / len;
  const aheadX = state.player.x + mx * 40;
  const aheadY = state.player.y + my * 40;
  if (circleHitsBuilding(state.city, aheadX, aheadY, 16)) {
    const tmp = mx;
    mx = -my;
    my = tmp;
  }
  return {
    moveX: mx, moveY: my, sprint: false, brake: false,
    aimAngle: Math.atan2(dy, dx), fire: false, enter: false, punch: false, reload: false, interact: false,
  };
}

function idleControl() {
  return { moveX: 0, moveY: 0, sprint: false, brake: false, aimAngle: 0, fire: false, enter: false, punch: false, reload: false, interact: false };
}

/**
 * Set `world` to the named scene and return the screen to draw over it and
 * the best money to show. start = title over the living city; play = driving
 * the first mission; chase = a three-star police chase; end = busted/wasted.
 */
export function stageShot(name, world) {
  const state = world.state;
  world.reset();
  if (name === 'play') {
    // Put Dana in a car near the garage and drive toward the docks (mission 1).
    const car = state.cars.find((c) => c.kind === 'parked');
    if (car) world.enterCar(car);
    for (let i = 0; i < PLAY_SECONDS / STEP; i += 1) {
      const step = world.currentStep();
      const target = step ? step.target : PLACES.docks;
      world.step(STEP, driveToward(state, target.x, target.y), false);
    }
    return { screen: SCREEN_PLAY, best: 0 };
  }
  if (name === 'chase') {
    // Three stars, police on the tail, Dana driving along Meridian Row.
    const car = state.cars.find((c) => c.kind === 'parked');
    if (car) world.enterCar(car);
    world.addWanted(3);
    world.spawnPoliceCar();
    world.spawnPoliceCar();
    for (let i = 0; i < CHASE_SECONDS / STEP; i += 1) {
      const target = { x: 2700, y: 1620 };
      world.step(STEP, driveToward(state, target.x, target.y), false);
    }
    return { screen: SCREEN_PLAY, best: 0 };
  }
  if (name === 'end') {
    // On foot at the bank, surrounded, health gone: the WASTED screen.
    state.player.x = PLACES.bank.x;
    state.player.y = PLACES.bank.y;
    state.player.health = 1;
    world.addWanted(2);
    world.spawnPoliceCar();
    for (let i = 0; i < END_SECONDS / STEP; i += 1) {
      const ctl = walkToward(state, PLACES.safehouse.x, PLACES.safehouse.y);
      world.step(STEP, ctl, false);
      if (state.player.dead) break;
    }
    if (!state.player.dead) {
      state.player.health = 0;
      state.player.dead = true;
    }
    return { screen: SCREEN_OVER, best: 0 };
  }
  // start (and any unknown name): title over a living city.
  for (let i = 0; i < START_SECONDS / STEP; i += 1) world.step(STEP, idleControl(), true);
  return { screen: SCREEN_TITLE, best: 0 };
}

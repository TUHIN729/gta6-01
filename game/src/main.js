// Harbor Heat — boot and the one loop. Input is read every frame, the world
// advances in fixed 1/60 s steps, and the renderer paints what is there. The
// game moves between title, play, paused, game over and story-complete
// screens, and progress (money, mission, best) saves to localStorage so a
// Continue button can pick the story back up.
//
// ?seed=N fixes the city. ?shot=start|play|chase|end (with &seed=N) stages
// that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.
import { BEST_KEY, SAVE_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld, EVENT_HIT, EVENT_MISSION, EVENT_OVER, EVENT_PICKUP, EVENT_SHOT, EVENT_WANTED_UP } from './world.js';
import { ACTION_CONFIRM, ACTION_ENTER, ACTION_INTERACT, ACTION_MUTE, ACTION_PAUSE, ACTION_PUNCH, ACTION_RELOAD, createInput } from './input.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './render.js';
import { createAudio } from './audio.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall is dropped. */
const MAX_FRAME = 0.25;
const AUTOSAVE_SECONDS = 10;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : 20261117;

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();
const state = world.state;

// Read-only state probe (used by automated smoke tests, not by the game).
window.__debugState = () => ({
  x: Math.round(state.player.x),
  y: Math.round(state.player.y),
  inCar: state.player.inCar,
  health: Math.round(state.player.health),
  money: state.money,
  wanted: state.wanted,
  mission: state.missionIndex,
  step: state.missionStep,
  time: Math.round(state.time * 10) / 10,
});

function readJson(key) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJson(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can be off: progress then lasts this visit only.
  }
}

function readBest() {
  const saved = readJson(BEST_KEY);
  return saved && typeof saved.money === 'number' ? saved.money : 0;
}

function saveGame() {
  writeJson(SAVE_KEY, {
    money: state.money,
    missionIndex: state.missionIndex,
    missionStep: state.missionStep,
    storyDone: state.storyDone,
    stats: state.stats,
  });
  writeJson(BEST_KEY, { money: Math.max(readBest(), state.money) });
}

function loadGame() {
  const saved = readJson(SAVE_KEY);
  if (!saved) return false;
  state.money = saved.money || 0;
  state.missionIndex = saved.missionIndex || 0;
  state.missionStep = saved.missionStep || 0;
  state.storyDone = !!saved.storyDone;
  if (saved.stats) state.stats = saved.stats;
  state.missionActive = !state.storyDone;
  return true;
}

function runShot(name) {
  const scene = stageShot(name, world);
  // The staged scenes are real play: expose the marker and objective for the HUD.
  syncHudState();
  let painted = 0;
  function paint() {
    renderer.draw(state, scene.screen, scene.best, world.dayFactor());
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

/** Push the current mission's target and label onto the state for the HUD. */
function syncHudState() {
  const step = world.currentStep();
  if (step) {
    state.markerTarget = step.target;
    state.objectiveLabel = step.label;
  } else {
    state.markerTarget = null;
    state.objectiveLabel = null;
  }
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let hasSave = readJson(SAVE_KEY) !== null;
  state.hasSave = hasSave;
  let accumulator = 0;
  let last = performance.now();
  let autosaveTimer = 0;
  let winShown = false;

  function announce(message) {
    status.textContent = message;
  }

  function buildControl() {
    const axes = input.axes();
    const mouse = input.mouse();
    // Convert the mouse position from screen pixels into world coordinates.
    const rect = canvas.getBoundingClientRect();
    const scaleX = 1280 / rect.width;
    const scaleY = 720 / rect.height;
    const viewX = mouse.x * scaleX;
    const viewY = mouse.y * scaleY;
    const camX = Math.max(640, Math.min(3600 - 640, state.camera.x));
    const camY = Math.max(360, Math.min(3600 - 360, state.camera.y));
    const worldX = camX + viewX - 640;
    const worldY = camY + viewY - 360;
    state.mouse = { x: viewX, y: viewY };
    const actions = input.takeActions();
    return {
      moveX: axes.x,
      moveY: axes.y,
      sprint: input.sprint(),
      brake: input.handbrake(),
      aimAngle: Math.atan2(worldY - state.player.y, worldX - state.player.x),
      fire: mouse.down,
      enter: (actions & ACTION_ENTER) !== 0,
      punch: (actions & ACTION_PUNCH) !== 0,
      reload: (actions & ACTION_RELOAD) !== 0,
      interact: (actions & ACTION_INTERACT) !== 0,
      actions,
    };
  }

  function startGame(fresh) {
    world.reset();
    if (!fresh && loadGame()) {
      state.hasSave = true;
      announce('Continuing your story.');
    }
    accumulator = 0;
    screen = SCREEN_PLAY;
    audio.unlock();
    announce('Playing. Follow the yellow marker.');
  }

  function endGame() {
    screen = SCREEN_OVER;
    saveGame();
    audio.fail();
    announce(state.stats.arrests > 0 ? 'Busted.' : 'Wasted.');
  }

  function handleActions(ctl) {
    const actions = ctl.actions;
    if (actions & ACTION_MUTE) {
      const muted = audio.toggleMute();
      announce(muted ? 'Muted.' : 'Sound on.');
    }
    if (actions & ACTION_CONFIRM && screen === SCREEN_TITLE) {
      startGame(false);
      return;
    }
    if (actions & ACTION_CONFIRM && (screen === SCREEN_OVER || screen === SCREEN_WIN)) {
      startGame(true);
      return;
    }
    if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      saveGame();
      announce('Paused.');
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Playing.');
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    const ctl = buildControl();
    handleActions(ctl);
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        const harmless = screen === SCREEN_TITLE;
        const events = world.step(STEP, ctl, harmless);
        accumulator -= STEP;
        if (events & EVENT_OVER) endGame();
        else if (events & EVENT_SHOT) audio.shoot();
        else if (events & EVENT_PICKUP) audio.pickup();
        else if (events & EVENT_MISSION) {
          audio.mission();
          saveGame();
        } else if (events & EVENT_WANTED_UP) {
          announce('Wanted level up.');
        }
        if (events & EVENT_HIT) announce('Hit.');
        if (screen === SCREEN_PLAY) {
          // Engine hum and sirens follow the live state.
          const car = world.playerCar();
          audio.engine(car ? Math.abs(car.speed) / 520 : 0);
          audio.siren(state.wanted > 0);
          autosaveTimer += STEP;
          if (autosaveTimer > AUTOSAVE_SECONDS) {
            autosaveTimer = 0;
            saveGame();
          }
          if (state.storyDone && !winShown) {
            winShown = true;
            screen = SCREEN_WIN;
            saveGame();
          }
        }
      }
    } else {
      accumulator = 0;
      audio.engine(0);
      audio.siren(false);
    }
    syncHudState();
    renderer.draw(state, screen, best, world.dayFactor());
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      saveGame();
      announce('Paused.');
    }
  });

  announce('Harbor Heat. Press Space or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();

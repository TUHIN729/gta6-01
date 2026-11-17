// Keyboard and mouse input for Harbor Heat. Held keys give movement and driving
// axes; one-shot presses (enter car, shoot, punch, pause, mute, reload, interact)
// are queued as bit flags and taken once by the loop, so a press between two
// frames is never lost and never counted twice.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_ENTER = 4;
export const ACTION_SHOOT = 8;
export const ACTION_PUNCH = 16;
export const ACTION_RELOAD = 32;
export const ACTION_MUTE = 64;
export const ACTION_INTERACT = 128;

const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const ENTER = new Set(['KeyE']);
const PUNCH = new Set(['KeyF']);
const RELOAD = new Set(['KeyR']);
const MUTE = new Set(['KeyM']);
const INTERACT = new Set(['KeyQ']);
const SPRINT = new Set(['ShiftLeft', 'ShiftRight']);

export function createInput(canvas) {
  const held = new Set();
  let actions = 0;
  let mouseX = 0;
  let mouseY = 0;
  let mouseDown = false;

  function codeOf(event) {
    return event.code;
  }

  window.addEventListener('keydown', (event) => {
    const code = codeOf(event);
    held.add(code);
    if (event.repeat) return;
    if (CONFIRM.has(code)) actions |= ACTION_CONFIRM;
    else if (PAUSE.has(code)) actions |= ACTION_PAUSE;
    else if (ENTER.has(code)) actions |= ACTION_ENTER;
    else if (PUNCH.has(code)) actions |= ACTION_PUNCH;
    else if (RELOAD.has(code)) actions |= ACTION_RELOAD;
    else if (MUTE.has(code)) actions |= ACTION_MUTE;
    else if (INTERACT.has(code)) actions |= ACTION_INTERACT;
    else return;
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    held.delete(codeOf(event));
  });
  window.addEventListener('blur', () => {
    held.clear();
    mouseDown = false;
  });
  canvas.addEventListener('pointermove', (event) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = event.clientX - rect.left;
    mouseY = event.clientY - rect.top;
  });
  canvas.addEventListener('pointerdown', (event) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = event.clientX - rect.left;
    mouseY = event.clientY - rect.top;
    mouseDown = true;
    if (event.button === 0) actions |= ACTION_SHOOT;
    actions |= ACTION_CONFIRM;
  });
  window.addEventListener('pointerup', () => {
    mouseDown = false;
  });

  function hasAny(set) {
    for (const code of set) if (held.has(code)) return true;
    return false;
  }

  return {
    /** Movement axes: -1..1 on x (left/right) and y (up/down), screen space. */
    axes() {
      const x = (hasAny(RIGHT) ? 1 : 0) - (hasAny(LEFT) ? 1 : 0);
      const y = (hasAny(DOWN) ? 1 : 0) - (hasAny(UP) ? 1 : 0);
      return { x, y };
    },
    sprint() {
      return hasAny(SPRINT);
    },
    handbrake() {
      return held.has('Space');
    },
    mouse() {
      return { x: mouseX, y: mouseY, down: mouseDown };
    },
    /** One-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}

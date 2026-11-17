// Drawing only: the world's state and the current screen in, pixels out. The
// 1280x720 logical view is scaled to fit the window and centred. Top-down
// city, cars, people, particles, then the HUD (health, money, wanted stars,
// clock, mission objective, minimap), dialogue and menus. Flat canvas shapes
// and canvas text; nothing is fetched.

import { CITY, FONT, GAME_SUBTITLE, GAME_TITLE, MISSIONS, PALETTE, ROAD, VIEW, WORLD } from './config.js';
import { onRoad } from './city.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_WIN = 'win';

const MINIMAP = { x: VIEW.width - 216, y: 16, size: 200 };
const PANEL = { width: 640, top: 150, line: 32, bottom: 64 };

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

function roundRect(context, x, y, w, h, r) {
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + w, y, x + w, y + h, r);
  context.arcTo(x + w, y + h, x, y + h, r);
  context.arcTo(x, y + h, x, y, r);
  context.arcTo(x, y, x + w, y, r);
  context.closePath();
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const fonts = new Map();

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / VIEW.width, height / VIEW.height);
    view.x = (width - VIEW.width * view.scale) / 2;
    view.y = (height - VIEW.height * view.scale) / 2;
  }

  function text(value, x, y, size, color, align, weight) {
    const key = `${weight || ''}${size}`;
    if (!fonts.has(key)) fonts.set(key, `${weight ? weight + ' ' : ''}${size}px ${FONT}`);
    context.font = fonts.get(key);
    context.fillStyle = color;
    context.textAlign = align || 'left';
    context.fillText(value, x, y);
  }

  function drawGround(state, camX, camY) {
    const x0 = camX - VIEW.width / 2;
    const y0 = camY - VIEW.height / 2;
    const x1 = camX + VIEW.width / 2;
    const y1 = camY + VIEW.height / 2;
    // Grass base.
    context.fillStyle = PALETTE.grass;
    context.fillRect(x0, y0, VIEW.width, VIEW.height);
    // Mown stripes for texture.
    context.fillStyle = PALETTE.grassDark;
    const stripe = 180;
    for (let gx = Math.floor(x0 / stripe) * stripe; gx < x1; gx += stripe * 2) {
      context.fillRect(gx, y0, stripe, VIEW.height);
    }
    // Beach and water along the south edge.
    if (y1 > CITY.beachY) {
      context.fillStyle = PALETTE.sand;
      context.fillRect(x0, CITY.beachY, VIEW.width, CITY.waterY - CITY.beachY);
      context.fillStyle = PALETTE.water;
      context.fillRect(x0, CITY.waterY, VIEW.width, y1 - CITY.waterY);
      context.fillStyle = PALETTE.waterDeep;
      for (let wx = Math.floor(x0 / 120) * 120; wx < x1; wx += 120) {
        context.fillRect(wx, CITY.waterY + 26, 60, 4);
        context.fillRect(wx + 40, CITY.waterY + 70, 60, 4);
      }
    }
    // Parks.
    for (const park of state.city.parks) {
      if (park.x > x1 || park.x + park.width < x0 || park.y > y1 || park.y + park.height < y0) continue;
      context.fillStyle = PALETTE.park;
      context.fillRect(park.x, park.y, park.width, park.height);
    }
    // Sidewalks then roads.
    const half = ROAD.width / 2;
    for (const road of CITY.roads) {
      if (road + half > x0 && road - half < x1) {
        context.fillStyle = PALETTE.sidewalk;
        context.fillRect(road - half, y0, ROAD.width, VIEW.height);
      }
      if (road + half > y0 && road - half < y1) {
        context.fillStyle = PALETTE.sidewalk;
        context.fillRect(x0, road - half, VIEW.width, ROAD.width);
      }
    }
    const driveHalf = ROAD.width / 2 - 14;
    for (const road of CITY.roads) {
      if (road + driveHalf > x0 && road - driveHalf < x1) {
        context.fillStyle = PALETTE.road;
        context.fillRect(road - driveHalf, y0, driveHalf * 2, VIEW.height);
      }
      if (road + driveHalf > y0 && road - driveHalf < y1) {
        context.fillStyle = PALETTE.road;
        context.fillRect(x0, road - driveHalf, VIEW.width, driveHalf * 2);
      }
    }
    // Lane dashes.
    context.fillStyle = PALETTE.laneDash;
    for (const road of CITY.roads) {
      if (road > x0 && road < x1) {
        for (let y = Math.floor(y0 / 44) * 44; y < y1; y += 44) context.fillRect(road - 2, y, 4, 22);
      }
      if (road > y0 && road < y1) {
        for (let x = Math.floor(x0 / 44) * 44; x < x1; x += 44) context.fillRect(x, road - 2, 22, 4);
      }
    }
    // Buildings.
    for (const b of state.city.buildings) {
      if (b.x > x1 || b.x + b.width < x0 || b.y > y1 || b.y + b.height < y0) continue;
      context.fillStyle = PALETTE.buildingEdge;
      context.fillRect(b.x - 3, b.y - 3, b.width + 6, b.height + 6);
      context.fillStyle = b.roof;
      context.fillRect(b.x, b.y, b.width, b.height);
      context.fillStyle = 'rgba(255,255,255,0.16)';
      context.fillRect(b.x + 6, b.y + 6, b.width - 12, 10);
      // Windows.
      context.fillStyle = 'rgba(20,24,32,0.55)';
      const cols = Math.max(1, Math.floor(b.width / 34));
      const rows = Math.max(1, Math.floor(b.height / 34));
      for (let c = 0; c < cols; c += 1) {
        for (let r = 0; r < rows; r += 1) {
          context.fillRect(b.x + 10 + c * 34, b.y + 24 + r * 34, 16, 14);
        }
      }
      if (b.tall) {
        context.fillStyle = 'rgba(255,255,255,0.22)';
        context.fillRect(b.x + b.width / 2 - 8, b.y + b.height / 2 - 8, 16, 16);
      }
    }
    // Trees.
    for (const tree of state.city.trees) {
      if (tree.x < x0 - 20 || tree.x > x1 + 20 || tree.y < y0 - 20 || tree.y > y1 + 20) continue;
      context.fillStyle = 'rgba(0,0,0,0.25)';
      context.beginPath();
      context.arc(tree.x + 3, tree.y + 4, tree.r, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = tree.palm ? PALETTE.treeLight : PALETTE.tree;
      context.beginPath();
      context.arc(tree.x, tree.y, tree.r, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = PALETTE.treeLight;
      context.beginPath();
      context.arc(tree.x - 3, tree.y - 3, tree.r * 0.5, 0, Math.PI * 2);
      context.fill();
    }
  }

  function drawCarShape(car, isPlayer) {
    context.save();
    context.translate(car.x, car.y);
    context.rotate(car.angle);
    // Shadow.
    context.fillStyle = 'rgba(0,0,0,0.3)';
    roundRect(context, -26, -11, 54, 26, 8);
    context.fill();
    // Body.
    context.fillStyle = car.wreck ? '#55585e' : car.color;
    roundRect(context, -27, -13, 54, 26, 8);
    context.fill();
    // Roof and windshield.
    context.fillStyle = 'rgba(20,24,32,0.85)';
    context.fillRect(4, -9, 12, 18);
    context.fillStyle = car.wreck ? '#3a3d42' : 'rgba(255,255,255,0.25)';
    roundRect(context, -10, -10, 12, 20, 4);
    context.fill();
    // Wheels.
    context.fillStyle = '#14161a';
    context.fillRect(-20, -15, 10, 5);
    context.fillRect(-20, 10, 10, 5);
    context.fillRect(12, -15, 10, 5);
    context.fillRect(12, 10, 10, 5);
    // Headlights.
    context.fillStyle = '#fff6c8';
    context.fillRect(25, -10, 3, 5);
    context.fillRect(25, 5, 3, 5);
    if (car.kind === 'police') {
      const blink = Math.floor(car.siren * 4) % 2 === 0;
      context.fillStyle = blink ? '#ff2e2e' : '#2e6bff';
      context.beginPath();
      context.arc(-4, -6, 5, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = blink ? '#2e6bff' : '#ff2e2e';
      context.beginPath();
      context.arc(-4, 6, 5, 0, Math.PI * 2);
      context.fill();
    }
    if (isPlayer) {
      context.strokeStyle = '#ffd23e';
      context.lineWidth = 2;
      roundRect(context, -29, -15, 58, 30, 9);
      context.stroke();
    }
    context.restore();
  }

  function drawPerson(x, y, angle, color, phase, down) {
    context.save();
    context.translate(x, y);
    if (down) {
      context.rotate(angle + Math.PI / 2);
      context.fillStyle = color;
      context.beginPath();
      context.ellipse(0, 0, 12, 6, 0, 0, Math.PI * 2);
      context.fill();
      context.restore();
      return;
    }
    const bob = Math.sin(phase) * 2;
    context.rotate(angle);
    context.fillStyle = 'rgba(0,0,0,0.3)';
    context.beginPath();
    context.ellipse(0, 2, 11, 9, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = color;
    context.beginPath();
    context.arc(0, 0, 11, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#f2c9a0';
    context.beginPath();
    context.arc(4, 0, 5, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#2b2b30';
    context.fillRect(8 + bob * 0.4, -3, 7, 6);
    context.restore();
  }

  function drawWorld(state, camX, camY) {
    drawGround(state, camX, camY);
    const x0 = camX - VIEW.width / 2;
    const y0 = camY - VIEW.height / 2;
    const x1 = camX + VIEW.width / 2;
    const y1 = camY + VIEW.height / 2;
    // Skid marks.
    context.strokeStyle = 'rgba(20,20,24,0.5)';
    context.lineWidth = 4;
    for (const skid of state.skids) {
      context.save();
      context.translate(skid.x, skid.y);
      context.rotate(skid.angle);
      context.beginPath();
      context.moveTo(-14, -10);
      context.lineTo(14, -10);
      context.moveTo(-14, 10);
      context.lineTo(14, 10);
      context.stroke();
      context.restore();
    }
    // Mission marker beacon.
    const mission = state.missionActive && state.missionIndex < MISSIONS.length
      ? MISSIONS[state.missionIndex] : null;
    // Pickups.
    for (const p of state.pickups) {
      if (p.x < x0 || p.x > x1 || p.y < y0 || p.y > y1) continue;
      const bob = Math.sin(p.bob) * 3;
      context.fillStyle = p.kind === 'health' ? '#ff5252' : '#ffd23e';
      context.beginPath();
      context.arc(p.x, p.y + bob, 11, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#fff';
      if (p.kind === 'health') context.fillRect(p.x - 6, p.y + bob - 2, 12, 4);
      else text('$', p.x, p.y + bob + 5, 14, '#7a5a00', 'center', 'bold');
      if (p.kind === 'health') context.fillRect(p.x - 2, p.y + bob - 6, 4, 12);
    }
    // Cars.
    const playerCar = state.player.inCar ? state.player.carId : -1;
    for (const car of state.cars) {
      if (car.x < x0 - 60 || car.x > x1 + 60 || car.y < y0 - 60 || car.y > y1 + 60) continue;
      drawCarShape(car, car.id === playerCar);
    }
    // Pedestrians.
    for (const ped of state.peds) {
      if (ped.x < x0 || ped.x > x1 || ped.y < y0 || ped.y > y1) continue;
      drawPerson(ped.x, ped.y, ped.angle, ped.color, ped.walkPhase, ped.down);
    }
    // Foot police.
    for (const cop of state.policeFoot) {
      if (cop.x < x0 || cop.x > x1 || cop.y < y0 || cop.y > y1) continue;
      drawPerson(cop.x, cop.y, cop.angle, '#2f6fb2', cop.walkPhase, false);
      context.fillStyle = '#1d4a7a';
      context.beginPath();
      context.arc(cop.x, cop.y - 2, 6, 0, Math.PI * 2);
      context.fill();
    }
    // Bullets.
    context.strokeStyle = '#ffe27a';
    context.lineWidth = 3;
    for (const b of state.bullets) {
      context.beginPath();
      context.moveTo(b.x - b.vx * 0.02, b.y - b.vy * 0.02);
      context.lineTo(b.x, b.y);
      context.stroke();
    }
    // Particles.
    for (const p of state.particles) {
      context.globalAlpha = clamp(p.life / p.maxLife, 0, 1);
      context.fillStyle = p.color;
      context.beginPath();
      context.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
    // Player on foot.
    const player = state.player;
    if (!player.inCar && !player.dead) {
      const blink = player.invulnerable > 0 && Math.floor(player.invulnerable * 10) % 2 === 0;
      if (!blink) {
        drawPerson(player.x, player.y, player.angle, PALETTE.player, state.time * 8, false);
        // Aim line.
        context.strokeStyle = 'rgba(255,255,255,0.5)';
        context.lineWidth = 2;
        context.beginPath();
        context.moveTo(player.x + Math.cos(player.angle) * 16, player.y + Math.sin(player.angle) * 16);
        context.lineTo(player.x + Math.cos(player.angle) * 34, player.y + Math.sin(player.angle) * 34);
        context.stroke();
      }
    }
    void mission;
  }

  function drawMarker(state, camX, camY) {
    if (!state.missionActive) return;
    const mission = MISSIONS[state.missionIndex];
    if (!mission) return;
    // The current step's target: recompute from the world helper via the
    // state's mission step is owned by world.js; the renderer reads the
    // target the world stored on the state for drawing.
    const target = state.markerTarget;
    if (!target) return;
    const pulse = 1 + Math.sin(state.time * 4) * 0.15;
    // Beacon column.
    context.save();
    context.globalAlpha = 0.5;
    context.fillStyle = PALETTE.marker;
    context.beginPath();
    context.ellipse(target.x, target.y, 26 * pulse, 10 * pulse, 0, 0, Math.PI * 2);
    context.fill();
    context.restore();
    context.strokeStyle = PALETTE.marker;
    context.lineWidth = 3;
    context.beginPath();
    context.arc(target.x, target.y, 22 * pulse, 0, Math.PI * 2);
    context.stroke();
    context.fillStyle = PALETTE.marker;
    context.beginPath();
    context.moveTo(target.x, target.y - 44);
    context.lineTo(target.x - 10, target.y - 24);
    context.lineTo(target.x + 10, target.y - 24);
    context.closePath();
    context.fill();
    // Off-screen arrow at the view edge.
    const vx = target.x - camX;
    const vy = target.y - camY;
    if (Math.abs(vx) > VIEW.width / 2 - 40 || Math.abs(vy) > VIEW.height / 2 - 40) {
      const angle = Math.atan2(vy, vx);
      const ax = camX + Math.cos(angle) * (VIEW.width / 2 - 60);
      const ay = camY + Math.sin(angle) * (VIEW.height / 2 - 60);
      context.save();
      context.translate(ax, ay);
      context.rotate(angle);
      context.fillStyle = PALETTE.marker;
      context.beginPath();
      context.moveTo(16, 0);
      context.lineTo(-10, -11);
      context.lineTo(-10, 11);
      context.closePath();
      context.fill();
      context.restore();
      text(`${Math.round(Math.sqrt(vx * vx + vy * vy))}m`, ax, ay - 18, 14, PALETTE.hudText, 'center', 'bold');
    }
  }

  function drawLighting(dayFactor) {
    if (dayFactor >= 0.95) return;
    if (dayFactor < 0.6) {
      context.fillStyle = `rgba(8, 10, 36, ${(0.6 - dayFactor) * 0.85})`;
      context.fillRect(0, 0, VIEW.width, VIEW.height);
    } else if (dayFactor < 0.9) {
      context.fillStyle = PALETTE.dusk;
      context.fillRect(0, 0, VIEW.width, VIEW.height);
    }
  }

  function drawHud(state, screen) {
    const player = state.player;
    // Top-left: health + money.
    context.fillStyle = PALETTE.hudPanel;
    roundRect(context, 16, 16, 250, 64, 10);
    context.fill();
    text('DANA COLE', 30, 40, 15, PALETTE.hudMuted, 'left', 'bold');
    context.fillStyle = '#3a3f47';
    roundRect(context, 30, 48, 150, 12, 6);
    context.fill();
    context.fillStyle = player.health > 50 ? PALETTE.hudGreen : player.health > 25 ? PALETTE.hudGold : PALETTE.hudRed;
    roundRect(context, 30, 48, Math.max(0, 150 * player.health / 100), 12, 6);
    context.fill();
    text(`${Math.max(0, Math.round(player.health))}`, 190, 60, 15, PALETTE.hudText, 'left', 'bold');
    text(`$${state.money.toLocaleString('en-US')}`, 30, 74, 18, PALETTE.hudGold, 'left', 'bold');
    // Wanted stars, top centre-right.
    const stars = state.wanted;
    context.fillStyle = PALETTE.hudPanel;
    roundRect(context, VIEW.width / 2 - 90, 16, 180, 40, 10);
    context.fill();
    for (let i = 0; i < 5; i += 1) {
      text(i < stars ? '\u2605' : '\u2606', VIEW.width / 2 - 72 + i * 36, 46, 24, i < stars ? PALETTE.hudGold : PALETTE.hudMuted, 'left');
    }
    if (stars > 0) text('WANTED', VIEW.width / 2 + 100, 40, 13, PALETTE.hudRed, 'left', 'bold');
    // Clock + day, top-right above minimap.
    const hour = Math.floor(state.clock);
    const minute = Math.floor((state.clock - hour) * 60);
    const dayPart = state.clock >= 17 || state.clock < 6 ? (state.clock >= 19 || state.clock < 5 ? 'Night' : 'Dusk') : 'Day';
    text(`${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}  ${dayPart}`, MINIMAP.x + MINIMAP.size, 12, 15, PALETTE.hudText, 'right', 'bold');
    // Mission objective bar.
    if (state.missionActive && state.missionIndex < MISSIONS.length) {
      const mission = MISSIONS[state.missionIndex];
      context.fillStyle = PALETTE.hudPanel;
      roundRect(context, 16, 92, 420, 52, 10);
      context.fill();
      text(`MISSION ${state.missionIndex + 1}/4 — ${mission.title}`, 30, 114, 14, PALETTE.hudGold, 'left', 'bold');
      text(state.objectiveLabel || mission.brief, 30, 136, 15, PALETTE.hudText, 'left');
    } else if (state.storyDone) {
      context.fillStyle = PALETTE.hudPanel;
      roundRect(context, 16, 92, 420, 52, 10);
      context.fill();
      text('FREE ROAM — Solmar Bay is yours', 30, 114, 14, PALETTE.hudGreen, 'left', 'bold');
      text('Steal cars, dodge the cops, have fun.', 30, 136, 15, PALETTE.hudText, 'left');
    }
    // Ammo / car health, bottom-left.
    context.fillStyle = PALETTE.hudPanel;
    roundRect(context, 16, VIEW.height - 56, 250, 40, 10);
    context.fill();
    if (player.inCar) {
      const car = state.cars.find((c) => c.id === player.carId);
      const hp = car ? Math.max(0, Math.round(car.health)) : 0;
      text(`CAR  ${hp}%`, 30, VIEW.height - 30, 16, PALETTE.hudText, 'left', 'bold');
      text('E exit   Space brake', 130, VIEW.height - 30, 13, PALETTE.hudMuted, 'left');
    } else {
      const ammo = player.reload > 0 ? 'RELOADING' : `${player.ammo} / ${12}`;
      text(`PISTOL  ${ammo}`, 30, VIEW.height - 30, 16, PALETTE.hudText, 'left', 'bold');
      text('E enter car   F punch', 150, VIEW.height - 30, 13, PALETTE.hudMuted, 'left');
    }
    // Controls hint, bottom centre.
    text('WASD move/drive   Mouse aim   Click shoot   R reload   P pause   M mute', VIEW.width / 2, VIEW.height - 14, 13, PALETTE.hudMuted, 'center');
    drawMinimap(state);
    // Dialogue box.
    if (state.dialogue && state.time < state.dialogueUntil) {
      context.fillStyle = 'rgba(12,14,20,0.82)';
      roundRect(context, VIEW.width / 2 - 320, VIEW.height - 128, 640, 56, 10);
      context.fill();
      text(state.dialogue.speaker.toUpperCase(), VIEW.width / 2 - 304, VIEW.height - 104, 13, PALETTE.hudGold, 'left', 'bold');
      text(state.dialogue.text, VIEW.width / 2 - 304, VIEW.height - 82, 16, PALETTE.hudText, 'left');
    }
    // Flash message.
    if (state.message && state.time < state.messageUntil) {
      context.fillStyle = PALETTE.hudPanel;
      const w = Math.min(640, context.measureText(state.message).width + 40);
      roundRect(context, VIEW.width / 2 - w / 2, 72, w, 34, 8);
      context.fill();
      text(state.message, VIEW.width / 2, 96, 16, PALETTE.hudText, 'center', 'bold');
    }
    // Crosshair.
    if (screen === SCREEN_PLAY && state.mouse) {
      const mx = state.mouse.x;
      const my = state.mouse.y;
      context.strokeStyle = 'rgba(255,255,255,0.9)';
      context.lineWidth = 2;
      context.beginPath();
      context.arc(mx, my, 9, 0, Math.PI * 2);
      context.stroke();
      context.beginPath();
      context.moveTo(mx - 13, my);
      context.lineTo(mx - 5, my);
      context.moveTo(mx + 5, my);
      context.lineTo(mx + 13, my);
      context.moveTo(mx, my - 13);
      context.lineTo(mx, my - 5);
      context.moveTo(mx, my + 5);
      context.lineTo(mx, my + 13);
      context.stroke();
    }
  }

  function drawMinimap(state) {
    const scale = MINIMAP.size / WORLD.width;
    const mx = MINIMAP.x;
    const my = MINIMAP.y + 22;
    context.fillStyle = 'rgba(12,14,20,0.78)';
    roundRect(context, mx - 6, my - 6, MINIMAP.size + 12, MINIMAP.size + 12, 10);
    context.fill();
    context.save();
    context.beginPath();
    context.rect(mx, my, MINIMAP.size, MINIMAP.size);
    context.clip();
    context.fillStyle = '#3f6b35';
    context.fillRect(mx, my, MINIMAP.size, MINIMAP.size);
    context.fillStyle = '#2e6f8e';
    context.fillRect(mx, my + CITY.waterY * scale, MINIMAP.size, MINIMAP.size);
    context.fillStyle = '#d9c27a';
    context.fillRect(mx, my + CITY.beachY * scale, MINIMAP.size, (CITY.waterY - CITY.beachY) * scale);
    context.strokeStyle = '#33373d';
    context.lineWidth = 3;
    for (const road of CITY.roads) {
      context.beginPath();
      context.moveTo(mx + road * scale, my);
      context.lineTo(mx + road * scale, my + MINIMAP.size);
      context.stroke();
      context.beginPath();
      context.moveTo(mx, my + road * scale);
      context.lineTo(mx + MINIMAP.size, my + road * scale);
      context.stroke();
    }
    // Mission marker.
    if (state.markerTarget) {
      context.fillStyle = PALETTE.marker;
      context.beginPath();
      context.arc(mx + state.markerTarget.x * scale, my + state.markerTarget.y * scale, 5, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = PALETTE.marker;
      context.beginPath();
      context.arc(mx + state.markerTarget.x * scale, my + state.markerTarget.y * scale, 8 + Math.sin(state.time * 4) * 2, 0, Math.PI * 2);
      context.stroke();
    }
    // Police dots.
    context.fillStyle = '#5aa2ff';
    for (const car of state.cars) {
      if (car.kind !== 'police') continue;
      context.beginPath();
      context.arc(mx + car.x * scale, my + car.y * scale, 3, 0, Math.PI * 2);
      context.fill();
    }
    // Player arrow.
    context.save();
    context.translate(mx + state.player.x * scale, my + state.player.y * scale);
    context.rotate(state.player.angle);
    context.fillStyle = '#ffd23e';
    context.beginPath();
    context.moveTo(8, 0);
    context.lineTo(-6, -5);
    context.lineTo(-6, 5);
    context.closePath();
    context.fill();
    context.restore();
    context.restore();
    context.strokeStyle = 'rgba(255,255,255,0.35)';
    context.lineWidth = 1;
    roundRect(context, mx - 6, my - 6, MINIMAP.size + 12, MINIMAP.size + 12, 10);
    context.stroke();
    text('SOLMAR BAY', mx + MINIMAP.size / 2, my - 12 + 22, 11, PALETTE.hudMuted, 'center', 'bold');
  }

  function drawPanel(title, subtitle, lines, prompt, accent) {
    const height = PANEL.top + lines.length * PANEL.line + PANEL.bottom;
    const x = (VIEW.width - PANEL.width) / 2;
    const y = (VIEW.height - height) / 2;
    context.fillStyle = 'rgba(8, 10, 16, 0.86)';
    roundRect(context, x, y, PANEL.width, height, 16);
    context.fill();
    context.strokeStyle = accent || PALETTE.hudGold;
    context.lineWidth = 2;
    roundRect(context, x, y, PANEL.width, height, 16);
    context.stroke();
    context.textBaseline = 'alphabetic';
    text(title, VIEW.width / 2, y + 74, 52, PALETTE.hudText, 'center', 'bold');
    if (subtitle) text(subtitle, VIEW.width / 2, y + 106, 20, PALETTE.hudGold, 'center');
    for (let index = 0; index < lines.length; index += 1) {
      text(lines[index], VIEW.width / 2, y + PANEL.top + index * PANEL.line, 19, PALETTE.hudMuted, 'center');
    }
    text(prompt, VIEW.width / 2, y + height - 30, 22, accent || PALETTE.hudGold, 'center', 'bold');
  }

  const TITLE_LINES = [
    'Dana Cole is back in Solmar Bay — broke, fast, and out of options.',
    'Fixer Marla Quinn has four jobs. Finish them and the city is yours.',
    '',
    'WASD move / drive   Mouse aim   Click shoot   E enter car   F punch',
    'R reload   Space handbrake   P pause   M mute   Q interact',
    '',
    'Steal cars, lose the cops, and mind the wanted stars.',
  ];

  /** Paint one frame: the world through the camera, then HUD or a menu screen. */
  function draw(state, screen, best, dayFactor) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = '#0e1116';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    const camX = clamp(state.camera.x, VIEW.width / 2, WORLD.width - VIEW.width / 2);
    const camY = clamp(state.camera.y, VIEW.height / 2, WORLD.height - VIEW.height / 2);
    context.save();
    context.translate(VIEW.width / 2 - camX, VIEW.height / 2 - camY);
    drawWorld(state, camX, camY);
    drawMarker(state, camX, camY);
    context.restore();
    drawLighting(dayFactor);
    if (screen === SCREEN_TITLE) {
      context.fillStyle = 'rgba(8, 10, 18, 0.45)';
      context.fillRect(0, 0, VIEW.width, VIEW.height);
      const lines = TITLE_LINES.slice();
      if (best > 0) lines.push(`Best money banked: $${best.toLocaleString('en-US')}`);
      drawPanel(GAME_TITLE, GAME_SUBTITLE, lines, state.hasSave ? 'Press Enter to Continue — or Space for a New Game' : 'Press Space or click to start');
      return;
    }
    drawHud(state, screen);
    if (screen === SCREEN_PAUSED) {
      context.fillStyle = 'rgba(8, 10, 18, 0.55)';
      context.fillRect(0, 0, VIEW.width, VIEW.height);
      drawPanel('Paused', '', ['The city waits. Your save is safe.', `Money $${state.money.toLocaleString('en-US')} — Mission ${Math.min(state.missionIndex + 1, 4)}/4`], 'Press P to resume');
    } else if (screen === SCREEN_OVER) {
      context.fillStyle = 'rgba(20, 4, 6, 0.55)';
      context.fillRect(0, 0, VIEW.width, VIEW.height);
      const busted = state.stats.arrests > 0 && state.player.health <= 0;
      drawPanel(busted ? 'BUSTED' : 'WASTED', 'Solmar Bay PD wins this round', [`Money banked: $${state.money.toLocaleString('en-US')}`, `Missions done: ${state.stats.missionsDone} — Cars stolen: ${state.stats.carsStolen}`], 'Press Space to try again', PALETTE.hudRed);
    } else if (screen === SCREEN_WIN) {
      context.fillStyle = 'rgba(8, 18, 10, 0.45)';
      context.fillRect(0, 0, VIEW.width, VIEW.height);
      drawPanel('SOLMAR BAY IS YOURS', 'Story complete', [`All four jobs done. $${state.money.toLocaleString('en-US')} banked.`, 'Free roam: steal cars, dodge the cops, have fun.'], 'Press Space to keep playing', PALETTE.hudGreen);
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw };
}

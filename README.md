# Harbor Heat — A Solmar Bay Story

[![gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![Rank](https://make.fun/badge/gta6-01/TUHIN729/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01)
[![Reward](https://make.fun/badge/gta6-01/TUHIN729/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01)

An open-world crime game that runs offline in a desktop browser. You are **Dana Cole**, a getaway driver back in the sun-soaked coastal city of **Solmar Bay** — broke, fast, and out of options. Fixer **Marla Quinn** has four jobs for you. Finish them all and the city is yours.

## The city

Solmar Bay is a 3600×3600 open world: a grid of avenues and side streets, parks, a beach promenade, the East Docks, Palm Plaza, Solmar Bank, a hospital and a chop shop. Traffic flows on the roads, pedestrians stroll the sidewalks, and the day slides from golden hour into dusk and night.

## Features

- **On foot and by car** — walk, sprint, punch, shoot, or jack any parked or traffic car (press E) and drive it. Handbrake turns leave skid marks.
- **Traffic and pedestrians** — cars follow the road grid and turn at intersections; pedestrians wander, pause, and flee from gunfire.
- **Wanted level** — five stars. Stealing cars, shooting, and hitting pedestrians raise the heat. Police cars chase and ram you; officers get out and shoot or arrest you on foot. Lay low and the stars fade.
- **Missions and story** — four jobs with dialogue, objective markers, a compass arrow and cash rewards:
  1. *The Pickup* — fetch a package from the docks.
  2. *Borrowed Wheels* — steal the crimson coupe and deliver it to the chop shop.
  3. *Heat Wave* — shake a three-star tail and reach the safehouse.
  4. *The Harbor Job* — grab the cash case at the bank and vanish.
- **Combat** — pistol with mouse aim, reload, punching, drive-by shooting, ramming, destructible cars that smoke and wreck.
- **HUD** — health, money, wanted stars, clock and day part, mission objective, and a live minimap of Solmar Bay with the mission marker and police dots.
- **Save** — progress (money, mission, stats) autosaves to localStorage; the title screen offers Continue.
- **Sound and music** — a synthesized WebAudio groove, engine hum, police sirens, gunfire and jingles. No audio files. M mutes.
- **Polish** — day/night cycle with dusk lighting, particles, muzzle flashes, a smooth follow camera, pause, and game-over / story-complete screens.

## Controls

| Key | Action |
| --- | --- |
| W A S D / arrows | Move on foot / drive |
| Mouse | Aim (click to shoot) |
| E | Enter / exit car |
| F | Punch |
| R | Reload |
| Q | Interact (grab package / cash case) |
| Space | Handbrake (in car) |
| Shift | Sprint |
| P / Esc | Pause |
| M | Mute |

## How to run

No build step, no network, no dependencies. Serve the `game/` folder with any static server and open `index.html` in desktop Chrome:

```sh
node serve.ts
# then open http://localhost:8080
```

Or open `game/index.html` directly from disk — it plays from `file://` too.

## Screenshots

`?shot=start|play|chase|end` stages a real gameplay scene deterministically (same seed, same frame): the title over the living city, driving the first mission, a three-star police chase, and the game-over screen.

## Tech

Plain Canvas 2D and vanilla ES modules — no libraries, no engine, nothing vendored. The source is split by job: `config.js` (tuning), `city.js` (Solmar Bay), `world.js` (rules), `render.js` (drawing + HUD), `input.js`, `audio.js` (WebAudio synth), `shots.js` (staged scenes), `main.js` (boot + loop). Everything in the game — city, characters, vehicles, names, story, art, sounds and music — is original, created for this entry.

## License

MIT — see `LICENSE`.

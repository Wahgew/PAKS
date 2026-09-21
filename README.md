# P.A.K.S. — Parkour Ascent: Kinetic Sprint

> A fast, momentum-based stickman parkour platformer set in an endless office elevator. Race up the floors, dodge spikes, projectiles and lasers, flip the lever, and beat your best time.

Built with plain JavaScript and the HTML5 Canvas. No frameworks, no build step.

**P.A.K.S.** started as our team's working title, the first initials of the four developers (**P**eter, **A**ndrew, **K**en, **S**opheanith). The subtitle above is a placeholder backronym.

---

## The Game

You play a stickman trying to reach the top of a building, one elevator floor at a time. Each floor is a short obstacle course with one goal: reach the elevator door as fast as you can. There are no enemies to fight. The challenge is movement and timing.

**Inspirations:** *Mr. Fancy Pants Adventures* (momentum and flow), *Super Meat Boy* (tight, unforgiving precision), and *N++* (minimalist speedrun-style levels).

### Features

- **Momentum-based movement:** acceleration and deceleration instead of instant speed changes, with walk, sprint, skid, crouch and slide
- **Wall sliding and wall jumping**
- **Slopes and curves:** 45° and gentle 26.6° ramps, steep 63.4° faces, and quarter-circle shoulders and quarter-pipes that you run, slide and jump along at full speed
- **Variable jump height** (release jump early for a shorter hop) and jump buffering
- **Hazards:** static, moving and tracking spikes, projectile launchers, and glowing lasers
- **Level mechanics:** solid blocks, one-way platforms you can drop through, moving platforms, levers that unlock the exit, and the exit door
- **16 floors**, plus a test floor. Floors 13-16 are mystery levels that unlock after completing floor 12
- **Per-level best times** and level-complete / death screens
- **Saved progress** in the browser (unlocked and completed floors)
- **Elevator-themed UI:** door-opening intro, floor-select panel, and a volume control styled as an elevator panel
- **Lounge and elevator music** playlist
- **Large levels:** the game draws a fixed 76x41-tile view and scrolls with you on bigger levels, so tiles and sprites stay the same size at any level size and on any screen (up to 300x300 tiles)
- **Level editor:** paint tiles (including every slope shape), place spikes, launchers, lasers, platforms, levers and blocks, move the spawn and exit, playtest instantly, and open or save level JSON, all in the browser
- **Debug mode** with a level selector, unlock-all button and click-to-teleport

### Controls

| Key | Action |
|---|---|
| `A` / `D` | Move left / right |
| `Shift` + `A`/`D` | Sprint |
| `W` or `Space` | Jump (press again against a wall to wall jump) |
| `S` | Crouch, slide (while moving), drop through platforms |
| `V` | Toggle the volume panel |
| Debug checkbox | Show hitboxes and the debug menu |

---

## Running It Locally

The game is static files in the `GameEngine/` folder. Serve that folder with any local web server (opening `index.html` directly can break audio and storage in some browsers).

```bash
cd GameEngine
python3 -m http.server 8000
# then open http://localhost:8000
```

Any static server works (`npx serve`, VS Code Live Server, etc.).

### Tests

Collision and movement logic have automated tests that need only Node 20+ (no install step):

```bash
node --test        # from the repo root
```

They cover the slope/curve geometry, a regression check that full-block collision is unchanged on every level, headless runs of the real player over slopes, and the level editor's model (every real level validates and round-trips, and a level authored with the model can be won and lost). UI, audio and saved progress are still checked by hand with [docs/SMOKE_TEST.md](docs/SMOKE_TEST.md).

---

## Project Structure

```
GameEngine/
├── index.html           # Entry point; loads every script in order
├── main.js              # Asset loading and game start
├── gameengine.js        # Game loop, input, entity list, debug menu
├── levelconfig.js       # Level loading (delegates to LevelLoader / JSON)
├── levelLoader.js       # Parses and instantiates entities from JSON level data
├── drawMap.js           # Tile-grid renderer and tile collision (accepts 2D tile array)
├── tileShapes.js        # Slope and curve geometry, tile ids 10-73, SAT (no game dependencies)
├── camera.js            # The view onto the level: following the player, clamping, editor pan and zoom (no game dependencies)
├── levelModel.js        # Level editor logic: field schema, validation, tile/entity edits, undo, file format (no game dependencies)
├── levelEditor.js, levelEditorUI.js   # The in-browser level editor and its panels
├── levels/              # level_00.json … level_16.json — one JSON file per floor
├── player.js            # Player physics, states, animation
├── platform.js, lever.js, bigblock.js, enemies.js   # Level entities and hazards
├── LevelUI.js, LevelsScreen.js, gameMenu.js, welcomeScreen.js   # UI screens
├── levelProgressManager.js, leveltimesmanager.js    # Saved progress and best times
├── audiomanager.js, volumnecontrolui.js             # Music and volume
├── tests/               # node --test suites (geometry, collision regression, headless player physics, level model and editor)
├── sprites/             # Sprite sheets and UI images
└── sounds/              # Music and sound effects
```

---

## Credits

**Team Gold Five**, University of Washington Tacoma, TCSS 491: Game and Simulation Design

- Peter Wahyudianto Madin
- Andrew Hwang
- Ken Egawa
- Sopheanith Ny

Created as the team project for TCSS 491. The original project plan aimed for a playable prototype by week 4 and a minimum deliverable (multiple levels, hazards, timer, wall jumping) by week 7.

**Music:** lounge and elevator tracks in `GameEngine/sounds/`. *TODO: add per-track attribution and license info.*

---

## Roadmap

The course is over, but the project isn't. Planned next steps:

- [ ] Redesign the stickman as clean, scalable SVG-based animation frames
- [ ] Remake all entities/sprites into clean, uniform, scalable SVGs
- [x] Sloped and curved level geometry — 45° and 26.6°/63.4° slopes and quarter circles with SAT collision (arbitrary polygons to come)
- [x] In-browser level editor with save/load (custom levels are not yet playable from the Levels screen)
- [x] Data-driven levels (JSON) — all 17 levels loaded from `GameEngine/levels/` at runtime
- [ ] Tutorial level that teaches the controls
- [ ] Settings menu with rebindable keys, more sound effects, and original music
- [ ] Coins and star ratings, ghost replay of your best run, save import/export
- [ ] Power-ups, cosmetics and trail effects, secrets
- [ ] Final-level cutscene (short, 1-2 minutes)

## License

*TODO: choose a license.*

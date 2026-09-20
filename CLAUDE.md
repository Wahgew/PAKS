# CLAUDE.md

Guidance for Claude Code when working in this repo.

## What this is

**P.A.K.S.** is a 2D browser platformer (stickman parkour in an office-elevator theme) built by four students for UWT's TCSS 491 (Game and Simulation Design). Think Mr. Fancy Pants + Super Meat Boy + N++: momentum-based movement, speedrun timer, no enemies to kill, only hazards to dodge. The course is over. We are now modernizing it as a hobby/portfolio project.

Everything lives in `GameEngine/`. It is vanilla JS on an HTML5 canvas (1024x768). **There is no build step, bundler, package.json or test suite.**

## Run it

```bash
cd GameEngine && python3 -m http.server 8000   # open http://localhost:8000
```

Use a local server, not `file://`. Tick the **Debug** checkbox in the page to see hitboxes, a level selector, "Unlock All Levels" and click-to-teleport. In debug mode, dying and winning are disabled.

## Architecture (as it exists today)

- **Script tags, global scope.** `index.html` loads every `.js` file with plain `<script>` tags. **Load order matters** (e.g. `gameengine.js` and `levelconfig.js` before entity files, `main.js` last). New files must be added to `index.html` in the right place. Classes and managers are globals.
- **Engine:** `gameengine.js` owns the loop, input (`game.keys`, lowercase keys like `'a'`, `' '`, `'shift'`), `game.entities`, `game.clockTick`, `game.options.debugging`, and references such as `game.Player`, `game.timer`, `game.levelUI`, `game.levelConfig`, `game.levelTimesManager`.
- **Entities** implement `update()` and `draw(ctx)`, have a `BB` (`BoundingBox(x, y, w, h)` with `left/right/top/bottom` and `collide()`), and are removed by setting `removeFromWorld = true`. Add them with `game.addEntity()`.
- **Levels:** `levelconfig.js` → `getLevelEntities(n)` returns `{ map, player, exitDoor, hazards }` factories, all hard-coded in one big object. `drawMap.js` holds tile-grid maps (`TILE_SIZE = 25`) loaded by `loadMap(levelNumber)`. Floor 0 is a test level, floors 1-12 are the main run, and 13-16 are mystery floors unlocked after 12.
- **Player** (`player.js`): state machine (idle, walking, running, skidding, crouching, sliding, jumping, falling, wall sliding). Physics constants (`MIN_WALK`, `MAX_RUN`, `ACC_*`, `DEC_*`, `MAX_JUMP`, etc.) are declared at the top of `update()`. Collision is AABB with minimum-overlap resolution against `BigBlock`s. Death is triggered in `update()` by overlapping `Projectile`, `Spike` or `GlowingLaser`. Platforms (`platform.js`) are one-way, can move and carry the player.
- **Sprites:** `Animator` (`animator.js`) — `Animator(spritesheet, xStart, yStart, width, height, frameCount, frameDuration)` and `drawFrame(tick, ctx, x, y, scale)`. Images are queued in `main.js` through the global `ASSET_MANAGER` (`assetmanager.js`). `sprite-tester-html.html` is a helper for finding sprite-sheet frame offsets.
- **Other files (not in README structure):** `boundingBox.js` (AABB class), `timer.js` (game clock), `util.js` (helpers, `requestAnimFrame` shim), `transition.js` (elevator-door level-transition effect), `exitDoor.js` (exit door entity), `deathAnimate.js` / `deathParticle.js` (death effects), `autoScreenResizer.js` (keeps canvas centered on resize). `autoScaler.js` exists on disk but is commented out of `index.html`.
- **Persistence:** IndexedDB for level progress (`levelProgressManager.js` → `window.LEVEL_PROGRESS`) and best times (`leveltimesmanager.js`); `localStorage` for volume.
- **UI:** built with DOM elements and inline styles (welcome/elevator screen, levels screen, in-game menu, volume panel) plus canvas-drawn level-complete and death screens in `LevelUI.js`.
- **Globals to know:** `ASSET_MANAGER`, `AUDIO_MANAGER`, `GAME_MENU`, `LEVEL_PROGRESS`, `VOLUME_CONTROL`, `CURRENT_GAME_LEVEL`, `window.gameEngine`.

## Known tech debt and gotchas

- The level count is hard-coded in several places (`levelconfig.js` uses `< 17`, `LevelsScreen.js` uses 12 and 13-16 ranges, `levelProgressManager.js` uses 12). Changing the number of levels means touching all of them.
- `levelProgressManager.js` monkey-patches both `LevelConfig.prototype.loadNextLevel` **and** `LevelConfig.prototype.loadLevel` at runtime. Fragile. The fallback code inside the patched `loadNextLevel` (used if the original method is somehow absent) hard-codes `< 12`, so the game would cap at level 12 in that edge case.
- `Player.update()` is very large. Wall-jump cooldowns use `setTimeout` instead of the game clock.
- Sound effects create a new `Audio` object per play. The elevator "ding" is commented out.
- Level data is inline code, so every level change means a code edit plus a refresh.
- File `volumnecontrolui.js` has a typo in its name. Rename only if you update `index.html`.
- Music tracks in `sounds/` need license/attribution review.
- Keys `M` (volume panel, `main.js`) and `M` (menu shortcut, `LevelUI.js`) overlap on the complete/death screens.
- `loadNextLevel()` in `levelconfig.js` checks `this.currentLevel < 17`, which allows it to attempt loading a non-existent level 17 after the final floor. `loadLevel(17)` returns false without clearing entities, leaving the game in an inconsistent state. There is currently no "game complete" screen.
- Level 16 has three `GlowingLaser` entries with `direction: 'HORTIZONTAL'` (misspelling of `'HORIZONTAL'`). Whether this breaks collision depends on how `GlowingLaser` validates the direction string.
- Level 14 has two duplicate `Lever` objects placed at identical coordinates `(24, 170)` and `(1853, 170)`.
- `LevelProgressManager.unlockAllLevels()` (the instance method) only loops levels 1–12 due to `NUMBER_OF_LEVELS = 12`. The global `window.unlockAllLevels()` function handles levels 13–16 separately. The two functions are not equivalent.

## Direction (in priority order)

1. **Stabilize:** fix critical bugs, remove hard-coded level counts, smoke-test checklist in place.
2. **Data-driven levels (JSON):** move all level definitions out of `levelconfig.js` into JSON files loaded at runtime.
3. **Sloped and curved geometry:** N++-style tile shapes (45° slopes, quarter circles) with matching AABB/SAT collision; arbitrary polygons later.
4. **In-browser level editor:** place entities, paint tiles, playtest, save/load JSON levels without touching code.
5. **Tutorial level:** teaches movement, wall jump, slide, levers, and the exit door before floor 1.
6. **SVG stickman and entities:** redraw the player and all entity sprites as clean, scalable SVGs. Independent of the steps above — can be worked on in parallel at any point.
7. **Settings, audio and rebindable keys:** settings menu, rebindable controls, more SFX, original/attributed music.
8. **Coins and star ratings → fixed-timestep physics → ghost replay → save import/export:** coins and per-level star ratings first; then switch the physics loop to a fixed timestep (required for deterministic replay); then ghost replay of best run; then save import/export.
9. **Power-ups and cosmetics:** trail effects, skins, secrets.
10. **Final-level cutscene:** short (1–2 min) outro after completing floor 16.

## Working agreements

- **Keep the game playable at every commit.** Prefer small, reviewable changes over big-bang rewrites. Work on a branch.
- **Preserve game feel.** Do not change physics constants or movement behavior unless the task is about movement, and call out any such change explicitly.
- There are no automated tests yet. After changes, run the game and check: welcome screen → start → move, jump, wall jump, slide → die → restart → complete a level → best time saved → levels screen shows progress. If you add pure-logic code (collision, level parsing), add tests for it.
- If you introduce a build tool, ES modules or TypeScript, do it as its own dedicated change and update this file and the README.
- Match the existing style unless a refactor is the point of the task. Leave comments explaining *why*.
- Ask before deleting assets, renaming public files, or changing the save format (players' saved progress lives in IndexedDB).
- Keep this file and `README.md` current when architecture or run instructions change.

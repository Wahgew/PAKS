# CLAUDE.md

Guidance for Claude Code when working in this repo.

## What this is

**P.A.K.S.** is a 2D browser platformer (stickman parkour in an office-elevator theme) built by four students for UWT's TCSS 491 (Game and Simulation Design). Think Mr. Fancy Pants + Super Meat Boy + N++: momentum-based movement, speedrun timer, no enemies to kill, only hazards to dodge. The course is over. We are now modernizing it as a hobby/portfolio project.

Everything lives in `GameEngine/`. It is vanilla JS on an HTML5 canvas (1024x768). **There is no build step, bundler or package.json.** Pure-logic and headless-physics tests run with Node's built-in runner: `node --test` from the repo root (Node 20+, no dependencies).

## Run it

```bash
cd GameEngine && python3 -m http.server 8000   # open http://localhost:8000
node --test                                    # from the repo root: run the automated tests
```

Use a local server, not `file://`. Tick the **Debug** checkbox in the page to see hitboxes, a level selector, "Unlock All Levels" and click-to-teleport. In debug mode, dying and winning are disabled.

## Architecture (as it exists today)

- **Script tags, global scope.** `index.html` loads every `.js` file with plain `<script>` tags. **Load order matters** (e.g. `gameengine.js` and `levelconfig.js` before entity files, `main.js` last). New files must be added to `index.html` in the right place. Classes and managers are globals.
- **Engine:** `gameengine.js` owns the loop, input (`game.keys`, lowercase keys like `'a'`, `' '`, `'shift'`), `game.entities`, `game.clockTick`, `game.options.debugging`, and references such as `game.Player`, `game.timer`, `game.levelUI`, `game.levelConfig`, `game.levelTimesManager`.
- **Entities** implement `update()` and `draw(ctx)`, have a `BB` (`BoundingBox(x, y, w, h)` with `left/right/top/bottom` and `collide()`), and are removed by setting `removeFromWorld = true`. Add them with `game.addEntity()`.
- **Levels:** Each floor is a JSON file in `GameEngine/levels/level_00.json` … `level_16.json`. `main.js` fetches all 17 at startup (requires HTTP server — `fetch()` fails on `file://`) and stores them in `window.LEVEL_LOADER` (a `LevelLoader` instance from `levelLoader.js`). `LevelConfig.loadLevel(n)` calls `LEVEL_LOADER.getLevelEntities(n, game, TILE_SIZE)` which returns `{ map, player, exitDoor, hazards, tiles }` factories and passes `tiles` (a 2D array) to `drawMap.loadMap()`. `drawMap.js` handles tile collision and canvas sizing. Tile ids in `map.tiles`: `0` empty, `1` full block, `10`-`73` sloped/curved shapes (see "Sloped and curved tiles" below); unknown ids load as empty with a console warning. `checkCollisions(entity)` reports any tile hit (full blocks, then shapes via SAT against `entity.BB`); `checkSolidTiles(entity)` is the original full-blocks-only test. Floor 0 is a test level, 76 tiles wide: a slope/curve playground along the bottom of the left room, and a bay to the right of it (through a doorway in the old right wall) for the gentle and steep shapes, floors 1-12 are the main run, and 13-16 are mystery floors unlocked after 12.
- **Player** (`player.js`): state machine (idle, walking, running, skidding, crouching, sliding, jumping, falling, wall sliding). Physics constants (`MIN_WALK`, `MAX_RUN`, `ACC_*`, `DEC_*`, `MAX_JUMP`, etc.) are declared at the top of `update()`. Collision is AABB: minimum-overlap resolution against `BigBlock`s, snapping to tile edges for full blocks, and the slope handling described below for shaped tiles. Death is triggered in `update()` by overlapping `Projectile`, `Spike` or `GlowingLaser`. Platforms (`platform.js`) are one-way, can move and carry the player.
- **Sloped and curved tiles** (`tileShapes.js`, plus `drawMap.js` and the tile-collision half of `player.js`):
  - `tileShapes.js` is pure geometry with no DOM or game dependencies (a global in the browser, `require()`-able in Node). It defines 28 shapes as convex pieces plus an outline for drawing, and SAT between an AABB and a piece. A contact carries the push-out normal and depth, is classified `floor` (surface within ~45° of flat), `ceiling` or `wall`, and carries the straight-up (`up`) and straight-down (`down`) clearance. Push-out directions come only from *exposed* piece edges, never the box's own axes or the hidden inner rays of the concave shapes' triangle fans; otherwise a box clipping a seam reports phantom walls.
  - Ids (letters name the corner holding the solid mass: BL, BR, TL, TR): `10-13` `SLOPE_*` 45° triangles, `20-23` `CONVEX_*` quarter discs (rounded shoulders), `30-33` `CONCAVE_*` quarter-pipes. Arcs are 8-segment polygons (about 0.1px off a true circle at 25px tiles).
  - Ramps built from two tiles: `40-43` `GENTLE_HIGH_*` and `50-53` `GENTLE_LOW_*` make a 26.6° ramp 2 tiles wide and 1 tall (LOW at the low end, HIGH at the tall end); `60-63` `STEEP_TIP_*` and `70-73` `STEEP_BASE_*` make a 63.4° face 1 tile wide and 2 tall (TIP on top of BASE). Gentle ramps are walkable like the 45° ones, steep faces are `wall` contacts that block and are never clung to. No physics change was needed: `SLOPE_MAX_RISE = 1` is an upper bound and the 26.6° rise per pixel is 0.5.
  - Player movement on shapes: horizontal speed and all physics constants are unchanged (no slope momentum). Walkable surfaces (up to 45°) never block; the player is lifted straight up onto them, so feet follow the surface exactly. `moveAlongShapes` moves in ~1px steps, lifting after each, because probing a whole frame's move from the old height sees the next tile's tip poking in from below, which looks like a wall at every seam of a diagonal ramp. `resolveShapeContacts` pushes out after the vertical move (floors up, ceilings down, steeper-than-45° faces along the surface normal, in up to four passes) and snaps the player back down going downhill (at most `|dx|·1 + 2` px). `tryStepUp` steps onto a full block whose top is within one slope-rise, e.g. a ramp that ends level with a ledge. Steeper-than-45° faces block movement but are never clung to (wall-stick only ever happens against full blocks). `footDrop()` draws the sprite lower so the feet look planted; it is visual only.
- **Tests** (`GameEngine/tests/`, run with `node --test`): `tileShapes.test.js` (geometry, SAT, walkable classification), `collision-regression.test.js` (the original full-block algorithm vs the current one on random boxes over every level; levels 1-16 must stay identical), `player-slopes.test.js` (drives the real `Player` frame by frame on ASCII maps and on level 0: surface following, speed never dipping, downhill grounding, jumps, steep faces, ceilings, map edges, plus random-input fuzzing that must never end inside a shape). `helpers/browserScripts.js` loads the browser `<script>` files into a Node `vm` context with stubbed globals, so no browser or build step is needed.
- **Sprites:** `Animator` (`animator.js`) — `Animator(spritesheet, xStart, yStart, width, height, frameCount, frameDuration)` and `drawFrame(tick, ctx, x, y, scale)`. Images are queued in `main.js` through the global `ASSET_MANAGER` (`assetmanager.js`). `sprite-tester-html.html` is a helper for finding sprite-sheet frame offsets.
- **Other files (not in README structure):** `boundingBox.js` (AABB class), `timer.js` (game clock), `util.js` (helpers, `requestAnimFrame` shim), `transition.js` (elevator-door level-transition effect), `exitDoor.js` (exit door entity), `deathAnimate.js` / `deathParticle.js` (death effects), `autoScreenResizer.js` (keeps canvas centered on resize). `autoScaler.js` exists on disk but is commented out of `index.html`.
- **Persistence:** IndexedDB for level progress (`levelProgressManager.js` → `window.LEVEL_PROGRESS`) and best times (`leveltimesmanager.js`); `localStorage` for volume.
- **UI:** built with DOM elements and inline styles (welcome/elevator screen, levels screen, in-game menu, volume panel) plus canvas-drawn level-complete and death screens in `LevelUI.js`.
- **Globals to know:** `ASSET_MANAGER`, `AUDIO_MANAGER`, `GAME_MENU`, `LEVEL_PROGRESS`, `VOLUME_CONTROL`, `CURRENT_GAME_LEVEL`, `window.gameEngine`.

## Known tech debt and gotchas

- The level count is hard-coded in several places (`LevelsScreen.js` uses 12 and 13-16 ranges, `levelProgressManager.js` uses 12). Adding a level means touching those files.
- `levelProgressManager.js` monkey-patches both `LevelConfig.prototype.loadNextLevel` **and** `LevelConfig.prototype.loadLevel` at runtime. Fragile. The fallback code inside the patched `loadNextLevel` (used if the original method is somehow absent) hard-codes `< 12`, so the game would cap at level 12 in that edge case.
- `Player.update()` is very large. Wall-jump cooldowns use `setTimeout` instead of the game clock.
- Sound effects create a new `Audio` object per play. The elevator "ding" is commented out.
- Level JSON files are fetched at startup. The game **requires an HTTP server** (`python3 -m http.server`, VS Code Live Server, etc.) — opening `index.html` directly via `file://` will fail to fetch JSON and all levels will refuse to load.
- File `volumnecontrolui.js` has a typo in its name. Rename only if you update `index.html`.
- Music tracks in `sounds/` need license/attribution review.
- `loadNextLevel()` checks `this.currentLevel < 17`, which still allows it to attempt a non-existent level 17 after the final floor. However `LevelUI.js` now intercepts "continue" on level 16 and shows a "Game Complete" / Home screen instead.
- Level 14 has two duplicate `Lever` objects placed at identical coordinates `(24, 170)` and `(1853, 170)`.
- **Full-block corner clip (pre-existing, left alone to preserve feel):** `Player.handleCollisions` builds the vertical-pass box with the pre-move `x`, so a diagonal move can nick a full block's corner by up to ~3px at 60fps (~6px with slow frames). It resolves itself. The untouched game does it too; `player-slopes.test.js` tolerates up to 4px of it (`CORNER_CLIP`) but never any overlap with a shape.
- **Slope limits:** the hitbox rests on its higher corner on a slope (the sprite is drawn lower to compensate). Only 45° and 26.6°/63.4° slopes and quarter circles exist, and no arbitrary polygons (add pieces to `tileShapes.js` when needed). A ceiling contact blocks a grounded player moving under it rather than sliding along it. Frame-time spikes can tunnel through geometry, same as full blocks; fixed-timestep physics is on the roadmap.
- `LevelProgressManager.unlockAllLevels()` (the instance method) only loops levels 1–12 due to `NUMBER_OF_LEVELS = 12`. The global `window.unlockAllLevels()` function handles levels 13–16 separately. The two functions are not equivalent.

## Direction (in priority order)

1. **Stabilize:** fix critical bugs, remove hard-coded level counts, smoke-test checklist in place.
2. ~~**Data-driven levels (JSON)**~~ ✓ Done — 17 JSON files in `GameEngine/levels/`, loaded via `LevelLoader` at startup.
3. ~~**Sloped and curved geometry**~~ ✓ Done — 45° slopes, quarter circles (convex and concave) and 26.6°/63.4° two-tile ramps in four orientations each, SAT collision, tile ids `10-73` (see `tileShapes.js`). Arbitrary polygons are a future addition.
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
- Run `node --test` after changes (all tests must pass), then run the game and check `docs/SMOKE_TEST.md`; the automated tests cover collision and movement logic, not UI, audio or persistence. Quick pass: welcome screen → start → move, jump, wall jump, slide → die → restart → complete a level → best time saved → levels screen shows progress. If you add pure-logic code (collision, level parsing), add tests for it. When a browser run shows a bug the tests missed, add the test that would have caught it.
- If you introduce a build tool, ES modules or TypeScript, do it as its own dedicated change and update this file and the README.
- Match the existing style unless a refactor is the point of the task. Leave comments explaining *why*.
- Ask before deleting assets, renaming public files, or changing the save format (players' saved progress lives in IndexedDB).
- Keep this file and `README.md` current when architecture or run instructions change.

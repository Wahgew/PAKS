# P.A.K.S. — Manual Smoke-Test Checklist

Run `node --test` from the repo root first (all tests must pass; they cover collision and movement logic, not UI, audio or persistence). Then run this after any non-trivial change. Serve from `GameEngine/` with a local server (`python3 -m http.server 8000`). **The game must be served over HTTP** — `file://` URLs prevent JSON level files from loading and will break the game. All tests assume a **clean browser profile** (no stale IndexedDB) unless noted.

---

## 1. Welcome / Elevator Screen

- [ ] Page loads without console errors.
- [ ] Elevator-door opening animation plays.
- [ ] "Start" button is visible and clickable.
- [ ] "Levels" button is visible and clickable.
- [ ] Background music starts playing.
- [ ] Volume button (🎵, top-right) is visible.
- [ ] `V` key toggles the volume panel.

---

## 2. Game Start — Level 1

- [ ] Clicking "Start" hides the welcome screen and shows the canvas.
- [ ] Level 1 loads: player spawns at bottom-right, exit door at top-left.
- [ ] Floor-time timer starts and counts up.
- [ ] No JavaScript errors in the console on load.

---

## 3. Player Movement

- [ ] `A` / `D` — player moves left / right with acceleration; releasing decelerates.
- [ ] `Shift + A/D` — player runs (faster top speed, skid on direction change).
- [ ] `W` or `Space` — player jumps; holding longer gives higher jump.
- [ ] Release jump early — variable jump height (shorter hop).
- [ ] Jump while running — player carries horizontal momentum into air.
- [ ] `S` while still — player crouches (reduced hitbox).
- [ ] `S` while running — player slides.
- [ ] `S` while on a one-way platform — player drops through.

---

## 4. Wall Jump

- [ ] Run at a wall → player sticks to it and slides down slowly.
- [ ] Press jump while wall-sliding → player launches away from wall.
- [ ] Two consecutive wall jumps between two walls possible.
- [ ] After landing, wall-jump input is re-enabled immediately.

---

## 5. Hazards

- [ ] Walking into a `Spike` → player dies (death animation plays, death screen appears).
- [ ] Walking into a `Projectile` → player dies.
- [ ] Walking into a `GlowingLaser` → player dies.
- [ ] Moving spike travels its path and reverses as expected.
- [ ] Tracking spike follows the player.
- [ ] `ProjectileLauncher` fires at configured interval and direction.

---

## 6. Death Screen

- [ ] Death screen appears after the death animation finishes (~0.5 s).
- [ ] "Restart" / "Continue" (`Enter`) restarts the current level.
- [ ] `M` on death screen → goes to the main menu and the volume panel stays closed. `V` still toggles the volume panel there.
- [ ] `L` on death screen → goes to levels screen.
- [ ] Timer resets to zero on restart.

---

## 7. Level Completion

- [ ] Collecting all required levers makes the exit door open (or unlocks, if `leversRequired > 0`).
- [ ] Touching the open exit door → level-complete screen appears.
- [ ] Final time is shown on the level-complete screen.
- [ ] "New best time!" message appears if the run is faster than the saved best.
- [ ] `Enter` on the complete screen proceeds to the next level.
- [ ] Best time is saved to IndexedDB (refresh page → re-check level-complete screen for same level).

---

## 8. Level Progression

- [ ] Completing level 1 unlocks level 2 on the levels screen.
- [ ] Completing levels 1–12 in sequence unlocks each subsequent level.
- [ ] Completing level 12 unlocks mystery floors 13–16 on the levels screen.
- [ ] Attempting a locked level from the levels screen shows the "locked" message.

---

## 9. Levels Screen

- [ ] "Levels" button from welcome screen opens the levels screen.
- [ ] Floor 1 button is lit; floors 2–12 are locked on a fresh save.
- [ ] Clicking an unlocked floor loads that floor and starts the timer.
- [ ] Clicking a locked floor shows the lock message (no crash).
- [ ] Mystery floors 13–16 are greyed out until floor 12 is completed.
- [ ] "Reset Progress" button resets all unlocked/completed state to default (only floor 1 unlocked).
- [ ] "Home" button returns to the welcome screen.
- [ ] "Back" button returns to the currently running game.

---

## 10. Debug Mode

- [ ] Checking the "Debug" checkbox shows the debug menu (level selector + unlock button).
- [ ] All levels are automatically unlocked when debug mode is enabled.
- [ ] Level selector dropdown loads the chosen floor immediately.
- [ ] Click-to-teleport moves the player to the cursor position.
- [ ] Hitboxes are drawn on all entities.
- [ ] Dying and winning are disabled (player does not die on hazard contact).

---

## 11. Volume / Audio

- [ ] 🎵 button opens the volume panel.
- [ ] Slider adjusts music volume in real time.
- [ ] Volume preference is persisted in `localStorage` across page refreshes.
- [ ] Music switches from menu track to game track when the game starts.
- [ ] Music switches back to menu track when returning to the welcome screen from the levels screen.

---

## 12. Persistence (IndexedDB)

- [ ] Refreshing after completing a level preserves unlocked and completed state.
- [ ] Best times survive a page refresh.
- [ ] Resetting progress (levels screen) clears best times and unlocked levels.

---

## 13. Screen Resizing and Camera

The game draws a fixed view (76 x 41 tiles) and fits it to the window with one rule, so every floor looks the same size on a given screen.

- [ ] Resizing the browser window keeps the view centered and fitted (no scrollbars, nothing cut off, black around it).
- [ ] Game is playable at 1280x720, 1920x1080 and 2560x1440. A tile is bigger on the bigger screens, but you see the same amount of level on each.
- [ ] Every floor (0-16) is shown whole, with black bars above and below the shorter ones. Nothing scrolls, and moving between floors does not change the scale or the size of the timer panel.
- [ ] Debug on: clicking teleports the player to the exact spot you clicked, at any window size.
- [ ] Die (or finish a floor) and click the buttons on the death/complete screen: they respond where they are drawn, at any window size.
- [ ] A large level scrolls: open the level editor, make or import a level bigger than 76x41 tiles (say 200x120), Playtest it and run. The camera follows you smoothly, you stay in the middle of the screen, tiles and the timer stay the same size as on the normal floors, and you can't see past the edge of the level.

---

## 14. Slopes and Curves (level 0)

Tick **Debug**, pick **Floor 0**. The level is 76 tiles wide. Along the bottom of the left part of the level, left to right: a pyramid (2-tile ramp up, plateau, ramp down), a half-pipe between two 1-tile blocks, a plateau with rounded shoulders, a row of downward-pointing ceiling triangles, and a ramp against the right wall. The spawn drops you at the left of the pyramid. Untick Debug at some point and repeat the movement checks: dying is off in debug, and hazards (the projectile launcher at the right) are live without it.

- [ ] Every slope and curve draws in the level's block colour with no gaps or seams against neighbouring blocks. With Debug on, red outlines follow each shape.
- [ ] Walk and run (`Shift`) up the pyramid ramp: your speed does **not** drop at any tile seam, you never leave the ground, and your feet stay on the surface. Slopes must not change how fast you go (no slowing uphill, no speeding up downhill).
- [ ] Run down the far side: you stay grounded the whole way (no brief falling animation, and jumping works at every point). Same when running down onto the flat floor at the bottom.
- [ ] Stand still on a ramp: you don't slide, drift or jitter. `S` crouches; running then `S` slides along the slope.
- [ ] Jump from the middle of a ramp, then from its top: the jump height feels the same as on flat ground, and you land back on the slope cleanly.
- [ ] Run over the plateau's rounded shoulder: you follow the curve down and drop off the steep part instead of catching on it.
- [ ] Half-pipe: running right from the pyramid you stop against its first 1-tile block (jump onto it). From there run right: you drop into the dip, climb the right-hand curve, and are stopped where it turns steeper than 45° (you don't climb the vertical part). You never stick or cling to it.
- [ ] Jump toward a steep curved face while airborne: you are blocked and slide down it. **You must not wall-slide or wall-jump off a slope or curve** (walls made of full blocks still work as before).
- [ ] Ceiling triangles: you can walk under them at standing height (1px to spare), and a jump into one stops your rise instead of passing through.
- [ ] Ramp against the right wall: you can climb it and step onto the plateau at its top with no stall.
- [ ] Hazards still work around slopes: a projectile fired left by the launcher is destroyed when it hits a slope or curve, and spikes are stopped by them.
- [ ] Run into the far right wall and the map edges next to slopes: you stay on the floor (no popping upward).
- [ ] **Bay for the gentle and steep shapes** (the right part of the level, columns 46-75, x=1150 and up; walk there or use click-to-teleport). Left to right at floor level: a gentle pyramid (two 26.6° steps up, a plateau, two steps down), a V-shaped pit between two steep faces, and a tunnel whose ceiling dips to one tile above head height.
- [ ] Gentle pyramid: run (`Shift`) up and over it: your speed never dips, you stay grounded the whole way, and your feet stay on the surface. Standing on it you don't slide. A jump from it feels like a jump from flat ground.
- [ ] V-pit: drop in from above. You land on its floor, and walking into either face stops you like a wall: you can't climb it, and you **don't cling or wall-jump** off it. You can jump out.
- [ ] Ceiling tunnel: walk through at standing height (25px to spare at the pinch); a jump under it stops your rise at the underside instead of passing through.
- [ ] Floors 1-16 are unaffected: pick a few and check movement, wall jumps and hazards feel identical to before.

---

## 15. Level Editor

Click **LEVEL EDITOR** on the title screen. Serve over HTTP as usual. Use a clean profile for the draft checks, or clear `paks.editor.draft` from localStorage first.

**Opening and layout**
- [ ] The editor opens with no console errors: a top bar, tool and tile palette on the left, an inspector on the right, and a blank walled level with a stickman **SPAWN** marker and an **EXIT** door.
- [ ] The level is scaled to fit between the panels (nothing hidden behind them) at 1280x720 and at 1920x1080, and stays fitted when you resize the window.
- [ ] The palette icons show every tile: block, four 45° slopes, gentle slopes (high and low half), steep slopes (tip and base), rounded shoulders and quarter-pipes, four orientations each.
- [ ] No floor-time panel is drawn while editing.

**Tiles**
- [ ] Brush: click paints exactly the clicked cell (also with the page scaled down); a fast drag leaves no gaps; right-drag erases. `Alt`+click or `I` picks the tile under the cursor.
- [ ] Rectangle (`R`) fills, `Shift` makes an outline. Fill (`F`) floods only the connected area. A translucent ghost shows what you are about to paint.
- [ ] Picking a slope tile from the palette and painting it draws the same shape as in the game. Build a gentle ramp (a LOW half next to a HIGH half) and a steep face (a TIP above a BASE).

**Entities**
- [ ] Spike, Launcher, Laser, Platform, Lever place on click (centred on the cursor, snapped); Big block is drawn by dragging (a plain click makes a 100x100 one). Each looks like it does in the game, and nothing moves or fires while editing.
- [ ] Select (`S`): click an entity, the spawn or the exit to select it (yellow dashed box), drag to move (snapped to the Snap setting), arrow keys nudge, `Delete` removes an entity (never the spawn or exit), `Ctrl+D` duplicates.
- [ ] The inspector edits each type's fields (numbers, checkboxes, dropdowns, text). An edit changes the level immediately, and Tab moves through the fields without losing focus.
- [ ] Level panel (nothing selected): Resize warns before cutting off tiles or entities, refuses sizes outside 10-300, and `Ctrl+Z` undoes it. Add border draws the outer ring.

**Undo and problems**
- [ ] `Ctrl+Z` / `Ctrl+Y` (or `Ctrl+Shift+Z`): a whole brush or move drag is one step, and so is each inspector edit.
- [ ] Set the exit's levers needed above the number of levers: the Problems list says the exit can never open, Playtest is disabled, and pressing `P` explains why instead of starting. Clicking a problem selects the thing it is about.
- [ ] Open **Floor 14**: it opens with no errors or warnings (its big blocks are drawn and solid) and can be played.

**Panning and zooming** (for large levels)
- [ ] The wheel zooms toward the cursor (the spot under the cursor stays put). `Space` + drag and middle-drag pan. `0` (or the **Fit** button) shows the whole level, `1` (**100%**) is actual size, `+`/`-` zoom in steps, arrow keys pan when nothing is selected. The status bar shows the zoom.
- [ ] Painting, erasing, placing and dragging still hit the exact cell/spot you point at while zoomed and panned. Space+drag never paints.
- [ ] Resize a level to 200x120 (the level panel), then to 300x300: it stays responsive, the grid thins out when zoomed far out, and Fit shows all of it.
- [ ] Playtest a large level: the view switches to the game's own (the camera follows the player), and `Esc` returns to the editor looking at the same spot you left.

**Playtest** (`P` or the Playtest button)
- [ ] The panels hide and the level fills the window with the floor timer. You spawn at the marker and move, jump, wall jump and slide exactly as in the game.
- [ ] Touching a hazard shows a **YOU DIED** screen; `Enter` restarts from the spawn. Reaching the open exit (after collecting the levers it needs) shows **LEVEL CLEARED** with the time; `Enter` plays again.
- [ ] `M` and `L` on those screens do not leave the editor or open the menu. `Esc` returns to the editor with the level unchanged.
- [ ] Afterwards the real game is untouched: no best time was saved for any floor, the Levels screen shows the same progress, and Start still begins on the floor you expect.
- [ ] Tick **Debug** first: you can't die or win in the playtest (a god-mode test), as in the game.

**Files**
- [ ] **Open floor** copies a built-in floor into the editor (asks first if you have unsaved changes). The name shows in the top-right with a `*` once modified.
- [ ] **Save overwrites the level's file.** In Chrome/Edge: **Open floor** 5, edit, **Save**: the first time it asks you to pick your `GameEngine/levels` folder (and to allow editing there); pick it. `git diff` then shows `level_05.json` changed by only your edit, and "Saved levels/level_05.json" appears in the status bar. Further Saves write with no prompt, also after a page reload (the folder is remembered; the browser may ask permission again after a browser restart). Picking a folder without `level_00.json` is refused.
- [ ] **Save as…** always asks for a file. After it, Save overwrites that file instead. A brand-new level's first Save asks where to save. **Levels folder…** forgets the remembered folder and asks again. Hover Save to see what it will overwrite. In a browser without the File System Access API (Firefox, Safari), Save downloads `level_XX.json`.
- [ ] **Open file…** refuses a file that isn't a level the game can load (bad JSON, ragged rows, unknown tile ids, an unreachable exit) and lists the reasons. The current level is left alone.
- [ ] Reload the page with unsaved changes (the browser asks first), open the editor again: it offers to **restore your unsaved level**, and Restore brings back exactly what you had.
- [ ] **Exit** asks before discarding unsaved changes, returns to the title screen, and the game is back at its normal scale. Press Start: a normal game begins and you can move.

## 16. Known Issues to Watch

- **M / V keys:** the volume panel is on `V`; `M` is only "go to menu" on the death/complete screens. Verify `M` there no longer opens the volume panel.
- **Level 16 lasers:** `direction: 'HORTIZONTAL'` typo was fixed in `levelconfig.js` and is corrected in the JSON files. Confirm all black lasers render and kill the player.
- **Completing level 16:** The "continue" button now shows a "Game Complete" screen with a "Home" button that returns to the welcome screen. Verify this works and no crash occurs.
- **Level 14 big blocks:** they used to have reversed corners (drawn but never solid) and were fixed by hand, so they now collide. Check the two big slabs along the top and the blocks on the sides really are solid.
- **Editor and the title screen:** exiting the editor returns to the title screen; the level being edited is not kept (save it first, or restore it from the draft).
- **Level 14 duplicate levers:** Two lever objects are placed at identical coordinates. Confirm the exit door opens after collecting the correct number of unique levers.
- **Corner clipping (pre-existing):** a diagonal jump or fall into the corner of a full block can nick the corner by a few pixels for a frame before it resolves. Not a slope bug; the original game does it too.
- **Slope feet:** the hitbox rests on its higher corner on a slope, so with Debug on the box hovers above the surface while the sprite's feet touch it. Expected.
- **JSON level loading:** Open the browser console on load and verify no `Failed to load levels/level_XX.json` errors appear. If they do, the game is likely being served from `file://` instead of HTTP.

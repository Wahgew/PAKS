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
- [ ] `M` key toggles the volume panel.

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
- [ ] `M` on death screen → goes to main menu (not volume panel — see known M-key conflict).
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

## 13. Screen Resizing

- [ ] Resizing the browser window keeps the canvas centered.
- [ ] Game is playable at common browser widths (1280px, 1440px, 1920px).

---

## 14. Slopes and Curves (level 0)

Tick **Debug**, pick **Floor 0**. Along the bottom of the level, left to right: a pyramid (2-tile ramp up, plateau, ramp down), a half-pipe between two 1-tile blocks, a plateau with rounded shoulders, a row of downward-pointing ceiling triangles, and a ramp against the right wall. The spawn drops you at the left of the pyramid. Untick Debug at some point and repeat the movement checks: dying is off in debug, and hazards (the projectile launcher at the right) are live without it.

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
- [ ] Floors 1-16 are unaffected: pick a few and check movement, wall jumps and hazards feel identical to before.

---

## 15. Known Issues to Watch

- **M-key conflict:** On the death/complete screen, `M` triggers the "go to menu" action *and* the volume-panel toggle simultaneously. Verify neither crashes.
- **Level 16 lasers:** `direction: 'HORTIZONTAL'` typo was fixed in `levelconfig.js` and is corrected in the JSON files. Confirm all black lasers render and kill the player.
- **Completing level 16:** The "continue" button now shows a "Game Complete" screen with a "Home" button that returns to the welcome screen. Verify this works and no crash occurs.
- **Level 14 duplicate levers:** Two lever objects are placed at identical coordinates. Confirm the exit door opens after collecting the correct number of unique levers.
- **Corner clipping (pre-existing):** a diagonal jump or fall into the corner of a full block can nick the corner by a few pixels for a frame before it resolves. Not a slope bug; the original game does it too.
- **Slope feet:** the hitbox rests on its higher corner on a slope, so with Debug on the box hovers above the surface while the sprite's feet touch it. Expected.
- **JSON level loading:** Open the browser console on load and verify no `Failed to load levels/level_XX.json` errors appear. If they do, the game is likely being served from `file://` instead of HTTP.

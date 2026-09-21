// The editor's playtest without a browser: a level authored with LevelModel is assembled by the real
// LevelConfig.assemble and played by the real Player, with PlaytestUI standing in for LevelUI. This is what
// guarantees a playtest can be won and lost, and that it never touches best times, progress or the current floor.
const test = require('node:test');
const assert = require('node:assert/strict');
const {loadBrowserScripts} = require('./helpers/browserScripts.js');

const win = {};
const get = loadBrowserScripts(['boundingBox.js', 'tileShapes.js', 'drawMap.js', 'exitDoor.js', 'platform.js', 'lever.js', 'deathParticle.js', 'deathAnimate.js',
    'bigblock.js', 'enemies.js', 'player.js', 'levelconfig.js', 'levelLoader.js', 'levelModel.js', 'levelEditor.js'], {
    window: win,
    console: {log() {}, warn: console.warn, error: console.error},
    setTimeout: fn => fn(),                      // Player.kill() shows the death screen from a timer; run it at once
    ASSET_MANAGER: {getAsset: () => ({width: 46, height: 106})},
    Animator: class { drawFrame() {} },
});
const PlaytestUI = get('PlaytestUI');
const LevelConfig = get('LevelConfig');
const LevelLoader = get('LevelLoader');
const M = get('LevelModel');

const plain = v => JSON.parse(JSON.stringify(v));
const frame = () => new Promise(r => setImmediate(r));

// Just enough of the editor for PlaytestUI: it reports clears and asks for restarts
function makePlaytest(level) {
    const calls = {cleared: [], restarts: 0, fits: 0};
    const timer = {t: 0, running: true, reset() { this.t = 0; this.running = true; }, stop() { this.running = false; }, getDisplayTime() { return this.t; }};
    const game = {
        entities: [], keys: {}, options: {debugging: false}, clockTick: 1 / 60, timer,
        ctx: {canvas: {addEventListener() {}, removeEventListener() {}}},
        addEntity(e) { this.entities.push(e); },
        // anything the real LevelUI would do with saved data must not be reachable from a playtest
        levelTimesManager: new Proxy({}, {get() { throw new Error('a playtest touched the best-time store'); }}),
    };
    const editor = {game, noteCleared: t => calls.cleared.push(t), restartPlaytest: () => { calls.restarts++; }, fitCanvas: () => { calls.fits++; }};
    game.levelUI = new PlaytestUI(editor);
    const config = new LevelConfig(game);
    config.currentLevel = 7;
    const loader = new LevelLoader();
    loader.store(0, plain(level));
    config.assemble(loader.getLevelEntities(0, game, 25));
    return {game, config, calls, ui: game.levelUI};
}

async function run(world, keys, frames, until) {
    for (let f = 0; f < frames; f++) {
        world.game.keys = keys;
        for (const e of [...world.game.entities]) if (!e.removeFromWorld) e.update();
        await frame();
        if (until()) return f;
    }
    return -1;
}

test('a level authored with the model can be won: the exit opens the clear screen and reports the time', async () => {
    const level = M.createBlank(30, 12);
    const w = makePlaytest(level);
    assert.equal(w.game.Player.x, level.player.x);
    w.game.timer.t = 4.25;   // what the clock would read on arrival
    const at = await run(w, {d: true, shift: true}, 900, () => w.ui.isDisplayingComplete);
    assert.ok(at >= 0, 'never reached the exit');
    assert.equal(w.ui.isDisplayingComplete, true);
    assert.deepEqual(w.calls.cleared, [4.25], 'the editor was told the clear time');
    assert.equal(w.game.timer.running, false, 'winning stops the clock');
    assert.equal(w.config.currentLevel, 7, 'a playtest never changes the current floor');
    assert.equal(win.CURRENT_GAME_LEVEL, undefined);
});

test('a lever-gated exit can be won with the lever and stays shut without it', async () => {
    const level = M.createBlank(30, 12);
    level.exitDoor.levers = 1;
    level.entities.push(M.makeEntity('Lever', 300, 222));   // on the floor between spawn and exit (feet at 275)
    const w = makePlaytest(level);
    await run(w, {d: true, shift: true}, 900, () => w.ui.isDisplayingComplete);
    assert.equal(w.ui.isDisplayingComplete, true, 'walking through the lever then the exit should win');

    const noLever = M.createBlank(30, 12);
    noLever.exitDoor.levers = 1;
    noLever.entities.push(M.makeEntity('Lever', 300, 30));   // up in the air, out of reach
    const w2 = makePlaytest(noLever);
    await run(w2, {d: true, shift: true}, 400, () => w2.ui.isDisplayingComplete);
    assert.equal(w2.ui.isDisplayingComplete, false, 'the exit must stay shut without the lever');
});

test('a spike in the path kills the player and the death screen state follows', async () => {
    const level = M.createBlank(30, 12);
    level.entities.push(M.makeEntity('Spike', 300, 235));   // 40px spike standing on the floor
    const w = makePlaytest(level);
    const at = await run(w, {d: true}, 900, () => w.game.Player.dead);
    assert.ok(at >= 0, 'the player walked through the spike');
    assert.equal(w.ui.isDisplayingDeath, true);
    assert.equal(w.ui.isDisplayingComplete, false);
    // the engine's Enter handler calls this while the death screen shows
    w.ui.handleButtonAction('continue');
    assert.equal(w.calls.restarts, 1);
});

test('a death timer that fires after the run was replaced cannot show a death screen on the new run', () => {
    const level = M.createBlank(30, 12);
    const w = makePlaytest(level);
    const oldPlayer = w.game.Player;
    oldPlayer.kill();                            // the old run dies; the (immediate) timer sets the flag
    assert.equal(w.ui.isDisplayingDeath, true);

    // the run is restarted: a fresh player replaces the dead one and the screens reset
    const loader = new LevelLoader();
    loader.store(0, plain(level));
    w.config.assemble(loader.getLevelEntities(0, w.game, 25));
    assert.notEqual(w.game.Player, oldPlayer);
    assert.equal(w.ui.isDisplayingDeath, false, 'assemble resets the screens');

    // ...and now the old player's late timer lands
    w.ui.isDisplayingDeath = true;
    assert.equal(w.ui.isDisplayingDeath, false, 'the live player is alive, so a stale "dead" must be ignored');
});

test('PlaytestUI draws each state and asks the editor to fit the canvas every frame', () => {
    const w = makePlaytest(M.createBlank(30, 12));
    const drawn = [];
    const ctx = new Proxy({canvas: {width: 750, height: 300}}, {
        get: (t, k) => k in t ? t[k] : (...a) => { drawn.push([k, a]); },
        set: (t, k, v) => { t[k] = v; return true; },
    });
    const said = re => drawn.some(([k, a]) => k === 'fillText' && re.test(String(a[0])));

    w.ui.draw(ctx);                         // running: just the banner
    assert.ok(said(/PLAYTEST/));
    w.game.Player.kill();
    drawn.length = 0;
    w.ui.draw(ctx);
    assert.ok(said(/YOU DIED/));
    w.ui.resetUIState();
    w.ui.clearTime = 65.5;
    w.ui.isDisplayingComplete = true;
    drawn.length = 0;
    w.ui.draw(ctx);
    assert.ok(said(/LEVEL CLEARED/));
    assert.ok(said(/^01:05\.50$/), 'the clear time is formatted mm:ss.cc');
    assert.equal(w.calls.fits, 3);
});

test('the playtest world is the draft: same tiles, entities and spawn, map first and player last', () => {
    const level = M.createBlank(30, 12);
    level.entities.push(M.makeEntity('Spike', 100, 100), M.makeEntity('Platform', 300, 200));
    const w = makePlaytest(level);
    assert.deepEqual(plain(w.game.entities.map(e => e.constructor.name)), ['drawMap', 'exitDoor', 'Spike', 'Platform', 'Player']);
    assert.deepEqual(plain(w.game.entities[0].map), plain(level.map.tiles));
});

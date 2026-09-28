// A whole level played headlessly: the real LevelLoader, LevelConfig.assemble and Player, stepped at the game's
// 60 fps with keys you script. Timers run on the game's clock (a frame is 1000/60 ms), so the wall-jump cooldown
// and the death-screen delay behave exactly as they do in the browser, without waiting for real time.
const {loadBrowserScripts} = require('./browserScripts.js');

const DT = 1 / 60;
const pending = [];          // {at, fn}: timers of the world being played
let now = 0;                 // ms of game time in that world

const get = loadBrowserScripts(['boundingBox.js', 'tileShapes.js', 'drawMap.js', 'exitDoor.js', 'platform.js', 'lever.js', 'hint.js',
    'deathParticle.js', 'deathAnimate.js', 'bigblock.js', 'enemies.js', 'player.js', 'levelconfig.js', 'levelLoader.js'], {
    window: {},
    console: {log() {}, warn: console.warn, error: console.error},
    setTimeout: (fn, ms = 0) => { pending.push({at: now + ms, fn}); return pending.length; },
    ASSET_MANAGER: {getAsset: () => ({width: 46, height: 106})},
    Animator: class { drawFrame() {} },
});
const LevelConfig = get('LevelConfig');
const LevelLoader = get('LevelLoader');

const plain = v => JSON.parse(JSON.stringify(v));

/** Key names in a script: a space-separated string like 'd shift w' (a jump is 'w' or ' '). */
const keysOf = spec => Object.fromEntries(String(spec).split(/\s+/).filter(Boolean).map(k => [k, true]));

/**
 * Builds `level` (the JSON object a level file holds) into a playable world.
 * The player stands where the file says; nothing is saved, timed or unlocked.
 */
function play(level) {
    pending.length = 0;
    now = 0;
    const timer = {t: 0, running: true, reset() { this.t = 0; this.running = true; }, stop() { this.running = false; }, getDisplayTime() { return this.t; }};
    const ui = {
        isDisplayingDeath: false, isDisplayingComplete: false,
        hideLevelComplete() {}, resetUIState() {}, async updateBestTimeCache() {}, async showLevelComplete() { this.isDisplayingComplete = true; },
    };
    const game = {
        entities: [], keys: {}, options: {debugging: false}, clockTick: DT, timer, levelUI: ui,
        ctx: {canvas: {addEventListener() {}, removeEventListener() {}}},
        addEntity(e) { this.entities.push(e); },
        // a headless run must never reach saved data
        levelTimesManager: new Proxy({}, {get() { throw new Error('the level touched the best-time store'); }}),
    };
    const loader = new LevelLoader();
    loader.store('t', plain(level));
    const config = new LevelConfig(game);
    config.assemble(loader.getLevelEntities('t', game, 25));

    const world = {
        game, config, ui, timer,
        get player() { return game.Player; },
        get won() { return !!game.Player.win; },
        get dead() { return !!game.Player.dead; },
        get frames() { return Math.round(now / (DT * 1000)); },
        /** Feet position and horizontal centre: what a level designer reasons about. */
        at() { const p = game.Player; return {x: p.x, y: p.y, left: p.x, right: p.x + p.width, feet: p.y + p.height, grounded: p.isGrounded}; },
        /** One frame with these keys held. */
        step(keys = '') {
            game.keys = keysOf(keys);
            for (const e of [...game.entities]) if (e && !e.removeFromWorld) e.update();
            game.entities = game.entities.filter(e => !e.removeFromWorld);
            if (timer.running) timer.t += DT;
            now += DT * 1000;
            for (let i = pending.length - 1; i >= 0; i--) {
                if (pending[i].at <= now) pending.splice(i, 1)[0].fn();
            }
        },
        /** Hold `keys` for up to `frames` frames, or until `until(world)` is true. Returns the frames used. */
        hold(keys, frames, until) {
            for (let f = 0; f < frames; f++) {
                if (until && until(world)) return f;
                world.step(keys);
            }
            return frames;
        },
        /** Play a script: [[keys, frames, until?], ...]. */
        run(script) { for (const [keys, frames, until] of script) world.hold(keys, frames, until); return world; },
    };
    return world;
}

module.exports = {play, get, DT};

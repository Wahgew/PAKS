// How the tutorial is wired into the game: LevelConfig.loadTutorial, the LevelUI branches for a tutorial (no best
// time, "next: floor 1", retry reloads the tutorial, the skip button) and what Reset Progress clears. The real classes
// run against stubs for the browser: no DOM, no IndexedDB.
const test = require('node:test');
const assert = require('node:assert/strict');
const {loadBrowserScripts, loadLevel, loadLevelFile} = require('./helpers/browserScripts.js');

const store = () => {
    const data = {};
    return {getItem: k => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); }, removeItem: k => { delete data[k]; }, data};
};

const win = {localStorage: store(), addEventListener() {}};
const bestTimeWrites = [];
const get = loadBrowserScripts(['tutorial.js', 'boundingBox.js', 'tileShapes.js', 'drawMap.js', 'exitDoor.js', 'platform.js', 'lever.js', 'hint.js',
    'deathParticle.js', 'deathAnimate.js', 'bigblock.js', 'enemies.js', 'player.js', 'levelconfig.js', 'levelLoader.js', 'LevelUI.js'], {
    window: win,
    console: {log() {}, warn: console.warn, error() {}},
    setTimeout: fn => fn(),                       // Player.kill() shows the death screen from a timer
    ASSET_MANAGER: {getAsset: () => ({width: 46, height: 106})},
    Animator: class { drawFrame() {} },
});
const LevelConfig = get('LevelConfig');
const LevelUI = get('LevelUI');
const Tutorial = get('Tutorial');
win.LEVEL_LOADER.store(Tutorial.LEVEL_KEY, loadLevelFile('tutorial'));
win.LEVEL_LOADER.store(1, loadLevel(1));

/** A game with the real LevelConfig and LevelUI. Best times are recorded so a test can prove none was written. */
function makeGame() {
    win.localStorage = store();
    win.LAST_ENGINE = undefined;
    win.CURRENT_GAME_LEVEL = undefined;
    bestTimeWrites.length = 0;
    const clicks = [];
    const timer = {t: 12.5, running: true, reset() { this.t = 0; this.running = true; }, stop() { this.running = false; }, getDisplayTime() { return this.t; }};
    const game = {
        entities: [], keys: {}, options: {debugging: false}, clockTick: 1 / 60, timer, mouse: null,
        ctx: {canvas: {addEventListener: (type, fn) => { if (type === 'click') clicks.push(fn); }, removeEventListener() {}}},
        pointerToCanvas: e => ({x: e.x, y: e.y}),
        addEntity(e) { this.entities.push(e); },
        levelTimesManager: {
            dbReady: Promise.resolve(),
            async getBestTime() { return 9000000000; },
            async updateBestTime(level, time) { bestTimeWrites.push([level, time]); return true; },
            formatTime: t => String(t),
        },
    };
    game.levelUI = new LevelUI(game);
    game.levelConfig = new LevelConfig(game);
    win.LAST_ENGINE = game;
    game.click = pos => clicks.forEach(fn => fn(pos));   // a click at canvas pixel pos.x, pos.y
    return game;
}

const classes = game => game.entities.map(e => e.constructor.name);
const SKIP = LevelUI.SKIP_BUTTON;
const insideSkip = {x: SKIP.x + SKIP.w / 2, y: SKIP.y + SKIP.h / 2};

// ---- LevelConfig ----

test('loadTutorial builds the tutorial world, untimed, and leaves the floor number and saved progress alone', () => {
    const game = makeGame();
    game.levelConfig.currentLevel = 7;
    assert.equal(game.levelConfig.loadTutorial(), true);
    assert.equal(game.levelConfig.tutorial, true);
    assert.equal(game.hideHud, true, 'no floor-time panel');
    assert.equal(game.levelConfig.currentLevel, 7);
    assert.equal(win.CURRENT_GAME_LEVEL, undefined, 'the "current floor" tracker is not touched');
    const names = classes(game);
    assert.equal(names[0], 'drawMap');
    assert.equal(names.at(-1), 'Player', 'the player is drawn in front');
    assert.equal(names.filter(n => n === 'Hint').length, loadLevelFile('tutorial').entities.filter(e => e.type === 'Hint').length);
    assert.ok(names.includes('exitDoor') && names.includes('Lever') && names.includes('GlowingLaser') && names.includes('Spike'));
    assert.equal(game.Player.x, loadLevelFile('tutorial').player.x);
});

test('loading a floor afterwards is a normal floor again: the flag and the hidden timer panel are cleared', () => {
    const game = makeGame();
    game.levelConfig.loadTutorial();
    game.levelConfig.loadLevel(1);
    assert.equal(game.levelConfig.tutorial, false);
    assert.equal(game.hideHud, false);
    assert.equal(game.levelConfig.currentLevel, 1);
    assert.equal(game.Player.x, loadLevel(1).player.x);
});

test('the editor\'s assemble() is not the tutorial: it never sets the flag', () => {
    const game = makeGame();
    game.levelConfig.assemble(win.LEVEL_LOADER.getLevelEntities(Tutorial.LEVEL_KEY, game, 25));
    assert.equal(game.levelConfig.tutorial, false);
});

test('loadTutorial reports a missing level file instead of throwing, and changes nothing', () => {
    const game = makeGame();
    game.levelConfig.loadLevel(1);
    const before = classes(game).join();
    const saved = win.LEVEL_LOADER.levels[Tutorial.LEVEL_KEY];
    delete win.LEVEL_LOADER.levels[Tutorial.LEVEL_KEY];
    try {
        assert.equal(game.levelConfig.loadTutorial(), false);
        assert.equal(game.levelConfig.tutorial, false);
        assert.equal(classes(game).join(), before);
    } finally {
        win.LEVEL_LOADER.levels[Tutorial.LEVEL_KEY] = saved;
    }
});

// ---- LevelUI ----

test('clearing the tutorial shows the clear screen, records no best time and remembers the tutorial is done', async () => {
    const game = makeGame();
    game.levelConfig.loadTutorial();
    assert.equal(Tutorial.isDone(win.localStorage), false);
    await game.levelUI.showLevelComplete();
    assert.equal(game.levelUI.isDisplayingComplete, true);
    assert.deepEqual(bestTimeWrites, [], 'the tutorial has no best time');
    assert.equal(Tutorial.isDone(win.localStorage), true);
});

test('clearing a numbered floor still records its best time and leaves the tutorial flag alone (the control case)', async () => {
    const game = makeGame();
    game.levelConfig.loadLevel(1);
    game.timer.t = 12.5;                          // loading a level restarts the clock; this is what it reads on arrival
    await game.levelUI.showLevelComplete();
    assert.deepEqual(bestTimeWrites, [[1, 12.5]]);
    assert.equal(Tutorial.isDone(win.localStorage), false);
});

test('Enter on the tutorial clear screen goes to floor 1 (not "next floor"), leaving the tutorial behind', async () => {
    const game = makeGame();
    game.levelConfig.loadTutorial();
    let nextLevelCalls = 0;
    game.levelConfig.loadNextLevel = () => { nextLevelCalls++; };
    await game.levelUI.showLevelComplete();
    game.levelUI.handleButtonAction('continue');
    assert.equal(nextLevelCalls, 0);
    assert.equal(game.levelConfig.tutorial, false);
    assert.equal(game.levelConfig.currentLevel, 1);
    assert.equal(game.levelUI.isDisplayingComplete, false);
    assert.equal(game.Player.x, loadLevel(1).player.x, 'floor 1 is what is on screen');
    assert.equal(game.hideHud, false, 'the timer is back');
});

test('dying in the tutorial and pressing Retry restarts the tutorial, not a floor', () => {
    const game = makeGame();
    game.levelConfig.currentLevel = 5;
    game.levelConfig.loadTutorial();
    const first = game.Player;
    first.kill();
    assert.equal(game.levelUI.isDisplayingDeath, true);
    game.levelUI.handleButtonAction('continue');
    assert.equal(game.levelConfig.tutorial, true);
    assert.equal(game.levelConfig.currentLevel, 5, 'the floor number is still untouched');
    assert.notEqual(game.Player, first);
    assert.equal(game.Player.dead, false);
    assert.equal(game.Player.x, loadLevelFile('tutorial').player.x);
    assert.equal(game.levelUI.isDisplayingDeath, false);
});

test('the skip button: a click on it marks the tutorial done and starts floor 1', () => {
    const game = makeGame();
    game.levelConfig.loadTutorial();
    game.keys.d = true;
    game.click(insideSkip);
    assert.equal(game.levelConfig.tutorial, false);
    assert.equal(game.levelConfig.currentLevel, 1);
    assert.equal(Tutorial.isDone(win.localStorage), true, 'skipping counts as done');
    assert.equal(game.keys.d, false, 'a held key does not carry into floor 1');
    assert.equal(game.Player.x, loadLevel(1).player.x);
});

test('the skip button does nothing outside its box, outside the tutorial, on a result screen, or for an engine that is not on screen', () => {
    const outside = {x: SKIP.x + SKIP.w + 5, y: SKIP.y};
    let game = makeGame();
    game.levelConfig.loadTutorial();
    game.click(outside);
    game.click({x: SKIP.x, y: SKIP.y - 1});
    assert.equal(game.levelConfig.tutorial, true, 'a miss');

    game.Player.kill();
    game.click(insideSkip);
    assert.equal(game.levelConfig.tutorial, true, 'the death screen has its own buttons');

    game = makeGame();
    game.levelConfig.loadLevel(1);
    game.click(insideSkip);
    assert.equal(game.levelConfig.currentLevel, 1);
    assert.equal(Tutorial.isDone(win.localStorage), false, 'on a floor there is no skip button');

    game = makeGame();
    game.levelConfig.loadTutorial();
    win.LAST_ENGINE = {};                               // a newer engine took over the canvas
    game.click(insideSkip);
    assert.equal(game.levelConfig.tutorial, true, 'an old engine\'s listener must not react');
});

test('the tutorial screens: a skip button while playing, and a clear screen with no times', async () => {
    const game = makeGame();
    const drawn = [];
    const ctx = new Proxy({canvas: {width: 1900, height: 1025}}, {
        get: (t, k) => k in t ? t[k] : (...a) => { drawn.push([k, a]); },
        set: (t, k, v) => { t[k] = v; return true; },
    });
    const said = re => drawn.some(([k, a]) => k === 'fillText' && re.test(String(a[0])));

    game.levelConfig.loadTutorial();
    await game.levelUI.draw(ctx);
    assert.ok(said(/SKIP TUTORIAL/));

    drawn.length = 0;
    await game.levelUI.showLevelComplete();
    await game.levelUI.draw(ctx);
    assert.ok(said(/TUTORIAL COMPLETE/));
    assert.ok(said(/Floor 1 is next/));
    assert.ok(!said(/BEST TIME|CURRENT TIME|FLOOR COMPLETE/), 'no times, no floor wording');
    assert.ok(!said(/SKIP TUTORIAL/), 'the skip button goes away on the clear screen');

    const floor = makeGame();
    floor.levelConfig.loadLevel(1);
    drawn.length = 0;
    await floor.levelUI.showLevelComplete();
    await floor.levelUI.draw(ctx);
    assert.ok(said(/FLOOR COMPLETE/) && said(/BEST TIME/), 'a floor still shows its times');
    assert.ok(!said(/SKIP TUTORIAL/));
});

// ---- Reset Progress ----

test('Reset Progress clears everything: unlocked floors, best times and the tutorial flag', async () => {
    const calls = [];
    const win2 = {
        localStorage: store(),
        LEVEL_PROGRESS: {async resetProgress() { calls.push('progress'); }},
        LAST_ENGINE: {levelTimesManager: {async resetAllTimes() { calls.push('times'); }}},
        CURRENT_GAME_LEVEL: 9,
        addEventListener() {},
    };
    const get2 = loadBrowserScripts(['tutorial.js', 'levelProgressManager.js'], {
        window: win2, document: {addEventListener() {}, getElementById: () => null},
        console: {log() {}, warn() {}, error: console.error},
        setTimeout: () => 0,
        LevelsScreen: class {},
    });
    const T = get2('Tutorial');
    T.markDone(win2.localStorage);
    assert.equal(T.isDone(win2.localStorage), true);

    await win2.resetLevelProgress();
    assert.deepEqual(calls, ['progress', 'times']);
    assert.equal(T.isDone(win2.localStorage), false, 'the tutorial will start again');
    assert.equal(win2.CURRENT_GAME_LEVEL, 1);
});

test('Reset Progress still clears the tutorial flag if the best times cannot be reset', async () => {
    const win2 = {
        localStorage: store(),
        LEVEL_PROGRESS: {async resetProgress() {}},
        LAST_ENGINE: {levelTimesManager: {async resetAllTimes() { throw new Error('db down'); }}},
        addEventListener() {},
    };
    const get2 = loadBrowserScripts(['tutorial.js', 'levelProgressManager.js'], {
        window: win2, document: {addEventListener() {}, getElementById: () => null},
        console: {log() {}, warn() {}, error() {}},
        setTimeout: () => 0,
        LevelsScreen: class {},
    });
    const T = get2('Tutorial');
    T.markDone(win2.localStorage);
    await win2.resetLevelProgress();
    assert.equal(T.isDone(win2.localStorage), false);
});

// LevelConfig.loadLevel builds a level into the engine; assemble() is the half of it that doesn't depend on a
// level number, which the level editor's playtest uses. loadLevel must behave exactly as before the split.
const test = require('node:test');
const assert = require('node:assert/strict');
const {loadBrowserScripts, loadLevel} = require('./helpers/browserScripts.js');

const win = {};
const get = loadBrowserScripts(['boundingBox.js', 'tileShapes.js', 'drawMap.js', 'exitDoor.js', 'platform.js', 'lever.js',
    'bigblock.js', 'enemies.js', 'player.js', 'levelconfig.js', 'levelLoader.js'], {
    window: win,
    console: {log() {}, warn: console.warn, error: console.error},
    ASSET_MANAGER: {getAsset: () => ({width: 46, height: 106})},
    Animator: class { drawFrame() {} },
});
const LevelConfig = get('LevelConfig');
const LevelLoader = get('LevelLoader');
for (let n = 0; n <= 16; n++) win.LEVEL_LOADER.store(n, loadLevel(n));

function makeGame() {
    const calls = [];
    const game = {
        entities: [], keys: {}, options: {debugging: false}, clockTick: 1 / 60, Player: 'stale', calls,
        ctx: {canvas: {addEventListener() {}, removeEventListener() {}}},
        addEntity(e) { this.entities.push(e); },
        levelUI: {hideLevelComplete: () => calls.push('hideLevelComplete'), resetUIState: () => calls.push('resetUIState')},
        timer: {reset: () => calls.push('timer.reset')},
    };
    return game;
}
const names = game => game.entities.map(e => e.constructor.name);

test('loadLevel builds the map, exit door, hazards and player, in that order, on every floor', () => {
    for (let n = 0; n <= 16; n++) {
        const game = makeGame();
        const config = new LevelConfig(game);
        assert.equal(config.loadLevel(n), true);
        assert.equal(config.currentLevel, n);
        const data = loadLevel(n);
        const built = names(game);
        assert.equal(built.length, 3 + data.entities.length, `floor ${n}: entity count`);
        assert.equal(built[0], 'drawMap');
        assert.equal(built[1], 'exitDoor');
        assert.equal(built[built.length - 1], 'Player', 'the player goes last so it draws in front');
        assert.equal(game.Player, game.entities[game.entities.length - 1], 'game.Player points at the new player');
        assert.deepEqual(game.calls, ['hideLevelComplete', 'resetUIState', 'timer.reset']);
    }
});

test('loadLevel on a floor with no data fails without touching the world', () => {
    const game = makeGame();
    game.entities.push('existing');
    const config = new LevelConfig(game);
    assert.equal(config.loadLevel(99), false);
    assert.deepEqual(game.entities, ['existing']);
    assert.equal(game.Player, 'stale');
});

test('assemble builds a draft level that is not a numbered floor, without touching currentLevel', () => {
    const game = makeGame();
    game.entities.push('left over from before');
    const config = new LevelConfig(game);
    config.currentLevel = 7;

    const draft = loadLevel(3);
    const loader = new LevelLoader();
    loader.store(0, draft);
    config.assemble(loader.getLevelEntities(0, game, 25));

    assert.equal(config.currentLevel, 7, 'a playtest must not change which floor the game thinks it is on');
    assert.equal(names(game).length, 3 + draft.entities.length);
    assert.ok(!game.entities.includes('left over from before'), 'the old world is cleared');
    assert.equal(game.Player.x, draft.player.x);
    assert.equal(game.Player.y, draft.player.y);
    assert.equal(win.CURRENT_GAME_LEVEL, undefined, 'assemble never records a current level');
});

test('assemble works when the engine has no level UI or timer yet', () => {
    const game = makeGame();
    game.levelUI = null;
    game.timer = null;
    const loader = new LevelLoader();
    loader.store(0, loadLevel(1));
    assert.doesNotThrow(() => new LevelConfig(game).assemble(loader.getLevelEntities(0, game, 25)));
});

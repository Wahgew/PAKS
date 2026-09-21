// The engine side of the camera: the canvas is a fixed view, the world is drawn through the camera and the HUD is
// not, only visible tiles are drawn, and pointer positions come out right under a CSS-scaled canvas.
const test = require('node:test');
const assert = require('node:assert/strict');
const {loadBrowserScripts} = require('./helpers/browserScripts.js');

const win = {};
const get = loadBrowserScripts(['camera.js', 'boundingBox.js', 'tileShapes.js', 'drawMap.js', 'gameengine.js'], {
    window: win,
    console: {log() {}, warn() {}, error: console.error},
    LevelUI: class { draw() {} },
    ASSET_MANAGER: {getAsset: () => ({})},
});
const GameEngine = get('GameEngine');
const drawMap = get('drawMap');
const Camera = get('Camera');
const plain = v => JSON.parse(JSON.stringify(v));   // the vm's objects come from another realm

// A canvas context that records what is drawn, in order
function recorder(width, height) {
    const log = [];
    const ctx = {
        canvas: {width, height, getBoundingClientRect: () => ({left: 0, top: 0, width, height})},
        log, imageSmoothingEnabled: false,
    };
    for (const name of ['save', 'restore', 'setTransform', 'fillRect', 'drawImage', 'fillText', 'strokeRect', 'beginPath', 'arc', 'fill', 'clip', 'moveTo', 'lineTo', 'closePath', 'stroke', 'translate', 'scale']) {
        ctx[name] = (...args) => { log.push([name, args, ctx.fillStyle]); };
    }
    return ctx;
}

function makeMap(cols, rows, game) {
    const m = new drawMap(25, game);                    // drawMap has private methods, so it must be really constructed
    m.random = 0;                                       // background 'pink', first block sprite
    m.random2 = 0;
    m.loadMap(Array.from({length: rows}, (_, r) => Array.from({length: cols}, (_, c) => (r === 0 || c === 0 || r === rows - 1 || c === cols - 1) ? 1 : 0)));
    return m;
}

function makeEngine(width = 1900, height = 1025) {
    const game = new GameEngine();
    game.ctx = recorder(width, height);
    game.timer = null;
    game.options.debugging = false;
    return game;
}

test('setViewSize gives the canvas its fixed size, keeps image smoothing on, and tells the window to refit', () => {
    const game = makeEngine(1024, 768);
    let fitted = 0;
    win.fitGameCanvas = () => { fitted++; };
    game.setViewSize(Camera.VIEW_W, Camera.VIEW_H);
    assert.equal(game.ctx.canvas.width, 1900);
    assert.equal(game.ctx.canvas.height, 1025);
    assert.equal(game.ctx.imageSmoothingEnabled, true, 'main.js turns it off once but the old per-frame resize kept it on');
    assert.equal(game.camera.viewW, 1900);
    assert.equal(fitted, 1);
});

test('pointerToCanvas is right when CSS scales the canvas, and pointerToWorld goes through the camera', () => {
    const game = makeEngine(1900, 1025);
    // shown at 0.5 scale, offset by (100, 50) on the page
    game.ctx.canvas.getBoundingClientRect = () => ({left: 100, top: 50, width: 950, height: 512.5});
    assert.deepEqual(plain(game.pointerToCanvas({clientX: 100, clientY: 50})), {x: 0, y: 0});
    assert.deepEqual(plain(game.pointerToCanvas({clientX: 575, clientY: 306.25})), {x: 950, y: 512.5});
    game.camera.x = 300;
    game.camera.y = 200;
    assert.deepEqual(plain(game.pointerToWorld({clientX: 575, clientY: 306.25})), {x: 1250, y: 712.5});
    game.camera.zoom = 2;
    assert.deepEqual(plain(game.pointerToWorld({clientX: 575, clientY: 306.25})), {x: 300 + 475, y: 200 + 256.25});
});

test('the camera follows the player, snaps when a level loads, and stays put when the editor drives it', () => {
    const game = makeEngine();
    game.entities = [makeMap(300, 200, game)];          // 7500 x 5000 px
    game.Player = {x: 3000, y: 2000, width: 20, height: 74};
    game.snapCamera();
    assert.equal(game.camera.x, 3010 - 950);
    assert.equal(game.camera.y, 2037 - 512.5);

    game.Player.x = 3300;
    game.clockTick = 1 / 60;
    game.updateCamera();
    assert.ok(game.camera.x > 3010 - 950 && game.camera.x < 3310 - 950, 'eased part of the way');

    game.cameraManual = true;
    const {x, y} = game.camera;
    game.Player.x = 5000;
    game.updateCamera();
    assert.equal(game.camera.x, x);
    assert.equal(game.camera.y, y);
});

test('update() moves the camera after the entities have moved', () => {
    const game = makeEngine();
    game.entities = [makeMap(300, 200, game)];
    const player = {x: 1000, y: 1000, width: 20, height: 74, update() { this.x += 200; }};
    game.entities.push(player);
    game.Player = player;
    game.snapCamera();
    const before = game.camera.x;
    game.clockTick = 1 / 60;
    game.update();
    assert.ok(game.camera.x > before, 'the camera reacted to the player moving in the same update');
});

test('a level that fits the view is shown whole and centred; there is no camera work to do', () => {
    const game = makeEngine();
    game.entities = [makeMap(76, 36, game)];            // an original floor: 1900 x 900
    game.Player = {x: 1800, y: 800, width: 20, height: 74};
    game.snapCamera();
    assert.equal(game.camera.x, 0);
    assert.equal(game.camera.y, (900 - 1025) / 2);
    game.updateCamera();
    assert.equal(game.camera.x, 0);
    assert.equal(game.camera.y, (900 - 1025) / 2);
});

test('draw: black canvas, then the world through the camera, then the screen-space HUD outside it', () => {
    const game = makeEngine();
    const map = makeMap(76, 36, game);
    game.entities = [map, {draw(ctx) { ctx.fillRect(1, 2, 3, 4); }}];
    game.Player = {x: 100, y: 100, width: 20, height: 74};
    game.snapCamera();
    game.hideHud = false;
    game.timer = {getDisplayTime: () => 65.5};
    game.levelUI = {draw(ctx) { ctx.fillText('SCREEN UI', 5, 5); }};
    game.draw();

    const log = game.ctx.log;
    const names = log.map(l => l[0]);
    const first = log.findIndex(l => l[0] === 'fillRect');
    assert.deepEqual(plain(log[first][1]), [0, 0, 1900, 1025], 'the whole canvas is cleared first');
    assert.equal(log[first][2], 'black');

    const world = log.findIndex(l => l[0] === 'setTransform' && l[1][4] !== 0 || (l[0] === 'setTransform' && l[1][5] !== 0));
    assert.deepEqual(plain(log[world][1]), plain(game.camera.transform()), 'the world is drawn through the camera transform');
    const entityDraw = log.findIndex(l => l[0] === 'fillRect' && l[1].join() === '1,2,3,4');
    const restoreAfterWorld = names.indexOf('restore', entityDraw);
    const hudText = log.findIndex(l => l[0] === 'fillText' && l[1][0] === 'FLOOR TIME');
    const uiText = log.findIndex(l => l[0] === 'fillText' && l[1][0] === 'SCREEN UI');
    assert.ok(world < entityDraw && entityDraw < hudText, 'entities are inside the camera transform, before the HUD');
    assert.ok(names.slice(entityDraw, hudText).includes('restore'), 'the camera transform is undone before the HUD is drawn');
    assert.ok(restoreAfterWorld < hudText && hudText < uiText);
    // a level smaller than the view leaves black around it: its background is only painted over its own area
    const bg = log.find(l => l[0] === 'fillRect' && l[2] === 'pink');
    assert.deepEqual(plain(bg[1]), [0, 0, 1900, 900]);
});

test('drawMap draws only the tiles in view, and never resizes the canvas', () => {
    const game = makeEngine(1900, 1025);
    const map = makeMap(300, 300, game);                // 90,000 tiles, only the border is solid
    // an all-solid interior would be worst case; use a full map
    map.loadMap(Array.from({length: 300}, () => new Array(300).fill(1)));
    game.camera.x = 3000;
    game.camera.y = 2000;
    const ctx = game.ctx;
    map.draw(ctx);
    const tiles = ctx.log.filter(l => l[0] === 'drawImage').length;
    // 1900 x 1025 px is 76 x 41 tiles; allow the partial tile on each side
    assert.ok(tiles > 0 && tiles <= 78 * 43, `drew ${tiles} tiles`);
    assert.equal(ctx.canvas.width, 1900, 'the canvas keeps its size');
    const bg = ctx.log.find(l => l[0] === 'fillRect');
    assert.deepEqual(plain(bg[1]), [0, 0, 7500, 7500], 'the background covers the level, not the canvas');
});

test('pixelWidth and pixelHeight are the level size in pixels', () => {
    const map = makeMap(76, 41, makeEngine());
    assert.equal(map.pixelWidth, 1900);
    assert.equal(map.pixelHeight, 1025);
    const empty = Object.create(drawMap.prototype);
    assert.equal(empty.pixelWidth, 0);
    assert.equal(empty.pixelHeight, 0);
});

// Drives the real Player (player.js) frame by frame on tile maps with slopes and curves, with the browser
// globals stubbed out. Checks behaviour, not just geometry: does the player follow surfaces, keep their speed,
// stay grounded going downhill, jump, and never end up inside the level.
const test = require('node:test');
const assert = require('node:assert/strict');
const {loadBrowserScripts} = require('./helpers/browserScripts.js');

class Stub {}
const get = loadBrowserScripts(['boundingBox.js', 'tileShapes.js', 'drawMap.js', 'player.js'], {
    window: {},
    setTimeout: (fn, ms) => setTimeout(fn, ms).unref(),   // wall-jump cooldown uses real timers
    ASSET_MANAGER: {getAsset: () => ({})},
    Animator: class { drawFrame() {} },
    Projectile: Stub, Spike: Stub, GlowingLaser: Stub, Platform: Stub, Lever: Stub, exitDoor: Stub, BigBlock: Stub,
});
const Player = get('Player');
const drawMap = get('drawMap');
const BoundingBox = get('BoundingBox');
const {ID} = get('TileShapes');

const SIZE = 25;
const DT = 1 / 60;
const LEGEND = {
    '.': 0, '#': 1,
    '\\': ID.SLOPE_BL, '/': ID.SLOPE_BR, 'A': ID.SLOPE_TL, 'B': ID.SLOPE_TR,
    'h': ID.CONVEX_BL, 'i': ID.CONVEX_BR,
    'u': ID.CONCAVE_BL, 'w': ID.CONCAVE_BR,
};

function parse(rows) {
    return rows.map(r => [...r].map(ch => {
        assert.ok(ch in LEGEND, `unknown map char ${ch}`);
        return LEGEND[ch];
    }));
}

// A small headless game: one map, one player, keys you can hold.
function makeWorld(rows, spawnX, spawnBottom) {
    const tiles = parse(rows);
    const map = Object.create(drawMap.prototype);
    map.drawSize = SIZE;
    map.loadMap(tiles);
    const game = {
        keys: {}, clockTick: DT, entities: [map], options: {debugging: false},
        ctx: {canvas: {addEventListener() {}, removeEventListener() {}}},
    };
    const player = new Player(game, spawnX, spawnBottom - 74);
    game.entities.push(player);
    const box = () => new BoundingBox(player.x, player.y, player.width, player.height);
    const inside = () => map.checkCollisions({BB: box(), x: player.x, y: player.y, width: player.width, height: player.height}).collides;
    const step = (keys = {}) => {
        game.keys = keys;
        player.update();
        assert.ok(Number.isFinite(player.x) && Number.isFinite(player.y), 'position went non-finite');
        assert.ok(!inside(), `player is inside the level at (${player.x.toFixed(2)}, ${player.y.toFixed(2)})`);
    };
    return {game, map, player, step, tiles, box};
}

const settle = (w, frames = 30) => { for (let i = 0; i < frames; i++) w.step(); };
const bottom = p => p.y + p.height;

// Floor at row 7 (top y=175). A 3-tile ramp rising to the right from x=250 to x=325 (top y=100), then a plateau.
//   ramp surface: y = 175 - (X - 250) for X in [250, 325]; plateau top at y = 100
const RAMP_UP = [
    '..............................',
    '..............................',
    '..............................',
    '..............................',
    '............/#################',
    '...........//#################',
    '..........//##################',
    '##############################',
];
const rampSurface = X => Math.min(175, Math.max(100, 175 - (X - 250)));

test('walking up a 45° ramp follows the surface exactly and keeps horizontal speed', () => {
    const w = makeWorld(RAMP_UP, 100, 175);
    settle(w);
    assert.ok(w.player.isGrounded);

    let flatSpeed = 0, rampSpeed = 0;
    for (let f = 0; f < 400 && w.player.x < 450; f++) {
        w.step({d: true, shift: true});
        assert.ok(w.player.isGrounded, `airborne at x=${w.player.x.toFixed(1)}`);
        const right = w.player.x + w.player.width;
        assert.ok(Math.abs(bottom(w.player) - rampSurface(right)) < 1e-6,
            `feet ${bottom(w.player).toFixed(3)} vs surface ${rampSurface(right).toFixed(3)} at x=${w.player.x.toFixed(1)}`);
        if (right < 240) flatSpeed = Math.max(flatSpeed, w.player.velocity.x);
        if (right > 260 && right < 320) rampSpeed = Math.max(rampSpeed, w.player.velocity.x);
    }
    assert.ok(w.player.x > 400, 'never reached the plateau');
    assert.equal(bottom(w.player), 100);
    assert.ok(rampSpeed >= flatSpeed * 0.999, `slope changed speed: flat ${flatSpeed}, ramp ${rampSpeed}`);
});

test('walking back down the ramp never leaves the ground', () => {
    const w = makeWorld(RAMP_UP, 400, 100);
    settle(w);
    for (let f = 0; f < 400 && w.player.x > 60; f++) {
        w.step({a: true, shift: true});
        assert.ok(w.player.isGrounded, `went airborne at x=${w.player.x.toFixed(1)} (bottom ${bottom(w.player).toFixed(2)})`);
    }
    assert.ok(w.player.x <= 60, 'never got back to the floor');
    assert.equal(bottom(w.player), 175);
});

test('a downhill (\\) ramp is followed by its highest point, the left edge', () => {
    // mirror of the ramp above: surface falls to the right
    const rows = RAMP_UP.map(r => [...r].reverse().map(c => c === '/' ? '\\' : c).join(''));
    const w = makeWorld(rows, 700, 175);
    settle(w);
    for (let f = 0; f < 400 && w.player.x > 300; f++) {
        w.step({a: true});
        assert.ok(w.player.isGrounded);
        const left = w.player.x;
        assert.ok(Math.abs(bottom(w.player) - rampSurface(750 - left)) < 1e-6);
    }
    assert.equal(bottom(w.player), 100);
});

test('standing still on a slope does not slide, drift or jitter', () => {
    const w = makeWorld(RAMP_UP, 270, 175 - 20);   // right edge at 290 -> surface y=135
    settle(w);
    const {x, y} = w.player;
    for (let f = 0; f < 120; f++) {
        w.step();
        assert.ok(w.player.isGrounded);
        assert.equal(w.player.x, x);
        assert.ok(Math.abs(w.player.y - y) < 1e-9, 'jittered');
    }
});

test('jumping off a slope works and lands back on it', () => {
    const w = makeWorld(RAMP_UP, 270, 175 - 20);
    settle(w);
    const startY = w.player.y;
    w.step({' ': true});
    assert.ok(w.player.velocity.y < 0 && !w.player.isGrounded, 'jump did not start');
    let frames = 0, apex = startY;
    for (let f = 0; f < 200 && (frames < 5 || !w.player.isGrounded); f++) {
        w.step({' ': f < 30});
        frames++;
        apex = Math.min(apex, w.player.y);
    }
    assert.ok(w.player.isGrounded, 'never landed');
    assert.ok(startY - apex > 60, 'jump barely left the ground');
});

test('running off the top of a ramp onto a full-block plateau steps up instead of stopping', () => {
    const w = makeWorld(RAMP_UP, 200, 175);
    settle(w);
    for (let f = 0; f < 300; f++) w.step({d: true, shift: true});
    assert.ok(w.player.x > 450);
    assert.equal(bottom(w.player), 100);
});

const blank = n => Array.from({length: n}, () => '..............');

test('a quarter-pipe stops the player at its 45° point: walkable below, wall above, never clung to', () => {
    // Bowl tile 'u' on the floor (row 9, top y=225): flat at its right end, vertical at its top-left.
    // Its rim reaches 45° at x = 7.32px into the tile, so a runner from the right climbs until the box's
    // left edge is there and is then blocked.
    const w = makeWorld([...blank(8), '....u.........', '##############'], 250, 225);
    settle(w);
    assert.equal(bottom(w.player), 225);
    let clung = false;
    for (let f = 0; f < 200; f++) {
        w.step({a: true, shift: true});
        clung = clung || w.player.wallSticking;
    }
    assert.equal(clung, false, 'clung to a slope');
    assert.ok(Math.abs(w.player.x - (100 + 7.32)) < 0.5, `stopped at x=${w.player.x.toFixed(2)}, expected ~107.32`);
    assert.equal(w.player.velocity.x, 0);
    assert.ok(w.player.isGrounded);
    assert.ok(Math.abs(bottom(w.player) - (200 + 17.68)) < 0.3, `feet at ${bottom(w.player).toFixed(2)}`);
});

test('walking off a hill shoulder past 45° drops the player to the floor, not onto a wall', () => {
    // A plateau (row 8, top y=200) runs into a convex tile 'h': walkable near its crest, steeper than 45°
    // toward its right end, which faces open air. Below is a floor at y=250.
    const rows = [...blank(8), '#####h........', '######........', '##############', '##############'];
    const w = makeWorld(rows, 105, 200);
    settle(w);
    assert.ok(w.player.isGrounded);
    let onHill = false;
    for (let f = 0; f < 300; f++) {
        w.step({d: true});
        assert.ok(!w.player.wallSticking);
        if (w.player.onShape) onHill = true;
    }
    assert.ok(onHill, 'never walked onto the hill, so this proved nothing');
    assert.ok(w.player.x > 150, 'stuck on the hill');
    assert.equal(bottom(w.player), 250, 'did not end up on the floor');
});

test('jumping into a ceiling slope stops the rise and never tunnels through it', () => {
    // B = solid top-right triangle: underside runs from y=75 (left) to y=100 (right) in each tile of row 3.
    // A 74px player standing on the floor (top y=175) clears it, and a jump hits it.
    const rows = ['..............', '..............', '..............', '..BBBBBBBB....', '..............', '..............', '..............', '##############'];
    const w = makeWorld(rows, 60, 175);
    settle(w);
    let minTop = Infinity;
    for (let f = 0; f < 200; f++) {
        w.step({' ': true, d: f > 20});
        minTop = Math.min(minTop, w.player.y);
    }
    assert.ok(minTop >= 75 - 1e-6, `rose into the ceiling: top reached ${minTop.toFixed(2)}`);
    assert.ok(minTop <= 100 + 1e-6, 'never reached the ceiling, so this proved nothing');
});

test('an airborne player pressed against a steep face is blocked at it and never wall-sticks', () => {
    // A lone hill tile 'h' in open air (row 8, col 5). Its steep right end spans y 207.3-225; at y=222 the
    // arc is at x=149.8. Gravity is off so the player stays in that band while pushing left.
    const rows = [...blank(8), '.....h........', '..............', '##############', '##############'];
    const w = makeWorld(rows, 200, 275);
    settle(w, 2);
    w.player.gravity = 0;
    w.player.x = 152;
    w.player.y = 222 - 74;
    w.player.isGrounded = false;
    w.player.groundedOn = null;
    w.player.velocity.x = -200;
    w.player.velocity.y = 0;
    for (let f = 0; f < 40; f++) {
        w.step({a: true});
        assert.equal(w.player.wallSticking, false, `wall-stick at frame ${f}`);
    }
    assert.ok(Math.abs(w.player.x - 149.8) < 0.3, `stopped at x=${w.player.x.toFixed(2)}, expected ~149.8`);
    assert.equal(w.player.velocity.x, 0);
});

test('fuzz: random inputs on a course of slopes, curves, ceilings and ledges never put the player inside the level', () => {
    const course = [
        '............................................',
        '............................................',
        '............................................',
        '...........................A#...............',
        '............../#############................',
        '............//###############...............',
        '..........//##################\\.............',
        '........////####################\\............',
        '....hhh.../.#############.......#\\...........',
        '####..uu###.####################.##..........',
        '############################################',
    ].map(r => r.padEnd(44, '.'));
    let totalOnShape = 0;
    for (let seed = 1; seed <= 12; seed++) {
        let s = seed * 7919;
        const rand = () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32;
        const w = makeWorld(course, 60, 9 * SIZE);
        let keys = {};
        let onShapeFrames = 0;
        for (let f = 0; f < 2500; f++) {
            if (f % 12 === 0) {
                keys = {a: rand() < 0.35, d: rand() < 0.5, shift: rand() < 0.5, s: rand() < 0.15, ' ': rand() < 0.4};
            }
            w.step(keys);
            assert.ok(w.player.x >= 0 && w.player.y >= 0, `seed ${seed} frame ${f} left the map`);
            if (w.player.onShape) onShapeFrames++;
        }
        totalOnShape += onShapeFrames;
    }
    assert.ok(totalOnShape > 300, `fuzz barely touched slopes (${totalOnShape} frames)`);
});

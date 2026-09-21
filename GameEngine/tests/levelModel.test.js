// Run with: node --test GameEngine/tests/
// LevelModel is the editor's pure logic. Most of these run against all 17 real level files, so the schema,
// entity sizes and file format can't drift from what the game actually loads.
const test = require('node:test');
const assert = require('node:assert/strict');
const LevelModel = require('../levelModel.js');
const TileShapes = require('../tileShapes.js');
const {loadBrowserScripts, loadLevel} = require('./helpers/browserScripts.js');

const M = LevelModel;
const LEVELS = Array.from({length: 17}, (_, n) => n);
const plain = v => JSON.parse(JSON.stringify(v));   // strip the vm realm's prototypes before deepEqual

test('every real level validates with no errors and no warnings', () => {
    // Level 14 once had two BigBlocks with reversed corners (y2 < y): drawn, but never solid. They were fixed by hand,
    // and a warning here (or a spawn inside a block, or anything outside the map) means a level has gone wrong again.
    for (const n of LEVELS) {
        const {errors, warnings} = M.validate(loadLevel(n));
        assert.deepEqual(errors, [], `level ${n} errors`);
        assert.deepEqual(warnings, [], `level ${n} warnings`);
    }
});

test('no real level spawns the player inside a tile or block (they stand on top of it instead)', () => {
    for (const n of LEVELS) {
        const spawn = M.validate(loadLevel(n)).warnings.filter(w => w.path === 'player');
        assert.deepEqual(spawn, [], `level ${n}: ${spawn.map(w => w.message).join()}`);
    }
});

test('a spawn inside a block, a big block or a slope is flagged; standing on top, or in a reversed block, is not', () => {
    const warnsSpawn = level => M.validate(level).warnings.some(w => w.path === 'player' && /inside a solid/.test(w.message));
    const level = M.createBlank(20, 12);
    assert.equal(warnsSpawn(level), false, 'standing on the floor is fine');

    const inTile = M.createBlank(20, 12);
    M.fillRect(inTile, 1, 5, 4, 7, 1);
    inTile.player = {x: 60, y: 130};
    assert.equal(warnsSpawn(inTile), true, 'overlapping full blocks');
    inTile.player = {x: 60, y: 125 - 74};
    assert.equal(warnsSpawn(inTile), false, 'resting exactly on top of them is not an overlap');

    const inBig = M.createBlank(20, 12);
    inBig.entities.push({type: 'BigBlock', x: 100, y: 100, x2: 200, y2: 150});
    inBig.player = {x: 120, y: 90};
    assert.equal(warnsSpawn(inBig), true, 'overlapping a big block');
    inBig.entities[0] = {type: 'BigBlock', x: 100, y: 150, x2: 200, y2: 100};   // reversed: never solid in the game
    assert.equal(warnsSpawn(inBig), false, 'a reversed big block has no solid box');

    const inSlope = M.createBlank(20, 12);
    inSlope.map.tiles[9][4] = TileShapes.ID.SLOPE_BR;   // row 9 = y 225-250, floor row 11 is at y 275
    inSlope.player = {x: 100, y: 275 - 74 - 30};        // hovering in the slope's tile column, box reaching into it
    assert.equal(warnsSpawn(inSlope), true, 'overlapping a slope tile');
});

test('serialize then parse gives back exactly the same level, for every real level', () => {
    for (const n of LEVELS) {
        const level = loadLevel(n);
        const text = M.serialize(level);
        assert.deepEqual(JSON.parse(text), level, `level ${n} changed in a round trip`);
        assert.equal(M.serialize(JSON.parse(text)), text, `level ${n} is not stable under a second round trip`);
    }
});

test('the file format puts one tile row and one entity on each line', () => {
    const level = M.createBlank(6, 4);
    level.entities.push(M.makeEntity('Spike', 30, 40), M.makeEntity('Lever', 60, 20));
    const text = M.serialize(level);
    assert.ok(text.endsWith('}\n'), 'ends with a newline');
    const lines = text.split('\n');
    assert.equal(lines.filter(l => /^ {6}\[/.test(l)).length, 4, 'one line per tile row');
    assert.equal(lines.filter(l => /^ {4}\{ "type"/.test(l)).length, 2, 'one line per entity');
    assert.ok(lines.includes('      [1,1,1,1,1,1],'));
    assert.deepEqual(JSON.parse(text), level);
});

test('fields the editor does not know about survive a round trip', () => {
    const level = M.createBlank(6, 4);
    level.entities.push({type: 'Platform', x: 0, y: 0, speedMin: 87, speedMax: 166, moving: true, direction: 'DOWN', reverseTime: 3, size: 'SHORT'},
        {type: 'FutureThing', x: 5, y: 5, colour: 'rgba(1, 2, 3, 0.5)'});
    level.something = {else: [1, 2]};
    assert.deepEqual(JSON.parse(M.serialize(level)), level);
});

// The sizes in LevelModel are copied from the entity classes. Build the real classes and compare, for every
// entity in every level, so a change to a sprite size or hitbox fails here instead of misplacing things in the editor.
test('entity boxes match the real entity classes on every entity in every level', () => {
    const get = loadBrowserScripts(['boundingBox.js', 'tileShapes.js', 'drawMap.js', 'exitDoor.js', 'platform.js', 'lever.js',
        'bigblock.js', 'enemies.js', 'player.js', 'levelLoader.js'], {
        window: {},
        console: {log() {}, warn: console.warn, error: console.error},   // GlowingLaser logs on every construction
        ASSET_MANAGER: {getAsset: () => ({width: 46, height: 106})},
        Animator: class { drawFrame() {} },
    });
    const loader = get('LevelLoader');
    const game = {keys: {}, clockTick: 1 / 60, entities: [], options: {debugging: false},
        ctx: {canvas: {addEventListener() {}, removeEventListener() {}}}};
    // A reversed big block gets a negative-size box in the real class (level 14 used to have two); compare the rectangle that is drawn
    const norm = b => ({x: Math.min(b.x, b.x + b.w), y: Math.min(b.y, b.y + b.h), w: Math.abs(b.w), h: Math.abs(b.h)});
    const boxOf = e => norm(e.BB ? {x: e.BB.x, y: e.BB.y, w: e.BB.width, h: e.BB.height} : {x: e.x, y: e.y, w: e.width, h: e.height});

    let checked = 0;
    const seenTypes = new Set();
    const compare = (label, expected, actual) => {
        for (const k of ['x', 'y', 'w', 'h']) assert.ok(Math.abs(expected[k] - actual[k]) < 1e-9, `${label}: ${k} model ${expected[k]} vs class ${actual[k]}`);
        checked++;
    };
    for (const n of LEVELS) {
        const level = loadLevel(n);
        const instance = new loader();
        instance.store(n, level);
        const parts = instance.getLevelEntities(n, game, 25);
        const hazards = parts.hazards();
        level.entities.forEach((desc, i) => {
            seenTypes.add(desc.type);
            compare(`level ${n} ${desc.type}#${i}`, M.boundsFor(desc.type, desc), boxOf(hazards[i]));
        });
        compare(`level ${n} exit`, M.boundsFor('ExitDoor', level.exitDoor), boxOf(parts.exitDoor()));
        compare(`level ${n} player`, M.boundsFor('Player', level.player), boxOf(parts.player()));
    }
    assert.ok(checked > 200);
    for (const type of M.ENTITY_TYPE_NAMES) assert.ok(seenTypes.has(type), `no real level has a ${type}, so its size is unchecked`);
});

test('a new entity of every type validates and loads through the real LevelLoader', () => {
    const get = loadBrowserScripts(['boundingBox.js', 'tileShapes.js', 'drawMap.js', 'exitDoor.js', 'platform.js', 'lever.js',
        'bigblock.js', 'enemies.js', 'player.js', 'levelLoader.js'], {
        window: {},
        console: {log() {}, warn() {}, error: console.error},
        ASSET_MANAGER: {getAsset: () => ({width: 46, height: 106})},
        Animator: class { drawFrame() {} },
    });
    const level = M.createBlank();
    for (const type of M.ENTITY_TYPE_NAMES) level.entities.push(M.makeEntity(type, 100, 100));
    const {errors} = M.validate(level);
    assert.deepEqual(errors, []);

    const loader = new (get('LevelLoader'))();
    loader.store(0, plain(level));
    const built = loader.getLevelEntities(0, {keys: {}, options: {}, clockTick: 0.016}, 25).hazards();
    assert.equal(built.length, M.ENTITY_TYPE_NAMES.length, 'the loader skipped one of the new entities');
    built.forEach((e, i) => assert.ok(e.constructor.name, `entity ${i} not built`));
});

// ---- tiles ----

test('setTile, fillRect (solid and hollow) and floodFill change what they say and stay in bounds', () => {
    const level = M.createBlank(8, 6);
    assert.equal(M.setTile(level, 3, 3, 1), true);
    assert.equal(M.setTile(level, 3, 3, 1), false, 'no change is reported as no change');
    assert.equal(M.setTile(level, 99, 3, 1), false);
    assert.equal(M.tileAt(level, 99, 3), null);

    assert.equal(M.fillRect(level, 5, 4, 2, 2, 1), 12 - 1, 'corners in any order; (3,3) was already solid');
    const hollow = M.createBlank(8, 6);
    M.fillRect(hollow, 2, 1, 5, 3, 10, true);
    assert.equal(hollow.map.tiles[2][3], 0, 'inside stays empty');
    assert.equal(hollow.map.tiles[1][2], 10);
    assert.equal(hollow.map.tiles[3][5], 10);
    const notSolid = hollow.map.tiles.flat().filter(v => v !== 1).length;
    assert.equal(M.fillRect(hollow, -5, -5, 100, 100, 1), notSolid, 'a rectangle bigger than the grid is clamped to it');
    assert.ok(hollow.map.tiles.flat().every(v => v === 1));
});

test('floodFill fills only the connected region and never leaks through walls', () => {
    const level = M.createBlank(8, 6);
    M.fillRect(level, 4, 1, 4, 4, 1);   // a wall splitting the room
    const left = M.floodFill(level, 1, 1, 10);
    assert.equal(left, 3 * 4, 'left room is 3 wide and 4 tall');
    assert.equal(level.map.tiles[1][5], 0, 'right room untouched');
    assert.equal(M.floodFill(level, 1, 1, 10), 0, 'same id is a no-op');
    assert.equal(M.floodFill(level, -1, 0, 1), 0);
});

test('createBlank makes a valid, walled level with the player standing on the floor', () => {
    const level = M.createBlank();
    assert.equal(M.rows(level), 37);
    assert.equal(M.cols(level), 76);
    assert.deepEqual(M.validate(level), {errors: [], warnings: []});
    const t = level.map.tiles;
    assert.ok(t[0].every(v => v === 1) && t[36].every(v => v === 1));
    assert.ok(t.every(row => row[0] === 1 && row[75] === 1));
    assert.equal(level.player.y + M.PLAYER_SIZE.h, 36 * 25, 'feet on the floor');
    assert.ok(Math.abs(level.exitDoor.y + M.EXIT_SIZE.h - 36 * 25) <= 0.5, 'exit bottom within half a pixel of the floor');
});

test('previewResize counts what would be lost and resize keeps the overlap', () => {
    const level = M.createBlank(10, 8);
    level.entities.push(M.makeEntity('Spike', 240, 10));   // column 9
    const p = M.previewResize(level, 6, 8);
    assert.ok(p.lostTiles > 0);
    assert.ok(p.lostEntities >= 2, 'the spike and the exit door end up outside');
    assert.deepEqual(M.previewResize(level, 10, 8), {lostTiles: 0, lostEntities: 0});

    const before = plain(level.map.tiles);
    M.resize(level, 12, 9);
    assert.equal(M.cols(level), 12);
    assert.equal(M.rows(level), 9);
    assert.deepEqual(level.map.tiles.slice(0, 8).map(r => r.slice(0, 10)), before);
    assert.ok(level.map.tiles[8].every(v => v === 0) && level.map.tiles.every(r => r[11] === 0));
    M.resize(level, 4, 3);
    assert.deepEqual(level.map.tiles, before.slice(0, 3).map(r => r.slice(0, 4)));
});

test('every known tile id is in the palette exactly once', () => {
    const ids = M.paletteGroups().flatMap(g => g.ids).sort((a, b) => a - b);
    const known = [0, 1, ...TileShapes.all().map(s => s.id)].sort((a, b) => a - b);
    assert.deepEqual(ids, known);
    for (const id of ids) assert.ok(!M.tileName(id).startsWith('Unknown'), `no name for ${id}`);
});

// ---- entities ----

test('pick chooses the smallest thing under the cursor, the player over an entity, and misses empty space', () => {
    const level = M.createBlank();
    level.entities.push({type: 'BigBlock', x: 100, y: 100, x2: 400, y2: 300},
        M.makeEntity('Spike', 150, 150),
        M.makeEntity('GlowingLaser', 120, 120));   // a thin beam across the block
    assert.deepEqual(M.pick(level, 160, 160), {kind: 'entity', index: 1}, 'spike beats the block it sits on');
    assert.deepEqual(M.pick(level, 300, 250), {kind: 'entity', index: 0}, 'plain block area');
    assert.deepEqual(M.pick(level, 200, 121), {kind: 'entity', index: 2}, 'the beam is grabbable despite being 8px thin');
    assert.deepEqual(M.pick(level, level.player.x + 5, level.player.y + 5), {kind: 'player'});
    assert.deepEqual(M.pick(level, level.exitDoor.x + 5, level.exitDoor.y + 5), {kind: 'exit'});
    assert.equal(M.pick(level, 700, 100), null);
});

test('moveTo carries both corners of a big block and only x/y of everything else', () => {
    const level = M.createBlank();
    level.entities.push({type: 'BigBlock', x: 100, y: 100, x2: 200, y2: 150}, M.makeEntity('Lever', 10, 10));
    M.moveTo(level, {kind: 'entity', index: 0}, 300, 50);
    assert.deepEqual(level.entities[0], {type: 'BigBlock', x: 300, y: 50, x2: 400, y2: 100});
    M.moveTo(level, {kind: 'entity', index: 1}, 25, 30);
    assert.equal(level.entities[1].x, 25);
    assert.equal(level.entities[1].y, 30);
    M.moveTo(level, {kind: 'player'}, 50, 75);
    assert.deepEqual(level.player, {x: 50, y: 75});
});

test('duplicate and remove entities', () => {
    const level = M.createBlank();
    level.entities.push(M.makeEntity('Spike', 100, 100, {speed: 50}));
    const i = M.duplicateEntity(level, 0);
    assert.equal(i, 1);
    assert.deepEqual(level.entities[1], {...level.entities[0], x: 125, y: 125});
    level.entities[1].speed = 1;
    assert.equal(level.entities[0].speed, 50, 'a copy, not a reference');
    assert.equal(M.removeEntity(level, 0).speed, 50);
    assert.equal(level.entities.length, 1);
});

test('snap rounds to the grid step', () => {
    assert.equal(M.snap(37, 25), 25);
    assert.equal(M.snap(38, 25), 50);
    assert.equal(M.snap(12.4, 5), 10);
    assert.equal(M.snap(12.6, 1), 13);
    assert.equal(M.snap(12.6, 0), 13);
});

// ---- history ----

test('history undoes and redoes in order, drops redo on a new edit, and caps its size', () => {
    const level = M.createBlank(6, 4);
    const h = new M.History(3);
    assert.equal(h.undo(level), null);
    const states = [];
    let cur = level;
    for (let i = 0; i < 4; i++) {
        h.record(cur);
        cur = M.clone(cur);
        M.setTile(cur, 1 + (i % 4), 1, 10 + i);
        states.push(M.clone(cur));
    }
    assert.equal(h.past.length, 3, 'capped at 3');
    cur = h.undo(cur);
    assert.deepEqual(cur, states[2]);
    cur = h.undo(cur);
    assert.deepEqual(cur, states[1]);
    assert.ok(h.canRedo);
    cur = h.redo(cur);
    assert.deepEqual(cur, states[2]);
    h.record(cur);
    assert.equal(h.canRedo, false, 'a new edit clears redo');
});

// ---- validation ----

const messages = r => r.errors.map(e => `${e.path}: ${e.message}`).join(' | ');

test('validate reports what would stop a level from loading or being finished', () => {
    const ok = () => M.createBlank(10, 8);
    const bad = (mutate, expected) => {
        const level = ok();
        mutate(level);
        const r = M.validate(level);
        assert.ok(r.errors.some(e => expected.test(`${e.path}: ${e.message}`)), `expected ${expected}, got: ${messages(r) || 'no errors'}`);
    };
    bad(l => { l.map.tiles[2].pop(); }, /map\.tiles\[2\].*expected 10/);
    bad(l => { l.map.tiles[1][1] = 3; }, /unknown tile ids: 3/);
    bad(l => { l.map.tiles[1][1] = 1.5; }, /unknown tile ids/);
    bad(l => { delete l.player; }, /player: missing/);
    bad(l => { l.player.x = 'a'; }, /player.*x must be a number/);
    bad(l => { delete l.exitDoor; }, /exitDoor: missing/);
    bad(l => { l.exitDoor.levers = 2; }, /exitDoor\.levers.*only has 0/);
    bad(l => { l.exitDoor.levers = 1.5; }, /levers must be a whole number/);
    bad(l => { l.entities = 'x'; }, /entities: must be an array/);
    bad(l => { l.entities.push(M.makeEntity('Spike', 1, 1, {moving: 'yes'})); }, /Spike.*moving must be true or false/);
    bad(l => { l.entities.push(M.makeEntity('ProjectileLauncher', 1, 1, {shotdirec: 'SIDEWAYS'})); }, /shotdirec must be one of/);
    bad(l => { const e = M.makeEntity('Lever', 1, 1); delete e.x; l.entities.push(e); }, /Lever.*missing x/);
    bad(l => { l.entities.push(M.makeEntity('Spike', 1, 1, {speed: -3})); }, /speed must be at least 0/);
    bad(l => { l.entities.push(M.makeEntity('Spike', 1, 1, {tracking: null})); }, /tracking is null/);

    assert.deepEqual(M.validate(null).errors.map(e => e.message), ['level must be a JSON object']);
    // levers can satisfy the exit
    const winnable = ok();
    winnable.exitDoor.levers = 1;
    winnable.entities.push(M.makeEntity('Lever', 50, 50));
    assert.deepEqual(M.validate(winnable).errors, []);
});

test('validate warns about probable mistakes without blocking', () => {
    const level = M.createBlank(10, 8);
    level.player.x = -500;
    level.entities.push(M.makeEntity('Spike', 5000, 10), {type: 'Ghost', x: 1, y: 1});
    const r = M.validate(level);
    assert.deepEqual(r.errors, []);
    const text = r.warnings.map(w => `${w.path}: ${w.message}`).join(' | ');
    assert.match(text, /player: starts outside the map/);
    assert.match(text, /entities\[0\] \(Spike\): is outside the map/);
    assert.match(text, /entities\[1\]: unknown type "Ghost"/);

    // a big block with its corners the wrong way round is level 14's bug: drawn, never solid
    const flipped = M.createBlank(10, 8);
    flipped.entities.push({type: 'BigBlock', x: 50, y: 149, x2: 20, y2: 25});
    const w = M.validate(flipped);
    assert.deepEqual(w.errors, []);
    assert.match(w.warnings[0].message, /never solid/);
});

test('parse validates and only returns a level that is safe to load', () => {
    assert.equal(M.parse('not json').level, null);
    assert.match(M.parse('not json').errors[0].message, /not valid JSON/);
    const good = M.parse(M.serialize(M.createBlank(10, 8)));
    assert.deepEqual(good.errors, []);
    assert.ok(good.level);
    const broken = M.createBlank(10, 8);
    broken.exitDoor.levers = 5;
    const r = M.parse(JSON.stringify(broken));
    assert.equal(r.level, null);
    assert.equal(r.errors.length, 1);
});

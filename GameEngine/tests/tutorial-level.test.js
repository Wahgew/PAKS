// The tutorial level (levels/tutorial.json), played by the real Player. The route below is what a player does: sprint,
// hop the step, jump the spikes, climb the tall box, slide under the laser, wall-jump the shaft, touch the lever, reach
// the exit. It reads the live level file, so if you move things in the level editor and this fails, the level may no
// longer be finishable: playtest it, then adjust the numbers in `route`.
const test = require('node:test');
const assert = require('node:assert/strict');
const {loadLevelFile} = require('./helpers/browserScripts.js');
const {play, get} = require('./helpers/headless.js');
const M = require('../levelModel.js');

const Hint = get('Hint');
const TILE = 25;
const level = () => JSON.parse(JSON.stringify(loadLevelFile('tutorial')));   // a fresh copy: tests change it
const feet = w => Math.round(w.player.y + w.player.height);
const settled = w => w.player.isGrounded && w.player.velocity.y === 0;

// ---- the file ----

test('the tutorial validates cleanly and fits the game\'s 76x41-tile view whole', () => {
    const l = level();
    assert.deepEqual(M.validate(l), {errors: [], warnings: []});
    assert.ok(l.map.tiles[0].length <= 76 && l.map.tiles.length <= 41, 'a level bigger than the view scrolls; the tutorial should not');
});

test('the exit needs exactly the levers the level has, so it can open and only after touching the lever', () => {
    const l = level();
    assert.equal(l.exitDoor.levers, 1);
    assert.equal(M.countLevers(l), 1);
});

test('every lesson has a sign that names its keys', () => {
    const signs = level().entities.filter(e => e.type === 'Hint').map(e => e.text);
    const said = re => signs.some(t => re.test(t));
    assert.ok(said(/\[A\].*\[D\]/), 'walk');
    assert.ok(said(/\[Shift\]/), 'sprint');
    assert.ok(said(/\[W\].*\[Space\]/) && said(/higher/i), 'jump, and hold for height');
    assert.ok(said(/spike/i), 'hazards');
    assert.ok(said(/\[S\]/) && said(/laser/i), 'slide');
    assert.ok(said(/wall jump/i) && said(/\[W\]/), 'wall jump');
    assert.ok(said(/lever/i), 'levers');
    assert.ok(said(/exit/i), 'the exit door');
});

test('every sign fits its text, stays inside the level and off the tiles, and none overlap', () => {
    const l = level();
    const signs = l.entities.filter(e => e.type === 'Hint');
    const mapW = l.map.tiles[0].length * TILE, mapH = l.map.tiles.length * TILE;
    const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    signs.forEach((s, i) => {
        const label = `"${s.text}"`;
        const inner = s.w - 2 * Hint.PADDING;
        const lines = Hint.layout(s.text, str => str.length * 13.2, inner);   // bold 22px monospace: 13.2px a glyph
        assert.ok(lines.length * Hint.LINE_HEIGHT <= s.h - 8, `${label} has ${lines.length} lines, too tall for a ${s.h}px box`);
        assert.ok(lines.every(line => line.at(-1).x + line.at(-1).w <= inner + 0.001), `${label} has a line wider than its box`);
        assert.ok(s.x >= 0 && s.y >= 0 && s.x + s.w <= mapW && s.y + s.h <= mapH, `${label} is outside the level`);
        for (let c = Math.floor(s.x / TILE); c <= Math.floor((s.x + s.w - 1) / TILE); c++) {
            for (let r = Math.floor(s.y / TILE); r <= Math.floor((s.y + s.h - 1) / TILE); r++) {
                assert.equal(l.map.tiles[r][c], 0, `${label} covers a solid tile at column ${c}, row ${r}`);
            }
        }
        signs.slice(i + 1).forEach(o => assert.ok(!overlap(s, o), `${label} overlaps "${o.text}"`));
    });
});

// ---- playing it ----

/**
 * The route, as a player would take it. Returns the world and a note of where it was at each stop.
 * `lever: false` plays the level with its lever taken out.
 */
function route(l, {lever = true} = {}) {
    const w = play(l);
    const at = {};
    const note = name => { at[name] = {x: Math.round(w.player.x), feet: feet(w), dead: w.dead, levers: w.player.levers}; };

    w.hold('', 10);
    // the step (2 tiles): walk up and tap jump
    w.hold('d', 400, () => w.player.x >= 340); w.hold('d w', 6); w.hold('d', 150, () => settled(w)); note('step');
    // the spikes: jump off the step to clear all three
    w.hold('d', 100, () => w.player.x >= 525); w.hold('d w', 10); w.hold('d', 150, () => settled(w)); note('past the spikes');
    // the tall box (4 tiles): a held jump
    w.hold('d', 100, () => w.player.x >= 760); w.hold('d w', 14); w.hold('d', 150, () => settled(w)); note('tall box');
    // the laser: run up, then slide under it
    w.hold('d shift', 600, () => w.player.x >= 1150); w.hold('s', 200, () => w.player.x >= 1330 || w.dead); note('under the laser');
    // the shaft: wall jump up it, then hop out over the top of its left wall
    w.hold('d shift', 300, () => w.player.x >= 1790 || w.dead); note('shaft foot');
    wallClimb(w, 500); note('shaft top');
    w.hold('a w', 30); w.hold('a', 120, () => w.player.isGrounded); note('top floor');
    // the lever box: hop up (this collects the lever), or over it if the lever is gone
    w.hold('a shift', 400, () => w.player.x <= 905 || w.dead);
    if (lever) { w.hold('a shift', 200, () => w.player.x <= 860); w.hold('a shift w', 4); }
    else { w.hold('a shift w', 40); }
    w.hold('a', 100, () => settled(w)); note('lever box');
    // the exit
    w.hold('a shift', 900, () => w.won); note('exit');
    return {w, at};
}

/** What a player does in the shaft: jump at a wall, and press jump again while sliding down it. */
function wallClimb(w, untilFeetAbove, maxFrames = 1500) {
    let pressed = false, wall = 'right';
    for (let f = 0; f < maxFrames; f++) {
        const p = w.player;
        if (p.y + p.height < untilFeetAbove || w.dead) return f;
        let keys;
        if (p.isGrounded) {
            keys = 'd w';
        } else if (p.wallSticking) {
            wall = p.wallStickDirection;
            keys = (wall === 'left' ? 'a' : 'd') + (pressed ? '' : ' w');   // a fresh press: holding the key does nothing
        } else {
            keys = (wall === 'left' ? 'd' : 'a') + (p.velocity.y < 0 ? ' w' : '');   // hold jump while rising, head for the other wall
        }
        pressed = keys.includes('w');
        w.step(keys);
    }
    return -1;
}

test('the whole tutorial can be finished: every stop on the route is reached alive, and the exit opens the clear screen', () => {
    const {w, at} = route(level());
    assert.equal(at.step.feet, 875, 'standing on the step');
    assert.ok(at.step.x >= 528 && at.step.x <= 555, `on the step, at ${at.step.x}`);
    assert.ok(at['past the spikes'].x >= 790 && at['past the spikes'].feet === 925 && !at['past the spikes'].dead, 'cleared the spikes');
    assert.equal(at['tall box'].feet, 825, 'on top of the tall box');
    assert.ok(at['under the laser'].x > 1310 && !at['under the laser'].dead, 'slid under the laser');
    assert.ok(at['shaft top'].feet < 500, `climbed the shaft (${at['shaft top'].feet})`);
    assert.equal(at['top floor'].feet, 525, 'on the top floor');
    assert.equal(at['lever box'].levers, 1, 'touched the lever');
    assert.equal(w.won, true, 'reached the exit');
    assert.equal(w.dead, false);
    assert.ok(w.frames < 1500, `took ${w.frames} frames`);
    assert.ok(w.game.entities.find(e => e.constructor.name === 'exitDoor').isOpen, 'the exit opened');
});

test('the run never touches best times, progress or the current floor (the harness throws if it does)', () => {
    const {w} = route(level());
    assert.equal(w.config.currentLevel, 1, 'assemble leaves currentLevel alone');
});

test('the exit stays shut, and the level cannot be won, without the lever', () => {
    const l = level();
    l.entities = l.entities.filter(e => e.type !== 'Lever');
    const {w, at} = route(l, {lever: false});
    assert.equal(at.exit.levers, 0);
    assert.ok(at.exit.x < 200, `ran all the way to the exit door (${at.exit.x})`);
    assert.equal(w.won, false);
    assert.equal(w.game.entities.find(e => e.constructor.name === 'exitDoor').isOpen, false);
});

// ---- every lesson is required ----

test('lesson: spikes kill, so the floor route through them is really a jump', () => {
    const w = play(level());
    w.hold('', 10);
    // walk (and hop the step) but never jump the spikes
    w.hold('d', 400, () => w.player.x >= 340); w.hold('d w', 6); w.hold('d', 600, () => w.dead);
    assert.equal(w.dead, true, 'walking on into the spikes should kill');
    assert.ok(w.player.x < 800);
});

test('lesson: the laser kills a player who runs through standing up, and a jump cannot clear it under the low ceiling', () => {
    const start = () => {
        const w = play(level());
        w.player.x = 905; w.player.y = 925 - 74;     // stand just past the tall box
        return w;
    };
    const running = start();
    running.hold('d shift', 300, () => running.dead);
    assert.equal(running.dead, true, 'running straight through');
    assert.ok(running.player.x < 1330, `died in the beam (${Math.round(running.player.x)})`);

    const jumping = start();
    jumping.hold('d shift', 200, () => jumping.player.x >= 1200);
    let highest = Infinity;
    for (let f = 0; f < 240 && !jumping.dead; f++) {
        jumping.step('d shift w');
        highest = Math.min(highest, jumping.player.y);
    }
    assert.equal(jumping.dead, true, 'jumping over does not get past the beam');
    assert.ok(highest >= 925 - 100 - 74 - 1, `the ceiling stops the jump (head reached ${Math.round(highest)})`);
});

test('lesson: pressing jump alone cannot leave the bottom tier; only a fresh press on the wall gets you up the shaft', () => {
    const inShaft = () => {
        const w = play(level());
        w.player.x = 1700; w.player.y = 925 - 74;    // inside the shaft
        return w;
    };
    // jump-key held down while switching between the walls: no fresh press ever, so no wall jump
    const plain = inShaft();
    let top = Infinity;
    for (let f = 0; f < 900; f++) {
        plain.step((Math.floor(f / 40) % 2 ? 'a' : 'd') + ' w');
        top = Math.min(top, plain.player.y + plain.player.height);
    }
    assert.ok(top > 925 - 200, `held jump reached feet ${Math.round(top)}, more than one jump above the floor`);

    const climbing = inShaft();
    assert.ok(wallClimb(climbing, 500) >= 0, 'wall jumping climbs out of the shaft');
    assert.ok(climbing.player.y + climbing.player.height < 500);
});

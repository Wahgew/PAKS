// Run with: node --test GameEngine/tests/
// The vector entity drawings (entityArt.js) and the entity classes that use them: no images, every drawing inside
// the footprint its sprite had, and the lever and door animations.
const test = require('node:test');
const assert = require('node:assert/strict');
const EntityArt = require('../entityArt.js');
const {loadBrowserScripts} = require('./helpers/browserScripts.js');

// A canvas stand-in that follows translate/rotate/scale and records where everything is drawn, in world pixels
function recorder() {
    let m = [1, 0, 0, 1, 0, 0];
    const stack = [];
    const rec = {points: [], images: 0, fills: [], strokes: []};
    const apply = (x, y) => ({x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5]});
    const mul = n => { m = [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
        m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]]; };
    const pt = (x, y) => rec.points.push(apply(x, y));
    const gradient = () => ({addColorStop() {}});
    const ctx = {
        save() { stack.push(m.slice()); }, restore() { m = stack.pop(); },
        translate(x, y) { mul([1, 0, 0, 1, x, y]); },
        rotate(a) { mul([Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0]); },
        scale(x, y) { mul([x, 0, 0, y, 0, 0]); },
        beginPath() {}, closePath() {}, fill() { rec.fills.push(ctx.fillStyle); }, stroke() { rec.strokes.push(ctx.strokeStyle); },
        moveTo: pt, lineTo: pt,
        quadraticCurveTo(cx, cy, x, y) { pt(cx, cy); pt(x, y); },
        arc(x, y, r) { pt(x - r, y); pt(x + r, y); pt(x, y - r); pt(x, y + r); },
        fillRect(x, y, w, h) { pt(x, y); pt(x + w, y + h); pt(x + w, y); pt(x, y + h); rec.fills.push(ctx.fillStyle); },
        strokeRect(x, y, w, h) { pt(x, y); pt(x + w, y + h); },
        createLinearGradient: gradient, createRadialGradient: gradient,
        // A clip region is not drawn, so it records nothing
        rect() {}, clip() {},
        drawImage() { rec.images++; },
    };
    return {ctx, rec};
}

function bounds(points) {
    return {left: Math.min(...points.map(p => p.x)), right: Math.max(...points.map(p => p.x)),
        top: Math.min(...points.map(p => p.y)), bottom: Math.max(...points.map(p => p.y))};
}

function assertInside(rec, box, pad, label) {
    assert.equal(rec.images, 0, `${label}: drew an image`);
    assert.ok(rec.points.length > 0, `${label}: drew nothing`);
    const b = bounds(rec.points);
    const eps = 1e-6;
    assert.ok(b.left >= box.left - pad - eps && b.right <= box.right + pad + eps && b.top >= box.top - pad - eps && b.bottom <= box.bottom + pad + eps,
        `${label}: drawn over ${JSON.stringify(b)}, outside ${JSON.stringify(box)} +${pad}`);
}

const boxOf = (x, y, w, h) => ({left: x, top: y, right: x + w, bottom: y + h});

test('a spike is drawn inside its 40x40 box at every angle', () => {
    for (let spin = 0; spin < 720; spin += 17) {
        const {ctx, rec} = recorder();
        EntityArt.spike(ctx, {x: 100, y: 200, width: 40, height: 40, spin});
        assertInside(rec, boxOf(100, 200, 40, 40), 1.5, `spin ${spin}`);
    }
});

test('a projectile is drawn in its 30x30 box, its trail behind it', () => {
    for (const direction of ['LEFT', 'RIGHT', 'UP', 'DOWN']) {
        const {ctx, rec} = recorder();
        EntityArt.projectile(ctx, {x: 100, y: 200, width: 30, height: 30, spin: 90, direction});
        assertInside(rec, boxOf(100, 200, 30, 30), 22, direction);
        // The trail is on the side it came from
        const d = {LEFT: [1, 0], RIGHT: [-1, 0], UP: [0, 1], DOWN: [0, -1]}[direction];
        const b = bounds(rec.points);
        const behind = d[0] > 0 ? b.right - 130 : d[0] < 0 ? 100 - b.left : d[1] > 0 ? b.bottom - 230 : 200 - b.top;
        assert.ok(behind > 5, `${direction}: the trail should reach behind the blade (${behind})`);
    }
});

test('a launcher faces each direction inside its box, and only its muzzle flash reaches past it', () => {
    for (const shotdirec of ['LEFT', 'RIGHT', 'UP', 'DOWN']) {
        for (const time of [0, 0.05, 0.2, 1, 2]) {
            const {ctx, rec} = recorder();
            EntityArt.launcher(ctx, {x: 100, y: 200, width: 58, height: 54, shotdirec, time, atkspd: 2});
            // Turned 90°, the 58x54 body is 54x58 about the same centre; it recoils up to 4px just after a shot
            assertInside(rec, boxOf(100, 200, 58, 54), time < 0.1 ? 28 : 6.5, `${shotdirec} at ${time}s`);
        }
    }
    // The muzzle is on the side it shoots from
    for (const [shotdirec, side] of [['LEFT', 'left'], ['RIGHT', 'right'], ['UP', 'top'], ['DOWN', 'bottom']]) {
        const {ctx, rec} = recorder();
        EntityArt.launcher(ctx, {x: 100, y: 200, width: 58, height: 54, shotdirec, time: 0, atkspd: 2});
        const b = bounds(rec.points), box = boxOf(100, 200, 58, 54);
        const past = {left: box.left - b.left, right: b.right - box.right, top: box.top - b.top, bottom: b.bottom - box.bottom};
        assert.ok(Object.keys(past).every(k => k === side || past[k] < 6.5) && past[side] > 10, `${shotdirec}: flash on the ${side} ${JSON.stringify(past)}`);
    }
});

test('a lever is drawn where its sprite was, flipped about its box when it faces left', () => {
    for (const flip of [0, 0.3, 0.5, 1]) {
        for (const isFlipped of [false, true]) {
            const {ctx, rec} = recorder();
            EntityArt.lever(ctx, {x: 100, y: 200, width: 23, height: 53, isFlipped}, flip);
            const w = EntityArt.LEVER_ART.w, h = EntityArt.LEVER_ART.h;
            const art = isFlipped ? boxOf(100 + 23 - w, 200, w, h) : boxOf(100, 200, w, h);
            assertInside(rec, art, 0.5, `flip ${flip}${isFlipped ? ' mirrored' : ''}`);
        }
    }
    const knob = flip => { const {ctx, rec} = recorder(); EntityArt.lever(ctx, {x: 0, y: 0, width: 23, height: 53}, flip); return rec.fills; };
    assert.ok(knob(0).includes(EntityArt.COLORS.knobOff) && !knob(0).includes(EntityArt.COLORS.knobOn), 'red before it is pulled');
    assert.ok(knob(1).includes(EntityArt.COLORS.knobOn) && !knob(1).includes(EntityArt.COLORS.knobOff), 'green once pulled');
});

test('the exit door fills the sprite\'s 69x81.5 and shows whether it is locked', () => {
    for (const [locked, open] of [[true, 0], [false, 0], [false, 0.5], [false, 1]]) {
        const {ctx, rec} = recorder();
        EntityArt.exitDoor(ctx, {x: 100, y: 200, width: 276, height: 326, scale: 0.25}, locked, open);
        assertInside(rec, boxOf(100, 200, 69, 81.5), 0.5, `locked ${locked} open ${open}`);
        assert.ok(rec.strokes.includes(locked ? EntityArt.COLORS.locked : EntityArt.COLORS.unlocked), 'indicator colour');
    }
});

// The real entity classes, with an asset manager that has no images at all
// A map that is wall everywhere, and an empty BigBlock: enough for Projectile.update's collision checks
const STUBS = 'class drawMap { checkCollisions() { return {collides: true}; } } class BigBlock {}';
const get = loadBrowserScripts(['boundingBox.js', 'entityArt.js', 'enemies.js', 'lever.js', 'exitDoor.js', 'platform.js'], {
    ASSET_MANAGER: {getAsset(path) { throw new Error(`asked for ${path}`); }},
    console: {log() {}, warn() {}, error: console.error},
});
get(STUBS);   // declared in the scripts' own scope, where Projectile.update looks them up
const fakeGame = () => ({options: {debugging: false}, clockTick: 1 / 60, entities: [], addEntity() {}});

test('spikes, launchers, projectiles, levers and doors need no images and draw without one', () => {
    const game = fakeGame();
    const entities = [
        new (get('Spike'))({gameEngine: game, x: 10, y: 10, speed: 0, moving: false}),
        new (get('ProjectileLauncher'))({gameEngine: game, x: 10, y: 10, speed: 0, moving: false, atkspd: 2, projspd: 100, shotdirec: 'UP'}),
        new (get('Projectile'))(game, 10, 10, 100, 'LEFT'),
        new (get('Lever'))({gameEngine: game, x: 10, y: 10, speed: 0, moving: false, direction: 'LEFT'}),
        new (get('exitDoor'))(game, 10, 10, 1),
    ];
    for (const e of entities) {
        const {ctx, rec} = recorder();
        e.draw(ctx);
        assert.equal(rec.images, 0, e.constructor.name);
        assert.ok(rec.points.length > 0, `${e.constructor.name} drew nothing`);
    }
});

test('a pulled lever swings down over a fifth of a second; an unlocked door slides open over about half a second', () => {
    const game = fakeGame();
    const lever = new (get('Lever'))({gameEngine: game, x: 10, y: 10, speed: 0, moving: false, direction: 'RIGHT'});
    const door = new (get('exitDoor'))(game, 10, 10, 1);
    const {ctx} = recorder();
    lever.draw(ctx); door.draw(ctx);
    assert.equal(lever.flip, 0);
    assert.equal(door.openAmount, 0);
    lever.collected = true;
    door.collectedLevers = 1;
    door.update();
    for (let f = 0; f < 6; f++) { lever.draw(ctx); door.draw(ctx); }
    assert.ok(lever.flip > 0.4 && lever.flip < 0.6, `lever at 0.1 s: ${lever.flip}`);
    assert.ok(door.openAmount > 0.1 && door.openAmount < 0.25, `door at 0.1 s: ${door.openAmount}`);
    for (let f = 0; f < 40; f++) { lever.draw(ctx); door.draw(ctx); }
    assert.equal(lever.flip, 1);
    assert.equal(door.openAmount, 1);
});

test('a rocket is drawn around its 30x30 box, nose first, with its flame behind', () => {
    for (const direction of ['LEFT', 'RIGHT', 'UP', 'DOWN']) {
        for (const age of [0, 0.13, 0.5, 2.7]) {
            const {ctx, rec} = recorder();
            EntityArt.rocket(ctx, {x: 100, y: 200, width: 30, height: 30, direction, age, seed: 0.4});
            assertInside(rec, boxOf(100, 200, 30, 30), 30, `${direction} at ${age}s`);
            // The nose reaches 17px ahead of the centre; the flame trails well behind it
            const b = bounds(rec.points), c = {x: 115, y: 215};
            const ahead = {RIGHT: b.right - c.x, LEFT: c.x - b.left, DOWN: b.bottom - c.y, UP: c.y - b.top}[direction];
            const behind = {RIGHT: c.x - b.left, LEFT: b.right - c.x, DOWN: c.y - b.top, UP: b.bottom - c.y}[direction];
            assert.ok(Math.abs(ahead - 17) < 1.5, `${direction}: nose ${ahead.toFixed(1)} ahead`);
            assert.ok(behind > 25, `${direction}: flame only ${behind.toFixed(1)} behind`);
        }
    }
});

test('a firework burst spreads out, stays within reach and is gone after its life', () => {
    const at = age => { const {ctx, rec} = recorder(); EntityArt.firework(ctx, 500, 400, age, 0.7); return rec; };
    const spread = rec => Math.max(...rec.points.map(p => Math.hypot(p.x - 500, p.y - 400)));
    assert.ok(at(0.02).points.length > 0, 'the flash at once');
    assert.ok(spread(at(0.4)) > spread(at(0.1)), 'it spreads');
    for (const age of [0, 0.1, 0.3, 0.6, 1.0]) assert.ok(spread(at(age)) < 130, `reach at ${age}s: ${spread(at(age)).toFixed(0)}`);
    assert.equal(at(EntityArt.FIREWORK_LIFE).points.length, 0, 'nothing once over');
    assert.equal(at(0.3).images, 0);
    // The same seed draws the same burst; another seed a different one
    assert.deepEqual(at(0.3).points, at(0.3).points);
    const other = recorder(); EntityArt.firework(other.ctx, 500, 400, 0.3, 0.2);
    assert.notDeepEqual(other.rec.points, at(0.3).points);
});

test('a launcher holds a rocket, is empty just after firing, and reloads before the next shot', () => {
    const fills = time => { const {ctx, rec} = recorder();
        EntityArt.launcher(ctx, {x: 100, y: 200, width: 58, height: 54, shotdirec: 'LEFT', time, atkspd: 2}); return rec.fills; };
    const hasRocket = time => fills(time).includes(EntityArt.COLORS.rocketLip);
    assert.ok(!hasRocket(0.05), 'empty right after a shot');
    assert.ok(hasRocket(0.4), 'the next rocket is sliding in');
    assert.ok(hasRocket(1.9), 'loaded before it fires');
});

test('the launcher fires rockets, which burst once when they hit a wall or the player', () => {
    const added = [];
    const game = Object.assign(fakeGame(), {addEntity: e => added.push(e)});
    const Rocket = get('Rocket'), Projectile = get('Projectile'), FireworkBurst = get('FireworkBurst');
    const launcher = new (get('ProjectileLauncher'))({gameEngine: game, x: 10, y: 10, speed: 0, moving: false, atkspd: 2, projspd: 100, shotdirec: 'UP'});
    launcher.update();
    assert.equal(added.length, 1);
    const rocket = added[0];
    assert.ok(rocket instanceof Rocket && rocket instanceof Projectile, 'a Rocket, and so a hazard to the player');
    assert.equal(rocket.width, 30);
    assert.equal(rocket.height, 30);
    // Hitting the player (Player calls explode) or a wall bursts it exactly once, where it was
    rocket.explode();
    rocket.explode();
    assert.equal(added.filter(e => e instanceof FireworkBurst).length, 1);
    const burst = added[1];
    assert.equal(burst.x, rocket.x + 15);
    assert.equal(burst.y, rocket.y + 15);
    assert.ok(rocket.removeFromWorld);
    // A wall: Projectile.update marks it for removal, and the rocket bursts
    const wallGame = Object.assign(fakeGame(), {addEntity: e => added.push(e),
        entities: [new (get('drawMap'))()]});
    const r2 = new Rocket(wallGame, 0, 0, 100, 'LEFT');
    wallGame.entities.push(r2);
    r2.update();
    assert.ok(r2.removeFromWorld && r2.exploded, 'burst on the wall');
    // The burst ages, draws, and removes itself when done
    const {ctx, rec} = recorder();
    burst.advance(0.2);
    burst.update();
    assert.ok(!burst.removeFromWorld);
    burst.draw(ctx);
    assert.ok(rec.points.length > 0);
    burst.advance(EntityArt.FIREWORK_LIFE);
    burst.update();
    assert.ok(burst.removeFromWorld);
});

test('a platform is drawn inside its box at both sizes, with no image', () => {
    for (const [w, label] of [[225, 'SHORT'], [450, 'WIDE']]) {
        const {ctx, rec} = recorder();
        EntityArt.platform(ctx, {x: 100, y: 200, width: w, height: 20});
        assertInside(rec, boxOf(100, 200, w, 20), 1.5, label);
    }
    const game = fakeGame();
    const p = new (get('Platform'))({gameEngine: game, x: 10, y: 10, speed: 0, moving: false, size: 'WIDE'});
    assert.equal(p.width, 450);
    const {ctx, rec} = recorder();
    p.draw(ctx);
    assert.equal(rec.images, 0);
});

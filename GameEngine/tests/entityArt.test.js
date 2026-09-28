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
const get = loadBrowserScripts(['boundingBox.js', 'entityArt.js', 'enemies.js', 'lever.js', 'exitDoor.js'], {
    ASSET_MANAGER: {getAsset(path) { throw new Error(`asked for ${path}`); }},
    console: {log() {}, warn() {}, error: console.error},
});
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

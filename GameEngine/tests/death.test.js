// Run with: node --test GameEngine/tests/
// The death effect throws the stickman's own pieces (DeathLimb, deathParticle.js) from the pose it died in.
const test = require('node:test');
const assert = require('node:assert/strict');
const {loadBrowserScripts} = require('./helpers/browserScripts.js');

const get = loadBrowserScripts(['stickman.js', 'deathParticle.js', 'deathAnimate.js']);
const Stickman = get('Stickman');
const DeathAnimation = get('DeathAnimation');
const DeathLimb = get('DeathLimb');

function deadRig() {
    const rig = new Stickman.Rig();
    for (let f = 0; f < 20; f++) rig.update(1 / 60, {state: 'run', vx: 500, vy: 0, grounded: true, facing: 1});
    return rig.joints(400, 300);
}

test('dying throws exactly the stickman\'s six pieces, starting where the figure was', () => {
    const joints = deadRig();
    const segments = Stickman.segments(joints);
    const death = new DeathAnimation(400, 263, segments);
    death.update(0);
    const limbs = death.particles.filter(p => p instanceof DeathLimb);
    assert.equal(limbs.length, 6);
    assert.equal(death.particles.length, 6 + 20 + 15, 'the splatter lines and blobs are still there');
    limbs.forEach((limb, i) => {
        // The piece's shape, put back at its position, is the segment it came from
        const placed = limb.segment.points.map(p => ({x: p.x + limb.x, y: p.y + limb.y}));
        placed.forEach((p, k) => {
            assert.ok(Math.abs(p.x - segments[i].points[k].x) < 1e-9 && Math.abs(p.y - segments[i].points[k].y) < 1e-9,
                `${segments[i].part} point ${k}`);
        });
        assert.equal(limb.segment.part, segments[i].part);
    });
});

test('the pieces fly apart, fall and fade, and stay visible long enough to read', () => {
    const death = new DeathAnimation(400, 263, Stickman.segments(deadRig()));
    death.update(0);
    const limbs = death.particles.filter(p => p instanceof DeathLimb);
    const start = limbs.map(l => ({x: l.x, y: l.y, vy: l.vy}));
    for (let f = 0; f < 18; f++) death.update(1 / 60);   // 0.3 s
    limbs.forEach((l, i) => {
        assert.ok(Math.hypot(l.x - 400, l.y - 263) > Math.hypot(start[i].x - 400, start[i].y - 263), `${l.segment.part} moved out`);
        assert.ok(l.vy > start[i].vy, `${l.segment.part} is pulled down`);
        assert.ok(l.alpha > 0.8, `${l.segment.part} still visible at 0.3 s`);
    });
    const limb = new DeathLimb(Stickman.segments(deadRig())[0], 400, 263);
    for (let f = 0; f < 60; f++) limb.update(1 / 60);
    assert.ok(limb.alpha < 0.3, 'fading by a second');
});

test('a piece moves the same at any frame rate', () => {
    const seg = Stickman.segments(deadRig())[2];
    const random = Math.random;
    const run = fps => {
        Math.random = () => 0.5;
        const limb = new DeathLimb(seg, 400, 263);
        Math.random = random;
        for (let f = 0; f < fps / 2; f++) limb.update(1 / fps);
        return limb;
    };
    const a = run(30), b = run(240);
    assert.ok(Math.abs(a.x - b.x) < 1e-6, 'x');
    assert.ok(Math.abs(a.y - b.y) < 12, `y ${a.y} vs ${b.y}`);   // Euler steps differ only a little under gravity
    assert.ok(Math.abs(a.rotation - b.rotation) < 1e-6, 'rotation');
});

test('without the stickman\'s pieces, the old generic body parts are used', () => {
    const death = new DeathAnimation(400, 263);
    death.update(0);
    assert.equal(death.particles.filter(p => p.type === 'bodyPart').length, 6);
    assert.equal(death.particles.filter(p => p instanceof DeathLimb).length, 0);
});

test('after the half-second effect, the splatter stops but the pieces keep flying until they fade', () => {
    const death = new DeathAnimation(400, 263, Stickman.segments(deadRig()));
    for (let f = 0; f < 36; f++) death.update(1 / 60);   // 0.6 s: past the duration
    assert.ok(death.finished);
    const limb = death.particles.find(p => p instanceof DeathLimb);
    const splat = death.particles.find(p => !(p instanceof DeathLimb));
    const [lx, sx] = [limb.x, splat && splat.x];
    death.update(1 / 60);
    assert.notEqual(limb.x, lx, 'a piece still moves');
    if (splat) assert.equal(splat.x, sx, 'the splatter is frozen');
    for (let f = 0; f < 120; f++) death.update(1 / 60);
    assert.equal(death.particles.filter(p => p instanceof DeathLimb).length, 0, 'the pieces are gone once faded');
});

test('with the game clock stopped (as it is once the player dies), the pieces still fly on real time', () => {
    const death = new DeathAnimation(400, 263, Stickman.segments(deadRig()));
    death.update(0, 0);
    const limb = death.particles.find(p => p instanceof DeathLimb);
    const line = death.particles.find(p => p.type === 'line');
    const [lx, ly, sx] = [limb.x, limb.y, line.x];
    for (let f = 0; f < 12; f++) death.update(0, 1 / 60);
    assert.ok(Math.hypot(limb.x - lx, limb.y - ly) > 20, 'the piece moved on the real clock');
    assert.equal(line.x, sx, 'the splatter does not move, as before');
});

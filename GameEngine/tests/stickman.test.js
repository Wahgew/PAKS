// Run with: node --test GameEngine/tests/
// The vector stickman rig (stickman.js): bones, feet on the ground, planted feet that never slide,
// crossfades that never snap, and a figure that stays around the player's 20x74 hitbox.
const test = require('node:test');
const assert = require('node:assert/strict');
const Stickman = require('../stickman.js');

const FPS = 60, DT = 1 / FPS;
const {DIM} = Stickman;
const BONES = [
    ['hip', 'neck', DIM.torso], ['hip', 'nKnee', DIM.thigh], ['nKnee', 'nFoot', DIM.shin],
    ['hip', 'fKnee', DIM.thigh], ['fKnee', 'fFoot', DIM.shin], ['shoulder', 'nElbow', DIM.upperArm],
    ['nElbow', 'nHand', DIM.forearm], ['shoulder', 'fElbow', DIM.upperArm], ['fElbow', 'fHand', DIM.forearm],
    ['neck', 'head', DIM.neck + DIM.headR],
];
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const GROUNDED = ['idle', 'walk', 'run', 'skid', 'crouch', 'slide'];

// What the player's physics feeds the rig in each state (the same shapes Player.draw passes)
function input(state, t, speed = 300, facing = 1) {
    const vx = speed * facing;
    switch (state) {
        case 'idle': case 'crouch': return {state, vx: 0, vy: 0, grounded: true, facing};
        case 'walk': return {state, vx: Math.sign(vx) * Math.min(Math.abs(vx), 400), vy: 0, grounded: true, facing};
        case 'run': case 'skid': case 'slide': return {state, vx, vy: 0, grounded: true, facing};
        case 'jump': return {state, vx, vy: -850 + 2000 * Math.min(t, 0.42), grounded: false, facing};
        case 'fall': return {state, vx, vy: Math.min(2000, 2000 * (t % 1)), grounded: false, facing};
        case 'wall': return {state, vx: 0, vy: 150, grounded: false, facing, wallSide: -facing};
    }
    throw new Error(state);
}

// Every pose each clip can produce: all speeds and phases for the gait, a spread of times and fall speeds for the rest
function* everyPose() {
    for (const clip of Object.keys(Stickman.CLIPS)) {
        for (let i = 0; i < 40; i++) {
            const speeds = clip === 'gait' ? [20, 80, 150, 250, 400, 520, 650] : [0, 300];
            for (const vx of speeds) {
                for (const vy of clip === 'jump' ? [-850, -400, -1] : clip === 'fall' ? [1, 400, 2000] : [0]) {
                    yield {clip, vx, vy, phase: i / 40, pose: Stickman.CLIPS[clip]({t: i * 0.037, time: i * 0.11, vx, vy, phase: i / 40, squash: 0})};
                }
            }
        }
    }
}

test('every bone keeps its length in every pose of every clip', () => {
    for (const {clip, pose} of everyPose()) {
        const j = Stickman.solve(pose);
        for (const [a, b, len] of BONES) {
            assert.ok(Math.abs(dist(j[a], j[b]) - len) < 1e-9, `${clip}: ${a}-${b} is ${dist(j[a], j[b])}, not ${len}`);
        }
    }
});

test('the leg and arm IK put the foot and hand exactly on a reachable target', () => {
    for (const [fx, fy] of [[0, 38], [15, 30], [-12, 20], [30, 5], [5, 12]]) {
        const leg = Stickman.legIK(0, 0, fx, fy);
        const j = Stickman.solve({x: 0, y: 0, lean: 0, head: 0, nThigh: leg.thigh, nKnee: leg.knee, fThigh: 0, fKnee: 0,
            nArm: 0, nElbow: 0, fArm: 0, fElbow: 0});
        assert.ok(dist(j.nFoot, {x: fx, y: fy}) < 1e-6, `leg to (${fx}, ${fy})`);
        assert.ok(j.nKnee.x > Math.min(0, fx) - 1e-9, 'knees bend forward');
    }
    for (const down of [false, true]) {
        for (const [hx, hy] of [[10, 15], [-15, 10], [5, -20], [20, 0]]) {
            const arm = Stickman.armIK(0, 0, hx, hy, down);
            const j = Stickman.solve({x: 0, y: DIM.shoulder, lean: 0, head: 0, nThigh: 0, nKnee: 0, fThigh: 0, fKnee: 0,
                nArm: arm.arm, nElbow: arm.elbow, fArm: 0, fElbow: 0});
            assert.ok(dist(j.nHand, {x: hx, y: hy}) < 1e-6, `arm to (${hx}, ${hy}), elbowDown ${down}`);
        }
    }
});

test('on the ground, the lowest foot is on the floor and nothing goes through it', () => {
    let flight = 0;
    for (const {clip, vx, phase, pose} of everyPose()) {
        if (!Stickman.GROUNDED_CLIPS.includes(clip)) continue;
        const j = Stickman.solve(pose);
        const foot = Math.max(j.nFoot.y, j.fFoot.y);
        // A jog or run has a moment with both feet off the ground (the stance is under half the cycle); a walk never does
        const g = clip === 'gait' && Stickman.gaitParams(Math.abs(vx));
        const planted = !g || Stickman.footAt(g, phase).planted || Stickman.footAt(g, (phase + 0.5) % 1).planted;
        if (planted) assert.ok(Math.abs(foot) < 1e-6, `${clip} at ${vx}px/s: lowest foot at ${foot}, not on the ground`);
        else { flight++; assert.ok(g.stance < 0.5 && Math.abs(vx) > 100 && foot < 0, `${clip} at ${vx}px/s: both feet off the ground at a walk`); }
        for (const [name, p] of Object.entries(j)) {
            if (name === 'headDir') continue;
            assert.ok(p.y + (name === 'head' ? DIM.headR : 0) <= 1e-6, `${clip}: ${name} below the floor at ${p.y}`);
        }
    }
    assert.ok(flight > 0, 'a fast run should have a flight phase');
});

test('a planted foot stays exactly where it landed while walking and running (no foot skating)', () => {
    for (const facing of [1, -1]) {
        for (const speed of [60, 120, 250, 400, 520, 650]) {
            const rig = new Stickman.Rig();
            let x = 0, prev = null, checked = 0;
            for (let f = 0; f < FPS * 3; f++) {
                const inp = input(speed > 400 ? 'run' : 'walk', f * DT, speed, facing);
                rig.update(DT, inp);
                x += inp.vx * DT;
                const j = rig.joints(x, 0);
                // After the turn-around and the crossfade from idle have settled
                if (prev && f > 20) {
                    for (const foot of ['nFoot', 'fFoot']) {
                        if (Math.abs(j[foot].y) < 1e-6 && Math.abs(prev[foot].y) < 1e-6) {
                            const slide = Math.abs(j[foot].x - prev[foot].x);
                            assert.ok(slide < 0.01, `speed ${speed} facing ${facing}: planted ${foot} slid ${slide.toFixed(3)}px in a frame`);
                            checked++;
                        }
                    }
                }
                prev = j;
            }
            assert.ok(checked > 50, `speed ${speed}: a foot was planted on only ${checked} frames`);
        }
    }
});

test('the step rate only rises with speed, and stays in a believable range', () => {
    let last = 0;
    for (let v = 40; v <= 650; v += 10) {
        const cadence = v / Stickman.gaitParams(v).length;
        assert.ok(cadence >= last - 1e-9, `at ${v}px/s the legs cycle slower (${cadence.toFixed(2)}/s) than at ${v - 10}`);
        last = cadence;
    }
    assert.ok(last < 5.5, `top speed cycles ${last.toFixed(2)} times a second`);
});

// Largest distance any joint moves between two frames, in the box's own frame (the box itself moves with physics)
function biggestStep(sequence) {
    const rig = new Stickman.Rig();
    let prev = null, worst = 0, where = '';
    sequence.forEach(({inp, label}) => {
        rig.update(DT, inp);
        const j = rig.joints(0, 0);
        if (prev) {
            for (const k of Object.keys(j)) {
                if (k === 'headDir') continue;
                const d = dist(j[k], prev[k]);
                if (d > worst) { worst = d; where = `${label} ${k}`; }
            }
        }
        prev = j;
    });
    return {worst, where};
}

const STATES = Stickman.STATES;
// px per frame at 60 fps. A fast run's hands move about 13; the worst crossfade, an arm swinging over the head from
// a fall into a slide while turning round, about 18.5; an un-blended switch 30 to 70.
const MAX_STEP = 20;

function switchSequence(a, b, facingB = 1) {
    const seq = [];
    for (let f = 0; f < 30; f++) seq.push({inp: input(a, f * DT), label: `${a}`});
    for (let f = 0; f < 30; f++) seq.push({inp: input(b, f * DT, 300, facingB), label: `${a}->${b}`});
    return seq;
}

test('switching between any two states crossfades: no joint jumps between frames', () => {
    for (const a of STATES) {
        for (const b of STATES) {
            if (a === b) continue;   // not a switch (and restarting a jump's rise in mid-air can't happen)
            for (const facing of [1, -1]) {
                const {worst, where} = biggestStep(switchSequence(a, b, facing));
                assert.ok(worst < MAX_STEP, `${where} (facing ${facing}) moved ${worst.toFixed(1)}px in one frame`);
            }
        }
    }
});

test('the no-snap limit is meaningful: switching clips without the crossfade would break it', () => {
    let broke = 0;
    for (const a of STATES) {
        for (const b of STATES) {
            if (Stickman.CLIP_FOR[a] === Stickman.CLIP_FOR[b]) continue;
            const pa = Stickman.solve(Stickman.CLIPS[Stickman.CLIP_FOR[a]]({t: 0.5, time: 0.5, vx: 300, vy: 0, phase: 0.3, squash: 0}));
            const pb = Stickman.solve(Stickman.CLIPS[Stickman.CLIP_FOR[b]]({t: 0, time: 0.5, vx: 300, vy: 0, phase: 0.3, squash: 0}));
            if (Object.keys(pa).some(k => k !== 'headDir' && dist(pa[k], pb[k]) > MAX_STEP)) broke++;
        }
    }
    assert.ok(broke > 40, `only ${broke} raw switches would snap`);
});

test('turning around squeezes through the middle instead of flipping in one frame', () => {
    const seq = [];
    for (let f = 0; f < 40; f++) seq.push({inp: input('run', f * DT, 500, 1), label: 'run right'});
    for (let f = 0; f < 40; f++) seq.push({inp: input('run', f * DT, 500, -1), label: 'run left'});
    for (let f = 0; f < 40; f++) seq.push({inp: input('idle', f * DT, 0, 1), label: 'idle right'});
    const {worst, where} = biggestStep(seq);
    assert.ok(worst < MAX_STEP, `${where} moved ${worst.toFixed(1)}px in one frame`);
});

test('landing from a fall squashes the figure briefly, then it stands back up', () => {
    const rig = new Stickman.Rig();
    for (let f = 0; f < 30; f++) rig.update(DT, input('fall', 0.9));
    rig.update(DT, {state: 'idle', vx: 0, vy: 0, grounded: true, facing: 1});
    let lowest = 0;
    for (let f = 0; f < 8; f++) {
        rig.update(DT, {state: 'idle', vx: 0, vy: 0, grounded: true, facing: 1});
        lowest = Math.max(lowest, rig.joints(0, 0).hip.y);
    }
    for (let f = 0; f < 60; f++) rig.update(DT, {state: 'idle', vx: 0, vy: 0, grounded: true, facing: 1});
    const settled = rig.joints(0, 0).hip.y;
    assert.ok(lowest - settled > 3, `the hip only dipped ${(lowest - settled).toFixed(2)}px on landing`);
});

test('the figure stays around the 20x74 hitbox in every pose', () => {
    for (const {clip, pose} of everyPose()) {
        const j = Stickman.solve(pose);
        for (const [name, p] of Object.entries(j)) {
            if (name === 'headDir') continue;
            const r = name === 'head' ? DIM.headR : 0;
            assert.ok(p.x - r >= -40 && p.x + r <= 40, `${clip}: ${name} at x ${p.x.toFixed(1)}`);
            assert.ok(p.y - r >= -86 && p.y + r <= 1e-6 + (Stickman.GROUNDED_CLIPS.includes(clip) ? 0 : 8), `${clip}: ${name} at y ${p.y.toFixed(1)}`);
        }
    }
    // Standing still, the figure fills the box: head at the top, feet at the bottom
    const idle = Stickman.solve(Stickman.CLIPS.idle({t: 0, time: 0, vx: 0, vy: 0, phase: 0, squash: 0}));
    assert.ok(Math.abs(idle.head.y - DIM.headR + 74) < 2, `idle head top at ${(idle.head.y - DIM.headR).toFixed(1)}`);
});

test('the wall slide keeps its back to the wall, with a hand and a foot on it', () => {
    for (const wallSide of [1, -1]) {
        const rig = new Stickman.Rig();
        for (let f = 0; f < 30; f++) rig.update(DT, {state: 'wall', vx: 0, vy: 150, grounded: false, facing: 1, wallSide});
        const j = rig.joints(0, 0);
        const wallX = wallSide * 10;
        for (const k of ['fHand', 'fFoot']) assert.ok(Math.abs(j[k].x - wallX) < 1e-6, `wall on ${wallSide}: ${k} at ${j[k].x}`);
        for (const [k, p] of Object.entries(j)) {
            if (k !== 'headDir') assert.ok(wallSide * (p.x - wallX) <= 1e-6, `wall on ${wallSide}: ${k} inside the wall`);
        }
    }
});

test('a long frame (a tab switch) does not fast-forward the animation', () => {
    const a = new Stickman.Rig(), b = new Stickman.Rig();
    a.update(5, input('run', 0, 500));
    b.update(0.1, input('run', 0, 500));
    assert.deepEqual(a.pose, b.pose);
});

test('segments are the six pieces of the figure, joined where the figure is', () => {
    const rig = new Stickman.Rig();
    rig.update(DT, input('run', 0, 500));
    const j = rig.joints(100, 200);
    const segs = Stickman.segments(j);
    assert.deepEqual(segs.map(s => s.part).sort(), ['fArm', 'fLeg', 'head', 'nArm', 'nLeg', 'torso']);
    assert.deepEqual(segs.find(s => s.part === 'nLeg').points, [j.hip, j.nKnee, j.nFoot]);
    assert.deepEqual(segs.find(s => s.part === 'head').points, [j.head]);
    assert.ok(segs.filter(s => s.far).every(s => s.part[0] === 'f'), 'only the far limbs are drawn lighter');
});

test('drawing strokes the far limbs first and the near side last, with no images', () => {
    const calls = [];
    const ctx = new Proxy({}, {
        get: (o, k) => k in o ? o[k] : (k === 'createRadialGradient' ? () => ({addColorStop() {}}) : (...args) => calls.push([k, args])),
        set: (o, k, v) => { if (k === 'strokeStyle' || k === 'fillStyle') calls.push(['set ' + k, [v]]); o[k] = v; return true; },
    });
    const rig = new Stickman.Rig();
    Stickman.draw(ctx, rig.joints(0, 0));
    Stickman.drawShadow(ctx, 0, 0, 20);
    assert.ok(!calls.some(([k]) => k === 'drawImage'), 'no images');
    const strokes = calls.filter(([k]) => k === 'set strokeStyle').map(([, [v]]) => v);
    assert.deepEqual(strokes, [Stickman.STYLE.far, Stickman.STYLE.far, Stickman.STYLE.near, Stickman.STYLE.near, Stickman.STYLE.near]);
});

test('the crouch is a deep squat with the chest up and the arms folded at chest height, elbows clear of the knees', () => {
    for (let i = 0; i < 20; i++) {
        const j = Stickman.solve(Stickman.CLIPS.crouch({t: i * 0.1, time: i * 0.13, vx: 0, vy: 0, phase: 0, squash: 0}));
        assert.ok(j.hip.y > -20, `hips at ${j.hip.y.toFixed(1)}, not down in a squat`);
        assert.ok(j.hip.x < Math.min(j.nFoot.x, j.nKnee.x), 'hips sit back behind the front foot and knee');
        assert.ok(Math.abs(j.neck.x - j.hip.x) < 8, 'chest up, not folded forward');
        for (const side of ['n', 'f']) {
            assert.ok(dist(j[side + 'Elbow'], j[side + 'Knee']) > 6, `${side} elbow on the knee`);
            assert.ok(j[side + 'Elbow'].x > j.shoulder.x + 8, `${side} elbow out in front of the chest`);
            assert.ok(Math.abs(j[side + 'Hand'].x - j.shoulder.x) < 6 && Math.abs(j[side + 'Hand'].y - j.shoulder.y) < 7,
                `${side} hand folded back to the chest`);
        }
    }
});

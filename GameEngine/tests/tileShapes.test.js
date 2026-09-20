// Run with: node --test GameEngine/tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const TileShapes = require('../tileShapes.js');

const {ID} = TileShapes;
const SIZE = 25;
const box = (left, top, right, bottom) => ({left, top, right, bottom});
const near = (actual, expected, tol = 1e-6) =>
    assert.ok(Math.abs(actual - expected) <= tol, `expected ${actual} to be within ${tol} of ${expected}`);

function area(pts) {
    let a = 0;
    pts.forEach((p, i) => {
        const q = pts[(i + 1) % pts.length];
        a += p.x * q.y - q.x * p.y;
    });
    return Math.abs(a) / 2;
}

function isConvex(pts) {
    let sign = 0;
    for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length], c = pts[(i + 2) % pts.length];
        const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
        if (Math.abs(cross) < 1e-12) continue;
        if (sign === 0) sign = Math.sign(cross);
        else if (Math.sign(cross) !== sign) return false;
    }
    return true;
}

test('the id table has every documented shape and only those', () => {
    const expected = [10, 11, 12, 13, 20, 21, 22, 23, 30, 31, 32, 33];
    assert.deepEqual(TileShapes.all().map(s => s.id).sort((a, b) => a - b), expected);
    for (const id of expected) assert.ok(TileShapes.isShape(id) && TileShapes.isKnown(id));
    assert.ok(TileShapes.isKnown(0) && TileShapes.isKnown(1));
    assert.ok(!TileShapes.isShape(0) && !TileShapes.isShape(1));
    assert.ok(!TileShapes.isKnown(3) && !TileShapes.isKnown(99));
});

test('every piece is convex, inside the tile, and its hidden edges exist', () => {
    for (const s of TileShapes.all()) {
        for (const piece of s.pieces) {
            assert.ok(isConvex(piece.pts), `${s.name} piece is not convex`);
            for (const p of piece.pts) assert.ok(p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1, `${s.name} leaves the tile`);
            for (const e of piece.hidden) assert.ok(e >= 0 && e < piece.pts.length);
        }
    }
});

test('shape areas match their geometry', () => {
    const areaOf = id => TileShapes.all().find(s => s.id === id).pieces.reduce((sum, p) => sum + area(p.pts), 0);
    const outlineOf = id => area(TileShapes.all().find(s => s.id === id).outline);
    for (const c of [0, 1, 2, 3]) {
        near(areaOf(ID.SLOPE_BL + c), 0.5);
        near(areaOf(ID.CONVEX_BL + c), Math.PI / 4, 0.01);
        near(areaOf(ID.CONCAVE_BL + c), 1 - Math.PI / 4, 0.01);
        // the triangle fan must cover its outline exactly, or rendering and collision disagree
        near(areaOf(ID.CONCAVE_BL + c), outlineOf(ID.CONCAVE_BL + c));
        near(areaOf(ID.CONVEX_BL + c), outlineOf(ID.CONVEX_BL + c));
    }
});

test('the four corners of a family are mirror images with the solid mass in the named corner', () => {
    // area-weighted centroid of all pieces
    const centroid = id => {
        let A = 0, cx = 0, cy = 0;
        for (const piece of TileShapes.get(id, 1).pieces) {
            const pts = piece.pts;
            pts.forEach((p, i) => {
                const q = pts[(i + 1) % pts.length];
                const cross = p.x * q.y - q.x * p.y;
                A += cross / 2;
                cx += (p.x + q.x) * cross / 6;
                cy += (p.y + q.y) * cross / 6;
            });
        }
        return {x: cx / A, y: cy / A};
    };
    for (const base of [ID.SLOPE_BL, ID.CONVEX_BL, ID.CONCAVE_BL]) {
        assert.ok(centroid(base).x < 0.5 && centroid(base).y > 0.5, 'BL');
        assert.ok(centroid(base + 1).x > 0.5 && centroid(base + 1).y > 0.5, 'BR');
        assert.ok(centroid(base + 2).x < 0.5 && centroid(base + 2).y < 0.5, 'TL');
        assert.ok(centroid(base + 3).x > 0.5 && centroid(base + 3).y < 0.5, 'TR');
    }
});

test('get() scales to the tile size and caches', () => {
    const a = TileShapes.get(ID.SLOPE_BR, 25);
    assert.equal(a, TileShapes.get(ID.SLOPE_BR, 25));
    assert.notEqual(a, TileShapes.get(ID.SLOPE_BR, 50));
    assert.equal(a.pieces[0].maxX, 25);
    assert.equal(TileShapes.get(ID.SOLID, 25), null);
});

// SLOPE_BR at (0,0): solid below the line from (0,25) to (25,0), i.e. y = 25 - x.
test('a box sunk into a 45° floor slope gets a floor contact and the exact vertical lift', () => {
    const [c] = TileShapes.contacts([[ID.SLOPE_BR]], SIZE, box(10, -40, 20, 20));
    assert.equal(c.kind, 'floor');
    near(c.nx, -Math.SQRT1_2);
    near(c.ny, -Math.SQRT1_2);
    near(c.up, 15);          // highest surface under the box is at its right edge: y = 25 - 20 = 5; bottom is at 20
    near(c.depth, 15 * Math.SQRT1_2);
});

test('a box resting exactly on a slope surface is touching, not colliding', () => {
    // surface under the right edge (x=20) is y=5, so a bottom of 5 rests on it
    assert.deepEqual(TileShapes.contacts([[ID.SLOPE_BR]], SIZE, box(10, -69, 20, 5)), []);
    assert.equal(TileShapes.overlapsAny([[ID.SLOPE_BR]], SIZE, box(10, -69, 20, 5)), null);
});

test('the empty half of a slope tile does not collide', () => {
    // above-left of the hypotenuse: right edge x=5 -> surface y=20, box bottom 15
    assert.equal(TileShapes.overlapsAny([[ID.SLOPE_BR]], SIZE, box(0, -50, 5, 15)), null);
});

test('the vertical face of a slope tile is a wall', () => {
    // approach SLOPE_BR from the right, where its full-height edge is x=25 (single tile at column 0)
    const [c] = TileShapes.contacts([[ID.SLOPE_BR]], SIZE, box(20, -30, 30, 20));
    assert.equal(c.kind, 'wall');
    near(c.nx, 1);
});

test('the underside of a ceiling slope is a ceiling contact with the exact push-down', () => {
    // SLOPE_TR: solid above the line from (0,0) to (25,25) (y = x). A box below it, head poking in.
    const [c] = TileShapes.contacts([[ID.SLOPE_TR]], SIZE, box(10, 12, 20, 80));
    assert.equal(c.kind, 'ceiling');
    near(c.ny, Math.SQRT1_2);
    near(c.down, 8);   // lowest underside over the span is at its right edge (y = 20); the head is at 12
});

test('walkable threshold: 45° is floor, steeper is wall', () => {
    assert.equal(TileShapes.classify(-Math.SQRT1_2), 'floor');
    assert.equal(TileShapes.classify(-0.6), 'wall');
    assert.equal(TileShapes.classify(0), 'wall');
    assert.equal(TileShapes.classify(Math.SQRT1_2), 'ceiling');
    assert.equal(TileShapes.classify(-1), 'floor');
});

test('a convex hill shoulder is floor at the flat top and wall at the vertical end', () => {
    // CONVEX_BL: quarter disc centred on (0,25), radius 25. Top of the arc is (0,0), end is (25,25).
    const top = TileShapes.contacts([[ID.CONVEX_BL]], SIZE, box(0.5, -70, 5.5, 4));
    assert.ok(top.length > 0 && top.every(c => c.kind === 'floor'), 'near the crest');
    const end = TileShapes.contacts([[ID.CONVEX_BL]], SIZE, box(24, -30, 34, 24));
    assert.ok(end.length > 0 && end.some(c => c.kind === 'wall'), 'near the vertical end');
});

test('a concave bowl is floor on its flat side and wall on its steep side', () => {
    // CONCAVE_BL: solid outside a quarter disc centred on (25,0). The rim is flat at (25,25), vertical at (0,0).
    const flat = TileShapes.contacts([[ID.CONCAVE_BL]], SIZE, box(19, -50, 24, 24.6));
    assert.ok(flat.some(c => c.kind === 'floor'));
    const steep = TileShapes.contacts([[ID.CONCAVE_BL]], SIZE, box(0.5, -64, 10.5, 10));
    assert.ok(steep.some(c => c.kind === 'wall'));
    assert.ok(!steep.some(c => c.kind === 'ceiling'));
});

test('fan seams in a concave bowl never produce a phantom wall on the walkable part', () => {
    // Sink a box 0.5px into the bowl at many x positions where the surface is under 45° (left edge >= ~7.3).
    // Every contact must be a floor; a hidden fan ray winning the MTV would show up here as a wall.
    const tiles = [[ID.CONCAVE_BL]];
    const pieces = TileShapes.get(ID.CONCAVE_BL, SIZE).pieces;
    let checked = 0;
    for (let left = 8; left <= 15; left += 0.13) {
        const tall = box(left, -49, left + 10, 25);
        const surface = Math.min(...pieces.map(p => TileShapes.verticalClearance(tall, p, 0, 0)).filter(Boolean).map(c => c.top));
        const contacts = TileShapes.contacts(tiles, SIZE, box(left, surface - 74 + 0.5, left + 10, surface + 0.5));
        assert.ok(contacts.length > 0, `no contact at left=${left}`);
        for (const c of contacts) assert.equal(c.kind, 'floor', `phantom ${c.kind} at left=${left} (normal ${c.nx.toFixed(2)},${c.ny.toFixed(2)})`);
        checked++;
    }
    assert.ok(checked > 40);
});

test('dropDistance finds a shape surface below and a full block below', () => {
    // floor row of solid blocks at row 1, a slope in row 0 col 0
    const tiles = [[ID.SLOPE_BR, 0], [1, 1]];
    // box hovering 3px above the slope surface under its right edge
    const d = TileShapes.dropDistance(tiles, SIZE, box(10, -71, 20, 2), 10);
    near(d.shape, 3);
    // a box above only the full blocks
    const d2 = TileShapes.dropDistance(tiles, SIZE, box(30, -60, 40, 20), 10);
    near(d2.solid, 5);
    assert.equal(d2.shape, null);
    // nothing in reach
    const d3 = TileShapes.dropDistance(tiles, SIZE, box(30, -80, 40, 0), 10);
    assert.equal(d3.solid, null);
});

test('contacts tolerates boxes outside the grid', () => {
    assert.deepEqual(TileShapes.contacts([[ID.SLOPE_BL]], SIZE, box(-100, -100, -50, -50)), []);
    assert.deepEqual(TileShapes.contacts([[ID.SLOPE_BL]], SIZE, box(500, 500, 600, 600)), []);
});

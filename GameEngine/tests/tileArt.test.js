// Run with: node --test GameEngine/tests/
// Vector tiles (tileArt.js): the old block colours, which sides count as exposed, seam-free runs, lit slopes, culling.
const test = require('node:test');
const assert = require('node:assert/strict');
const TileArt = require('../tileArt.js');

const S = 25;

// A canvas stand-in that records fills and strokes with the colour they used
function recorder() {
    const log = [];
    const ctx = {
        save() {}, restore() {}, beginPath() {}, closePath() {}, moveTo() {}, lineTo() {},
        fillRect(x, y, w, h) { log.push({op: 'fillRect', rect: [x, y, w, h], color: ctx.fillStyle}); },
        fill() { log.push({op: 'fill', color: ctx.fillStyle}); },
        stroke() { log.push({op: 'stroke', color: ctx.strokeStyle, width: ctx.lineWidth}); },
        drawImage() { log.push({op: 'drawImage'}); },
    };
    return {ctx, log};
}

const all = map => ({rowFrom: 0, rowTo: map.length - 1, colFrom: 0, colTo: map[0].length - 1});

test('the palette is the eight colours the old block images were, in their order', () => {
    assert.deepEqual(TileArt.PALETTE, ['#000000', '#2d5050', '#483c8c', '#708291', '#3c9a66', '#b87333', '#3d85c6', '#96223f']);
});

test('shade mixes toward white or black', () => {
    assert.equal(TileArt.shade('#000000', 0.5), '#808080');
    assert.equal(TileArt.shade('#808080', -0.5), '#404040');
    assert.equal(TileArt.shade('#3c9a66', 0), '#3c9a66');
});

test('a side is exposed only where open space is next to it', () => {
    const map = [
        [0, 0, 0, 0, 0],
        [0, 1, 1, 10, 0],
        [0, 1, 11, 0, 0],
    ];
    // Top of a floor block is open; the block below and the one beside close the others
    assert.deepEqual(TileArt.exposedSides(map, 1, 1, S), {top: true, bottom: false, left: true, right: false});
    // A 45° slope whose solid left side meets the block covers it
    assert.equal(TileArt.exposedSides(map, 1, 2, S).right, false);
    // A slope that only touches the block at a corner does not: the block's side shows
    assert.equal(TileArt.exposedSides([[1, 11]], 0, 0, S).right, true);
    // Off the map counts as closed (no edge drawn along the level's border)
    assert.deepEqual(TileArt.exposedSides([[1]], 0, 0, S), {top: false, bottom: false, left: false, right: false});
});

test('a row of blocks is filled as one rectangle, reaching into solid neighbours so no seam shows', () => {
    const map = [
        [1, 1, 1, 1, 0, 1],
        [1, 1, 0, 0, 0, 0],
    ];
    const {ctx, log} = recorder();
    TileArt.drawTiles(ctx, map, S, all(map), 4);
    const fills = log.filter(l => l.op === 'fillRect' && l.color === TileArt.PALETTE[4]).map(l => l.rect);
    // Row 0: the first two (solid below) and the next two (open below) are separate runs, then the lone block
    assert.deepEqual(fills.slice(0, 3), [
        [0, 0, 2 * S + TileArt.OVERLAP, S + TileArt.OVERLAP],
        [2 * S, 0, 2 * S, S],
        [5 * S, 0, S, S],
    ]);
    assert.deepEqual(fills[3], [0, S, 2 * S, S], 'row 1');
    assert.equal(log.filter(l => l.op === 'drawImage').length, 0, 'no images');
});

test('exposed tops are lit and exposed bottoms shaded', () => {
    const map = [[0], [1], [0]];
    const {ctx, log} = recorder();
    TileArt.drawTiles(ctx, map, S, all(map), 3);
    const base = TileArt.PALETTE[3];
    const top = log.find(l => l.op === 'fillRect' && l.rect[1] === S && l.rect[3] === TileArt.EDGE.top.width);
    const bottom = log.find(l => l.op === 'fillRect' && l.rect[1] === 2 * S - TileArt.EDGE.bottom.width);
    assert.equal(top.color, TileArt.shade(base, TileArt.EDGE.top.amount));
    assert.equal(bottom.color, TileArt.shade(base, TileArt.EDGE.bottom.amount));
});

test('a slope is filled in the theme colour and its surface lit by which way it faces', () => {
    const up = [[0, 0], [0, 10], [1, 1]];      // 45° floor slope, surface facing up
    const down = [[1, 1], [0, 13], [0, 0]];    // 45° ceiling slope, surface facing down
    const base = TileArt.PALETTE[6];
    const strokes = map => { const {ctx, log} = recorder(); TileArt.drawTiles(ctx, map, S, all(map), 6); return log; };
    const a = strokes(up);
    assert.ok(a.some(l => l.op === 'fill' && l.color === base), 'filled');
    assert.ok(a.some(l => l.op === 'stroke' && l.color === TileArt.shade(base, TileArt.EDGE.top.amount)), 'surface facing up is lit');
    const b = strokes(down);
    assert.ok(b.some(l => l.op === 'stroke' && l.color === TileArt.shade(base, TileArt.EDGE.bottom.amount)), 'surface facing down is shaded');
});

test('only the rows and columns in view are drawn', () => {
    const map = Array.from({length: 40}, () => new Array(40).fill(1));
    const {ctx, log} = recorder();
    TileArt.drawTiles(ctx, map, S, {rowFrom: 10, rowTo: 12, colFrom: 5, colTo: 8}, 0);
    for (const l of log.filter(l => l.op === 'fillRect')) {
        const [x, y, w, h] = l.rect;
        assert.ok(x >= 5 * S && y >= 10 * S && x + w <= 9 * S + 1 && y + h <= 13 * S + 1, JSON.stringify(l.rect));
    }
});

test('a big block gets the same light top and shaded bottom', () => {
    const {ctx, log} = recorder();
    TileArt.drawBigBlock(ctx, 100, 200, 300, 50, '#2e8b57');
    assert.deepEqual(log[0].rect, [100, 200, 300, 50]);
    assert.ok(log.some(l => l.color === TileArt.shade('#2e8b57', TileArt.EDGE.top.amount * 0.7) && l.rect[1] === 200));
    assert.ok(log.some(l => l.color === TileArt.shade('#2e8b57', TileArt.EDGE.bottom.amount * 0.7) && l.rect[1] > 240));
});

test('a curve resting on a block closes the block\'s top, though its arc ends a hair off the tile edge', () => {
    for (const id of [20, 21, 30, 31]) {
        const map = [[id], [1]];
        assert.equal(TileArt.exposedSides(map, 1, 0, S).top, false, `block under ${id}`);
        assert.equal(TileArt.exposedSides(map, 0, 0, S).bottom, false, `${id} on a block`);
    }
});

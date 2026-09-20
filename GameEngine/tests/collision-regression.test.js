// Levels 1-16 use only tile ids 0 and 1. Adding slope support must not change a single collision result there.
const test = require('node:test');
const assert = require('node:assert/strict');
const {loadBrowserScripts, loadLevel} = require('./helpers/browserScripts.js');

const get = loadBrowserScripts(['boundingBox.js', 'tileShapes.js', 'drawMap.js'], {ASSET_MANAGER: {getAsset: () => ({})}});
const drawMap = get('drawMap');
const BoundingBox = get('BoundingBox');
const TileShapes = get('TileShapes');
const SIZE = 25;

// The full-tile collision test exactly as it was before shapes existed.
function referenceCheckCollisions(map, entity) {
    const tileStartX = Math.floor(entity.x / SIZE);
    const tileEndX = Math.floor((entity.x + entity.width) / SIZE);
    const tileStartY = Math.floor(entity.y / SIZE);
    const tileEndY = Math.floor((entity.y + entity.height) / SIZE);

    if (entity.x + entity.width > map[0].length * SIZE) {
        return {collides: true, tileX: map[0].length * SIZE, tileY: entity.y};
    }
    for (let i = tileStartY; i <= tileEndY; i++) {
        for (let j = tileStartX; j <= tileEndX; j++) {
            if (map[i] && map[i][j] === 1) {
                const tileBB = new BoundingBox(j * SIZE, i * SIZE, SIZE, SIZE);
                if (entity.BB.collide(tileBB)) return {collides: true, tileX: j * SIZE, tileY: i * SIZE};
            }
        }
    }
    return {collides: false};
}

function makeMap(tiles) {
    const m = Object.create(drawMap.prototype);
    m.drawSize = SIZE;
    m.loadMap(tiles);
    return m;
}

// Objects built inside the vm context have another realm's Object.prototype, which deepStrictEqual rejects.
const plain = value => JSON.parse(JSON.stringify(value));

// small deterministic PRNG so failures are reproducible
function rng(seed) {
    return () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
}

test('levels 0-16: checkCollisions and checkSolidTiles match the original on random boxes', () => {
    for (let n = 0; n <= 16; n++) {
        const tiles = loadLevel(n).map.tiles;
        const map = makeMap(tiles);
        assert.equal(map.hasShapes, false, `level ${n} unexpectedly has shapes`);
        const rand = rng(n + 1);
        const w = tiles[0].length * SIZE, h = tiles.length * SIZE;
        for (let k = 0; k < 4000; k++) {
            const width = [20, 40, 60][k % 3], height = [74, 37, 12][k % 3];
            const x = rand() * (w + 40) - 20, y = rand() * (h + 40) - 20;
            const entity = {x, y, width, height, BB: new BoundingBox(x, y, width, height)};
            const expected = referenceCheckCollisions(tiles, entity);
            assert.deepEqual(plain(map.checkSolidTiles(entity)), expected, `level ${n} solid @ ${x},${y}`);
            assert.deepEqual(plain(map.checkCollisions(entity)), expected, `level ${n} any @ ${x},${y}`);
        }
    }
});

test('loadMap turns unknown tile ids into empty tiles and warns', () => {
    const warnings = [];
    const realWarn = console.warn;
    console.warn = (...a) => warnings.push(a.join(' '));
    try {
        const map = makeMap([[1, 3, 99, 0, TileShapes.ID.SLOPE_BL]]);
        assert.deepEqual(plain(map.map[0]), [1, 0, 0, 0, TileShapes.ID.SLOPE_BL]);
        assert.equal(map.hasShapes, true);
        assert.equal(warnings.length, 1);
        assert.match(warnings[0], /3, 99/);
    } finally {
        console.warn = realWarn;
    }
});

test('checkCollisions sees shape tiles that checkSolidTiles ignores', () => {
    // one SLOPE_BR tile at column 1 of a 3x1 map (solid below y = 25 - (x - 25))
    const map = makeMap([[0, TileShapes.ID.SLOPE_BR, 0]]);
    const sunk = {x: 30, y: -50, width: 10, height: 74, BB: new BoundingBox(30, -50, 10, 74)};   // bottom at 24, surface under x=40 is y=10
    assert.equal(map.checkSolidTiles(sunk).collides, false);
    const hit = map.checkCollisions(sunk);
    assert.equal(hit.collides, true);
    assert.equal(hit.shape, TileShapes.ID.SLOPE_BR);

    const above = {x: 30, y: -80, width: 10, height: 74, BB: new BoundingBox(30, -80, 10, 74)};  // bottom at -6, well above
    assert.equal(map.checkCollisions(above).collides, false);
});

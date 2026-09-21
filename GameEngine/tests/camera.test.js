// Run with: node --test GameEngine/tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const Camera = require('../camera.js');
const {loadLevel} = require('./helpers/browserScripts.js');

const near = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `expected ${a} to be within ${tol} of ${b}`);

test('the game view is 76 x 41 tiles, and every original floor fits inside it', () => {
    assert.equal(Camera.VIEW_W, 1900);
    assert.equal(Camera.VIEW_H, 1025);
    for (let n = 0; n <= 16; n++) {
        const tiles = loadLevel(n).map.tiles;
        assert.ok(tiles[0].length * 25 <= Camera.VIEW_W, `floor ${n} is wider than the view`);
        assert.ok(tiles.length * 25 <= Camera.VIEW_H, `floor ${n} is taller than the view`);
    }
});

test('an original floor is shown whole with no scrolling, whatever the player does', () => {
    for (let n = 0; n <= 16; n++) {
        const tiles = loadLevel(n).map.tiles;
        const mapW = tiles[0].length * 25, mapH = tiles.length * 25;
        const cam = new Camera();
        for (const [cx, cy] of [[0, 0], [mapW, mapH], [mapW / 2, mapH / 2], [100, mapH - 30]]) {
            cam.snapTo(cx, cy, mapW, mapH);
            near(cam.x, (mapW - Camera.VIEW_W) / 2);
            near(cam.y, (mapH - Camera.VIEW_H) / 2);
            cam.follow(cx, cy, mapW, mapH, 1 / 60);
            near(cam.x, (mapW - Camera.VIEW_W) / 2);
            near(cam.y, (mapH - Camera.VIEW_H) / 2);
        }
    }
});

test('a floor exactly as wide as the view starts at x = 0 and is centred vertically when shorter', () => {
    const cam = new Camera();
    cam.snapTo(950, 300, 1900, 900);
    assert.equal(cam.x, 0);
    near(cam.y, (900 - 1025) / 2);      // 62.5px of border above and below
});

test('clampAxis keeps the view inside the level, or centres it when the level is smaller', () => {
    assert.equal(Camera.clampAxis(-50, 100, 500), 0);
    assert.equal(Camera.clampAxis(450, 100, 500), 400);
    assert.equal(Camera.clampAxis(200, 100, 500), 200);
    assert.equal(Camera.clampAxis(300, 100, 100), 0);
    assert.equal(Camera.clampAxis(300, 100, 40), -30);
});

test('on a big level the camera centres the player, and stops at the level edges', () => {
    const cam = new Camera();
    const mapW = 7500, mapH = 5000;
    cam.snapTo(3000, 2000, mapW, mapH);
    near(cam.x, 3000 - 950);
    near(cam.y, 2000 - 512.5);
    cam.snapTo(10, 10, mapW, mapH);                      // near the top-left corner
    assert.equal(cam.x, 0);
    assert.equal(cam.y, 0);
    cam.snapTo(mapW, mapH, mapW, mapH);                  // bottom-right corner
    near(cam.x, mapW - 1900);
    near(cam.y, mapH - 1025);
});

test('following eases toward the target and converges on it', () => {
    const cam = new Camera();
    cam.snapTo(1000, 1000, 5000, 5000);
    const start = cam.x;
    cam.follow(1300, 1000, 5000, 5000, 1 / 60);
    assert.ok(cam.x > start && cam.x < 1300 - 950, 'moved part of the way, not all of it');
    for (let f = 0; f < 200; f++) cam.follow(1300, 1000, 5000, 5000, 1 / 60);
    near(cam.x, 1300 - 950, 1e-3);
});

test('a target that moves faster than the easing is never allowed out of the middle of the view', () => {
    const cam = new Camera();
    const mapW = 8000, mapH = 20000;                     // tall enough that the level's bottom edge is never reached
    cam.snapTo(1000, 1000, mapW, mapH);
    let y = 1000;
    for (let f = 0; f < 300; f++) {
        y += 25;                                         // 1500px/s straight down, far quicker than the easing
        cam.follow(1000, y, mapW, mapH, 1 / 60);
        const onScreen = y - cam.y;
        const margin = Camera.VIEW_H * 0.3;
        assert.ok(onScreen >= margin - 1e-6 && onScreen <= Camera.VIEW_H - margin + 1e-6, `frame ${f}: target at ${onScreen.toFixed(1)}px of ${Camera.VIEW_H}`);
    }
});

test('following with no time passing (a stopped timer) does not move the camera', () => {
    const cam = new Camera();
    cam.snapTo(1000, 1000, 5000, 5000);
    const {x, y} = cam;
    cam.follow(1100, 1000, 5000, 5000, 0);               // still inside the middle of the view, so nothing needs correcting
    assert.equal(cam.x, x);
    assert.equal(cam.y, y);
});

test('screen and world coordinates convert both ways at any zoom', () => {
    const cam = new Camera(1000, 800);
    cam.x = 300;
    cam.y = 120;
    cam.zoom = 0.5;
    const w = cam.screenToWorld(200, 100);
    near(w.x, 700);
    near(w.y, 320);
    const s = cam.worldToScreen(w.x, w.y);
    near(s.x, 200);
    near(s.y, 100);
});

test('zooming keeps the world point under the cursor where it is', () => {
    const cam = new Camera(1000, 800);
    cam.x = 200;
    cam.y = 300;
    for (const factor of [1.25, 0.5, 2, 0.8]) {
        const before = cam.screenToWorld(420, 250);
        cam.zoomAt(420, 250, factor);
        const after = cam.screenToWorld(420, 250);
        near(after.x, before.x, 1e-6);
        near(after.y, before.y, 1e-6);
    }
});

test('zoom stays within its limits', () => {
    const cam = new Camera(1000, 800);
    for (let i = 0; i < 100; i++) cam.zoomAt(0, 0, 2);
    assert.equal(cam.zoom, Camera.MAX_ZOOM);
    for (let i = 0; i < 100; i++) cam.zoomAt(0, 0, 0.5);
    assert.equal(cam.zoom, Camera.MIN_ZOOM);
});

test('panning moves the world under the cursor by the screen distance dragged', () => {
    const cam = new Camera(1000, 800);
    cam.zoom = 2;
    const p = cam.screenToWorld(300, 300);
    cam.panBy(40, -20);
    const q = cam.screenToWorld(340, 280);
    near(q.x, p.x, 1e-9);
    near(q.y, p.y, 1e-9);
});

test('fit shows the whole level centred, and never magnifies a small one', () => {
    const cam = new Camera(1400, 900);
    cam.fit(7500, 7500);
    const v = cam.visibleRect();
    assert.ok(v.left < 0 && v.top < 0 && v.right > 7500 && v.bottom > 7500, 'the whole level is inside the view');
    near((v.left + v.right) / 2, 3750, 1e-6);
    near((v.top + v.bottom) / 2, 3750, 1e-6);
    cam.fit(500, 300);
    assert.equal(cam.zoom, 1);
    cam.fit(1900, 925);
    assert.ok(cam.zoom < 1 && cam.zoom > 0.6);
});

test('setZoom zooms about the centre of the view', () => {
    const cam = new Camera(1000, 800);
    cam.x = 100;
    cam.y = 100;
    const c = cam.screenToWorld(500, 400);
    cam.setZoom(2);
    assert.equal(cam.zoom, 2);
    const c2 = cam.screenToWorld(500, 400);
    near(c2.x, c.x, 1e-6);
    near(c2.y, c.y, 1e-6);
});

test('visibleRect covers the view, and the draw transform uses whole pixels', () => {
    const cam = new Camera(1000, 800);
    cam.x = 10.4;
    cam.y = 20.6;
    cam.zoom = 2;
    assert.deepEqual(cam.visibleRect(), {left: 10.4, top: 20.6, right: 10.4 + 500, bottom: 20.6 + 400});
    assert.deepEqual(cam.transform(), [2, 0, 0, 2, -21, -41]);
    cam.zoom = 1;
    assert.deepEqual(cam.transform(), [1, 0, 0, 1, -10, -21]);
});

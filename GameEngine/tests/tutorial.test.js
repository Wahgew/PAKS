// The tutorial's own rules (pure logic). The level itself, and the walkthrough that proves it can be finished,
// are tested in tutorial-level.test.js; how it is wired into the game is in tutorial-flow.test.js.
const test = require('node:test');
const assert = require('node:assert/strict');
const Tutorial = require('../tutorial.js');

// A stand-in for localStorage
const memory = (initial = {}) => {
    const data = {...initial};
    return {getItem: k => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); }, removeItem: k => { delete data[k]; }, data};
};
// A browser that refuses all storage (private window, site data blocked)
const blocked = () => new Proxy({}, {get: () => () => { throw new Error('SecurityError'); }});

test('the tutorial is not done until it is marked, and clear() makes it new again', () => {
    const s = memory();
    assert.equal(Tutorial.isDone(s), false);
    assert.equal(Tutorial.markDone(s), true);
    assert.equal(Tutorial.isDone(s), true);
    assert.equal(Tutorial.clear(s), true);
    assert.equal(Tutorial.isDone(s), false);
    assert.deepEqual(s.data, {}, 'clear removes the key rather than storing "0"');
});

test('a first Start on a fresh profile auto-starts the tutorial', () => {
    assert.equal(Tutorial.shouldAutoStart(memory(), null), true, 'no saved progress at all');
    assert.equal(Tutorial.shouldAutoStart(memory(), {unlockedLevels: [1], completedLevels: []}), true);
});

test('once done (finished or skipped) it never auto-starts again', () => {
    const s = memory();
    Tutorial.markDone(s);
    assert.equal(Tutorial.shouldAutoStart(s, null), false);
    assert.equal(Tutorial.shouldAutoStart(s, {completedLevels: []}), false);
});

test('a player who already finished floors before the tutorial existed is not sent to it', () => {
    assert.equal(Tutorial.shouldAutoStart(memory(), {completedLevels: [1]}), false);
    assert.equal(Tutorial.shouldAutoStart(memory(), {completedLevels: [1, 2, 3]}), false);
});

test('reset progress (clear) brings the auto-start back for a fresh profile', () => {
    const s = memory();
    Tutorial.markDone(s);
    assert.equal(Tutorial.shouldAutoStart(s, {completedLevels: []}), false);
    Tutorial.clear(s);
    assert.equal(Tutorial.shouldAutoStart(s, {completedLevels: []}), true);
});

test('malformed saved progress is treated as no progress', () => {
    for (const progress of [undefined, {}, {completedLevels: null}, {completedLevels: 'x'}]) {
        assert.equal(Tutorial.shouldAutoStart(memory(), progress), true, JSON.stringify(progress));
    }
});

test('when the browser cannot store anything, nothing throws and the tutorial is not forced on every Start', () => {
    const s = blocked();
    assert.equal(Tutorial.isDone(s), false);
    assert.equal(Tutorial.markDone(s), false);
    assert.equal(Tutorial.clear(s), false);
    assert.equal(Tutorial.shouldAutoStart(s, null), false);
});

test('any stored value other than "1" does not count as done', () => {
    assert.equal(Tutorial.isDone(memory({[Tutorial.STORAGE_KEY]: '0'})), false);
    assert.equal(Tutorial.isDone(memory({[Tutorial.STORAGE_KEY]: 'true'})), false);
});

test('the tutorial lives outside the numbered floors', () => {
    assert.equal(Number.isNaN(Number(Tutorial.LEVEL_KEY)), true, 'a numeric key could collide with a floor');
    assert.match(Tutorial.FILE, /^levels\/tutorial\.json$/);
});

test('storage() gives localStorage, or null when it is missing or refuses to be read', () => {
    const saved = global.window;
    try {
        global.window = {localStorage: memory()};
        assert.equal(Tutorial.storage(), global.window.localStorage);
        global.window = {};
        assert.equal(Tutorial.storage(), null);
        global.window = {get localStorage() { throw new Error('SecurityError'); }};
        assert.equal(Tutorial.storage(), null, 'reading localStorage itself can throw');
        // and null is safe to hand to everything else
        assert.equal(Tutorial.isDone(null), false);
        assert.equal(Tutorial.markDone(null), false);
        assert.equal(Tutorial.clear(null), false);
        assert.equal(Tutorial.shouldAutoStart(null, null), false, 'no way to remember it, so do not force it on every Start');
    } finally {
        if (saved === undefined) delete global.window; else global.window = saved;
    }
});

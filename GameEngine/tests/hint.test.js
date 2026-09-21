// Hint is the sign the tutorial is made of. Its text layout is pure (no canvas needed), and the rest is checked
// against the real LevelLoader and LevelModel so the editor, the file format and the game agree about it.
const test = require('node:test');
const assert = require('node:assert/strict');
const {loadBrowserScripts} = require('./helpers/browserScripts.js');
const M = require('../levelModel.js');

const get = loadBrowserScripts(['boundingBox.js', 'hint.js', 'levelLoader.js'], {
    window: {},
    console: {log() {}, warn: console.warn, error: console.error},
});
const Hint = get('Hint');
const LevelLoader = get('LevelLoader');

const plain = v => JSON.parse(JSON.stringify(v));
const mono = s => s.length * 10;   // every glyph 10px wide, like the monospace the sign uses
const words = line => line.map(p => p.text).join(' ');

test('layout wraps words to the width, and parts carry their x from the start of the line', () => {
    const lines = Hint.layout('one two three four', mono, 90);
    assert.deepEqual(plain(lines.map(words)), ['one two', 'three', 'four']);
    assert.deepEqual(plain(lines[0].map(p => [p.x, p.w])), [[0, 30], [40, 30]], 'a space (10px) sits between words');
    assert.ok(lines.every(l => l.at(-1).x + l.at(-1).w <= 90), 'no line is wider than the box');
});

test('a [Key] becomes a key cap that is wider than its label, and stays glued to punctuation around it', () => {
    const [line] = Hint.layout('Press [Shift] now', mono, 500);
    assert.deepEqual(plain(line.map(p => p.key)), [false, true, false]);
    assert.equal(line[1].text, 'Shift', 'the brackets are not drawn');
    assert.equal(line[1].w, 50 + Hint.KEY_PAD * 2);

    const [combo] = Hint.layout('[A]/[D]', mono, 500);
    assert.deepEqual(plain(combo.map(p => p.text)), ['A', '/', 'D']);
    assert.equal(combo[1].x, combo[0].x + combo[0].w, 'no gap where the text had no space');
    assert.equal(combo[2].x, combo[1].x + combo[1].w);
});

test('layout edge cases: empty text, extra whitespace and a word wider than the box', () => {
    assert.deepEqual(plain(Hint.layout('', mono, 100)), []);
    assert.deepEqual(plain(Hint.layout('   ', mono, 100)), []);
    assert.deepEqual(plain(Hint.layout('  a   b  ', mono, 100).map(words)), ['a b']);
    const long = Hint.layout('tiny extraordinarily tiny', mono, 60);
    assert.deepEqual(plain(long.map(words)), ['tiny', 'extraordinarily', 'tiny'], 'the long word gets its own line instead of being cut');
});

function build(desc) {
    const loader = new LevelLoader();
    loader.store(0, plain({map: {tiles: [[0]]}, player: {x: 0, y: 0}, exitDoor: {x: 0, y: 0}, entities: [desc]}));
    const game = {keys: {}, options: {}, clockTick: 1 / 60};
    return {game, hint: loader.getLevelEntities(0, game, 25).hazards()[0]};
}

test('the loader builds a Hint whose box is exactly the one the editor model draws', () => {
    const desc = M.makeEntity('Hint', 120, 340, {w: 310, h: 96, text: 'Jump with [W]'});
    assert.deepEqual(M.validate({...M.createBlank(), entities: [desc]}).errors, []);
    const {hint} = build(desc);
    assert.equal(hint.constructor.name, 'Hint');
    assert.equal(hint.text, 'Jump with [W]');
    assert.deepEqual(plain({x: hint.BB.x, y: hint.BB.y, w: hint.BB.width, h: hint.BB.height}), plain(M.boundsFor('Hint', desc)));
});

test('a Hint needs a size and text: the model reports what is missing', () => {
    const level = M.createBlank();
    level.entities.push({type: 'Hint', x: 10, y: 10, text: 5});
    const messages = M.validate(level).errors.map(e => e.message);
    assert.ok(messages.some(m => /missing w/.test(m)), messages.join('; '));
    assert.ok(messages.some(m => /missing h/.test(m)));
    assert.ok(messages.some(m => /text must be text/.test(m)));
});

test('a Hint round-trips through the canonical file format on one line', () => {
    const level = M.createBlank(6, 4);
    level.entities.push(M.makeEntity('Hint', 30, 40, {text: 'Say "hi" [S]'}));
    const text = M.serialize(level);
    assert.equal(text.split('\n').filter(l => /^ {4}\{ "type": "Hint"/.test(l)).length, 1);
    assert.deepEqual(JSON.parse(text), level);
});

test('a sign brightens as the player comes near and dims again when they leave', () => {
    const {game, hint} = build(M.makeEntity('Hint', 500, 500, {w: 200, h: 80}));
    const far = hint.glow;
    game.Player = {x: 520, y: 480, width: 20, height: 74};   // beside the sign
    for (let i = 0; i < 60; i++) hint.update();
    assert.ok(hint.glow > 0.99, `glow ${hint.glow}`);
    game.Player = {x: 50, y: 50, width: 20, height: 74};
    for (let i = 0; i < 60; i++) hint.update();
    assert.ok(Math.abs(hint.glow - far) < 0.01, `glow ${hint.glow}`);
    game.Player = null;                                        // the editor has no player
    assert.doesNotThrow(() => hint.update());
});

test('draw writes the words and a key cap for each [Key], without any player or editor', () => {
    const {game, hint} = build(M.makeEntity('Hint', 0, 0, {w: 400, h: 90, text: 'Hold [Shift] to run'}));
    const calls = [];
    const ctx = new Proxy({measureText: s => ({width: s.length * 13})}, {
        get: (t, k) => k in t ? t[k] : (...a) => { calls.push([k, a]); },
        set: (t, k, v) => { t[k] = v; return true; },
    });
    hint.draw(ctx);
    const said = calls.filter(([k]) => k === 'fillText').map(([, a]) => a[0]);
    assert.deepEqual(said, ['Hold', 'Shift', 'to', 'run']);
    assert.equal(calls.filter(([k]) => k === 'roundRect').length, 2, 'one for the panel and one for the key cap');

    game.editor = {mode: 'edit'};
    hint.draw(ctx);
    assert.equal(ctx.globalAlpha, 1, 'editing: every sign at full strength');
});

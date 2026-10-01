// Run with: node --test GameEngine/tests/
// The menus' SVG artwork (uiArt.js): real text, no images, well-formed markup.
const test = require('node:test');
const assert = require('node:assert/strict');
const UIArt = require('../uiArt.js');

// Every opened tag is closed (or self-closing), in order: enough to catch a broken builder
function wellFormed(markup) {
    const stack = [];
    for (const m of markup.matchAll(/<(\/?)([a-zA-Z]+)[^>]*?(\/?)>/g)) {
        const [, closing, name, selfClosing] = m;
        if (selfClosing) continue;
        if (closing) {
            if (stack.pop() !== name) return false;
        } else {
            stack.push(name);
        }
    }
    return stack.length === 0;
}

test('the title background is SVG with the logo as text and no images', () => {
    const s = UIArt.titleBackground();
    assert.ok(s.startsWith('<svg'));
    assert.ok(wellFormed(s));
    assert.match(s, />P\.A\.K\.S<\/text>/);
    assert.doesNotMatch(s, /<image|url\(/);
    assert.equal((s.match(/<circle/g) || []).length, 4, 'the row of rings');
});

test('a star button carries its label as text, an accessible name, and its rotation', () => {
    const s = UIArt.starButton('ABOUT\nME', {rotate: 40, textRotate: -4, size: 130});
    assert.ok(wellFormed(s));
    assert.match(s, /aria-label="ABOUT ME"/);
    assert.match(s, />ABOUT<\/text>.*>ME<\/text>/);
    assert.match(s, /rotate\(40 50 50\)/);
    assert.match(s, /rotate\(-4 50 50\)/);
    assert.match(s, /width="130"/);
    // The label follows the star only up to 15° unless told otherwise
    assert.match(UIArt.starButton('START', {rotate: 40}), /<g transform="rotate\(15 50 50\)">/);
});

test('a gear is a single even-odd path with its hole', () => {
    const g = UIArt.gear(10, 10, 16, 8, '#c8363a');
    assert.ok(wellFormed(g));
    assert.match(g, /fill-rule="evenodd"/);
});

test('every Levels-screen piece is well-formed SVG with no images', () => {
    const pieces = {
        scene: UIArt.levelsScene(), floor: UIArt.floorButton(), padlock: UIArt.padlock(), toxic: UIArt.toxicSign(),
        radiation: UIArt.radiationSign(), caution: UIArt.cautionSign(), paks: UIArt.paksSign(), header: UIArt.clickLevelsHeader(),
        reset: UIArt.panelButton('RESET LEVELS', 'reset'), menu: UIArt.menuIcon(),
    };
    for (const [name, s] of Object.entries(pieces)) {
        assert.ok(s.startsWith('<svg') && wellFormed(s), name);
        assert.doesNotMatch(s, /<image|sprites\//, name);
    }
});

test('the scene has all twelve floor keys and their dots, in the old picture\'s coordinates', () => {
    const s = UIArt.levelsScene();
    assert.match(s, /viewBox="0 0 1800 1080"/);
    for (let f = 2; f <= 12; f++) assert.match(s, new RegExp(`>${f}</text>`), `key ${f}`);
    assert.equal((s.match(/r="18" fill="#0b0b0b"/g) || []).length, 14, '12 floors and the two navigation keys');
});

test('a panel button\'s label is narrowed to fit beside its icon', () => {
    const size = s => Number(s.match(/font-size="(\d+)"[^>]*>[A-Z ]+<\/text>/)[1]);
    const short = UIArt.panelButton('HOME', 'home', {width: 144, height: 51});
    const long = UIArt.panelButton('RESET LEVELS', 'reset', {width: 215, height: 54});
    assert.equal(size(short), Math.round(51 * 0.44), 'a short label gets the full size');
    assert.ok(size(long) * 0.6 * 'RESET LEVELS'.length <= 215 - 54 * 0.62 - 30 + 1, 'a long one fits');
});

test('dataUri wraps markup as a CSS url', () => {
    assert.match(UIArt.dataUri('<svg/>'), /^url\("data:image\/svg\+xml;charset=utf-8,%3Csvg%2F%3E"\)$/);
});

test('the instructions sheet is real text, with a drawing for every picture it asks for and no images', () => {
    const s = UIArt.instructionsSheet();
    assert.match(s, /ELEVATOR INSTRUCTIONS/);
    assert.match(s, /W \/ SPACE = JUMP/);
    assert.match(s, /WATCH OUT FOR THE HAZARDS/, 'spelt right (the old picture said HARZARDS)');
    assert.doesNotMatch(s, /<img|sprites\//);
    const arts = [...s.matchAll(/data-art="([\w-]+)"/g)].map(m => m[1]);
    assert.deepEqual(arts.sort(), Object.keys(UIArt.INSTRUCTION_ART).sort());
});

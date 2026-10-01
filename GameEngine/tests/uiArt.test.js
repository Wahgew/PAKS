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

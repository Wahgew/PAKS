// The level files are kept in the editor's canonical layout (one tile row and one entity per line), so a diff
// shows what changed and saving from the editor never rewrites a whole file. If this fails, run
//   node scripts/format-levels.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const LevelModel = require('../levelModel.js');

const dir = path.join(__dirname, '..', 'levels');

test('every level file is in the canonical format', () => {
    const files = fs.readdirSync(dir).filter(f => /^(level_\d+|tutorial)\.json$/.test(f));
    assert.equal(files.length, 18, '17 numbered floors and the tutorial');
    for (const name of files) {
        // git on Windows may check files out with CRLF; the layout is what matters
        const text = fs.readFileSync(path.join(dir, name), 'utf8').replace(/\r\n/g, '\n');
        assert.equal(text, LevelModel.serialize(JSON.parse(text)), `${name} is not canonical: run node scripts/format-levels.js`);
    }
});

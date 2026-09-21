#!/usr/bin/env node
// Rewrites GameEngine/levels/level_XX.json in the canonical format the level editor saves (one tile row and one
// entity per line), so a diff of a level shows exactly what changed. Data is never altered, only its layout.
//
//   node scripts/format-levels.js           rewrite every level file
//   node scripts/format-levels.js --check   change nothing; exit 1 if any file is not already canonical
const fs = require('fs');
const path = require('path');
const LevelModel = require('../GameEngine/levelModel.js');

const dir = path.join(__dirname, '..', 'GameEngine', 'levels');
const check = process.argv.includes('--check');
let stale = 0;

for (const name of fs.readdirSync(dir).filter(f => /^level_\d+\.json$/.test(f)).sort()) {
    const file = path.join(dir, name);
    const before = fs.readFileSync(file, 'utf8');
    const after = LevelModel.serialize(JSON.parse(before));
    // Compare ignoring line endings: git on Windows may check the files out with CRLF
    if (before.replace(/\r\n/g, '\n') === after) continue;
    stale++;
    if (check) {
        console.log(`not canonical: ${name}`);
    } else {
        fs.writeFileSync(file, after);
        console.log(`formatted ${name}`);
    }
}

if (check && stale > 0) {
    console.log(`${stale} file(s) need formatting. Run: node scripts/format-levels.js`);
    process.exit(1);
}
if (stale === 0) console.log('all level files are already canonical');

// Loads the game's plain <script> files into one Node vm context, in the order given, so classes that are
// globals in the browser (drawMap, Player, ...) can be exercised without a browser or a build step.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');

function loadBrowserScripts(files, globals = {}) {
    const context = vm.createContext({console, Math, Date, ...globals});
    for (const file of files) {
        vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), context, {filename: file});
    }
    // Top-level class/const declarations aren't properties of the vm global, so read them by name.
    return name => vm.runInContext(name, context);
}

function loadLevel(n) {
    const file = path.join(ROOT, 'levels', `level_${String(n).padStart(2, '0')}.json`);
    return JSON.parse(fs.readFileSync(file, 'utf8'));
}

module.exports = {loadBrowserScripts, loadLevel};

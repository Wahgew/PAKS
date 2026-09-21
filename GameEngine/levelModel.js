/**
 * LevelModel: pure logic for level data, shared by the in-browser level editor and the tests.
 *
 * No DOM or game dependencies, so it loads as a plain <script> in the browser (global `LevelModel`) and via
 * require() in Node. It only needs TileShapes (loaded first in index.html).
 *
 * A level is the same plain object the level JSON files hold, and this module never changes that shape:
 *   { map: {tiles: number[][]}, player: {x, y}, exitDoor: {x, y, levers}, entities: [{type, x, y, ...}] }
 * Unknown fields are kept as they are, so a level round-trips through the editor untouched.
 *
 * What lives here: the per-type field schema (drives the inspector and validation), entity sizes and
 * hit-testing, tile and entity edits, undo history, validation, and the canonical file format.
 */
const LevelModel = (() => {
    const Shapes = (typeof TileShapes !== 'undefined') ? TileShapes : require('./tileShapes.js');

    const TILE_SIZE = 25;                 // same as LevelConfig.TILE_SIZE
    const DEFAULT_COLS = 76;              // the main floors are 76 tiles wide
    const DEFAULT_ROWS = 37;
    const PLAYER_SIZE = {w: 20, h: 74};   // player.js
    const EXIT_SIZE = {w: 69, h: 81.5};   // exitDoor.js: a 276x326 sprite drawn at scale 0.25
    const DIRECTIONS = ['UP', 'DOWN', 'LEFT', 'RIGHT'];

    // ---- Field schema ----------------------------------------------------------------------------------
    // kind: number | bool | enum | text. `required` fields must exist for the level loader to build the entity;
    // the rest fall back to the entity class's own default, so a missing one is not an error.

    const num = (key, label, def, extra = {}) => ({key, label, kind: 'number', default: def, ...extra});
    const bool = (key, label, def) => ({key, label, kind: 'bool', default: def});
    const oneOf = (key, label, options, def, extra = {}) => ({key, label, kind: 'enum', options, default: def, ...extra});
    const text = (key, label, def) => ({key, label, kind: 'text', default: def});

    const X = num('x', 'X', 0, {required: true});
    const Y = num('y', 'Y', 0, {required: true});
    const MOVEMENT = [
        num('speed', 'Speed', 0, {min: 0}),
        bool('moving', 'Moving', false),
        oneOf('direction', 'Direction', DIRECTIONS, null, {nullable: true}),
        num('reverseTime', 'Reverse after (s)', 0, {min: 0}),
    ];

    /**
     * Per entity type: a label, the editable `fields`, and `bounds(desc)`, the box the entity occupies, taken from
     * the entity classes. A test compares those boxes with the real classes so they can't drift.
     */
    const TYPES = {
        Spike: {
            label: 'Spike',
            fields: [X, Y, ...MOVEMENT, bool('tracking', 'Tracks player', false)],
            bounds: d => ({x: d.x, y: d.y, w: 40, h: 40}),
        },
        ProjectileLauncher: {
            label: 'Launcher',
            fields: [X, Y, ...MOVEMENT,
                num('atkspd', 'Shoots every (s)', 2, {min: 0.1, required: true}),
                num('projspd', 'Projectile speed', 100, {min: 0, required: true}),
                oneOf('shotdirec', 'Shoots', DIRECTIONS, 'LEFT', {required: true})],
            bounds: d => ({x: d.x, y: d.y, w: 58, h: 54}),
        },
        GlowingLaser: {
            label: 'Laser',
            fields: [X, Y,
                oneOf('direction', 'Orientation', ['HORIZONTAL', 'VERTICAL', 'LEFT', 'RIGHT', 'UP', 'DOWN'], 'HORIZONTAL', {required: true}),
                oneOf('flow', 'Beam runs', DIRECTIONS, 'RIGHT', {optional: true}),
                num('length', 'Length', 300, {min: 1}),
                text('color', 'Colour', 'red'),
                text('glowColor', 'Glow colour', 'rgba(255, 0, 0, 0.5)'),
                num('width', 'Beam width', 8, {min: 1}),
                num('glowWidth', 'Glow width', 20, {min: 1})],
            bounds: d => {
                // Mirrors GlowingLaser: the orientation comes from `direction`, the sense from `flow`
                const dir = d.direction;
                const horizontal = !(dir === 'VERTICAL' || dir === 'UP' || dir === 'DOWN');
                const flow = d.flow || d.direction || 'RIGHT';
                const length = d.length || 500;
                const beam = d.width || 8;
                if (horizontal) {
                    const x = flow === 'LEFT' ? d.x - length : d.x;
                    return {x, y: d.y - beam / 2, w: length, h: beam};
                }
                const y = flow === 'UP' ? d.y - length : d.y;
                return {x: d.x - beam / 2, y, w: beam, h: length};
            },
        },
        Laser: {
            label: 'Laser (old)',
            legacy: true,   // only level 0 uses it; kept editable but not offered in the palette
            fields: [X, Y, ...MOVEMENT,
                oneOf('shotdirec', 'Shoots', DIRECTIONS, 'RIGHT', {required: true}),
                num('length', 'Length', 300, {min: 1, required: true})],
            bounds: d => ({x: d.x, y: d.y - 7.5, w: d.length, h: 15}),
        },
        BigBlock: {
            label: 'Big block',
            fields: [num('x', 'X', 0, {required: true}), num('y', 'Y', 0, {required: true}),
                num('x2', 'Right X', 100, {required: true}), num('y2', 'Bottom Y', 100, {required: true})],
            bounds: d => ({x: d.x, y: d.y, w: d.x2 - d.x, h: d.y2 - d.y}),
        },
        Platform: {
            label: 'Platform',
            // level 16 platforms carry speedMin/speedMax instead of speed; those extra fields are kept as they are
            fields: [X, Y, ...MOVEMENT, oneOf('size', 'Size', ['SHORT', 'WIDE'], 'SHORT', {required: true})],
            bounds: d => ({x: d.x, y: d.y, w: d.size === 'WIDE' ? 450 : 225, h: 20}),
        },
        Lever: {
            label: 'Lever',
            fields: [X, Y, ...MOVEMENT],
            bounds: d => ({x: d.x, y: d.y, w: 23, h: 53}),
        },
    };

    const ENTITY_TYPE_NAMES = Object.keys(TYPES);

    /** Fields the inspector shows for the exit door and the player spawn. */
    const EXIT_FIELDS = [num('x', 'X', 0, {required: true}), num('y', 'Y', 0, {required: true}),
        num('levers', 'Levers needed', 0, {min: 0, integer: true, required: true})];
    const PLAYER_FIELDS = [num('x', 'X', 0, {required: true}), num('y', 'Y', 0, {required: true})];

    /** Box of an entity, the player spawn ('Player') or the exit door ('ExitDoor'). Unknown types get a marker box. */
    function boundsFor(type, d) {
        if (type === 'Player') return {x: d.x, y: d.y, w: PLAYER_SIZE.w, h: PLAYER_SIZE.h};
        if (type === 'ExitDoor') return {x: d.x, y: d.y, w: EXIT_SIZE.w, h: EXIT_SIZE.h};
        const def = TYPES[type];
        if (!def) return {x: d.x || 0, y: d.y || 0, w: 20, h: 20};
        const b = def.bounds(d);
        // BigBlock stores two corners; normalise a block dragged the "wrong" way round
        return {x: Math.min(b.x, b.x + b.w), y: Math.min(b.y, b.y + b.h), w: Math.abs(b.w), h: Math.abs(b.h)};
    }

    // ---- Entities ------------------------------------------------------------------------------------------

    /**
     * A new entity with every field the JSON files normally carry, in a stable key order. `overrides` win.
     * The fields listed as `optional` (a laser's `flow`) are left out: the loader falls back to its own default.
     */
    function makeEntity(type, x, y, overrides = {}) {
        const def = TYPES[type];
        if (!def) throw new Error(`Unknown entity type ${type}`);
        const e = {type};
        for (const f of def.fields) {
            if (f.optional) continue;
            e[f.key] = f.key === 'x' ? x : f.key === 'y' ? y : f.default;
        }
        if (type === 'BigBlock') {
            e.x2 = x + 100;
            e.y2 = y + 100;
        }
        return Object.assign(e, overrides);
    }

    /** The descriptor a reference points at. `ref` is {kind: 'player'|'exit'|'entity', index?}. */
    function resolve(level, ref) {
        if (!ref) return null;
        if (ref.kind === 'player') return level.player;
        if (ref.kind === 'exit') return level.exitDoor;
        return level.entities[ref.index] || null;
    }

    function refType(level, ref) {
        if (ref.kind === 'player') return 'Player';
        if (ref.kind === 'exit') return 'ExitDoor';
        return level.entities[ref.index].type;
    }

    /**
     * The thing under a pixel, or null. Several things can overlap (a laser beam across a big block), so the
     * smallest box wins, and among equals the one drawn last. `pad` makes thin things such as beams grabbable.
     */
    function pick(level, px, py, pad = 3) {
        let best = null, bestArea = Infinity;
        const consider = (ref, b) => {
            if (px < b.x - pad || px > b.x + b.w + pad || py < b.y - pad || py > b.y + b.h + pad) return;
            const area = Math.max(b.w, 1) * Math.max(b.h, 1);
            if (area <= bestArea) {
                best = ref;
                bestArea = area;
            }
        };
        consider({kind: 'exit'}, boundsFor('ExitDoor', level.exitDoor));
        level.entities.forEach((e, index) => consider({kind: 'entity', index}, boundsFor(e.type, e)));
        consider({kind: 'player'}, boundsFor('Player', level.player));
        return best;
    }

    /** Move an entity so its box's top-left is at (x, y). Big blocks keep their size. */
    function moveTo(level, ref, x, y) {
        const d = resolve(level, ref);
        if (!d) return;
        const dx = x - d.x, dy = y - d.y;
        d.x = x;
        d.y = y;
        if (d.type === 'BigBlock') {
            d.x2 += dx;
            d.y2 += dy;
        }
    }

    function removeEntity(level, index) {
        return level.entities.splice(index, 1)[0];
    }

    /** Copy an entity `offset` pixels down and right of the original. Returns the new index. */
    function duplicateEntity(level, index, offset = TILE_SIZE) {
        const copy = JSON.parse(JSON.stringify(level.entities[index]));
        level.entities.push(copy);
        const ref = {kind: 'entity', index: level.entities.length - 1};
        moveTo(level, ref, copy.x + offset, copy.y + offset);
        return ref.index;
    }

    const snap = (value, step) => step > 1 ? Math.round(value / step) * step : Math.round(value);

    function countLevers(level) {
        return level.entities.filter(e => e.type === 'Lever').length;
    }

    // ---- Tiles ------------------------------------------------------------------------------------------------

    const rows = level => level.map.tiles.length;
    const cols = level => level.map.tiles[0] ? level.map.tiles[0].length : 0;
    const inBounds = (level, c, r) => r >= 0 && r < rows(level) && c >= 0 && c < cols(level);
    const tileAt = (level, c, r) => inBounds(level, c, r) ? level.map.tiles[r][c] : null;

    /** Set one tile. Returns true if it changed. */
    function setTile(level, c, r, id) {
        if (!inBounds(level, c, r) || level.map.tiles[r][c] === id) return false;
        level.map.tiles[r][c] = id;
        return true;
    }

    /** Fill (or, with `hollow`, outline) the rectangle between two tiles, corners in any order. Returns tiles changed. */
    function fillRect(level, c0, r0, c1, r1, id, hollow = false) {
        const [ca, cb] = [Math.min(c0, c1), Math.max(c0, c1)];
        const [ra, rb] = [Math.min(r0, r1), Math.max(r0, r1)];
        let changed = 0;
        for (let r = Math.max(ra, 0); r <= Math.min(rb, rows(level) - 1); r++) {
            for (let c = Math.max(ca, 0); c <= Math.min(cb, cols(level) - 1); c++) {
                if (hollow && r !== ra && r !== rb && c !== ca && c !== cb) continue;
                if (setTile(level, c, r, id)) changed++;
            }
        }
        return changed;
    }

    /** Replace the connected (4-way) region of identical tiles around (c, r). Returns tiles changed. */
    function floodFill(level, c, r, id) {
        if (!inBounds(level, c, r)) return 0;
        const from = level.map.tiles[r][c];
        if (from === id) return 0;
        let changed = 0;
        const stack = [[c, r]];
        while (stack.length) {
            const [cc, rr] = stack.pop();
            if (!inBounds(level, cc, rr) || level.map.tiles[rr][cc] !== from) continue;
            level.map.tiles[rr][cc] = id;
            changed++;
            stack.push([cc + 1, rr], [cc - 1, rr], [cc, rr + 1], [cc, rr - 1]);
        }
        return changed;
    }

    /** Solid outer ring, the way every floor is framed. */
    function addBorder(level) {
        return fillRect(level, 0, 0, cols(level) - 1, rows(level) - 1, Shapes.ID.SOLID, true);
    }

    /**
     * What resizing to `newCols` x `newRows` (anchored top-left) would throw away: non-empty tiles cut off, and
     * entities, spawn or exit left outside the new area.
     */
    function previewResize(level, newCols, newRows) {
        let lostTiles = 0;
        level.map.tiles.forEach((row, r) => row.forEach((id, c) => {
            if (id !== 0 && (c >= newCols || r >= newRows)) lostTiles++;
        }));
        const w = newCols * TILE_SIZE, h = newRows * TILE_SIZE;
        const outside = (type, d) => {
            const b = boundsFor(type, d);
            return b.x >= w || b.y >= h;
        };
        let lostEntities = level.entities.filter(e => outside(e.type, e)).length;
        if (outside('Player', level.player)) lostEntities++;
        if (outside('ExitDoor', level.exitDoor)) lostEntities++;
        return {lostTiles, lostEntities};
    }

    /** Grow or shrink the grid, anchored top-left. New tiles are empty. Entities are not moved or removed. */
    function resize(level, newCols, newRows) {
        const old = level.map.tiles;
        level.map.tiles = Array.from({length: newRows}, (_, r) =>
            Array.from({length: newCols}, (_, c) => (old[r] && old[r][c] !== undefined) ? old[r][c] : 0));
    }

    /** A new empty level: solid border, the player at the bottom left, the exit at the bottom right. */
    function createBlank(numCols = DEFAULT_COLS, numRows = DEFAULT_ROWS) {
        const level = {
            map: {tiles: Array.from({length: numRows}, () => new Array(numCols).fill(0))},
            player: {x: 2 * TILE_SIZE, y: (numRows - 1) * TILE_SIZE - PLAYER_SIZE.h},
            exitDoor: {x: (numCols - 4) * TILE_SIZE, y: (numRows - 1) * TILE_SIZE - Math.ceil(EXIT_SIZE.h), levers: 0},
            entities: [],
        };
        addBorder(level);
        return level;
    }

    // ---- Tile palette ----------------------------------------------------------------------------------------

    /** Tile ids grouped for the editor palette. A test checks every known id appears exactly once. */
    function paletteGroups() {
        const I = Shapes.ID;
        const four = base => [base, base + 1, base + 2, base + 3];
        return [
            {label: 'Basic', ids: [I.EMPTY, I.SOLID]},
            {label: '45° slopes', ids: four(I.SLOPE_BL)},
            {label: 'Gentle slopes, high half', ids: four(I.GENTLE_HIGH_BL)},
            {label: 'Gentle slopes, low half', ids: four(I.GENTLE_LOW_BL)},
            {label: 'Steep slopes, tip', ids: four(I.STEEP_TIP_BL)},
            {label: 'Steep slopes, base', ids: four(I.STEEP_BASE_BL)},
            {label: 'Rounded shoulders', ids: four(I.CONVEX_BL)},
            {label: 'Quarter-pipes', ids: four(I.CONCAVE_BL)},
        ];
    }

    function tileName(id) {
        if (id === Shapes.ID.EMPTY) return 'Empty';
        if (id === Shapes.ID.SOLID) return 'Block';
        const shape = Shapes.all().find(s => s.id === id);
        return shape ? shape.name : `Unknown (${id})`;
    }

    // ---- History ------------------------------------------------------------------------------------------------

    const clone = level => JSON.parse(JSON.stringify(level));

    /**
     * Undo/redo by snapshot: levels are a few thousand numbers, so copying is cheaper than being clever.
     * Call record(level) BEFORE changing the level; undo/redo hand back the level to switch to (or null).
     */
    class History {
        constructor(limit = 100) {
            this.limit = limit;
            this.past = [];
            this.future = [];
        }

        record(level) {
            this.past.push(clone(level));
            if (this.past.length > this.limit) this.past.shift();
            this.future.length = 0;
        }

        undo(current) {
            if (this.past.length === 0) return null;
            this.future.push(clone(current));
            return this.past.pop();
        }

        redo(current) {
            if (this.future.length === 0) return null;
            this.past.push(clone(current));
            return this.future.pop();
        }

        clear() {
            this.past.length = 0;
            this.future.length = 0;
        }

        get canUndo() { return this.past.length > 0; }
        get canRedo() { return this.future.length > 0; }
    }

    // ---- Validation ------------------------------------------------------------------------------------------------

    const isNum = v => typeof v === 'number' && Number.isFinite(v);
    const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);

    function checkField(f, value, where, errors) {
        if (value === undefined) {
            if (f.required) errors.push({path: where, message: `missing ${f.key}`});
            return;
        }
        if (value === null) {
            if (!f.nullable) errors.push({path: where, message: `${f.key} is null`});
            return;
        }
        switch (f.kind) {
            case 'number':
                if (!isNum(value)) errors.push({path: where, message: `${f.key} must be a number`});
                else if (f.min !== undefined && value < f.min) errors.push({path: where, message: `${f.key} must be at least ${f.min}`});
                else if (f.integer && !Number.isInteger(value)) errors.push({path: where, message: `${f.key} must be a whole number`});
                break;
            case 'bool':
                if (typeof value !== 'boolean') errors.push({path: where, message: `${f.key} must be true or false`});
                break;
            case 'enum':
                if (!f.options.includes(value)) errors.push({path: where, message: `${f.key} must be one of ${f.options.join(', ')} (got ${JSON.stringify(value)})`});
                break;
            case 'text':
                if (typeof value !== 'string') errors.push({path: where, message: `${f.key} must be text`});
                break;
        }
    }

    /**
     * True if a box overlaps something solid: a full block tile, a slope shape, or a big block that is really solid
     * (a reversed one has a negative-size box in the game, so it never collides). The engine pushes a player out of
     * whatever they spawn inside, so this is a data mistake, not a crash: stand the spawn on top of the thing instead.
     */
    function overlapsSolid(level, box, entities) {
        const tiles = level.map.tiles;
        const b = {left: box.x, top: box.y, right: box.x + box.w, bottom: box.y + box.h};
        const inside = (l, t, r, bt) => Math.min(b.right, r) - Math.max(b.left, l) > 0 && Math.min(b.bottom, bt) - Math.max(b.top, t) > 0;
        for (let r = Math.max(0, Math.floor(b.top / TILE_SIZE)); r <= Math.floor(b.bottom / TILE_SIZE); r++) {
            for (let c = Math.max(0, Math.floor(b.left / TILE_SIZE)); c <= Math.floor(b.right / TILE_SIZE); c++) {
                if (tiles[r] && tiles[r][c] === Shapes.ID.SOLID && inside(c * TILE_SIZE, r * TILE_SIZE, (c + 1) * TILE_SIZE, (r + 1) * TILE_SIZE)) return true;
            }
        }
        for (const e of entities) {
            if (isObj(e) && e.type === 'BigBlock' && isNum(e.x) && isNum(e.y) && e.x2 > e.x && e.y2 > e.y && inside(e.x, e.y, e.x2, e.y2)) return true;
        }
        return Shapes.overlapsAny(tiles, TILE_SIZE, b) !== null;
    }

    /**
     * Checks a level the way the loader will use it. `errors` mean the level can't load or can't be finished
     * (the editor refuses to import or playtest it); `warnings` are things that are probably mistakes.
     * @returns {{errors: {path,message}[], warnings: {path,message}[]}}
     */
    function validate(level) {
        const errors = [], warnings = [];
        const err = (path, message) => errors.push({path, message});
        const warn = (path, message) => warnings.push({path, message});

        if (!isObj(level)) return {errors: [{path: '', message: 'level must be a JSON object'}], warnings};

        // map
        const tiles = level.map && level.map.tiles;
        let gridOk = false;
        if (!Array.isArray(tiles) || tiles.length === 0 || !Array.isArray(tiles[0])) {
            err('map.tiles', 'must be a non-empty 2D array');
        } else {
            gridOk = true;
            const width = tiles[0].length;
            if (width === 0) { err('map.tiles', 'rows must not be empty'); gridOk = false; }
            const unknown = new Set();
            tiles.forEach((row, r) => {
                if (!Array.isArray(row) || row.length !== width) {
                    err(`map.tiles[${r}]`, `row has ${Array.isArray(row) ? row.length : 'no'} tiles, expected ${width}`);
                    gridOk = false;
                    return;
                }
                row.forEach(id => { if (!Number.isInteger(id) || !Shapes.isKnown(id)) unknown.add(id); });
            });
            if (unknown.size > 0) err('map.tiles', `unknown tile ids: ${[...unknown].join(', ')}`);
        }

        // player and exit
        const checkPoint = (key, fields) => {
            const d = level[key];
            if (!isObj(d)) { err(key, 'missing'); return null; }
            const before = errors.length;
            fields.forEach(f => checkField(f, d[f.key], key, errors));
            return errors.length === before ? d : null;
        };
        const player = checkPoint('player', PLAYER_FIELDS);
        const exit = checkPoint('exitDoor', EXIT_FIELDS);

        // entities
        const entities = Array.isArray(level.entities) ? level.entities : (err('entities', 'must be an array'), []);
        entities.forEach((e, i) => {
            const where = `entities[${i}]`;
            if (!isObj(e)) { err(where, 'must be an object'); return; }
            const def = TYPES[e.type];
            if (!def) { warn(where, `unknown type ${JSON.stringify(e.type)}; the game will skip it`); return; }
            def.fields.forEach(f => checkField(f, e[f.key], `${where} (${e.type})`, errors));
            // Level 14 ships two of these. The game gives such a block a negative-size box, so it draws but never
            // collides. That is a level bug rather than something that stops the level loading, so it is a warning.
            if (e.type === 'BigBlock' && isNum(e.x2) && isNum(e.y2) && (e.x2 <= e.x || e.y2 <= e.y)) {
                warn(`${where} (BigBlock)`, 'right/bottom is not greater than x/y, so the block is drawn but never solid');
            }
        });

        const leverCount = entities.filter(e => isObj(e) && e.type === 'Lever').length;
        if (exit && exit.levers > leverCount) {
            err('exitDoor.levers', `needs ${exit.levers} levers but the level only has ${leverCount}, so the exit can never open`);
        }

        // things that are probably mistakes
        if (gridOk) {
            const w = tiles[0].length * TILE_SIZE, h = tiles.length * TILE_SIZE;
            const outside = b => b.x + b.w <= 0 || b.y + b.h <= 0 || b.x >= w || b.y >= h;
            if (player && outside(boundsFor('Player', player))) warn('player', 'starts outside the map');
            else if (player && overlapsSolid(level, boundsFor('Player', player), entities)) {
                warn('player', 'starts inside a solid tile or block; stand the spawn on top of it instead');
            }
            if (exit && outside(boundsFor('ExitDoor', exit))) warn('exitDoor', 'is outside the map');
            entities.forEach((e, i) => {
                if (isObj(e) && TYPES[e.type] && isNum(e.x) && isNum(e.y) && outside(boundsFor(e.type, e))) {
                    warn(`entities[${i}] (${e.type})`, 'is outside the map');
                }
            });
        }
        return {errors, warnings};
    }

    // ---- File format ------------------------------------------------------------------------------------------------

    // One object per line with spaced keys, so a diff of a level shows exactly which entity changed
    const inline = obj => '{ ' + Object.entries(obj).map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(', ') + ' }';

    /**
     * The canonical text of a level file: one tile row per line and one entity per line, so version-control
     * diffs are readable. Key order of entities is preserved; `parse(serialize(level))` equals `level`.
     */
    function serialize(level) {
        const {map, player, exitDoor, entities, ...extra} = level;
        const {tiles, ...mapExtra} = map;
        const out = ['{', '  "map": {', '    "tiles": ['];
        out.push(tiles.map(row => '      ' + JSON.stringify(row)).join(',\n'));
        out.push('    ]' + Object.entries(mapExtra).map(([k, v]) => `,\n    ${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(''));
        out.push('  },');
        out.push(`  "player": ${inline(player)},`);
        out.push(`  "exitDoor": ${inline(exitDoor)},`);
        const tail = Object.entries(extra).map(([k, v]) => `,\n  ${JSON.stringify(k)}: ${JSON.stringify(v)}`).join('');
        if (entities.length === 0) {
            out.push('  "entities": []' + tail);
        } else {
            out.push('  "entities": [');
            out.push(entities.map(e => '    ' + inline(e)).join(',\n'));
            out.push('  ]' + tail);
        }
        out.push('}');
        return out.join('\n') + '\n';
    }

    /** Parse level text and validate it. `level` is null when the text isn't JSON or has errors. */
    function parse(text) {
        let level;
        try {
            level = JSON.parse(text);
        } catch (e) {
            return {level: null, errors: [{path: '', message: `not valid JSON: ${e.message}`}], warnings: []};
        }
        const result = validate(level);
        return {level: result.errors.length === 0 ? level : null, ...result};
    }

    return {
        TILE_SIZE, DEFAULT_COLS, DEFAULT_ROWS, PLAYER_SIZE, EXIT_SIZE, DIRECTIONS,
        TYPES, ENTITY_TYPE_NAMES, EXIT_FIELDS, PLAYER_FIELDS,
        boundsFor, makeEntity, resolve, refType, pick, moveTo, removeEntity, duplicateEntity, snap, countLevers,
        rows, cols, inBounds, tileAt, setTile, fillRect, floodFill, addBorder, previewResize, resize, createBlank,
        paletteGroups, tileName, History, clone,
        validate, serialize, parse,
    };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = LevelModel;
}

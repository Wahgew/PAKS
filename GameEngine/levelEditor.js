/**
 * LevelEditor: an in-browser editor for level JSON (tiles, entities, spawn and exit), with playtesting.
 *
 * It runs on the game's own canvas and engine. While editing, the engine holds only two entities: a drawMap (so
 * tiles and background look exactly as in the game) and an overlay that draws the level's entities with their real
 * classes but never update()s them, so nothing moves or fires. Playtest hands the draft to LevelConfig.assemble()
 * and plays it for real, with a stand-in for LevelUI so no best time, progress or "current floor" is ever touched.
 *
 * The level itself is plain data handled by LevelModel (levelModel.js); this file is the interactive layer.
 */

const EDITOR_DRAFT_KEY = 'paks.editor.draft';

/**
 * Stands in for LevelUI during a playtest. Player and LevelConfig call these when you die, win or the level is
 * rebuilt. Unlike the real one it never records a time or unlocks a floor.
 */
class PlaytestUI {
    constructor(editor) {
        this.editor = editor;
        this.game = editor.game;
        this._death = false;
        this._complete = false;
        this.clearTime = null;
    }

    // Player.kill() sets this from a timer 500ms after dying. If the run was restarted or abandoned in between, the
    // player it came from is gone, so only believe it while the current player is actually dead.
    get isDisplayingDeath() { return this._death; }
    set isDisplayingDeath(v) { this._death = !!v && !!(this.game.Player && this.game.Player.dead); }
    get isDisplayingComplete() { return this._complete; }
    set isDisplayingComplete(v) { this._complete = !!v; }

    async updateBestTimeCache() {}

    async showLevelComplete() {
        this.clearTime = this.game.timer.getDisplayTime();
        this._complete = true;
        this.editor.noteCleared(this.clearTime);
    }

    hideLevelComplete() { this._complete = false; }
    resetUIState() { this._death = false; this._complete = false; }

    // The engine's Enter handler routes here while a death or clear screen is showing
    handleButtonAction(action) {
        if (action === 'continue') this.editor.restartPlaytest();
    }

    draw(ctx) {
        this.editor.fitCanvas();   // the editing overlay isn't in the world now, so this is the per-frame hook
        const w = ctx.canvas.width, h = ctx.canvas.height;
        ctx.save();
        ctx.textAlign = 'center';
        if (this._death || this._complete) {
            ctx.fillStyle = 'rgba(0,0,0,0.6)';
            ctx.fillRect(0, 0, w, h);
            ctx.fillStyle = this._death ? '#ff6666' : '#66ff88';
            ctx.font = 'bold 56px Molot, monospace';
            ctx.fillText(this._death ? 'YOU DIED' : 'LEVEL CLEARED', w / 2, h / 2 - 40);
            if (this._complete) {
                const t = this.clearTime;
                const stamp = `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}.${String(Math.floor((t % 1) * 100)).padStart(2, '0')}`;
                ctx.fillStyle = '#fff';
                ctx.font = '32px monospace';
                ctx.fillText(stamp, w / 2, h / 2 + 10);
            }
            ctx.fillStyle = '#ffcc00';
            ctx.font = '24px monospace';
            ctx.fillText(this._death ? 'Enter: try again    Esc: back to the editor' : 'Enter: play again    Esc: back to the editor', w / 2, h / 2 + 70);
        } else {
            ctx.textAlign = 'left';
            ctx.fillStyle = 'rgba(0,0,0,0.55)';
            ctx.fillRect(8, 8, 330, 30);
            ctx.fillStyle = '#ffcc00';
            ctx.font = '16px monospace';
            ctx.fillText('PLAYTEST   Esc: back to the editor', 16, 29);
        }
        ctx.restore();
    }
}

class LevelEditor {
    constructor(game) {
        this.game = game;
        this.canvas = game.ctx.canvas;
        // Private on purpose: if this were game.levelConfig, the debug floor picker could load a floor over the editor
        this.assembler = new LevelConfig(game);

        this.level = LevelModel.createBlank();
        this.history = new LevelModel.History(100);
        this.name = 'Untitled';
        this.fileName = 'level_custom.json';
        this.fileHandle = null;
        this.dirty = false;

        this.tool = 'brush';
        this.tile = 1;                 // selected tile id: a full block
        this.placeType = null;
        this.selection = null;
        this.snapStep = 5;
        this.showGrid = true;
        this.mode = 'closed';          // 'edit' | 'playtest' | 'closed'

        this.mouse = null;             // {px, py, col, row} in level pixels
        this.stroke = null;            // the drag in progress
        this.snapshot = null;          // the level as it was when the current drag began
        this.snapshotCommitted = false;
        this.problems = {errors: [], warnings: []};
        this.previews = new Map();     // entity descriptor -> {key, instance}: real entity objects used only to draw
        this.previewLoader = new LevelLoader();
        this.lastFit = '';
        this.cleared = null;           // clear time of the last playtest of the current draft, if any
        this.draftTimer = null;
        this.listeners = [];
    }

    // ---- lifecycle ----------------------------------------------------------------------------------------------

    open() {
        const game = this.game;
        this.mode = 'edit';
        game.editor = this;
        game.hideHud = true;               // no floor-time panel while editing
        game.Player = null;
        this.canvas.style.display = 'block';

        // One block colour and background for the whole session, so editing and playtesting look the same
        this.map = new drawMap(LevelModel.TILE_SIZE, game);
        this.theme = {random: this.map.random, random2: this.map.random2};
        this.overlay = {update: () => this.frame(), draw: ctx => this.drawOverlay(ctx)};
        game.entities = [this.map, this.overlay];

        this.wrapper = document.getElementById('game-inner-wrapper');
        this.savedTransform = this.wrapper ? this.wrapper.style.transform : '';

        this.ui = new EditorUI(this);
        this.bindEvents();
        this.afterChange();
        this.offerDraft();
    }

    exit() {
        this.confirmDiscard(() => this.close());
    }

    close() {
        if (this.mode === 'playtest') this.stopPlaytest();
        this.mode = 'closed';
        this.unbindEvents();
        this.ui.destroy();
        clearTimeout(this.draftTimer);
        if (this.wrapper) this.wrapper.style.transform = this.savedTransform;

        const game = this.game;
        game.running = false;              // this engine's loop stops; Start builds a fresh one as it always has
        game.entities = [];
        game.Player = null;
        game.editor = null;
        game.hideHud = false;
        this.canvas.style.display = 'none';
        const welcome = document.getElementById('welcomeScreen');
        if (welcome) welcome.style.display = 'flex';
        window.LEVEL_EDITOR = null;
    }

    bindEvents() {
        const on = (target, type, fn, opts) => {
            target.addEventListener(type, fn, opts);
            this.listeners.push([target, type, fn, opts]);
        };
        on(this.canvas, 'pointerdown', e => this.onPointerDown(e));
        on(this.canvas, 'pointermove', e => this.onPointerMove(e));
        on(this.canvas, 'pointerup', e => this.onPointerUp(e));
        on(this.canvas, 'pointercancel', e => this.onPointerUp(e));
        on(this.canvas, 'pointerleave', () => { if (!this.stroke) { this.mouse = null; this.ui.setCursorInfo(''); } });
        on(window, 'keydown', e => this.onKeyDown(e));
        on(window, 'resize', () => { this.lastFit = ''; });
        on(window, 'beforeunload', e => { if (this.dirty) { e.preventDefault(); e.returnValue = ''; } });
    }

    unbindEvents() {
        for (const [target, type, fn, opts] of this.listeners) target.removeEventListener(type, fn, opts);
        this.listeners = [];
    }

    // ---- per-frame work and fitting the canvas next to the panels ------------------------------------------------------

    frame() {
        this.fitCanvas();
    }

    /**
     * The game's resizer scales the canvas by screen size only. The editor needs it to fit the space left between
     * the panels (and to fill the window while playtesting), so it sets its own scale on the same wrapper and
     * hands the old one back on exit. Pointer maths uses getBoundingClientRect, so it is right at any scale.
     */
    fitCanvas() {
        if (!this.wrapper) return;
        const c = this.canvas;
        const editing = this.mode === 'edit';
        const key = [innerWidth, innerHeight, c.width, c.height, this.mode].join();
        if (key === this.lastFit) return;
        this.lastFit = key;
        const left = editing ? EditorUI.LEFT : 0, right = editing ? EditorUI.RIGHT : 0;
        const top = editing ? EditorUI.TOP : 0, bottom = editing ? EditorUI.BOTTOM : 0;
        const scale = Math.min((innerWidth - left - right - 16) / c.width, (innerHeight - top - bottom - 16) / c.height, 1);
        this.wrapper.style.transform = `translate(${(left - right) / 2}px, ${(top - bottom) / 2}px) scale(${scale})`;
    }

    /** Pointer position in level pixels, whatever the CSS scale of the canvas is. */
    toLevel(ev) {
        const r = this.canvas.getBoundingClientRect();
        const px = (ev.clientX - r.left) * this.canvas.width / r.width;
        const py = (ev.clientY - r.top) * this.canvas.height / r.height;
        const size = LevelModel.TILE_SIZE;
        return {px, py, col: Math.floor(px / size), row: Math.floor(py / size), scale: r.width / this.canvas.width};
    }

    // ---- state changes -----------------------------------------------------------------------------------------------

    setTool(tool) {
        this.tool = tool;
        if (tool !== 'place') this.placeType = null;
        this.syncUI();
    }

    setTile(id) {
        this.tile = id;
        if (!['brush', 'rect', 'fill'].includes(this.tool)) this.tool = 'brush';
        this.placeType = null;
        this.syncUI();
    }

    setPlaceType(type) {
        this.tool = 'place';
        this.placeType = type;
        this.selection = null;
        this.syncUI();
    }

    setGrid(on) { this.showGrid = on; }
    setSnap(step) { this.snapStep = step; }

    select(ref) {
        this.selection = ref;
        this.syncUI();
    }

    /** Selects what a validation path such as "entities[3] (Spike)" or "player" refers to. */
    selectPath(path) {
        const m = /^entities\[(\d+)\]/.exec(path || '');
        if (m && this.level.entities[Number(m[1])]) this.select({kind: 'entity', index: Number(m[1])});
        else if (/^player/.test(path)) this.select({kind: 'player'});
        else if (/^exitDoor/.test(path)) this.select({kind: 'exit'});
        if (this.tool !== 'select') this.setTool('select');
    }

    /** Runs a change to the level as one undo step. `fn` returns false (or 0) if it changed nothing. */
    edit(fn) {
        const before = LevelModel.clone(this.level);
        const changed = fn(this.level);
        if (changed === false || changed === 0) return false;
        this.history.record(before);
        this.afterChange(true);
        return true;
    }

    // A drag (painting, moving) is one undo step, recorded when it first really changes something
    beginStroke() {
        this.snapshot = LevelModel.clone(this.level);
        this.snapshotCommitted = false;
    }

    strokeChanged() {
        if (this.snapshot && !this.snapshotCommitted) {
            this.history.record(this.snapshot);
            this.snapshotCommitted = true;
        }
        this.afterChange(true);
    }

    endStroke() {
        this.snapshot = null;
        this.stroke = null;
    }

    undo() {
        const prev = this.history.undo(this.level);
        if (prev) this.replaceLevel(prev);
    }

    redo() {
        const next = this.history.redo(this.level);
        if (next) this.replaceLevel(next);
    }

    replaceLevel(level) {
        this.level = level;
        if (this.selection && this.selection.kind === 'entity' && !this.level.entities[this.selection.index]) this.selection = null;
        this.afterChange(true);
    }

    /** Everything that follows any change to the level: redraw the map, revalidate, refresh the panels. */
    afterChange(markDirty = false) {
        if (markDirty) {
            this.dirty = true;
            this.cleared = null;
            this.scheduleDraft();
        }
        // An edit can remove what is selected (delete, undo of an add); never let the panels see a dangling reference
        if (this.selection && !LevelModel.resolve(this.level, this.selection)) this.selection = null;
        this.map.loadMap(this.level.map.tiles);
        this.problems = LevelModel.validate(this.level);
        this.ui.setProblems(this.problems);
        this.ui.setPlayEnabled(this.problems.errors.length === 0);
        this.syncUI();
    }

    syncUI() {
        this.ui.syncToolState();
        this.ui.syncInspector();
        this.ui.setHint(this.hintText());
    }

    hintText() {
        switch (this.tool) {
            case 'brush': return 'Drag to paint. Right-drag erases. Alt+click picks a tile.';
            case 'rect': return 'Drag a rectangle. Shift makes an outline. Right-drag erases.';
            case 'fill': return 'Click to fill a connected area. Right-click empties it.';
            case 'pick': return 'Click a tile to use it.';
            case 'select': return 'Click to select and drag to move. Arrows nudge, Del deletes, Ctrl+D duplicates.';
            case 'place': return this.placeType === 'BigBlock' ? 'Drag to draw the block, or click for a default one.' : 'Click to place.';
        }
        return '';
    }

    // ---- pointer input ----------------------------------------------------------------------------------------------------

    onPointerDown(ev) {
        if (this.mode !== 'edit') return;
        ev.preventDefault();
        if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
        this.canvas.setPointerCapture(ev.pointerId);
        const p = this.toLevel(ev);
        this.mouse = p;
        const erase = ev.button === 2;

        if (ev.altKey || this.tool === 'pick') {
            const id = LevelModel.tileAt(this.level, p.col, p.row);
            if (id !== null) this.setTile(id);
            if (this.tool === 'pick') this.setTool('brush');
            return;
        }

        switch (this.tool) {
            case 'brush': {
                const id = erase ? 0 : this.tile;
                this.beginStroke();
                this.stroke = {kind: 'brush', id, last: {col: p.col, row: p.row}};
                if (LevelModel.setTile(this.level, p.col, p.row, id)) this.strokeChanged();
                break;
            }
            case 'rect':
                this.stroke = {kind: 'rect', id: erase ? 0 : this.tile, c0: p.col, r0: p.row};
                break;
            case 'fill': {
                const id = erase ? 0 : this.tile;
                this.edit(level => LevelModel.floodFill(level, p.col, p.row, id));
                break;
            }
            case 'select': {
                if (erase) break;
                const ref = LevelModel.pick(this.level, p.px, p.py, Math.max(3, 6 / p.scale));
                this.select(ref);
                if (ref) {
                    const d = LevelModel.resolve(this.level, ref);
                    this.beginStroke();
                    this.stroke = {kind: 'move', ref, offX: p.px - d.x, offY: p.py - d.y};
                }
                break;
            }
            case 'place': {
                if (!this.placeType || erase) break;
                if (this.placeType === 'BigBlock') {
                    this.stroke = {kind: 'block', x0: LevelModel.snap(p.px, this.snapStep), y0: LevelModel.snap(p.py, this.snapStep)};
                } else {
                    this.placeEntity(p);
                }
                break;
            }
        }
    }

    onPointerMove(ev) {
        if (this.mode !== 'edit') return;
        const p = this.toLevel(ev);
        this.mouse = p;
        const id = LevelModel.tileAt(this.level, p.col, p.row);
        this.ui.setCursorInfo(`tile ${p.col}, ${p.row}    px ${Math.round(p.px)}, ${Math.round(p.py)}` +
            (id === null ? '' : `    ${LevelModel.tileName(id)}`));

        const s = this.stroke;
        if (!s) return;
        if (s.kind === 'brush') {
            let changed = false;
            for (const [c, r] of this.cellsBetween(s.last.col, s.last.row, p.col, p.row)) {
                if (LevelModel.setTile(this.level, c, r, s.id)) changed = true;
            }
            s.last = {col: p.col, row: p.row};
            if (changed) this.strokeChanged();
        } else if (s.kind === 'move') {
            const d = LevelModel.resolve(this.level, s.ref);
            const x = LevelModel.snap(p.px - s.offX, this.snapStep), y = LevelModel.snap(p.py - s.offY, this.snapStep);
            if (d && (x !== d.x || y !== d.y)) {
                LevelModel.moveTo(this.level, s.ref, x, y);
                this.strokeChanged();
            }
        }
    }

    onPointerUp(ev) {
        if (this.mode !== 'edit') return;
        const s = this.stroke;
        if (!s) return;
        const p = this.toLevel(ev);
        if (s.kind === 'rect') {
            this.beginStroke();
            const n = LevelModel.fillRect(this.level, s.c0, s.r0, p.col, p.row, s.id, ev.shiftKey && s.id !== 0);
            if (n > 0) this.strokeChanged();
        } else if (s.kind === 'block') {
            this.finishBlock(s, p);
        }
        this.endStroke();
        this.syncUI();
    }

    /** The tiles a fast mouse move passed over, so a brush stroke has no gaps (Bresenham). */
    *cellsBetween(c0, r0, c1, r1) {
        const dc = Math.abs(c1 - c0), dr = -Math.abs(r1 - r0);
        const sc = c0 < c1 ? 1 : -1, sr = r0 < r1 ? 1 : -1;
        let err = dc + dr, c = c0, r = r0;
        for (;;) {
            yield [c, r];
            if (c === c1 && r === r1) return;
            const e2 = 2 * err;
            if (e2 >= dr) { err += dr; c += sc; }
            if (e2 <= dc) { err += dc; r += sr; }
        }
    }

    placeEntity(p) {
        const type = this.placeType;
        const box = LevelModel.boundsFor(type, LevelModel.makeEntity(type, 0, 0));
        // centred on the cursor; lasers and old lasers anchor at their start point instead
        const anchored = type === 'GlowingLaser';
        const x = LevelModel.snap(anchored ? p.px : p.px - box.w / 2, this.snapStep);
        const y = LevelModel.snap(anchored ? p.py : p.py - box.h / 2, this.snapStep);
        this.edit(level => { level.entities.push(LevelModel.makeEntity(type, x, y)); });
        this.select({kind: 'entity', index: this.level.entities.length - 1});
        this.setTool('select');
    }

    finishBlock(s, p) {
        const x1 = LevelModel.snap(p.px, this.snapStep), y1 = LevelModel.snap(p.py, this.snapStep);
        let x = Math.min(s.x0, x1), y = Math.min(s.y0, y1), x2 = Math.max(s.x0, x1), y2 = Math.max(s.y0, y1);
        if (x2 - x < 5 || y2 - y < 5) { x2 = s.x0 + 100; y2 = s.y0 + 100; x = s.x0; y = s.y0; }   // a click, not a drag
        this.edit(level => { level.entities.push({type: 'BigBlock', x, y, x2, y2}); });
        this.select({kind: 'entity', index: this.level.entities.length - 1});
        this.setTool('select');
    }

    // ---- entity actions from the panels --------------------------------------------------------------------------------

    setField(field, value) {
        const ref = this.selection;
        if (!ref) return;
        const key = field.key;
        this.edit(level => {
            const d = LevelModel.resolve(level, ref);
            if (!d || d[key] === value) return false;
            d[key] = value;
        });
    }

    deleteSelection() {
        const ref = this.selection;
        if (!ref || ref.kind !== 'entity') return;
        this.edit(level => { LevelModel.removeEntity(level, ref.index); });
    }

    duplicateSelection() {
        const ref = this.selection;
        if (!ref || ref.kind !== 'entity') return;
        let index;
        this.edit(level => { index = LevelModel.duplicateEntity(level, ref.index); });
        this.select({kind: 'entity', index});
    }

    nudgeSelection(dx, dy) {
        const ref = this.selection;
        const d = ref && LevelModel.resolve(this.level, ref);
        if (!d) return;
        this.edit(level => LevelModel.moveTo(level, ref, d.x + dx, d.y + dy));
    }

    resizeLevel(cols, rows) {
        if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 10 || rows < 10 || cols > 300 || rows > 300) {
            this.ui.showDialog('Size not allowed', ['Use whole numbers from 10 to 300 for the columns and rows.']);
            return;
        }
        const apply = () => this.edit(level => LevelModel.resize(level, cols, rows));
        const lost = LevelModel.previewResize(this.level, cols, rows);
        if (lost.lostTiles === 0 && lost.lostEntities === 0) { apply(); return; }
        this.ui.showDialog('Cut off part of the level?', [
            `Resizing to ${cols} × ${rows} removes ${lost.lostTiles} tiles`,
            `and leaves ${lost.lostEntities} entities, spawn or exit outside the level.`,
            'You can undo this with Ctrl+Z.',
        ], [{label: 'Cancel'}, {label: 'Resize anyway', action: apply}]);
    }

    addBorder() {
        this.edit(level => LevelModel.addBorder(level));
    }

    // ---- keyboard -----------------------------------------------------------------------------------------------------------

    onKeyDown(ev) {
        if (this.mode === 'playtest') {
            if (ev.key === 'Escape') this.stopPlaytest();
            return;
        }
        if (this.mode !== 'edit') return;
        const tag = ev.target && ev.target.tagName;
        if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;   // typing in the inspector
        if (this.ui.root.querySelector('[data-modal]')) return;

        const k = ev.key.toLowerCase();
        if (ev.ctrlKey || ev.metaKey) {
            if (k === 'z') { ev.preventDefault(); ev.shiftKey ? this.redo() : this.undo(); }
            else if (k === 'y') { ev.preventDefault(); this.redo(); }
            else if (k === 's') { ev.preventDefault(); this.save(ev.shiftKey); }
            else if (k === 'd') { ev.preventDefault(); this.duplicateSelection(); }
            return;
        }
        const step = this.snapStep;
        switch (k) {
            case 'b': this.setTool('brush'); break;
            case 'r': this.setTool('rect'); break;
            case 'f': this.setTool('fill'); break;
            case 'i': this.setTool('pick'); break;
            case 's': this.setTool('select'); break;
            case 'g': this.showGrid = !this.showGrid; this.ui.gridBox.checked = this.showGrid; break;
            case 'p': this.startPlaytest(); break;
            case 'escape':
                if (this.stroke) this.endStroke();
                else if (this.tool === 'place') this.setTool('select');
                else this.select(null);
                break;
            case 'delete': case 'backspace': ev.preventDefault(); this.deleteSelection(); break;
            case 'arrowleft': ev.preventDefault(); this.nudgeSelection(-step, 0); break;
            case 'arrowright': ev.preventDefault(); this.nudgeSelection(step, 0); break;
            case 'arrowup': ev.preventDefault(); this.nudgeSelection(0, -step); break;
            case 'arrowdown': ev.preventDefault(); this.nudgeSelection(0, step); break;
        }
    }

    // ---- drawing --------------------------------------------------------------------------------------------------------------

    /** The real entity object for a descriptor, built once per change and only ever drawn. */
    previewFor(desc) {
        const key = JSON.stringify(desc);
        const hit = this.previews.get(desc);
        if (hit && hit.key === key) return hit.instance;
        // A one-entity level lets the loader build it, so this can't drift from what the game builds
        this.previewLoader.store(0, {map: {tiles: [[0]]}, player: {x: 0, y: 0}, exitDoor: {x: 0, y: 0}, entities: [desc]});
        const log = console.log;
        console.log = () => {};                          // GlowingLaser logs on every construction
        let instance = null;
        try { instance = this.previewLoader.getLevelEntities(0, this.game, LevelModel.TILE_SIZE).hazards()[0] || null; }
        catch (e) { console.warn('editor: could not preview', desc, e); }
        finally { console.log = log; }
        this.previews.set(desc, {key, instance});
        return instance;
    }

    drawOverlay(ctx) {
        if (this.mode !== 'edit') return;
        const size = LevelModel.TILE_SIZE;
        const w = this.canvas.width, h = this.canvas.height;
        ctx.save();

        if (this.showGrid) {
            ctx.lineWidth = 1;
            for (let c = 0; c <= w / size; c++) {
                ctx.strokeStyle = c % 5 === 0 ? 'rgba(0,0,0,0.22)' : 'rgba(0,0,0,0.09)';
                ctx.beginPath(); ctx.moveTo(c * size + 0.5, 0); ctx.lineTo(c * size + 0.5, h); ctx.stroke();
            }
            for (let r = 0; r <= h / size; r++) {
                ctx.strokeStyle = r % 5 === 0 ? 'rgba(0,0,0,0.22)' : 'rgba(0,0,0,0.09)';
                ctx.beginPath(); ctx.moveTo(0, r * size + 0.5); ctx.lineTo(w, r * size + 0.5); ctx.stroke();
            }
        }

        // entities, in level order so overlaps stack as they will in the game
        const live = new Set(this.level.entities);
        for (const key of [...this.previews.keys()]) if (!live.has(key)) this.previews.delete(key);
        for (const desc of this.level.entities) {
            const inst = this.previewFor(desc);
            if (inst) { ctx.save(); inst.draw(ctx); ctx.restore(); }
            else this.drawUnknown(ctx, desc);
        }
        this.drawExit(ctx);
        this.drawSpawn(ctx);
        this.drawSelection(ctx);
        this.drawGhost(ctx);
        ctx.restore();
    }

    drawExit(ctx) {
        const exit = this.level.exitDoor;
        if (!this.exitPreview) this.exitPreview = new exitDoor(this.game, 0, 0, 0);
        this.exitPreview.x = exit.x;
        this.exitPreview.y = exit.y;
        this.exitPreview.isOpen = (exit.levers ?? 0) === 0;   // shows the locked door when levers are needed
        ctx.save();
        this.exitPreview.draw(ctx);
        ctx.restore();
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = '#222';
        ctx.lineWidth = 3;
        ctx.font = 'bold 13px Arial';
        ctx.textAlign = 'center';
        const label = `EXIT · ${exit.levers ?? 0} lever${exit.levers === 1 ? '' : 's'}`;
        ctx.strokeText(label, exit.x + 34, exit.y - 6);
        ctx.fillText(label, exit.x + 34, exit.y - 6);
    }

    drawSpawn(ctx) {
        const p = this.level.player;
        const {w, h} = LevelModel.PLAYER_SIZE;
        ctx.save();
        ctx.strokeStyle = '#1a1a1a';
        ctx.fillStyle = '#1a1a1a';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        const cx = p.x + w / 2;
        ctx.beginPath(); ctx.arc(cx, p.y + 10, 8, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath();
        ctx.moveTo(cx, p.y + 18); ctx.lineTo(cx, p.y + 46);                 // body
        ctx.moveTo(cx - 9, p.y + 30); ctx.lineTo(cx + 9, p.y + 30);        // arms
        ctx.moveTo(cx, p.y + 46); ctx.lineTo(cx - 8, p.y + h);             // legs
        ctx.moveTo(cx, p.y + 46); ctx.lineTo(cx + 8, p.y + h);
        ctx.stroke();
        ctx.setLineDash([4, 3]);
        ctx.strokeStyle = '#2b6fd6';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(p.x, p.y, w, h);
        ctx.setLineDash([]);
        ctx.fillStyle = '#2b6fd6';
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('SPAWN', cx, p.y - 5);
        ctx.restore();
    }

    drawUnknown(ctx, desc) {
        const b = LevelModel.boundsFor(desc.type, desc);
        ctx.save();
        ctx.fillStyle = 'rgba(160,160,160,0.6)';
        ctx.fillRect(b.x, b.y, b.w, b.h);
        ctx.fillStyle = '#222';
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('?', b.x + b.w / 2, b.y + b.h / 2 + 5);
        ctx.restore();
    }

    drawSelection(ctx) {
        const ref = this.selection;
        const d = ref && LevelModel.resolve(this.level, ref);
        if (!d) return;
        const b = LevelModel.boundsFor(LevelModel.refType(this.level, ref), d);
        ctx.save();
        ctx.strokeStyle = '#ffcc00';
        ctx.lineWidth = 2.5;
        ctx.setLineDash([7, 4]);
        ctx.strokeRect(b.x - 3, b.y - 3, b.w + 6, b.h + 6);
        ctx.restore();
    }

    /** What the active tool would do at the pointer: a tile ghost, a rectangle, or an entity outline. */
    drawGhost(ctx) {
        const m = this.mouse;
        if (!m) return;
        const size = LevelModel.TILE_SIZE;
        ctx.save();
        const s = this.stroke;
        if (this.tool === 'rect' && s && s.kind === 'rect') {
            const c0 = Math.min(s.c0, m.col), c1 = Math.max(s.c0, m.col), r0 = Math.min(s.r0, m.row), r1 = Math.max(s.r0, m.row);
            ctx.fillStyle = s.id === 0 ? 'rgba(220,60,60,0.3)' : 'rgba(255,204,0,0.35)';
            ctx.fillRect(c0 * size, r0 * size, (c1 - c0 + 1) * size, (r1 - r0 + 1) * size);
            ctx.strokeStyle = '#222';
            ctx.strokeRect(c0 * size + 0.5, r0 * size + 0.5, (c1 - c0 + 1) * size - 1, (r1 - r0 + 1) * size - 1);
        } else if (['brush', 'rect', 'fill'].includes(this.tool) && LevelModel.inBounds(this.level, m.col, m.row)) {
            ctx.globalAlpha = 0.6;
            this.drawTileGhost(ctx, this.tile, m.col * size, m.row * size, size);
            ctx.globalAlpha = 1;
            ctx.strokeStyle = '#ffcc00';
            ctx.lineWidth = 2;
            ctx.strokeRect(m.col * size + 1, m.row * size + 1, size - 2, size - 2);
        } else if (this.tool === 'place' && this.placeType) {
            if (s && s.kind === 'block') {
                const x1 = LevelModel.snap(m.px, this.snapStep), y1 = LevelModel.snap(m.py, this.snapStep);
                ctx.fillStyle = 'rgba(255,204,0,0.35)';
                ctx.fillRect(Math.min(s.x0, x1), Math.min(s.y0, y1), Math.abs(x1 - s.x0), Math.abs(y1 - s.y0));
            } else {
                const type = this.placeType;
                const box = LevelModel.boundsFor(type, LevelModel.makeEntity(type, 0, 0));
                const anchored = type === 'GlowingLaser';
                const x = LevelModel.snap(anchored ? m.px : m.px - box.w / 2, this.snapStep);
                const y = LevelModel.snap(anchored ? m.py : m.py - box.h / 2, this.snapStep);
                const ghost = LevelModel.boundsFor(type, LevelModel.makeEntity(type, x, y));
                ctx.setLineDash([6, 4]);
                ctx.strokeStyle = '#ffcc00';
                ctx.lineWidth = 2;
                ctx.strokeRect(ghost.x, ghost.y, ghost.w, ghost.h);
            }
        }
        ctx.restore();
    }

    drawTileGhost(ctx, id, x, y, size) {
        if (id === 0) {
            ctx.strokeStyle = '#d33';
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(x + 4, y + 4); ctx.lineTo(x + size - 4, y + size - 4);
            ctx.moveTo(x + size - 4, y + 4); ctx.lineTo(x + 4, y + size - 4); ctx.stroke();
            return;
        }
        ctx.fillStyle = '#7a4a1e';
        if (id === 1) { ctx.fillRect(x, y, size, size); return; }
        const shape = TileShapes.get(id, size);
        if (!shape) return;
        ctx.beginPath();
        shape.outline.forEach((pt, i) => i === 0 ? ctx.moveTo(x + pt.x, y + pt.y) : ctx.lineTo(x + pt.x, y + pt.y));
        ctx.closePath();
        ctx.fill();
    }

    // ---- playtest -----------------------------------------------------------------------------------------------------------

    startPlaytest() {
        if (this.mode !== 'edit') return;
        if (this.problems.errors.length > 0) {
            this.ui.showDialog('This level cannot be played yet', this.problems.errors.map(e => `${e.path}: ${e.message}`));
            return;
        }
        const game = this.game;
        this.mode = 'playtest';
        this.stroke = null;
        this.savedLevelUI = game.levelUI;
        this.playtestUI = new PlaytestUI(this);
        game.levelUI = this.playtestUI;
        game.hideHud = false;
        if (document.activeElement) document.activeElement.blur();   // a focused button would eat Space (jump)
        this.ui.setVisible(false);
        this.lastFit = '';
        this.restartPlaytest();
    }

    /** (Re)builds the draft as a live level and starts the clock. Also what Enter does after dying. */
    restartPlaytest() {
        const game = this.game;
        game.keys = {};
        const loader = new LevelLoader();
        loader.store(0, LevelModel.clone(this.level));
        this.assembler.assemble(loader.getLevelEntities(0, game, LevelModel.TILE_SIZE));
        // assemble() makes a new drawMap with a new random theme; keep the one the level was edited with
        const map = game.entities.find(e => e instanceof drawMap);
        map.random = this.theme.random;
        map.random2 = this.theme.random2;
        game.currentColor = this.theme.random2;
        this.playtestUI.resetUIState();
    }

    stopPlaytest() {
        if (this.mode !== 'playtest') return;
        const game = this.game;
        this.mode = 'edit';
        game.levelUI = this.savedLevelUI;
        game.hideHud = true;
        game.keys = {};
        game.Player = null;
        game.entities = [this.map, this.overlay];
        if (game.timer) game.timer.reset();                // a death stops it, and a stopped timer logs on every tick
        this.ui.setVisible(true);
        this.lastFit = '';
        this.syncUI();
    }

    noteCleared(seconds) {
        this.cleared = seconds;
    }

    // ---- files ---------------------------------------------------------------------------------------------------------------

    /** Run `next` now, or after the user agrees to drop unsaved changes. */
    confirmDiscard(next) {
        if (!this.dirty) { next(); return; }
        this.ui.showDialog('Discard unsaved changes?', [`"${this.name}" has changes that have not been saved.`],
            [{label: 'Keep editing'}, {label: 'Discard', action: next}]);
    }

    load(level, {name, fileName, handle = null}) {
        this.level = LevelModel.clone(level);
        this.history.clear();
        this.selection = null;
        this.name = name;
        this.fileName = fileName;
        this.fileHandle = handle;
        this.dirty = false;
        this.cleared = null;
        this.previews.clear();
        this.clearDraft();
        this.afterChange();
    }

    newLevel() {
        this.confirmDiscard(() => this.load(LevelModel.createBlank(), {name: 'Untitled', fileName: 'level_custom.json'}));
    }

    openFloor(n) {
        const data = window.LEVEL_LOADER && window.LEVEL_LOADER.levels[n];
        if (!data) { this.ui.showDialog('Floor not available', [`Floor ${n} has not been loaded. Is the game being served over HTTP?`]); return; }
        this.confirmDiscard(() => this.load(data, {name: `Floor ${n}`, fileName: `level_${String(n).padStart(2, '0')}.json`}));
    }

    async openFile() {
        this.confirmDiscard(async () => {
            try {
                let file, handle = null;
                if (window.showOpenFilePicker) {
                    [handle] = await window.showOpenFilePicker({types: [{description: 'Level JSON', accept: {'application/json': ['.json']}}]});
                    file = await handle.getFile();
                } else {
                    file = await this.pickFileFallback();
                    if (!file) return;
                }
                this.importText(await file.text(), file.name, handle);
            } catch (e) {
                if (e.name !== 'AbortError') this.ui.showDialog('Could not open the file', [String(e.message || e)]);
            }
        });
    }

    pickFileFallback() {
        return new Promise(resolve => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json,application/json';
            input.onchange = () => resolve(input.files[0] || null);
            input.click();
        });
    }

    /** Loads level JSON text. Anything the game could not load is refused, with the reasons. */
    importText(text, fileName, handle = null) {
        const result = LevelModel.parse(text);
        if (!result.level) {
            const lines = result.errors.slice(0, 10).map(e => `${e.path ? e.path + ': ' : ''}${e.message}`);
            if (result.errors.length > 10) lines.push(`…and ${result.errors.length - 10} more`);
            this.ui.showDialog(`"${fileName}" is not a level the game can load`, lines);
            return false;
        }
        this.load(result.level, {name: fileName, fileName, handle});
        return true;
    }

    /** Save straight to the file where the browser allows it (Chromium), otherwise download it. */
    async save(asNew) {
        const text = LevelModel.serialize(this.level);
        try {
            if (window.showSaveFilePicker) {
                if (asNew || !this.fileHandle) {
                    this.fileHandle = await window.showSaveFilePicker({suggestedName: this.fileName, types: [{description: 'Level JSON', accept: {'application/json': ['.json']}}]});
                }
                const out = await this.fileHandle.createWritable();
                await out.write(text);
                await out.close();
                this.fileName = this.fileHandle.name;
            } else {
                const a = document.createElement('a');
                a.href = URL.createObjectURL(new Blob([text], {type: 'application/json'}));
                a.download = this.fileName;
                a.click();
                URL.revokeObjectURL(a.href);
            }
        } catch (e) {
            if (e.name !== 'AbortError') this.ui.showDialog('Could not save', [String(e.message || e)]);
            return false;
        }
        this.name = this.fileName;
        this.dirty = false;
        this.clearDraft();
        this.syncUI();
        return true;
    }

    // ---- draft autosave -------------------------------------------------------------------------------------------------------

    scheduleDraft() {
        clearTimeout(this.draftTimer);
        this.draftTimer = setTimeout(() => this.saveDraft(), 600);
    }

    saveDraft() {
        try {
            localStorage.setItem(EDITOR_DRAFT_KEY, JSON.stringify({name: this.name, fileName: this.fileName, level: this.level, savedAt: Date.now()}));
        } catch (e) { /* storage blocked or full: the draft is a convenience only */ }
    }

    clearDraft() {
        clearTimeout(this.draftTimer);
        try { localStorage.removeItem(EDITOR_DRAFT_KEY); } catch (e) { /* see saveDraft */ }
    }

    offerDraft() {
        let draft = null;
        try { draft = JSON.parse(localStorage.getItem(EDITOR_DRAFT_KEY)); } catch (e) { draft = null; }
        if (!draft || !draft.level || LevelModel.validate(draft.level).errors.length > 0) return;
        const when = new Date(draft.savedAt).toLocaleString();
        this.ui.showDialog('Restore your unsaved level?', [`"${draft.name}" was being edited on ${when} and was not saved.`],
            [{label: 'Discard it', action: () => this.clearDraft()},
                {label: 'Restore', action: () => { this.load(draft.level, {name: draft.name, fileName: draft.fileName}); this.dirty = true; this.scheduleDraft(); this.syncUI(); }}]);
    }
}

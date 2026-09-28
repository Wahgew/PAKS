/**
 * EditorUI: the level editor's panels (top bar, tool and tile palette, inspector, status line, dialogs).
 *
 * Pure DOM. It reads the editor's state to draw itself and calls editor methods when the user acts, and holds no
 * level logic of its own. Built with inline styles in the elevator-panel look, like the rest of the game's UI.
 */
class EditorUI {
    // Space the panels take from the viewport; the editor fits the canvas into what is left
    static TOP = 46;
    static LEFT = 236;
    static RIGHT = 268;
    static BOTTOM = 26;

    constructor(editor) {
        this.editor = editor;
        this.inspectorKey = null;
        this.tileButtons = new Map();
        this.toolButtons = new Map();
        this.placeButtons = new Map();
        this.inputs = new Map();

        this.root = document.createElement('div');
        this.root.id = 'levelEditorUI';
        this.root.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:1500;' +
            'font:12px Arial,sans-serif;color:#ddd;user-select:none';
        this.buildTopBar();
        this.buildLeftPanel();
        this.buildRightPanel();
        this.buildStatusBar();
        document.body.appendChild(this.root);
    }

    // ---- small helpers ----

    el(tag, style = '', props = {}, ...children) {
        const node = document.createElement(tag);
        if (style) node.style.cssText = style;
        const {on, ...rest} = props;
        Object.assign(node, rest);
        if (on) for (const [type, fn] of Object.entries(on)) node.addEventListener(type, fn);
        for (const c of children) node.append(c);
        return node;
    }

    button(label, onClick, title = '', extra = '') {
        const b = this.el('button', 'background:#444;color:#ffcc00;border:1px solid #666;border-radius:4px;padding:5px 9px;' +
            'cursor:pointer;font:12px Arial,sans-serif;white-space:nowrap;' + extra, {textContent: label, title, on: {click: onClick}});
        b.addEventListener('mouseenter', () => { if (!b.disabled) b.dataset.hover = '1'; this.paintButton(b); });
        b.addEventListener('mouseleave', () => { delete b.dataset.hover; this.paintButton(b); });
        return b;
    }

    paintButton(b) {
        if (b.dataset.active) { b.style.background = '#ffcc00'; b.style.color = '#222'; }
        else { b.style.background = b.dataset.hover ? '#5a5a5a' : '#444'; b.style.color = b.disabled ? '#777' : '#ffcc00'; }
    }

    setActive(b, on) {
        if (on) b.dataset.active = '1'; else delete b.dataset.active;
        this.paintButton(b);
    }

    setEnabled(b, on) {
        b.disabled = !on;
        b.style.cursor = on ? 'pointer' : 'default';
        this.paintButton(b);
    }

    panel(style) {
        return this.el('div', 'position:fixed;background:#2b2b2b;border:1px solid #555;box-shadow:0 0 10px rgba(0,0,0,.5);' +
            'pointer-events:auto;overflow-y:auto;box-sizing:border-box;' + style);
    }

    heading(text) {
        return this.el('div', 'color:#ffcc00;font:bold 13px Molot,Arial,sans-serif;letter-spacing:1px;margin:10px 0 5px;' +
            'text-transform:uppercase', {textContent: text});
    }

    // ---- top bar ----

    buildTopBar() {
        const e = this.editor;
        const bar = this.panel(`left:0;top:0;width:100%;height:${EditorUI.TOP}px;display:flex;align-items:center;gap:6px;` +
            'padding:0 10px;overflow:visible;overflow-x:auto');
        const sep = () => this.el('div', 'width:1px;height:24px;background:#555;margin:0 4px');

        this.floorSelect = this.el('select', 'background:#fff;color:#222;border-radius:4px;padding:4px;font:12px Arial');
        for (let n = 0; n <= 16; n++) this.floorSelect.append(this.el('option', '', {value: n, textContent: n === 0 ? 'Floor 0 (test)' : `Floor ${n}`}));

        this.btnSave = this.button('Save', () => e.save(false), '');
        this.btnUndo = this.button('Undo', () => e.undo(), 'Undo (Ctrl+Z)');
        this.btnRedo = this.button('Redo', () => e.redo(), 'Redo (Ctrl+Y)');
        this.gridBox = this.el('input', 'margin:0', {type: 'checkbox', checked: e.showGrid, on: {change: ev => e.setGrid(ev.target.checked)}});
        this.snapSelect = this.el('select', 'background:#fff;color:#222;border-radius:4px;padding:4px;font:12px Arial', {
            title: 'Snap for placing and moving entities', on: {change: ev => e.setSnap(Number(ev.target.value))}});
        for (const step of [1, 5, 25]) this.snapSelect.append(this.el('option', '', {value: step, textContent: `${step}px`, selected: step === e.snapStep}));
        this.btnPlay = this.button('Playtest', () => e.startPlaytest(), 'Play this level from the spawn (P)', 'font-weight:bold;padding:6px 14px');
        this.name = this.el('div', 'margin-left:auto;color:#ccc;white-space:nowrap;padding-left:12px');

        bar.append(
            this.button('Exit', () => e.exit(), 'Back to the title screen'), sep(),
            this.button('New', () => e.newLevel(), 'Start an empty level'),
            this.floorSelect, this.button('Open floor', () => e.openFloor(Number(this.floorSelect.value)), 'Copy a built-in floor into the editor'),
            this.button('Open file…', () => e.openFile(), 'Open a level .json file'),
            this.btnSave, this.button('Save as…', () => e.save(true), 'Always asks for a file to save to'),
            this.button('Levels folder…', () => e.changeLevelsDir(), 'Choose the GameEngine/levels folder that Save writes built-in floors into'), sep(),
            this.btnUndo, this.btnRedo, sep(),
            this.el('label', 'display:flex;align-items:center;gap:4px', {}, this.gridBox, 'Grid'),
            this.el('label', 'display:flex;align-items:center;gap:4px', {}, 'Snap', this.snapSelect),
            this.button('Fit', () => e.fitView(), 'Show the whole level (0). The wheel zooms, Space+drag or middle-drag pans'),
            this.button('100%', () => e.zoom100(), 'Actual size (1)'), sep(),
            this.btnPlay, this.name);
        this.root.append(bar);
        this.bar = bar;
    }

    // ---- left panel: tools, tiles, entities ----

    buildLeftPanel() {
        const e = this.editor;
        const p = this.panel(`left:0;top:${EditorUI.TOP}px;bottom:${EditorUI.BOTTOM}px;width:${EditorUI.LEFT}px;padding:8px 10px`);

        p.append(this.heading('Tools'));
        const tools = this.el('div', 'display:flex;flex-wrap:wrap;gap:4px');
        for (const [name, label, hint] of [
            ['brush', 'Brush (B)', 'Paint tiles. Drag to draw, right-click to erase'],
            ['rect', 'Rectangle (R)', 'Fill a rectangle. Hold Shift for an outline, right-drag to erase'],
            ['fill', 'Fill (F)', 'Flood-fill a connected area'],
            ['pick', 'Pick (I)', 'Click a tile to use it (Alt+click works in any tool)'],
            ['select', 'Select (S)', 'Select, move and edit spawn, exit and entities. Delete removes'],
        ]) {
            const b = this.button(label, () => e.setTool(name), hint);
            this.toolButtons.set(name, b);
            tools.append(b);
        }
        p.append(tools);

        p.append(this.heading('Entities'));
        const ents = this.el('div', 'display:flex;flex-wrap:wrap;gap:4px');
        for (const type of LevelModel.ENTITY_TYPE_NAMES.filter(t => !LevelModel.TYPES[t].legacy)) {
            const b = this.button(LevelModel.TYPES[type].label, () => e.setPlaceType(type),
                type === 'BigBlock' ? 'Drag on the level to draw a solid block' : 'Click on the level to place');
            this.placeButtons.set(type, b);
            ents.append(b);
        }
        p.append(ents);
        p.append(this.el('div', 'color:#999;margin-top:10px;line-height:1.5', {
            textContent: 'The spawn and the exit door are already in every level: use Select to move them.'}));
        p.append(this.heading('Tiles'));
        for (const group of LevelModel.paletteGroups()) {
            p.append(this.el('div', 'color:#aaa;margin:6px 0 3px', {textContent: group.label}));
            const row = this.el('div', 'display:flex;gap:4px');
            for (const id of group.ids) {
                const b = this.el('button', 'width:38px;height:38px;padding:2px;background:#444;border:2px solid #666;border-radius:4px;cursor:pointer',
                    {title: LevelModel.tileName(id), on: {click: () => e.setTile(id)}});
                b.append(this.tileIcon(id));
                this.tileButtons.set(id, b);
                row.append(b);
            }
            p.append(row);
        }

        this.root.append(p);
        this.left = p;
    }

    /** A small picture of a tile id, drawn from the same outlines the game uses. */
    tileIcon(id) {
        const c = this.el('canvas', 'display:block;margin:auto', {width: 30, height: 30});
        const g = c.getContext('2d');
        g.fillStyle = '#e8e8e8';
        g.fillRect(0, 0, 30, 30);
        if (id === 0) {
            g.strokeStyle = '#c33';
            g.lineWidth = 2;
            g.beginPath(); g.moveTo(4, 4); g.lineTo(26, 26); g.moveTo(26, 4); g.lineTo(4, 26); g.stroke();
        } else if (id === 1) {
            g.fillStyle = '#c9823f';
            g.fillRect(1, 1, 28, 28);
        } else {
            const shape = TileShapes.get(id, 28);
            g.fillStyle = '#c9823f';
            g.beginPath();
            shape.outline.forEach((pt, i) => i === 0 ? g.moveTo(1 + pt.x, 1 + pt.y) : g.lineTo(1 + pt.x, 1 + pt.y));
            g.closePath();
            g.fill();
        }
        return c;
    }

    // ---- right panel: inspector ----

    buildRightPanel() {
        this.right = this.panel(`right:0;top:${EditorUI.TOP}px;bottom:${EditorUI.BOTTOM}px;width:${EditorUI.RIGHT}px;padding:8px 12px`);
        this.inspector = this.el('div');
        this.problems = this.el('div');
        this.right.append(this.inspector, this.problems);
        this.root.append(this.right);
    }

    /** Rebuild the inspector if the selection changed, otherwise just refresh the values in it. */
    syncInspector() {
        const e = this.editor;
        const sel = e.selection;
        const key = sel ? `${sel.kind}:${sel.index ?? ''}:${LevelModel.refType(e.level, sel)}` : 'level';
        if (key === this.inspectorKey) {
            for (const [field, input] of this.inputs) {
                if (input === document.activeElement) continue;
                const desc = sel ? LevelModel.resolve(e.level, sel) : null;
                this.writeInput(input, field, desc);
            }
            if (!sel) this.syncLevelInfo();
            return;
        }
        this.inspectorKey = key;
        this.inputs.clear();
        this.inspector.replaceChildren();

        if (!sel) {
            this.buildLevelPanel();
            return;
        }
        const desc = LevelModel.resolve(e.level, sel);
        const type = LevelModel.refType(e.level, sel);
        const fields = type === 'Player' ? LevelModel.PLAYER_FIELDS : type === 'ExitDoor' ? LevelModel.EXIT_FIELDS : LevelModel.TYPES[type]?.fields;
        const title = type === 'Player' ? 'Player spawn' : type === 'ExitDoor' ? 'Exit door' : (LevelModel.TYPES[type]?.label || `Unknown: ${type}`);
        this.inspector.append(this.heading(title));
        if (!fields) {
            this.inspector.append(this.el('div', 'color:#999', {textContent: 'The editor does not know this type, so it is kept as is.'}));
        } else {
            for (const f of fields) this.inspector.append(this.fieldRow(f, desc));
        }
        if (sel.kind === 'entity') {
            const row = this.el('div', 'display:flex;gap:6px;margin-top:12px');
            row.append(this.button('Duplicate (Ctrl+D)', () => e.duplicateSelection()), this.button('Delete (Del)', () => e.deleteSelection(), '', 'color:#f77'));
            this.inspector.append(row);
        }
    }

    fieldRow(field, desc) {
        const e = this.editor;
        const row = this.el('label', 'display:flex;align-items:center;justify-content:space-between;gap:8px;margin:4px 0');
        row.append(this.el('span', 'color:#bbb', {textContent: field.label}));
        let input;
        const style = 'width:110px;background:#fff;color:#222;border:1px solid #888;border-radius:3px;padding:3px;font:12px Arial;box-sizing:border-box';
        if (field.kind === 'bool') {
            input = this.el('input', 'margin:0', {type: 'checkbox', on: {change: ev => e.setField(field, ev.target.checked)}});
        } else if (field.kind === 'enum') {
            input = this.el('select', style, {on: {change: ev => e.setField(field, ev.target.value === '' ? null : ev.target.value)}});
            if (field.nullable || field.optional || !field.required) input.append(this.el('option', '', {value: '', textContent: '(none)'}));
            for (const o of field.options) input.append(this.el('option', '', {value: o, textContent: o}));
        } else if (field.kind === 'text') {
            input = this.el('input', style, {type: 'text', on: {change: ev => e.setField(field, ev.target.value)}});
        } else {
            input = this.el('input', style, {type: 'number', step: field.integer ? 1 : 'any', min: field.min,
                on: {change: ev => { if (ev.target.value !== '') e.setField(field, Number(ev.target.value)); else this.writeInput(ev.target, field, LevelModel.resolve(e.level, e.selection)); }}});
        }
        this.inputs.set(field, input);
        this.writeInput(input, field, desc);
        row.append(input);
        return row;
    }

    writeInput(input, field, desc) {
        if (!desc) return;
        // A field the JSON doesn't carry shows the entity class's default, and is only written once edited
        const v = desc[field.key] === undefined ? field.default : desc[field.key];
        if (field.kind === 'bool') input.checked = !!v;
        else if (field.kind === 'enum') input.value = v === null || v === undefined ? '' : v;
        else input.value = v === undefined || v === null ? '' : v;
    }

    buildLevelPanel() {
        const e = this.editor;
        this.inspector.append(this.heading('Level'));
        const num = (value, min) => this.el('input', 'width:64px;background:#fff;color:#222;border:1px solid #888;border-radius:3px;padding:3px;box-sizing:border-box',
            {type: 'number', min, step: 1, value});
        this.colsInput = num(LevelModel.cols(e.level), 10);
        this.rowsInput = num(LevelModel.rows(e.level), 10);
        const size = this.el('div', 'display:flex;align-items:center;gap:6px;margin:4px 0');
        size.append('Size', this.colsInput, '×', this.rowsInput, 'tiles');
        this.inspector.append(size);
        this.inspector.append(this.el('div', 'display:flex;gap:6px;margin-top:6px', {},
            this.button('Resize', () => e.resizeLevel(Number(this.colsInput.value), Number(this.rowsInput.value)), 'Anchored at the top-left. Warns before cutting anything off'),
            this.button('Add border', () => e.addBorder(), 'Solid outer ring')));
        this.levelInfo = this.el('div', 'color:#aaa;margin-top:10px;line-height:1.6');
        this.inspector.append(this.levelInfo);
        this.inspector.append(this.el('div', 'color:#888;margin-top:10px;line-height:1.5', {
            textContent: 'Click something in the level with Select to edit it. Set how many levers the exit needs on the exit door.'}));
        this.syncLevelInfo();
    }

    syncLevelInfo() {
        if (!this.levelInfo) return;
        const level = this.editor.level;
        const need = level.exitDoor.levers ?? 0;
        this.levelInfo.textContent = `${level.entities.length} entities · ${LevelModel.countLevers(level)} levers · exit needs ${need}`;
        if (document.activeElement !== this.colsInput && document.activeElement !== this.rowsInput) {
            this.colsInput.value = LevelModel.cols(level);
            this.rowsInput.value = LevelModel.rows(level);
        }
    }

    /** Errors and warnings from validation; clicking one selects the thing it is about. */
    setProblems({errors, warnings}) {
        this.problems.replaceChildren();
        if (errors.length + warnings.length === 0) {
            this.problems.append(this.heading('Problems'), this.el('div', 'color:#7c7', {textContent: 'None. Ready to playtest.'}));
            return;
        }
        this.problems.append(this.heading(`Problems (${errors.length + warnings.length})`));
        const line = (item, color, label) => {
            const row = this.el('div', `color:${color};margin:3px 0;line-height:1.4;cursor:pointer`, {
                textContent: `${label} ${item.path ? item.path + ': ' : ''}${item.message}`,
                on: {click: () => this.editor.selectPath(item.path)}});
            this.problems.append(row);
        };
        errors.forEach(x => line(x, '#f88', 'Error'));
        warnings.forEach(x => line(x, '#fc6', 'Warning'));
    }

    // ---- status bar and top-bar state ----

    buildStatusBar() {
        this.status = this.panel(`left:0;bottom:0;width:100%;height:${EditorUI.BOTTOM}px;padding:5px 12px;display:flex;gap:16px;overflow:hidden;white-space:nowrap`);
        this.cursorInfo = this.el('span', 'min-width:230px;color:#ccc');
        this.hint = this.el('span', 'color:#999');
        this.status.append(this.cursorInfo, this.hint);
        this.root.append(this.status);
    }

    setCursorInfo(text) { this.cursorInfo.textContent = text; }
    setHint(text) {
        this.lastHint = text;
        if (!this.flashUntil || Date.now() > this.flashUntil) { this.hint.textContent = text; this.hint.style.color = '#999'; }
    }

    /** A short confirmation in the status bar ("Saved levels/level_05.json") that gives way to the hint again. */
    flash(text) {
        this.flashUntil = Date.now() + 4000;
        this.hint.textContent = text;
        this.hint.style.color = '#7c7';
        setTimeout(() => { if (Date.now() >= this.flashUntil) { this.hint.textContent = this.lastHint || ''; this.hint.style.color = '#999'; } }, 4100);
    }

    /** Highlight the active tool, tile and entity type, and enable or disable the buttons that depend on state. */
    syncToolState() {
        const e = this.editor;
        for (const [name, b] of this.toolButtons) this.setActive(b, e.tool === name);
        for (const [id, b] of this.tileButtons) {
            const on = e.tile === id && ['brush', 'rect', 'fill'].includes(e.tool);
            b.style.borderColor = on ? '#ffcc00' : (e.tile === id ? '#a88' : '#666');
            b.style.background = on ? '#665500' : '#444';
        }
        for (const [type, b] of this.placeButtons) this.setActive(b, e.tool === 'place' && e.placeType === type);
        this.setEnabled(this.btnUndo, e.history.canUndo);
        this.setEnabled(this.btnRedo, e.history.canRedo);
        this.btnSave.title = e.saveHint();
        this.name.textContent = `${e.name}${e.dirty ? ' *' : ''}`;
        this.name.style.color = e.dirty ? '#ffcc00' : '#ccc';
    }

    setPlayEnabled(ok) {
        this.setEnabled(this.btnPlay, ok);
        this.btnPlay.title = ok ? 'Play this level from the spawn (P)' : 'Fix the errors listed on the right first';
    }

    setVisible(visible) {
        this.root.style.display = visible ? 'block' : 'none';
    }

    // ---- dialogs ----

    /** A simple modal message. `lines` are shown one per row. */
    showDialog(title, lines, buttons = [{label: 'OK'}]) {
        const overlay = this.el('div', 'position:fixed;left:0;top:0;width:100%;height:100%;background:rgba(0,0,0,.6);display:flex;' +
            'align-items:center;justify-content:center;pointer-events:auto;z-index:2');
        overlay.dataset.modal = '1';   // the editor's key handler stands down while one is open
        const box = this.el('div', 'background:#2b2b2b;border:3px solid #555;border-radius:8px;padding:16px 20px;max-width:560px;' +
            'max-height:70vh;overflow:auto;box-shadow:0 0 20px #000;user-select:text');
        box.append(this.el('div', 'color:#ffcc00;font:bold 16px Molot,Arial;margin-bottom:10px', {textContent: title}));
        for (const l of lines) box.append(this.el('div', 'margin:4px 0;line-height:1.4', {textContent: l}));
        const row = this.el('div', 'display:flex;gap:8px;justify-content:flex-end;margin-top:14px');
        const close = () => overlay.remove();
        for (const b of buttons) row.append(this.button(b.label, () => { close(); if (b.action) b.action(); }));
        box.append(row);
        overlay.append(box);
        this.root.append(overlay);
        return close;
    }

    destroy() {
        this.root.remove();
    }
}

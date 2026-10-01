// The menus' artwork as inline SVG (title screen, Levels screen, instructions, the in-game menu icon), so it is crisp
// at any size and its text is real text. The builders return SVG markup strings and are pure (require()-able in Node);
// mountStickman runs the game's own vector stickman (stickman.js) on a canvas in a menu.
const UIArt = (() => {
    const FONT = "'Molot', 'Arial Black', sans-serif";

    // Round to keep the markup short and stable
    const n = v => Math.round(v * 100) / 100;

    function svg(w, h, body, extra = '') {
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="100%" height="100%" ${extra}>${body}</svg>`;
    }

    // A gear: teeth around a ring, with a hole (the red cogs on the title screen)
    function gear(cx, cy, r, teeth, color) {
        const pts = [];
        for (let i = 0; i < teeth * 2; i++) {
            const a = (i / (teeth * 2)) * Math.PI * 2;
            const rr = i % 2 === 0 ? r : r * 0.72;
            const a1 = a - Math.PI / (teeth * 4), a2 = a + Math.PI / (teeth * 4);
            pts.push(`${n(cx + Math.cos(a1) * rr)},${n(cy + Math.sin(a1) * rr)}`, `${n(cx + Math.cos(a2) * rr)},${n(cy + Math.sin(a2) * rr)}`);
        }
        return `<path d="M${pts.join('L')}Z M${n(cx + r * 0.32)},${cy} a${n(r * 0.32)},${n(r * 0.32)} 0 1,0 ${n(-r * 0.64)},0 a${n(r * 0.32)},${n(r * 0.32)} 0 1,0 ${n(r * 0.64)},0Z" fill="${color}" fill-rule="evenodd"/>`;
    }

    // The title screen's background: the pale wall with rows of rings and gears, a block cluster, and the logo.
    // Laid out as the old 980x743 BG image was.
    function titleBackground() {
        const W = 980, H = 743;
        let body = `<rect width="${W}" height="${H}" fill="#edf6f8"/>`;
        const cols = [79, 315, 552, 788];
        for (const x of cols) body += `<circle cx="${x}" cy="145" r="10" fill="none" stroke="#bdb6ae" stroke-width="4"/>`;
        for (const y of [381, 618]) for (const x of cols) body += gear(x, y, 16, 8, '#c8363a');
        // The block cluster on the right
        for (const [x, y] of [[848, 432], [886, 432], [848, 470], [886, 470]]) {
            body += `<rect x="${x}" y="${y}" width="28" height="28" rx="3" fill="#f6ecd7" stroke="#a69a8a" stroke-width="4"/>`;
        }
        // The logo
        body += `<text x="${W / 2}" y="265" text-anchor="middle" font-family="${FONT}" font-size="150" letter-spacing="2" fill="#0d0d0d">P.A.K.S</text>`;
        return svg(W, H, body, 'preserveAspectRatio="xMidYMid slice"');
    }

    // A four-pointed star with curved sides and a label, the title screen's buttons
    // The star turns by rotate; the label turns with it only up to 15°, so a star spun further still reads level.
    function starButton(label, {rotate = 0, size = 150, fontSize = 22, textRotate = Math.max(-15, Math.min(15, rotate))} = {}) {
        const c = 50, R = 48, r = 12;
        let d = '';
        for (let i = 0; i < 4; i++) {
            const a = (i / 4) * Math.PI * 2 - Math.PI / 2;
            const b = a + Math.PI / 4, next = a + Math.PI / 2;
            const tip = [c + Math.cos(a) * R, c + Math.sin(a) * R];
            const ctrl = [c + Math.cos(b) * r, c + Math.sin(b) * r];
            const tip2 = [c + Math.cos(next) * R, c + Math.sin(next) * R];
            d += (i === 0 ? `M${n(tip[0])},${n(tip[1])}` : '') + `Q${n(ctrl[0])},${n(ctrl[1])} ${n(tip2[0])},${n(tip2[1])}`;
        }
        const lines = label.split('\n');
        const text = lines.map((line, i) => `<text x="50" y="${n(52 + (i - (lines.length - 1) / 2) * fontSize * 0.42)}" text-anchor="middle" dominant-baseline="middle" font-family="${FONT}" font-size="${fontSize * 0.42}" fill="#0d0d0d">${line}</text>`).join('');
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${size}" height="${size}" role="img" aria-label="${label.replace('\n', ' ')}">` +
            `<path transform="rotate(${rotate} 50 50)" d="${d}Z" fill="#ffffff" stroke="#8e8e8e" stroke-width="3" stroke-linejoin="round"/>` +
            `<g transform="rotate(${textRotate} 50 50)">${text}</g></svg>`;
    }

    /**
     * Run the game's stickman on a canvas in a menu (browser only). pose: 'leap' (a hop on the spot, for the title
     * logo) or 'idle'. Returns a stop function; it also stops by itself once the canvas leaves the page.
     */
    function mountStickman(canvas, {pose = 'idle', facing = 1, scale = 1} = {}) {
        if (typeof Stickman === 'undefined' || !canvas.getContext) return () => {};
        const ctx = canvas.getContext('2d');
        const rig = new Stickman.Rig();
        let last = performance.now(), t = 0, running = true;
        const frame = now => {
            if (!running || !canvas.isConnected) return;
            const dt = Math.min(0.1, (now - last) / 1000);
            last = now;
            t += dt;
            const dpr = window.devicePixelRatio || 1;
            const w = canvas.clientWidth, h = canvas.clientHeight;
            if (canvas.width !== Math.round(w * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
            let height = 0, input;
            if (pose === 'leap') {
                // A hop every 1.4 s: up and down along a jump arc, a short squat on landing
                const cycle = t % 1.4, air = Math.min(cycle, 0.85), vy = -900 + 2120 * air;
                height = cycle < 0.85 ? -(-900 * air + 1060 * air * air) : 0;
                input = cycle < 0.85 ? {state: vy < 0 ? 'jump' : 'fall', vx: 200 * facing, vy, grounded: false, facing}
                    : {state: 'idle', vx: 0, vy: 0, grounded: true, facing};
            } else {
                input = {state: 'idle', vx: 0, vy: 0, grounded: true, facing};
            }
            rig.update(dt, input);
            ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
            ctx.clearRect(0, 0, w / scale, h / scale);
            const groundY = h / scale - 4;
            if (pose !== 'leap') Stickman.drawShadow(ctx, w / scale / 2, groundY, 0);
            Stickman.draw(ctx, rig.joints(w / scale / 2, groundY - Math.max(0, height) * 0.25));
            requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
        return () => { running = false; };
    }

    // ---- Levels screen ---------------------------------------------------------------------------------------------
    // The scene is laid out in the old 1800x1080 background picture's own coordinates, shown at the same size and place
    // (fitted to the 980-wide screen and centred), so every button that sits on it lines up as before.

    const KEY_ROWS = [319, 419, 519, 621];
    const KEY_COLS = [167, 312, 466];
    const DOT_COLS = [226, 375, 527];

    function starShape(cx, cy, r, color) {
        const pts = [];
        for (let i = 0; i < 10; i++) {
            const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r;
            pts.push(`${n(cx + Math.cos(a) * rr)},${n(cy + Math.sin(a) * rr)}`);
        }
        return `<polygon points="${pts.join(' ')}" fill="${color}" stroke="#c99a00" stroke-width="1.5" stroke-linejoin="round"/>`;
    }

    function keycap(cx, cy, label, {star = false} = {}) {
        let s = `<rect x="${cx - 28}" y="${cy - 26}" width="56" height="52" rx="9" fill="#0b0b0b"/>`;
        if (star) {
            s += starShape(cx - 9, cy - 1, 11, '#f5c518');
            s += `<text x="${cx + 12}" y="${cy + 12}" text-anchor="middle" font-family="${FONT}" font-size="34" fill="#fff">${label}</text>`;
        } else {
            s += `<text x="${cx}" y="${cy + 13}" text-anchor="middle" font-family="${FONT}" font-size="36" fill="#fff">${label}</text>`;
        }
        return s;
    }

    // The navigation keys: <|> (back to the title) and >< (back to the game)
    function navKey(cx, cy, kind) {
        let s = `<rect x="${cx - 28}" y="${cy - 26}" width="56" height="52" rx="9" fill="#0b0b0b"/>`;
        const w = 'stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" fill="none"';
        if (kind === 'open') {
            s += `<path d="M${cx - 6},${cy - 11} l-11,11 l11,11 M${cx + 6},${cy - 11} l11,11 l-11,11" ${w}/>` +
                `<line x1="${cx}" y1="${cy - 13}" x2="${cx}" y2="${cy + 13}" ${w}/>`;
        } else {
            s += `<path d="M${cx - 18},${cy - 11} l11,11 l-11,11 M${cx + 18},${cy - 11} l-11,11 l11,11" ${w}/>`;
        }
        return s;
    }

    function levelsScene() {
        let b = '';
        // Wall, skirting and floor
        b += '<rect width="1800" height="800" fill="#c2b5a0"/>';
        b += '<rect y="798" width="1800" height="94" fill="#6b7080"/>';
        b += '<rect y="890" width="1800" height="190" fill="#a9b0ba"/>';
        // Floor-number panel
        b += '<rect x="63" y="212" width="559" height="614" rx="40" fill="#000"/>';
        b += '<rect x="107" y="261" width="472" height="515" rx="36" fill="#d3d3d3"/>';
        KEY_ROWS.forEach((y, r) => KEY_COLS.forEach((x, c) => {
            const floor = r * 3 + c + 1, dx = r >= 2 ? 2 : 0;
            b += keycap(x + dx, y, String(floor), {star: floor === 1});
            b += `<circle cx="${DOT_COLS[c] + dx}" cy="${y + 1}" r="18" fill="#0b0b0b"/>`;
        }));
        b += navKey(236, 708, 'open') + '<circle cx="296" cy="708" r="18" fill="#0b0b0b"/>';
        b += navKey(382, 708, 'close') + '<circle cx="444" cy="708" r="18" fill="#0b0b0b"/>';
        // The lift: white frame, steel interior, open doors folded to the sides, floor
        b += '<rect x="655" y="192" width="628" height="703" fill="#f5f5f5"/>';
        b += '<rect x="702" y="240" width="534" height="655" fill="#c3cdd6"/>';
        b += '<rect x="808" y="240" width="322" height="470" fill="#9ea8b2"/>';
        for (const x of [893, 968, 1043]) b += `<line x1="${x}" y1="240" x2="${x}" y2="705" stroke="#86909a" stroke-width="3"/>`;
        b += '<rect x="725" y="240" width="35" height="620" fill="#e4e8ec"/><rect x="1178" y="240" width="35" height="620" fill="#e4e8ec"/>';
        b += '<rect x="702" y="240" width="534" height="14" fill="#b4bec8"/>';
        b += '<polygon points="808,705 1130,705 1176,860 760,860" fill="#6b7080"/>';
        // Fire and emergency panel
        b += '<rect x="1340" y="282" width="227" height="483" rx="26" fill="#ee0000"/>';
        b += '<rect x="1352" y="304" width="202" height="429" rx="20" fill="#d8d8d8"/>';
        b += '<rect x="1387" y="319" width="133" height="176" fill="#ed1c24" stroke="#b5121b" stroke-width="2"/>';
        // Stairs, a runner and a flame
        b += '<path d="M1406,412 h20 v-18 h20 v-18 h20 v-18 h14" fill="none" stroke="#fff" stroke-width="4" stroke-linejoin="round"/>';
        b += '<circle cx="1424" cy="340" r="5" fill="#fff"/>';
        b += '<path d="M1424,347 l-3,16 l8,10 M1421,363 l-9,10 M1422,352 l10,4 M1422,352 l-8,6" stroke="#fff" stroke-width="4" stroke-linecap="round" fill="none"/>';
        b += '<path d="M1484,397 c-14,-8 -12,-24 -2,-34 c0,10 6,12 8,6 c8,10 10,22 -6,28 z M1494,397 c-6,-4 -4,-12 2,-16 c4,8 6,12 -2,16 z" fill="#fff"/>';
        b += `<g font-family="Arial Narrow, Arial, sans-serif" font-weight="bold" font-size="12.5" fill="#fff" text-anchor="middle">` +
            `<text x="1453" y="442">IN CASE OF FIRE</text><text x="1453" y="462">DO NOT USE ELEVATOR</text><text x="1453" y="482">USE STAIRS</text></g>`;
        // Emergency phone
        b += '<rect x="1387" y="514" width="133" height="76" fill="#111"/>';
        b += '<path d="M1428,537 q25,-18 50,0 l-6,8 q-19,-10 -38,0 z" fill="#fff"/>';
        b += `<text x="1453" y="556" text-anchor="middle" font-family="Arial, sans-serif" font-weight="bold" font-size="12" fill="#fff">EMERGENCY PHONE</text>`;
        for (let i = 0; i < 18; i++) b += `<circle cx="${1398 + i * 6}" cy="${566 + (i % 3) * 3}" r="1.2" fill="#ddd"/>`;
        // Pill buttons: emergency call, alert and a small one (the mystery floors' signs sit on their round buttons)
        b += '<rect x="1372" y="616" width="162" height="36" rx="18" fill="#111"/><circle cx="1391" cy="634" r="13" fill="#9a9a9a" stroke="#ee0000" stroke-width="4"/>';
        b += `<text x="1468" y="639" text-anchor="middle" font-family="${FONT}" font-size="13" fill="#ee0000">EMERGENCY CALL</text>`;
        b += '<rect x="1364" y="674" width="81" height="33" rx="16" fill="#111"/><circle cx="1382" cy="690" r="12" fill="#9a9a9a" stroke="#ee0000" stroke-width="4"/>';
        b += `<text x="1418" y="696" text-anchor="middle" font-family="${FONT}" font-size="13" fill="#ee0000">ALERT</text>`;
        b += '<rect x="1461" y="674" width="82" height="33" rx="16" fill="#111"/><circle cx="1478" cy="690" r="4" fill="none" stroke="#bbb" stroke-width="2"/>';
        b += '<circle cx="1502" cy="690" r="10" fill="#9a9a9a" stroke="#ee0000" stroke-width="3"/><circle cx="1527" cy="690" r="4" fill="none" stroke="#bbb" stroke-width="2"/>';
        return svg(1800, 1080, b, 'preserveAspectRatio="xMidYMid meet"');
    }

    // A floor's round button (sits on the panel's black dot)
    function floorButton() {
        return svg(16, 16, '<circle cx="8" cy="8" r="6.6" fill="rgba(0,0,0,0.15)" stroke="#5a5a5a" stroke-width="1.8"/>');
    }

    function padlock() {
        return svg(24, 24, '<path d="M7.5,11 V7.5 a4.5,4.5 0 0 1 9,0 V11" fill="none" stroke="#000" stroke-width="3.6"/>' +
            '<path d="M7.5,11 V7.5 a4.5,4.5 0 0 1 9,0 V11" fill="none" stroke="#4a5a66" stroke-width="1.6"/>' +
            '<rect x="4.5" y="10.5" width="15" height="11.5" rx="2" fill="#fbbf0a" stroke="#000" stroke-width="1.6"/>' +
            '<path d="M12,14 a1.6,1.6 0 0 1 1,2.9 l0.8,2.6 h-3.6 l0.8,-2.6 A1.6,1.6 0 0 1 12,14 z" fill="#4a5a66" stroke="#000" stroke-width="0.8"/>');
    }

    // The mystery floors' signs
    function toxicSign() {
        return svg(100, 100, '<path d="M50,8 L94,88 H6 Z" fill="#f5d90a" stroke="#000" stroke-width="7" stroke-linejoin="round"/>' +
            '<circle cx="50" cy="44" r="11" fill="#000"/><rect x="44" y="50" width="12" height="9" rx="2" fill="#000"/>' +
            '<circle cx="46" cy="44" r="3" fill="#f5d90a"/><circle cx="54" cy="44" r="3" fill="#f5d90a"/>' +
            '<path d="M36,58 L64,72 M64,58 L36,72" stroke="#000" stroke-width="5" stroke-linecap="round"/>' +
            '<text x="50" y="84" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="13" fill="#000">TOXIC</text>');
    }

    function radiationSign() {
        let s = '<path d="M50,8 L94,88 H6 Z" fill="#ff2233" stroke="#000" stroke-width="7" stroke-linejoin="round"/><circle cx="50" cy="60" r="4.5" fill="#000"/>';
        const p = (r, ang) => `${n(50 + Math.cos(ang) * r)},${n(60 + Math.sin(ang) * r)}`;
        for (let i = 0; i < 3; i++) {
            const a = -Math.PI / 2 + i * (2 * Math.PI / 3), a1 = a - 0.5, a2 = a + 0.5;
            s += `<path d="M${p(7, a1)} L${p(20, a1)} A20,20 0 0 1 ${p(20, a2)} L${p(7, a2)} A7,7 0 0 0 ${p(7, a1)} Z" fill="#000"/>`;
        }
        return svg(100, 100, s);
    }

    function cautionSign() {
        let stripes = '';
        for (let i = -4; i < 6; i++) stripes += `<path d="M${i * 22},100 l40,-100 h11 l-40,100 z" fill="#000"/>`;
        return svg(100, 100, '<defs><clipPath id="cautionClip"><circle cx="50" cy="50" r="46"/></clipPath></defs>' +
            '<circle cx="50" cy="50" r="48" fill="#f5d90a" stroke="#000" stroke-width="3"/>' +
            `<g clip-path="url(#cautionClip)">${stripes}</g>` +
            '<rect x="4" y="38" width="92" height="24" fill="#000"/>' +
            '<text x="50" y="57" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="18" fill="#f5d90a">CAUTION</text>');
    }

    // The P.A.K.S sign above the lift (it is floor 16's hidden button)
    function paksSign() {
        return svg(140, 52, '<rect x="2" y="2" width="136" height="48" rx="24" fill="#585858"/><rect x="9" y="8" width="122" height="36" rx="17" fill="#fff"/>' +
            `<text x="70" y="38" text-anchor="middle" font-family="${FONT}" font-size="30" fill="#0b0b0b">P.A.K.S</text>`);
    }

    const ICONS = {
        reset: '<rect x="-11" y="-11" width="22" height="22" rx="4" fill="#15a6e8"/>' +
            '<path d="M-5,-2 a6,6 0 0 1 10,-3 M5,2 a6,6 0 0 1 -10,3" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/>' +
            '<path d="M6,-9 v5 h-5 M-6,9 v-5 h5" fill="none" stroke="#fff" stroke-width="2.6" stroke-linejoin="round"/>',
        home: '<path d="M-11,1 L0,-10 L11,1" fill="none" stroke="#e8562a" stroke-width="3.5" stroke-linejoin="round"/>' +
            '<rect x="-7.5" y="0" width="15" height="10" fill="#f4b04a"/><rect x="-2.5" y="3" width="5" height="7" fill="#7a4a1e"/>',
        instruction: '<rect x="-10" y="-6" width="5" height="12" fill="#e2203a"/><rect x="-3" y="-8" width="4" height="16" fill="#fff" stroke="#e2203a" stroke-width="1.5"/>' +
            '<rect x="3" y="-4" width="6" height="8" fill="#e2203a"/>',
    };

    // The grey elevator-panel buttons under the scene: an icon and a label
    function panelButton(label, icon, {width = 215, height = 54} = {}) {
        // As big as the button allows, but a long label is narrowed to fit beside the icon (Molot runs about 0.6em a letter)
        const room = width - height * 0.62 - 30;
        const fontSize = Math.round(Math.min(height * 0.44, room / (label.length * 0.6)));
        return svg(width, height, `<rect x="2.5" y="2.5" width="${width - 5}" height="${height - 5}" rx="${n(height * 0.22)}" fill="#b9bdc2" stroke="#585858" stroke-width="5"/>` +
            `<g transform="translate(${n(height * 0.62)},${n(height / 2)})">${ICONS[icon] || ''}</g>` +
            `<text x="${n((width + height * 0.62 + 12) / 2)}" y="${n(height / 2 + fontSize * 0.36)}" text-anchor="middle" font-family="${FONT}" font-size="${fontSize}" fill="#0b0b0b">${label}</text>`);
    }

    // The header over the floor panel, with a blue arrow at each end
    function clickLevelsHeader() {
        const arrow = (x, up) => `<rect x="${x}" y="15" width="24" height="24" rx="3" fill="#18a8f0"/>` +
            `<path d="${up ? `M${x + 5},33 h14 l-7,-12 z` : `M${x + 5},21 h14 l-7,12 z`}" fill="#fff"/>`;
        return svg(298, 54, '<rect x="3" y="3" width="292" height="48" rx="22" fill="#b9bdc2" stroke="#585858" stroke-width="6"/>' +
            arrow(17, true) + arrow(257, false) +
            `<text x="149" y="36" text-anchor="middle" font-family="${FONT}" font-size="24" fill="#0b0b0b">CLICK LEVELS HERE</text>`);
    }

    // The in-game menu button's icon
    function menuIcon() {
        return svg(130, 120, '<rect x="8" y="6" width="114" height="108" rx="26" fill="#8a8a8a"/><rect x="18" y="16" width="94" height="88" rx="18" fill="#f3f3f3"/>' +
            '<g fill="#8a8a8a"><rect x="30" y="30" width="70" height="13" rx="6.5"/><rect x="30" y="54" width="70" height="13" rx="6.5"/><rect x="30" y="78" width="70" height="13" rx="6.5"/></g>');
    }

    /** SVG markup as a CSS url(), for places that need an image (a background-image). */
    function dataUri(markup) {
        return `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}")`;
    }

    // ---- Instructions sheet ----------------------------------------------------------------------------------------

    function keyIcon(label, opts) { return svg(60, 56, keycap(30, 28, label, opts)); }
    function navIcon(kind) { return svg(60, 56, navKey(30, 28, kind)); }
    function dotIcon() { return svg(24, 24, '<circle cx="12" cy="12" r="9" fill="#0b0b0b"/><circle cx="12" cy="12" r="5" fill="none" stroke="#5a5a5a" stroke-width="2"/>'); }

    function warningIcon() {
        return svg(24, 24, '<path d="M12,2 L23,21 H1 Z" fill="#f5b800" stroke="#a87b00" stroke-width="1.2" stroke-linejoin="round"/>' +
            '<rect x="11" y="8" width="2.4" height="7" rx="1" fill="#000"/><circle cx="12.2" cy="17.6" r="1.4" fill="#000"/>');
    }

    function sirenIcon() {
        return svg(24, 24, '<rect x="4" y="18" width="16" height="4" rx="1" fill="#555"/><path d="M6,18 V12 a6,6 0 0 1 12,0 V18 Z" fill="#e2203a"/>' +
            '<path d="M9,11 a3,3 0 0 1 3,-3" stroke="#fff" stroke-width="1.6" fill="none"/>' +
            '<path d="M2,8 l3,1.5 M22,8 l-3,1.5 M12,1 v3" stroke="#e2203a" stroke-width="1.8" stroke-linecap="round"/>');
    }

    // W above A S D, as small keyboard keys
    function wasdIcon() {
        const key = (x, y, l) => `<rect x="${x}" y="${y}" width="20" height="20" rx="4" fill="#e6e6e6" stroke="#9a9a9a" stroke-width="2"/>` +
            `<text x="${x + 10}" y="${y + 14.5}" text-anchor="middle" font-family="Arial, sans-serif" font-weight="bold" font-size="11" fill="#555">${l}</text>`;
        return svg(70, 46, key(25, 2, 'W') + key(2, 24, 'A') + key(25, 24, 'S') + key(48, 24, 'D'));
    }

    /**
     * The Levels screen's instructions sheet as HTML: real text, the floor keys and padlocks as SVG, and canvases
     * marked data-art for the game's own drawings of its entities (see paintInstructionArt).
     */
    function instructionsSheet() {
        const row = (inner, extra = '') => `<div style="display:flex;align-items:center;justify-content:center;gap:6px;${extra}">${inner}</div>`;
        const icon = (markup, w, h) => `<span style="display:inline-block;width:${w}px;height:${h}px">${markup}</span>`;
        const art = (name, w, h) => `<canvas data-art="${name}" style="width:${w}px;height:${h}px"></canvas>`;
        const text = (s, extra = '') => `<p style="margin:0;font:13px/1.25 ${FONT};color:#111;letter-spacing:.5px;${extra}">${s}</p>`;
        return `<div style="box-sizing:border-box;width:100%;height:100%;padding:16px 22px;background:#cfd2d6;border:7px solid #4e5054;` +
            `border-radius:30px;display:flex;flex-direction:column;gap:9px;overflow:hidden">` +
            row(icon(warningIcon(), 26, 26) + `<h2 style="margin:0;font:24px ${FONT};color:#0b0b0b;letter-spacing:1px">ELEVATOR INSTRUCTIONS</h2>` + icon(sirenIcon(), 26, 26)) +
            row(icon(keyIcon('1', {star: true}), 34, 32) + icon(dotIcon(), 18, 18) + '<span style="width:18px"></span>' +
                icon(keyIcon('2'), 34, 32) + icon(padlock(), 20, 20) + '<span style="width:18px"></span>' +
                icon(keyIcon('3'), 34, 32) + icon(padlock(), 20, 20)) +
            text('. PLAYERS CAN NAVIGATE THROUGH THE LEVEL SELECTION, BUT EACH LEVEL WILL ONLY UNLOCK AFTER THE PLAYERS HAVE SUCCESSFULLY COMPLETED THE PRECEDING LEVEL.', 'text-align:center') +
            row(`<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:2px">${row(icon(navIcon('open'), 34, 32) + icon(dotIcon(), 18, 18))}${text('WELCOME SCREEN')}</div>` +
                `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:2px">${row(icon(navIcon('close'), 34, 32) + icon(dotIcon(), 18, 18))}${text('BACK TO THE GAME')}</div>`) +
            row(`<div style="flex:1;display:flex;align-items:center;gap:8px">${icon(wasdIcon(), 62, 41)}<div>${text('. A &amp; D = WALK')}${text('. W / SPACE = JUMP')}${text('. S = CROUCH &amp; SLIDE')}${text('. SHIFT = SPEED RUN')}</div></div>` +
                `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:3px">${row(art('spike', 30, 30) + art('rocket', 40, 30) + art('launcher', 32, 30))}${text('. ALWAYS WATCH OUT FOR THE HAZARDS', 'text-align:center')}</div>`) +
            row(`<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:3px">${row(art('lever-up', 24, 36) + art('lever-down', 24, 36))}${text('. THE PLAYER NEEDS TO FLIP THE LEVERS TO UNLOCK THE DOOR', 'text-align:center')}</div>` +
                `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:3px">${art('door', 30, 36)}${text('. THE ELEVATOR DOOR SENDS YOU TO THE NEXT LEVEL', 'text-align:center')}</div>`) +
            `</div>`;
    }

    // The entity drawings for the instructions sheet, each fitted into its canvas (browser only)
    const INSTRUCTION_ART = {
        spike: {w: 40, h: 40, draw: (A, c) => A.spike(c, {x: 0, y: 0, width: 40, height: 40, spin: 20})},
        rocket: {w: 52, h: 30, draw: (A, c) => A.rocket(c, {x: 14, y: 0, width: 30, height: 30, direction: 'RIGHT', age: 0.3, seed: 0.4})},
        launcher: {w: 58, h: 54, draw: (A, c) => A.launcher(c, {x: 0, y: 0, width: 58, height: 54, shotdirec: 'LEFT', time: 1, atkspd: 2})},
        'lever-up': {w: 37, h: 54, draw: (A, c) => A.lever(c, {x: 0, y: 0, width: 23, height: 53, isFlipped: false}, 0)},
        'lever-down': {w: 37, h: 54, draw: (A, c) => A.lever(c, {x: 0, y: 0, width: 23, height: 53, isFlipped: false}, 1)},
        door: {w: 69, h: 82, draw: (A, c) => A.exitDoor(c, {x: 0, y: 0, width: 276, height: 326, scale: 0.25}, true, 0)},
    };

    function paintInstructionArt(root) {
        if (typeof EntityArt === 'undefined') return;
        const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
        for (const canvas of root.querySelectorAll('canvas[data-art]')) {
            const spec = INSTRUCTION_ART[canvas.dataset.art];
            if (!spec) continue;
            const w = parseFloat(canvas.style.width), h = parseFloat(canvas.style.height);
            canvas.width = Math.round(w * dpr);
            canvas.height = Math.round(h * dpr);
            const ctx = canvas.getContext('2d');
            const k = Math.min(w / spec.w, h / spec.h);
            ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * (w - spec.w * k) / 2, dpr * (h - spec.h * k) / 2);
            spec.draw(EntityArt, ctx);
        }
    }

    return {FONT, svg, gear, titleBackground, starButton, mountStickman, levelsScene, floorButton, padlock, toxicSign,
        radiationSign, cautionSign, paksSign, panelButton, clickLevelsHeader, menuIcon, dataUri, instructionsSheet,
        paintInstructionArt, INSTRUCTION_ART, KEY_ROWS, KEY_COLS, DOT_COLS};
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = UIArt;
}

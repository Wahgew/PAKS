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

    return {FONT, svg, gear, titleBackground, starButton, mountStickman};
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = UIArt;
}

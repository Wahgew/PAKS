// Vector drawings of the level's entities: the spike, the projectile launcher and its projectiles, the lever and the
// exit door. They replace the PNG sprites and keep each sprite's footprint and look, with small animations the
// images couldn't do. Pure drawing: no DOM or game dependencies (a global in the browser, require()-able in Node).
// Anything that animates takes its progress as an argument, so the entity classes own all state.
const EntityArt = (() => {
    const TAU = Math.PI * 2;
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const ease = t => t * t * (3 - 2 * t);

    const COLORS = {
        sawLight: '#b3292b',
        sawDark: '#8c1d20',
        sawEdge: 'rgba(255, 235, 235, 0.55)',
        housing: '#1c1c1f',
        housingEdge: '#3a3a40',
        metal: '#8d9097',
        metalDark: '#6c6f76',
        arrow: '#e0312f',
        plate: '#56585e',
        plateEdge: '#3d3f44',
        slot: '#18181a',
        knobOff: '#e32b2b',
        knobOn: '#2fcf55',
        frame: '#d3dee6',
        door: '#9aa4ad',
        doorShade: '#87919a',
        doorTop: '#5a6168',
        seam: '#151719',
        car: '#2b2f35',
        carLight: 'rgba(255, 221, 150, 0.75)',
        panel: '#8c949b',
        indicatorBox: '#1b1c1f',
        locked: '#d8283a',
        unlocked: '#34d058',
    };

    // A saw blade outline: teeth around the rim, as one path. hook > 0 sweeps each tooth forward like a ripsaw
    // (the spike); hook = 0 gives rounded waves (the projectile).
    function sawPath(ctx, cx, cy, radius, angle, teeth, hook) {
        const root = radius * 0.74;
        const step = TAU / teeth;
        ctx.moveTo(cx + Math.cos(angle) * root, cy + Math.sin(angle) * root);
        for (let i = 0; i < teeth; i++) {
            const a = angle + i * step;
            const tip = a + step * (0.55 + hook * 0.25);
            const back = a + step;
            // Up the front face to the tip, then a curved gullet back down to the next tooth's root
            const fx = cx + Math.cos(a + step * 0.12) * radius * 0.93, fy = cy + Math.sin(a + step * 0.12) * radius * 0.93;
            ctx.quadraticCurveTo(fx, fy, cx + Math.cos(tip) * radius, cy + Math.sin(tip) * radius);
            const g = a + step * (0.9 - hook * 0.15);
            ctx.quadraticCurveTo(cx + Math.cos(g) * root * 0.92, cy + Math.sin(g) * root * 0.92,
                cx + Math.cos(back) * root, cy + Math.sin(back) * root);
        }
        ctx.closePath();
    }

    // A two-tone red blade (lit from the lower left, as the old sprites were) with a real hole in the middle
    function saw(ctx, cx, cy, radius, angle, {teeth = 12, hook = 1, hole = 0.3, alpha = 1} = {}) {
        ctx.save();
        ctx.globalAlpha *= alpha;
        ctx.beginPath();
        sawPath(ctx, cx, cy, radius, angle, teeth, hook);
        ctx.moveTo(cx + radius * hole, cy);
        ctx.arc(cx, cy, radius * hole, 0, TAU, true);
        const g = ctx.createLinearGradient(cx - radius, cy + radius, cx + radius, cy - radius);
        g.addColorStop(0, COLORS.sawLight);
        g.addColorStop(0.5, COLORS.sawLight);
        g.addColorStop(0.5, COLORS.sawDark);
        g.addColorStop(1, COLORS.sawDark);
        ctx.fillStyle = g;
        ctx.fill('evenodd');
        ctx.lineWidth = Math.max(0.8, radius * 0.05);
        ctx.strokeStyle = COLORS.sawEdge;
        ctx.lineJoin = 'round';
        ctx.stroke();
        ctx.restore();
    }

    // ---- Hazards ---------------------------------------------------------------------------------------------------

    // spike: {x, y, width, height, spin (degrees, as the Spike class keeps it)}
    function spike(ctx, s) {
        const cx = s.x + s.width / 2, cy = s.y + s.height / 2, r = Math.min(s.width, s.height) / 2 - 0.5;
        const a = (s.spin || 0) * Math.PI / 180;
        // Two faint copies just behind the blade read as spin, even in a still frame
        saw(ctx, cx, cy, r, a - 0.16, {alpha: 0.12});
        saw(ctx, cx, cy, r, a - 0.08, {alpha: 0.22});
        saw(ctx, cx, cy, r, a);
    }

    const DIRECTION = {LEFT: {x: -1, y: 0}, RIGHT: {x: 1, y: 0}, UP: {x: 0, y: -1}, DOWN: {x: 0, y: 1}};

    // projectile: {x, y, width, height, spin, direction}
    function projectile(ctx, p) {
        const cx = p.x + p.width / 2, cy = p.y + p.height / 2, r = Math.min(p.width, p.height) / 2 - 0.5;
        const d = DIRECTION[p.direction] || {x: 0, y: 0};
        // A short trail behind it
        ctx.save();
        for (let i = 3; i >= 1; i--) {
            ctx.globalAlpha = 0.09 * (4 - i);
            ctx.fillStyle = COLORS.sawLight;
            ctx.beginPath();
            ctx.arc(cx - d.x * i * r * 0.45, cy - d.y * i * r * 0.45, r * (1 - i * 0.12), 0, TAU);
            ctx.fill();
        }
        ctx.restore();
        saw(ctx, cx, cy, r, (p.spin || 0) * Math.PI / 180, {teeth: 13, hook: 0, hole: 0.24});
    }

    const LAUNCHER_ROTATION = {LEFT: 0, UP: Math.PI / 2, RIGHT: Math.PI, DOWN: Math.PI * 1.5};

    function roundRect(ctx, x, y, w, h, r) {
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
    }

    // launcher: {x, y, width, height, shotdirec, time (seconds since the last shot), atkspd (seconds between shots)}.
    // Drawn facing left and rotated about its centre, as the sprite was. It recoils and flashes as it fires, and a
    // light on its back warms up before each shot.
    function launcher(ctx, l) {
        const w = l.width, h = l.height;
        const since = Math.max(0, l.time || 0);
        const charge = l.atkspd > 0 ? clamp(since / l.atkspd, 0, 1) : 0;
        const kick = since < 0.14 ? (1 - since / 0.14) * 4 : 0;
        ctx.save();
        ctx.translate(l.x + w / 2, l.y + h / 2);
        ctx.rotate(LAUNCHER_ROTATION[l.shotdirec] || 0);
        ctx.translate(-w / 2 + kick, -h / 2);

        // Housing: a dark U open to the left, with a steel barrel inside
        ctx.beginPath();
        roundRect(ctx, 0, 0, w, h, 5);
        ctx.fillStyle = COLORS.housing;
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = COLORS.housingEdge;
        ctx.stroke();
        const bx = 0, by = h * 0.22, bw = w * 0.74, bh = h * 0.56;
        const g = ctx.createLinearGradient(0, by, 0, by + bh);
        g.addColorStop(0, COLORS.metal);
        g.addColorStop(1, COLORS.metalDark);
        ctx.fillStyle = g;
        ctx.fillRect(bx, by, bw, bh);

        // Arrow pointing out of the mouth
        ctx.beginPath();
        ctx.moveTo(w * 0.04, h / 2);
        ctx.lineTo(w * 0.24, h * 0.3);
        ctx.lineTo(w * 0.24, h * 0.42);
        ctx.lineTo(w * 0.46, h * 0.42);
        ctx.lineTo(w * 0.46, h * 0.58);
        ctx.lineTo(w * 0.24, h * 0.58);
        ctx.lineTo(w * 0.24, h * 0.7);
        ctx.closePath();
        ctx.fillStyle = COLORS.arrow;
        ctx.fill();

        // Charge light on the back
        ctx.beginPath();
        ctx.arc(w * 0.87, h / 2, Math.min(w, h) * 0.07, 0, TAU);
        ctx.fillStyle = `rgba(255, ${Math.round(70 - 50 * charge)}, ${Math.round(60 - 40 * charge)}, ${0.25 + 0.75 * charge * charge})`;
        ctx.fill();

        // Muzzle flash just after a shot
        if (since < 0.1) {
            ctx.globalAlpha = 1 - since / 0.1;
            const f = ctx.createRadialGradient(0, h / 2, 0, 0, h / 2, h * 0.45);
            f.addColorStop(0, 'rgba(255, 240, 200, 0.95)');
            f.addColorStop(1, 'rgba(255, 120, 60, 0)');
            ctx.fillStyle = f;
            ctx.beginPath();
            ctx.arc(0, h / 2, h * 0.45, 0, TAU);
            ctx.fill();
        }
        ctx.restore();
    }

    // ---- Lever -----------------------------------------------------------------------------------------------------

    // The lever's drawing is the old sprite's size (half of 73x107), wider than its 23x53 hitbox as the sprite was
    const LEVER_ART = {w: 36.5, h: 53.5};

    // lever: {x, y, width, height, isFlipped}; flip: 0 = up (not pulled) .. 1 = down (pulled)
    function lever(ctx, lv, flip) {
        const t = ease(clamp(flip, 0, 1));
        ctx.save();
        if (lv.isFlipped) {
            ctx.translate(lv.x + lv.width / 2, 0);
            ctx.scale(-1, 1);
            ctx.translate(-(lv.x + lv.width / 2), 0);
        }
        const x = lv.x, y = lv.y;
        // Base plate with the slot
        ctx.beginPath();
        roundRect(ctx, x + 1, y + 1, 21, 51.5, 3);
        ctx.fillStyle = COLORS.plate;
        ctx.fill();
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = COLORS.plateEdge;
        ctx.stroke();
        ctx.fillStyle = COLORS.slot;
        ctx.fillRect(x + 9, y + 7, 5, 39.5);

        // Handle swinging from up-right (-45°) to down-right (+45°) about the slot's middle
        const px = x + 11.5, py = y + 26.75;
        const a = -Math.PI / 4 + t * Math.PI / 2;
        const len = 19;   // level with the pivot mid-swing, the knob still ends inside the old sprite's width
        const kx = px + Math.cos(a) * len, ky = py + Math.sin(a) * len;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(kx, ky);
        ctx.lineCap = 'round';
        ctx.lineWidth = 3.5;
        ctx.strokeStyle = COLORS.slot;
        ctx.stroke();

        // Knob: red until pulled, then green
        const r = 5.5;
        ctx.beginPath();
        ctx.arc(kx, ky, r, 0, TAU);
        ctx.fillStyle = t < 0.5 ? COLORS.knobOff : COLORS.knobOn;
        ctx.fill();
        const hl = ctx.createRadialGradient(kx - r * 0.35, ky - r * 0.4, 0, kx - r * 0.35, ky - r * 0.4, r);
        hl.addColorStop(0, 'rgba(255, 255, 255, 0.55)');
        hl.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = hl;
        ctx.fill();
        ctx.restore();
    }

    // ---- Exit door -------------------------------------------------------------------------------------------------

    // door: {x, y, width, height, scale}: the drawing fills width*scale x height*scale, as the sprite did.
    // locked: whether the levers are still missing; open: 0 = shut .. 1 = open as far as it goes.
    function exitDoor(ctx, door, locked, open) {
        const s = door.scale || 1;
        const W = door.width * s, H = door.height * s;
        const k = W / 69;   // the layout below is in the old 69-wide sprite's units
        const o = ease(clamp(open, 0, 1));
        ctx.save();
        ctx.translate(door.x, door.y);
        ctx.scale(k, H / 81.5 / 1);
        const fx = 7.5, fy = 8.5, fw = 53.5, fh = 73;
        // Frame
        ctx.fillStyle = COLORS.frame;
        ctx.fillRect(fx, fy, fw, fh);
        // The lift car behind the doors, lit from inside
        const ix = fx + 2, iy = fy + 1.5, iw = fw - 4, ih = fh - 1.5;
        ctx.fillStyle = COLORS.car;
        ctx.fillRect(ix, iy, iw, ih);
        if (o > 0) {
            const g = ctx.createLinearGradient(0, iy, 0, iy + ih);
            g.addColorStop(0, COLORS.carLight);
            g.addColorStop(1, 'rgba(255, 221, 150, 0.08)');
            ctx.globalAlpha = o;
            ctx.fillStyle = g;
            ctx.fillRect(ix, iy, iw, ih);
            ctx.globalAlpha = 1;
        }
        // Two doors sliding apart; each keeps a little of itself in view at the frame's edge
        const half = iw / 2;
        const slide = o * half * 0.7;
        for (const side of [-1, 1]) {
            const dx = side < 0 ? ix - slide : ix + half + slide;
            const vis = {x: Math.max(dx, ix), r: Math.min(dx + half, ix + iw)};
            if (vis.r <= vis.x) continue;
            const g = ctx.createLinearGradient(dx, 0, dx + half, 0);
            g.addColorStop(0, side < 0 ? COLORS.door : COLORS.doorShade);
            g.addColorStop(1, side < 0 ? COLORS.doorShade : COLORS.door);
            ctx.fillStyle = g;
            ctx.fillRect(vis.x, iy, vis.r - vis.x, ih);
            ctx.fillStyle = COLORS.doorTop;
            ctx.fillRect(vis.x, iy, vis.r - vis.x, 1.5);
            // The door's leading edge
            const edge = side < 0 ? dx + half : dx;
            if (edge >= ix && edge <= ix + iw) {
                ctx.fillStyle = COLORS.seam;
                ctx.fillRect(edge - 0.5, iy, 1, ih);
            }
        }
        // Call panel beside the door
        ctx.fillStyle = COLORS.panel;
        ctx.fillRect(1.5, 42, 3.5, 8.5);
        ctx.fillStyle = COLORS.doorTop;
        ctx.beginPath();
        ctx.arc(3.25, 44.5, 0.9, 0, TAU);
        ctx.arc(3.25, 48, 0.9, 0, TAU);
        ctx.fill();

        // Indicator above: red crosses while locked, green ticks once open
        const bx = 22.5, by = 2, bw = 22.5, bh = 4.5;
        ctx.fillStyle = COLORS.indicatorBox;
        ctx.fillRect(bx, by, bw, bh);
        ctx.strokeStyle = locked ? COLORS.locked : COLORS.unlocked;
        ctx.lineWidth = 0.9;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(bx + 5.5, by + bh / 2);
        ctx.lineTo(bx + bw - 5.5, by + bh / 2);
        for (const cx of [bx + 2.75, bx + bw - 2.75]) {
            if (locked) {
                ctx.moveTo(cx - 1.2, by + 1.1); ctx.lineTo(cx + 1.2, by + bh - 1.1);
                ctx.moveTo(cx + 1.2, by + 1.1); ctx.lineTo(cx - 1.2, by + bh - 1.1);
            } else {
                ctx.moveTo(cx - 1.4, by + 2.3); ctx.lineTo(cx - 0.4, by + 3.3); ctx.lineTo(cx + 1.4, by + 1.1);
            }
        }
        ctx.stroke();
        ctx.restore();
    }

    return {COLORS, LEVER_ART, saw, spike, projectile, launcher, lever, exitDoor};
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = EntityArt;
}

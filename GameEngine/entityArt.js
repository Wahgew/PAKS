// Vector drawings of the level's entities: the spike, the projectile launcher and its projectiles, the lever and the
// exit door. They replace the PNG sprites and keep each sprite's footprint and look, with small animations the
// images couldn't do. Pure drawing: no DOM or game dependencies (a global in the browser, require()-able in Node).
// Anything that animates takes its progress as an argument, so the entity classes own all state.
const EntityArt = (() => {
    const TAU = Math.PI * 2;
    const RELOAD_DELAY = 0.15;   // a launcher's barrel stays empty this long after a shot
    const RELOAD_TIME = 0.5;     // then the next rocket slides in over this long (less if it fires faster)
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
        rocketLight: '#e05a56',
        rocketDark: '#b23733',
        rocketEnd: '#8f2a27',
        rocketLip: '#6e1f1c',
        rocketOutline: '#4a1312',
        stick: '#d8b27a',
        stickShade: '#a98552',
        fuse: '#1d1d22',
        flameOuter: 'rgba(255, 128, 32, 0.9)',
        flameInner: 'rgba(255, 236, 140, 0.95)',
        spark: '#ffe08a',
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

    // A repeatable random number in [0, 1) for (seed, i), so sparks and bursts look random but draw the same
    // every time for the same inputs (and tests can check them)
    function rnd(seed, i) {
        const v = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453;
        return v - Math.floor(v);
    }

    // A classic bottle rocket in its own frame: nose pointing along +x, centred on the origin. A red paper tube, a
    // wider cone cap whose lip overhangs it, and a long wooden stick down one side. flame: lit and flying, the fuse
    // burnt away; unlit (in a launcher) a black fuse curls from the tail. time and seed make the flame flicker and spark.
    const FUSE_TIP = {x: -21, y: 2.5};
    function rocketShape(ctx, {flame = true, time = 0, seed = 0} = {}) {
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        if (flame) {
            const flicker = 0.5 + 0.25 * Math.sin(time * 41 + seed * 7) + 0.25 * Math.sin(time * 67 + seed * 3);
            const len = 9 + 6 * flicker;
            ctx.beginPath();
            ctx.moveTo(-10, -4);
            ctx.quadraticCurveTo(-10 - len * 0.6, -4, -10 - len, 0);
            ctx.quadraticCurveTo(-10 - len * 0.6, 4, -10, 4);
            ctx.closePath();
            ctx.fillStyle = COLORS.flameOuter;
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(-10, -2.2);
            ctx.quadraticCurveTo(-10 - len * 0.35, -2, -10 - len * 0.6, 0);
            ctx.quadraticCurveTo(-10 - len * 0.35, 2, -10, 2.2);
            ctx.closePath();
            ctx.fillStyle = COLORS.flameInner;
            ctx.fill();
            // A few sparks shed behind the flame
            const tick = Math.floor(time * 30);
            ctx.fillStyle = COLORS.spark;
            for (let k = 0; k < 5; k++) {
                const r = rnd(seed, tick * 7 + k);
                ctx.globalAlpha = 0.9 - k * 0.15;
                ctx.beginPath();
                ctx.arc(-12 - len * 0.5 - k * 2.6 - r * 2, (r - 0.5) * (4 + k * 2), 0.9 + r * 0.6, 0, TAU);
                ctx.fill();
            }
            ctx.globalAlpha = 1;
        } else {
            // The fuse, curling away from the middle of the tail
            ctx.beginPath();
            ctx.moveTo(-10, 0);
            ctx.quadraticCurveTo(-15, -4.5, -17, -0.5);
            ctx.quadraticCurveTo(-18.5, 3, FUSE_TIP.x, FUSE_TIP.y);
            ctx.lineWidth = 1.1;
            ctx.strokeStyle = COLORS.fuse;
            ctx.stroke();
        }
        // The stick, taped along the underside and trailing far behind
        ctx.fillStyle = COLORS.stick;
        ctx.fillRect(-26, 5, 29, 1.8);
        ctx.fillStyle = COLORS.stickShade;
        ctx.fillRect(-26, 6.2, 29, 0.6);
        // The tube, lit from above, with a slightly darker open end at the tail
        ctx.lineWidth = 1;
        ctx.strokeStyle = COLORS.rocketOutline;
        const g = ctx.createLinearGradient(0, -5, 0, 5);
        g.addColorStop(0, COLORS.rocketLight);
        g.addColorStop(1, COLORS.rocketDark);
        ctx.beginPath();
        roundRect(ctx, -10, -5, 17, 10, 1.2);
        ctx.fillStyle = g;
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = COLORS.rocketEnd;
        ctx.fillRect(-10, -5, 1.6, 10);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
        ctx.fillRect(-8, -3.8, 14, 1.4);
        // The cone cap: wider than the tube, so its lip overhangs it
        const c = ctx.createLinearGradient(0, -7.5, 0, 7.5);
        c.addColorStop(0, COLORS.rocketLight);
        c.addColorStop(1, COLORS.rocketDark);
        ctx.beginPath();
        ctx.moveTo(6, -7.5);
        ctx.lineTo(17, 0);
        ctx.lineTo(6, 7.5);
        ctx.closePath();
        ctx.fillStyle = c;
        ctx.fill();
        ctx.stroke();
        // The cap's lip, a darker band where it sits on the tube
        ctx.fillStyle = COLORS.rocketLip;
        ctx.fillRect(6, -7.5, 1.4, 15);
    }

    const HEADING = {RIGHT: 0, DOWN: Math.PI / 2, LEFT: Math.PI, UP: -Math.PI / 2};

    // rocket: {x, y, width, height, direction, age (seconds in flight), seed}: centred on its box, nose first
    function rocket(ctx, r) {
        ctx.save();
        ctx.translate(r.x + r.width / 2, r.y + r.height / 2);
        ctx.rotate(HEADING[r.direction] || 0);
        rocketShape(ctx, {flame: true, time: r.age || 0, seed: r.seed || 0});
        ctx.restore();
    }

    const FIREWORK_LIFE = 1.1;   // seconds
    const FIREWORK_COLORS = ['#ff4d4d', '#ffd23f', '#4dd2ff', '#7dff6b', '#ff7bf0'];

    // Where streak i of a burst is at a given age: thrown out fast, slowing under drag, drooping a little
    function fireworkPoint(seed, i, n, age) {
        const a = (i / n) * TAU + (rnd(seed, i) - 0.5) * 0.3;
        const speed = 170 + 90 * rnd(seed, i + 100);
        const d = speed * (1 - Math.exp(-3 * age)) / 3;
        return {x: Math.cos(a) * d, y: Math.sin(a) * d + 60 * age * age};
    }

    // A firework burst at (x, y), age seconds after it went off: a white flash, then coloured streaks that slow,
    // droop and fade, crackling at the end. seed picks the colours and the spread.
    function firework(ctx, x, y, age, seed = 0) {
        if (age < 0 || age >= FIREWORK_LIFE) return;
        const fade = 1 - Math.pow(age / FIREWORK_LIFE, 1.5);
        ctx.save();
        ctx.translate(x, y);
        if (age < 0.14) {
            const k = age / 0.14;
            const r = 6 + 26 * Math.sqrt(k);
            const f = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
            f.addColorStop(0, 'rgba(255, 255, 240, 1)');
            f.addColorStop(1, 'rgba(255, 210, 120, 0)');
            ctx.globalAlpha = 1 - k;
            ctx.fillStyle = f;
            ctx.beginPath();
            ctx.arc(0, 0, r, 0, TAU);
            ctx.fill();
        }
        const n = 28;
        ctx.lineCap = 'round';
        ctx.lineWidth = 2.2;
        for (let i = 0; i < n; i++) {
            const head = fireworkPoint(seed, i, n, age);
            const tail = fireworkPoint(seed, i, n, Math.max(0, age - 0.06));
            const color = FIREWORK_COLORS[Math.floor(rnd(seed, i + 200) * FIREWORK_COLORS.length)];
            ctx.globalAlpha = fade;
            ctx.strokeStyle = color;
            ctx.beginPath();
            ctx.moveTo(tail.x, tail.y);
            ctx.lineTo(head.x, head.y);
            ctx.stroke();
            // Crackle: glitter flickering at the tips late in the burst
            if (age > 0.45 && rnd(seed, i * 13 + Math.floor(age * 24)) > 0.55) {
                ctx.fillStyle = '#fffbe0';
                ctx.beginPath();
                ctx.arc(head.x, head.y, 1.4, 0, TAU);
                ctx.fill();
            }
        }
        ctx.restore();
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
    // Drawn facing left and rotated about its centre, as the sprite was. A firework rocket sits in the barrel, nose
    // out; it leaves with a recoil and a muzzle flash, the next one slides in from the back, and its fuse sparks and
    // the light on the back warms up before the next shot.
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

        // The loaded rocket. Empty for a moment after a shot, then the next slides in from the back of the barrel.
        const reload = clamp((since - RELOAD_DELAY) / Math.max(0.05, Math.min(RELOAD_TIME, (l.atkspd || 1) * 0.4)), 0, 1);
        if (reload > 0) {
            const e = ease(reload);
            ctx.save();
            ctx.beginPath();
            ctx.rect(bx, by - 8, bw, bh + 16);   // the rocket never shows outside the housing while it loads
            ctx.clip();
            ctx.globalAlpha = e;
            ctx.translate(w * 0.36 + (1 - e) * 10, h / 2);   // short slide: the stick must stay inside the housing
            ctx.rotate(Math.PI);
            ctx.scale(0.95, 0.95);
            rocketShape(ctx, {flame: false});
            // The fuse is lit just before it fires: sparks at its tip
            if (charge > 0.75) {
                const tick = Math.floor(since * 30);
                ctx.fillStyle = COLORS.spark;
                for (let k = 0; k < 4; k++) {
                    const r = rnd(k + 1, tick + k * 5);
                    ctx.globalAlpha = 0.6 + 0.4 * r;
                    ctx.beginPath();
                    ctx.arc(FUSE_TIP.x - r * 3, FUSE_TIP.y + (r - 0.5) * 5, 0.8 + r, 0, TAU);
                    ctx.fill();
                }
            }
            ctx.restore();
        }

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

    return {COLORS, LEVER_ART, FIREWORK_LIFE, saw, spike, projectile, rocket, rocketShape, firework, fireworkPoint, launcher, lever, exitDoor};
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = EntityArt;
}

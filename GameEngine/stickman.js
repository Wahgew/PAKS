// The player's stickman as a vector rig: a small skeleton posed by joint angles, drawn with strokes every frame.
// Pure logic like tileShapes.js and camera.js: no DOM or game dependencies (a global in the browser, require()-able in Node),
// so the tests can check poses without a canvas.
//
// Coordinates are local to the player's hitbox: the origin is the middle of the box's bottom edge (the ground under
// the feet), x points the way the figure faces, y points down. The box is 20x74, so the figure stands about 74 tall.
//
// Angles, in radians:
//   lean          torso tilt from straight up, positive leans forward
//   head          head tilt relative to the torso
//   *Thigh, *Arm  bone direction from straight down, positive swings forward
//   *Knee         how far the shin folds back from the thigh (0 = straight leg)
//   *Elbow        how far the forearm folds forward from the upper arm
// "n" is the near side (drawn in front, darker), "f" the far side (drawn behind, lighter).
const Stickman = (() => {
    const DIM = {
        headR: 6.5,
        neck: 1.5,
        torso: 20,
        shoulder: 18,   // shoulders sit this far up the torso, a little below the neck
        upperArm: 13,
        forearm: 13,
        thigh: 20,
        shin: 20,
    };
    const LEG = DIM.thigh + DIM.shin;

    const ANGLES = ['lean', 'head', 'nThigh', 'nKnee', 'fThigh', 'fKnee', 'nArm', 'nElbow', 'fArm', 'fElbow'];
    const AIR_HIP = -38;        // hip height above the box bottom in the air (a standing figure fills the box)

    // Walk and run are one gait; speed moves it from the walk end to the run end, so shift never snaps the legs.
    const GAIT = {
        walk: {speed: 80, hip: 37, half: 13, stance: 0.6, lift: 6, bob: 1.5, lean: 0.07, arm: 0.45, elbow: 0.25},
        run:  {speed: 380, hip: 35, half: 18, stance: 0.26, lift: 15, bob: 2, lean: 0.3, arm: 1.0, elbow: 1.6},
    };

    const BLEND_TIME = 0.1;     // shortest crossfade between clips
    const BLEND_MAX = 0.24;     // longest, for the biggest change of pose
    const BLEND_SPEED = 500;    // px/s of joint travel along the blend a crossfade allows on average; the ease
                                // peaks at 1.5 times that, about 12.5px a frame at 60fps
    const TURN_TIME = 0.12;     // turning around squeezes the figure through zero width over this long
    const SQUASH_TIME = 0.18;   // landing squash
    const SMOOTH_TIME = 0.05;   // how quickly poses follow a sudden change of speed

    const lerp = (a, b, t) => a + (b - a) * t;
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const ease = t => t * t * (3 - 2 * t);
    const down = a => ({x: Math.sin(a), y: Math.cos(a)});
    const add = (p, d, len) => ({x: p.x + d.x * len, y: p.y + d.y * len});

    // The equivalent of angle b nearest to a (b plus or minus whole turns)
    function nearest(a, b) {
        let d = (b - a) % (Math.PI * 2);
        if (d > Math.PI) d -= Math.PI * 2;
        if (d < -Math.PI) d += Math.PI * 2;
        return a + d;
    }

    // Shortest-path angle blend, so a crossfade never swings a limb the long way round.
    function lerpAngle(a, b, t) {
        return lerp(a, nearest(a, b), t);
    }

    function mix(a, b, t) {
        const out = {x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t)};
        for (const k of ANGLES) out[k] = lerpAngle(a[k], b[k], t);
        return out;
    }

    // Two-bone IK for a leg: the thigh and shin angles that put the foot at (fx, fy) from a hip at (hx, hy),
    // with the knee bending forward. Out of reach, the leg points at the target as far as it goes.
    function legIK(hx, hy, fx, fy) {
        const dx = fx - hx, dy = fy - hy;
        const d = clamp(Math.hypot(dx, dy), 1, LEG * 0.9999);
        const toward = Math.atan2(dx, dy);
        const bend = Math.acos(clamp((d * d + DIM.thigh * DIM.thigh - DIM.shin * DIM.shin) / (2 * d * DIM.thigh), -1, 1));
        const kneeInner = Math.acos(clamp((DIM.thigh * DIM.thigh + DIM.shin * DIM.shin - d * d) / (2 * DIM.thigh * DIM.shin), -1, 1));
        return {thigh: toward + bend, knee: Math.PI - kneeInner};
    }

    // The same for an arm. Normally the elbow sits behind the shoulder-hand line and the forearm folds forward;
    // elbowDown puts it on the other side (hands resting on the knees, where a back-folded elbow looks broken).
    function armIK(sx, sy, hx, hy, elbowDown = false) {
        const a = DIM.upperArm, b = DIM.forearm;
        const dx = hx - sx, dy = hy - sy;
        const d = clamp(Math.hypot(dx, dy), 1, (a + b) * 0.9999);
        const toward = Math.atan2(dx, dy);
        const bend = Math.acos(clamp((d * d + a * a - b * b) / (2 * d * a), -1, 1));
        const inner = Math.acos(clamp((a * a + b * b - d * d) / (2 * a * b), -1, 1));
        return elbowDown ? {arm: toward + bend, elbow: inner - Math.PI} : {arm: toward - bend, elbow: Math.PI - inner};
    }

    // Where the shoulders are for a hip and a lean (for placing hands with armIK)
    function shoulderAt(hipX, hipY, lean) {
        return {x: hipX + Math.sin(lean) * DIM.shoulder, y: hipY - Math.cos(lean) * DIM.shoulder};
    }

    // Pose with both feet placed on the ground (or wherever the targets are) by IK.
    function standing(base, hipX, hipY, nFoot, fFoot) {
        const n = legIK(hipX, hipY, nFoot.x, nFoot.y);
        const f = legIK(hipX, hipY, fFoot.x, fFoot.y);
        return Object.assign({x: hipX, y: hipY, nThigh: n.thigh, nKnee: n.knee, fThigh: f.thigh, fKnee: f.knee}, base);
    }

    // Forward kinematics: every joint position for a pose, in local coordinates.
    function solve(p) {
        const hip = {x: p.x, y: p.y};
        const up = {x: Math.sin(p.lean), y: -Math.cos(p.lean)};
        const neck = add(hip, up, DIM.torso);
        const shoulder = add(hip, up, DIM.shoulder);
        const headDir = {x: Math.sin(p.lean + p.head), y: -Math.cos(p.lean + p.head)};
        const head = add(neck, headDir, DIM.neck + DIM.headR);
        const nKnee = add(hip, down(p.nThigh), DIM.thigh);
        const nFoot = add(nKnee, down(p.nThigh - p.nKnee), DIM.shin);
        const fKnee = add(hip, down(p.fThigh), DIM.thigh);
        const fFoot = add(fKnee, down(p.fThigh - p.fKnee), DIM.shin);
        const nElbow = add(shoulder, down(p.nArm), DIM.upperArm);
        const nHand = add(nElbow, down(p.nArm + p.nElbow), DIM.forearm);
        const fElbow = add(shoulder, down(p.fArm), DIM.upperArm);
        const fHand = add(fElbow, down(p.fArm + p.fElbow), DIM.forearm);
        return {hip, neck, shoulder, head, headDir, nKnee, nFoot, fKnee, fFoot, nElbow, nHand, fElbow, fHand};
    }

    // ---- Gait ----------------------------------------------------------------------------------------------------

    // The gait blended k of the way from walk (0) to run (1).
    function blendGait(k) {
        const g = {k};
        for (const key of ['hip', 'half', 'stance', 'lift', 'bob', 'lean', 'arm', 'elbow']) {
            g[key] = lerp(GAIT.walk[key], GAIT.run[key], k);
        }
        // Distance covered per full cycle. A planted foot sweeps 2*half while the body moves stance*length,
        // so this length makes the planted foot keep perfectly still on the ground.
        g.length = 2 * g.half / g.stance;
        return g;
    }
    const WALK_LENGTH = blendGait(0).length, RUN_LENGTH = blendGait(1).length;

    function gaitParams(speed) {
        // The step rate is chosen first and rises steadily with speed; the stride follows from it. Blending the
        // walk and run shapes by speed directly made the legs slow down while the body sped up (the run stride is
        // three times the walk's), whatever the easing curve.
        const {speed: vw} = GAIT.walk, {speed: vr} = GAIT.run;
        let length;
        if (speed <= vw) length = WALK_LENGTH;
        else if (speed >= vr) length = RUN_LENGTH;
        else length = speed / lerp(vw / WALK_LENGTH, vr / RUN_LENGTH, (speed - vw) / (vr - vw));
        // blendGait(k).length rises with k, so find the k with this length by bisection
        let lo = 0, hi = 1;
        for (let i = 0; i < 30; i++) {
            const mid = (lo + hi) / 2;
            if (blendGait(mid).length < length) lo = mid; else hi = mid;
        }
        return blendGait((lo + hi) / 2);
    }

    // Where one foot is at gait phase p (0..1): planted and sweeping back during the stance, then swung forward in an arc.
    function footAt(g, p) {
        if (p < g.stance) {
            const u = p / g.stance;
            return {x: g.half * (1 - 2 * u), y: 0, planted: true};
        }
        const u = (p - g.stance) / (1 - g.stance);
        const e = (1 - Math.cos(Math.PI * u)) / 2;
        return {x: -g.half + 2 * g.half * e, y: -g.lift * Math.sin(Math.PI * u), planted: false};
    }

    function gaitPose(speed, phase, squash) {
        const g = gaitParams(speed);
        // The hip dips as weight lands (at contact when walking, mid-stance when running). It only ever dips below
        // g.hip, which every planted foot can reach, so a planted foot is always exactly on the ground.
        const dipAt = g.k * g.stance / 2;
        const hipY = -(g.hip - g.bob * (0.5 + 0.5 * Math.cos(4 * Math.PI * (phase - dipAt))) - squash);
        const nFoot = footAt(g, phase);
        const fFoot = footAt(g, (phase + 0.5) % 1);
        const swing = Math.cos(2 * Math.PI * (phase - dipAt));
        return standing({
            lean: g.lean + 0.03 * Math.cos(4 * Math.PI * phase),
            head: -g.lean * 0.6,
            nArm: -g.arm * swing + 0.15 * g.k,
            nElbow: g.elbow + 0.3 * g.k * Math.max(0, -swing),
            fArm: g.arm * swing + 0.15 * g.k,
            fElbow: g.elbow + 0.3 * g.k * Math.max(0, swing),
        }, 0, hipY, nFoot, fFoot);
    }

    // ---- Clips -----------------------------------------------------------------------------------------------------
    // Each returns a pose from {t: seconds in this state, time: rig clock, vx, vy, phase, squash}.

    // The crouch's shape, kept together so it is easy to tune
    // Arms folded across the chest as in the Cossack squat dance: upper arms nearly level in front, forearms folded
    // back level across the chest (the far one a little higher, so they read as crossed).
    const SQUAT = {hip: 16, hipX: -5, lean: 0.18, head: -0.1, nFoot: {x: 8, y: 0}, fFoot: {x: -5, y: 0},
        nArm: 1.3, nForearm: -1.62, fArm: 1.38, fForearm: -1.45};

    const CLIPS = {
        idle(c) {
            const breath = 0.5 - 0.5 * Math.cos(2 * Math.PI * c.time / 2.6);
            const sway = Math.sin(2 * Math.PI * c.time / 3.7);
            return standing({
                lean: 0.02 + 0.012 * sway,
                head: -0.03 - 0.03 * breath,
                nArm: 0.1 + 0.035 * breath, nElbow: 0.18 + 0.05 * breath,
                fArm: -0.08 - 0.035 * breath, fElbow: 0.22 + 0.05 * breath,
            }, 0, -(38.8 - 0.5 * breath - c.squash), {x: 4.5, y: 0}, {x: -4.5, y: 0});
        },

        gait(c) {
            return gaitPose(Math.abs(c.vx), c.phase, c.squash);
        },

        skid(c) {
            const judder = Math.sin(c.time * 42) * Math.min(1, Math.abs(c.vx) / 400);
            return standing({
                lean: -0.32 + 0.03 * judder,
                head: 0.28,
                nArm: 1.45, nElbow: 0.25,
                fArm: -0.95, fElbow: 0.5,
            }, -2, -(34 - c.squash), {x: 16, y: 0}, {x: -3, y: 0});
        },

        crouch(c) {
            // A deep squat with the chest up and the arms folded, like the Cossack squat dance (hands resting on the
            // knees put the elbow right on the knee and read as a tangle). It breathes a little.
            const breath = 0.5 - 0.5 * Math.cos(2 * Math.PI * c.time / 2.2);
            const lean = SQUAT.lean, hipX = SQUAT.hipX, hipY = -(SQUAT.hip + 0.4 * breath - c.squash * 0.5);
            const pose = standing({lean, head: SQUAT.head}, hipX, hipY, SQUAT.nFoot, SQUAT.fFoot);
            // *Forearm is the forearm's direction from straight down, so the elbow is what folds it there
            const bob = 0.04 * breath;
            return Object.assign(pose, {
                nArm: SQUAT.nArm - bob, nElbow: SQUAT.nForearm - SQUAT.nArm,
                fArm: SQUAT.fArm - bob, fElbow: SQUAT.fForearm - SQUAT.fArm,
            });
        },

        slide(c) {
            // Leaning back on one hand that trails along the floor, front leg out, back knee up
            const wobble = Math.sin(c.time * 26) * 0.03 * Math.min(1, Math.abs(c.vx) / 300);
            const lean = -1.2 + wobble;
            const pose = standing({lean, head: 0.95, fArm: 0.9, fElbow: 0.9}, -3, -9, {x: 29, y: 0}, {x: 14, y: -1});
            const sh = shoulderAt(-3, -9, lean);
            const n = armIK(sh.x, sh.y, -25, -1);
            return Object.assign(pose, {nArm: n.arm, nElbow: n.elbow});
        },

        jump(c) {
            // Launch pose at full take-off speed, easing into a tuck as the rise slows to the apex.
            const k = clamp(-c.vy / 850, 0, 1);
            const apex = {
                lean: 0.12, head: -0.08,
                nThigh: 0.95, nKnee: 1.55, fThigh: 0.3, fKnee: 1.15,
                nArm: 1.9, nElbow: 0.55, fArm: -0.7, fElbow: 0.6,
            };
            const launch = {
                lean: 0.08, head: -0.12,
                nThigh: 0.65, nKnee: 1.25, fThigh: -0.2, fKnee: 0.45,
                nArm: 2.75, nElbow: 0.25, fArm: 2.35, fElbow: 0.35,
            };
            return mix(Object.assign({x: 0, y: AIR_HIP}, apex), Object.assign({x: 0, y: AIR_HIP}, launch), ease(k));
        },

        fall(c) {
            const k = clamp(c.vy / 900, 0, 1);
            const flail = Math.sin(c.t * 9);
            const flail2 = Math.sin(c.t * 9 + 1.7);
            const apex = {
                lean: 0.1, head: -0.05,
                nThigh: 0.9, nKnee: 1.45, fThigh: 0.28, fKnee: 1.05,
                nArm: 1.95, nElbow: 0.55, fArm: -0.75, fElbow: 0.6,
            };
            const falling = {
                lean: -0.05, head: -0.18,
                nThigh: 0.4, nKnee: 0.65, fThigh: -0.1, fKnee: 0.3,
                nArm: 2.3 + 0.22 * flail, nElbow: 0.45, fArm: -2.2 + 0.22 * flail2, fElbow: -0.35,
            };
            return mix(Object.assign({x: 0, y: AIR_HIP}, apex), Object.assign({x: 0, y: AIR_HIP}, falling), ease(k));
        },

        wall(c) {
            // Facing away from the wall, which is at x = -10 (the back edge of the box): back and one hand against it,
            // one foot braced on it, the other knee up.
            const scrape = Math.sin(c.t * 8);
            const lean = -0.12, hip = {x: -3, y: -37};
            const sh = shoulderAt(hip.x, hip.y, lean);
            const hand = armIK(sh.x, sh.y, -10, -64 + 1.5 * scrape);
            const foot = legIK(hip.x, hip.y, -10, -9 - 1.5 * scrape);
            return {
                x: hip.x, y: hip.y,
                lean, head: 0.12,
                nThigh: 0.85, nKnee: 1.45, fThigh: foot.thigh, fKnee: foot.knee,
                nArm: 1.25 + 0.05 * scrape, nElbow: 0.6,
                fArm: hand.arm, fElbow: hand.elbow,
            };
        },
    };

    // The player's states, by the name the rig uses; walk and run share the gait so shift doesn't crossfade.
    const CLIP_FOR = {idle: 'idle', walk: 'gait', run: 'gait', skid: 'skid', jump: 'jump', fall: 'fall',
        slide: 'slide', crouch: 'crouch', wall: 'wall'};
    const GROUNDED_CLIPS = ['idle', 'gait', 'skid', 'crouch', 'slide'];

    // ---- Rig -------------------------------------------------------------------------------------------------------

    // The longest path any joint takes when blending one pose into another (limbs swing in arcs, so this is
    // measured along the blend, not as a straight line)
    function blendTravel(from, to) {
        let prev = solve(from);
        const travel = {};
        for (let i = 1; i <= 8; i++) {
            const j = solve(mix(from, to, i / 8));
            for (const k of Object.keys(j)) {
                if (k !== 'headDir') travel[k] = (travel[k] || 0) + Math.hypot(j[k].x - prev[k].x, j[k].y - prev[k].y);
            }
            prev = j;
        }
        return Math.max(...Object.values(travel));
    }

    class Rig {
        constructor() {
            this.clip = 'idle';
            this.stateT = 0;
            this.time = 0;
            this.phase = 0;
            this.facing = 1;        // smoothed: -1..1, passes through 0 when turning
            this.from = null;
            this.blend = 1;
            this.squashAmp = 0;
            this.squashT = SQUASH_TIME;
            this.wasGrounded = true;
            this.lastVy = 0;
            this.vy = 0;            // vy and speed as the poses see them: smoothed, because physics can change them
            this.speed = 0;         // in one frame (releasing jump halves the rise, a wall jump sets vx at once)
            this.pose = null;
            this.update(0, {state: 'idle', vx: 0, vy: 0, grounded: true, facing: 1});
        }

        // input: {state, vx, vy, grounded, facing: 1 right / -1 left, wallSide: 1 wall on the right / -1 left}
        update(dt, input) {
            dt = clamp(dt || 0, 0, 0.1);   // a long frame (tab switch) shouldn't fast-forward the pose
            const clip = CLIP_FOR[input.state] || 'idle';
            const vx = input.vx || 0, vy = input.vy || 0;

            let target = input.facing < 0 ? -1 : 1;
            if (clip === 'wall' && input.wallSide) target = -input.wallSide;   // back to the wall
            const turn = 2 * dt / TURN_TIME;
            this.facing = this.facing < target ? Math.min(target, this.facing + turn) : Math.max(target, this.facing - turn);

            if (input.grounded && !this.wasGrounded && this.lastVy > 250) {
                this.squashAmp = Math.min(1, this.lastVy / 1400) * 7;
                this.squashT = 0;
            }
            this.squashT += dt;
            const s = Math.max(0, 1 - this.squashT / SQUASH_TIME);
            const squash = this.squashAmp * Math.sin(Math.PI * Math.min(1, this.squashT / SQUASH_TIME)) * s;

            const follow = 1 - Math.exp(-dt / SMOOTH_TIME);
            this.vy += (vy - this.vy) * follow;
            this.speed += (Math.abs(vx) - this.speed) * follow;
            if (clip === 'gait') {
                // The phase advances by the distance actually travelled at the stride the legs are showing, so a
                // planted foot keeps still even while the smoothed speed catches up
                this.phase = (this.phase + Math.abs(vx) * dt / gaitParams(this.speed).length) % 1;
            }

            const changed = clip !== this.clip;
            if (changed) {
                // A new clip starts from the real speeds: the crossfade already smooths the change of pose
                this.vy = vy;
                this.speed = Math.abs(vx);
                this.from = this.pose;
                this.blend = 0;
                this.clip = clip;
                this.stateT = 0;
            }
            this.stateT += dt;
            this.time += dt;

            const pose = CLIPS[clip]({t: this.stateT, time: this.time, vx: this.speed * Math.sign(vx), vy: this.vy, phase: this.phase, squash});
            if (changed && this.from) {
                // Which way round each angle blends is chosen once, here. Picking the shortest way every frame
                // flips direction when a moving target (a running arm) passes the half-turn, and the limb jumps.
                this.goal = {};
                for (const k of ANGLES) this.goal[k] = nearest(this.from[k], pose[k]);
                // A bigger change of pose gets a longer crossfade, so a hand swinging from a slide to a fall
                // doesn't whip across the screen in two frames
                this.blendTime = clamp(blendTravel(this.from, pose) / BLEND_SPEED, BLEND_TIME, BLEND_MAX);
            } else if (this.goal) {
                for (const k of ANGLES) this.goal[k] = nearest(this.goal[k], pose[k]);
            }
            this.blend = Math.min(1, this.blend + dt / (this.blendTime || BLEND_TIME));
            if (this.from && this.blend < 1) {
                const e = ease(this.blend);
                const out = {x: lerp(this.from.x, pose.x, e), y: lerp(this.from.y, pose.y, e)};
                for (const k of ANGLES) out[k] = lerp(this.from[k], this.goal[k], e);
                this.pose = out;
            } else {
                this.pose = pose;
            }
            this.wasGrounded = !!input.grounded;
            this.lastVy = vy;
            return this.pose;
        }

        // Joint positions in the world for a box whose bottom-centre is at (x, groundY).
        joints(x, groundY) {
            const local = solve(this.pose);
            const out = {};
            for (const [k, p] of Object.entries(local)) {
                out[k] = k === 'headDir' ? {x: p.x * this.facing, y: p.y} : {x: x + p.x * this.facing, y: groundY + p.y};
            }
            return out;
        }
    }

    // ---- Drawing ---------------------------------------------------------------------------------------------------

    // A skin later is just another one of these.
    const STYLE = {
        near: '#111111',
        far: '#3a3a3a',
        width: 4,
        headR: DIM.headR,
        highlight: 'rgba(255, 255, 255, 0.22)',
        shadow: 'rgba(0, 0, 0, 0.28)',
    };

    // The pieces of the figure: the death effect throws exactly these.
    function segments(j) {
        return [
            {part: 'fLeg', far: true, points: [j.hip, j.fKnee, j.fFoot]},
            {part: 'fArm', far: true, points: [j.shoulder, j.fElbow, j.fHand]},
            {part: 'torso', far: false, points: [j.hip, j.neck]},
            {part: 'nLeg', far: false, points: [j.hip, j.nKnee, j.nFoot]},
            {part: 'head', far: false, points: [j.head], radius: DIM.headR},
            {part: 'nArm', far: false, points: [j.shoulder, j.nElbow, j.nHand]},
        ];
    }

    function strokePoints(ctx, points) {
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
        ctx.stroke();
    }

    function drawHead(ctx, c, r, style, color) {
        ctx.beginPath();
        ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        if (style.highlight && ctx.createRadialGradient) {
            // A soft light from above: gives the head a little roundness without leaving the black-stickman look
            const g = ctx.createRadialGradient(c.x - r * 0.3, c.y - r * 0.45, 0, c.x - r * 0.3, c.y - r * 0.45, r * 0.9);
            g.addColorStop(0, style.highlight);
            g.addColorStop(1, 'rgba(255, 255, 255, 0)');
            ctx.fillStyle = g;
            ctx.fill();
        }
    }

    // Draws one segment (as returned by segments()); used by the figure and by the flying death pieces.
    function drawSegment(ctx, seg, style = STYLE) {
        const color = seg.far ? style.far : style.near;
        if (seg.part === 'head') {
            drawHead(ctx, seg.points[0], seg.radius || style.headR, style, color);
            return;
        }
        ctx.strokeStyle = color;
        ctx.lineWidth = style.width;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        strokePoints(ctx, seg.points);
    }

    function draw(ctx, joints, style = STYLE) {
        ctx.save();
        for (const seg of segments(joints)) drawSegment(ctx, seg, style);
        ctx.restore();
    }

    // A soft shadow on the ground under the figure, smaller and fainter the higher it is.
    function drawShadow(ctx, x, groundY, height, style = STYLE) {
        const k = 1 - clamp(height / 180, 0, 1);
        if (k <= 0) return;
        const rx = 8 + 7 * k, ry = 2 + 1.2 * k;
        ctx.save();
        ctx.translate(x, groundY);
        ctx.scale(1, ry / rx);
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
        g.addColorStop(0, style.shadow);
        g.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.globalAlpha = k;
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, rx, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    return {
        DIM, STYLE, GAIT, BLEND_TIME, BLEND_MAX, TURN_TIME, CLIPS, CLIP_FOR, GROUNDED_CLIPS,
        STATES: Object.keys(CLIP_FOR),
        Rig, solve, legIK, armIK, gaitParams, footAt, gaitPose, mix, segments, draw, drawSegment, drawShadow,
    };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = Stickman;
}

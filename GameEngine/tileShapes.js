/**
 * TileShapes: pure geometry for non-square tiles (45° slopes and quarter circles).
 *
 * No DOM or game dependencies, so it loads as a plain <script> in the browser (global
 * `TileShapes`) and via require() in Node for tests.
 *
 * Tile ids in the level JSON: 0 = empty, 1 = full block (both handled by drawMap itself),
 * anything below is a shape. The letters name the corner that holds the solid mass:
 *   BL / BR / TL / TR = bottom-left / bottom-right / top-left / top-right.
 *
 *   10-13  SLOPE_*    45° triangle
 *   20-23  CONVEX_*   quarter disc, arc bulges out (a rounded hill shoulder)
 *   30-33  CONCAVE_*  square minus a quarter disc, arc dips in (a quarter-pipe)
 *   40-43  GENTLE_HIGH_*  first half of a 2-tile-wide, 1-tile-tall ramp (about 26.6°): the half at the tall end
 *   50-53  GENTLE_LOW_*   the other half, at the low end. A full gentle ramp is a LOW tile next to a HIGH tile
 *   60-63  STEEP_TIP_*    top half of a 1-tile-wide, 2-tile-tall ramp (about 63.4°): the tile at the tall end
 *   70-73  STEEP_BASE_*   the bottom half, stacked under the tip. Steeper than 45°, so it blocks like a wall
 *
 * Every shape is stored as convex "pieces" (what collision uses) plus one outline (what the
 * renderer and debug view draw). Arbitrary polygons later means adding pieces, not new code.
 *
 * Collision is SAT between the player's AABB and each piece. Contacts carry the minimum
 * translation vector (normal points from the tile toward the box) and are classified as
 * floor / wall / ceiling so the caller can decide what walking on them means.
 */
const TileShapes = (() => {
    const ARC_SEGMENTS = 8;          // per quarter circle; worst error vs a true circle is ~0.1px at 25px tiles
    const OVERLAP_EPS = 1e-4;        // overlaps at or under this count as touching, so resting on a surface isn't a hit
    const WALKABLE_NORMAL_Y = 0.7;   // |normal.y| at or above this is floor/ceiling; 45° is 0.7071, with margin for float error

    const ID = {
        EMPTY: 0, SOLID: 1,
        SLOPE_BL: 10, SLOPE_BR: 11, SLOPE_TL: 12, SLOPE_TR: 13,
        CONVEX_BL: 20, CONVEX_BR: 21, CONVEX_TL: 22, CONVEX_TR: 23,
        CONCAVE_BL: 30, CONCAVE_BR: 31, CONCAVE_TL: 32, CONCAVE_TR: 33,
        GENTLE_HIGH_BL: 40, GENTLE_HIGH_BR: 41, GENTLE_HIGH_TL: 42, GENTLE_HIGH_TR: 43,
        GENTLE_LOW_BL: 50, GENTLE_LOW_BR: 51, GENTLE_LOW_TL: 52, GENTLE_LOW_TR: 53,
        STEEP_TIP_BL: 60, STEEP_TIP_BR: 61, STEEP_TIP_TL: 62, STEEP_TIP_TR: 63,
        STEEP_BASE_BL: 70, STEEP_BASE_BR: 71, STEEP_BASE_TL: 72, STEEP_BASE_TR: 73,
    };

    // ---- Shape definitions, in unit tile space (0..1, y down), written for the BL corner ----

    const arc = (fn) => Array.from({length: ARC_SEGMENTS + 1}, (_, i) => fn((i / ARC_SEGMENTS) * Math.PI / 2));
    const pt = (x, y) => ({x, y});

    const FAMILIES = {
        SLOPE: {
            base: 10,
            build() {
                const tri = [pt(0, 1), pt(0, 0), pt(1, 1)];
                return {outline: tri, pieces: [{pts: tri, hidden: []}]};
            },
        },
        CONVEX: {
            base: 20,
            build() {
                // Quarter disc centred on the BL corner: one convex piece.
                const poly = [pt(0, 1), ...arc(a => pt(Math.sin(a), 1 - Math.cos(a)))];
                return {outline: poly, pieces: [{pts: poly, hidden: []}]};
            },
        },
        CONCAVE: {
            base: 30,
            build() {
                // Square minus a quarter disc centred on the opposite corner. Not convex, so it is a
                // fan of triangles from the solid corner. The fan's inner rays are not real surfaces;
                // marking them hidden stops SAT from ever picking one as a push-out direction, which
                // would otherwise create phantom walls where triangles meet.
                const rim = arc(a => pt(1 - Math.cos(a), Math.sin(a)));
                const pieces = [];
                for (let i = 0; i < ARC_SEGMENTS; i++) {
                    const hidden = [];
                    if (i > 0) hidden.push(0);                    // ray to rim[i]
                    if (i + 1 < ARC_SEGMENTS) hidden.push(2);     // ray to rim[i + 1]
                    pieces.push({pts: [pt(0, 1), rim[i], rim[i + 1]], hidden});
                }
                return {outline: [pt(0, 1), ...rim], pieces};
            },
        },
        // The four ramp families are polygons cut from a straight line, written for the BL corner: solid on the
        // left, surface falling to the right. Neighbouring halves meet at half height (0.5) or half width (0.5),
        // so a ramp built from them has no seam. All are single convex pieces.
        GENTLE_HIGH: {
            base: 40,
            build() {
                // Surface from (0,0) down to (1,0.5): the upper half of a 2-wide, 1-tall ramp
                const poly = [pt(0, 1), pt(0, 0), pt(1, 0.5), pt(1, 1)];
                return {outline: poly, pieces: [{pts: poly, hidden: []}]};
            },
        },
        GENTLE_LOW: {
            base: 50,
            build() {
                // Surface from (0,0.5) down to (1,1): continues GENTLE_HIGH, placed on its low side
                const tri = [pt(0, 1), pt(0, 0.5), pt(1, 1)];
                return {outline: tri, pieces: [{pts: tri, hidden: []}]};
            },
        },
        STEEP_TIP: {
            base: 60,
            build() {
                // Surface from (0,0) down to (0.5,1): the top half of a 1-wide, 2-tall ramp
                const tri = [pt(0, 1), pt(0, 0), pt(0.5, 1)];
                return {outline: tri, pieces: [{pts: tri, hidden: []}]};
            },
        },
        STEEP_BASE: {
            base: 70,
            build() {
                // Surface from (0.5,0) down to (1,1): sits directly under STEEP_TIP
                const poly = [pt(0, 1), pt(0, 0), pt(0.5, 0), pt(1, 1)];
                return {outline: poly, pieces: [{pts: poly, hidden: []}]};
            },
        },
    };

    // Mirroring never reverses point order, so edge indexes (used by `hidden`) survive it.
    const CORNERS = [
        {name: 'BL', flipX: false, flipY: false},
        {name: 'BR', flipX: true,  flipY: false},
        {name: 'TL', flipX: false, flipY: true},
        {name: 'TR', flipX: true,  flipY: true},
    ];

    const UNIT_SHAPES = {};   // id -> {id, name, outline, pieces} in unit space
    for (const [family, def] of Object.entries(FAMILIES)) {
        const base = def.build();
        CORNERS.forEach((c, i) => {
            const flip = p => pt(c.flipX ? 1 - p.x : p.x, c.flipY ? 1 - p.y : p.y);
            const id = def.base + i;
            UNIT_SHAPES[id] = {
                id,
                name: `${family}_${c.name}`,
                outline: base.outline.map(flip),
                pieces: base.pieces.map(p => ({pts: p.pts.map(flip), hidden: p.hidden})),
            };
        });
    }

    const scaledCache = new Map();

    /** True for ids that are one of the sloped/curved shapes (not 0 or 1). */
    function isShape(id) {
        return id in UNIT_SHAPES;
    }

    /** True for any id the engine understands. */
    function isKnown(id) {
        return id === ID.EMPTY || id === ID.SOLID || isShape(id);
    }

    /**
     * Shape geometry scaled to `size` pixels, cached. Each piece carries its bounds and
     * unit edge normals so collision does no setup work.
     */
    function get(id, size) {
        if (!isShape(id)) return null;
        const key = id + '@' + size;
        let s = scaledCache.get(key);
        if (s) return s;

        const u = UNIT_SHAPES[id];
        const scale = p => pt(p.x * size, p.y * size);
        s = {
            id,
            name: u.name,
            outline: u.outline.map(scale),
            pieces: u.pieces.map(p => {
                const pts = p.pts.map(scale);
                const edges = pts.map((a, i) => {
                    const b = pts[(i + 1) % pts.length];
                    const len = Math.hypot(b.x - a.x, b.y - a.y);
                    return {nx: (b.y - a.y) / len, ny: -(b.x - a.x) / len, hidden: p.hidden.includes(i)};
                });
                const xs = pts.map(q => q.x), ys = pts.map(q => q.y);
                return {
                    pts, edges,
                    minX: Math.min(...xs), maxX: Math.max(...xs),
                    minY: Math.min(...ys), maxY: Math.max(...ys),
                };
            }),
        };
        scaledCache.set(key, s);
        return s;
    }

    /** All shapes as unit-space definitions (for docs, tests and the future editor palette). */
    function all() {
        return Object.values(UNIT_SHAPES);
    }

    // ---- SAT ----

    /**
     * SAT between an AABB and one convex piece placed at (ox, oy). The push-out direction is chosen from
     * the piece's exposed edges only (see below).
     * @param {{left,top,right,bottom}} box
     * @returns {{nx:number, ny:number, depth:number}|null} MTV (unit normal from piece toward box, and
     *          penetration depth along it), or null if separated or merely touching.
     */
    function satBoxPiece(box, piece, ox, oy) {
        if (box.right <= ox + piece.minX + OVERLAP_EPS || box.left >= ox + piece.maxX - OVERLAP_EPS ||
            box.bottom <= oy + piece.minY + OVERLAP_EPS || box.top >= oy + piece.maxY - OVERLAP_EPS) {
            return null;
        }

        const bcx = (box.left + box.right) / 2, bcy = (box.top + box.bottom) / 2;
        const hw = (box.right - box.left) / 2, hh = (box.bottom - box.top) / 2;

        let bestDepth = Infinity, bestNx = 0, bestNy = 0;

        // Returns false when this axis separates the shapes.
        const testAxis = (nx, ny, selectable) => {
            const bc = bcx * nx + bcy * ny, br = hw * Math.abs(nx) + hh * Math.abs(ny);
            let pMin = Infinity, pMax = -Infinity;
            for (const p of piece.pts) {
                const d = (ox + p.x) * nx + (oy + p.y) * ny;
                if (d < pMin) pMin = d;
                if (d > pMax) pMax = d;
            }
            // Distance to slide the box out toward -axis (`back`) or +axis (`forward`). Deliberately not the
            // length of the intersection: when one interval contains the other that undercounts, and
            // picking the direction from the shapes' centres can point the long way round.
            const back = bc + br - pMin, forward = pMax - (bc - br);
            const overlap = Math.min(back, forward);
            if (overlap <= OVERLAP_EPS) return false;
            if (selectable && overlap < bestDepth) {
                bestDepth = overlap;
                const side = back < forward ? -1 : 1;   // the normal is the direction the box gets pushed
                bestNx = nx * side;
                bestNy = ny * side;
            }
            return true;
        };

        // The box's own axes only take part in the separation test. If they could also win the push-out
        // choice, a box clipping the tip of one fan triangle would be pushed sideways along x (a phantom
        // wall) even though the combined surface there is a plain floor. Axis-aligned tile edges are still
        // covered, because they are exposed edges of their piece.
        if (!testAxis(1, 0, false) || !testAxis(0, 1, false)) return null;
        for (const e of piece.edges) {
            if (!testAxis(e.nx, e.ny, !e.hidden)) return null;
        }
        return {nx: bestNx, ny: bestNy, depth: bestDepth};
    }

    /** 'floor' if the surface faces up within ~45°, 'ceiling' if it faces down, otherwise 'wall'. */
    function classify(ny) {
        if (ny <= -WALKABLE_NORMAL_Y) return 'floor';
        if (ny >= WALKABLE_NORMAL_Y) return 'ceiling';
        return 'wall';
    }

    // Highest (wantTop) or lowest y of the piece's boundary at local x.
    function extremeYAt(piece, xl, wantTop) {
        const pts = piece.pts;
        let best = wantTop ? Infinity : -Infinity;
        const take = y => { best = wantTop ? Math.min(best, y) : Math.max(best, y); };
        for (let i = 0; i < pts.length; i++) {
            const a = pts[i], b = pts[(i + 1) % pts.length];
            const lo = Math.min(a.x, b.x), hi = Math.max(a.x, b.x);
            if (xl < lo - 1e-9 || xl > hi + 1e-9) continue;
            if (hi - lo < 1e-9) {
                take(a.y);
                take(b.y);
            } else {
                take(a.y + (b.y - a.y) * (xl - a.x) / (b.x - a.x));
            }
        }
        return best;
    }

    /**
     * How far the box would have to move straight up (`up`) or straight down (`down`) to clear the
     * piece. Straight-line distances rather than the MTV, so the caller can resolve a floor contact
     * vertically and keep horizontal speed. Null if the x-ranges don't overlap.
     */
    function verticalClearance(box, piece, ox, oy) {
        const lo = Math.max(box.left, ox + piece.minX), hi = Math.min(box.right, ox + piece.maxX);
        if (hi - lo <= OVERLAP_EPS) return null;

        // Both extremes of a convex piece over an interval sit at the ends or at a vertex.
        const xs = [lo, hi];
        for (const p of piece.pts) {
            const x = ox + p.x;
            if (x > lo && x < hi) xs.push(x);
        }
        let top = Infinity, bottom = -Infinity;
        for (const x of xs) {
            top = Math.min(top, extremeYAt(piece, x - ox, true) + oy);
            bottom = Math.max(bottom, extremeYAt(piece, x - ox, false) + oy);
        }
        return {up: box.bottom - top, down: bottom - box.top, top};
    }

    function cellRange(box, size) {
        return {
            c0: Math.max(0, Math.floor(box.left / size)), c1: Math.floor(box.right / size),
            r0: Math.max(0, Math.floor(box.top / size)), r1: Math.floor(box.bottom / size),
        };
    }

    /**
     * Every shape contact between `box` and the tile grid.
     * @param {number[][]} tiles 2D tile-id array (row-major)
     * @param {number} size tile size in px
     * @returns {Array<{tileX,tileY,id,nx,ny,depth,kind,up,down}>} `kind` is floor|wall|ceiling;
     *          `up`/`down` are the straight-line clearances (see verticalClearance).
     */
    function contacts(tiles, size, box) {
        const out = [];
        const {c0, c1, r0, r1} = cellRange(box, size);
        for (let r = r0; r <= r1; r++) {
            const row = tiles[r];
            if (!row) continue;
            for (let c = c0; c <= c1; c++) {
                const shape = get(row[c], size);
                if (!shape) continue;
                const ox = c * size, oy = r * size;
                for (const piece of shape.pieces) {
                    const hit = satBoxPiece(box, piece, ox, oy);
                    if (!hit) continue;
                    const clear = verticalClearance(box, piece, ox, oy);
                    out.push({
                        tileX: ox, tileY: oy, id: shape.id,
                        nx: hit.nx, ny: hit.ny, depth: hit.depth, kind: classify(hit.ny),
                        up: clear ? clear.up : 0, down: clear ? clear.down : 0,
                    });
                }
            }
        }
        return out;
    }

    /** True if the box overlaps any shape tile. Cheaper than contacts() for yes/no callers. */
    function overlapsAny(tiles, size, box) {
        const {c0, c1, r0, r1} = cellRange(box, size);
        for (let r = r0; r <= r1; r++) {
            const row = tiles[r];
            if (!row) continue;
            for (let c = c0; c <= c1; c++) {
                const shape = get(row[c], size);
                if (!shape) continue;
                for (const piece of shape.pieces) {
                    if (satBoxPiece(box, piece, c * size, r * size)) {
                        return {tileX: c * size, tileY: r * size, id: shape.id};
                    }
                }
            }
        }
        return null;
    }

    /**
     * How far the box could drop before landing on something, up to `maxDrop`. Used to keep a
     * walker glued to a slope going downhill instead of hopping off it every frame.
     * @returns {{solid:number|null, shape:number|null}} nearest full-block top and nearest shape
     *          surface below the box (null if none within reach)
     */
    function dropDistance(tiles, size, box, maxDrop) {
        const result = {solid: null, shape: null};
        const c0 = Math.max(0, Math.floor(box.left / size)), c1 = Math.floor(box.right / size);
        const r0 = Math.max(0, Math.floor(box.bottom / size)), r1 = Math.floor((box.bottom + maxDrop) / size);
        for (let r = r0; r <= r1; r++) {
            const row = tiles[r];
            if (!row) continue;
            for (let c = c0; c <= c1; c++) {
                const id = row[c];
                const ox = c * size, oy = r * size;
                if (id === ID.SOLID) {
                    if (box.right <= ox + OVERLAP_EPS || box.left >= ox + size - OVERLAP_EPS) continue;
                    const d = oy - box.bottom;
                    if (d >= -OVERLAP_EPS && d <= maxDrop && (result.solid === null || d < result.solid)) result.solid = Math.max(d, 0);
                    continue;
                }
                const shape = get(id, size);
                if (!shape) continue;
                for (const piece of shape.pieces) {
                    const clear = verticalClearance(box, piece, ox, oy);
                    if (!clear) continue;
                    const d = clear.top - box.bottom;
                    if (d >= -OVERLAP_EPS && d <= maxDrop && (result.shape === null || d < result.shape)) result.shape = Math.max(d, 0);
                }
            }
        }
        return result;
    }

    return {
        ID, ARC_SEGMENTS, OVERLAP_EPS, WALKABLE_NORMAL_Y,
        isShape, isKnown, get, all,
        satBoxPiece, classify, verticalClearance,
        contacts, overlapsAny, dropDistance,
    };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = TileShapes;
}

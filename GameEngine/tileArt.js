// Drawing the level's tiles as vector shapes: one flat theme colour per level (the eight colours the old block images
// were), with a light edge along exposed tops and a shade along exposed bottoms, so floors, walls and ceilings read as
// solid. Pure drawing like entityArt.js: it needs TileShapes (a global in the browser, require()-able in Node).
const TileArt = (() => {
    const Shapes = typeof TileShapes !== 'undefined' ? TileShapes : require('./tileShapes.js');

    // The old block images, in their order: each was a single flat colour
    const PALETTE = ['#000000', '#2d5050', '#483c8c', '#708291', '#3c9a66', '#b87333', '#3d85c6', '#96223f'];

    const EDGE = {
        top: {width: 2.5, amount: 0.3},       // lighter: light falls from above
        left: {width: 1.5, amount: 0.12},
        right: {width: 1.5, amount: -0.18},   // darker
        bottom: {width: 2, amount: -0.3},
    };
    // At a fractional screen scale, two shapes that meet exactly leave a faint seam; overlapping by this much hides it
    const OVERLAP = 0.75;

    /** hex mixed toward white (amount > 0) or black (amount < 0). */
    function shade(hex, amount) {
        const n = parseInt(hex.slice(1), 16);
        const mix = c => Math.round(amount >= 0 ? c + (255 - c) * amount : c * (1 + amount));
        const r = mix(n >> 16), g = mix((n >> 8) & 255), b = mix(n & 255);
        return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
    }

    // Arc points come from sin/cos, so a curve's end can be 24.9999... instead of 25: compare with a tolerance
    const at = (v, target) => Math.abs(v - target) < 0.01;
    const SIDES = {
        top: {dr: -1, dc: 0, edge: (s, p, q) => at(p.y, s) && at(q.y, s)},       // the neighbour's bottom edge
        bottom: {dr: 1, dc: 0, edge: (s, p, q) => at(p.y, 0) && at(q.y, 0)},
        left: {dr: 0, dc: -1, edge: (s, p, q) => at(p.x, s) && at(q.x, s)},
        right: {dr: 0, dc: 1, edge: (s, p, q) => at(p.x, 0) && at(q.x, 0)},
    };

    // Does the tile next to this one, on the given side, close it off? A full block does; a shape does if its solid
    // part touches the shared side at all (so no light line is drawn across where the two meet).
    function neighbourCovers(map, row, col, side, size) {
        const {dr, dc, edge} = SIDES[side];
        const r = map[row + dr];
        if (!r) return true;                  // off the map: nothing to see
        const id = r[col + dc];
        if (id === undefined) return true;
        if (id === 1) return true;
        if (!id) return false;
        const shape = Shapes.get(id, size);
        if (!shape) return false;
        const o = shape.outline;
        for (let k = 0; k < o.length; k++) {
            const p = o[k], q = o[(k + 1) % o.length];
            if (edge(size, p, q) && Math.hypot(q.x - p.x, q.y - p.y) > 0.5) return true;
        }
        return false;
    }

    /** Which sides of the tile at (row, col) face open space. */
    function exposedSides(map, row, col, size) {
        const out = {};
        for (const side of Object.keys(SIDES)) out[side] = !neighbourCovers(map, row, col, side, size);
        return out;
    }

    function solid(map, row, col) {
        return !!map[row] && map[row][col] === 1;
    }

    // The exposed sides of full blocks as thin bands. Neighbouring blocks with the same side open share one band (a
    // band per tile shows a tick at every tile boundary at fractional scales).
    function drawBlockEdges(ctx, map, size, view, color) {
        const exposed = {};
        const key = (i, j) => i + ',' + j;
        for (let i = view.rowFrom; i <= view.rowTo; i++) {
            for (let j = view.colFrom; j <= view.colTo; j++) {
                if (map[i][j] === 1) exposed[key(i, j)] = exposedSides(map, i, j, size);
            }
        }
        const open = (i, j, side) => { const e = exposed[key(i, j)]; return !!e && e[side]; };
        for (const side of ['bottom', 'right', 'left', 'top']) {
            const {width, amount} = EDGE[side];
            ctx.fillStyle = shade(color, amount);
            const horizontal = side === 'top' || side === 'bottom';
            const [outerFrom, outerTo, innerFrom, innerTo] = horizontal
                ? [view.rowFrom, view.rowTo, view.colFrom, view.colTo]
                : [view.colFrom, view.colTo, view.rowFrom, view.rowTo];
            for (let a = outerFrom; a <= outerTo; a++) {
                let b = innerFrom;
                while (b <= innerTo) {
                    const at = (n) => horizontal ? open(a, n, side) : open(n, a, side);
                    if (!at(b)) { b++; continue; }
                    let end = b;
                    while (end + 1 <= innerTo && at(end + 1)) end++;
                    const len = (end - b + 1) * size;
                    if (side === 'top') ctx.fillRect(b * size, a * size, len, width);
                    else if (side === 'bottom') ctx.fillRect(b * size, (a + 1) * size - width, len, width);
                    else if (side === 'left') ctx.fillRect(a * size, b * size, width, len);
                    else ctx.fillRect((a + 1) * size - width, b * size, width, len);
                    b = end + 1;
                }
            }
        }
    }

    // A sloped or curved tile: filled, its outline stroked in the same colour to close seams, and its slanted or
    // curved surface lit by which way it faces (up: light, down: shade). The straight sides along the tile's own edges
    // are treated like a block's.
    function drawShape(ctx, map, row, col, id, size, color) {
        const shape = Shapes.get(id, size);
        if (!shape) return;
        const x = col * size, y = row * size, o = shape.outline;
        ctx.beginPath();
        o.forEach((p, k) => k === 0 ? ctx.moveTo(x + p.x, y + p.y) : ctx.lineTo(x + p.x, y + p.y));
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
        ctx.lineWidth = OVERLAP;
        ctx.strokeStyle = color;
        ctx.stroke();

        const cx = o.reduce((s, p) => s + p.x, 0) / o.length, cy = o.reduce((s, p) => s + p.y, 0) / o.length;
        const sides = exposedSides(map, row, col, size);
        ctx.lineCap = 'round';
        for (let k = 0; k < o.length; k++) {
            const p = o[k], q = o[(k + 1) % o.length];
            const onSide = (at(p.y, 0) && at(q.y, 0)) ? 'top' : (at(p.y, size) && at(q.y, size)) ? 'bottom'
                : (at(p.x, 0) && at(q.x, 0)) ? 'left' : (at(p.x, size) && at(q.x, size)) ? 'right' : null;
            if (onSide && !sides[onSide]) continue;
            // Outward normal: perpendicular to the segment, pointing away from the shape's middle
            let nx = q.y - p.y, ny = p.x - q.x;
            const mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2;
            if (nx * (mx - cx) + ny * (my - cy) < 0) { nx = -nx; ny = -ny; }
            const len = Math.hypot(nx, ny) || 1;
            ny /= len;
            const edge = onSide ? EDGE[onSide] : ny < -0.3 ? EDGE.top : ny > 0.3 ? EDGE.bottom : EDGE.right;
            ctx.strokeStyle = shade(color, edge.amount);
            ctx.lineWidth = edge.width;
            // Inset by half the width so the band sits on the shape, like a block's
            const ix = -nx / len * edge.width / 2, iy = -ny * edge.width / 2;
            ctx.beginPath();
            ctx.moveTo(x + p.x + ix, y + p.y + iy);
            ctx.lineTo(x + q.x + ix, y + q.y + iy);
            ctx.stroke();
        }
    }

    /**
     * Draw the tiles of map (rows of tile ids) whose rows and columns are in view ({rowFrom, rowTo, colFrom, colTo}),
     * in the theme colour PALETTE[colorIndex].
     */
    function drawTiles(ctx, map, size, view, colorIndex) {
        const color = PALETTE[colorIndex] || PALETTE[0];
        ctx.save();
        // Fill: each row's runs of full blocks as one rectangle, reaching a little into the row below where that is
        // solid too, so no seam shows between tiles at any scale
        ctx.fillStyle = color;
        for (let i = view.rowFrom; i <= view.rowTo; i++) {
            const row = map[i];
            let j = view.colFrom;
            while (j <= view.colTo) {
                if (row[j] !== 1) { j++; continue; }
                const below = solid(map, i + 1, j);
                let end = j;
                while (end + 1 <= view.colTo && row[end + 1] === 1 && solid(map, i + 1, end + 1) === below) end++;
                const right = end + 1 <= view.colTo && row[end + 1] === 1 ? OVERLAP : 0;
                ctx.fillRect(j * size, i * size, (end - j + 1) * size + right, size + (below ? OVERLAP : 0));
                j = end + 1;
            }
        }
        // Edges of full blocks, then the shapes
        drawBlockEdges(ctx, map, size, view, color);
        for (let i = view.rowFrom; i <= view.rowTo; i++) {
            for (let j = view.colFrom; j <= view.colTo; j++) {
                const id = map[i][j];
                if (id && id !== 1) drawShape(ctx, map, i, j, id, size, color);
            }
        }
        ctx.restore();
    }

    /** A big block's box in a colour, with the same light top and shaded bottom as the tiles. */
    function drawBigBlock(ctx, x, y, w, h, color) {
        ctx.fillStyle = color;
        ctx.fillRect(x, y, w, h);
        const t = Math.min(EDGE.top.width, h / 3), b = Math.min(EDGE.bottom.width, h / 3);
        ctx.fillStyle = shade(color, EDGE.top.amount * 0.7);
        ctx.fillRect(x, y, w, t);
        ctx.fillStyle = shade(color, EDGE.bottom.amount * 0.7);
        ctx.fillRect(x, y + h - b, w, b);
        const s = Math.min(EDGE.left.width, w / 3);
        ctx.fillStyle = shade(color, EDGE.left.amount);
        ctx.fillRect(x, y + t, s, h - t - b);
        ctx.fillStyle = shade(color, EDGE.right.amount);
        ctx.fillRect(x + w - s, y + t, s, h - t - b);
    }

    return {PALETTE, EDGE, OVERLAP, shade, exposedSides, drawTiles, drawBigBlock};
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = TileArt;
}

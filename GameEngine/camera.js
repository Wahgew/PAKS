/**
 * Camera: which part of the level the canvas shows. Pure logic, no DOM or game dependencies, so it loads as a plain
 * <script> in the browser (global `Camera`) and via require() in Node for tests.
 *
 * The game draws through a fixed-size view (76 x 41 tiles, the size of the biggest original floor) instead of a
 * canvas as big as the level. A level that fits in the view is shown whole and centred; a bigger one scrolls with
 * the player. Tiles and sprites therefore stay the same size on screen whatever the level's size, and the window
 * scale (see autoScreenResizer.js) is the same for every level.
 *
 * `x`/`y` are the world position of the view's top-left corner and `zoom` is screen pixels per world pixel. The game
 * always uses zoom 1; the level editor pans and zooms freely.
 */
const Camera = (() => {
    const TILE = 25;
    const VIEW_COLS = 76, VIEW_ROWS = 41;        // every original floor (76 wide, 36-41 tall) fits without scrolling
    const FOLLOW_RATE = 8;                       // per second: how quickly the view catches up with the player
    const KEEP_INSIDE = 0.3;                     // the target never comes nearer than this fraction of the view to an edge
    const MIN_ZOOM = 0.05, MAX_ZOOM = 4;

    /**
     * Where the top-left of a view `view` long should sit along a world `world` long: as close to `pos` as the world
     * allows, or centred (so a negative position) when the world is smaller than the view.
     */
    function clampAxis(pos, view, world) {
        if (world <= view) return (world - view) / 2;
        return Math.min(Math.max(pos, 0), world - view);
    }

    class Camera {
        constructor(viewW = VIEW_COLS * TILE, viewH = VIEW_ROWS * TILE) {
            this.viewW = viewW;
            this.viewH = viewH;
            this.x = 0;
            this.y = 0;
            this.zoom = 1;
        }

        setView(w, h) {
            this.viewW = w;
            this.viewH = h;
        }

        /** How much of the world the view covers, in world pixels. */
        get worldW() { return this.viewW / this.zoom; }
        get worldH() { return this.viewH / this.zoom; }

        // ---- following a target (the game) ----

        /** The camera position that centres (cx, cy) as far as the level allows. */
        goal(cx, cy, mapW, mapH) {
            return {
                x: clampAxis(cx - this.worldW / 2, this.worldW, mapW),
                y: clampAxis(cy - this.worldH / 2, this.worldH, mapH),
            };
        }

        /** Jump straight to the target, for the moment a level loads. */
        snapTo(cx, cy, mapW, mapH) {
            const g = this.goal(cx, cy, mapW, mapH);
            this.x = g.x;
            this.y = g.y;
        }

        /** Ease toward the target over `dt` seconds. */
        follow(cx, cy, mapW, mapH, dt) {
            const g = this.goal(cx, cy, mapW, mapH);
            const k = 1 - Math.exp(-FOLLOW_RATE * Math.max(dt, 0));
            this.x += (g.x - this.x) * k;
            this.y += (g.y - this.y) * k;
            // Easing can lag a target that moves faster than it (a long fall), so also keep it inside the middle of the view
            const mx = this.worldW * KEEP_INSIDE, my = this.worldH * KEEP_INSIDE;
            this.x = clampAxis(Math.min(Math.max(this.x, cx - (this.worldW - mx)), cx - mx), this.worldW, mapW);
            this.y = clampAxis(Math.min(Math.max(this.y, cy - (this.worldH - my)), cy - my), this.worldH, mapH);
        }

        // ---- free panning and zooming (the editor) ----

        screenToWorld(sx, sy) {
            return {x: this.x + sx / this.zoom, y: this.y + sy / this.zoom};
        }

        worldToScreen(wx, wy) {
            return {x: (wx - this.x) * this.zoom, y: (wy - this.y) * this.zoom};
        }

        /** Zoom by `factor`, keeping the world point under the screen position (sx, sy) where it is. */
        zoomAt(sx, sy, factor) {
            const before = this.screenToWorld(sx, sy);
            this.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this.zoom * factor));
            this.x = before.x - sx / this.zoom;
            this.y = before.y - sy / this.zoom;
        }

        /** Move the view by a screen-space distance. */
        panBy(dx, dy) {
            this.x -= dx / this.zoom;
            this.y -= dy / this.zoom;
        }

        /** Show the whole level, centred, never magnified past 1:1. `margin` is a fraction of the level's size. */
        fit(mapW, mapH, margin = 0.03) {
            const z = Math.min(this.viewW / (mapW * (1 + 2 * margin)), this.viewH / (mapH * (1 + 2 * margin)), 1);
            this.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
            this.x = (mapW - this.worldW) / 2;
            this.y = (mapH - this.worldH) / 2;
        }

        /** Set the zoom around the centre of the view. */
        setZoom(zoom) {
            this.zoomAt(this.viewW / 2, this.viewH / 2, zoom / this.zoom);
        }

        // ---- drawing ----

        /** The world rectangle currently on screen. */
        visibleRect() {
            return {left: this.x, top: this.y, right: this.x + this.worldW, bottom: this.y + this.worldH};
        }

        /** Canvas transform [a, b, c, d, e, f] for world drawing, with whole-pixel translation so tile edges stay sharp. */
        transform() {
            return [this.zoom, 0, 0, this.zoom, -Math.round(this.x * this.zoom), -Math.round(this.y * this.zoom)];
        }
    }

    Camera.TILE = TILE;
    Camera.VIEW_COLS = VIEW_COLS;
    Camera.VIEW_ROWS = VIEW_ROWS;
    Camera.VIEW_W = VIEW_COLS * TILE;
    Camera.VIEW_H = VIEW_ROWS * TILE;
    Camera.MIN_ZOOM = MIN_ZOOM;
    Camera.MAX_ZOOM = MAX_ZOOM;
    Camera.clampAxis = clampAxis;
    return Camera;
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = Camera;
}

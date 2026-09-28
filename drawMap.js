class drawMap {
        constructor(drawSize, gameEngine) {
                this.drawSize = drawSize;
                this.game = gameEngine;
                this.block = ASSET_MANAGER.getAsset("./sprites/block.png");
                console.log("DrawMap initialized with size:", drawSize);
                this.blocks = [
                        ASSET_MANAGER.getAsset("./sprites/block.png"),
                        ASSET_MANAGER.getAsset("./sprites/block2.png"),
                        ASSET_MANAGER.getAsset("./sprites/block3.png"),
                        ASSET_MANAGER.getAsset("./sprites/block4.png"),
                        ASSET_MANAGER.getAsset("./sprites/block5_forestgreen.png"),
                        ASSET_MANAGER.getAsset("./sprites/block6_amber.png"),
                        ASSET_MANAGER.getAsset("./sprites/block7_ocean.png"),
                        ASSET_MANAGER.getAsset("./sprites/block8_burgundy.png")];
                this.colors = [
                        // Original 9 colors
                        "pink",
                        "peachpuff",
                        "lightgoldenrodyellow",
                        "lavender",
                        "paleturquoise",
                        "lightsteelblue",
                        "thistle",
                        "lightsalmon",
                        "lavenderblush",

                        // New coordinated theme backgrounds
                        "#D4E6CB",  // Light sage (pairs with forest green)
                        "#FFF8DC",  // Cornsilk (Amber/Gold theme)
                        "#E0F7FA",  // Very light cyan (Ocean Blue theme)
                        "#F5E9EB"]   // Lavender blush (Burgundy theme)

                // Theme selection logic (30% coordinated, 70% random)
                const useCoordinatedTheme = Math.random() < 0.3;

                if (useCoordinatedTheme) {
                        // Select one of the 4 coordinated themes
                        const themeIndex = Math.floor(Math.random() * 4);
                        this.random = 9 + themeIndex;  // Coordinated background
                        this.random2 = 4 + themeIndex; // Coordinated block
                        console.log(`Using coordinated theme #${themeIndex + 1}`);
                } else {
                        // Completely random selection from all options
                        this.random = Math.floor(Math.random() * this.colors.length);
                        this.random2 = Math.floor(Math.random() * this.blocks.length);
                        console.log("Using random color combination");
                }
                gameEngine.currentColor = this.random2;
/*
 * NEW BLOCK COLOR REFERENCE
 * -------------------------
 * This is a reference guide for the colors to use when creating
 * the new block PNG images. Each block should use the specified
 * color scheme and size of 314x313.
 */

// BLOCK 5: FOREST GREEN THEME
// ---------------------------
// Main block color: #3C9A66 (slightly brighter than the BigBlock color)
// BigBlock color for reference: #2E8B57
// Background color that pairs with this: #D4E6CB (light sage)

// BLOCK 6: AMBER/GOLD THEME
// -------------------------
// Main block color: #B87333 (slightly darker copper-gold)
// BigBlock color for reference: #CD853F
// Background color that pairs with this: #FFF8DC (cornsilk)

// BLOCK 7: OCEAN BLUE THEME
// -------------------------
// Main block color: #3D85C6 (medium bright blue)
// BigBlock color for reference: #20639B
// Background color that pairs with this: #E0F7FA (very light cyan)

// BLOCK 8: BURGUNDY THEME
// ----------------------
// Main block color: #96223F (rich wine red)
// BigBlock color for reference: #820933
// Background color that pairs with this: #F5E9EB (very light pink)

                /*
                 * HOW TO CREATE THE BLOCK PNGs
                 * ---------------------------
                 * 1. Use the exact same dimensions as your existing blocks (314x313)
                 * 2. Use the color codes specified above
                 * 3. Maintain the same style/shading pattern as your existing blocks
                 * 4. Save in PNG format with the specified filenames
                 *
                 * Filename convention:
                 * - block5_forestgreen.png
                 * - block6_amber.png
                 * - block7_oceanblue.png
                 * - block8_burgundy.png
                 */

// COLOR COMBINATIONS QUICK REFERENCE
// ----------------------------------
// Theme 1: Forest Green
// BigBlock: #2E8B57 | TileBlock: #3C9A66 | Background: #D4E6CB

// Theme 2: Amber/Gold
// BigBlock: #CD853F | TileBlock: #B87333 | Background: #FFF8DC

// Theme 3: Ocean Blue
// BigBlock: #20639B | TileBlock: #3D85C6 | Background: #E0F7FA

// Theme 4: Burgundy
// BigBlock: #820933 | TileBlock: #96223F | Background: #F5E9EB
        }



        update() {
        }

        /** The level's size in pixels. The canvas is a fixed-size view of it (see camera.js), not this size. */
        get pixelWidth() {
                return this.map && this.map[0] ? this.map[0].length * this.drawSize : 0;
        }

        get pixelHeight() {
                return this.map ? this.map.length * this.drawSize : 0;
        }

        loadMap (tiles) {
                if (!Array.isArray(tiles)) {
                        console.error('drawMap.loadMap: expected a 2D tile array');
                        return;
                }
                // Ids come straight from level JSON; anything the engine doesn't know becomes empty so a typo
                // can't put an invisible, half-working tile in the level.
                const unknown = new Set();
                this.map = tiles.map(row => row.map(id => {
                        if (TileShapes.isKnown(id)) return id;
                        unknown.add(id);
                        return 0;
                }));
                if (unknown.size > 0) {
                        console.warn('drawMap.loadMap: unknown tile ids treated as empty:', [...unknown].join(', '));
                }
                // Lets collision skip all shape work on the (currently all) levels that only use 0 and 1.
                this.hasShapes = this.map.some(row => row.some(id => TileShapes.isShape(id)));
        }

        /**
         * Any tile hit: full blocks first, then sloped/curved shapes (exact SAT against entity.BB).
         * Shape hits also report the shape id and push-out normal/depth.
         */
        checkCollisions(entity) {
                const solid = this.checkSolidTiles(entity);
                if (solid.collides || !this.hasShapes) return solid;

                const hit = TileShapes.overlapsAny(this.map, this.drawSize, entity.BB);
                if (!hit) return { collides: false };
                return { collides: true, tileX: hit.tileX, tileY: hit.tileY, shape: hit.id };
        }

        /**
         * Full square blocks only (tile id 1). This is the original collision test, kept as is because the
         * player resolves full blocks by snapping to tile edges and shapes by a different route.
         */
        checkSolidTiles(entity) {
                if (!entity || !entity.BB) {
                        console.error("Invalid entity passed to checkCollisions");
                        return { collides: false };
                }

                // Get the tiles the entity could be colliding with
                const tileStartX = Math.floor(entity.x / this.drawSize);
                const tileEndX = Math.floor((entity.x + entity.width) / this.drawSize);
                const tileStartY = Math.floor(entity.y / this.drawSize);
                const tileEndY = Math.floor((entity.y + entity.height) / this.drawSize);

                // Add bounds checking
                // const maxY = this.map.length;
                // const maxX = this.map[0].length;

                if (entity.x + entity.width > this.map[0].length * this.drawSize) {
                        return {
                                collides: true,
                                tileX:  this.map[0].length * this.drawSize,
                                tileY: entity.y
                        };
                }

                // Regular tile collision checking
                for (let i = tileStartY; i <= tileEndY; i++) {
                        for (let j = tileStartX; j <= tileEndX; j++) {
                                if (this.map[i] && this.map[i][j] === 1) {
                                        const tileBB = new BoundingBox(
                                            j * this.drawSize,
                                            i * this.drawSize,
                                            this.drawSize,
                                            this.drawSize
                                        );

                                        if (entity.BB.collide(tileBB)) {
                                                return {
                                                        collides: true,
                                                        tileX: j * this.drawSize,
                                                        tileY: i * this.drawSize
                                                };
                                        }
                                }
                        }
                }

                return { collides: false };
        }

        /** Shape contacts for a box (see TileShapes.contacts); empty when the level has no shapes. */
        getShapeContacts(box) {
                return this.hasShapes ? TileShapes.contacts(this.map, this.drawSize, box) : [];
        }

        /** How far a box could drop before landing on a full block or a shape (see TileShapes.dropDistance). */
        getDropDistance(box, maxDrop) {
                return TileShapes.dropDistance(this.map, this.drawSize, box, maxDrop);
        }

        draw(ctx) {
                if (!ctx || !ctx.drawImage) {
                        console.error("Invalid context passed to drawMap.draw:", ctx);
                        return;
                }

                this.#clearCanvas(ctx);
                this.#drawMap(ctx);
        }

        #drawMap(ctx) {
                if (!ctx) {
                        console.error("No context provided to drawMap");
                        return;
                }

                // Only draw the tiles that are visible: a level can be far bigger than the view
                const view = this.game && this.game.camera ? this.game.camera.visibleRect() : null;
                const size = this.drawSize;
                const rowFrom = view ? Math.max(0, Math.floor(view.top / size)) : 0;
                const rowTo = view ? Math.min(this.map.length - 1, Math.floor(view.bottom / size)) : this.map.length - 1;
                for (let i = rowFrom; i <= rowTo; i++) {
                        const colFrom = view ? Math.max(0, Math.floor(view.left / size)) : 0;
                        const colTo = view ? Math.min(this.map[i].length - 1, Math.floor(view.right / size)) : this.map[i].length - 1;
                        for (let j = colFrom; j <= colTo; j++) {
                                if (this.map[i][j] === 1) {  // If it's a solid tile
                                        const x = j * this.drawSize;
                                        const y = i * this.drawSize;

                                        try {
                                                ctx.drawImage(
                                                    this.blocks[this.random2],
                                                    x,
                                                    y,
                                                    this.drawSize,
                                                    this.drawSize
                                                );

                                                // Draw collision boxes if debugging is enabled
                                                if (this.game.options.debugging) {
                                                        ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)';
                                                        ctx.strokeRect(x, y, this.drawSize, this.drawSize);
                                                }
                                        } catch (e) {
                                                console.error("Error drawing tile at", x, y, e);
                                        }
                                } else if (this.map[i][j] !== 0) {
                                        this.#drawShape(ctx, this.map[i][j], j * this.drawSize, i * this.drawSize);
                                }
                        }
                }
        }

        // Sloped/curved tile: the same block sprite, clipped to the shape's outline so it matches the theme.
        #drawShape(ctx, id, x, y) {
                const shape = TileShapes.get(id, this.drawSize);
                if (!shape) return;

                ctx.save();
                ctx.beginPath();
                shape.outline.forEach((p, k) => k === 0 ? ctx.moveTo(x + p.x, y + p.y) : ctx.lineTo(x + p.x, y + p.y));
                ctx.closePath();
                ctx.clip();
                ctx.drawImage(this.blocks[this.random2], x, y, this.drawSize, this.drawSize);
                ctx.restore();

                if (this.game.options.debugging) {
                        // Outline plus the convex pieces collision actually uses
                        ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)';
                        ctx.stroke(this.#shapePath(shape.outline, x, y));
                        ctx.strokeStyle = 'rgba(255, 0, 0, 0.2)';
                        shape.pieces.forEach(piece => ctx.stroke(this.#shapePath(piece.pts, x, y)));
                }
        }

        #shapePath(pts, x, y) {
                const path = new Path2D();
                pts.forEach((p, k) => k === 0 ? path.moveTo(x + p.x, y + p.y) : path.lineTo(x + p.x, y + p.y));
                path.closePath();
                return path;
        }

        #clearCanvas(ctx) {
                if (!ctx) return;
                try {
                        // Just the level's own area: outside it the engine leaves the canvas black
                        ctx.fillStyle = this.colors[this.random] 
                        ctx.fillRect(0, 0, this.pixelWidth, this.pixelHeight);
                } catch (e) {
                        console.error("Error in clearCanvas:", e);
                }
        }

}

/* Map template*/
// map = [
//         [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,],
//         [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,],
//         [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,],
//         [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,],
//         [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,],
//         [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,],
//         [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,],
//         [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,],
//         [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,],
//         [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,],
//         [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,],
//         [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,],
//         [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,],
//         [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,],
//         [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,],
//         [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,],
//         [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,],
//         [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,],
//         [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,],
//         [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,],
//         [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,],
//         [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,],
//         [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,],
//         [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,],
//         [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,],
//         [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,],
//         [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,],
//         [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,],
//         [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,],
//         [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,],
//         [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,],
//         [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,],
//         [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,],
//         [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,],
//         [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,],
//         [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,],
//         [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,],
// ]

if (typeof module !== 'undefined' && module.exports) {
        module.exports = drawMap;
}
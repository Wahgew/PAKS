class drawMap {
        constructor(drawSize, gameEngine) {
                this.drawSize = drawSize;
                this.game = gameEngine;
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
                        this.random2 = Math.floor(Math.random() * TileArt.PALETTE.length);
                        console.log("Using random color combination");
                }
                gameEngine.currentColor = this.random2;
                // The coordinated themes pair tile colours 4-7 (forest green, amber, ocean, burgundy; TileArt.PALETTE) with
                // backgrounds 9-12 and the matching big-block colours (bigblock.js)

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
                const colFrom = view ? Math.max(0, Math.floor(view.left / size)) : 0;
                const lastCol = Math.ceil(this.pixelWidth / size) - 1;
                const colTo = view ? Math.min(lastCol, Math.floor(view.right / size)) : lastCol;
                // Vector tiles in the level's theme colour (tileArt.js); random2 picks the colour, as it picked the block image
                TileArt.drawTiles(ctx, this.map, size, {rowFrom, rowTo, colFrom, colTo}, this.random2);

                if (this.game.options.debugging) {
                        for (let i = rowFrom; i <= rowTo; i++) {
                                for (let j = colFrom; j <= Math.min(colTo, this.map[i].length - 1); j++) {
                                        const id = this.map[i][j];
                                        if (id === 1) {
                                                ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)';
                                                ctx.strokeRect(j * size, i * size, size, size);
                                        } else if (id) {
                                                this.#drawShapeDebug(ctx, id, j * size, i * size);
                                        }
                                }
                        }
                }
        }

        // Debug view of a sloped/curved tile: its outline plus the convex pieces collision actually uses
        #drawShapeDebug(ctx, id, x, y) {
                const shape = TileShapes.get(id, this.drawSize);
                if (!shape) return;
                ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)';
                ctx.stroke(this.#shapePath(shape.outline, x, y));
                ctx.strokeStyle = 'rgba(255, 0, 0, 0.2)';
                shape.pieces.forEach(piece => ctx.stroke(this.#shapePath(piece.pts, x, y)));
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
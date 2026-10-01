class BigBlock {
    constructor(game, x, y, x2, y2) {
        Object.assign(this, {game, x, y, x2, y2});
        this.width = x2 - x;
        this.height = y2 - y;
        this.BB = new BoundingBox(this.x, this.y, this.width, this.height);
        this.colors = [
            // Hex, so the edges can be shaded (tileArt.js); these are exactly the old named colours
            "#800000",  // maroon (the tiles are black, darkcyan, darkslateblue, slategray)
            "#008080",  // teal
            "#dda0dd",  // plum
            "#2f4f4f",  // darkslategray
            "#2E8B57",  // Forest Green
            "#CD853F",  // amber
            "#20639B",  // ocean
            "#820933"   // burgundy
        ]
    }
    update() {
        ;
    }
    draw(ctx) {
        if (this.game.options.debugging) {
            // Draw debug box
            ctx.strokeStyle = 'red';
            ctx.strokeRect(this.x, this.y, this.width, this.height);
        }
        // With the tiles' light top and shaded bottom (tileArt.js); a reversed block (negative size) stays a plain fill
        const color = this.colors[this.game.currentColor];
        if (this.width > 0 && this.height > 0) {
            TileArt.drawBigBlock(ctx, this.x, this.y, this.width, this.height, color);
        } else {
            ctx.fillStyle = color;
            ctx.fillRect(this.x, this.y, this.width, this.height);
        }
    }
}
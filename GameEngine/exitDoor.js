class exitDoor {
    constructor(game, x, y, levers = 0) { // 0 levers required by default
        Object.assign(this, { game, x, y, levers});

        // Door dimensions (same as tile size)
        this.width = 276;
        this.height = 326;
    
        // How far the doors have slid open (0..1) since they unlocked; drawing only
        this.openAmount = 0;

        // Door state
        this.isOpen = false;
        this.active = true; // If the door can be interacted with
        this.collectedLevers = 0;
        this.scale = 0.25

        this.updateBB();
    }

    updateBB() {
        this.BB = new BoundingBox(this.x, this.y, this.width * this.scale, this.height * this.scale);
    }

    update() {
        if (!this.active) return;
        if (this.collectedLevers >= this.levers) this.isOpen = true;
    }

    draw(ctx) {
        if (!ctx) return;

        // Vector drawing (entityArt.js): once unlocked, the doors slide open over about half a second
        this.openAmount = this.isOpen ? Math.min(1, this.openAmount + (this.game.clockTick || 0) / 0.6) : 0;
        EntityArt.exitDoor(ctx, this, !this.isOpen, this.openAmount);

        // Debug: draw collision box
        if (this.game.options.debugging) {
            ctx.strokeStyle = "red";
            ctx.strokeRect(this.x, this.y, this.width * this.scale, this.height * this.scale);
        }
    }
}
class Lever {
    constructor({gameEngine, x, y, speed, moving, direction, reverseTime}) {
        this.game = gameEngine;
        Object.assign(this, {x, y, speed, moving, direction, reverseTime});

        this.height = 53;
        this.width = 23;
        this.time = 0;
        this.reverse = false;
        this.collected = false;

        // Initialize flip state based on direction
        this.isFlipped = (this.direction === 'LEFT');

        // How far the handle has swung down once pulled (0..1); drawing only
        this.flip = 0;

        this.velocity = {x: 0, y: 0};
        this.updateBB();
    }

    updateBB() {
        this.BB = new BoundingBox(this.x, this.y, this.width, this.height);
    };

    update() {
        if (this.moving) updateMovement(this.game, this);

        // Determine flip state based on direction parameter
        this.isFlipped = (this.direction === 'LEFT');

        this.updateBB();
    }

    draw(ctx) {
        if (this.game.options.debugging) {
            // Draw debug box
            ctx.strokeStyle = 'red';
            ctx.strokeRect(this.x, this.y, this.width, this.height);
        }

        // Vector drawing (entityArt.js): the handle swings down over a fifth of a second when pulled
        this.flip = this.collected ? Math.min(1, this.flip + (this.game.clockTick || 0) / 0.2) : 0;
        EntityArt.lever(ctx, this, this.flip);
    }
}

/**
 * Update movement for if enemy entity is moving but !tracking.
 * @param {gameEngine} game
 * @param {enemies} object
 */
function updateMovement(game, object) { // consider option to make reverse coord based, so spikes can move in same location but staggered start.
    if (object.moving && !object.tracking) { // make option for based on distance from starting, i.e. move until x is like -50 from start coord.
        switch (object.direction) {
            case 'UP':
                if (!object.reverse) object.velocity.y = object.speed;
                else object.velocity.y = -object.speed;
                if (object.time >= object.reverseTime) {
                    object.time = 0;
                    object.reverse = !object.reverse;
                }
                object.time += game.clockTick;
                break;
            case 'DOWN':
                if (object.reverse) object.velocity.y = object.speed;
                else object.velocity.y = -object.speed;
                if (object.time >= object.reverseTime) {
                    object.time = 0;
                    object.reverse = !object.reverse;
                }
                object.time += game.clockTick;
                break;
            case 'LEFT':
                if (object.reverse) object.velocity.x = object.speed;
                else object.velocity.x = -object.speed;
                if (object.time >= object.reverseTime) {
                    object.time = 0;
                    object.reverse = !object.reverse;
                }
                object.time += game.clockTick;
                break;
            case 'RIGHT':
                if (!object.reverse) object.velocity.x = object.speed;
                else object.velocity.x = -object.speed;
                if (object.time >= object.reverseTime) {
                    object.time = 0;
                    object.reverse = !object.reverse;
                }
                object.time += game.clockTick;
                break;
        }
    }
}
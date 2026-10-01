class Transition {
    constructor(gameEngine, open) {
        this.game = gameEngine;
        if (open) { // check if these numbers are correct
            this.elevatorLx = -960;
            this.elevatorRx = 1920;
        } else {
            this.elevatorLx = 0;
            this.elevatorRx = 960;
        }
        this.state = 0; // 0 = stopped, 1 = opening, 2 = closing 3 = invisible.;
        this.velocity = 50;
    }
    update() {
        if (this.state == 1) { // opening
            if (this.elevatorLx <= -960 || this.elevatorRx >= 1920) {
                this.state = 3;
            }
            this.elevatorLx += this.game.clockTick * this.velocity;
            this.elevatorRx -= this.game.clockTick * this.velocity;
        } else if (this.state == 2) { // closing
            if (this.elevatorLx >= 0 || this.elevatorRx <= 960) {
                this.state = 3;
            }
            this.elevatorLx -= this.game.clockTick * this.velocity;
            this.elevatorRx += this.game.clockTick * this.velocity;
        }
    }
    draw(ctx) {
        if (this.state != 3) {
            this.drawDoor(ctx, this.elevatorLx, 1);
            this.drawDoor(ctx, this.elevatorRx, -1);
        }
    }
    // One elevator door, 960x1080 as the old door images were: brushed steel with a darker strip and a black edge
    // where the doors meet (meetSide 1: the right edge, -1: the left)
    drawDoor(ctx, x, meetSide) {
        ctx.fillStyle = '#c0cdd6';
        ctx.fillRect(x, 0, 960, 1080);
        ctx.fillStyle = '#9aa7b0';
        ctx.fillRect(meetSide > 0 ? x + 900 : x + 20, 0, 40, 1080);
        ctx.fillStyle = '#000';
        ctx.fillRect(meetSide > 0 ? x + 940 : x, 0, 20, 1080);
    }

    openDoor() {
        this.state = 1;
    }
    closeDoor() {
        this.state = 2;
    }
}
class DeathParticle {
    constructor(x, y, type, angle, speed) {
        this.x = x;
        this.y = y;
        this.type = type; // 'line', 'blob', or 'bodyPart'
        this.angle = angle;
        this.speed = speed;
        this.alpha = 1;
        // Size configurations for different particle types
        if (type === 'blob') {
            this.size = Math.random() * 40 + 10; // Blob radius: random between 4-12 pixels
        } else if (type === 'line') {
            this.size = 4; // Line thickness
            this.length = Math.random() * 120 + 30; // Line length: random between 20-50 pixels
        } else {
            this.size = 1; // Default size for other types
        }

        if (type === 'bodyPart') {
            this.partType = Math.floor(Math.random() * 6); // 0-5 for different body parts
            this.rotation = Math.random() * Math.PI * 2;
            this.rotationSpeed = (Math.random() - 0.5) * 0.2;
        }

        // Random slight variation to the angle for more chaotic effect
        this.angle += (Math.random() - 0.5) * 2.0;
    }

    update(deltaTime) {
        // Move particle
        this.x += Math.cos(this.angle) * this.speed * deltaTime;
        this.y += Math.sin(this.angle) * this.speed * deltaTime;

        // Slow down
        this.speed *= 0.95;

        // Fade out
        this.alpha *= 0.92;

        // Rotate body parts
        if (this.type === 'bodyPart') {
            this.rotation += this.rotationSpeed;
        }

        return this.alpha > 0.01;
    }

    draw(ctx) {
        ctx.save();
        ctx.globalAlpha = this.alpha;
        ctx.fillStyle = 'red';
        ctx.strokeStyle = 'red';

        switch (this.type) {
            case 'line':
                ctx.beginPath();
                ctx.moveTo(this.x, this.y);
                ctx.lineTo(
                    this.x + Math.cos(this.angle) * this.length,
                    this.y + Math.sin(this.angle) * this.length
                );
                ctx.lineWidth = this.size;
                ctx.stroke();
                break;

            case 'blob':
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
                ctx.fill();
                break;

            case 'bodyPart':
                ctx.translate(this.x, this.y);
                ctx.rotate(this.rotation);
                this.drawBodyPart(ctx);
                break;
        }

        ctx.restore();
    }

    drawBodyPart(ctx) {
        // Simple stick figure parts
        ctx.strokeStyle = 'black';
        ctx.fillStyle = 'black'
        ctx.lineWidth = 3;

        switch (this.partType) {
            case 0: // Head
                ctx.beginPath();
                ctx.arc(0, 0, 10, 0, Math.PI * 2); // Head size: 8 pixel radius
                ctx.fill();
                break;
            case 1: // Torso
                ctx.beginPath();
                ctx.moveTo(0, -15);
                ctx.lineTo(0, 15); // Torso length: 30 pixels
                ctx.stroke();
                break;
            case 2: // Left arm
            case 3: // Right arm
                ctx.beginPath();
                ctx.moveTo(-12, 0);
                ctx.lineTo(12, 0); // Arm length: 24 pixels
                ctx.stroke();
                break;
            case 4: // Left leg
            case 5: // Right leg
                ctx.beginPath();
                ctx.moveTo(0, -12);
                ctx.lineTo(0, 12); // Leg length: 24 pixels
                ctx.stroke();
                break;
        }
    }
}

// One piece of the stickman (a limb, the torso or the head, as Stickman.segments gives them) thrown out from where
// the player died: it keeps its shape and spins, falls under gravity and fades. Time-based, unlike the splatter
// above, so it moves the same at any frame rate.
class DeathLimb {
    constructor(segment, originX, originY) {
        const pts = segment.points;
        this.x = pts.reduce((s, p) => s + p.x, 0) / pts.length;
        this.y = pts.reduce((s, p) => s + p.y, 0) / pts.length;
        // The piece's shape around its own centre, so it can spin about it
        this.segment = Object.assign({}, segment, {points: pts.map(p => ({x: p.x - this.x, y: p.y - this.y}))});

        // Outward from the body's centre, plus a kick upwards; the head flies highest
        let dx = this.x - originX, dy = this.y - originY;
        const len = Math.hypot(dx, dy) || 1;
        dx /= len; dy /= len;
        const speed = 220 + Math.random() * 160;
        this.vx = dx * speed + (Math.random() - 0.5) * 80;
        this.vy = dy * speed - (segment.part === 'head' ? 420 : 280) - Math.random() * 120;
        this.rotation = 0;
        this.spin = (Math.random() < 0.5 ? -1 : 1) * (6 + Math.random() * 8);
        this.age = 0;
        this.alpha = 1;
    }

    update(deltaTime) {
        this.age += deltaTime;
        this.vy += DeathLimb.GRAVITY * deltaTime;
        this.x += this.vx * deltaTime;
        this.y += this.vy * deltaTime;
        this.rotation += this.spin * deltaTime;
        // Fully visible for a moment so the pieces read as the figure, then fading
        this.alpha = Math.max(0, 1 - Math.max(0, this.age - 0.2) / 0.7);
        return this.alpha > 0.01;
    }

    draw(ctx) {
        ctx.save();
        ctx.globalAlpha = this.alpha;
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rotation);
        Stickman.drawSegment(ctx, this.segment);
        ctx.restore();
    }
}
DeathLimb.GRAVITY = 1600;

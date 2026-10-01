class DeathAnimation {
    // segments: the stickman's pieces where it died (Stickman.segments); without them it throws generic parts
    constructor(x, y, segments = null) {
        this.x = x;
        this.y = y;
        this.segments = segments;
        this.particles = [];
        this.finished = false;
        this.duration = 0.5; // seconds
        this.elapsed = 0;
        this.initialized = false;
    }

    initialize() {
        // Create particles in a circular pattern
        const numLines = 20;
        const numBlobs = 15;
        const numBodyParts = 6;

        // Add blood lines
        for (let i = 0; i < numLines; i++) {
            const angle = (i / numLines) * Math.PI * 2;
            this.particles.push(new DeathParticle(
                this.x,
                this.y,
                'line',
                angle,
                Math.random() * 300 + 400
            ));
        }

        // Add blood blobs
        for (let i = 0; i < numBlobs; i++) {
            const angle = Math.random() * Math.PI * 2;
            this.particles.push(new DeathParticle(
                this.x,
                this.y,
                'blob',
                angle,
                Math.random() * 200 + 300
            ));
        }

        // The figure itself comes apart: each limb, the torso and the head fly off from the pose it died in
        if (this.segments) {
            for (const segment of this.segments) this.particles.push(new DeathLimb(segment, this.x, this.y));
            this.initialized = true;
            return;
        }

        // Add body parts
        for (let i = 0; i < numBodyParts; i++) {
            const angle = Math.random() * Math.PI * 2;
            this.particles.push(new DeathParticle(
                this.x,
                this.y,
                'bodyPart',
                angle,
                Math.random() * 150 + 250
            ));
        }

        this.initialized = true;
    }

    // pieceDelta: real seconds for the stickman's pieces. The game's clock stops when the player dies (kill() stops
    // the floor timer, which is also the frame clock), so deltaTime is 0 during the effect: the splatter only fades,
    // frame by frame, as it always has, while the pieces need real time to fly.
    update(deltaTime, pieceDelta = deltaTime) {
        if (!this.initialized) {
            this.initialize();
        }

        this.elapsed += deltaTime;
        if (this.elapsed >= this.duration) {
            this.finished = true;
        }

        // Update all particles and remove dead ones. The splatter freezes at the end of the duration as it always
        // has; the stickman's pieces keep flying behind the death screen until they have faded out.
        this.particles = this.particles.filter(particle => particle instanceof DeathLimb ? particle.update(pieceDelta)
            : this.finished ? true : particle.update(deltaTime));
    }

    draw(ctx) {
        if (!this.initialized) return;

        // Draw all particles
        this.particles.forEach(particle => particle.draw(ctx));
    }
}
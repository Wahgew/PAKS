/**
 * Hint: a sign with instructions, drawn in the level. The tutorial is made of these. It has no effect on play: it
 * is never solid, never hurts and the player does not interact with it.
 *
 * `text` wraps inside the w x h box. A word in square brackets, like [Shift] or [A], is drawn as a key cap.
 * The sign brightens while the player is close, so the one you are standing at reads best.
 *
 *   { "type": "Hint", "x": 100, "y": 200, "w": 300, "h": 90, "text": "Hold [Shift] to sprint" }
 */
class Hint {
    static LINE_HEIGHT = 30;
    static PADDING = 14;
    static DIM = 0.8;          // opacity of a sign the player is not near: still easy to read on a light background
    static KEY_PAD = 7;        // extra width either side of a key cap's label
    // monospace on purpose: every glyph has the same width, so a sign lays out the same on every machine and the
    // tests can check that its text fits without a canvas
    static FONT = 'bold 22px monospace';

    /**
     * Breaks `text` into lines that fit `maxWidth`. `measure(str)` is the width of a string in Hint.FONT. Returns
     * lines of parts {text, key, x, w}; x is measured from the start of the line. A single part wider than
     * `maxWidth` gets a line to itself rather than being cut.
     */
    static layout(text, measure, maxWidth) {
        const space = measure(' ');
        const lines = [];
        let line = [], x = 0, pendingSpace = false;
        const tokens = /(\s+)|(\[[^\]]+\])|([^\s\[]+)/g;
        for (let m; (m = tokens.exec(String(text))) !== null;) {
            if (m[1]) { pendingSpace = true; continue; }
            const key = m[2] !== undefined;
            const label = key ? m[2].slice(1, -1) : m[3];
            const w = key ? measure(label) + Hint.KEY_PAD * 2 : measure(label);
            const gap = line.length > 0 && pendingSpace ? space : 0;
            if (line.length > 0 && x + gap + w > maxWidth) {
                lines.push(line);
                line = [];
                x = 0;
            } else {
                x += gap;
            }
            line.push({text: label, key, x, w});
            x += w;
            pendingSpace = false;
        }
        if (line.length > 0) lines.push(line);
        return lines;
    }

    constructor({gameEngine, x, y, w, h, text}) {
        this.game = gameEngine;
        Object.assign(this, {x, y, w, h, text: text ?? ''});
        this.width = w;
        this.height = h;
        this.BB = new BoundingBox(x, y, w, h);
        this.glow = Hint.DIM;       // how bright the sign is drawn: Hint.DIM (player far away) to 1 (player near)
        this.laidOut = null;        // {w, text, lines}: the wrapped text, kept until the box or the text changes
    }

    update() {
        const p = this.game.Player;
        const reach = 90;
        const near = p && p.x + p.width > this.x - reach && p.x < this.x + this.w + reach &&
            p.y + p.height > this.y - reach && p.y < this.y + this.h + reach;
        const target = near ? 1 : Hint.DIM;
        this.glow += (target - this.glow) * Math.min(1, 8 * (this.game.clockTick || 0));
    }

    draw(ctx) {
        const {x, y, w, h} = this;
        // The editor never update()s entities, and there every sign should read at full strength
        const editing = this.game.editor && this.game.editor.mode === 'edit';

        ctx.save();
        ctx.globalAlpha = editing ? 1 : this.glow;
        ctx.fillStyle = 'rgba(20, 20, 20, 0.88)';
        ctx.strokeStyle = '#ffcc00';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, 8);
        ctx.fill();
        ctx.stroke();

        ctx.font = Hint.FONT;
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        const inner = w - Hint.PADDING * 2;
        if (!this.laidOut || this.laidOut.w !== inner || this.laidOut.text !== this.text) {
            this.laidOut = {w: inner, text: this.text, lines: Hint.layout(this.text, s => ctx.measureText(s).width, inner)};
        }
        const lines = this.laidOut.lines;
        let cy = y + (h - lines.length * Hint.LINE_HEIGHT) / 2 + Hint.LINE_HEIGHT / 2;
        for (const line of lines) {
            const last = line[line.length - 1];
            const startX = x + (w - (last.x + last.w)) / 2;   // each line centred in the box
            for (const part of line) {
                const px = startX + part.x;
                if (part.key) {
                    ctx.fillStyle = '#ffcc00';
                    ctx.beginPath();
                    ctx.roundRect(px, cy - Hint.LINE_HEIGHT / 2 + 3, part.w, Hint.LINE_HEIGHT - 6, 5);
                    ctx.fill();
                    ctx.fillStyle = '#222';
                    ctx.fillText(part.text, px + Hint.KEY_PAD, cy + 1);
                } else {
                    ctx.fillStyle = '#fff';
                    ctx.fillText(part.text, px, cy + 1);
                }
            }
            cy += Hint.LINE_HEIGHT;
        }
        ctx.restore();

        if (this.game.options.debugging) {
            ctx.strokeStyle = 'red';
            ctx.strokeRect(x, y, w, h);
        }
    }
}

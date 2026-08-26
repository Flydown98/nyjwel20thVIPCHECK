const lifetime = 500;
export class SkillEffect {
    constructor(x, y) {
        this._size = 0;
        this._elapsed = 0;
        this.isDestroy = false;
        this.position = { x, y };
    }
    update(deltaTime) {
        this._elapsed += deltaTime;
        this._size = (this._elapsed / lifetime) * 10;
        if (this._elapsed > lifetime) {
            this.isDestroy = true;
        }
    }
    render(ctx, zoom, theme) {
        ctx.save();
        const rate = this._elapsed / lifetime;
        ctx.globalAlpha = 1 - rate * rate;
        ctx.strokeStyle = theme.skillColor;
        ctx.lineWidth = 1 / zoom;
        ctx.beginPath();
        ctx.arc(this.position.x, this.position.y, this._size, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }
}

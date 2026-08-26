export class FastForwader {
    constructor() {
        this.bound = {
            x: 0,
            y: 0,
            w: 0,
            h: 0,
        };
        this.isEnabled = false;
        this.icon = new Image();
        this.icon.src = new URL('../assets/images/ff.svg', import.meta.url).toString();
    }
    get speed() {
        return this.isEnabled ? 2 : 1;
    }
    update(_deltaTime) { }
    render(ctx, _params, width, height) {
        this.bound.w = width / 2;
        this.bound.h = height / 2;
        this.bound.x = this.bound.w / 2;
        this.bound.y = this.bound.h / 2;
        const centerX = this.bound.x + this.bound.w / 2;
        const centerY = this.bound.y + this.bound.h / 2;
        if (this.isEnabled) {
            ctx.save();
            ctx.strokeStyle = 'white';
            ctx.globalAlpha = 0.5;
            ctx.drawImage(this.icon, centerX - 100, centerY - 100, 200, 200);
            ctx.restore();
        }
    }
    getBoundingBox() {
        return this.bound;
    }
    onMouseDown(_e) {
        this.isEnabled = true;
    }
    onMouseUp(_e) {
        this.isEnabled = false;
    }
}

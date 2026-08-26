import { rad } from './utils/utils.js';
import { Vector } from './utils/Vector.js';
const lifetime = 3000;
export class Particle {
    constructor(x, y) {
        this._elapsed = 0;
        this.position = { x: 0, y: 0 };
        this.force = { x: 0, y: 0 };
        this.color = '';
        this.isDestroy = false;
        this.position.x = x;
        this.position.y = y;
        const force = Math.random() * 250;
        const ang = rad(90 * Math.random() - 180);
        const fx = Math.cos(ang) * force;
        const fy = Math.sin(ang) * force;
        this.color = `hsl(${Math.random() * 360} 50% 50%)`;
        this.force = { x: fx, y: fy };
    }
    update(deltaTime) {
        this._elapsed += deltaTime;
        const delta = Vector.mul(this.force, deltaTime / 100);
        this.position = Vector.add(this.position, delta);
        this.force.y += (10 * deltaTime) / 100;
        if (this._elapsed > lifetime) {
            this.isDestroy = true;
        }
    }
    render(ctx) {
        ctx.save();
        ctx.globalAlpha = 1 - (this._elapsed / lifetime) ** 2;
        ctx.fillStyle = this.color;
        ctx.fillRect(this.position.x, this.position.y, 20, 20);
        ctx.restore();
    }
}

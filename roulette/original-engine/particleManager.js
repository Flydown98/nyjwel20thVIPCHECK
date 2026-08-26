import { Particle } from './particle.js';
export class ParticleManager {
    constructor() {
        this._particles = [];
    }
    update(deltaTime) {
        this._particles.forEach((particle) => {
            particle.update(deltaTime);
        });
        this._particles = this._particles.filter((particle) => !particle.isDestroy);
    }
    render(ctx) {
        this._particles.forEach((particle) => particle.render(ctx));
    }
    shot(x, y) {
        for (let i = 0; i < 200; i++) {
            this._particles.push(new Particle(x, y));
        }
    }
}

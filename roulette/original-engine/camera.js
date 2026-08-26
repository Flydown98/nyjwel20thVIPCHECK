import { initialZoom, zoomThreshold } from './data/constants.js';
export class Camera {
    constructor() {
        this._position = { x: 0, y: 0 };
        this._targetPosition = { x: 0, y: 0 };
        this._zoom = 1;
        this._targetZoom = 1;
        this._locked = false;
        this._shouldFollowMarbles = false;
    }
    get zoom() {
        return this._zoom;
    }
    set zoom(v) {
        this._targetZoom = v;
    }
    get x() {
        return this._position.x;
    }
    set x(v) {
        this._targetPosition.x = v;
    }
    get y() {
        return this._position.y;
    }
    set y(v) {
        this._targetPosition.y = v;
    }
    get position() {
        return this._position;
    }
    setPosition(v, force = false) {
        if (force) {
            return (this._position = { x: v.x, y: v.y });
        }
        return (this._targetPosition = { x: v.x, y: v.y });
    }
    lock(v) {
        this._locked = v;
    }
    startFollowingMarbles() {
        this._shouldFollowMarbles = true;
    }
    initializePosition(center, zoom) {
        const x = center?.x ?? 12.95;
        const y = center?.y ?? 2;
        const z = zoom ?? 1;
        this._position = { x, y };
        this._targetPosition = { x, y };
        this._zoom = z;
        this._targetZoom = z;
        this._shouldFollowMarbles = false;
    }
    update({ marbles, stage, needToZoom, targetIndex, }) {
        // set target position
        if (!this._locked) {
            this._calcTargetPositionAndZoom(marbles, stage, needToZoom, targetIndex);
        }
        // interpolate position
        this._position.x = this._interpolation(this.x, this._targetPosition.x);
        this._position.y = this._interpolation(this.y, this._targetPosition.y);
        // interpolate zoom
        this._zoom = this._interpolation(this._zoom, this._targetZoom);
    }
    _calcTargetPositionAndZoom(marbles, stage, needToZoom, targetIndex) {
        if (!this._shouldFollowMarbles) {
            return;
        }
        if (marbles.length > 0) {
            const targetMarble = marbles[targetIndex] ? marbles[targetIndex] : marbles[0];
            this.setPosition(targetMarble.position);
            if (needToZoom) {
                const goalDist = Math.abs(stage.zoomY - this._position.y);
                this.zoom = Math.max(1, (1 - goalDist / zoomThreshold) * 4);
            }
            else {
                this.zoom = 1;
            }
        }
        else {
            this.zoom = 1;
        }
    }
    _interpolation(current, target) {
        const d = target - current;
        if (Math.abs(d) < 1 / initialZoom) {
            return target;
        }
        return current + d / 10;
    }
    renderScene(ctx, callback) {
        const zoomFactor = initialZoom * 2 * this._zoom;
        ctx.save();
        ctx.translate(-this.x * this._zoom, -this.y * this._zoom);
        ctx.scale(this.zoom, this.zoom);
        ctx.translate(ctx.canvas.width / zoomFactor, ctx.canvas.height / zoomFactor);
        callback(ctx);
        ctx.restore();
    }
}

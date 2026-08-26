var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { initialZoom } from './data/constants.js';
import { bound } from './utils/bound.decorator.js';
export class Minimap {
    constructor() {
        this.lastParams = null;
        this._onViewportChangeHandler = null;
        this.mousePosition = null;
        this.boundingBox = {
            x: 10,
            y: 10,
            w: 26 * 4,
            h: 0,
        };
    }
    getBoundingBox() {
        return this.boundingBox;
    }
    onViewportChange(callback) {
        this._onViewportChangeHandler = callback;
    }
    update() {
        // nothing to do
    }
    onMouseMove(e) {
        if (!e) {
            this.mousePosition = null;
            if (this._onViewportChangeHandler) {
                this._onViewportChangeHandler();
            }
            return;
        }
        if (!this.lastParams)
            return;
        this.mousePosition = {
            x: e.x,
            y: e.y,
        };
        if (this._onViewportChangeHandler) {
            this._onViewportChangeHandler({
                x: this.mousePosition.x / 4,
                y: this.mousePosition.y / 4,
            });
        }
    }
    render(ctx, params) {
        if (!ctx)
            return;
        const { stage } = params;
        if (!stage)
            return;
        this.boundingBox.h = stage.goalY * 4;
        this.lastParams = params;
        this.ctx = ctx;
        ctx.save();
        ctx.fillStyle = params.theme.minimapBackground;
        ctx.translate(10, 10);
        ctx.scale(4, 4);
        ctx.fillRect(0, 0, 26, stage.goalY);
        this.ctx.lineWidth = 3 / (params.camera.zoom + initialZoom);
        this.drawEntities(params.entities, params.theme);
        this.drawMarbles(params);
        this.drawViewport(params);
        ctx.restore();
        ctx.save();
        ctx.strokeStyle = 'green';
        ctx.lineWidth = 1;
        ctx.strokeRect(this.boundingBox.x, this.boundingBox.y, this.boundingBox.w, this.boundingBox.h);
        ctx.restore();
    }
    drawViewport(params) {
        this.ctx.save();
        const { camera, size } = params;
        const zoom = camera.zoom * initialZoom;
        const w = size.x / zoom;
        const h = size.y / zoom;
        this.ctx.strokeStyle = params.theme.minimapViewport;
        this.ctx.lineWidth = 1 / zoom;
        this.ctx.strokeRect(camera.x - w / 2, camera.y - h / 2, w, h);
        this.ctx.restore();
    }
    drawEntities(entities, theme) {
        this.ctx.save();
        entities.forEach((entity) => {
            this.ctx.save();
            this.ctx.fillStyle = entity.shape.color ?? theme.entity[entity.shape.type].fill;
            this.ctx.strokeStyle = entity.shape.color ?? theme.entity[entity.shape.type].outline;
            this.ctx.translate(entity.x, entity.y);
            this.ctx.rotate(entity.angle);
            this.ctx.save();
            const shape = entity.shape;
            switch (shape.type) {
                case 'box': {
                    const w = shape.width * 2;
                    const h = shape.height * 2;
                    this.ctx.rotate(shape.rotation);
                    this.ctx.fillRect(-w / 2, -h / 2, w, h);
                    break;
                }
                case 'circle':
                    this.ctx.beginPath();
                    this.ctx.arc(0, 0, shape.radius, 0, Math.PI * 2, false);
                    this.ctx.stroke();
                    break;
                case 'polyline':
                    if (shape.points.length > 0) {
                        this.ctx.beginPath();
                        this.ctx.moveTo(shape.points[0][0], shape.points[0][1]);
                        for (let i = 1; i < shape.points.length; i++) {
                            this.ctx.lineTo(shape.points[i][0], shape.points[i][1]);
                        }
                        this.ctx.stroke();
                    }
                    break;
            }
            this.ctx.restore();
            this.ctx.restore();
        });
        this.ctx.restore();
    }
    drawMarbles(params) {
        const { marbles } = params;
        const viewPort = {
            x: params.camera.x,
            y: params.camera.y,
            w: params.size.x,
            h: params.size.y,
            zoom: params.camera.zoom * initialZoom,
        };
        marbles.forEach((marble) => {
            marble.render(this.ctx, 1, false, true, undefined, viewPort, params.theme);
        });
    }
}
__decorate([
    bound
], Minimap.prototype, "onMouseMove", null);

import { Skills, STUCK_DELAY, Themes } from './data/constants.js';
import options from './options.js';
import { transformGuard } from './utils/transformGuard.js';
import { rad } from './utils/utils.js';
import { Vector } from './utils/Vector.js';
export class Marble {
    get position() {
        return this.physics.getMarblePosition(this.id) || { x: 0, y: 0, angle: 0 };
    }
    get x() {
        return this.position.x;
    }
    set x(v) {
        this.position.x = v;
    }
    get y() {
        return this.position.y;
    }
    set y(v) {
        this.position.y = v;
    }
    get angle() {
        return this.position.angle;
    }
    constructor(physics, order, max, name, weight = 1) {
        this.type = 'marble';
        this.name = '';
        this.size = 0.5;
        this.color = 'red';
        this.hue = 0;
        this.impact = 0;
        this.weight = 1;
        this.skill = Skills.None;
        this.isActive = false;
        this._skillRate = 0.0005;
        this._coolTime = 5000;
        this._maxCoolTime = 5000;
        this._stuckTime = 0;
        this.lastPosition = { x: 0, y: 0 };
        this.theme = Themes.dark;
        this.name = name || `M${order}`;
        this.weight = weight;
        this.physics = physics;
        this._maxCoolTime = 1000 + (1 - this.weight) * 4000;
        this._coolTime = this._maxCoolTime * Math.random();
        this._skillRate = 0.2 * this.weight;
        const maxLine = Math.ceil(max / 10);
        const line = Math.floor(order / 10);
        const lineDelta = -Math.max(0, Math.ceil(maxLine - 5));
        this.hue = (360 / max) * order;
        this.color = `hsl(${this.hue} 100% 70%)`;
        this.id = order;
        physics.createMarble(order, 10.25 + (order % 10) * 0.6, maxLine - line + lineDelta);
    }
    update(deltaTime) {
        if (this.isActive && Vector.lenSq(Vector.sub(this.lastPosition, this.position)) < 0.00001) {
            this._stuckTime += deltaTime;
            if (this._stuckTime > STUCK_DELAY) {
                this.physics.shakeMarble(this.id);
                this._stuckTime = 0;
            }
        }
        else {
            this._stuckTime = 0;
        }
        this.lastPosition = { x: this.position.x, y: this.position.y };
        this.skill = Skills.None;
        if (this.impact) {
            this.impact = Math.max(0, this.impact - deltaTime);
        }
        if (!this.isActive)
            return;
        if (options.useSkills) {
            this._updateSkillInformation(deltaTime);
        }
    }
    _updateSkillInformation(deltaTime) {
        if (this._coolTime > 0) {
            this._coolTime -= deltaTime;
        }
        if (this._coolTime <= 0) {
            this.skill = Math.random() < this._skillRate ? Skills.Impact : Skills.None;
            this._coolTime = this._maxCoolTime;
        }
    }
    render(ctx, zoom, outline, isMinimap = false, skin, viewPort, theme) {
        this.theme = theme;
        const viewPortHw = viewPort.w / viewPort.zoom / 2;
        const viewPortHh = viewPort.h / viewPort.zoom / 2;
        const viewPortLeft = viewPort.x - viewPortHw;
        const viewPortRight = viewPort.x + viewPortHw;
        const viewPortTop = viewPort.y - viewPortHh - this.size / 2;
        const viewPortBottom = viewPort.y + viewPortHh;
        if (!isMinimap &&
            (this.x < viewPortLeft || this.x > viewPortRight || this.y < viewPortTop || this.y > viewPortBottom)) {
            return;
        }
        const transform = ctx.getTransform();
        if (isMinimap) {
            this._renderMinimap(ctx);
        }
        else {
            this._renderNormal(ctx, zoom, outline, skin);
        }
        ctx.setTransform(transform);
    }
    _renderMinimap(ctx) {
        ctx.fillStyle = this.color;
        this._drawMarbleBody(ctx, true);
    }
    _drawMarbleBody(ctx, isMinimap) {
        ctx.beginPath();
        ctx.arc(this.x, this.y, isMinimap ? this.size : this.size / 2, 0, Math.PI * 2);
        ctx.fill();
    }
    _renderNormal(ctx, zoom, outline, skin) {
        const hs = this.size / 2;
        ctx.fillStyle = `hsl(${this.hue} 100% ${this.theme.marbleLightness + 25 * Math.min(1, this.impact / 500)}%`;
        // ctx.shadowColor = this.color;
        // ctx.shadowBlur = zoom / 2;
        if (skin) {
            transformGuard(ctx, () => {
                ctx.translate(this.x, this.y);
                ctx.rotate(this.angle);
                ctx.drawImage(skin, -hs, -hs, hs * 2, hs * 2);
            });
        }
        else {
            this._drawMarbleBody(ctx, false);
        }
        ctx.shadowColor = '';
        ctx.shadowBlur = 0;
        this._drawName(ctx, zoom);
        if (outline) {
            this._drawOutline(ctx, 2 / zoom);
        }
        if (options.useSkills) {
            this._renderCoolTime(ctx, zoom);
        }
    }
    _drawName(ctx, zoom) {
        transformGuard(ctx, () => {
            ctx.font = `12pt sans-serif`;
            ctx.strokeStyle = 'black';
            ctx.lineWidth = 2;
            ctx.fillStyle = this.color;
            ctx.shadowBlur = 0;
            ctx.translate(this.x, this.y + 0.25);
            ctx.scale(1 / zoom, 1 / zoom);
            ctx.strokeText(this.name, 0, 0);
            ctx.fillText(this.name, 0, 0);
        });
    }
    _drawOutline(ctx, lineWidth) {
        ctx.beginPath();
        ctx.strokeStyle = this.theme.marbleWinningBorder;
        ctx.lineWidth = lineWidth;
        ctx.arc(this.x, this.y, this.size / 2, 0, Math.PI * 2);
        ctx.stroke();
    }
    _renderCoolTime(ctx, zoom) {
        ctx.strokeStyle = this.theme.coolTimeIndicator;
        ctx.lineWidth = 1 / zoom;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size / 2 + 2 / zoom, rad(270), rad(270 + (360 * this._coolTime) / this._maxCoolTime));
        ctx.stroke();
    }
}

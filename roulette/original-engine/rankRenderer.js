var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { bound } from './utils/bound.decorator.js';
export class RankRenderer {
    constructor() {
        this._currentY = 0;
        this._targetY = 0;
        this.fontHeight = 16;
        this._userMoved = 0;
        this._currentWinner = -1;
        this.maxY = 0;
        this.winners = [];
        this.marbles = [];
        this.winnerRank = -1;
    }
    onWheel(e) {
        this._targetY += e.deltaY;
        if (this._targetY > this.maxY) {
            this._targetY = this.maxY;
        }
        this._userMoved = 2000;
    }
    onDblClick(e) {
        if (e) {
            if (navigator.clipboard) {
                const tsv = [];
                let rank = 0;
                tsv.push(...[...this.winners, ...this.marbles].map((m) => {
                    rank++;
                    return [rank.toString(), m.name, rank - 1 === this.winnerRank ? '☆' : ''].join('\t');
                }));
                tsv.unshift(['Rank', 'Name', 'Winner'].join('\t'));
                navigator.clipboard.writeText(tsv.join('\n')).then(() => {
                    if (this.messageHandler) {
                        this.messageHandler('The result has been copied');
                    }
                });
            }
        }
    }
    onMessage(func) {
        this.messageHandler = func;
    }
    render(ctx, { winners, marbles, winnerRank, theme }, width, height) {
        const startX = width - 5;
        const startY = Math.max(-this.fontHeight, this._currentY - height / 2);
        this.maxY = Math.max(0, (marbles.length + winners.length) * this.fontHeight + this.fontHeight);
        this._currentWinner = winners.length;
        this.winners = winners;
        this.marbles = marbles;
        this.winnerRank = winnerRank;
        ctx.save();
        ctx.textAlign = 'right';
        ctx.font = '10pt sans-serif';
        ctx.fillStyle = '#666';
        ctx.fillText(`${winners.length} / ${winners.length + marbles.length}`, width - 5, this.fontHeight);
        ctx.beginPath();
        ctx.rect(width - 150, this.fontHeight + 2, width, this.maxY);
        ctx.clip();
        ctx.translate(0, -startY);
        ctx.font = 'bold 11pt sans-serif';
        if (theme.rankStroke) {
            ctx.lineWidth = 2;
            ctx.strokeStyle = theme.rankStroke;
        }
        winners.forEach((marble, rank) => {
            const y = rank * this.fontHeight;
            if (y >= startY && y <= startY + ctx.canvas.height) {
                ctx.fillStyle = `hsl(${marble.hue} 100% ${theme.marbleLightness}`;
                ctx.strokeText(`${rank === winnerRank ? '☆' : '\u2714'} ${marble.name} #${rank + 1}`, startX, 20 + y);
                ctx.fillText(`${rank === winnerRank ? '☆' : '\u2714'} ${marble.name} #${rank + 1}`, startX, 20 + y);
            }
        });
        ctx.font = '10pt sans-serif';
        marbles.forEach((marble, rank) => {
            const y = (rank + winners.length) * this.fontHeight;
            if (y >= startY && y <= startY + ctx.canvas.height) {
                ctx.fillStyle = `hsl(${marble.hue} 100% ${theme.marbleLightness}`;
                ctx.strokeText(`${marble.name} #${rank + 1 + winners.length}`, startX, 20 + y);
                ctx.fillText(`${marble.name} #${rank + 1 + winners.length}`, startX, 20 + y);
            }
        });
        ctx.restore();
    }
    update(deltaTime) {
        if (this._currentWinner === -1) {
            return;
        }
        if (this._userMoved > 0) {
            this._userMoved -= deltaTime;
        }
        else {
            this._targetY = this._currentWinner * this.fontHeight + this.fontHeight;
        }
        if (this._currentY !== this._targetY) {
            this._currentY += (this._targetY - this._currentY) * (deltaTime / 250);
        }
        if (Math.abs(this._currentY - this._targetY) < 1) {
            this._currentY = this._targetY;
        }
    }
    getBoundingBox() {
        return null;
    }
}
__decorate([
    bound
], RankRenderer.prototype, "onWheel", null);
__decorate([
    bound
], RankRenderer.prototype, "onDblClick", null);

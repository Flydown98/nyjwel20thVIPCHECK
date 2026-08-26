import { drawAdOverlay } from './adRenderer.js';
import { canvasHeight, canvasWidth, initialZoom, Themes, winnerAreaHeight } from './data/constants.js';
import { KeywordService } from './keywordService.js';
const MAX_DISPLAY_WIDTH = 1920;
const WINNER_TEXT_OFFSET = 30;
function inRect(rect, x, y) {
    return !!rect && x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}
export class RouletteRenderer {
    constructor() {
        this.sizeFactor = 1;
        this._images = {};
        this._theme = Themes.dark;
        this._ad = null;
        this._adImageCache = new Map();
        this._adOverlay = null;
        this._keywordService = this.createKeywordService();
    }
    createKeywordService() {
        return new KeywordService();
    }
    get width() {
        return this._sceneCanvas.width;
    }
    get height() {
        return this._sceneCanvas.height;
    }
    get canvas() {
        return this._canvas;
    }
    set theme(value) {
        this._theme = value;
    }
    async init() {
        await Promise.all([this._load(), this._keywordService.init()]);
        this._canvas = document.createElement('canvas');
        this._canvas.width = canvasWidth;
        this._canvas.height = canvasHeight;
        this._displayCtx = this._canvas.getContext('2d', {
            alpha: false,
        });
        this._sceneCanvas = document.createElement('canvas');
        this._sceneCanvas.width = canvasWidth;
        this._sceneCanvas.height = canvasHeight;
        this.ctx = this._sceneCanvas.getContext('2d', {
            alpha: false,
        });
        document.body.appendChild(this._canvas);
        const resizing = (entries) => {
            const realSize = entries ? entries[0].contentRect : this._canvas.getBoundingClientRect();
            if (realSize.width <= 0 || realSize.height <= 0)
                return;
            const width = Math.max(realSize.width / 2, 640);
            const height = (width / realSize.width) * realSize.height;
            this._sceneCanvas.width = width;
            this._sceneCanvas.height = height;
            this.sizeFactor = width / realSize.width;
            const displayWidth = Math.min(realSize.width, MAX_DISPLAY_WIDTH);
            this._canvas.width = displayWidth;
            this._canvas.height = (displayWidth / realSize.width) * realSize.height;
        };
        const resizeObserver = new ResizeObserver(resizing);
        resizeObserver.observe(this._canvas);
        resizing();
    }
    async _loadImage(url) {
        return new Promise((rs) => {
            const img = new Image();
            img.addEventListener('load', () => {
                rs(img);
            });
            img.src = url;
        });
    }
    async _load() {
        const loadPromises = [
            { name: '챔루', imgUrl: new URL('../assets/images/chamru.png', import.meta.url) },
            { name: '쿠빈', imgUrl: new URL('../assets/images/kubin.png', import.meta.url) },
            { name: '꽉변', imgUrl: new URL('../assets/images/kkwak.png', import.meta.url) },
            { name: '꽉변호사', imgUrl: new URL('../assets/images/kkwak.png', import.meta.url) },
            { name: '꽉 변호사', imgUrl: new URL('../assets/images/kkwak.png', import.meta.url) },
            { name: '주누피', imgUrl: new URL('../assets/images/junyoop.png', import.meta.url) },
            { name: '왈도쿤', imgUrl: new URL('../assets/images/waldokun.png', import.meta.url) },
        ].map(({ name, imgUrl }) => {
            return (async () => {
                this._images[name] = await this._loadImage(imgUrl.toString());
            })();
        });
        loadPromises.push((async () => {
            await this._loadImage(new URL('../assets/images/ff.svg', import.meta.url).toString());
        })());
        await Promise.all(loadPromises);
    }
    getMarbleImage(name) {
        // Priority 1: Hardcoded images
        if (this._images[name]) {
            return this._images[name];
        }
        // Priority 2: Keyword sprites from API
        return this._keywordService.getSprite(name);
    }
    onBeforeEntities() { }
    onAfterScene() { }
    setAd(ad) {
        this._ad = ad;
        if (!ad)
            return;
        this.preloadAdImages([...Object.values(ad.creatives), ad.qrImage]);
    }
    /** 소재를 미리 받아둔다. 여기서 만든 엘리먼트를 나중에 그대로 그리므로 캐시 헤더와 무관하게 즉시 뜬다 */
    preloadAdImages(srcs) {
        for (const src of srcs) {
            if (src)
                this.cacheAdImage(src);
        }
    }
    adImage(src) {
        return src ? this._adImageCache.get(src) : undefined;
    }
    cacheAdImage(src) {
        const cached = this._adImageCache.get(src);
        if (cached)
            return cached;
        const el = new Image();
        el.crossOrigin = 'anonymous';
        el.src = src;
        this._adImageCache.set(src, el);
        return el;
    }
    showAdOverlay(mode) {
        if (!this._ad || !this._ad.slots?.includes(mode))
            return;
        this._adOverlay = { mode, ad: this._ad, since: performance.now(), endingSince: undefined };
    }
    getAdHitAt(x, y) {
        const overlay = this._adOverlay;
        if (!overlay || overlay.endingSince !== undefined)
            return null;
        if (inRect(overlay.closeRect, x, y))
            return { type: 'close' };
        const link = overlay.ad.linkUrl;
        if (link && inRect(overlay.clickRect, x, y))
            return { type: 'link', url: link };
        return null;
    }
    hideAdOverlay() {
        if (this._adOverlay && this._adOverlay.endingSince === undefined) {
            this._adOverlay.endingSince = performance.now();
        }
    }
    renderAdOverlay(renderParameters) {
        const overlay = this._adOverlay;
        if (!overlay)
            return;
        if (overlay.mode === 'result' && !renderParameters.winner) {
            this.hideAdOverlay();
        }
        const scale = this._canvas.width / this._sceneCanvas.width;
        try {
            this._displayCtx.save();
            this._displayCtx.scale(scale, scale);
            const alive = drawAdOverlay(this._displayCtx, this._sceneCanvas.width, this._sceneCanvas.height, overlay, {
                preroll: this.adImage(overlay.ad.creatives.preroll),
                result: this.adImage(overlay.ad.creatives.result),
                qr: this.adImage(overlay.ad.qrImage),
            });
            this._displayCtx.restore();
            if (!alive)
                this._adOverlay = null;
        }
        catch (e) {
            this._displayCtx.restore();
            console.error('[ads] 오버레이 렌더링 실패, 이번 노출은 건너뜁니다', e);
            this._adOverlay = null;
        }
    }
    renderAdBoards(stage) {
        const ad = this._ad;
        if (!ad || !ad.slots?.includes('goal') || !stage.adBoards?.length)
            return;
        const img = this.adImage(ad.creatives.goal);
        if (!img?.complete || img.naturalWidth === 0)
            return;
        try {
            this.ctx.save();
            for (const board of stage.adBoards) {
                const w = board.w ?? 4;
                const h = board.h ?? 1;
                const x = board.x - w / 2;
                const y = board.y - h / 2;
                this.ctx.drawImage(img, x, y, w, h);
            }
        }
        catch (e) {
            console.error('[ads] 광고판 렌더링 실패, 이번 게재는 건너뜁니다', e);
            this._ad = null;
        }
        finally {
            this.ctx.restore();
        }
    }
    render(renderParameters, uiObjects) {
        this._theme = renderParameters.theme;
        this.ctx.fillStyle = this._theme.background;
        this.ctx.fillRect(0, 0, this._sceneCanvas.width, this._sceneCanvas.height);
        this.ctx.save();
        this.ctx.scale(initialZoom, initialZoom);
        this.ctx.textAlign = 'left';
        this.ctx.textBaseline = 'top';
        this.ctx.font = '0.4pt sans-serif';
        this.ctx.lineWidth = 3 / (renderParameters.camera.zoom + initialZoom);
        renderParameters.camera.renderScene(this.ctx, () => {
            this.renderAdBoards(renderParameters.stage);
            this.onBeforeEntities();
            this.renderEntities(renderParameters.entities);
            this.renderEffects(renderParameters);
            this.renderMarbles(renderParameters);
        });
        this.ctx.restore();
        this.onAfterScene();
        uiObjects.forEach((obj) => obj.render(this.ctx, renderParameters, this._sceneCanvas.width, this._sceneCanvas.height));
        renderParameters.particleManager.render(this.ctx);
        this.renderWinner(renderParameters);
        this._displayCtx.drawImage(this._sceneCanvas, 0, 0, this._canvas.width, this._canvas.height);
        this.renderAdOverlay(renderParameters);
    }
    renderEntities(entities) {
        this.ctx.save();
        entities.forEach((entity) => {
            const transform = this.ctx.getTransform();
            this.ctx.translate(entity.x, entity.y);
            this.ctx.rotate(entity.angle);
            this.ctx.fillStyle = entity.shape.color ?? this._theme.entity[entity.shape.type].fill;
            this.ctx.strokeStyle = entity.shape.color ?? this._theme.entity[entity.shape.type].outline;
            this.ctx.shadowBlur = this._theme.entity[entity.shape.type].bloomRadius;
            this.ctx.shadowColor =
                entity.shape.bloomColor ?? entity.shape.color ?? this._theme.entity[entity.shape.type].bloom;
            const shape = entity.shape;
            switch (shape.type) {
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
                case 'box': {
                    const w = shape.width * 2;
                    const h = shape.height * 2;
                    this.ctx.rotate(shape.rotation);
                    this.ctx.fillRect(-w / 2, -h / 2, w, h);
                    this.ctx.strokeRect(-w / 2, -h / 2, w, h);
                    break;
                }
                case 'circle':
                    this.ctx.beginPath();
                    this.ctx.arc(0, 0, shape.radius, 0, Math.PI * 2, false);
                    this.ctx.stroke();
                    break;
            }
            this.ctx.setTransform(transform);
        });
        this.ctx.restore();
    }
    renderEffects({ effects, camera }) {
        effects.forEach((effect) => effect.render(this.ctx, camera.zoom * initialZoom, this._theme));
    }
    renderMarbles({ marbles, camera, winnerRank, winners, size }) {
        const winnerIndex = winnerRank - winners.length;
        const viewPort = { x: camera.x, y: camera.y, w: size.x, h: size.y, zoom: camera.zoom * initialZoom };
        marbles.forEach((marble, i) => {
            marble.render(this.ctx, camera.zoom * initialZoom, i === winnerIndex, false, this.getMarbleImage(marble.name), viewPort, this._theme);
        });
    }
    renderWinner({ winner, theme }) {
        if (!winner)
            return;
        this.ctx.save();
        this.ctx.fillStyle = theme.winnerBackground;
        this.ctx.fillRect(this._sceneCanvas.width / 2, this._sceneCanvas.height - winnerAreaHeight, this._sceneCanvas.width / 2, winnerAreaHeight);
        // Draw marble image or colored circle
        const marbleSize = 100;
        const marbleCenterX = this._sceneCanvas.width - marbleSize / 2 - 20;
        const marbleCenterY = this._sceneCanvas.height - winnerAreaHeight / 2;
        const marbleImage = this.getMarbleImage(winner.name);
        if (marbleImage) {
            this.ctx.drawImage(marbleImage, marbleCenterX - marbleSize / 2, marbleCenterY - marbleSize / 2, marbleSize, marbleSize);
        }
        else {
            this.ctx.beginPath();
            this.ctx.arc(marbleCenterX, marbleCenterY, marbleSize / 2, 0, Math.PI * 2);
            this.ctx.fillStyle = `hsl(${winner.hue} 100% ${theme.marbleLightness})`;
            this.ctx.fill();
        }
        this.ctx.fillStyle = theme.winnerText;
        this.ctx.strokeStyle = theme.winnerOutline;
        this.ctx.font = 'bold 48px sans-serif';
        this.ctx.textAlign = 'right';
        this.ctx.lineWidth = 4;
        const textRightX = marbleCenterX - marbleSize / 2 - 20;
        if (theme.winnerOutline) {
            this.ctx.strokeText('Winner', textRightX, this._sceneCanvas.height - 120 + WINNER_TEXT_OFFSET);
        }
        this.ctx.fillText('Winner', textRightX, this._sceneCanvas.height - 120 + WINNER_TEXT_OFFSET);
        this.ctx.font = 'bold 72px sans-serif';
        this.ctx.fillStyle = `hsl(${winner.hue} 100% ${theme.marbleLightness})`;
        if (theme.winnerOutline) {
            this.ctx.strokeText(winner.name, textRightX, this._sceneCanvas.height - 55 + WINNER_TEXT_OFFSET);
        }
        this.ctx.fillText(winner.name, textRightX, this._sceneCanvas.height - 55 + WINNER_TEXT_OFFSET);
        this.ctx.restore();
    }
}

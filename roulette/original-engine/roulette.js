var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { Camera } from './camera.js';
import { canvasHeight, canvasWidth, initialZoom, Skills, Themes, zoomThreshold } from './data/constants.js';
import { stages } from './data/maps.js';
import { FastForwader } from './fastForwader.js';
import { Marble } from './marble.js';
import { Minimap } from './minimap.js';
import options from './options.js';
import { ParticleManager } from './particleManager.js';
import { Box2dPhysics } from './physics-box2d.js';
import { RankRenderer } from './rankRenderer.js';
import { RouletteRenderer } from './rouletteRenderer.js';
import { SkillEffect } from './skillEffect.js';
import { bound } from './utils/bound.decorator.js';
import { parseName, shuffle } from './utils/utils.js';
import { VideoRecorder } from './utils/videoRecorder.js';
export class Roulette extends EventTarget {
    get isReady() {
        return this._isReady;
    }
    createRenderer() {
        return new RouletteRenderer();
    }
    createFastForwader() {
        return new FastForwader();
    }
    constructor() {
        super();
        this._marbles = [];
        this._lastTime = 0;
        this._elapsed = 0;
        this._updateInterval = 10;
        this._timeScale = 1;
        this._speed = 1;
        this._winners = [];
        this._particleManager = new ParticleManager();
        this._stage = null;
        this._camera = new Camera();
        this._effects = [];
        this._winnerRank = 0;
        this._totalMarbleCount = 0;
        this._goalDist = Infinity;
        this._isRunning = false;
        this._winner = null;
        this._uiObjects = [];
        this._autoRecording = false;
        this._isReady = false;
        this._theme = Themes.dark;
        this._renderer = this.createRenderer();
        this._renderer.init().then(() => {
            this._init().then(() => {
                this._isReady = true;
                this._update();
            });
        });
    }
    getZoom() {
        return initialZoom * this._camera.zoom;
    }
    addUiObject(obj) {
        this._uiObjects.push(obj);
        if (obj.onWheel) {
            this._renderer.canvas.addEventListener('wheel', obj.onWheel);
        }
        if (obj.onMessage) {
            obj.onMessage((msg) => {
                console.log('onMessage', msg);
                this.dispatchEvent(new CustomEvent('message', { detail: msg }));
            });
        }
    }
    _update() {
        if (!this._lastTime)
            this._lastTime = Date.now();
        const currentTime = Date.now();
        this._elapsed += (currentTime - this._lastTime) * this._speed * this.fastForwarder.speed;
        if (this._elapsed > 100) {
            this._elapsed %= 100;
        }
        this._lastTime = currentTime;
        const interval = (this._updateInterval / 1000) * this._timeScale;
        while (this._elapsed >= this._updateInterval) {
            this.physics.step(interval);
            this._updateMarbles(this._updateInterval);
            this._particleManager.update(this._updateInterval);
            this._updateEffects(this._updateInterval);
            this._elapsed -= this._updateInterval;
            this._uiObjects.forEach((obj) => obj.update(this._updateInterval));
        }
        if (this._marbles.length > 1) {
            this._marbles.sort((a, b) => b.y - a.y);
        }
        if (this._stage) {
            this._camera.update({
                marbles: this._marbles,
                stage: this._stage,
                needToZoom: this._goalDist < zoomThreshold,
                targetIndex: this._winners.length > 0 ? this._winnerRank - this._winners.length : 0,
            });
        }
        this._render();
        window.requestAnimationFrame(this._update);
    }
    _updateMarbles(deltaTime) {
        if (!this._stage)
            return;
        for (let i = 0; i < this._marbles.length; i++) {
            const marble = this._marbles[i];
            marble.update(deltaTime);
            if (marble.skill === Skills.Impact) {
                this._effects.push(new SkillEffect(marble.x, marble.y));
                this.physics.impact(marble.id);
            }
            if (marble.y > this._stage.goalY) {
                this._winners.push(marble);
                if (this._isRunning && this._winners.length === this._winnerRank + 1) {
                    this.dispatchEvent(new CustomEvent('goal', { detail: { winner: marble.name } }));
                    this._winner = marble;
                    this._isRunning = false;
                    this._particleManager.shot(this._renderer.width, this._renderer.height);
                    setTimeout(() => {
                        this._recorder.stop();
                    }, 1000);
                }
                else if (this._isRunning &&
                    this._winnerRank === this._winners.length &&
                    this._winnerRank === this._totalMarbleCount - 1) {
                    this.dispatchEvent(new CustomEvent('goal', {
                        detail: { winner: this._marbles[i + 1].name },
                    }));
                    this._winner = this._marbles[i + 1];
                    this._isRunning = false;
                    this._particleManager.shot(this._renderer.width, this._renderer.height);
                    setTimeout(() => {
                        this._recorder.stop();
                    }, 1000);
                }
                setTimeout(() => {
                    this.physics.removeMarble(marble.id);
                }, 500);
            }
        }
        const targetIndex = this._winnerRank - this._winners.length;
        const topY = this._marbles[targetIndex] ? this._marbles[targetIndex].y : 0;
        this._goalDist = Math.abs(this._stage.zoomY - topY);
        this._timeScale = this._calcTimeScale();
        this._marbles = this._marbles.filter((marble) => marble.y <= this._stage?.goalY);
    }
    _calcTimeScale() {
        if (!this._stage)
            return 1;
        const targetIndex = this._winnerRank - this._winners.length;
        if (this._winners.length < this._winnerRank + 1 && this._goalDist < zoomThreshold) {
            if (this._marbles[targetIndex].y > this._stage.zoomY - zoomThreshold * 1.2 &&
                (this._marbles[targetIndex - 1] || this._marbles[targetIndex + 1])) {
                return Math.max(0.2, this._goalDist / zoomThreshold);
            }
        }
        return 1;
    }
    _updateEffects(deltaTime) {
        this._effects.forEach((effect) => effect.update(deltaTime));
        this._effects = this._effects.filter((effect) => !effect.isDestroy);
    }
    _render() {
        if (!this._stage)
            return;
        const renderParams = {
            camera: this._camera,
            stage: this._stage,
            entities: this.physics.getEntities(),
            marbles: this._marbles,
            winners: this._winners,
            particleManager: this._particleManager,
            effects: this._effects,
            winnerRank: this._winnerRank,
            winner: this._winner,
            size: { x: this._renderer.width, y: this._renderer.height },
            theme: this._theme,
        };
        this._renderer.render(renderParams, this._uiObjects);
    }
    async _init() {
        this._recorder = new VideoRecorder(this._renderer.canvas);
        this.physics = new Box2dPhysics();
        await this.physics.init();
        this.addUiObject(new RankRenderer());
        this.attachEvent();
        const minimap = new Minimap();
        minimap.onViewportChange((pos) => {
            if (pos) {
                this._camera.setPosition(pos, false);
                this._camera.lock(true);
            }
            else {
                this._camera.lock(false);
            }
        });
        this.addUiObject(minimap);
        this.fastForwarder = this.createFastForwader();
        this.addUiObject(this.fastForwarder);
        this._stage = stages[0];
        this._loadMap();
    }
    mouseHandler(eventName, e) {
        const handlerName = `on${eventName}`;
        const sizeFactor = this._renderer.sizeFactor;
        const pos = { x: e.offsetX * sizeFactor, y: e.offsetY * sizeFactor };
        this._uiObjects.forEach((obj) => {
            if (!obj[handlerName])
                return;
            const bounds = obj.getBoundingBox();
            if (!bounds) {
                obj[handlerName]({ ...pos, button: e.button });
            }
            else if (bounds &&
                pos.x >= bounds.x &&
                pos.y >= bounds.y &&
                pos.x <= bounds.x + bounds.w &&
                pos.y <= bounds.y + bounds.h) {
                obj[handlerName]({ x: pos.x - bounds.x, y: pos.y - bounds.y, button: e.button });
            }
            else {
                obj[handlerName](undefined);
            }
        });
    }
    attachEvent() {
        const canvas = this._renderer.canvas;
        const onPointerRelease = (e) => {
            this.mouseHandler('MouseUp', e);
            window.removeEventListener('pointerup', onPointerRelease);
            window.removeEventListener('pointercancel', onPointerRelease);
        };
        canvas.addEventListener('pointerdown', (e) => {
            this.mouseHandler('MouseDown', e);
            window.addEventListener('pointerup', onPointerRelease);
            window.addEventListener('pointercancel', onPointerRelease);
        });
        ['MouseMove', 'DblClick'].forEach((ev) => {
            // @ts-expect-error
            canvas.addEventListener(ev.toLowerCase().replace('mouse', 'pointer'), this.mouseHandler.bind(this, ev));
        });
        canvas.addEventListener('contextmenu', (e) => {
            e.preventDefault();
        });
        canvas.addEventListener('click', (e) => {
            const hit = this.adHitAt(e);
            if (!hit)
                return;
            if (hit.type === 'close') {
                this.hideAdOverlay();
            }
            else {
                window.open(hit.url, '_blank', 'noopener');
            }
        });
        canvas.addEventListener('pointermove', (e) => {
            canvas.style.cursor = this.adHitAt(e) ? 'pointer' : '';
        });
    }
    _loadMap() {
        if (!this._stage) {
            throw new Error('No map has been selected');
        }
        this.physics.createStage(this._stage);
        this._camera.initializePosition();
    }
    clearMarbles() {
        this.physics.clearMarbles();
        this._winner = null;
        this._winners = [];
        this._marbles = [];
    }
    async startRecording() {
        if (!this._autoRecording)
            return;
        try {
            await this._recorder.start();
        }
        catch (e) {
            console.error('recording failed to start', e);
        }
    }
    start() {
        this._isRunning = true;
        this._winnerRank = options.winningRank;
        if (this._winnerRank >= this._marbles.length) {
            this._winnerRank = this._marbles.length - 1;
        }
        this._camera.startFollowingMarbles();
        if (this._autoRecording) {
            this._recorder.start().then(() => {
                this.physics.start();
                this._marbles.forEach((marble) => (marble.isActive = true));
            });
        }
        else {
            this.physics.start();
            this._marbles.forEach((marble) => (marble.isActive = true));
        }
    }
    setSpeed(value) {
        if (value <= 0) {
            throw new Error('Speed multiplier must larger than 0');
        }
        this._speed = value;
    }
    setAd(ad) {
        this._renderer.setAd(ad);
    }
    preloadAdImages(srcs) {
        this._renderer.preloadAdImages(srcs);
    }
    showAdOverlay(mode) {
        this._renderer.showAdOverlay(mode);
    }
    hideAdOverlay() {
        this._renderer.hideAdOverlay();
    }
    adHitAt(e) {
        const sizeFactor = this._renderer.sizeFactor;
        return this._renderer.getAdHitAt(e.offsetX * sizeFactor, e.offsetY * sizeFactor);
    }
    setTheme(themeName) {
        this._theme = Themes[themeName];
    }
    getSpeed() {
        return this._speed;
    }
    setWinningRank(rank) {
        this._winnerRank = rank;
    }
    setAutoRecording(value) {
        this._autoRecording = value;
    }
    setMarbles(names) {
        this.reset();
        const arr = names.slice();
        let maxWeight = -Infinity;
        let minWeight = Infinity;
        const members = arr
            .map((nameString) => {
            const result = parseName(nameString);
            if (!result)
                return null;
            const { name, weight, count } = result;
            if (weight > maxWeight)
                maxWeight = weight;
            if (weight < minWeight)
                minWeight = weight;
            return { name, weight, count };
        })
            .filter((member) => !!member);
        const gap = maxWeight - minWeight;
        let totalCount = 0;
        members.forEach((member) => {
            if (member) {
                member.weight = 0.1 + (gap ? (member.weight - minWeight) / gap : 0);
                totalCount += member.count;
            }
        });
        const orders = shuffle(Array(totalCount)
            .fill(0)
            .map((_, i) => i));
        members.forEach((member) => {
            if (member) {
                for (let j = 0; j < member.count; j++) {
                    const order = orders.pop() || 0;
                    this._marbles.push(new Marble(this.physics, order, totalCount, member.name, member.weight));
                }
            }
        });
        this._totalMarbleCount = totalCount;
        // 카메라를 구슬 생성 위치 중앙으로 이동 + 줌인
        if (totalCount > 0) {
            const cols = Math.min(totalCount, 10);
            const rows = Math.ceil(totalCount / 10);
            const lineDelta = -Math.max(0, Math.ceil(rows - 5));
            const centerX = 10.25 + (cols - 1) * 0.3;
            const centerY = (1 + rows) / 2 + lineDelta;
            const spawnWidth = Math.max((cols - 1) * 0.6, 1);
            const spawnHeight = Math.max(rows - 1, 1);
            const margin = 3;
            const viewW = canvasWidth / initialZoom;
            const viewH = canvasHeight / initialZoom;
            const zoom = Math.max(1.5, Math.min(Math.min(viewW / (spawnWidth + margin * 2), viewH / (spawnHeight + margin * 2)), 3));
            this._camera.initializePosition({ x: centerX, y: centerY }, zoom);
        }
    }
    _clearMap() {
        this.physics.clear();
        this._marbles = [];
    }
    reset() {
        this.clearMarbles();
        this._clearMap();
        this._loadMap();
        this._goalDist = Infinity;
    }
    getCount() {
        return this._marbles.length;
    }
    // 20주년 행사 연동용: 원본 물리 결과의 실제 도착 순서를 읽기만 합니다.
    getFinishedNames() {
        return this._winners.map((marble) => marble.name);
    }
    getMaps() {
        return stages.map((stage, index) => {
            return {
                index,
                title: stage.title,
            };
        });
    }
    getCurrentMap() {
        if (!this._stage)
            return null;
        return {
            index: stages.indexOf(this._stage),
            title: this._stage.title,
        };
    }
    setMap(index) {
        if (index < 0 || index > stages.length - 1) {
            throw new Error('Incorrect map number');
        }
        const names = this._marbles.map((marble) => marble.name);
        this._stage = stages[index];
        this.setMarbles(names);
        this._camera.initializePosition();
    }
}
__decorate([
    bound
], Roulette.prototype, "_update", null);
__decorate([
    bound
], Roulette.prototype, "mouseHandler", null);

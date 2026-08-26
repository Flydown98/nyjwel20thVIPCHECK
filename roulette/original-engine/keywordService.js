const DEFAULT_KEYWORDS_URL = 'https://marblerouletteshop.com/api/external/keywords.json';
const DEFAULT_SPRITE_BASE_URL = 'https://marblerouletteshop.com/api/external/sprites';
const REFRESH_INTERVAL = 60000; // 60 seconds
export class KeywordService {
    constructor() {
        this._keywordsData = null;
        this._spriteSheets = new Map();
        this._extractedSprites = new Map();
        this._intervalId = null;
        this._loadingSprites = new Map();
        this._lastGeneratedAt = null;
    }
    get _keywordsUrl() {
        return DEFAULT_KEYWORDS_URL;
    }
    get _spriteBaseUrl() {
        return DEFAULT_SPRITE_BASE_URL;
    }
    get _checkExpiry() {
        return true;
    }
    async init() {
        await this.fetchKeywords();
        this._startPeriodicRefresh();
    }
    destroy() {
        if (this._intervalId !== null) {
            clearInterval(this._intervalId);
            this._intervalId = null;
        }
    }
    _startPeriodicRefresh() {
        this._intervalId = window.setInterval(() => {
            if (document.visibilityState === 'visible') {
                this.fetchKeywords();
            }
        }, REFRESH_INTERVAL);
    }
    async fetchKeywords() {
        try {
            const response = await fetch(this._keywordsUrl);
            if (!response.ok) {
                console.warn(`[KeywordService] Failed to fetch keywords: ${response.status}`);
                return;
            }
            const newData = await response.json();
            console.log(`[KeywordService] Fetched ${Object.keys(newData.keywords ?? {}).length} keywords`);
            // Check if generated_at is newer than last load
            const isNewer = this._lastGeneratedAt === null || new Date(newData.generated_at) > new Date(this._lastGeneratedAt);
            if (isNewer) {
                // Clear sprite caches when data is updated
                this._spriteSheets.clear();
                this._extractedSprites.clear();
                this._loadingSprites.clear();
                console.log('[KeywordService] Data updated, clearing sprite caches');
            }
            this._keywordsData = newData;
            this._lastGeneratedAt = newData.generated_at;
            // Preload sprite sheets for all keywords
            const spriteIds = new Set();
            for (const entry of Object.values(this._keywordsData.keywords)) {
                spriteIds.add(entry.sprite);
            }
            await Promise.all([...spriteIds].map((id) => this._loadSpriteSheet(id)));
        }
        catch (error) {
            console.warn('[KeywordService] Error fetching keywords:', error);
        }
    }
    async _loadSpriteSheet(spriteId) {
        if (this._spriteSheets.has(spriteId)) {
            return this._spriteSheets.get(spriteId);
        }
        // Check if already loading
        if (this._loadingSprites.has(spriteId)) {
            return this._loadingSprites.get(spriteId);
        }
        const loadPromise = new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                this._spriteSheets.set(spriteId, img);
                console.log(`[KeywordService] Loaded sprite sheet ${spriteId}`);
                resolve(img);
            };
            img.onerror = () => {
                console.warn(`[KeywordService] Failed to load sprite sheet ${spriteId}`);
                resolve(null);
            };
            img.src = `${this._spriteBaseUrl}/${spriteId}.png?generated_at=${encodeURIComponent(this._lastGeneratedAt ?? '')}`;
        });
        this._loadingSprites.set(spriteId, loadPromise);
        const result = await loadPromise;
        this._loadingSprites.delete(spriteId);
        return result;
    }
    _extractSprite(spriteSheet, x, y, width, height) {
        const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(width, height) : document.createElement('canvas');
        if (!(canvas instanceof OffscreenCanvas)) {
            canvas.width = width;
            canvas.height = height;
        }
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.drawImage(spriteSheet, x, y, width, height, 0, 0, width, height);
        }
        return canvas;
    }
    getSprite(marbleName) {
        if (!this._keywordsData) {
            return undefined;
        }
        const entry = this._keywordsData.keywords[marbleName];
        if (!entry) {
            return undefined;
        }
        // Check expiration
        if (this._checkExpiry && new Date(entry.expires_at) < new Date()) {
            return undefined;
        }
        // Check cache first
        const cacheKey = `${entry.sprite}_${entry.x}_${entry.y}_${entry.width}_${entry.height}`;
        if (this._extractedSprites.has(cacheKey)) {
            return this._extractedSprites.get(cacheKey);
        }
        // Get sprite sheet
        const spriteSheet = this._spriteSheets.get(entry.sprite);
        if (!spriteSheet) {
            return undefined;
        }
        // Extract and cache the sprite
        const sprite = this._extractSprite(spriteSheet, entry.x, entry.y, entry.width, entry.height);
        this._extractedSprites.set(cacheKey, sprite);
        return sprite;
    }
}

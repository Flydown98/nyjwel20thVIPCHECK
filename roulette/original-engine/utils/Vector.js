export class Vector {
    static sub(v1, v2) {
        return { x: v2.x - v1.x, y: v2.y - v1.y };
    }
    static lenSq(v) {
        return v.x * v.x + v.y * v.y;
    }
    static len(v) {
        return Math.sqrt(Vector.lenSq(v));
    }
    static mul(v, scalar) {
        return { x: v.x * scalar, y: v.y * scalar };
    }
    static add(v1, v2) {
        return { x: v1.x + v2.x, y: v1.y + v2.y };
    }
}

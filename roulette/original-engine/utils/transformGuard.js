export function transformGuard(ctx, func) {
    const originalTransform = ctx.getTransform();
    func(ctx);
    ctx.setTransform(originalTransform);
}

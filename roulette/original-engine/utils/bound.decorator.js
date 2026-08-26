export function bound(_target, propertyKey, descriptor) {
    return {
        configurable: true,
        get() {
            const boundMethod = descriptor.value?.bind(this);
            Object.defineProperty(this, propertyKey, {
                value: boundMethod,
                configurable: true,
                writable: true,
            });
            return boundMethod;
        },
    };
}

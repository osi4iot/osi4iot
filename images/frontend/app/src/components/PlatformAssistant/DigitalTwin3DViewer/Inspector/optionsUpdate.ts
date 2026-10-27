// Actualización de las opciones del visor desde el inspector.
//
// react-dat-gui devolvía en cada cambio una copia profunda de todas las opciones, así que cualquier efecto
// que dependiera de un objeto anidado (p. ej. opts.sensorsVisibilityState) se volvía a ejecutar con
// cualquier cambio. Se mantiene ese comportamiento para no alterar lo que ya funciona en el modelo 3D.

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && Object.getPrototypeOf(value) === Object.prototype;

export const clonePlain = <T>(value: T): T => {
    if (Array.isArray(value)) return value.map((item) => clonePlain(item)) as unknown as T;
    if (isPlainObject(value)) {
        const copy: Record<string, unknown> = {};
        for (const key of Object.keys(value)) copy[key] = clonePlain(value[key]);
        return copy as T;
    }
    return value;
};

// Devuelve una copia de `source` con `value` en la ruta indicada (crea los objetos intermedios que falten)
export const withOptionAt = <T extends object>(source: T, path: readonly string[], value: unknown): T => {
    if (path.length === 0) return source;
    const copy = clonePlain(source) as Record<string, any>;
    let target = copy;
    for (const key of path.slice(0, -1)) {
        if (!isPlainObject(target[key])) target[key] = {};
        target = target[key];
    }
    target[path[path.length - 1]] = value;
    return copy as T;
};

export const optionAt = (source: object, path: readonly string[]): unknown => {
    let value: any = source;
    for (const key of path) {
        if (value === null || value === undefined) return undefined;
        value = value[key];
    }
    return value;
};

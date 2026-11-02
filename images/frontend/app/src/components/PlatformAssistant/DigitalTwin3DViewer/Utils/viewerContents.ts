// What the 3D viewer of the digital twin holds, sent with each chat question so that the AI agent changes it
// with the right names: the viewer options (uiOpts) take the collections by their exact name ("Sea", not
// "sea"). And, if the agent still writes a name with other capitals or spaces, the viewer takes the
// collection it means (resolveCollectionKeys).

export interface SimulatorField {
    field: string;
    label: string;
    units: string;
    min: number;
    max: number;
    value: number | null;
}

export interface ViewerContents {
    sensors: string[];
    assets: string[];
    animatedObjects: string[];
    genericObjects: string[];
    femSimulationObjects: string[];
    femResults: string[];
    // inputs of the digital twin simulator (digitalTwinSimulatorState), with their range and current value
    simulator: SimulatorField[];
}

interface SimulatorFormat {
    label?: string;
    units?: string;
    minValue?: number;
    maxValue?: number;
}

const MAX_NAMES = 80;
const names = (list: readonly unknown[] | undefined) =>
    Array.from(new Set((list ?? []).filter((n): n is string => typeof n === "string" && n.trim() !== ""))).slice(
        0,
        MAX_NAMES,
    );

export const viewerContents = (source: {
    sensorCollectionNames?: readonly string[];
    assetCollectionNames?: readonly string[];
    animatedObjectNames?: readonly string[];
    genericObjectCollectionNames?: readonly string[];
    femSimObjectCollectionNames?: readonly string[];
    femResultNames?: readonly string[];
    simulationFormat?: Record<string, SimulatorFormat>;
    simulatorState?: Record<string, number>;
}): ViewerContents => ({
    sensors: names(source.sensorCollectionNames),
    assets: names(source.assetCollectionNames),
    animatedObjects: names(source.animatedObjectNames),
    genericObjects: names(source.genericObjectCollectionNames),
    femSimulationObjects: names(source.femSimObjectCollectionNames),
    femResults: names(source.femResultNames),
    simulator: Object.entries(source.simulationFormat ?? {})
        .slice(0, MAX_NAMES)
        .map(([field, format]) => ({
            field,
            label: format?.label ?? field,
            units: format?.units ?? "",
            min: Number(format?.minValue),
            max: Number(format?.maxValue),
            value: typeof source.simulatorState?.[field] === "number" ? source.simulatorState[field] : null,
        })),
});

const compact = (name: string) => name.toLowerCase().replace(/[\s_-]+/g, "");

// The inputs of the simulator sent by the AI agent, as the viewer has them: a field written with other
// capitals, spaces or by its label ("wind speed", "Wind speed" for windSpeed) is renamed to the field, and
// each value is kept within the field's range. Unknown fields and values that are not numbers are left out.
export const resolveSimulatorValues = (
    updates: Record<string, unknown>,
    format: Record<string, SimulatorFormat> | undefined,
): Record<string, number> => {
    const fields = Object.keys(format ?? {});
    const out: Record<string, number> = {};
    for (const [key, raw] of Object.entries(updates)) {
        const value = typeof raw === "string" ? Number(raw) : raw;
        if (typeof value !== "number" || !Number.isFinite(value)) continue;
        let field = fields.find((f) => f === key);
        if (!field) {
            const matches = fields.filter(
                (f) => compact(f) === compact(key) || compact(format?.[f]?.label ?? "") === compact(key),
            );
            if (matches.length === 1) field = matches[0];
        }
        if (!field) continue;
        const { minValue, maxValue } = format?.[field] ?? {};
        let v = value;
        if (typeof minValue === "number" && v < minValue) v = minValue;
        if (typeof maxValue === "number" && v > maxValue) v = maxValue;
        out[field] = v;
    }
    return out;
};

const normalize = (name: string) => name.trim().replace(/\s+/g, " ").toLowerCase();

// The keys of a per-collection map of uiOpts (sensorsVisibilityState...) written as the collections are
// named: a key that is not a collection but matches exactly one of them ignoring capitals and spaces is
// renamed to it. Other keys stay as they are.
export const resolveCollectionKeys = (
    updates: Record<string, unknown>,
    existing: Record<string, unknown> | undefined,
): Record<string, unknown> => {
    if (!existing) return updates;
    const known = Object.keys(existing);
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(updates)) {
        if (key in existing) {
            out[key] = value;
            continue;
        }
        const matches = known.filter((name) => normalize(name) === normalize(key));
        out[matches.length === 1 ? matches[0] : key] = value;
    }
    return out;
};

export const isCollectionMapKey = (key: string) => key.endsWith("VisibilityState");


// Measurements of a sensor: the fields of the messages of its topic that the sensor measures, with their label and
// units. They build its Grafana dashboard (one column per field, or per item for an array), the series of the chart
// panels and the schema of its topic.
//
//   {
//     "temperature": { "type": "number", "label": "Temperature", "units": "°C" },
//     "accelerations": { "type": "array", "label": "Ax,Ay,Az", "units": "m/s^2" },
//     "battery.voltage": { "type": "number", "label": "Battery", "units": "V" },
//     "voltage": { "path": "/power/dc/voltage", "type": "number", "label": "DC voltage", "units": "V" },
//     "sensors.*.t": { "type": "array", "label": "T north,T south", "units": "°C" },
//     "door": { "type": "boolean", "label": "Door open", "units": "-" },
//     "mode": { "type": "string", "label": "Mode", "units": "-" }
//   }
//
// Where the value is in the message (its path):
//  - the key, with a dot between levels: "battery.voltage" is payload.battery.voltage, "sensors.0.temp" the field
//    temp of the first item of the array sensors;
//  - or "path", a JSON Pointer (RFC 6901), which then wins over the key (the key is only a name): "/power/dc/voltage".
// Types: "number"; "array", numbers whose labels (separated by commas) say how many there are: the items of the
// array at the path, or, with a "*" level, each item there ("sensors.*.t": sensors.0.t, sensors.1.t…); "boolean"
// (charts read it as 1 / 0); "string" (texts: not in the charts, which draw numbers).
// Arrays of objects must always have the same items in the same positions. The names of the message fields cannot
// contain dots ("v.1"): such a value can never be named.
//
// Sensors and sensor types used to keep them as a JSON schema (payloadJsonSchema / defaultPayloadJsonSchema):
//   { "type": "object", "properties": { "temperature": { "type": "number", "description": "Temperature", "units": "°C" } } }
// toMeasurements also accepts that format (asset files, clients and databases from older versions) and converts it,
// with its nested objects as dotted keys.
//
// The same rules are in admin_api (utils/measurements/measurements.ts) and in pipelines (agentdata/fields.go).

export type MeasurementType = "number" | "array" | "string" | "boolean";

export interface IMeasurement {
    type: MeasurementType;
    label: string;
    units: string;
    // JSON Pointer of the value in the message; without it, the key is the path (levels separated by dots)
    path?: string;
}

export type Measurements = Record<string, IMeasurement>;

// One value of a measurement: the measurement itself, or one item of an array
export interface MeasurementItem {
    key: string;
    index?: number;
    path: string[];
    label: string;
    units: string;
    type: "number" | "string" | "boolean";
}

export const MEASUREMENT_TYPES: MeasurementType[] = ["number", "array", "string", "boolean"];
export const MAX_MEASUREMENT_KEY_LENGTH = 100;
export const MAX_MEASUREMENT_PATH_LENGTH = 200;
export const MAX_MEASUREMENT_DEPTH = 10;
export const MAX_MEASUREMENT_INDEX = 63;
export const MAX_MEASUREMENT_SEGMENT_LENGTH = 64;
export const ANY_ITEM = "*";

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value);

// a level of a path: no dots, slashes, quotes, backslashes or control characters; "*" alone is every item
// eslint-disable-next-line no-control-regex
const SEGMENT_RE = /^[^./"'\\\u0000-\u001f\u007f]+$/;

const toMeasurement = (field: string, value: unknown): IMeasurement => {
    const item = isRecord(value) ? value : {};
    // "integer" (old JSON schemas) and anything unknown: a number
    const type: MeasurementType = MEASUREMENT_TYPES.includes(item.type as MeasurementType) ? (item.type as MeasurementType) : "number";
    const labelValue = item.label ?? item.description ?? item.title;
    const label = typeof labelValue === "string" && labelValue.trim() !== "" ? labelValue : field;
    const units = typeof item.units === "string" && item.units.trim() !== "" ? item.units : "-";
    const measurement: IMeasurement = { type, label, units };
    if (typeof item.path === "string" && item.path.trim() !== "") measurement.path = item.path.trim();
    return measurement;
};

// ¿JSON schema antiguo? { "type": "object", "properties": {...} }
export const isPayloadJsonSchema = (value: unknown): boolean =>
    isRecord(value) && value.type === "object" && isRecord(value.properties);

// the fields of a JSON schema, its nested objects as dotted keys
const schemaFields = (properties: Record<string, unknown>, prefix: string, out: Record<string, unknown>, depth = 0) => {
    for (const [name, item] of Object.entries(properties)) {
        const key = prefix ? `${prefix}.${name}` : name;
        if (isPayloadJsonSchema(item) && depth < MAX_MEASUREMENT_DEPTH) {
            schemaFields((item as Record<string, unknown>).properties as Record<string, unknown>, key, out, depth + 1);
        } else {
            out[key] = item;
        }
    }
};

// Measurements of a value in either format, as a JSON string or as an object ({} if it is empty or not valid).
export const toMeasurements = (value: unknown): Measurements => {
    let data = value;
    if (typeof data === "string") {
        try {
            data = JSON.parse(data);
        } catch {
            return {};
        }
        // algunos clientes lo enviaban codificado dos veces ("\"{}\"")
        if (typeof data === "string") return toMeasurements(data);
    }
    if (!isRecord(data)) return {};
    let fields: Record<string, unknown> = data;
    if (isPayloadJsonSchema(data)) {
        fields = {};
        schemaFields(data.properties as Record<string, unknown>, "", fields);
    }
    const measurements: Measurements = {};
    for (const [field, item] of Object.entries(fields)) {
        measurements[field] = toMeasurement(field, item);
    }
    return measurements;
};

// The levels of a JSON Pointer ("/a/b~1c" -> ["a", "b/c"]); null if it is not one
export const parseJsonPointer = (pointer: string): string[] | null => {
    if (!pointer.startsWith("/")) return null;
    return pointer
        .slice(1)
        .split("/")
        .map((s) => s.replace(/~1/g, "/").replace(/~0/g, "~"));
};

// Where a measurement is in the message: its levels (one may be "*")
export const measurementPath = (key: string, measurement?: Partial<IMeasurement>): string[] => {
    if (measurement?.path) return parseJsonPointer(measurement.path) ?? [measurement.path];
    return key.split(".");
};

// What is wrong in the path of a measurement (null: nothing)
export const measurementPathProblem = (key: string, measurement: Partial<IMeasurement>): string | null => {
    if (key.length === 0 || key.length > MAX_MEASUREMENT_KEY_LENGTH) {
        return `The name of the field "${key.slice(0, 40)}" must have 1 to ${MAX_MEASUREMENT_KEY_LENGTH} characters`;
    }
    if (measurement.path !== undefined) {
        if (typeof measurement.path !== "string" || !measurement.path.startsWith("/")) {
            return `The path of "${key}" must be a JSON Pointer that starts with "/" (e.g. "/battery/voltage")`;
        }
        if (measurement.path.length > MAX_MEASUREMENT_PATH_LENGTH) {
            return `The path of "${key}" has more than ${MAX_MEASUREMENT_PATH_LENGTH} characters`;
        }
    }
    const where = measurement.path !== undefined ? `the path of "${key}"` : `"${key}"`;
    const segments = measurementPath(key, measurement);
    if (segments.length > MAX_MEASUREMENT_DEPTH) return `${where} has more than ${MAX_MEASUREMENT_DEPTH} levels`;
    let stars = 0;
    for (const s of segments) {
        if (s === ANY_ITEM) {
            stars++;
            continue;
        }
        if (s === "") return `${where} has an empty level (two dots, or a dot at an end)`;
        if (s.length > MAX_MEASUREMENT_SEGMENT_LENGTH) return `A level of ${where} has more than ${MAX_MEASUREMENT_SEGMENT_LENGTH} characters`;
        if (!SEGMENT_RE.test(s)) {
            return `A level of ${where} ("${s.slice(0, 20)}") has a character that is not allowed (dots, slashes, quotes, backslashes)`;
        }
        if (/^\d+$/.test(s) && Number(s) > MAX_MEASUREMENT_INDEX) return `The index ${s} of ${where} is greater than ${MAX_MEASUREMENT_INDEX}`;
    }
    if (stars > 1) return `${where} can have one "*" level only`;
    if (stars === 1 && measurement.type !== "array") return `${where} has a "*" level: its type must be "array"`;
    return null;
};

// The values of a measurement: itself, or each item of an array (its labels say how many)
export const measurementItems = (key: string, measurement: IMeasurement): MeasurementItem[] => {
    const path = measurementPath(key, measurement);
    if (measurement.type !== "array") {
        return [{ key, path, label: measurement.label, units: measurement.units, type: measurement.type }];
    }
    const labels = measurement.label.split(",").map((s) => s.trim());
    return labels.slice(0, MAX_MEASUREMENT_INDEX + 1).map((label, index) => ({
        key,
        index,
        path: pathOfItem(path, index),
        label: label || `${key}[${index}]`,
        units: measurement.units,
        type: "number",
    }));
};

// The path of an item of an array at a path: its "*" level is the item, else the item is one more level
const pathOfItem = (arrayPath: string[], index: number): string[] => {
    const star = arrayPath.indexOf(ANY_ITEM);
    return star >= 0 ? arrayPath.map((s, i) => (i === star ? String(index) : s)) : [...arrayPath, String(index)];
};

// The path of a value (a measurement, or one item of an array) of the message
export const itemPath = (key: string, measurement: IMeasurement | undefined, index?: number): string[] => {
    if (!measurement) {
        const dotted = key.split(".");
        return index === undefined ? dotted : [...dotted, String(index)];
    }
    const measured = measurementPath(key, measurement);
    if (index === undefined || measurement.type !== "array") return measured;
    return pathOfItem(measured, index);
};

// The value at a path of a message (undefined if there is none)
export const valueAtPath = (payload: unknown, path: string[]): unknown => {
    let value: unknown = payload;
    for (const s of path) {
        if (Array.isArray(value) && /^\d+$/.test(s)) value = value[Number(s)];
        else if (isRecord(value)) value = value[s];
        else return undefined;
    }
    return value;
};

// The path of what the measurements table of a sensor shows of a measurement: the value, or the whole array (up to
// its "*" level)
export const tablePath = (key: string, measurement: IMeasurement | undefined): string[] => {
    const path = itemPath(key, measurement);
    const star = path.indexOf(ANY_ITEM);
    return star >= 0 ? path.slice(0, Math.max(star, 1)) : path;
};

// A copy of a message with the value at a path (the objects and arrays on the way are created)
export const withValueAtPath = (payload: unknown, path: string[], value: unknown): unknown => {
    if (path.length === 0) return value;
    const [head, ...rest] = path;
    if (Array.isArray(payload) && /^\d+$/.test(head)) {
        const items: unknown[] = [...(payload as unknown[])];
        items[Number(head)] = withValueAtPath(items[Number(head)], rest, value);
        return items;
    }
    const base = isRecord(payload) ? payload : {};
    return { ...base, [head]: withValueAtPath(base[head], rest, value) };
};

// A copy of a message without the value at a path (found: whether it was there). The objects left empty on the way
// are removed too.
export const withoutValueAtPath = (payload: unknown, path: string[]): { payload: unknown; found: boolean } => {
    if (path.length === 0) return { payload: undefined, found: true };
    const [head, ...rest] = path;
    if (Array.isArray(payload) && /^\d+$/.test(head) && Number(head) < payload.length) {
        const items: unknown[] = [...(payload as unknown[])];
        const item = withoutValueAtPath(items[Number(head)], rest);
        if (!item.found) return { payload, found: false };
        items[Number(head)] = item.payload === undefined ? null : item.payload;
        return { payload: items, found: true };
    }
    if (!isRecord(payload) || !(head in payload)) return { payload, found: false };
    const child = withoutValueAtPath(payload[head], rest);
    if (!child.found) return { payload, found: false };
    const fields: Record<string, unknown> = { ...payload };
    if (child.payload === undefined || (isRecord(child.payload) && Object.keys(child.payload).length === 0)) delete fields[head];
    else fields[head] = child.payload;
    return { payload: fields, found: true };
};

// What is wrong in some measurements as they are sent to be saved (empty: nothing). The old JSON schema format is
// only converted.
export const measurementsProblems = (value: unknown): string[] => {
    let data = value;
    for (let i = 0; i < 2 && typeof data === "string"; i++) {
        if (data.trim() === "") return [];
        try {
            data = JSON.parse(data);
        } catch {
            return ["The measurements are not valid JSON"];
        }
    }
    if (data === undefined || data === null) return [];
    if (!isRecord(data)) return ['The measurements must be an object: { "<field>": { "type": "number", "label": "...", "units": "..." } }'];
    if (isPayloadJsonSchema(data)) return [];
    const problems: string[] = [];
    for (const [key, item] of Object.entries(data)) {
        if (!isRecord(item)) {
            problems.push(`"${key}" must be an object with type, label and units`);
            continue;
        }
        if (item.type !== undefined && !MEASUREMENT_TYPES.includes(item.type as MeasurementType)) {
            problems.push(`The type of "${key}" must be "number", "array", "string" or "boolean"`);
            continue;
        }
        if (item.path !== undefined && typeof item.path !== "string") {
            problems.push(`The path of "${key}" must be a text (a JSON Pointer such as "/battery/voltage")`);
            continue;
        }
        const problem = measurementPathProblem(key, toMeasurement(key, item));
        if (problem) problems.push(problem);
        if (item.type === "array") {
            const label = typeof item.label === "string" ? item.label : "";
            if (label.split(",").length > MAX_MEASUREMENT_INDEX + 1) {
                problems.push(`"${key}" has more than ${MAX_MEASUREMENT_INDEX + 1} items (labels)`);
            }
        }
    }
    return problems;
};

// text for the editor of the forms (converted to the current format)
export const measurementsText = (value: unknown): string => JSON.stringify(toMeasurements(value), null, 4);

// error of the text of the editor, or null if it is valid
export const measurementsTextError = (text: string | undefined): string | null => {
    try {
        JSON.parse(text ?? "");
    } catch {
        return "It is not valid JSON";
    }
    const problems = measurementsProblems(text ?? "");
    return problems.length > 0 ? problems.join("; ") : null;
};

// field of the messages shown in the measurements table of a sensor (its first measurement; "" if none)
export const measurementsPayloadKey = (value: unknown): string => Object.keys(toMeasurements(value))[0] ?? "";

// same, falling back to the default measurements of its sensor type when the sensor has none (as admin_api does)
export const sensorPayloadKey = (
    sensor: { measurements?: unknown; sensorTypeId?: number },
    sensorTypes: { id: number; defaultMeasurements?: unknown }[],
): string => {
    const own = measurementsPayloadKey(sensor.measurements);
    if (own !== "") return own;
    const sensorType = sensorTypes.find((type) => type.id === sensor.sensorTypeId);
    return measurementsPayloadKey(sensorType?.defaultMeasurements);
};

// the measurements of a sensor, or those of its sensor type when it has none (as admin_api does)
export const sensorMeasurements = (
    sensor: { measurements?: unknown; sensorTypeId?: number },
    sensorTypes: { id: number; defaultMeasurements?: unknown }[],
): Measurements => {
    const own = toMeasurements(sensor.measurements);
    if (Object.keys(own).length > 0) return own;
    return toMeasurements(sensorTypes.find((type) => type.id === sensor.sensorTypeId)?.defaultMeasurements);
};

// where the measurements table of a sensor finds its field in the messages
export const sensorPayloadPath = (
    sensor: { measurements?: unknown; sensorTypeId?: number },
    sensorTypes: { id: number; defaultMeasurements?: unknown }[],
): string[] => {
    const key = sensorPayloadKey(sensor, sensorTypes);
    return key === "" ? [] : tablePath(key, sensorMeasurements(sensor, sensorTypes)[key]);
};

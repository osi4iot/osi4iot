// The value of a message that an object of the 3D model shows (the custom properties of Blender: fieldName of a
// sensor, clipFieldName of an animation): as before, a field of the first level ("temperature"), or a nested one, with
// the same rules as the measurements of the sensors (tools/measurements.ts):
//   - dots between levels: "battery.voltage", "sensors.0.t";
//   - a JSON Pointer: "/power/dc/voltage";
//   - "*" for every item of an array: "sensors.*.t" gives the array [sensors.0.t, sensors.1.t, …].
// A boolean is 1 / 0 (as in the charts).
import { IMeasurement, Measurements, measurementPath, parseJsonPointer, valueAtPath } from "../../../../tools/measurements";

const ANY_ITEM = "*";
const MAX_ITEMS = 64;

const asNumber = (value: unknown): unknown => (typeof value === "boolean" ? (value ? 1 : 0) : value);

// the levels of a fieldName
export const objectFieldPath = (fieldName: string): string[] =>
    fieldName.startsWith("/") ? (parseJsonPointer(fieldName) ?? [fieldName]) : fieldName.split(".");

// the value of fieldName in a message (undefined if it is not there)
export const objectFieldValue = (payload: unknown, fieldName: string | undefined): unknown => {
    if (typeof fieldName !== "string" || fieldName === "" || payload === null || typeof payload !== "object") return undefined;
    // a field of the first level with that very name (also an old one with a dot): as before
    const own = (payload as Record<string, unknown>)[fieldName];
    if (own !== undefined) return asNumber(own);
    const path = objectFieldPath(fieldName);
    const star = path.indexOf(ANY_ITEM);
    if (star < 0) return asNumber(valueAtPath(payload, path));
    const items = valueAtPath(payload, path.slice(0, star));
    if (!Array.isArray(items)) return undefined;
    const rest = path.slice(star + 1);
    return items.slice(0, MAX_ITEMS).map((item) => {
        const value = asNumber(rest.length === 0 ? item : valueAtPath(item, rest));
        return typeof value === "number" ? value : null;
    });
};

// the measurement of the sensor that describes fieldName (its key, or one whose path is the same), for the label and
// units of the card of the sensor
export const objectFieldMeasurement = (measurements: Measurements | undefined, fieldName: string): IMeasurement | undefined => {
    if (!measurements || fieldName === "") return undefined;
    if (measurements[fieldName]) return measurements[fieldName];
    const wanted = objectFieldPath(fieldName).join("\u0000");
    for (const [key, m] of Object.entries(measurements)) {
        if (measurementPath(key, m).join("\u0000") === wanted) return m;
    }
    return undefined;
};

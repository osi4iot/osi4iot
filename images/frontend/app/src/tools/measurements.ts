// Measurements of a sensor: the fields of the messages of its topic that it measures, with their label and units
// (the same as admin_api, utils/measurements.ts). They build its Grafana dashboard.
//
//   {
//     "temperature": { "type": "number", "label": "Temperature", "units": "°C" },
//     "accelerations": { "type": "array", "label": "Ax,Ay,Az", "units": "m/s^2" }
//   }
//
// The key is the field of the message; for an array, label lists the label of each item separated by commas.
// Older versions kept them as a JSON schema (payloadJsonSchema / defaultPayloadJsonSchema):
//   { "type": "object", "properties": { "temperature": { "type": "number", "description": "Temperature", "units": "°C" } } }
// toMeasurements accepts both formats.

export type MeasurementType = "number" | "array";

export interface IMeasurement {
    type: MeasurementType;
    label: string;
    units: string;
}

export type Measurements = Record<string, IMeasurement>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value);

export const isPayloadJsonSchema = (value: unknown): boolean =>
    isRecord(value) && value.type === "object" && isRecord(value.properties);

const toMeasurement = (field: string, value: unknown): IMeasurement => {
    const item = isRecord(value) ? value : {};
    const type: MeasurementType = item.type === "array" ? "array" : "number";
    const labelValue = item.label ?? item.description;
    const label = typeof labelValue === "string" && labelValue.trim() !== "" ? labelValue : field;
    const units = typeof item.units === "string" && item.units.trim() !== "" ? item.units : "-";
    return { type, label, units };
};

// measurements of a value in either format, as a JSON string or an object ({} if empty or not valid)
export const toMeasurements = (value: unknown): Measurements => {
    let data = value;
    if (typeof data === "string") {
        try {
            data = JSON.parse(data);
        } catch {
            return {};
        }
        if (typeof data === "string") return toMeasurements(data);
    }
    if (!isRecord(data)) return {};
    const fields = isPayloadJsonSchema(data) ? (data.properties as Record<string, unknown>) : data;
    const measurements: Measurements = {};
    for (const [field, item] of Object.entries(fields)) {
        measurements[field] = toMeasurement(field, item);
    }
    return measurements;
};

// text for the editor of the forms (converted to the current format)
export const measurementsText = (value: unknown): string => JSON.stringify(toMeasurements(value), null, 4);

// error of the text of the editor, or null if it is valid
export const measurementsTextError = (text: string | undefined): string | null => {
    let data: unknown;
    try {
        data = JSON.parse(text ?? "");
    } catch {
        return "It is not valid JSON";
    }
    if (!isRecord(data)) return 'It must be an object: { "<field>": { "type": "number", "label": "...", "units": "..." } }';
    if (isPayloadJsonSchema(data)) return null;
    for (const [field, item] of Object.entries(data)) {
        if (!isRecord(item)) return `"${field}" must be an object with type, label and units`;
        if (item.type !== undefined && item.type !== "number" && item.type !== "array") {
            return `The type of "${field}" must be "number" or "array"`;
        }
    }
    return null;
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

// Measurements of a sensor: the fields of the messages of its topic that the sensor measures, with their label and
// units. They build its Grafana dashboard (one column per field, or per item for an array).
//
//   {
//     "temperature": { "type": "number", "label": "Temperature", "units": "°C" },
//     "accelerations": { "type": "array", "label": "Ax,Ay,Az", "units": "m/s^2" }
//   }
//
// The key is the field of the message. For an array, label lists the label of each item separated by commas.
//
// Sensors and sensor types used to keep them as a JSON schema (payloadJsonSchema / defaultPayloadJsonSchema):
//   { "type": "object", "properties": { "temperature": { "type": "number", "description": "Temperature", "units": "°C" } } }
// toMeasurements also accepts that format (asset files, clients and databases from older versions) and converts it.

export type MeasurementType = "number" | "array";

export interface IMeasurement {
	type: MeasurementType;
	label: string;
	units: string;
}

export type Measurements = Record<string, IMeasurement>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const toMeasurement = (field: string, value: unknown): IMeasurement => {
	const item = isRecord(value) ? value : {};
	const type: MeasurementType = item.type === "array" ? "array" : "number";
	const labelValue = item.label ?? item.description;
	const label = typeof labelValue === "string" && labelValue.trim() !== "" ? labelValue : field;
	const units = typeof item.units === "string" && item.units.trim() !== "" ? item.units : "-";
	return { type, label, units };
};

// ¿JSON schema antiguo? { "type": "object", "properties": {...} }
export const isPayloadJsonSchema = (value: unknown): boolean =>
	isRecord(value) && value.type === "object" && isRecord(value.properties);

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
	const fields = isPayloadJsonSchema(data) ? (data.properties as Record<string, unknown>) : data;
	const measurements: Measurements = {};
	for (const [field, item] of Object.entries(fields)) {
		measurements[field] = toMeasurement(field, item);
	}
	return measurements;
};

export const measurementsString = (value: unknown): string => JSON.stringify(toMeasurements(value));

export const hasMeasurements = (value: unknown): boolean => Object.keys(toMeasurements(value)).length !== 0;

// Measurements of a sensor sent with the field of older versions (payloadJsonSchema) or the current one
// (measurements), as a JSON string. The old field is removed.
export const sensorMeasurementsString = (data: { measurements?: unknown; payloadJsonSchema?: unknown }): string => {
	const value = data.measurements ?? data.payloadJsonSchema;
	delete data.payloadJsonSchema;
	return measurementsString(value);
};

// Same for a sensor type (defaultMeasurements / defaultPayloadJsonSchema).
export const sensorTypeMeasurementsString = (data: {
	defaultMeasurements?: unknown;
	defaultPayloadJsonSchema?: unknown;
}): string => {
	const value = data.defaultMeasurements ?? data.defaultPayloadJsonSchema;
	delete data.defaultPayloadJsonSchema;
	return measurementsString(value);
};

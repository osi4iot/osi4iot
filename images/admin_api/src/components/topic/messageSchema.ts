// Message schema of a topic: JSON schema (2020-12) of the messages published on it. Each change of the schema is a
// new version (message_schema_version); grafanadb.topic_message_schema keeps all of them (see
// initialization/topicMessageSchema.ts).
//
// Where the schema comes from depends on the type of the topic:
//  - "sensors" (dev2pdb, dev2pdb_wt, dev2pdb_ma, dev2sim): the measurements of its sensors (for dev2sim, the sensors
//    of its digital twin). dev2pdb_wt also carries "timestamp"; dev2pdb_ma messages are arrays of them.
//  - "simulation" (sim2dtm, dtm2sim): the simulation format of its digital twin.
//  - "fixed" (sim2llm, llm2sim, dtmlog, sim2state, state2sim): set by the platform.
//  - "user" (dev2dtm, dtm2dev, dtm2pdb, inject_N and any other): written by the user.
// Only the "user" ones are edited; the others are computed here again whenever what they depend on changes (sensors,
// sensor types, digital twins) and on every start of admin_api.
import pool from "../../config/dbconfig";
import { logger } from "../../config/winston";
import { toMeasurements, Measurements } from "../../utils/measurements/measurements";

export type MessageSchemaSource = "sensors" | "simulation" | "fixed" | "user";

export type JsonSchema = Record<string, unknown>;

const SENSOR_TOPIC_TYPES = ["dev2pdb", "dev2pdb_wt", "dev2pdb_ma", "dev2sim"];
const SIMULATION_TOPIC_TYPES = ["sim2dtm", "dtm2sim"];

export const messageSchemaSource = (topicType: string): MessageSchemaSource => {
	if (SENSOR_TOPIC_TYPES.includes(topicType)) return "sensors";
	if (SIMULATION_TOPIC_TYPES.includes(topicType)) return "simulation";
	if (topicType in FIXED_MESSAGE_SCHEMAS) return "fixed";
	return "user";
};

export const isMessageSchemaEditable = (topicType: string): boolean => messageSchemaSource(topicType) === "user";

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

// Schema written by the user (object or JSON string, also twice encoded as older clients did): {} if not valid
export const normalizeMessageSchema = (value: unknown): JsonSchema => {
	let data = value;
	for (let i = 0; i < 3 && typeof data === "string"; i++) {
		try {
			data = JSON.parse(data);
		} catch {
			return {};
		}
	}
	return isRecord(data) ? data : {};
};

// Error of a schema written by the user, or null if it is valid
export const messageSchemaError = (value: unknown): string | null => {
	let data = value;
	if (typeof data === "string") {
		try {
			data = JSON.parse(data);
		} catch {
			return "The message schema is not valid JSON";
		}
	}
	if (!isRecord(data)) return "The message schema must be a JSON object";
	if (data.type !== undefined && typeof data.type !== "string" && !Array.isArray(data.type)) {
		return 'The "type" of the message schema must be a string or an array of strings';
	}
	return null;
};

// ── Fixed schemas ──────────────────────────────────────────────────────────────────────────────────────────────────

const toolCallsSchema: JsonSchema = {
	type: "array",
	description: "MCP tools used to answer",
	items: { type: "object" },
};

const chatMessageSchema: JsonSchema = {
	type: "object",
	properties: {
		message: { type: "string" },
		userName: { type: "string" },
		sender: { type: "string", enum: ["user", "assistant"] },
		time: { type: "string" },
		mcpToolCalls: toolCallsSchema,
	},
	required: ["message", "sender"],
};

export const FIXED_MESSAGE_SCHEMAS: Record<string, JsonSchema> = {
	sim2llm: {
		type: "object",
		description: "Question of a user of the chat of the digital twin to its AI agent",
		properties: {
			userName: { type: "string", description: "User who asks" },
			message: { type: "string", description: "Question" },
		},
		required: ["userName", "message"],
		additionalProperties: false,
	},
	llm2sim: {
		type: "object",
		description:
			"Answer of the AI agent to the chat of the digital twin, or a spoken question transcribed in the pipeline (transcription)",
		properties: {
			messageType: { type: "string", description: "Type of answer (response, raw...)" },
			message: { type: "string", description: "Text shown in the chat" },
			uiOpts: {
				type: "object",
				description: "Options for the viewer (for example digitalTwinSimulatorState)",
			},
			mcpToolCalls: toolCallsSchema,
			eventTriggerTopicType: { type: "string", const: "llm2sim" },
			transcription: { type: "string", description: "Transcribed spoken question (shown as the user's)" },
			userName: { type: "string", description: "User who asked the transcribed question" },
		},
		required: ["message"],
	},
	dtmlog: {
		type: "object",
		description: "Log entry of the pipeline of the digital twin",
		properties: {
			level: { type: "string", enum: ["debug", "info", "error"] },
			component: { type: "string", enum: ["node", "pipeline", "digitalTwin"] },
			name: { type: "string", description: "Name of the node or pipeline" },
			uid: { type: "string", description: "Uid of the node or pipeline" },
			message: { type: "string" },
			description: { type: "string" },
			outputIndex: { type: "integer" },
			payload: { type: "object", description: "Payload of the message (debug)" },
			state: { type: "object", description: "State of the message (debug)" },
		},
		required: ["level", "component", "message"],
	},
	sim2state: {
		type: "object",
		description: "Query of the viewer to the pipeline of the digital twin",
		properties: {
			action: {
				type: "string",
				enum: ["queryPipelineStatus", "queryChatMessages", "queryRemoveChatMessages"],
			},
			userName: { type: "string", description: "User of the chat (chat queries)" },
		},
		required: ["action"],
	},
	state2sim: {
		description: "State of the pipeline of the digital twin sent to the viewer",
		oneOf: [
			{
				type: "object",
				title: "Pipeline status",
				properties: {
					pipelineStatus: { type: "string" },
					replicaIndexLeader: { type: "integer" },
				},
				required: ["pipelineStatus"],
			},
			{
				type: "object",
				title: "Chat messages of a user",
				properties: {
					chatMessages: { type: "array", items: chatMessageSchema },
				},
				required: ["chatMessages"],
			},
		],
	},
};

// ── Computed schemas ───────────────────────────────────────────────────────────────────────────────────────────────

const measurementSchema = (measurement: Measurements[string]): JsonSchema => {
	const base = { title: measurement.label, units: measurement.units };
	if (measurement.type === "array") {
		return { type: "array", ...base, items: { type: "number" } };
	}
	return { type: "number", ...base };
};

export const sensorsMessageSchema = (topicType: string, measurements: Measurements): JsonSchema => {
	const fields = Object.keys(measurements);
	if (fields.length === 0) return {};
	const properties: Record<string, JsonSchema> = {};
	for (const field of fields) properties[field] = measurementSchema(measurements[field]);
	const message: JsonSchema = {
		type: "object",
		description: "Measurements of the sensors of the topic",
		properties,
	};
	if (topicType === "dev2pdb_wt") {
		properties.timestamp = { type: "string", format: "date-time", description: "Time of the measurement" };
		message.required = ["timestamp"];
	}
	if (topicType === "dev2pdb_ma") {
		return {
			type: "array",
			description: "Several messages with measurements of the sensors of the topic",
			items: { ...message, description: undefined },
		};
	}
	return message;
};

interface ISimulationParameter {
	label?: string;
	units?: string;
	minValue?: number;
	maxValue?: number;
	defaultValue?: number;
	step?: number;
}

export const simulationMessageSchema = (topicType: string, simulationFormat: unknown): JsonSchema => {
	const format = normalizeMessageSchema(simulationFormat) as Record<string, ISimulationParameter>;
	const names = Object.keys(format);
	if (names.length === 0) return {};
	const properties: Record<string, JsonSchema> = {};
	for (const name of names) {
		const parameter = isRecord(format[name]) ? format[name] : {};
		const schema: JsonSchema = { type: "number" };
		if (typeof parameter.label === "string") schema.title = parameter.label;
		if (typeof parameter.units === "string") schema.units = parameter.units;
		if (typeof parameter.minValue === "number") schema.minimum = parameter.minValue;
		if (typeof parameter.maxValue === "number") schema.maximum = parameter.maxValue;
		if (typeof parameter.defaultValue === "number") schema.default = parameter.defaultValue;
		properties[name] = schema;
	}
	if (topicType === "sim2dtm") {
		return {
			type: "object",
			description: "Parameters of the simulator of the digital twin",
			properties,
			required: names,
			additionalProperties: false,
		};
	}
	return {
		type: "object",
		description: "Results of the digital twin model for the viewer (simulation parameters and other fields)",
		properties: {
			...properties,
			eventTriggerTopicType: {
				type: "string",
				description: "Type of the topic of the message that produced the results",
			},
		},
	};
};

// measurements of the sensors whose messages go through the topic (by sensor, the first one wins for a field)
const topicMeasurements = async (topicId: number, topicType: string): Promise<Measurements> => {
	const result = await pool.query(
		`SELECT grafanadb.sensor.measurements, grafanadb.sensor_type.default_measurements AS "defaultMeasurements"
		FROM grafanadb.sensor
		INNER JOIN grafanadb.sensor_type ON grafanadb.sensor_type.id = grafanadb.sensor.sensor_type_id
		WHERE grafanadb.sensor.topic_id = $1
		OR ($2 AND grafanadb.sensor.id IN (
			SELECT grafanadb.digital_twin_sensor.sensor_id FROM grafanadb.digital_twin_sensor
			INNER JOIN grafanadb.digital_twin_topic
				ON grafanadb.digital_twin_topic.digital_twin_id = grafanadb.digital_twin_sensor.digital_twin_id
			WHERE grafanadb.digital_twin_topic.topic_id = $1))
		ORDER BY grafanadb.sensor.id ASC`,
		[topicId, topicType === "dev2sim"]
	);
	const measurements: Measurements = {};
	for (const row of result.rows) {
		let sensorMeasurements = toMeasurements(row.measurements);
		if (Object.keys(sensorMeasurements).length === 0) sensorMeasurements = toMeasurements(row.defaultMeasurements);
		for (const [field, measurement] of Object.entries(sensorMeasurements)) {
			if (!(field in measurements)) measurements[field] = measurement;
		}
	}
	return measurements;
};

const topicSimulationFormat = async (topicId: number): Promise<unknown> => {
	const result = await pool.query<{ format: unknown }>(
		`SELECT grafanadb.digital_twin.digital_twin_simulation_format AS "format"
		FROM grafanadb.digital_twin
		INNER JOIN grafanadb.digital_twin_topic ON grafanadb.digital_twin_topic.digital_twin_id = grafanadb.digital_twin.id
		WHERE grafanadb.digital_twin_topic.topic_id = $1
		ORDER BY grafanadb.digital_twin.id ASC LIMIT 1`,
		[topicId]
	);
	return result.rows[0]?.format ?? {};
};

// Schema of a topic that is not written by the user (null for the "user" ones). topicId undefined: a topic not
// created yet (it has no sensors nor digital twin yet).
export const computeMessageSchema = async (topicType: string, topicId?: number): Promise<JsonSchema | null> => {
	const source = messageSchemaSource(topicType);
	if (source === "user") return null;
	if (source === "fixed") return FIXED_MESSAGE_SCHEMAS[topicType];
	if (topicId === undefined) return {};
	if (source === "sensors") return sensorsMessageSchema(topicType, await topicMeasurements(topicId, topicType));
	return simulationMessageSchema(topicType, await topicSimulationFormat(topicId));
};

// Schema to store for a topic: computed, or the one written by the user
export const messageSchemaToStore = async (
	topicType: string,
	userSchema: unknown,
	topicId?: number
): Promise<JsonSchema> => (await computeMessageSchema(topicType, topicId)) ?? normalizeMessageSchema(userSchema);

// Computes again the schema of these topics (only the ones that are not written by the user). A new version is
// stored only when the schema changes (trigger of grafanadb.topic).
export const refreshTopicsMessageSchema = async (topicIds: (number | null | undefined)[]): Promise<void> => {
	const ids = Array.from(new Set(topicIds.filter((id): id is number => typeof id === "number")));
	if (ids.length === 0) return;
	try {
		const topics = await pool.query(
			`SELECT id, topic_type AS "topicType" FROM grafanadb.topic WHERE id = ANY($1::bigint[])`,
			[ids]
		);
		for (const topic of topics.rows as { id: number; topicType: string }[]) {
			const schema = await computeMessageSchema(topic.topicType, topic.id);
			if (schema === null) continue;
			await pool.query(
				`UPDATE grafanadb.topic SET message_schema = $1::jsonb
				WHERE id = $2 AND message_schema IS DISTINCT FROM $1::jsonb`,
				[JSON.stringify(schema), topic.id]
			);
		}
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		logger.log("error", `The message schema of the topics %s could not be updated: %s`, ids.join(", "), message);
	}
};

// topics of the sensors with this property (sensor id, sensor type...)
export const topicIdsOfSensors = async (whereSql: string, params: unknown[]): Promise<number[]> => {
	const result = await pool.query(`SELECT DISTINCT topic_id AS "topicId" FROM grafanadb.sensor WHERE ${whereSql}`, params);
	return result.rows.map((row) => row.topicId as number);
};

// topics of a digital twin (dev2sim, sim2dtm, dtm2sim...)
export const topicIdsOfDigitalTwin = async (digitalTwinId: number): Promise<number[]> => {
	const result = await pool.query(
		`SELECT topic_id AS "topicId" FROM grafanadb.digital_twin_topic WHERE digital_twin_id = $1`,
		[digitalTwinId]
	);
	return result.rows.map((row) => row.topicId as number);
};

// all the topics whose schema is not written by the user (on every start of admin_api)
export const refreshAllComputedMessageSchemas = async (): Promise<void> => {
	try {
		const result = await pool.query(`SELECT id, topic_type AS "topicType" FROM grafanadb.topic`);
		const ids = (result.rows as { id: number; topicType: string }[])
			.filter((topic) => !isMessageSchemaEditable(topic.topicType))
			.map((topic) => topic.id);
		await refreshTopicsMessageSchema(ids);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		logger.log("error", `The message schemas of the topics could not be updated: %s`, message);
	}
};

export interface IMessageSchemaVersion {
	version: number;
	messageSchema: JsonSchema;
	validFrom: string;
	validTo: string | null;
	isCurrent: boolean;
}

export const getMessageSchemaVersions = async (topicId: number): Promise<IMessageSchemaVersion[]> => {
	const result = await pool.query(
		`SELECT version, message_schema AS "messageSchema", valid_from AS "validFrom", valid_to AS "validTo",
		is_current AS "isCurrent"
		FROM grafanadb.topic_message_schema WHERE topic_id = $1 ORDER BY version DESC`,
		[topicId]
	);
	return result.rows as IMessageSchemaVersion[];
};
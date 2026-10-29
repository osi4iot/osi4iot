// Message schema of a topic (the same rules as admin_api, components/topic/messageSchema.ts): JSON schema of the
// messages published on it, with a version that goes up each time it changes. Only the types written by the user
// are edited; the platform computes the others.

export type MessageSchemaSource = "sensors" | "simulation" | "fixed" | "user";

const SENSOR_TOPIC_TYPES = ["dev2pdb", "dev2pdb_wt", "dev2pdb_ma", "dev2sim"];
const SIMULATION_TOPIC_TYPES = ["sim2dtm", "dtm2sim"];
const FIXED_TOPIC_TYPES = ["sim2llm", "llm2sim", "dtmlog", "sim2state", "state2sim"];

export const messageSchemaSource = (topicType: string): MessageSchemaSource => {
    if (SENSOR_TOPIC_TYPES.includes(topicType)) return "sensors";
    if (SIMULATION_TOPIC_TYPES.includes(topicType)) return "simulation";
    if (FIXED_TOPIC_TYPES.includes(topicType)) return "fixed";
    return "user";
};

export const isMessageSchemaEditable = (topicType: string): boolean => messageSchemaSource(topicType) === "user";

// where the schema of a topic that is not edited comes from
export const messageSchemaSourceText = (topicType: string): string => {
    switch (messageSchemaSource(topicType)) {
        case "sensors":
            return topicType === "dev2sim"
                ? "Computed by the platform from the measurements of the sensors of its digital twin."
                : "Computed by the platform from the measurements of the sensors of the topic.";
        case "simulation":
            return "Computed by the platform from the simulation format of its digital twin.";
        case "fixed":
            return "Set by the platform.";
        default:
            return "";
    }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value);

// stored schema (object or JSON string, also twice encoded) as text for the editor
export const messageSchemaText = (value: unknown): string => {
    let data = value;
    for (let i = 0; i < 3 && typeof data === "string"; i++) {
        try {
            data = JSON.parse(data);
        } catch {
            return "{}";
        }
    }
    return JSON.stringify(isRecord(data) ? data : {}, null, 4);
};

// error of the text written by the user, or null if it is valid
export const messageSchemaTextError = (text: string | undefined): string | null => {
    let data: unknown;
    try {
        data = JSON.parse(text ?? "");
    } catch {
        return "It is not valid JSON";
    }
    if (!isRecord(data)) return "It must be a JSON object (a JSON schema)";
    if (data.type !== undefined && typeof data.type !== "string" && !Array.isArray(data.type)) {
        return 'Its "type" must be a string or an array of strings';
    }
    return null;
};

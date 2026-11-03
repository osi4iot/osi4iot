// AI Tool nodes: the start of a flow that the AI Agent nodes of the same pipeline call as a tool
// (flow__<toolName>). These helpers mirror pipelines' checks (nodes/aiToolNode.go), so that the editor
// shows the problems before deploying.

export type AiToolParameterType = "string" | "number" | "integer" | "boolean" | "array";

export interface AiToolParameter {
    name: string;
    type: AiToolParameterType;
    items?: Exclude<AiToolParameterType, "array">; // array: the type of its elements
    description?: string;
    required?: boolean;
    enum?: string; // string: allowed values, comma separated
}

export const AI_TOOL_PREFIX = "flow__";
export const AI_TOOL_MAX_NAME = 48;
export const AI_TOOL_MAX_PARAMETERS = 20;
export const AI_TOOL_MAX_TIMEOUT = 300;
export const AI_TOOL_RESERVED = ["userName", "toolName"];
const NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]*$/;

export const isValidToolName = (name: string) => NAME_PATTERN.test(name) && name.length <= AI_TOOL_MAX_NAME;

// tool_<n>, or the next free tool_<k>
export const uniqueToolName = (existing: (string | undefined)[], start: number) => {
    const taken = new Set(existing.filter(Boolean));
    let n = Math.max(1, start);
    while (taken.has(`tool_${n}`)) n++;
    return `tool_${n}`;
};

export interface AiToolSettings {
    toolName?: string;
    description?: string;
    parameters?: AiToolParameter[];
    timeoutSeconds?: number;
}

// The problems pipelines would reject the node for, plus a repeated name in the pipeline
export const aiToolProblems = (settings: AiToolSettings, otherToolNames: string[] = []): string[] => {
    const problems: string[] = [];
    const name = (settings.toolName ?? "").trim();
    if (!isValidToolName(name)) {
        problems.push(
            `The tool name must start with a letter and have only letters, digits and _ (at most ${AI_TOOL_MAX_NAME}).`,
        );
    } else if (otherToolNames.includes(name)) {
        problems.push(`Another AI Tool node of this pipeline is named ${name}: only one of them would be used.`);
    }
    if (!(settings.description ?? "").trim()) {
        problems.push("The description is required: the model decides when to call the tool from it.");
    }
    const parameters = settings.parameters ?? [];
    if (parameters.length > AI_TOOL_MAX_PARAMETERS) problems.push(`At most ${AI_TOOL_MAX_PARAMETERS} parameters.`);
    const seen = new Set<string>();
    parameters.forEach((p, i) => {
        const pname = (p.name ?? "").trim();
        if (!isValidToolName(pname)) problems.push(`Parameter ${i + 1}: invalid name "${pname}".`);
        else if (AI_TOOL_RESERVED.includes(pname)) problems.push(`Parameter ${i + 1}: "${pname}" is reserved.`);
        else if (seen.has(pname)) problems.push(`Parameter ${i + 1}: "${pname}" is repeated.`);
        seen.add(pname);
    });
    return problems;
};

// The AI Tool nodes of a pipeline (React Flow nodes), by tool name
export const pipelineAiTools = (nodes: { id: string; type?: string; data?: any }[]) =>
    nodes
        .filter((n) => n.type === "AiTool")
        .map((n) => ({
            nodeId: n.id,
            label: String(n.data?.label ?? ""),
            toolName: String(n.data?.settings?.toolName ?? ""),
            description: String(n.data?.settings?.description ?? ""),
        }));

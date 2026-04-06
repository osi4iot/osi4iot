// ─────────────────────────────────────────────────────────────────────────────
// editor/types/index.ts
// ─────────────────────────────────────────────────────────────────────────────

// ── Hover tooltip data ────────────────────────────────────────────────────────

export interface VariableInfo {
    sig:        string;
    doc:        string;
    constants:  string[];
    properties: string[];
    methods:    string[];
}

// ── Variable resolution origin ────────────────────────────────────────────────

export type VariableOrigin =
    | "instance"
    | "destructuring"
    | "instance_returned_by_method"
    | `method: ${string}`
    | "";

// ─── Serializable completion types (safe across postMessage) ──────────────────

export interface SerializableMethod {
    label:      string;
    type:       string;
    info:       string;
    detail:     string;
    apply:      string;
    source:     string;
    returnType?: string;
}

export interface SerializableCompletionResult {
    from:     number;
    options:  SerializableMethod[];
    validFor: string;   // RegExp source string, e.g. "^\\w*$"
}

// ─── In-process completion result (after deserialization) ─────────────────────

export interface DeserializedMethod extends Omit<SerializableMethod, "apply"> {
    apply: string | ((view: any, completion: any, from: number, to: any) => void);
}

export interface CompletionResult {
    from:     number;
    options:  DeserializedMethod[];
    validFor: RegExp;
}

// ─── Worker message protocol ──────────────────────────────────────────────────

export interface LSDiagnostic {
    from:     number;
    to:       number;
    severity: "error" | "warning" | "info";
    message:  string;
}

export type WorkerRequest =
    | { id: number; type: "complete"; doc: string; pos: number; wordFrom: number }
    | { id: number; type: "hover";    doc: string; pos: number; word: string; lineText: string }
    | { id: number; type: "diagnose"; doc: string };

export type WorkerResponse =
    | { id: number; type: "complete";  result: SerializableCompletionResult | null }
    | { id: number; type: "hover";     result: VariableInfo | null }
    | { id: number; type: "diagnose";  result: LSDiagnostic[] }
    | { id: number; type: "error";     message: string };

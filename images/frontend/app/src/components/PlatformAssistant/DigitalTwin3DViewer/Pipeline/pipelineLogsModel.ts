// Pure helpers behind the pipeline logs panel: the cap on stored logs, the one-line summary of each log,
// grouping of identical consecutive logs (shown once with a ×N counter) and the filters.
import type { PipelineLog } from "./PipelineLogs";

// Only the newest logs are kept (in the viewer state and in the viewer memory)
export const MAX_PIPELINE_LOGS = 500;

export type LogLevel = "error" | "warning" | "info" | "debug";
export type LevelFilter = "all" | LogLevel;

export const levelOf = (log: PipelineLog): LogLevel => {
    const level = (log.level ?? "").toLowerCase();
    if (level === "warn") return "warning";
    return level === "error" || level === "warning" || level === "debug" ? level : "info";
};

// Appends a log and drops the oldest ones beyond the cap
export const appendCapped = (logs: PipelineLog[], log: PipelineLog, max = MAX_PIPELINE_LOGS): PipelineLog[] => {
    const next = logs.length >= max ? logs.slice(logs.length - max + 1) : logs.slice();
    next.push(log);
    return next;
};

export const capLogs = (logs: PipelineLog[] | undefined, max = MAX_PIPELINE_LOGS): PipelineLog[] =>
    !logs ? [] : logs.length > max ? logs.slice(logs.length - max) : logs;

// Compact, single-line JSON: {a: 1, b: "x"} (keys without quotes, long arrays and objects shortened)
export const compactJson = (value: unknown, depth = 0): string => {
    if (value === null || value === undefined) return String(value);
    if (typeof value === "string") return JSON.stringify(value);
    if (typeof value === "number") return Number.isInteger(value) ? String(value) : String(Number(value.toPrecision(6)));
    if (typeof value !== "object") return String(value);
    if (depth >= 2) return Array.isArray(value) ? `[…${value.length}]` : "{…}";
    if (Array.isArray(value)) {
        const items = value.slice(0, 4).map((v) => compactJson(v, depth + 1));
        return `[${items.join(", ")}${value.length > 4 ? ", …" : ""}]`;
    }
    const entries = Object.entries(value as Record<string, unknown>);
    const parts = entries.slice(0, 8).map(([k, v]) => `${k}: ${compactJson(v, depth + 1)}`);
    return `{${parts.join(", ")}${entries.length > 8 ? ", …" : ""}}`;
};

// The message of info and error logs is often JSON: parsed when it is an object or an array
export const parseMessage = (message: unknown): unknown => {
    if (typeof message !== "string") return message;
    const text = message.trim();
    if (!(text.startsWith("{") || text.startsWith("["))) return message;
    try {
        return JSON.parse(text);
    } catch {
        return message;
    }
};

export const summaryOf = (log: PipelineLog): string => {
    const level = levelOf(log);
    if (level === "debug") {
        const payload = log.payload && Object.keys(log.payload).length ? compactJson(log.payload) : "{}";
        return `out ${log.outputIndex ?? 0} · ${payload}`;
    }
    const parsed = parseMessage(log.message);
    if (typeof parsed === "string" && parsed.trim()) {
        const firstLine = parsed.trim().split("\n")[0];
        return log.component === "node" && level === "info" && log.description ? log.description : firstLine;
    }
    if (log.description) return log.description;
    return parsed === undefined || parsed === "" ? "" : compactJson(parsed);
};

// Time of the log with milliseconds when it is known (logs received from now on), else the stored date
export const timeOf = (log: PipelineLog): string => {
    if (typeof log.receivedAt === "number") {
        const d = new Date(log.receivedAt);
        const pad = (n: number, w = 2) => String(n).padStart(w, "0");
        return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
    }
    const match = /(\d{1,2}:\d{2}:\d{2})/.exec(log.date ?? "");
    return match ? match[1].padStart(8, "0") : log.date ?? "";
};

export interface LogGroup {
    key: string;
    log: PipelineLog; // the newest log of the group
    count: number;
}

const sameContent = (a: PipelineLog, b: PipelineLog) =>
    a.uid === b.uid &&
    levelOf(a) === levelOf(b) &&
    a.name === b.name &&
    (a.outputIndex ?? 0) === (b.outputIndex ?? 0) &&
    a.message === b.message &&
    a.description === b.description &&
    JSON.stringify(a.payload ?? {}) === JSON.stringify(b.payload ?? {}) &&
    JSON.stringify(a.state ?? {}) === JSON.stringify(b.state ?? {});

// Identical consecutive logs (same node, level, output, message and data) are shown once with a ×N counter
export const groupLogs = (logs: PipelineLog[]): LogGroup[] => {
    const groups: LogGroup[] = [];
    logs.forEach((log, index) => {
        const last = groups[groups.length - 1];
        if (last && sameContent(last.log, log)) {
            last.log = log;
            last.count += 1;
            return;
        }
        groups.push({ key: `${index}-${log.uid}`, log, count: 1 });
    });
    return groups;
};

export interface LogFilters {
    level: LevelFilter;
    text: string;
    node: string; // node name, "" = all nodes
}

export const filterLogs = (logs: PipelineLog[], { level, text, node }: LogFilters): PipelineLog[] => {
    const needle = text.trim().toLowerCase();
    return logs.filter((log) => {
        if (level !== "all" && levelOf(log) !== level) return false;
        if (node && log.name !== node) return false;
        if (!needle) return true;
        const haystack = `${log.name ?? ""} ${log.uid ?? ""} ${log.description ?? ""} ${summaryOf(log)} ${
            typeof log.message === "string" ? log.message : ""
        }`.toLowerCase();
        return haystack.includes(needle);
    });
};

export const countByLevel = (logs: PipelineLog[]) => {
    const counts = { all: logs.length, error: 0, warning: 0, info: 0, debug: 0 };
    for (const log of logs) counts[levelOf(log)] += 1;
    return counts;
};

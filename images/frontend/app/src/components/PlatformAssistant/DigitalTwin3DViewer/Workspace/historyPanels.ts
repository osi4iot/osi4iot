// The Alarms and Approvals panels of the Viewer page, from the history tables (iot_data.alarm and
// iot_data.approval, written by the pipelines): what is happening now (the alarms that are not normal, the
// requests that wait for a decision) and the latest events. Pure functions, so they are easy to test.

export type HistoryPanelKind = "alarms" | "approvals";

export interface AlarmRow {
    time: string;
    eventId: string;
    nodeUid: string;
    nodeName: string;
    alarmName: string;
    alarmKey: string;
    event: string;
    level: string;
    state: string;
    shelved: boolean;
    raisedAt: string | null;
    value: unknown;
    threshold: string;
    units: string;
    ackBy: string;
    ackAt: string | null;
    userName: string;
    message: string;
}

export interface ApprovalRow {
    time: string;
    eventId: string;
    nodeUid: string;
    nodeName: string;
    requestId: string;
    event: string;
    title: string;
    detail: string;
    channel: string;
    requestedAt: string;
    expiresAt: string | null;
    decidedAt: string | null;
    decidedBy: string;
    via: string;
    comment: string;
    waitSeconds: number | null;
}

export type Tone = "danger" | "warning" | "ok" | "info" | "muted";

export const TONE_COLORS: Record<Tone, { fg: string; bg: string; border: string }> = {
    danger: { fg: "#ff8a95", bg: "rgba(242, 73, 92, 0.14)", border: "rgba(242, 73, 92, 0.45)" },
    warning: { fg: "#ffb35c", bg: "rgba(255, 152, 48, 0.14)", border: "rgba(255, 152, 48, 0.45)" },
    ok: { fg: "#8fd48a", bg: "rgba(115, 191, 105, 0.14)", border: "rgba(115, 191, 105, 0.45)" },
    info: { fg: "#9cc2ff", bg: "rgba(87, 148, 242, 0.14)", border: "rgba(87, 148, 242, 0.45)" },
    muted: { fg: "#b4bac2", bg: "rgba(255, 255, 255, 0.05)", border: "rgba(255, 255, 255, 0.14)" },
};

// how often a panel asks again (the pipelines write the history every 2 s)
export const HISTORY_PANEL_REFRESH_MS = 10_000;
export const HISTORY_PANEL_EVENTS = 50;

// --- alarms ----------------------------------------------------------------------------------------------

export const levelTone = (level: string): Tone =>
    level === "Alarm" ? "danger" : level === "Warning" ? "warning" : level === "Normal" ? "ok" : "muted";

const STATE_TEXT: Record<string, { text: string; tone: Tone }> = {
    active_unack: { text: "Unacknowledged", tone: "danger" },
    active_ack: { text: "Acknowledged", tone: "warning" },
    rtn_unack: { text: "Back to normal, not acknowledged", tone: "info" },
    latched: { text: "Latched", tone: "warning" },
    shelved: { text: "Shelved", tone: "muted" },
    normal: { text: "Normal", tone: "ok" },
};

export const alarmState = (state: string): { text: string; tone: Tone } =>
    STATE_TEXT[state] ?? { text: state || "–", tone: "muted" };

const EVENT_TONE: Record<string, Tone> = {
    raised: "danger",
    escalated: "danger",
    deescalated: "warning",
    cleared: "ok",
    acked: "info",
    acknowledged: "info",
    shelved: "muted",
    unshelved: "muted",
    reset: "muted",
    // approvals
    requested: "info",
    approved: "ok",
    rejected: "danger",
    expired: "muted",
};

export const eventTone = (event: string): Tone => EVENT_TONE[event] ?? "muted";

export const eventText = (event: string): string => {
    const words: Record<string, string> = { acked: "acknowledged", deescalated: "de-escalated" };
    const text = words[event] ?? event;
    return text ? text[0].toUpperCase() + text.slice(1) : "–";
};

export const alarmTitle = (row: Pick<AlarmRow, "alarmName" | "alarmKey" | "nodeName" | "nodeUid">): string => {
    const name = row.alarmName || row.nodeName || row.nodeUid;
    return row.alarmKey && row.alarmName && !row.alarmName.includes(row.alarmKey) ? `${name} · ${row.alarmKey}` : name;
};

export const formatAlarmValue = (value: unknown, units: string): string => {
    if (value === null || value === undefined || value === "") return "";
    let text: string;
    if (typeof value === "number") text = Number.isInteger(value) ? String(value) : String(Number(value.toPrecision(5)));
    else if (typeof value === "string" || typeof value === "boolean") text = String(value);
    else text = JSON.stringify(value);
    if (text.length > 40) text = `${text.slice(0, 39)}…`;
    return units && units !== "-" ? `${text} ${units}` : text;
};

export const alarmSummary = (row: AlarmRow): string => {
    const value = formatAlarmValue(row.value, row.units);
    if (value && row.threshold) return `${value} (limit ${row.threshold})`;
    return value || row.message || "";
};

export const countAlarmStates = (rows: AlarmRow[]) => ({
    unacked: rows.filter((r) => r.state === "active_unack" || r.state === "rtn_unack").length,
    acked: rows.filter((r) => r.state === "active_ack" || r.state === "latched").length,
    shelved: rows.filter((r) => r.state === "shelved").length,
});

// --- approvals -------------------------------------------------------------------------------------------

export const approvalSummary = (row: ApprovalRow): string => {
    if (row.event === "requested") return row.channel ? `Asked by ${row.channel}` : "Waiting for a decision";
    const who = row.decidedBy ? `by ${row.decidedBy}` : row.via === "node" ? "by the pipeline" : "";
    const how = row.via && row.via !== "node" ? `via ${row.via}` : "";
    const wait = row.waitSeconds !== null && row.waitSeconds !== undefined ? `after ${formatDuration(row.waitSeconds * 1000)}` : "";
    return [who, how, wait].filter(Boolean).join(" · ");
};

// "expires in 5 min", "expired", or "" (no time limit)
export const expiresText = (expiresAt: string | null, now: number): { text: string; soon: boolean } => {
    if (!expiresAt) return { text: "No time limit", soon: false };
    const left = Date.parse(expiresAt) - now;
    if (!Number.isFinite(left)) return { text: "", soon: false };
    if (left <= 0) return { text: "Expired", soon: true };
    return { text: `Expires in ${formatDuration(left)}`, soon: left < 5 * 60_000 };
};

// --- time --------------------------------------------------------------------------------------------------

export const formatDuration = (ms: number): string => {
    const s = Math.max(0, Math.round(ms / 1000));
    if (s < 60) return `${s} s`;
    const m = Math.round(s / 60);
    if (m < 60) return `${m} min`;
    const h = Math.floor(m / 60);
    if (h < 24) return m % 60 && h < 10 ? `${h} h ${m % 60} min` : `${h} h`;
    const d = Math.floor(h / 24);
    return h % 24 && d < 3 ? `${d} d ${h % 24} h` : `${d} d`;
};

export const timeAgo = (iso: string | null | undefined, now: number): string => {
    if (!iso) return "";
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) return "";
    const ms = now - t;
    if (ms < 30_000) return "just now";
    return `${formatDuration(ms)} ago`;
};

export const clockTime = (iso: string | null | undefined, now: number): string => {
    if (!iso) return "";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";
    const sameDay = new Date(now).toDateString() === date.toDateString();
    return sameDay
        ? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
        : date.toLocaleString([], { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
};

// The fields of the detail of an event that have a value, in the order they are read
export const detailEntries = (detail: Record<string, unknown>, kind: HistoryPanelKind): [string, string][] => {
    const fields: [string, string][] =
        kind === "alarms"
            ? [
                  ["description", "Description"],
                  ["message", "Message"],
                  ["value", "Value"],
                  ["threshold", "Limit"],
                  ["property", "Property"],
                  ["condition", "Condition"],
                  ["raisedAt", "Raised"],
                  ["ackBy", "Acknowledged by"],
                  ["ackAt", "Acknowledged at"],
                  ["userName", "User"],
                  ["nodeName", "Node"],
                  ["triggerTopic", "Topic of the message"],
              ]
            : [
                  ["detail", "Detail"],
                  ["comment", "Comment"],
                  ["channel", "Channel"],
                  ["requestedAt", "Requested"],
                  ["expiresAt", "Expires"],
                  ["decidedAt", "Decided"],
                  ["decidedBy", "Decided by"],
                  ["via", "Via"],
                  ["nodeName", "Node"],
                  ["triggerTopic", "Topic of the message"],
              ];
    const isDate = (key: string) => key.endsWith("At");
    return fields
        .map(([key, label]): [string, string] => {
            const value = detail[key];
            if (value === null || value === undefined || value === "") return [label, ""];
            if (isDate(key) && typeof value === "string") return [label, new Date(value).toLocaleString()];
            if (key === "value") return [label, formatAlarmValue(value, String(detail.units ?? ""))];
            return [label, typeof value === "object" ? JSON.stringify(value) : String(value)];
        })
        .filter(([, value]) => value !== "");
};

// The copy of the message that caused the event, readable and not too long
export const triggerPayloadText = (payload: unknown, max = 4000): string => {
    if (payload === null || payload === undefined) return "";
    const text = typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
    return text.length > max ? `${text.slice(0, max)}\n…` : text;
};

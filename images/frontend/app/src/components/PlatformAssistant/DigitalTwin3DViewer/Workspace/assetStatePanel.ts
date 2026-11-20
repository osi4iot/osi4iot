// The "Asset state" panel of the Viewer page: the current state of the digital twin's asset (iot_data.assetState,
// written by the pipelines: the Asset state node, and the Alarm and Machine state nodes, which project into it
// their "alarms" and "machines"). Only the current state: no history.
//
// The panel shows the status (OK, Warning, Alarm, or any other a pipeline sets), its description, the alarms and
// machines that are not normal, the fields chosen by the group (paths of the state: "production.speed",
// "lots.0.id") and when the state was last written. Its settings: stateFields, statusColors (the colour of each
// status, over the default ones) and staleMinutes (after how long without a change the state is shown as old).
//
// Pure functions, so they are easy to test. admin_api checks the same settings (viewerLayoutValidation.ts).
import { TONE_COLORS, Tone } from "./historyPanels";

// how often the panel reads the state again (the Alarms and Approvals panels too)
export const ASSET_STATE_REFRESH_MS = 5_000;
export const ASSET_STATE_MAX_FIELDS = 20;
export const ASSET_STATE_MAX_COLORS = 12;
export const ASSET_STATE_MAX_STALE_MINUTES = 10080;
export const ASSET_STATE_LABEL_MAX = 40;
// the paths offered in the editor, from the current state (not those of the projected sections)
const MAX_OFFERED_PATHS = 200;

export interface AssetStateField {
    path: string;
    label?: string;
    unit?: string;
}

export interface AssetStateSettings {
    stateFields?: AssetStateField[];
    statusColors?: Record<string, string>;
    staleMinutes?: number;
}

// what admin_api returns (asset_state/:groupId/:digitalTwinId)
export interface AssetStateView {
    assetUid: string;
    description: string;
    state: Record<string, unknown>;
    lastUpdated: string | null;
}

// a key of a path: no dots, slashes, quotes or backslashes (as the measurements' paths)
const PATH_KEY = /^[^./"'\\\u0000-\u001f]{1,64}$/;
const STATUS_NAME = /^[\p{L}\p{N} _.-]{1,40}$/u;
export const STATUS_COLOR = /^(#[0-9a-fA-F]{3,8}|[a-zA-Z]{3,20}|rgba?\([\d\s.,%]+\))$/;

export const isStatePath = (path: unknown): path is string => {
    if (typeof path !== "string" || path.length === 0 || path.length > 200) return false;
    const keys = path.split(".");
    return keys.length <= 10 && keys.every((key) => PATH_KEY.test(key));
};

export const isStatusName = (name: string) => STATUS_NAME.test(name);

// The value at a path of the state ("production.speed", "lots.0.id": an index of an array); undefined if missing
export const valueAtStatePath = (state: unknown, path: string): unknown => {
    let value: unknown = state;
    for (const key of path.split(".")) {
        if (Array.isArray(value)) {
            if (!/^\d{1,3}$/.test(key)) return undefined;
            value = value[Number(key)];
        } else if (value && typeof value === "object") {
            if (!Object.prototype.hasOwnProperty.call(value, key)) return undefined;
            value = (value as Record<string, unknown>)[key];
        } else return undefined;
    }
    return value;
};

// A value as the panel writes it: numbers with at most 4 significant decimals, booleans as Yes / No, objects as
// compact JSON (cut)
export const formatStateValue = (value: unknown): string => {
    if (value === undefined) return "—";
    if (value === null) return "null";
    if (typeof value === "number") {
        if (!Number.isFinite(value)) return String(value);
        return Number.isInteger(value) ? value.toLocaleString() : value.toLocaleString(undefined, { maximumFractionDigits: 4 });
    }
    if (typeof value === "boolean") return value ? "Yes" : "No";
    if (typeof value === "string") return value;
    const text = JSON.stringify(value);
    return text.length > 200 ? `${text.slice(0, 199)}…` : text;
};

// The default tone of the statuses of the platform (Alarm and Asset state nodes: OK, Warning, Alarm)
export const statusTone = (status: string): Tone => {
    const s = status.trim().toLowerCase();
    if (s === "ok" || s === "normal") return "ok";
    if (s === "warning") return "warning";
    if (s === "alarm" || s === "alerting" || s === "critical" || s === "error") return "danger";
    return "muted";
};

// The colours of the badge of a status: those the panel sets for it, else the default ones
export const statusColors = (status: string, custom?: Record<string, string>): { fg: string; bg: string; border: string } => {
    const color = custom?.[status];
    if (color) return { fg: "#fff", bg: color, border: color };
    return TONE_COLORS[statusTone(status)];
};

export const statusOf = (state: Record<string, unknown>): string =>
    typeof state.status === "string" && state.status.trim() ? state.status : "Unknown";

export const descriptionOf = (state: Record<string, unknown>): string =>
    typeof state.state_description === "string" ? state.state_description : "";

// An entry of the alarms or machines projected into the state by the nodes ("<node uid>|<key>": { … })
export interface ProjectedEntry {
    id: string;
    name: string;
    // alarms: its level (Warning, Alarm) and state; machines: its state
    level?: string;
    state?: string;
    value?: string;
    since?: string;
}

const text = (v: unknown): string | undefined => (typeof v === "string" && v ? v : typeof v === "number" ? String(v) : undefined);

export const projectedEntries = (state: Record<string, unknown>, section: "alarms" | "machines"): ProjectedEntry[] => {
    const raw = state[section];
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
    const entries: ProjectedEntry[] = [];
    for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
        if (!value || typeof value !== "object" || Array.isArray(value)) continue;
        const e = value as Record<string, unknown>;
        entries.push({
            id,
            name: text(e.name) ?? id.split("|")[1] ?? id,
            level: text(e.level),
            state: text(e.state),
            value: text(e.value),
            since: text(e.since) ?? text(e.raisedAt),
        });
    }
    // alarms: the most severe first
    const weight = (e: ProjectedEntry) => (e.level === "Alarm" ? 0 : e.level === "Warning" ? 1 : 2);
    return entries.sort((a, b) => weight(a) - weight(b) || a.name.localeCompare(b.name));
};

// The state was not written for longer than staleMinutes (0 or none: never old)
export const isStale = (lastUpdated: string | null, staleMinutes: number | undefined, now: number): boolean => {
    if (!staleMinutes || !lastUpdated) return false;
    const t = Date.parse(lastUpdated);
    return Number.isFinite(t) && now - t > staleMinutes * 60_000;
};

// The paths of the leaves of the state, to choose the fields (without the alarms and machines of the nodes)
export const statePaths = (state: Record<string, unknown>): string[] => {
    const paths: string[] = [];
    const walk = (value: unknown, prefix: string, depth: number) => {
        if (paths.length >= MAX_OFFERED_PATHS) return;
        if (value && typeof value === "object" && depth < 10) {
            const entries = Array.isArray(value) ? value.slice(0, 64).map((v, i) => [String(i), v] as const) : Object.entries(value);
            if (entries.length === 0 && prefix) paths.push(prefix);
            for (const [key, child] of entries) {
                if (!PATH_KEY.test(key)) continue;
                walk(child, prefix ? `${prefix}.${key}` : key, depth + 1);
            }
        } else if (prefix) paths.push(prefix);
    };
    for (const [key, value] of Object.entries(state)) {
        if (key === "alarms" || key === "machines" || key === "status" || key === "state_description") continue;
        if (PATH_KEY.test(key)) walk(value, key, 1);
    }
    return paths;
};

// The settings of a panel as they are stored, made safe (what does not fit is dropped)
export const sanitizeAssetStateSettings = (p: Record<string, unknown>): AssetStateSettings => {
    const settings: AssetStateSettings = {};
    if (Array.isArray(p.stateFields)) {
        const fields: AssetStateField[] = [];
        for (const raw of p.stateFields.slice(0, ASSET_STATE_MAX_FIELDS)) {
            if (!raw || typeof raw !== "object") continue;
            const f = raw as Record<string, unknown>;
            if (!isStatePath(f.path)) continue;
            const field: AssetStateField = { path: f.path };
            if (typeof f.label === "string" && f.label.trim()) field.label = f.label.trim().slice(0, ASSET_STATE_LABEL_MAX);
            if (typeof f.unit === "string" && f.unit.trim()) field.unit = f.unit.trim().slice(0, ASSET_STATE_LABEL_MAX);
            fields.push(field);
        }
        if (fields.length) settings.stateFields = fields;
    }
    if (p.statusColors && typeof p.statusColors === "object" && !Array.isArray(p.statusColors)) {
        const colors: Record<string, string> = {};
        for (const [status, color] of Object.entries(p.statusColors as Record<string, unknown>).slice(0, ASSET_STATE_MAX_COLORS)) {
            if (isStatusName(status) && typeof color === "string" && STATUS_COLOR.test(color)) colors[status] = color;
        }
        if (Object.keys(colors).length) settings.statusColors = colors;
    }
    const stale = p.staleMinutes;
    if (typeof stale === "number" && Number.isInteger(stale) && stale > 0 && stale <= ASSET_STATE_MAX_STALE_MINUTES) settings.staleMinutes = stale;
    return settings;
};

// The problems of settings being edited (empty: they can be applied)
export const assetStateSettingsProblems = (settings: AssetStateSettings): string[] => {
    const problems: string[] = [];
    const fields = settings.stateFields ?? [];
    if (fields.length > ASSET_STATE_MAX_FIELDS) problems.push(`At most ${ASSET_STATE_MAX_FIELDS} fields`);
    fields.forEach((f, i) => {
        if (!isStatePath(f.path)) problems.push(`Field ${i + 1}: the path is keys separated by dots, without / " ' \\`);
    });
    const colors = Object.entries(settings.statusColors ?? {});
    if (colors.length > ASSET_STATE_MAX_COLORS) problems.push(`At most ${ASSET_STATE_MAX_COLORS} status colours`);
    for (const [status, color] of colors) {
        if (!isStatusName(status)) problems.push(`Invalid status name: ${status || "(empty)"}`);
        else if (!STATUS_COLOR.test(color)) problems.push(`Invalid colour of ${status}`);
    }
    const stale = settings.staleMinutes;
    if (stale !== undefined && (!Number.isInteger(stale) || stale < 0 || stale > ASSET_STATE_MAX_STALE_MINUTES)) {
        problems.push(`"Old after" is from 0 to ${ASSET_STATE_MAX_STALE_MINUTES} minutes`);
    }
    return problems;
};

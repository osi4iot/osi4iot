// The control room of a group: a digital twin whose asset is the group's virtual asset (context "group"), whose
// panels show all the assets of the group at once (admin_api control_room/:groupId/:digitalTwinId): the Asset state
// panel as a table, the Alarms and Approvals panels of the whole group, and the Health and Pipeline logs panels.
// Pure functions and types, so they are easy to test.
import { axiosAuth } from "../../../../tools/tools";
import { getAxiosInstance } from "../../../../tools/axiosIntance";
import { DOMAIN_NAME, PROTOCOL } from "../Utils/constants";
import { ApiAuth } from "./viewerLayoutApi";
import { MAX_OFFERED_PATHS, statePaths, statusOf } from "./assetStatePanel";

export type DigitalTwinScope = "asset" | "group" | "organization";

// the scope of a digital twin: the context of its asset
export const scopeOfDigitalTwin = (
    digitalTwin: { assetId?: number } | null | undefined,
    assets: { id: number; context?: string }[],
): DigitalTwinScope => {
    const context = assets.find((a) => a.id === digitalTwin?.assetId)?.context;
    return context === "group" || context === "organization" ? context : "asset";
};

export interface ControlRoomDevice {
    topicRef: string;
    topicType: string;
    lastMessage: string | null;
}

export interface ControlRoomDigitalTwin {
    id: number;
    digitalTwinUid: string;
    description: string;
    type: string;
    hasPipeline: boolean;
    statusSubject: string;
    logSubject: string;
}

export interface ControlRoomAsset {
    id: number;
    assetUid: string;
    description: string;
    assetType: string;
    state: Record<string, unknown>;
    lastUpdated: string | null;
    lastData: string | null;
    devices: ControlRoomDevice[];
    digitalTwins: ControlRoomDigitalTwin[];
    s3: { folders: number; bytes: number; lastStorage: string | null };
}

export interface ControlRoomData {
    context: "group";
    groupId: number;
    groupUid: string;
    lastDataDays: number;
    // the user may see the pipeline logs (an editor or administrator of the group); else the twins have no logSubject
    canSeeLogs: boolean;
    assets: ControlRoomAsset[];
}

export const controlRoomUrl = (groupId: number, digitalTwinId: number) =>
    `${PROTOCOL}://${DOMAIN_NAME}/admin_api/control_room/${groupId}/${digitalTwinId}`;

export type ControlRoomLoader = (groupId: number, digitalTwinId: number, signal?: AbortSignal) => Promise<ControlRoomData>;

export const controlRoomApi = (auth: ApiAuth): ControlRoomLoader => async (groupId, digitalTwinId, signal) => {
    const config = { ...(axiosAuth(auth.accessToken) as object), signal };
    const response = await getAxiosInstance(auth.refreshToken, auth.authDispatch).get(controlRoomUrl(groupId, digitalTwinId), config as any);
    const data = response.data as Partial<ControlRoomData> | undefined;
    return {
        context: "group",
        groupId: Number(data?.groupId ?? groupId),
        groupUid: String(data?.groupUid ?? ""),
        lastDataDays: Number(data?.lastDataDays ?? 7),
        canSeeLogs: data?.canSeeLogs === true,
        assets: Array.isArray(data?.assets) ? data!.assets : [],
    };
};

// the paths of the states of all the assets of the group, to choose the columns of the Asset state table: those that
// more assets have first (at most MAX_OFFERED_PATHS)
export const groupStatePaths = (assets: Pick<ControlRoomAsset, "state">[]): string[] => {
    const count = new Map<string, number>();
    for (const a of assets) for (const p of statePaths(a.state)) count.set(p, (count.get(p) ?? 0) + 1);
    return [...count.entries()]
        .sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))
        .slice(0, MAX_OFFERED_PATHS)
        .map(([p]) => p);
};

// the order of the table: what needs attention first (Alarm, Warning, no recent data), then by name
const STATUS_WEIGHT: Record<string, number> = { alarm: 0, alerting: 0, critical: 0, error: 0, warning: 1 };

export const attentionOf = (asset: Pick<ControlRoomAsset, "state">): number => STATUS_WEIGHT[statusOf(asset.state).toLowerCase()] ?? 2;

export const sortByAttention = <T extends Pick<ControlRoomAsset, "state" | "description">>(assets: T[]): T[] =>
    [...assets].sort((a, b) => attentionOf(a) - attentionOf(b) || a.description.localeCompare(b.description));

// the pipeline statuses of the platform (pipelines common.PipelineStatus) and how they are shown
export type PipelineTone = "ok" | "warning" | "danger" | "muted";

export const pipelineTone = (status: string | undefined): PipelineTone => {
    // pipelines: unknown, created, running, stopped, error, deleted
    const s = (status ?? "").toLowerCase();
    if (s === "running") return "ok";
    if (s === "created") return "warning";
    if (s === "error") return "danger";
    return "muted";
};

// without a status for this long, the pipeline does not answer (they publish it every second)
export const PIPELINE_SILENT_MS = 15_000;

export interface PipelineStatusSeen {
    status: string;
    at: number;
}

export const pipelineStatusText = (
    twin: Pick<ControlRoomDigitalTwin, "hasPipeline">,
    seen: PipelineStatusSeen | undefined,
    now: number,
    since: number,
): { text: string; tone: PipelineTone } => {
    if (!twin.hasPipeline) return { text: "No pipeline", tone: "muted" };
    if (seen && now - seen.at <= PIPELINE_SILENT_MS) return { text: seen.status, tone: pipelineTone(seen.status) };
    // just opened: wait for the first status
    if (!seen && now - since < PIPELINE_SILENT_MS) return { text: "…", tone: "muted" };
    // a stopped pipeline no longer says its status either
    return { text: "No answer", tone: "danger" };
};

// the data of an asset is old after this long without a message
export const DATA_STALE_MS = 60 * 60_000;

export const isDataStale = (lastData: string | null, now: number): boolean => {
    if (!lastData) return true;
    const t = Date.parse(lastData);
    return !Number.isFinite(t) || now - t > DATA_STALE_MS;
};

export const formatBytes = (bytes: number): string => {
    if (!bytes) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
    const value = bytes / 1024 ** i;
    return `${value >= 10 || i === 0 ? Math.round(value) : value.toFixed(1)} ${units[i]}`;
};

// the devices of an asset that sent a message within the hour
export const devicesAlive = (devices: ControlRoomDevice[], now: number): number =>
    devices.filter((d) => d.lastMessage && now - Date.parse(d.lastMessage) <= DATA_STALE_MS).length;

// A log event of a pipeline (dtmlog), as the Pipeline logs panel keeps it: live (by NATS) or kept (admin_api
// control_room_logs, the last days)
export interface PipelineLogEvent {
    id: number;
    at: number;
    digitalTwinId: number;
    digitalTwin: string;
    asset: string;
    level: string;
    // "node", or "pipeline" for the events of the pipeline itself (created, started, stopped, failed…)
    component: string;
    name: string;
    message: string;
}

export const LOG_LEVELS = ["error", "warning", "info", "debug"] as const;
// "important": the warnings and errors and the events of the pipelines (the default); "all"; "error": only errors
export type LogLevelFilter = "important" | "all" | "error";
export const MAX_LOG_EVENTS = 300;
const MAX_LOG_MESSAGE = 500;

const levelRank = (level: string): number => {
    const l = level.toLowerCase();
    return l === "error" || l === "fatal" ? 0 : l === "warning" || l === "warn" ? 1 : l === "info" ? 2 : 3;
};

export const passesLevel = (event: Pick<PipelineLogEvent, "level" | "component">, filter: LogLevelFilter): boolean => {
    if (filter === "all") return true;
    if (filter === "error") return levelRank(event.level) === 0;
    return levelRank(event.level) <= 1 || event.component === "pipeline";
};

// what admin_api keeps for each filter (the errors are among the important ones)
export const serverLevelsOf = (filter: LogLevelFilter): "important" | "all" => (filter === "all" ? "all" : "important");

const cut = (message: string) => (message.length > MAX_LOG_MESSAGE ? `${message.slice(0, MAX_LOG_MESSAGE - 1)}…` : message);

// a dtmlog message (pipelines common.PipelineLog) as an event; null if it is not one
export const logEventOf = (
    data: unknown,
    twin: Pick<ControlRoomDigitalTwin, "id" | "description">,
    asset: string,
    id: number,
    at: number,
): PipelineLogEvent | null => {
    if (!data || typeof data !== "object" || Array.isArray(data)) return null;
    const d = data as Record<string, unknown>;
    const text = (v: unknown) => (typeof v === "string" ? v : "");
    const message = text(d.message) || text(d.description);
    if (!message && !text(d.name)) return null;
    return {
        id,
        at,
        digitalTwinId: twin.id,
        digitalTwin: twin.description,
        asset,
        level: text(d.level) || "info",
        component: text(d.component),
        name: text(d.name),
        message: cut(message),
    };
};

// the newest first, at most MAX_LOG_EVENTS
export const addLogEvent = (events: PipelineLogEvent[], event: PipelineLogEvent): PipelineLogEvent[] =>
    [event, ...events].slice(0, MAX_LOG_EVENTS);

// the kept events and the live ones together, the newest first
export const mergeLogEvents = (live: PipelineLogEvent[], kept: PipelineLogEvent[]): PipelineLogEvent[] =>
    [...live, ...kept].sort((a, b) => b.at - a.at || b.id - a.id).slice(0, MAX_LOG_EVENTS);

// The kept logs of the group (admin_api GET control_room_logs/:groupId/:digitalTwinId, editors and administrators)
export interface ControlRoomLogs {
    days: number;
    events: PipelineLogEvent[];
}

export const controlRoomLogsUrl = (groupId: number, digitalTwinId: number, levels: "important" | "all") =>
    `${PROTOCOL}://${DOMAIN_NAME}/admin_api/control_room_logs/${groupId}/${digitalTwinId}?levels=${levels}`;

export type ControlRoomLogsLoader = (
    groupId: number,
    digitalTwinId: number,
    levels: "important" | "all",
    signal?: AbortSignal,
) => Promise<ControlRoomLogs>;

// the kept logs as events (negative ids: never the same as the live ones)
export const keptLogEvents = (logs: unknown): PipelineLogEvent[] => {
    if (!Array.isArray(logs)) return [];
    const text = (v: unknown) => (typeof v === "string" ? v : "");
    return logs
        .map((l, i): PipelineLogEvent | null => {
            if (!l || typeof l !== "object") return null;
            const r = l as Record<string, unknown>;
            const at = Date.parse(text(r.at));
            if (!Number.isFinite(at)) return null;
            return {
                id: -(i + 1),
                at,
                digitalTwinId: Number(r.digitalTwinId) || 0,
                digitalTwin: text(r.digitalTwin),
                asset: text(r.asset),
                level: text(r.level) || "info",
                component: text(r.component),
                name: text(r.name),
                message: cut(text(r.message)),
            };
        })
        .filter((e): e is PipelineLogEvent => e !== null);
};

export const controlRoomLogsApi = (auth: ApiAuth): ControlRoomLogsLoader => async (groupId, digitalTwinId, levels, signal) => {
    const config = { ...(axiosAuth(auth.accessToken) as object), signal };
    const response = await getAxiosInstance(auth.refreshToken, auth.authDispatch).get(
        controlRoomLogsUrl(groupId, digitalTwinId, levels),
        config as any,
    );
    const data = response.data as { days?: unknown; logs?: unknown } | undefined;
    return { days: Number(data?.days ?? 7), events: keptLogEvents(data?.logs) };
};

// The Organization overview panel (README, "Organization overview"): the indicators of the organization, from admin_api
// GET organization_overview/:groupId/:digitalTwinId (its digital twin is the organization's, in the default group).
// Only the organization's administrators and the platform's administrators read them. Pure functions and types.
import { axiosAuth } from "../../../../tools/tools";
import { getAxiosInstance } from "../../../../tools/axiosIntance";
import { DOMAIN_NAME, PROTOCOL } from "../Utils/constants";
import { ApiAuth } from "./viewerLayoutApi";

export const ORG_OVERVIEW_PERIODS = ["7d", "30d", "90d", "12m"] as const;
export type OrgOverviewPeriod = (typeof ORG_OVERVIEW_PERIODS)[number];
export const DEFAULT_UNAVAILABLE_STATUSES = ["Alarm"];
export const ORG_OVERVIEW_MAX_STATUSES = 12;
// the target of the availability card and chart
export const AVAILABILITY_TARGET = 0.98;
// a status name (as admin_api)
const STATUS_NAME = /^[\p{L}\p{N} _.-]{1,40}$/u;

export const PERIOD_LABELS: Record<OrgOverviewPeriod, string> = {
    "7d": "Last 7 days",
    "30d": "Last 30 days",
    "90d": "Last 90 days",
    "12m": "Last 12 months",
};

export interface OrgOverviewSettings {
    unavailableStatuses?: string[];
    period?: OrgOverviewPeriod;
}

export const isOrgOverviewPeriod = (value: unknown): value is OrgOverviewPeriod =>
    ORG_OVERVIEW_PERIODS.includes(value as OrgOverviewPeriod);

// the settings of a panel as they are stored, made safe (what does not fit is dropped)
export const sanitizeOrgOverviewSettings = (raw: Record<string, unknown>): OrgOverviewSettings => {
    const s: OrgOverviewSettings = {};
    if (Array.isArray(raw.unavailableStatuses)) {
        const list = [
            ...new Set(
                raw.unavailableStatuses
                    .filter((x): x is string => typeof x === "string")
                    .map((x) => x.trim())
                    .filter((x) => STATUS_NAME.test(x)),
            ),
        ].slice(0, ORG_OVERVIEW_MAX_STATUSES);
        if (list.length) s.unavailableStatuses = list;
    }
    if (isOrgOverviewPeriod(raw.period)) s.period = raw.period;
    return s;
};

export const orgOverviewSettingsProblems = (s: OrgOverviewSettings): string[] => {
    const problems: string[] = [];
    const list = s.unavailableStatuses ?? [];
    if (list.length > ORG_OVERVIEW_MAX_STATUSES) problems.push(`At most ${ORG_OVERVIEW_MAX_STATUSES} unavailable statuses`);
    if (list.some((x) => !STATUS_NAME.test(x))) problems.push("A status may have letters, digits, spaces, _ . - (at most 40)");
    if (new Set(list.map((x) => x.toLowerCase())).size !== list.length) problems.push("A status is repeated");
    return problems;
};

export interface OrgOverviewGroup {
    id: number;
    name: string;
    assets: number;
    assetsWithHistory: number;
    inactiveAssets: number;
    availability: number | null;
    mtbfHours: number | null;
    mttrHours: number | null;
    failures: number;
    alarmsRaised: number;
    mttaMinutes: number | null;
    activeAlarms: number;
    activeAlarmsByLevel: Record<string, number>;
    approvalsPending: number;
    statusTime: { status: string; seconds: number }[];
    noDataSeconds: number;
    ai: { monthTokens: number; monthlyTokenLimit: number };
    s3: OrgOverviewS3;
    pipelines: {
        deployed: number;
        failures: number;
        nodeErrors: number;
        statusSubjects: { digitalTwinId: number; description: string; subject: string }[];
    };
}

export interface OrgOverviewS3 {
    folders: number;
    bytes: number;
    lastStorage: string | null;
}

export interface OrgOverviewAi {
    month: string;
    monthTokens: number;
    monthlyTokenLimit: number;
    warningPercent: number;
    byModel: { model: string; providerType: string; tokens: number }[];
}

export interface OrgOverviewData {
    orgId: number;
    period: OrgOverviewPeriod;
    from: string;
    to: string;
    bucket: "day" | "week" | "month";
    unavailableStatuses: string[];
    totals: Omit<OrgOverviewGroup, "id" | "name" | "statusTime" | "noDataSeconds" | "ai" | "pipelines"> & {
        groups: number;
        pipelines: { deployed: number; failures: number; nodeErrors: number };
    };
    ai: OrgOverviewAi;
    // the days of pipeline logs the failures count (the period, at most 7)
    pipelineLogDays: number;
    groups: OrgOverviewGroup[];
    series: { start: string; availability: number | null; alarms: Record<string, number> }[];
    topAlarms: { groupId: number; group: string; name: string; asset: string; node: string; count: number }[];
}

export const orgOverviewUrl = (groupId: number, digitalTwinId: number, period: OrgOverviewPeriod, unavailable: string[]) =>
    `${PROTOCOL}://${DOMAIN_NAME}/admin_api/organization_overview/${groupId}/${digitalTwinId}?period=${period}` +
    `&unavailable=${encodeURIComponent(unavailable.join(","))}`;

export type OrgOverviewLoader = (
    groupId: number,
    digitalTwinId: number,
    period: OrgOverviewPeriod,
    unavailable: string[],
    signal?: AbortSignal,
) => Promise<OrgOverviewData>;

export const orgOverviewApi =
    (auth: ApiAuth): OrgOverviewLoader =>
    async (groupId, digitalTwinId, period, unavailable, signal) => {
        const config = { ...(axiosAuth(auth.accessToken) as object), signal };
        const response = await getAxiosInstance(auth.refreshToken, auth.authDispatch).get(
            orgOverviewUrl(groupId, digitalTwinId, period, unavailable),
            config as any,
        );
        return response.data as OrgOverviewData;
    };

// ---------------------------------------------------------------------------------------------------------
// How the values are shown

export const formatPercent = (value: number | null | undefined): string =>
    value === null || value === undefined ? "—" : `${(value * 100).toFixed(value >= 0.9995 ? 0 : 1)}%`;

export const formatHours = (hours: number | null | undefined): string => {
    if (hours === null || hours === undefined) return "—";
    if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min`;
    if (hours < 48) return `${hours < 10 ? hours.toFixed(1) : Math.round(hours)} h`;
    const days = hours / 24;
    return `${days < 10 ? days.toFixed(1) : Math.round(days)} d`;
};

export const formatMinutes = (minutes: number | null | undefined): string => {
    if (minutes === null || minutes === undefined) return "—";
    if (minutes < 1) return `${Math.max(1, Math.round(minutes * 60))} s`;
    if (minutes < 120) return `${Math.round(minutes)} min`;
    return formatHours(minutes / 60);
};

export type OverviewTone = "ok" | "warning" | "danger" | "muted" | "info";

export const availabilityTone = (value: number | null, target = AVAILABILITY_TARGET): OverviewTone =>
    value === null ? "muted" : value >= target ? "ok" : value >= target - 0.03 ? "warning" : "danger";

// the active alarms of the Alarm level (the others are warnings or other levels)
export const alarmLevelCount = (byLevel: Record<string, number>, level = "Alarm"): number =>
    Object.entries(byLevel).reduce((s, [l, n]) => (l.toLowerCase() === level.toLowerCase() ? s + n : s), 0);

export const activeAlarmsTone = (g: Pick<OrgOverviewGroup, "activeAlarms" | "activeAlarmsByLevel">): OverviewTone =>
    g.activeAlarms === 0 ? "muted" : alarmLevelCount(g.activeAlarmsByLevel) > 0 ? "danger" : "warning";

// what needs attention first: active alarms of the Alarm level, then any active alarm, then the lowest availability,
// then inactive assets; then by name
export const attentionOfGroup = (g: OrgOverviewGroup): number[] => [
    -alarmLevelCount(g.activeAlarmsByLevel),
    -g.activeAlarms,
    g.availability ?? 2,
    -g.inactiveAssets,
];

export const sortGroupsByAttention = (groups: OrgOverviewGroup[]): OrgOverviewGroup[] =>
    [...groups].sort((a, b) => {
        const x = attentionOfGroup(a);
        const y = attentionOfGroup(b);
        for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] - y[i];
        return a.name.localeCompare(b.name);
    });

// "6 of 8 assets with history", and the inactive ones
export const coverageText = (g: Pick<OrgOverviewGroup, "assets" | "assetsWithHistory" | "inactiveAssets">): string => {
    if (g.assets === 0) return "No assets";
    const base = `${g.assetsWithHistory} of ${g.assets} assets with history`;
    return g.inactiveAssets ? `${base} · ${g.inactiveAssets} with no data recorded` : base;
};

// the label of a bucket of the series
export const bucketLabel = (start: string, bucket: OrgOverviewData["bucket"]): string => {
    const d = new Date(start);
    if (bucket === "month") return d.toLocaleDateString(undefined, { month: "short", timeZone: "UTC" });
    return d.toLocaleDateString(undefined, { day: "numeric", month: "short", timeZone: "UTC" });
};

// the colours of the statuses in "time in each status": the unavailable ones red, "Warning" amber, "No data"
// grey, the others greens and blues in turn
export const statusColor = (status: string, unavailable: string[], index: number): string => {
    const s = status.toLowerCase();
    if (s === "no data recorded") return "#5a6069";
    if (unavailable.some((u) => u.toLowerCase() === s)) return "#f2495c";
    if (s === "warning") return "#ff9830";
    if (s === "other") return "#8a7ad6";
    return ["#73bf69", "#5794f2", "#37b3a6", "#a0c75a", "#8ab8ff"][index % 5];
};

// The geometry of the charts: an SVG as wide as its box (CHART_W until it is measured) and CHART_H high, drawn at
// its real size so the text keeps its size; the plot from PLOT_LEFT to plotRight(width), PLOT_TOP to PLOT_BOTTOM
export const CHART_W = 560;
export const plotRight = (width: number) => Math.max(PLOT_LEFT + 60, width - 10);
export const CHART_H = 200;
export const PLOT_LEFT = 44;
export const PLOT_TOP = 16;
export const PLOT_BOTTOM = 168;

const xOf = (i: number, n: number, width: number) => {
    const right = plotRight(width);
    return n <= 1 ? (PLOT_LEFT + right) / 2 : PLOT_LEFT + 14 + (i * (right - PLOT_LEFT - 28)) / (n - 1);
};

// the availability line: its range (from the lowest value, at least 5 points down) and the points with a value
export const availabilityChart = (series: OrgOverviewData["series"], width = CHART_W) => {
    const values = series.map((s) => s.availability).filter((v): v is number => v !== null);
    const lowest = values.length ? Math.min(...values, AVAILABILITY_TARGET) : AVAILABILITY_TARGET;
    const min = Math.max(0, Math.floor((lowest - 0.01) * 20) / 20);
    const yOf = (v: number) => PLOT_BOTTOM - ((v - min) / (1 - min)) * (PLOT_BOTTOM - PLOT_TOP);
    const points = series
        .map((s, i) =>
            s.availability === null
                ? null
                : { x: xOf(i, series.length, width), y: yOf(s.availability), value: s.availability, start: s.start },
        )
        .filter((p): p is { x: number; y: number; value: number; start: string } => p !== null);
    // a gap where a bucket has no value
    let path = "";
    let pen = false;
    series.forEach((s, i) => {
        if (s.availability === null) {
            pen = false;
            return;
        }
        path += `${pen ? "L" : "M"}${xOf(i, series.length, width).toFixed(1)} ${yOf(s.availability).toFixed(1)} `;
        pen = true;
    });
    return { min, path: path.trim(), points, targetY: yOf(AVAILABILITY_TARGET), midY: yOf((1 + min) / 2), mid: (1 + min) / 2 };
};

// the alarm bars: per bucket, the Alarm level and the others stacked
export const alarmsChart = (series: OrgOverviewData["series"], width = CHART_W) => {
    const totals = series.map((s) => Object.values(s.alarms).reduce((a, n) => a + n, 0));
    const max = Math.max(4, ...totals);
    const step = Math.ceil(max / 4);
    const top = step * 4;
    const scale = (PLOT_BOTTOM - PLOT_TOP) / top;
    const barWidth = Math.max(3, Math.min(28, ((plotRight(width) - PLOT_LEFT - 28) / Math.max(1, series.length)) * 0.6));
    const bars = series.map((s, i) => {
        const alarm = alarmLevelCount(s.alarms);
        const other = totals[i] - alarm;
        const ah = alarm * scale;
        const oh = other * scale;
        return {
            x: xOf(i, series.length, width) - barWidth / 2,
            width: barWidth,
            alarm,
            other,
            ay: PLOT_BOTTOM - ah,
            ah,
            oy: PLOT_BOTTOM - ah - oh,
            oh,
            start: s.start,
        };
    });
    return { bars, top, ticks: [0, step * 2, top].map((v) => ({ value: v, y: PLOT_BOTTOM - v * scale })) };
};

// some of the labels of the x axis (as many as fit)
export const axisLabels = (series: OrgOverviewData["series"], bucket: OrgOverviewData["bucket"], width = CHART_W) => {
    // about one label every 90 px, at most 12
    const fit = Math.max(2, Math.min(12, Math.floor((plotRight(width) - PLOT_LEFT) / 90)));
    const every = Math.max(1, Math.ceil(series.length / fit));
    return series
        .map((s, i) => ({ x: xOf(i, series.length, width), label: bucketLabel(s.start, bucket), i }))
        .filter((l) => (series.length - 1 - l.i) % every === 0);
};

// ---------------------------------------------------------------------------------------------------------
// Resources: LLM tokens, pipelines, S3

export const formatTokens = (n: number): string => {
    if (n >= 1e9) return `${(n / 1e9).toFixed(n >= 1e10 ? 0 : 1)}B`;
    if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M`;
    if (n >= 1e3) return `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}k`;
    return String(Math.round(n));
};

export const formatBytes = (bytes: number): string => {
    if (!bytes) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
    const value = bytes / 1024 ** i;
    return `${value >= 10 || i === 0 ? Math.round(value) : value.toFixed(1)} ${units[i]}`;
};

// the part of a monthly limit used (null: no limit) and its tone (warning from the organization's warning percent)
export const tokenUse = (tokens: number, limit: number, warningPercent = 80): { fraction: number | null; tone: OverviewTone } => {
    if (!limit) return { fraction: null, tone: "info" };
    const fraction = tokens / limit;
    return { fraction, tone: fraction >= 1 ? "danger" : fraction * 100 >= (warningPercent || 80) ? "warning" : "ok" };
};

// The live status of the pipelines (they say it every second on state2sim while they run): silent this long, they
// do not run (stopped, deleted, or their replica is down)
export const PIPELINE_SILENT_MS = 15_000;

export interface PipelineSeen {
    status: string;
    at: number;
}

export type PipelineCounts = { running: number; error: number; notRunning: number; waiting: number; total: number };

// how the pipelines of a list are now: running, in error, not running (silent or stopped), or still waiting for their
// first status (just opened)
export const pipelineCounts = (
    subjects: { digitalTwinId: number }[],
    seen: Record<number, PipelineSeen>,
    now: number,
    since: number,
): PipelineCounts => {
    const c: PipelineCounts = { running: 0, error: 0, notRunning: 0, waiting: 0, total: subjects.length };
    for (const s of subjects) {
        const status = seen[s.digitalTwinId];
        if (status && now - status.at <= PIPELINE_SILENT_MS) {
            const v = status.status.toLowerCase();
            if (v === "running") c.running++;
            else if (v === "error") c.error++;
            else c.notRunning++;
        } else if (!status && now - since < PIPELINE_SILENT_MS) c.waiting++;
        else c.notRunning++;
    }
    return c;
};

export const pipelinesTone = (c: PipelineCounts): OverviewTone =>
    c.total === 0 ? "muted" : c.error > 0 ? "danger" : c.waiting > 0 ? "muted" : c.running === c.total ? "ok" : "warning";

export const pipelinesText = (c: PipelineCounts): string => {
    if (c.total === 0) return "None";
    if (c.waiting === c.total) return "…";
    const parts = [`${c.running}/${c.total} running`];
    if (c.error) parts.push(`${c.error} error`);
    return parts.join(" · ");
};

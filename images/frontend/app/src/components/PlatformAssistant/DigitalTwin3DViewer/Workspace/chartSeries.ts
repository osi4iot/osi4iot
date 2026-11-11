// Chart panels of the Viewer page: the fields of the asset's sensors that can be charted, the ranges of time,
// and the ECharts options built from the aggregated series of admin_api (/time_series: mean, min and max of
// each bucket of time). Pure functions, so they are easy to test.
import { toMeasurements } from "../../../../tools/measurements";
import { ChartRange, ChartSeriesRef, seriesKey } from "./workspaceLayout";

export interface ChartRangeInfo {
    label: string;
    ms: number;
    // how often the chart asks again for its data
    refreshMs: number;
}

export const CHART_RANGE_INFO: Record<ChartRange, ChartRangeInfo> = {
    "15m": { label: "15 min", ms: 15 * 60_000, refreshMs: 5_000 },
    "1h": { label: "1 h", ms: 60 * 60_000, refreshMs: 10_000 },
    "6h": { label: "6 h", ms: 6 * 3_600_000, refreshMs: 30_000 },
    "24h": { label: "24 h", ms: 24 * 3_600_000, refreshMs: 60_000 },
    "7d": { label: "7 d", ms: 7 * 86_400_000, refreshMs: 300_000 },
    "30d": { label: "30 d", ms: 30 * 86_400_000, refreshMs: 600_000 },
};

export interface ChartSensor {
    id: number;
    assetId: number;
    sensorRef: string;
    sensorTypeId: number;
    description: string;
    measurements: unknown;
}

export interface ChartSensorType {
    id: number;
    defaultMeasurements: unknown;
}

// a field that can be a series: everything a chart needs to show and ask for it
export interface ChartSeriesOption extends ChartSeriesRef {
    key: string;
    sensorId: number;
    sensorDescription: string;
    label: string;
    units: string;
}

// The fields of the asset's sensors (their measurements, or those of their type); an array field gives one
// option per item of its label ("Ax,Ay,Az")
export const chartSeriesOptions = (
    sensors: ChartSensor[],
    sensorTypes: ChartSensorType[],
    assetId: number | undefined,
): ChartSeriesOption[] => {
    const options: ChartSeriesOption[] = [];
    for (const sensor of sensors) {
        if (assetId !== undefined && sensor.assetId !== assetId) continue;
        let measurements = toMeasurements(sensor.measurements);
        if (Object.keys(measurements).length === 0) {
            const type = sensorTypes.find((t) => t.id === sensor.sensorTypeId);
            measurements = toMeasurements(type?.defaultMeasurements);
        }
        for (const [field, m] of Object.entries(measurements)) {
            const base = { sensor: sensor.sensorRef, sensorId: sensor.id, sensorDescription: sensor.description, units: m.units };
            if (m.type === "array") {
                m.label.split(",").forEach((label, index) => {
                    const ref = { sensor: sensor.sensorRef, field, index };
                    options.push({ ...base, ...ref, key: seriesKey(ref), label: label.trim() || `${field}[${index}]` });
                });
            } else {
                const ref = { sensor: sensor.sensorRef, field };
                options.push({ ...base, ...ref, key: seriesKey(ref), label: m.label });
            }
        }
    }
    return options;
};

// The series of a panel that still exist (a sensor may have been removed): what to ask admin_api for
export const resolveSeries = (series: ChartSeriesRef[], options: ChartSeriesOption[]) => {
    const byKey = new Map(options.map((o) => [o.key, o]));
    const found: ChartSeriesOption[] = [];
    const missing: ChartSeriesRef[] = [];
    for (const s of series) {
        const option = byKey.get(seriesKey(s));
        if (option) found.push(option);
        else missing.push(s);
    }
    return { found, missing };
};

export const defaultChartTitle = (series: ChartSeriesOption[]): string => {
    if (series.length === 0) return "Chart";
    const labels = series.map((s) => s.label);
    const text = labels.length > 3 ? `${labels.slice(0, 3).join(", ")}…` : labels.join(", ");
    return text.slice(0, 80);
};

// --- the answer of admin_api -----------------------------------------------------------------------------

export type SeriesPoint = [number, number | null, number | null, number | null, number, ...(number | null)[]];

export interface TimeSeriesResponse {
    from: string;
    to: string;
    bucketSeconds?: number;
    // a point per interval: [t, mean, min, max, count, sum, last, first]
    series: {
        sensorId: number;
        field: string;
        index?: number;
        label: string;
        units: string;
        sensor: string;
        points: SeriesPoint[];
        // the Histogram panel: [start of the bin, count]
        bins?: [number, number][];
        count?: number;
    }[];
    histogram?: { min: number; max: number; size: number; offset: number };
}

// colours of the series (the same order as Grafana's classic palette, readable on the dark panels)
export const SERIES_COLORS = ["#5794f2", "#ff9830", "#73bf69", "#f2cc0c", "#b877d9", "#ff7383", "#8ab8ff", "#56a64b"];

export const formatBucket = (seconds: number): string => {
    if (seconds < 60) return `${seconds} s`;
    if (seconds < 3600) return `${seconds / 60} min`;
    if (seconds < 86400) return `${seconds / 3600} h`;
    return `${seconds / 86400} d`;
};

const formatValue = (value: number | null) => {
    if (value === null || !Number.isFinite(value)) return "–";
    const abs = Math.abs(value);
    if (abs !== 0 && (abs >= 1e6 || abs < 1e-3)) return value.toExponential(3);
    return Number(value.toPrecision(5)).toString();
};

const escapeHtml = (text: string) =>
    text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

// Gaps: no point is drawn across a bucket without data that lasts more than this many buckets
const GAP_BUCKETS = 3;

// [t, mean] with a null between points far apart, so the line breaks where there was no data
export const lineData = (points: SeriesPoint[], bucketSeconds: number): [number, number | null][] => {
    const result: [number, number | null][] = [];
    const gap = bucketSeconds * 1000 * GAP_BUCKETS;
    let previous: number | null = null;
    for (const [t, avg] of points) {
        if (previous !== null && t - previous > gap) result.push([previous + bucketSeconds * 1000, null]);
        result.push([t, avg]);
        previous = t;
    }
    return result;
};

// The ECharts options of a chart: a line per series (the mean of each bucket), the tooltip with mean, min and
// max; one Y axis per unit (two at most, the others share the second one)
export const buildChartOption = (data: TimeSeriesResponse, now = Date.now()) => {
    const units = Array.from(new Set(data.series.map((s) => s.units)));
    const axisOf = (u: string) => Math.min(1, units.indexOf(u));
    const byName = new Map<string, TimeSeriesResponse["series"][number]>();
    const series = data.series.map((s, i) => {
        const name = data.series.filter((o) => o.label === s.label).length > 1 ? `${s.label} · ${s.sensor}` : s.label;
        byName.set(name, s);
        return {
            name,
            type: "line" as const,
            yAxisIndex: axisOf(s.units),
            showSymbol: s.points.length <= 2,
            symbolSize: 5,
            sampling: "lttb" as const,
            connectNulls: false,
            lineStyle: { width: 1.6 },
            color: SERIES_COLORS[i % SERIES_COLORS.length],
            emphasis: { disabled: true },
            data: lineData(s.points, data.bucketSeconds ?? 10),
        };
    });
    const axisLabel = { color: "#9aa1aa", fontSize: 11 };
    const splitLine = { lineStyle: { color: "#22272d" } };
    const yAxis = units.slice(0, 2).map((u, i) => ({
        type: "value" as const,
        name: units.length > 2 && i === 1 ? units.slice(1).join(" · ") : u === "-" ? "" : u,
        nameGap: 12,
        nameTextStyle: { color: "#9aa1aa", fontSize: 11, align: i === 0 ? ("left" as const) : ("right" as const) },
        scale: true,
        axisLabel,
        splitLine: i === 0 ? splitLine : { show: false },
    }));
    return {
        backgroundColor: "transparent",
        animation: false,
        grid: { left: 8, right: 12, top: 50, bottom: 8, containLabel: true },
        legend: {
            type: "scroll" as const,
            top: 0,
            left: 0,
            right: 0,
            textStyle: { color: "#c7cbd1", fontSize: 12 },
            pageTextStyle: { color: "#9aa1aa" },
            itemHeight: 8,
            icon: "roundRect",
        },
        tooltip: {
            trigger: "axis" as const,
            backgroundColor: "#1b1e22",
            borderColor: "#2c3137",
            textStyle: { color: "#e6e8eb", fontSize: 12 },
            formatter: (params: unknown) => {
                const list = (Array.isArray(params) ? params : [params]) as {
                    seriesName: string;
                    color: string;
                    value: [number, number | null];
                }[];
                if (!list.length) return "";
                const t = list[0].value[0];
                const rows = list
                    .filter((p) => p.value[1] !== null)
                    .map((p) => {
                        const s = byName.get(p.seriesName);
                        const point = s?.points.find((q) => q[0] === p.value[0]);
                        const range = point && point[4] > 1 ? ` <span style="color:#9aa1aa">(${formatValue(point[2])} … ${formatValue(point[3])})</span>` : "";
                        const u = s && s.units !== "-" ? ` ${escapeHtml(s.units)}` : "";
                        return `<span style="color:${p.color}">●</span> ${escapeHtml(p.seriesName)}: <b>${formatValue(p.value[1])}</b>${u}${range}`;
                    });
                return [`<div style="color:#9aa1aa">${new Date(t).toLocaleString()}</div>`, ...rows].join("<br/>");
            },
        },
        xAxis: {
            type: "time" as const,
            min: Date.parse(data.from),
            max: Math.min(Date.parse(data.to), now),
            axisLabel: { ...axisLabel, hideOverlap: true },
            axisLine: { lineStyle: { color: "#2c3137" } },
            splitLine: { show: false },
        },
        yAxis: yAxis.length ? yAxis : [{ type: "value" as const, axisLabel, splitLine }],
        series,
    };
};

export const hasPoints = (data: TimeSeriesResponse | null) => !!data && data.series.some((s) => s.points.length > 0);

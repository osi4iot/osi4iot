// The ECharts options of the visualizations that ECharts draws (Time series, Bar chart, Gauge) from the
// Grafana-named settings of the panel. The legend is drawn apart (HTML: list or table with calculations, as
// Grafana), so ECharts draws none. Pure functions, so they are easy to test.
import {
    ChartSettings,
    DrawSeries,
    Threshold,
    displayValue,
    formatValue,
    formatWithUnit,
    getPath,
    reduceBuckets,
    resolveColor,
    sortedSteps,
    thresholdColor,
} from "./chartConfig";

const TEXT = "#9aa1aa";
const GRID_LINE = "#22272d";

const escapeHtml = (text: string) =>
    text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const hexToRgba = (hex: string, alpha: number) => {
    const h = hex.replace("#", "");
    const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h.slice(0, 6);
    const n = parseInt(full, 16);
    if (Number.isNaN(n)) return hex;
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
};

// [t, value] with a null after a gap of more than 3 buckets, so the line breaks there (unless spanNulls)
export const withGaps = (values: [number, number | null][], bucketSeconds: number, spanNulls: boolean): [number, number | null][] => {
    const result: [number, number | null][] = [];
    const gap = bucketSeconds * 1000 * 3;
    let previous: number | null = null;
    for (const [t, v] of values) {
        if (spanNulls && v === null) continue;
        if (!spanNulls && previous !== null && t - previous > gap) result.push([previous + bucketSeconds * 1000, null]);
        result.push([t, v]);
        previous = t;
    }
    return result;
};

const steps = (settings: ChartSettings): Threshold[] => sortedSteps(settings.fieldConfig.defaults.thresholds?.steps ?? []);

// thresholds as lines and/or bands (markLine / markArea of the first visible series)
const thresholdMarks = (settings: ChartSettings, mode: string, extent: [number, number], horizontal = false) => {
    if (!mode || mode === "off") return {};
    const all = steps(settings);
    const [lo, hi] = extent;
    // only the lines inside the data, so they do not stretch the axis
    const valued = (all.filter((s) => s.value !== null) as { value: number; color: string }[]).filter((s) => s.value >= lo && s.value <= hi);
    const axis = horizontal ? "xAxis" : "yAxis";
    const marks: Record<string, unknown> = {};
    if (mode.includes("line") || mode === "dashed") {
        marks.markLine = {
            silent: true,
            symbol: "none",
            label: { show: false },
            data: valued.map((s) => ({ [axis]: s.value, lineStyle: { color: resolveColor(s.color), type: mode === "dashed" || mode === "line+area" ? "dashed" : "solid", width: 1.5 } })),
        };
    }
    if (mode.includes("area")) {
        const bands = all
            .map((s, i) => {
                const from = Math.max(lo, s.value ?? lo);
                const to = Math.min(hi, all[i + 1]?.value ?? hi);
                return { from, to, color: s.color };
            })
            .filter((b) => b.to > b.from)
            .map((b) => [{ [axis]: b.from, itemStyle: { color: hexToRgba(resolveColor(b.color), 0.12) } }, { [axis]: b.to }]);
        marks.markArea = { silent: true, data: bands };
    }
    return marks;
};

const timeTooltip = (settings: ChartSettings, series: DrawSeries[]) => {
    const mode = String(getPath(settings.options, "tooltip.mode") ?? "single");
    const sort = String(getPath(settings.options, "tooltip.sort") ?? "none");
    const decimals = settings.fieldConfig.defaults.decimals;
    if (mode === "none" || mode === "hidden") return { show: false };
    return {
        show: true,
        trigger: mode === "multi" ? ("axis" as const) : ("item" as const),
        axisPointer: { type: "line" as const, lineStyle: { color: "#5c636b" } },
        backgroundColor: "#1b1e22",
        borderColor: "#2c3137",
        textStyle: { color: "#e6e8eb", fontSize: 12 },
        formatter: (params: unknown) => {
            let list = (Array.isArray(params) ? params : [params]) as { seriesName: string; color: string; value: [number | string, number | null]; seriesIndex: number }[];
            list = list.filter((p) => p.value && p.value[1] !== null && p.value[1] !== undefined && !series.find((x) => x.name === p.seriesName)?.hideFromTooltip);
            if (!list.length) return "";
            if (sort === "asc") list.sort((a, b) => (a.value[1] as number) - (b.value[1] as number));
            if (sort === "desc") list.sort((a, b) => (b.value[1] as number) - (a.value[1] as number));
            const t = list[0].value[0];
            const head = typeof t === "number" ? new Date(t).toLocaleString() : String(t);
            const rows = list.map((p) => {
                const s = series.find((x) => x.name === p.seriesName);
                return `<span style="color:${p.color}">●</span> ${escapeHtml(p.seriesName)}: <b>${escapeHtml(formatWithUnit(p.value[1], s?.unit, s?.field.decimals ?? decimals))}</b>`;
            });
            return [`<div style="color:${TEXT}">${escapeHtml(head)}</div>`, ...rows].join("<br/>");
        },
    };
};

// a tick of an axis: the value without trailing zeros (0.6 m/s², not 0.600 m/s²), and its unit
export const axisText = (value: number, unit: string | undefined, decimals?: number) => {
    const f = formatValue(value, unit, decimals);
    const text = decimals === undefined && /^-?\d+\.\d+$/.test(f.text) ? String(Number(f.text)) : f.text;
    if (!f.suffix) return text;
    return f.suffix === "%" || f.suffix === "°" ? `${text}${f.suffix}` : `${text} ${f.suffix}`;
};

const yAxes = (settings: ChartSettings, series: DrawSeries[], horizontal = false) => {
    const d = settings.fieldConfig.defaults;
    const c = d.custom ?? {};
    const placement = String(c.axisPlacement ?? "auto");
    const log = getPath(c, "scaleDistribution.type") === "log";
    const softMin = typeof c.axisSoftMin === "number" ? c.axisSoftMin : undefined;
    const softMax = typeof c.axisSoftMax === "number" ? c.axisSoftMax : undefined;
    const label = typeof c.axisLabel === "string" ? c.axisLabel : "";
    const hasRight = series.some((s) => s.axis === "right" && !s.hidden);
    const unitLeft = series.find((s) => s.axis === "left")?.unit ?? series[0]?.unit;
    const unitRight = series.find((s) => s.axis === "right")?.unit ?? unitLeft;
    const make = (position: "left" | "right", unit: string | undefined, index: number) => ({
        type: log ? ("log" as const) : ("value" as const),
        position: horizontal ? (position === "left" ? "bottom" : "top") : position,
        show: placement !== "hidden",
        name: index === 0 ? label : "",
        nameLocation: "middle" as const,
        nameGap: 46,
        nameTextStyle: { color: TEXT, fontSize: 12 },
        scale: true,
        min: d.min ?? (softMin !== undefined ? (v: { min: number }) => Math.min(v.min, softMin) : undefined),
        max: d.max ?? (softMax !== undefined ? (v: { max: number }) => Math.max(v.max, softMax) : undefined),
        axisLabel: { color: TEXT, fontSize: 11, formatter: (v: number) => axisText(v, unit, d.decimals) },
        splitLine: index === 0 ? { lineStyle: { color: GRID_LINE } } : { show: false },
        axisLine: { show: false },
    });
    const side = placement === "right" ? "right" : "left";
    const axes = [make(side, unitLeft, 0)];
    if (hasRight) axes.push(make(side === "left" ? "right" : "left", unitRight, 1));
    return axes;
};

// --- Time series --------------------------------------------------------------------------------------------

export interface TimeseriesInput {
    series: DrawSeries[];
    settings: ChartSettings;
    from: number;
    to: number;
    bucketSeconds: number;
    // series hidden from the legend (click on its name)
    hidden?: Set<string>;
}

export const timeseriesOption = ({ series, settings, from, to, bucketSeconds, hidden }: TimeseriesInput) => {
    const c = settings.fieldConfig.defaults.custom ?? {};
    const stacking = String(getPath(c, "stacking.mode") ?? "none");
    const thrMode = String(getPath(c, "thresholdsStyle.mode") ?? "off");
    const visible = series.filter((s) => !s.hidden && !hidden?.has(s.key));
    const rightIndex = series.some((s) => s.axis === "right" && !s.hidden) ? 1 : 0;
    const totals = stacking === "percent" ? totalsByTime(visible) : null;

    const out = visible.map((s, i) => {
        // the series' own graph styles (overrides), else the panel's
        const sc = { ...c, ...(s.field.custom ?? {}) };
        const drawStyle = String(sc.drawStyle ?? "line");
        const interpolation = String(sc.lineInterpolation ?? "linear");
        const lineWidth = Number(sc.lineWidth ?? 1);
        const fillOpacity = Number(sc.fillOpacity ?? 0) / 100;
        const gradient = String(sc.gradientMode ?? "none");
        const showPoints = String(sc.showPoints ?? "auto");
        const pointSize = Number(sc.pointSize ?? 5);
        const spanNulls = sc.spanNulls === true;
        const lineStyle = String(getPath(sc, "lineStyle.fill") ?? "solid");
        let data = withGaps(s.values, bucketSeconds, spanNulls);
        if (totals) data = data.map(([t, v]) => [t, v === null ? null : (100 * v) / (totals.get(t) || 1)]);
        const areaColor =
            gradient === "opacity"
                ? { type: "linear", x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: hexToRgba(s.color, Math.max(fillOpacity, 0.25)) }, { offset: 1, color: hexToRgba(s.color, 0) }] }
                : gradient === "hue"
                  ? { type: "linear", x: 0, y: 0, x2: 1, y2: 0, colorStops: [{ offset: 0, color: hexToRgba(s.color, fillOpacity * 0.4) }, { offset: 1, color: hexToRgba(s.color, fillOpacity) }] }
                  : hexToRgba(s.color, fillOpacity);
        const base = {
            name: s.name,
            yAxisIndex: s.axis === "right" ? rightIndex : 0,
            color: s.color,
            data,
            stack: stacking !== "none" ? (s.axis === "right" ? "right" : "left") : undefined,
            emphasis: { disabled: true },
            ...(i === 0 ? thresholdMarks(settings, thrMode, extentOf(visible)) : {}),
        };
        if (drawStyle === "bars") {
            return { ...base, type: "bar" as const, barMaxWidth: 24, itemStyle: { color: fillOpacity > 0 ? hexToRgba(s.color, Math.max(fillOpacity, 0.2)) : s.color } };
        }
        const pointsShown = drawStyle === "points" || showPoints === "always" || (showPoints === "auto" && data.filter((p) => p[1] !== null).length <= 2);
        return {
            ...base,
            type: drawStyle === "points" ? ("scatter" as const) : ("line" as const),
            smooth: interpolation === "smooth" ? 0.35 : false,
            step: interpolation === "stepBefore" ? "start" : interpolation === "stepAfter" ? "end" : false,
            connectNulls: spanNulls,
            showSymbol: pointsShown,
            symbol: "circle",
            symbolSize: drawStyle === "points" ? pointSize + 1 : pointSize,
            sampling: "lttb" as const,
            lineStyle: { width: lineWidth, type: lineStyle === "dash" ? "dashed" : lineStyle === "dot" ? "dotted" : "solid" },
            areaStyle: fillOpacity > 0 || gradient !== "none" ? { color: areaColor } : undefined,
        };
    });

    return {
        backgroundColor: "transparent",
        animation: false,
        grid: { left: 8, right: 12, top: 10, bottom: 6, containLabel: true },
        tooltip: timeTooltip(settings, series),
        xAxis: {
            type: "time" as const,
            min: from,
            max: to,
            axisLabel: { color: TEXT, fontSize: 11, hideOverlap: true },
            axisLine: { lineStyle: { color: "#2c3137" } },
            splitLine: { show: false },
        },
        yAxis: yAxes(settings, series),
        series: out,
    };
};

// the lowest and highest value drawn (a little beyond, so the bands reach the edges)
export const extentOf = (series: DrawSeries[]): [number, number] => {
    const values = series.flatMap((s) => s.values.map(([, v]) => v)).filter((v): v is number => v !== null && Number.isFinite(v));
    if (!values.length) return [0, 1];
    const lo = Math.min(...values);
    const hi = Math.max(...values);
    const pad = (hi - lo || Math.abs(hi) || 1) * 0.15;
    return [lo - pad, hi + pad];
};

const totalsByTime = (series: DrawSeries[]) => {
    const totals = new Map<number, number>();
    for (const s of series) for (const [t, v] of s.values) if (v !== null) totals.set(t, (totals.get(t) ?? 0) + Math.abs(v));
    return totals;
};

// --- Bar chart ----------------------------------------------------------------------------------------------

export const formatBucketLabel = (t: number, bucketSeconds: number) => {
    const d = new Date(t);
    const pad = (n: number) => String(n).padStart(2, "0");
    if (bucketSeconds >= 86400) return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
    if (bucketSeconds >= 60) return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

export const barchartOption = ({ series, settings, bucketSeconds, hidden }: TimeseriesInput) => {
    const o = settings.options;
    const c = settings.fieldConfig.defaults.custom ?? {};
    const d = settings.fieldConfig.defaults;
    const visible = series.filter((s) => !s.hidden && !hidden?.has(s.key));
    const times = Array.from(new Set(visible.flatMap((s) => s.values.map(([t]) => t)))).sort((a, b) => a - b);
    const categories = times.map((t) => formatBucketLabel(t, bucketSeconds));
    const horizontal = o.orientation === "horizontal";
    const stacking = String(o.stacking ?? "none");
    const showValue = String(o.showValue ?? "auto");
    const groupWidth = Number(o.groupWidth ?? 0.7);
    const barWidth = Number(o.barWidth ?? 0.97);
    const fillOpacity = Number(c.fillOpacity ?? 80) / 100;
    const totals = stacking === "percent" ? totalsByTime(visible) : null;
    const rotation = Number(o.xTickLabelRotation ?? 0);
    const catAxis = {
        type: "category" as const,
        data: categories,
        axisLabel: { color: TEXT, fontSize: 11, rotate: rotation, hideOverlap: true },
        axisLine: { lineStyle: { color: "#2c3137" } },
        axisTick: { show: false },
    };
    const valueAxes = yAxes(settings, series, horizontal);
    const thrMode = String(getPath(c, "thresholdsStyle.mode") ?? "off");
    const out = visible.map((s, i) => {
        const byTime = new Map(s.values);
        const data = times.map((t) => {
            const v = byTime.get(t) ?? null;
            return totals && v !== null ? (100 * v) / (totals.get(t) || 1) : v;
        });
        const show = showValue === "always" || (showValue === "auto" && times.length * visible.length <= 24);
        return {
            name: s.name,
            type: "bar" as const,
            data,
            stack: stacking !== "none" ? "all" : undefined,
            barCategoryGap: `${Math.round((1 - groupWidth) * 100)}%`,
            barGap: `${Math.round((1 - barWidth) * 100)}%`,
            itemStyle: { color: d.color?.mode === "thresholds" ? (p: { value: number }) => thresholdColor(p.value, d.thresholds, d.min, d.max) : hexToRgba(s.color, fillOpacity), borderColor: s.color, borderWidth: Number(c.lineWidth ?? 1) },
            label: { show, position: horizontal ? ("right" as const) : ("top" as const), color: "#c7cbd1", fontSize: 11, formatter: (p: { value: number }) => formatWithUnit(p.value, s.unit, d.decimals) },
            emphasis: { disabled: true },
            ...(i === 0 ? thresholdMarks(settings, thrMode, extentOf(visible), horizontal) : {}),
        };
    });
    return {
        backgroundColor: "transparent",
        animation: false,
        grid: { left: 8, right: 16, top: 16, bottom: 6, containLabel: true },
        tooltip: { ...timeTooltip(settings, series), trigger: "axis" as const, axisPointer: { type: "shadow" as const } },
        xAxis: horizontal ? valueAxes : catAxis,
        yAxis: horizontal ? { ...catAxis, inverse: true } : valueAxes,
        series: out,
    };
};

// --- Gauge --------------------------------------------------------------------------------------------------

export interface GaugeInput {
    series: DrawSeries[];
    settings: ChartSettings;
    width: number;
    height: number;
}

// min…max of a gauge: the field's, else 0 (or the lowest value) to the highest threshold or value, rounded
export const gaugeRange = (values: (number | null)[], settings: ChartSettings): [number, number] => {
    const d = settings.fieldConfig.defaults;
    const nums = values.filter((v): v is number => v !== null && Number.isFinite(v));
    const thr = steps(settings).filter((s) => s.value !== null).map((s) => s.value as number);
    const lo = d.min ?? Math.min(0, ...nums);
    let hi = d.max ?? Math.max(...nums, ...(d.thresholds?.mode === "percentage" ? [] : thr), lo + 1);
    if (d.max === undefined) {
        const mag = Math.pow(10, Math.floor(Math.log10(Math.abs(hi) || 1)));
        hi = Math.ceil((hi * 1.1) / mag) * mag;
    }
    return [lo, hi];
};

export const gaugeOption = ({ series, settings, width, height }: GaugeInput) => {
    const o = settings.options;
    const d = settings.fieldConfig.defaults;
    const calc = String((getPath(o, "reduceOptions.calcs") as string[] | undefined)?.[0] ?? "lastNotNull");
    const visible = series.filter((s) => !s.hidden);
    const values = visible.map((s) => reduceBuckets(s.buckets, calc));
    const [min, max] = gaugeRange(values, settings);
    const markers = o.showThresholdMarkers !== false;
    const labels = o.showThresholdLabels === true;
    const n = Math.max(1, visible.length);
    const horizontal = o.orientation === "horizontal" || (o.orientation !== "vertical" && width >= height);
    const cols = horizontal ? n : 1;
    const rows = horizontal ? 1 : n;
    const cellW = width / cols;
    const cellH = height / rows;
    const radius = Math.max(20, Math.min(cellW, cellH * 1.15) / 2 - 10);
    const span = max - min || 1;
    const stops = steps(settings).map((s, i, all) => {
        const next = all[i + 1]?.value;
        const toValue = next === undefined || next === null ? max : d.thresholds?.mode === "percentage" ? min + (next / 100) * span : next;
        return [Math.max(0, Math.min(1, (toValue - min) / span)), resolveColor(s.color)] as [number, string];
    });
    return {
        backgroundColor: "transparent",
        animation: false,
        series: visible.map((s, i) => {
            const shown = displayValue(values[i], s.unit, settings, s.field);
            const col = horizontal ? i : 0;
            const row = horizontal ? 0 : i;
            return {
                type: "gauge" as const,
                name: s.name,
                center: [`${((col + 0.5) / cols) * 100}%`, `${((row + 0.56) / rows) * 100}%`],
                radius,
                min,
                max,
                startAngle: 225,
                endAngle: -45,
                progress: { show: true, width: Math.max(6, radius * 0.16), itemStyle: { color: shown.color } },
                axisLine: {
                    lineStyle: {
                        width: markers ? Math.max(3, radius * 0.05) : Math.max(6, radius * 0.16),
                        color: markers ? stops : [[1, "#22272d"]],
                    },
                },
                pointer: { show: false },
                axisTick: { show: false },
                splitLine: { show: false },
                axisLabel: labels
                    ? {
                          show: true,
                          color: TEXT,
                          fontSize: 10,
                          distance: -radius * 0.05 - 14,
                          formatter: (v: number) => {
                              const isStep = steps(settings).some((st) => st.value !== null && Math.abs((st.value as number) - v) < span / 200);
                              return isStep || v === min || v === max ? formatWithUnit(v, undefined, d.decimals) : "";
                          },
                      }
                    : { show: false },
                splitNumber: labels ? 100 : 10,
                anchor: { show: false },
                title: { show: true, offsetCenter: [0, `${radius > 60 ? 62 : 70}%`], color: "#c7cbd1", fontSize: Math.max(11, Math.min(16, radius / 6)) },
                detail: {
                    valueAnimation: false,
                    offsetCenter: [0, "4%"],
                    fontSize: Math.max(14, Math.min(48, radius / 2.6)),
                    fontWeight: 600,
                    color: shown.color,
                    formatter: () => (shown.suffix ? `${shown.text} {u|${shown.suffix}}` : shown.text),
                    rich: { u: { fontSize: Math.max(10, Math.min(20, radius / 6)), color: TEXT, padding: [0, 0, 0, 2] } },
                },
                data: [{ value: values[i] ?? min, name: visible.length > 1 ? s.name : "" }],
            };
        }),
    };
};

// --- Pie chart ----------------------------------------------------------------------------------------------

export const pieOption = ({ series, settings, hidden }: { series: DrawSeries[]; settings: ChartSettings; hidden?: Set<string> }) => {
    const o = settings.options;
    const calc = String((getPath(o, "reduceOptions.calcs") as string[] | undefined)?.[0] ?? "lastNotNull");
    const visible = series.filter((s) => !s.hidden && !hidden?.has(s.key));
    const values = visible.map((s) => reduceBuckets(s.buckets, calc));
    const total = values.reduce<number>((a, v) => a + Math.abs(v ?? 0), 0);
    const labels = (o.displayLabels as string[] | undefined) ?? [];
    const donut = o.pieType === "donut";
    const tooltipMode = String(getPath(o, "tooltip.mode") ?? "single");
    return {
        backgroundColor: "transparent",
        animation: false,
        tooltip: {
            show: tooltipMode !== "none",
            trigger: "item" as const,
            backgroundColor: "#1b1e22",
            borderColor: "#2c3137",
            textStyle: { color: "#e6e8eb", fontSize: 12 },
            formatter: (p: { name: string; value: number; percent: number; color: string; dataIndex: number }) => {
                const s = visible[p.dataIndex];
                const shown = displayValue(p.value, s?.unit ?? "", settings, s?.field);
                return `<span style="color:${p.color}">●</span> ${escapeHtml(p.name)}: <b>${escapeHtml(`${shown.text}${shown.suffix ? ` ${shown.suffix}` : ""}`)}</b> (${p.percent.toFixed(1)}%)`;
            },
        },
        series: [
            {
                type: "pie" as const,
                radius: donut ? ["45%", "72%"] : [0, "72%"],
                center: ["50%", "52%"],
                avoidLabelOverlap: true,
                itemStyle: { borderColor: "#141619", borderWidth: 1 },
                label: {
                    show: labels.length > 0,
                    color: "#c7cbd1",
                    fontSize: 12,
                    formatter: (p: { name: string; value: number; dataIndex: number }) => {
                        const s = visible[p.dataIndex];
                        const shown = displayValue(p.value, s?.unit ?? "", settings, s?.field);
                        const parts: string[] = [];
                        if (labels.includes("name")) parts.push(p.name);
                        if (labels.includes("value")) parts.push(`${shown.text}${shown.suffix ? ` ${shown.suffix}` : ""}`);
                        if (labels.includes("percent")) parts.push(`${total ? ((100 * Math.abs(p.value)) / total).toFixed(0) : 0}%`);
                        return parts.join("\n");
                    },
                },
                labelLine: { show: labels.length > 0 },
                emphasis: { scale: true, scaleSize: 4 },
                data: visible.map((s, i) => ({ name: s.name, value: values[i] ?? 0, itemStyle: { color: s.color } })),
            },
        ],
    };
};

// --- Histogram ----------------------------------------------------------------------------------------------

export interface HistogramInput {
    series: DrawSeries[];
    settings: ChartSettings;
    size: number;
    hidden?: Set<string>;
}

// the bins of all the series (the same edges), with their counts; "combine" adds the series into one
export const histogramOption = ({ series, settings, size, hidden }: HistogramInput) => {
    const o = settings.options;
    const c = settings.fieldConfig.defaults.custom ?? {};
    const visible = series.filter((s) => !s.hidden && !hidden?.has(s.key));
    const combine = o.combine === true;
    const starts = Array.from(new Set(visible.flatMap((s) => (s.bins ?? []).map(([start]) => start)))).sort((a, b) => a - b);
    const fillOpacity = Number(c.fillOpacity ?? 80) / 100;
    const unit = visible[0]?.unit;
    const counts = (s: DrawSeries) => {
        const byStart = new Map(s.bins ?? []);
        return starts.map((start) => [start + size / 2, byStart.get(start) ?? 0] as [number, number]);
    };
    const out = combine
        ? [
              {
                  name: "Count",
                  type: "bar" as const,
                  barWidth: "99%",
                  data: starts.map((start) => [start + size / 2, visible.reduce((a, s) => a + (new Map(s.bins ?? []).get(start) ?? 0), 0)]),
                  itemStyle: { color: hexToRgba(visible[0]?.color ?? "#73BF69", fillOpacity), borderColor: visible[0]?.color, borderWidth: Number(c.lineWidth ?? 1) },
              },
          ]
        : visible.map((s) => ({
              name: s.name,
              type: "bar" as const,
              barGap: "-100%",
              barWidth: "99%",
              data: counts(s),
              itemStyle: { color: hexToRgba(s.color, fillOpacity * (visible.length > 1 ? 0.6 : 1)), borderColor: s.color, borderWidth: Number(c.lineWidth ?? 1) },
          }));
    const lo = starts.length ? starts[0] : 0;
    const hi = starts.length ? starts[starts.length - 1] + size : 1;
    return {
        backgroundColor: "transparent",
        animation: false,
        grid: { left: 8, right: 12, top: 10, bottom: 6, containLabel: true },
        tooltip: {
            trigger: "axis" as const,
            axisPointer: { type: "shadow" as const },
            backgroundColor: "#1b1e22",
            borderColor: "#2c3137",
            textStyle: { color: "#e6e8eb", fontSize: 12 },
            formatter: (params: unknown) => {
                const list = (Array.isArray(params) ? params : [params]) as { seriesName: string; color: string; value: [number, number] }[];
                if (!list.length) return "";
                const start = list[0].value[0] - size / 2;
                const head = `${axisText(start, unit)} … ${axisText(start + size, unit)}`;
                return [`<div style="color:${TEXT}">${escapeHtml(head)}</div>`, ...list.map((p) => `<span style="color:${p.color}">●</span> ${escapeHtml(p.seriesName)}: <b>${p.value[1]}</b>`)].join("<br/>");
            },
        },
        xAxis: {
            type: "value" as const,
            min: lo,
            max: hi,
            axisLabel: { color: TEXT, fontSize: 11, hideOverlap: true, formatter: (v: number) => axisText(v, unit) },
            axisLine: { lineStyle: { color: "#2c3137" } },
            splitLine: { show: false },
        },
        yAxis: { type: "value" as const, name: "", axisLabel: { color: TEXT, fontSize: 11 }, splitLine: { lineStyle: { color: GRID_LINE } } },
        series: out,
    };
};

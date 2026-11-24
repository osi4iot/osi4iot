// The Data chart panels of the Viewer page: the data of ONE JSON — the last message of a topic (dtm2sim, sim2dtm…:
// what a pipeline computed, as a Power Spectral Density freq[] / amplitude[]), the state of the twin's asset
// (iot_data.assetState.state) or a formula — drawn as
//
//   xy        2D series: lines, points, bars or areas; each series a pair of fields (x optional: 0, 1, 2…), each
//             from its own source; a field may take a field of every item of a list (points.*.f)
//   heatmap   a grid [[z, …], …] (or { z, x, y }) or a formula z = f(x, y), as a map of colours
//   surface   the same, as a 3D surface (what the 3D Surface panels were: they are Data charts of this kind now)
//   points3d  3D points or lines: three fields x, y, z
//
//   (2D charts can also draw formulas y = f(x) with parameters, fixed or live, beside the data)
// Not a time series: that is the Time series chart (the "chart" panels), of the values stored in time. The time of
// the data shown is that of its message, or of the asset's state.
//
// admin_api (viewerLayoutValidation.ts, validateDataChart) checks the same settings.
import { LiveMessage } from "../liveValues";
import {
    SurfaceOptions,
    SurfaceParam,
    defaultSurface,
    niceRange,
    roundForAxis,
    sanitizeSurface,
    SURFACE_PALETTES,
    SurfaceGrid,
    surfaceParamValues,
    surfaceTopics,
    LiveRange,
    liveRangeOf,
    sanitizeLiveRange,
} from "../surface/surfacePanel";
import { compileSurfaceExpression } from "../surface/surfaceExpression";

// the source of the state of the twin's asset (not a topic: a topic's reference never starts with @)
export const ASSET_STATE_SOURCE = "@assetState";
// the source of a series of a formula y = f(x)
export const FORMULA_SOURCE = "@formula";
export const DATA_FORMULA_POINTS_MAX = 2000;
export const DATA_FORMULA_POINTS_DEFAULT = 200;
export const DATA_CHART_KINDS = ["xy", "heatmap", "surface", "points3d"] as const;
export type DataChartKind = (typeof DATA_CHART_KINDS)[number];
export const DATA_CHART_STYLES = ["line", "scatter", "bar", "area"] as const;
export type DataChartStyle = (typeof DATA_CHART_STYLES)[number];
export const DATA_CHART_MAX_SERIES = 8;
// the most points of a series drawn (2D; 3D: DATA_CHART_MAX_POINTS_3D)
export const DATA_CHART_MAX_POINTS = 10000;
export const DATA_CHART_MAX_POINTS_3D = 5000;
export const DATA_CHART_LABEL_MAX = 40;

export const DATA_SOURCE = /^(@assetState|[A-Za-z0-9_.-]{1,60})$/;
export const DATA_PATH = /^([A-Za-z0-9_-]+|\*)(\.([A-Za-z0-9_-]+|\*)){0,15}$/;
const COLOR = /^#[0-9a-fA-F]{6}$/;

export const DATA_CHART_KIND_LABELS: Record<DataChartKind, string> = {
    xy: "2D chart",
    heatmap: "Heat map",
    surface: "3D surface",
    points3d: "3D points",
};

// a series of a formula y = f(x) (2D charts): its parameters fixed or live values (as those of a 3D surface), drawn
// over [xMin, xMax] at `points` points
export interface DataFormula {
    expression: string;
    params?: SurfaceParam[];
    xMin: number;
    xMax: number;
    // its range of x from a message ({xMin, xMax}), else its own
    range?: LiveRange;
    points?: number;
}

export interface DataSeries {
    // a topic, the asset's state, or FORMULA_SOURCE
    source: string;
    formula?: DataFormula;
    // fields of the data: x optional in 2D (the position: 0, 1, 2…); z only in 3D points
    x?: string;
    // all but the formulas
    y?: string;
    z?: string;
    name?: string;
    style?: DataChartStyle;
    color?: string;
}

export interface DataChartOptions {
    kind: DataChartKind;
    // heatmap and surface: a formula or a grid (surfacePanel.ts)
    surface?: SurfaceOptions;
    // xy and points3d
    series?: DataSeries[];
    xLabel?: string;
    yLabel?: string;
    zLabel?: string;
    xLog?: boolean;
    yLog?: boolean;
    xMin?: number;
    xMax?: number;
    yMin?: number;
    yMax?: number;
    legend?: boolean;
}

export const isGridKind = (kind: DataChartKind) => kind === "heatmap" || kind === "surface";

export const defaultDataChart = (kind: DataChartKind = "xy", source = "dtm2sim"): DataChartOptions =>
    isGridKind(kind)
        ? { kind, surface: defaultSurface() }
        : kind === "points3d"
          ? {
                kind,
                series: [
                    {
                        source,
                        x: "points.*.x",
                        y: "points.*.y",
                        z: "points.*.z",
                        style: "scatter",
                    },
                ],
                xLabel: "x",
                yLabel: "y",
                zLabel: "z",
            }
          : {
                kind,
                series: [{ source, x: "freq", y: "amplitude", style: "line" }],
                xLabel: "x",
                yLabel: "y",
                legend: true,
            };

// a 3D Surface panel of before as a Data chart
export const dataChartOfSurface = (surface: SurfaceOptions): DataChartOptions => ({ kind: "surface", surface });

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const label = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, DATA_CHART_LABEL_MAX) : undefined);

// The settings as they come (a saved layout, a file): the valid ones, or null
export const sanitizeDataChart = (raw: unknown): DataChartOptions | null => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const d = raw as Record<string, unknown>;
    if (!DATA_CHART_KINDS.includes(d.kind as DataChartKind)) return null;
    const kind = d.kind as DataChartKind;
    if (isGridKind(kind)) {
        const surface = sanitizeSurface(d.surface);
        return surface ? { kind, surface } : null;
    }
    const series: DataSeries[] = [];
    for (const item of Array.isArray(d.series) ? d.series.slice(0, DATA_CHART_MAX_SERIES) : []) {
        if (!item || typeof item !== "object") continue;
        const q = item as Record<string, unknown>;
        if (q.source === FORMULA_SOURCE) {
            const formula = kind === "xy" ? sanitizeFormula(q.formula) : null;
            if (!formula) continue;
            const s: DataSeries = { source: FORMULA_SOURCE, formula };
            const name = label(q.name);
            if (name) s.name = name;
            if (DATA_CHART_STYLES.includes(q.style as DataChartStyle)) s.style = q.style as DataChartStyle;
            if (typeof q.color === "string" && COLOR.test(q.color)) s.color = q.color;
            series.push(s);
            continue;
        }
        if (typeof q.source !== "string" || !DATA_SOURCE.test(q.source) || typeof q.y !== "string" || !DATA_PATH.test(q.y)) continue;
        const s: DataSeries = { source: q.source, y: q.y };
        if (typeof q.x === "string" && DATA_PATH.test(q.x)) s.x = q.x;
        if (typeof q.z === "string" && DATA_PATH.test(q.z)) s.z = q.z;
        if (kind === "points3d" && (!s.x || !s.z)) continue;
        const name = label(q.name);
        if (name) s.name = name;
        if (DATA_CHART_STYLES.includes(q.style as DataChartStyle)) s.style = q.style as DataChartStyle;
        if (typeof q.color === "string" && COLOR.test(q.color)) s.color = q.color;
        series.push(s);
    }
    if (series.length === 0) return null;
    const out: DataChartOptions = { kind, series };
    for (const key of ["xLabel", "yLabel", "zLabel"] as const) {
        const l = label(d[key]);
        if (l) out[key] = l;
    }
    for (const key of ["xLog", "yLog", "legend"] as const) if (typeof d[key] === "boolean") out[key] = d[key] as boolean;
    for (const [lo, hi] of [
        ["xMin", "xMax"],
        ["yMin", "yMax"],
    ] as const) {
        if (isNum(d[lo]) && isNum(d[hi]) && (d[lo] as number) < (d[hi] as number)) {
            out[lo] = d[lo] as number;
            out[hi] = d[hi] as number;
        }
    }
    return out;
};

// a formula series as it comes, made safe (its parameters as those of a surface)
const sanitizeFormula = (raw: unknown): DataFormula | null => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const f = raw as Record<string, unknown>;
    if (typeof f.expression !== "string" || !isNum(f.xMin) || !isNum(f.xMax) || f.xMin >= f.xMax) return null;
    const asSurface = sanitizeSurface({ mode: "function", expression: f.expression, params: f.params, xMin: f.xMin, xMax: f.xMax, yMin: 0, yMax: 1 });
    if (!asSurface) return null;
    const formula: DataFormula = { expression: asSurface.expression ?? "", xMin: f.xMin, xMax: f.xMax };
    if (asSurface.params?.length) formula.params = asSurface.params;
    const range = sanitizeLiveRange(f.range);
    if (range) formula.range = range;
    if (Number.isInteger(f.points) && (f.points as number) >= 2 && (f.points as number) <= DATA_FORMULA_POINTS_MAX) formula.points = f.points as number;
    return formula;
};

// The sources a chart follows: topics (and the asset's state)
export const dataChartSources = (data: DataChartOptions | undefined): string[] => {
    if (!data) return [];
    if (isGridKind(data.kind)) return surfaceTopics(data.surface);
    return Array.from(
        new Set(
            (data.series ?? []).flatMap((s) =>
                s.source === FORMULA_SOURCE
                    ? [...(s.formula?.params ?? []).flatMap((p) => (p.topicRef ? [p.topicRef] : [])), ...(s.formula?.range ? [s.formula.range.topicRef] : [])]
                    : [s.source],
            ),
        ),
    );
};

// The topics a chart follows (its sources but the asset's state): the NATS subjects to listen to
export const dataChartTopics = (data: DataChartOptions | undefined) => dataChartSources(data).filter((s) => s !== ASSET_STATE_SOURCE);

// ---------------------------------------------------------------------------------------------------------
// The values

// What is at a path: "*" takes the rest of the path in every item of a list (points.*.f: the f of each point)
export const valuesAt = (value: unknown, path: string[]): unknown => {
    let current: unknown = value;
    for (let i = 0; i < path.length; i++) {
        const key = path[i];
        if (key === "*") {
            if (!Array.isArray(current)) return undefined;
            const rest = path.slice(i + 1);
            return current.map((item) => valuesAt(item, rest));
        }
        if (current === null || typeof current !== "object") return undefined;
        current = (current as Record<string, unknown>)[key];
    }
    return current;
};

// The fields of some data to offer in an editor: the numbers and the lists of numbers by their path (freq), the
// lists of objects with "*" (points.*.x); at most `max`
export const dataFieldPaths = (payload: unknown, max = 200): string[] => {
    const out: string[] = [];
    const walk = (value: unknown, path: string[], depth: number) => {
        if (out.length >= max || depth > 6) return;
        if (Array.isArray(value)) {
            const first = value.find((v) => v !== null && v !== undefined);
            if (first !== null && typeof first === "object" && !Array.isArray(first)) walk(first, [...path, "*"], depth + 1);
            // a list of numbers, or a grid (a list of lists): the field itself
            else if (path.length) out.push(path.join("."));
        } else if (value !== null && typeof value === "object") {
            for (const [key, v] of Object.entries(value as Record<string, unknown>)) if (/^[A-Za-z0-9_-]+$/.test(key)) walk(v, [...path, key], depth + 1);
        } else if (path.length && (typeof value === "number" || typeof value === "boolean" || typeof value === "string")) out.push(path.join("."));
    };
    walk(payload, [], 0);
    return out;
};

const toNumber = (v: unknown) =>
    typeof v === "number" ? v : typeof v === "boolean" ? (v ? 1 : 0) : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;

// a list of numbers at a path (one number: a list of one), or why not
export const numbersAt = (payload: unknown, path: string): number[] | string => {
    const raw = valuesAt(payload, path.split("."));
    if (raw === undefined || raw === null) return `${path} is not in the data`;
    const list = Array.isArray(raw) ? raw : [raw];
    if (list.some((v) => Array.isArray(v) || (v !== null && typeof v === "object"))) return `${path} is not a list of numbers`;
    return list.map(toNumber);
};

export interface DrawnSeries {
    name: string;
    style: DataChartStyle;
    color?: string;
    points: [number, number][] | [number, number, number][];
}

export interface DataResult {
    series: DrawnSeries[];
    // when the data shown arrived (the newest of its sources)
    receivedAt?: number;
    notes: string[];
}

export type DataChartResult = DataResult | { error: string };

const seriesName = (s: DataSeries, i: number) =>
    s.name ||
    (s.source === FORMULA_SOURCE
        ? `y = ${(s.formula?.expression ?? "").slice(0, 30)}`
        : s.y
          ? `${s.y}${s.source === ASSET_STATE_SOURCE ? " (asset state)" : ""}`
          : "") ||
    `Series ${i + 1}`;

// The points of a formula y = f(x), with the values of its parameters now
export const computeFormulaSeries = (
    formula: DataFormula,
    get: (source: string) => LiveMessage | undefined,
): { points: [number, number][]; waiting: string[] } | { error: string } => {
    const params = formula.params ?? [];
    const compiled = compileSurfaceExpression(
        formula.expression,
        params.map((p) => p.name),
    );
    if ("error" in compiled) return { error: compiled.error };
    const { values, waiting } = surfaceParamValues(params, get);
    const n = Math.min(DATA_FORMULA_POINTS_MAX, Math.max(2, formula.points ?? DATA_FORMULA_POINTS_DEFAULT));
    const points: [number, number][] = [];
    // the range of a message, else its own
    const { xMin, xMax } = liveRangeOf(formula.range, get, false) ?? formula;
    for (let k = 0; k < n; k++) {
        const x = xMin + ((xMax - xMin) * k) / (n - 1);
        values.x = x;
        values.y = NaN;
        const y = compiled.evaluate(values);
        if (Number.isFinite(y)) points.push([x, y]);
    }
    return { points, waiting };
};

// The points of the series of an xy or points3d chart, from the last data of their sources
export const computeDataSeries = (data: DataChartOptions, get: (source: string) => LiveMessage | undefined): DataChartResult => {
    const three = data.kind === "points3d";
    const max = three ? DATA_CHART_MAX_POINTS_3D : DATA_CHART_MAX_POINTS;
    const out: DrawnSeries[] = [];
    const notes: string[] = [];
    const waiting: string[] = [];
    let receivedAt: number | undefined;
    for (const [i, s] of (data.series ?? []).entries()) {
        const name = seriesName(s, i);
        if (s.source === FORMULA_SOURCE) {
            if (!s.formula || three) continue;
            const drawn = computeFormulaSeries(s.formula, get);
            if ("error" in drawn) {
                notes.push(`${name}: ${drawn.error}`);
                continue;
            }
            if (drawn.waiting.length) notes.push(`${name}: waiting for the value of ${drawn.waiting.join(", ")}, shown with its own value`);
            out.push({ name, style: s.style ?? "line", color: s.color, points: drawn.points });
            continue;
        }
        const message = get(s.source);
        if (!message) {
            waiting.push(s.source === ASSET_STATE_SOURCE ? "the asset's state" : s.source);
            continue;
        }
        receivedAt = Math.max(receivedAt ?? 0, message.receivedAt);
        const ys = numbersAt(message.payload, s.y ?? "");
        if (typeof ys === "string") {
            notes.push(`${name}: ${ys}`);
            continue;
        }
        const xs = s.x ? numbersAt(message.payload, s.x) : ys.map((_, k) => k);
        if (typeof xs === "string") {
            notes.push(`${name}: ${xs}`);
            continue;
        }
        const zs = three && s.z ? numbersAt(message.payload, s.z) : null;
        if (typeof zs === "string") {
            notes.push(`${name}: ${zs}`);
            continue;
        }
        let n = Math.min(xs.length, ys.length, zs ? zs.length : Infinity);
        if (xs.length !== ys.length || (zs && zs.length !== ys.length)) notes.push(`${name}: fields of different lengths, ${n} points drawn`);
        if (n > max) {
            notes.push(`${name}: ${n} points, the first ${max} drawn`);
            n = max;
        }
        const points: number[][] = [];
        for (let k = 0; k < n; k++) {
            const p = zs ? [xs[k], ys[k], zs[k]] : [xs[k], ys[k]];
            if (p.every(Number.isFinite)) points.push(p);
        }
        out.push({
            name,
            style: s.style ?? (three ? "scatter" : "line"),
            color: s.color,
            points: points as DrawnSeries["points"],
        });
    }
    if (out.length === 0) {
        return {
            error: waiting.length ? `Waiting for the data of ${Array.from(new Set(waiting)).join(", ")}` : (notes[0] ?? "No data"),
        };
    }
    if (waiting.length) notes.push(`Waiting for ${Array.from(new Set(waiting)).join(", ")}`);
    return { series: out, receivedAt, notes };
};

// ---------------------------------------------------------------------------------------------------------
// The ECharts options

const TEXT = "#9aa1aa";
const AXIS_LINE = "#3a4048";
const SPLIT_LINE = "rgba(255, 255, 255, 0.08)";
export const DATA_CHART_COLORS = ["#73bf69", "#f2cc0c", "#5794f2", "#ff9830", "#f2495c", "#b877d9", "#8ab8ff", "#fade2a"];

const tooltipStyle = {
    backgroundColor: "#1b1e22",
    borderColor: "#2c3137",
    textStyle: { color: "#e6e8eb", fontSize: 12 },
};

const axis2D = (name: string | undefined, log: boolean | undefined, min?: number, max?: number) => ({
    type: log ? "log" : "value",
    name,
    nameLocation: "middle",
    nameGap: 28,
    nameTextStyle: { color: "#c7cbd1", fontSize: 12 },
    scale: true,
    ...(min !== undefined && max !== undefined ? { min, max } : {}),
    axisLabel: {
        color: TEXT,
        fontSize: 11,
        formatter: (v: number) => String(roundForAxis(v)),
    },
    axisLine: { lineStyle: { color: AXIS_LINE } },
    splitLine: { lineStyle: { color: SPLIT_LINE } },
});

// 2D series (xy)
export const xyChartOption = (data: DataChartOptions, result: DataResult): Record<string, unknown> => {
    const legend = data.legend !== false && result.series.length > 1;
    return {
        backgroundColor: "transparent",
        animation: false,
        color: DATA_CHART_COLORS,
        grid: {
            left: 56,
            right: 18,
            top: legend ? 34 : 16,
            bottom: 42,
            containLabel: false,
        },
        legend: legend
            ? {
                  show: true,
                  top: 4,
                  textStyle: { color: "#c7cbd1", fontSize: 11 },
                  itemHeight: 8,
              }
            : { show: false },
        tooltip: {
            ...tooltipStyle,
            trigger: "item",
            formatter: (p: { seriesName?: string; value?: number[] }) => {
                const [x, y] = p.value ?? [];
                return `${p.seriesName ?? ""}<br/>${data.xLabel ?? "x"}: ${roundForAxis(x as number)}<br/>${data.yLabel ?? "y"}: ${roundForAxis(y as number)}`;
            },
        },
        xAxis: axis2D(data.xLabel, data.xLog, data.xMin, data.xMax),
        yAxis: {
            ...axis2D(data.yLabel, data.yLog, data.yMin, data.yMax),
            nameGap: 42,
        },
        series: result.series.map((s) => {
            // a log axis cannot draw 0 or less
            const points = (s.points as [number, number][]).filter(([x, y]) => (!data.xLog || x > 0) && (!data.yLog || y > 0));
            const color = s.color ? { itemStyle: { color: s.color }, lineStyle: { color: s.color } } : {};
            if (s.style === "bar")
                return {
                    type: "bar",
                    name: s.name,
                    data: points,
                    barMaxWidth: 24,
                    ...color,
                };
            if (s.style === "scatter")
                return {
                    type: "scatter",
                    name: s.name,
                    data: points,
                    symbolSize: 5,
                    ...color,
                };
            return {
                type: "line",
                name: s.name,
                data: points,
                showSymbol: points.length <= 60,
                symbolSize: 4,
                lineStyle: { width: 1.6, ...(s.color ? { color: s.color } : {}) },
                ...(s.color ? { itemStyle: { color: s.color } } : {}),
                ...(s.style === "area" ? { areaStyle: { opacity: 0.18 } } : {}),
            };
        }),
    };
};

// a grid as a heat map: the cells by position (x and y as categories, labelled with their values)
export const heatmapChartOption = (surface: SurfaceOptions, grid: SurfaceGrid): Record<string, unknown> => {
    const fixed = surface.zMin !== undefined && surface.zMax !== undefined;
    const auto = niceRange(grid.zMin, grid.zMax);
    const xs = Array.from({ length: grid.columns }, (_, c) => roundForAxis(grid.xs?.[c] ?? grid.data[c]?.[0] ?? c));
    const ys = Array.from({ length: grid.rows }, (_, r) => roundForAxis(grid.ys?.[r] ?? grid.data[r * grid.columns]?.[1] ?? r));
    const cells: [number, number, number | "-"][] = grid.data.map(([, , z], k) => [
        k % grid.columns,
        Math.floor(k / grid.columns),
        Number.isFinite(z) ? z : "-",
    ]);
    const category = (name: string | undefined, values: number[]) => ({
        type: "category",
        data: values.map(String),
        name,
        nameLocation: "middle",
        nameGap: 28,
        nameTextStyle: { color: "#c7cbd1", fontSize: 12 },
        axisLabel: { color: TEXT, fontSize: 11 },
        axisLine: { lineStyle: { color: AXIS_LINE } },
        splitArea: { show: false },
    });
    return {
        backgroundColor: "transparent",
        animation: false,
        grid: { left: 56, right: 70, top: 16, bottom: 42 },
        tooltip: {
            ...tooltipStyle,
            formatter: (p: { value?: [number, number, number] }) => {
                const [c, r, z] = p.value ?? [0, 0, 0];
                return `${surface.xLabel ?? "x"}: ${xs[c]}<br/>${surface.yLabel ?? "y"}: ${ys[r]}<br/>${surface.zLabel ?? "z"}: ${typeof z === "number" ? roundForAxis(z) : "-"}`;
            },
        },
        xAxis: category(surface.xLabel, xs),
        yAxis: { ...category(surface.yLabel, ys), nameGap: 42 },
        visualMap: {
            min: fixed ? surface.zMin : auto.min,
            max: fixed ? surface.zMax : auto.max,
            calculable: false,
            right: 6,
            top: "middle",
            itemHeight: 120,
            text: [surface.zLabel ?? "z", ""],
            textStyle: { color: TEXT, fontSize: 11 },
            formatter: (v: number) => String(roundForAxis(v)),
            inRange: { color: SURFACE_PALETTES[surface.colors ?? "viridis"] },
        },
        series: [{ type: "heatmap", data: cells, progressive: 0 }],
    };
};

// 3D points or lines
export const points3dChartOption = (data: DataChartOptions, result: DataResult): Record<string, unknown> => {
    const axis = (name: string | undefined, fallback: string) => ({
        type: "value",
        name: name ?? fallback,
        nameTextStyle: { color: "#c7cbd1", fontSize: 13 },
        axisLabel: {
            color: TEXT,
            fontSize: 11,
            formatter: (v: number) => String(roundForAxis(v)),
        },
        axisLine: { lineStyle: { color: "#8b929b", width: 1.5 } },
        splitLine: {
            show: true,
            lineStyle: { color: "rgba(255, 255, 255, 0.2)", width: 1 },
        },
        splitArea: {
            show: true,
            areaStyle: {
                color: ["rgba(255, 255, 255, 0.025)", "rgba(255, 255, 255, 0.06)"],
            },
        },
    });
    const legend = data.legend !== false && result.series.length > 1;
    return {
        backgroundColor: "transparent",
        color: DATA_CHART_COLORS,
        legend: legend ? { show: true, top: 4, textStyle: { color: "#c7cbd1", fontSize: 11 } } : { show: false },
        tooltip: {
            ...tooltipStyle,
            formatter: (p: { seriesName?: string; value?: number[] }) => {
                const [x, y, z] = p.value ?? [];
                return `${p.seriesName ?? ""}<br/>${data.xLabel ?? "x"}: ${roundForAxis(x as number)}<br/>${data.yLabel ?? "y"}: ${roundForAxis(y as number)}<br/>${data.zLabel ?? "z"}: ${roundForAxis(z as number)}`;
            },
        },
        xAxis3D: axis(data.xLabel, "x"),
        yAxis3D: axis(data.yLabel, "y"),
        zAxis3D: axis(data.zLabel, "z"),
        grid3D: {
            boxWidth: 100,
            boxDepth: 100,
            boxHeight: 70,
            // as the 3D model (and Blender): the middle button turns it, the left one moves it, the wheel zooms
            viewControl: { distance: 210, alpha: 25, beta: 40, damping: 0.8, rotateMouseButton: "middle", panMouseButton: "left" },
            light: {
                main: { intensity: 1.1, alpha: 35, beta: 30 },
                ambient: { intensity: 0.35 },
            },
            environment: "none",
        },
        series: result.series.map((s) =>
            s.style === "line"
                ? {
                      type: "line3D",
                      name: s.name,
                      data: s.points,
                      lineStyle: { width: 2, ...(s.color ? { color: s.color } : {}) },
                  }
                : {
                      type: "scatter3D",
                      name: s.name,
                      data: s.points,
                      symbolSize: 5,
                      ...(s.color ? { itemStyle: { color: s.color } } : {}),
                  },
        ),
    };
};

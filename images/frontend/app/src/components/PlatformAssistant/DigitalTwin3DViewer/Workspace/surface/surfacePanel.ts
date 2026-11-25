// The 3D Surface panels of the Viewer page: a surface z = f(x, y) drawn with ECharts GL, of two kinds
//
//   function  a formula (surfaceExpression.ts) over a range of x and y, with parameters that are fixed numbers or
//             values of the NATS messages ({{topicRef.path}}, as the Text and Picture panels): the surface follows
//             them as they arrive;
//   data      a grid of values that a message carries (e.g. computed by the pipeline): at the field of a topic,
//             a list of rows [[z, z, …], …] (a row for each y, a value for each x) or an object
//             { z: [[…], …], x: [...], y: [...] }; without x and y, the panel's ranges.
//
// A function can be drawn only up to a height (clipAbove: a number or one of its parameters): above it there is no
// surface, and its edge follows that height smoothly (the points of the grid next to it are moved onto it), as the
// drawing of a bowl cut at a level.
//
// A function's ranges of x and y can follow a message too (range: the field of a topic with {xMin, xMax, yMin, yMax},
// e.g. a window around a minimum computed by the pipeline): its own ranges until it arrives, or when it is not valid.
//
// admin_api (viewerLayoutValidation.ts) checks the same settings.
import { LiveMessage, valueAt } from "../liveValues";
import { compileSurfaceExpression, isReservedSurfaceName, SURFACE_EXPRESSION_MAX_LENGTH } from "./surfaceExpression";

export const SURFACE_MODES = ["function", "data"] as const;
export type SurfaceMode = (typeof SURFACE_MODES)[number];
export const SURFACE_COLORS = ["viridis", "turbo", "coolwarm", "blues", "grays"] as const;
export type SurfaceColors = (typeof SURFACE_COLORS)[number];
export const SURFACE_MAX_PARAMS = 20;
export const SURFACE_STEPS_MIN = 5;
export const SURFACE_STEPS_MAX = 150;
export const SURFACE_DEFAULT_STEPS = 40;
// heat map: about how many contour lines
export const CONTOUR_LEVELS_DEFAULT = 10;
export const CONTOUR_LEVELS_MIN = 2;
export const CONTOUR_LEVELS_MAX = 30;
// the largest grid a message can bring
export const SURFACE_DATA_MAX = 200;
export const SURFACE_LABEL_MAX = 40;

const PARAM_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,19}$/;
// a topic, or the state of the twin's asset (dataChart.ts, ASSET_STATE_SOURCE)
const TOPIC = /^(@assetState|[A-Za-z0-9_.-]{1,60})$/;
const PATH = /^[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+){0,15}$/;

export interface SurfaceParam {
    name: string;
    // the value when it is fixed, or until its first message arrives
    value: number;
    // a value of the NATS messages
    topicRef?: string;
    path?: string;
}

// where the ranges of the axes come from: the field of a topic with { xMin, xMax, yMin?, yMax? }
export interface LiveRange {
    topicRef: string;
    path: string;
}

export interface SurfaceOptions {
    mode: SurfaceMode;
    // function: its ranges of x and y from a message (liveRangeOf)
    range?: LiveRange;
    // function: drawn only up to this height: a number, or the name of one of its parameters
    clipAbove?: number | string;
    expression?: string;
    params?: SurfaceParam[];
    // data: where the grid is
    topicRef?: string;
    path?: string;
    xMin: number;
    xMax: number;
    yMin: number;
    yMax: number;
    // function: points of the grid along each axis
    steps?: number;
    // a fixed range of z (both, or automatic)
    zMin?: number;
    zMax?: number;
    xLabel?: string;
    yLabel?: string;
    zLabel?: string;
    colors?: SurfaceColors;
    wireframe?: boolean;
    opacity?: number;
    // heat map: its contour lines (with their values) and about how many levels
    contours?: boolean;
    contourLevels?: number;
}

export const defaultSurface = (): SurfaceOptions => ({
    mode: "function",
    expression: "A*sin(k*x)*cos(k*y)",
    params: [
        { name: "A", value: 1 },
        { name: "k", value: 1 },
    ],
    xMin: -3.14,
    xMax: 3.14,
    yMin: -3.14,
    yMax: 3.14,
    steps: SURFACE_DEFAULT_STEPS,
    xLabel: "x",
    yLabel: "y",
    zLabel: "z",
    colors: "viridis",
    wireframe: true,
});

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

// The settings of a panel as they come (a saved layout, a file): the valid ones, or null
export const sanitizeSurface = (raw: unknown): SurfaceOptions | null => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const s = raw as Record<string, unknown>;
    if (!SURFACE_MODES.includes(s.mode as SurfaceMode)) return null;
    if (!isNum(s.xMin) || !isNum(s.xMax) || !isNum(s.yMin) || !isNum(s.yMax) || s.xMin >= s.xMax || s.yMin >= s.yMax) return null;
    const surface: SurfaceOptions = { mode: s.mode as SurfaceMode, xMin: s.xMin, xMax: s.xMax, yMin: s.yMin, yMax: s.yMax };
    if (surface.mode === "function") {
        surface.expression = typeof s.expression === "string" ? s.expression.slice(0, SURFACE_EXPRESSION_MAX_LENGTH) : "";
        const names = new Set<string>();
        surface.params = (Array.isArray(s.params) ? s.params : [])
            .filter((p): p is Record<string, unknown> => !!p && typeof p === "object")
            .filter((p) => typeof p.name === "string" && PARAM_NAME.test(p.name) && !isReservedSurfaceName(p.name) && isNum(p.value))
            .filter((p) => !names.has(p.name as string) && !!names.add(p.name as string))
            .slice(0, SURFACE_MAX_PARAMS)
            .map((p) => {
                const param: SurfaceParam = { name: p.name as string, value: p.value as number };
                if (typeof p.topicRef === "string" && TOPIC.test(p.topicRef) && typeof p.path === "string" && PATH.test(p.path)) {
                    param.topicRef = p.topicRef;
                    param.path = p.path;
                }
                return param;
            });
        const range = sanitizeLiveRange(s.range);
        if (range) surface.range = range;
        if (isNum(s.clipAbove) || (typeof s.clipAbove === "string" && (surface.params ?? []).some((p) => p.name === s.clipAbove))) {
            surface.clipAbove = s.clipAbove as number | string;
        }
        if (Number.isInteger(s.steps) && (s.steps as number) >= SURFACE_STEPS_MIN && (s.steps as number) <= SURFACE_STEPS_MAX)
            surface.steps = s.steps as number;
    } else {
        if (typeof s.topicRef === "string" && TOPIC.test(s.topicRef)) surface.topicRef = s.topicRef;
        if (typeof s.path === "string" && PATH.test(s.path)) surface.path = s.path;
    }
    if (isNum(s.zMin) && isNum(s.zMax) && s.zMin < s.zMax) {
        surface.zMin = s.zMin;
        surface.zMax = s.zMax;
    }
    for (const key of ["xLabel", "yLabel", "zLabel"] as const) {
        if (typeof s[key] === "string" && (s[key] as string).trim()) surface[key] = (s[key] as string).trim().slice(0, SURFACE_LABEL_MAX);
    }
    if (SURFACE_COLORS.includes(s.colors as SurfaceColors)) surface.colors = s.colors as SurfaceColors;
    if (typeof s.wireframe === "boolean") surface.wireframe = s.wireframe;
    if (isNum(s.opacity) && s.opacity >= 0.1 && s.opacity <= 1) surface.opacity = s.opacity;
    if (typeof s.contours === "boolean") surface.contours = s.contours;
    if (Number.isInteger(s.contourLevels) && (s.contourLevels as number) >= CONTOUR_LEVELS_MIN && (s.contourLevels as number) <= CONTOUR_LEVELS_MAX)
        surface.contourLevels = s.contourLevels as number;
    return surface;
};

export const sanitizeLiveRange = (raw: unknown): LiveRange | undefined => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
    const r = raw as Record<string, unknown>;
    return typeof r.topicRef === "string" && TOPIC.test(r.topicRef) && typeof r.path === "string" && PATH.test(r.path)
        ? { topicRef: r.topicRef, path: r.path }
        : undefined;
};

// The ranges a message gives ({xMin, xMax} and, for a surface, {yMin, yMax}: finite, each min below its max), or null
export const liveRangeOf = (
    range: LiveRange | undefined,
    get: (topicRef: string) => LiveMessage | undefined,
    withY: boolean,
): { xMin: number; xMax: number; yMin?: number; yMax?: number } | null => {
    if (!range) return null;
    const value = valueAt(get(range.topicRef)?.payload, range.path.split("."));
    if (!value || typeof value !== "object") return null;
    const v = value as Record<string, unknown>;
    if (!isNum(v.xMin) || !isNum(v.xMax) || v.xMin >= v.xMax) return null;
    if (!withY) return { xMin: v.xMin, xMax: v.xMax };
    if (!isNum(v.yMin) || !isNum(v.yMax) || v.yMin >= v.yMax) return null;
    return { xMin: v.xMin, xMax: v.xMax, yMin: v.yMin, yMax: v.yMax };
};

// The topics a surface follows
export const surfaceTopics = (surface: SurfaceOptions | undefined): string[] => {
    if (!surface) return [];
    if (surface.mode === "data") return surface.topicRef ? [surface.topicRef] : [];
    const topics = (surface.params ?? []).map((p) => p.topicRef).filter((t): t is string => !!t);
    if (surface.range) topics.push(surface.range.topicRef);
    return Array.from(new Set(topics));
};

// A surface ready to draw: its points row by row (a row for each y, x growing), its shape and the range of z
export interface SurfaceGrid {
    data: [number, number, number][];
    rows: number;
    columns: number;
    zMin: number;
    zMax: number;
    // the values of x and y of the grid (its points can be moved: clipGrid)
    xs?: number[];
    ys?: number[];
    // a cut (clipAbove): its height, and the values of z before it (a heat map draws them up to it)
    cap?: number;
    zs?: number[];
}

export type SurfaceResult = { grid: SurfaceGrid; note?: string } | { error: string };

const rangeOf = (data: [number, number, number][]) => {
    let zMin = Infinity;
    let zMax = -Infinity;
    for (const [, , z] of data) {
        if (Number.isNaN(z)) continue;
        if (z < zMin) zMin = z;
        if (z > zMax) zMax = z;
    }
    if (zMin === Infinity) return { zMin: 0, zMax: 1 };
    // a flat surface still needs a range
    if (zMin === zMax) return { zMin: zMin - 1, zMax: zMax + 1 };
    return { zMin, zMax };
};

const axisValues = (min: number, max: number, count: number) =>
    Array.from({ length: count }, (_, i) => (count === 1 ? min : min + ((max - min) * i) / (count - 1)));

// The values of the parameters now: those of a message once it has arrived (a number), else their own
export const surfaceParamValues = (params: SurfaceParam[], get: (topicRef: string) => LiveMessage | undefined) => {
    const values: Record<string, number> = Object.create(null);
    const waiting: string[] = [];
    for (const param of params) {
        let value = param.value;
        if (param.topicRef && param.path) {
            const live = valueAt(get(param.topicRef)?.payload, param.path.split("."));
            const number = typeof live === "number" ? live : typeof live === "string" && live.trim() !== "" ? Number(live) : NaN;
            if (Number.isFinite(number)) value = number;
            else waiting.push(param.name);
        }
        values[param.name] = value;
    }
    return { values, waiting };
};

// function: the formula over the grid, with the values of the parameters
export const computeFunctionSurface = (surface: SurfaceOptions, get: (topicRef: string) => LiveMessage | undefined): SurfaceResult => {
    const params = surface.params ?? [];
    const compiled = compileSurfaceExpression(
        surface.expression ?? "",
        params.map((p) => p.name),
    );
    if ("error" in compiled) return { error: compiled.error };
    const { values, waiting } = surfaceParamValues(params, get);
    const steps = surface.steps ?? SURFACE_DEFAULT_STEPS;
    // the ranges of a message, else its own
    const range = liveRangeOf(surface.range, get, true) ?? surface;
    const xs = axisValues(range.xMin, range.xMax, steps);
    const ys = axisValues(range.yMin as number, range.yMax as number, steps);
    const data: [number, number, number][] = [];
    const vars = values;
    for (const y of ys) {
        for (const x of xs) {
            vars.x = x;
            vars.y = y;
            data.push([x, y, compiled.evaluate(vars)]);
        }
    }
    const cap = typeof surface.clipAbove === "number" ? surface.clipAbove : surface.clipAbove !== undefined ? values[surface.clipAbove] : undefined;
    const cut = cap !== undefined && Number.isFinite(cap);
    const zs = cut ? data.map((d) => d[2]) : undefined;
    if (cut) clipGrid(data, ys.length, xs.length, cap);
    return {
        grid: { data, rows: ys.length, columns: xs.length, ...rangeOf(data), xs, ys, ...(cut ? { cap, zs } : {}) },
        note: waiting.length ? `Waiting for the value of ${waiting.join(", ")}: shown with its own value` : undefined,
    };
};

// The grid without what is above a height: a point above it next to one below (of the 8 around it) is moved onto
// the line between them, where the height is reached (linearly), so that the edge follows the level; the others are
// holes (NaN)
export const clipGrid = (data: [number, number, number][], rows: number, columns: number, cap: number) => {
    const z = data.map((d) => d[2]);
    const below = (k: number) => Number.isFinite(z[k]) && z[k] <= cap;
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < columns; c++) {
            const k = r * columns + c;
            if (below(k)) continue;
            // the neighbour below that leaves the point closest to where it is
            let best = -1;
            let bestT = -1;
            for (let dr = -1; dr <= 1; dr++) {
                for (let dc = -1; dc <= 1; dc++) {
                    if ((!dr && !dc) || r + dr < 0 || r + dr >= rows || c + dc < 0 || c + dc >= columns) continue;
                    const n = (r + dr) * columns + c + dc;
                    if (!below(n)) continue;
                    const t = Number.isFinite(z[k]) ? (cap - z[n]) / (z[k] - z[n]) : 0;
                    if (t > bestT) {
                        bestT = t;
                        best = n;
                    }
                }
            }
            if (best < 0) {
                data[k] = [data[k][0], data[k][1], NaN];
                continue;
            }
            const [nx, ny] = data[best];
            const [px, py] = data[k];
            data[k] = [nx + bestT * (px - nx), ny + bestT * (py - ny), cap];
        }
    }
};

const numberOr = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : NaN);

// data: the grid that the last message of the topic carries
export const computeDataSurface = (surface: SurfaceOptions, get: (topicRef: string) => LiveMessage | undefined): SurfaceResult => {
    if (!surface.topicRef || !surface.path) return { error: "Choose the topic and the field of the grid" };
    const message = get(surface.topicRef);
    if (!message) return { error: `Waiting for a message of ${surface.topicRef}` };
    const raw = valueAt(message.payload, surface.path.split("."));
    let rowsIn: unknown = raw;
    let xIn: unknown;
    let yIn: unknown;
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
        ({ z: rowsIn, x: xIn, y: yIn } = raw as Record<string, unknown>);
    }
    if (!Array.isArray(rowsIn) || rowsIn.length < 2 || !rowsIn.every((row) => Array.isArray(row))) {
        return { error: `${surface.topicRef}.${surface.path} is not a grid: a list of rows [[z, z, …], …] or { z, x, y }` };
    }
    const columns = Math.min(...(rowsIn as unknown[][]).map((row) => row.length));
    if (columns < 2) return { error: "The grid needs at least 2 values in each row" };
    if (rowsIn.length > SURFACE_DATA_MAX || columns > SURFACE_DATA_MAX)
        return { error: `The grid can have at most ${SURFACE_DATA_MAX} × ${SURFACE_DATA_MAX} values` };
    const rows = rowsIn.length;
    const notes: string[] = [];
    const axis = (values: unknown, count: number, min: number, max: number, name: string) => {
        if (values === undefined) return axisValues(min, max, count);
        if (Array.isArray(values) && values.length >= count && values.slice(0, count).every((v) => typeof v === "number" && Number.isFinite(v))) {
            return (values as number[]).slice(0, count);
        }
        notes.push(`its ${name} is not a list of ${count} numbers: the panel's range is used`);
        return axisValues(min, max, count);
    };
    const xs = axis(xIn, columns, surface.xMin, surface.xMax, "x");
    const ys = axis(yIn, rows, surface.yMin, surface.yMax, "y");
    if ((rowsIn as unknown[][]).some((row) => row.length !== columns)) notes.push(`rows of different lengths: ${columns} values of each are drawn`);
    const data: [number, number, number][] = [];
    for (let r = 0; r < rows; r++) {
        const row = (rowsIn as unknown[][])[r];
        for (let c = 0; c < columns; c++) data.push([xs[c], ys[r], numberOr(row[c])]);
    }
    return { grid: { data, rows, columns, ...rangeOf(data) }, note: notes.length ? `The grid: ${notes.join("; ")}` : undefined };
};

export const computeSurface = (surface: SurfaceOptions, get: (topicRef: string) => LiveMessage | undefined): SurfaceResult =>
    surface.mode === "data" ? computeDataSurface(surface, get) : computeFunctionSurface(surface, get);

// the colours of each scale, low to high
export const SURFACE_PALETTES: Record<SurfaceColors, string[]> = {
    viridis: ["#440154", "#3b528b", "#21918c", "#5ec962", "#fde725"],
    turbo: ["#30123b", "#4686fb", "#1ae4b6", "#a2fc3c", "#fabb39", "#e4460a", "#7a0403"],
    coolwarm: ["#3b4cc0", "#8db0fe", "#dddddd", "#f49a7b", "#b40426"],
    blues: ["#deebf7", "#9ecae1", "#4292c6", "#08519c", "#08306b"],
    grays: ["#252525", "#636363", "#969696", "#cccccc", "#f7f7f7"],
};

// A number for an axis or a tooltip: at most 4 significant digits, without the noise of floating point
// (0.30000000000000004 → 0.3, 0.5805486440658569 → 0.5805)
export const roundForAxis = (v: number) => (Number.isFinite(v) ? Number(Number(v.toPrecision(4)).toPrecision(12)) : v);

// An automatic range of z: its ends rounded out to a "nice" step (1, 2 or 5 × 10ⁿ) with about 5 divisions, as
// ECharts does in its own charts, so that the axis does not show the exact ends of the surface
export const niceRange = (min: number, max: number, divisions = 5) => {
    const span = max - min;
    if (!(span > 0) || !Number.isFinite(span)) return { min, max, step: undefined as number | undefined };
    const rough = span / divisions;
    const magnitude = Math.pow(10, Math.floor(Math.log10(rough)));
    const norm = rough / magnitude;
    const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * magnitude;
    const clean = (v: number) => Number(v.toPrecision(12));
    return { min: clean(Math.floor(min / step + 1e-9) * step), max: clean(Math.ceil(max / step - 1e-9) * step), step: clean(step) };
};

// The ECharts GL options of a surface
export const surfaceChartOption = (surface: SurfaceOptions, grid: SurfaceGrid): Record<string, unknown> => {
    const fixedZ = surface.zMin !== undefined && surface.zMax !== undefined;
    const autoZ = niceRange(grid.zMin, grid.zMax);
    const zMin = fixedZ ? (surface.zMin as number) : autoZ.min;
    const zMax = fixedZ ? (surface.zMax as number) : autoZ.max;
    // the three planes at the back of the box marked with the axes' divisions (lines, and bands of two shades),
    // as ECharts draws them, in the colours of the dark Viewer
    const axis = (name: string | undefined, fallback: string) => ({
        type: "value",
        name: name ?? fallback,
        nameTextStyle: { color: "#c7cbd1", fontSize: 13 },
        axisLabel: { color: "#9aa1aa", fontSize: 11, formatter: (v: number) => String(roundForAxis(v)) },
        axisLine: { lineStyle: { color: "#8b929b", width: 1.5 } },
        axisTick: { lineStyle: { color: "#8b929b" } },
        splitLine: { show: true, lineStyle: { color: "rgba(255, 255, 255, 0.2)", width: 1 } },
        splitArea: { show: true, areaStyle: { color: ["rgba(255, 255, 255, 0.025)", "rgba(255, 255, 255, 0.06)"] } },
    });
    return {
        backgroundColor: "transparent",
        tooltip: {
            backgroundColor: "#1b1e22",
            borderColor: "#2c3137",
            textStyle: { color: "#e6e8eb", fontSize: 12 },
            formatter: (p: { value?: number[] }) => {
                const [x, y, z] = p.value ?? [];
                const f = (v: number | undefined) => (typeof v === "number" ? roundForAxis(v) : "-");
                return `${surface.xLabel ?? "x"}: ${f(x)}<br/>${surface.yLabel ?? "y"}: ${f(y)}<br/>${surface.zLabel ?? "z"}: ${f(z)}`;
            },
        },
        visualMap: {
            show: true,
            dimension: 2,
            min: zMin,
            max: zMax,
            calculable: false,
            right: 6,
            top: "middle",
            itemHeight: 120,
            textStyle: { color: "#9aa1aa", fontSize: 11 },
            formatter: (v: number) => String(roundForAxis(v)),
            inRange: { color: SURFACE_PALETTES[surface.colors ?? "viridis"] },
        },
        xAxis3D: {
            ...axis(surface.xLabel, "x"),
            min: grid.xs?.[0] ?? grid.data[0]?.[0],
            max: grid.xs?.[grid.xs.length - 1] ?? grid.data[grid.columns - 1]?.[0],
        },
        yAxis3D: {
            ...axis(surface.yLabel, "y"),
            min: grid.ys?.[0] ?? grid.data[0]?.[1],
            max: grid.ys?.[grid.ys.length - 1] ?? grid.data[grid.data.length - 1]?.[1],
        },
        zAxis3D: { ...axis(surface.zLabel, "z"), min: zMin, max: zMax, ...(fixedZ || !autoZ.step ? {} : { interval: autoZ.step }) },
        grid3D: {
            boxWidth: 100,
            boxDepth: 100,
            boxHeight: 60,
            // the point under the mouse projected on the three planes
            axisPointer: { show: true, lineStyle: { color: "rgba(255, 255, 255, 0.55)", width: 1 }, label: { show: false } },
            // as the 3D model (and Blender): the middle button turns it, the left one moves it, the wheel zooms
            viewControl: { distance: 210, alpha: 25, beta: 40, damping: 0.8, rotateMouseButton: "middle", panMouseButton: "left" },
            light: { main: { intensity: 1.1, shadow: false, alpha: 35, beta: 30 }, ambient: { intensity: 0.35 } },
            environment: "none",
        },
        series: [
            {
                type: "surface",
                data: grid.data,
                dataShape: [grid.rows, grid.columns],
                shading: "lambert",
                silent: false,
                itemStyle: { opacity: surface.opacity ?? 1 },
                wireframe: { show: surface.wireframe !== false, lineStyle: { color: "rgba(255,255,255,0.25)", width: 1 } },
                animation: false,
            },
        ],
    };
};

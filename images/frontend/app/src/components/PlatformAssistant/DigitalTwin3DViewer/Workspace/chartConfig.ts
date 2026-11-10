// The settings of a chart panel, with Grafana's names and defaults (a Grafana panel's "options" and
// "fieldConfig.defaults"), so that the panels read like Grafana's and could be imported from it later.
// Also what every visualization needs: colours, units, thresholds, value mappings and calculations.
// Pure functions, so they are easy to test.
import { ChartSeriesRef, WorkspacePanel } from "../workspaceLayout";

export type VizType = "timeseries" | "barchart" | "stat" | "gauge" | "bargauge" | "table";

export interface VizInfo {
    id: VizType;
    name: string;
    description: string;
}

export const VIZ_TYPES: VizInfo[] = [
    { id: "timeseries", name: "Time series", description: "Lines, bars or points over time" },
    { id: "barchart", name: "Bar chart", description: "Bars per interval of time" },
    { id: "stat", name: "Stat", description: "A big value with its colour and a sparkline" },
    { id: "gauge", name: "Gauge", description: "The value on a dial with its thresholds" },
    { id: "bargauge", name: "Bar gauge", description: "Values as horizontal or vertical bars" },
    { id: "table", name: "Table", description: "Rows with coloured cells" },
];

export const isVizType = (value: unknown): value is VizType => VIZ_TYPES.some((v) => v.id === value);

export interface Threshold {
    value: number | null; // null: the base
    color: string;
}

export interface Thresholds {
    mode: "absolute" | "percentage";
    steps: Threshold[];
}

export interface ValueMapping {
    type: "value" | "range";
    value?: string;
    from?: number | null;
    to?: number | null;
    text?: string;
    color?: string;
}

export interface FieldDefaults {
    unit?: string;
    min?: number;
    max?: number;
    decimals?: number;
    color?: { mode: "palette-classic" | "fixed" | "thresholds"; fixedColor?: string };
    thresholds?: Thresholds;
    mappings?: ValueMapping[];
    noValue?: string;
    custom?: Record<string, unknown>;
}

export interface ChartSettings {
    viz: VizType;
    options: Record<string, unknown>;
    fieldConfig: { defaults: FieldDefaults };
}

export type SeriesAgg = "mean" | "min" | "max" | "last" | "first" | "sum" | "count";

export const SERIES_AGGS: { id: SeriesAgg; name: string }[] = [
    { id: "mean", name: "Mean" },
    { id: "min", name: "Min" },
    { id: "max", name: "Max" },
    { id: "last", name: "Last" },
    { id: "first", name: "First" },
    { id: "sum", name: "Sum" },
    { id: "count", name: "Count" },
];

// --- defaults ----------------------------------------------------------------------------------------------

export const DEFAULT_THRESHOLDS: Thresholds = {
    mode: "absolute",
    steps: [
        { value: null, color: "green" },
        { value: 80, color: "red" },
    ],
};

const legendDefaults = { showLegend: true, displayMode: "list", placement: "bottom", calcs: [] as string[] };
const tooltipDefaults = { mode: "single", sort: "none" };
const reduceDefaults = { values: false, calcs: ["lastNotNull"], fields: "" };

export const DEFAULT_OPTIONS: Record<VizType, Record<string, unknown>> = {
    timeseries: { legend: legendDefaults, tooltip: tooltipDefaults },
    barchart: {
        orientation: "auto",
        showValue: "auto",
        stacking: "none",
        groupWidth: 0.7,
        barWidth: 0.97,
        xTickLabelRotation: 0,
        legend: legendDefaults,
        tooltip: tooltipDefaults,
    },
    stat: {
        reduceOptions: reduceDefaults,
        orientation: "auto",
        textMode: "auto",
        colorMode: "value",
        graphMode: "area",
        justifyMode: "auto",
        showPercentChange: false,
    },
    gauge: { reduceOptions: reduceDefaults, orientation: "auto", showThresholdLabels: false, showThresholdMarkers: true },
    bargauge: {
        reduceOptions: reduceDefaults,
        orientation: "horizontal",
        displayMode: "gradient",
        valueMode: "color",
        namePlacement: "auto",
        showUnfilled: true,
        minVizWidth: 8,
        minVizHeight: 16,
    },
    table: { showHeader: true, cellHeight: "sm", footer: { show: false, reducer: ["sum"] }, sortBy: [] },
};

export const DEFAULT_CUSTOM: Record<VizType, Record<string, unknown>> = {
    timeseries: {
        drawStyle: "line",
        lineInterpolation: "linear",
        lineWidth: 1,
        fillOpacity: 0,
        gradientMode: "none",
        showPoints: "auto",
        pointSize: 5,
        stacking: { mode: "none" },
        spanNulls: false,
        axisPlacement: "auto",
        axisLabel: "",
        scaleDistribution: { type: "linear" },
        thresholdsStyle: { mode: "off" },
        lineStyle: { fill: "solid" },
    },
    barchart: { lineWidth: 1, fillOpacity: 80, gradientMode: "none", axisPlacement: "auto", axisLabel: "", scaleDistribution: { type: "linear" }, thresholdsStyle: { mode: "off" } },
    stat: {},
    gauge: {},
    bargauge: {},
    table: { align: "auto", cellOptions: { type: "auto" }, minWidth: 0 },
};

export const newChartSettings = (viz: VizType = "timeseries"): ChartSettings => ({
    viz,
    options: structuredCloneSafe(DEFAULT_OPTIONS[viz]),
    fieldConfig: { defaults: { thresholds: structuredCloneSafe(DEFAULT_THRESHOLDS), color: { mode: "palette-classic" }, mappings: [], custom: structuredCloneSafe(DEFAULT_CUSTOM[viz]) } },
});

function structuredCloneSafe<T>(value: T): T {
    return JSON.parse(JSON.stringify(value));
}

// --- reading and writing settings by path ----------------------------------------------------------------

export const getPath = (obj: unknown, path: string): unknown => {
    let cur: unknown = obj;
    for (const key of path.split(".")) {
        if (!cur || typeof cur !== "object") return undefined;
        cur = (cur as Record<string, unknown>)[key];
    }
    return cur;
};

export const setPath = <T extends object>(obj: T, path: string, value: unknown): T => {
    const [key, ...rest] = path.split(".");
    const current = (obj as Record<string, unknown>)[key];
    const next =
        rest.length === 0
            ? value
            : setPath(current && typeof current === "object" && !Array.isArray(current) ? (current as object) : {}, rest.join("."), value);
    const copy = { ...(obj as Record<string, unknown>) };
    if (next === undefined) delete copy[key];
    else copy[key] = next;
    return copy as T;
};

// The settings of a panel, completed with the defaults of its visualization (a panel saved before the
// editor existed, with "range", becomes a time series with that relative time)
export const chartSettingsOf = (panel: WorkspacePanel): ChartSettings => {
    const viz: VizType = isVizType(panel.viz) ? panel.viz : "timeseries";
    const base = newChartSettings(viz);
    const options = deepMerge(base.options, (panel.options as Record<string, unknown>) ?? {});
    const saved = ((panel.fieldConfig as { defaults?: FieldDefaults } | undefined)?.defaults ?? {}) as FieldDefaults;
    const defaults = deepMerge(base.fieldConfig.defaults as Record<string, unknown>, saved as Record<string, unknown>) as FieldDefaults;
    if (saved.thresholds?.steps) defaults.thresholds = saved.thresholds;
    if (saved.mappings) defaults.mappings = saved.mappings;
    return { viz, options, fieldConfig: { defaults } };
};

const isPlainObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

export const deepMerge = (base: Record<string, unknown>, over: Record<string, unknown>): Record<string, unknown> => {
    const result: Record<string, unknown> = { ...base };
    for (const [key, value] of Object.entries(over)) {
        result[key] = isPlainObject(value) && isPlainObject(base[key]) ? deepMerge(base[key] as Record<string, unknown>, value) : value;
    }
    return result;
};

// The settings of a panel when it changes visualization: what both share stays (legend, tooltip, the field
// defaults…), the custom options of the new one start from its defaults
export const changeViz = (settings: ChartSettings, viz: VizType): ChartSettings => {
    if (settings.viz === viz) return settings;
    const base = newChartSettings(viz);
    const options: Record<string, unknown> = { ...base.options };
    for (const key of [...Object.keys(base.options), "description", "transparent"]) if (key in settings.options) options[key] = settings.options[key];
    const custom = { ...(base.fieldConfig.defaults.custom ?? {}) };
    for (const key of Object.keys(custom)) {
        const old = settings.fieldConfig.defaults.custom?.[key];
        if (old !== undefined) custom[key] = old;
    }
    return { viz, options, fieldConfig: { defaults: { ...settings.fieldConfig.defaults, custom } } };
};

// The panel with these settings (only what differs from the defaults is kept, so the layout stays small)
export const withChartSettings = (panel: WorkspacePanel, settings: ChartSettings): WorkspacePanel => {
    const base = newChartSettings(settings.viz);
    const { range: _legacy, ...rest } = panel;
    return {
        ...rest,
        viz: settings.viz,
        options: diff(settings.options, base.options) ?? {},
        fieldConfig: { defaults: (diff(settings.fieldConfig.defaults as Record<string, unknown>, base.fieldConfig.defaults as Record<string, unknown>) ?? {}) as FieldDefaults },
    };
};

const diff = (value: Record<string, unknown>, base: Record<string, unknown>): Record<string, unknown> | undefined => {
    const result: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value)) {
        const b = base[key];
        if (isPlainObject(v) && isPlainObject(b)) {
            const d = diff(v, b);
            if (d && Object.keys(d).length) result[key] = d;
        } else if (JSON.stringify(v) !== JSON.stringify(b)) result[key] = v;
    }
    return Object.keys(result).length ? result : undefined;
};

// --- colours ------------------------------------------------------------------------------------------------

// Grafana's named colours (the ones its colour picker offers first)
export const NAMED_COLORS: Record<string, string> = {
    green: "#73BF69",
    "dark-green": "#37872D",
    "semi-dark-green": "#56A64B",
    "light-green": "#96D98D",
    yellow: "#FADE2A",
    "dark-yellow": "#E0B400",
    "semi-dark-yellow": "#F2CC0C",
    "light-yellow": "#FFEE52",
    red: "#F2495C",
    "dark-red": "#C4162A",
    "semi-dark-red": "#E02F44",
    "light-red": "#FF7383",
    blue: "#5794F2",
    "dark-blue": "#1F60C4",
    "semi-dark-blue": "#3274D9",
    "light-blue": "#8AB8FF",
    orange: "#FF9830",
    "dark-orange": "#FA6400",
    "semi-dark-orange": "#FF780A",
    "light-orange": "#FFB357",
    purple: "#B877D9",
    "dark-purple": "#8F3BB8",
    "semi-dark-purple": "#A352CC",
    "light-purple": "#CA95E5",
    text: "#CCCCDC",
    transparent: "transparent",
};

export const COLOR_CHOICES = ["green", "yellow", "orange", "red", "blue", "purple", "dark-green", "dark-yellow", "dark-orange", "dark-red", "dark-blue", "dark-purple", "light-green", "light-yellow", "light-orange", "light-red", "light-blue", "light-purple"];

// Grafana's classic palette, in its order
export const CLASSIC_PALETTE = ["#73BF69", "#F2CC0C", "#8AB8FF", "#FF780A", "#F2495C", "#5794F2", "#B877D9", "#705DA0", "#37872D", "#FADE2A", "#447EBC", "#C15C17"];

export const resolveColor = (color: string | undefined, fallback = "#CCCCDC"): string => {
    if (!color) return fallback;
    return NAMED_COLORS[color] ?? (/^#[0-9a-fA-F]{3,8}$/.test(color) ? color : fallback);
};

// colour of a value from the thresholds (percentage: of min…max)
export const thresholdColor = (value: number | null | undefined, thresholds: Thresholds | undefined, min?: number, max?: number): string => {
    const steps = thresholds?.steps?.length ? thresholds.steps : DEFAULT_THRESHOLDS.steps;
    if (value === null || value === undefined || !Number.isFinite(value)) return resolveColor(steps[0].color);
    let v = value;
    if (thresholds?.mode === "percentage") {
        const lo = min ?? 0;
        const hi = max ?? 100;
        v = hi === lo ? 0 : ((value - lo) / (hi - lo)) * 100;
    }
    let color = steps[0].color;
    for (const step of steps) if (step.value === null || v >= step.value) color = step.color;
    return resolveColor(color);
};

// the steps sorted, with the base first
export const sortedSteps = (steps: Threshold[]): Threshold[] => {
    const base = steps.find((s) => s.value === null) ?? { value: null, color: "green" };
    const rest = steps.filter((s) => s.value !== null).sort((a, b) => (a.value as number) - (b.value as number));
    return [base, ...rest];
};

// --- value mappings ----------------------------------------------------------------------------------------

export const applyMappings = (value: number | null | undefined, mappings: ValueMapping[] | undefined): { text?: string; color?: string } | null => {
    if (!mappings?.length || value === null || value === undefined) return null;
    for (const m of mappings) {
        if (m.type === "value" && m.value !== undefined && m.value !== "" && Number(m.value) === value) return { text: m.text || undefined, color: m.color || undefined };
        if (m.type === "range") {
            const lo = m.from ?? -Infinity;
            const hi = m.to ?? Infinity;
            if (value >= lo && value <= hi) return { text: m.text || undefined, color: m.color || undefined };
        }
    }
    return null;
};

// --- units -------------------------------------------------------------------------------------------------

export interface UnitInfo {
    id: string;
    name: string;
    suffix: string;
    group: string;
}

export const UNITS: UnitInfo[] = [
    { id: "none", name: "None", suffix: "", group: "Misc" },
    { id: "short", name: "Short (k, M, G)", suffix: "", group: "Misc" },
    { id: "percent", name: "Percent (0-100)", suffix: "%", group: "Misc" },
    { id: "percentunit", name: "Percent (0.0-1.0)", suffix: "%", group: "Misc" },
    { id: "celsius", name: "Celsius (°C)", suffix: "°C", group: "Temperature" },
    { id: "fahrenheit", name: "Fahrenheit (°F)", suffix: "°F", group: "Temperature" },
    { id: "kelvin", name: "Kelvin (K)", suffix: "K", group: "Temperature" },
    { id: "accMS2", name: "Meters/sec² (m/s²)", suffix: "m/s²", group: "Acceleration" },
    { id: "accG", name: "G unit (g)", suffix: "g", group: "Acceleration" },
    { id: "velocityms", name: "Meters/second (m/s)", suffix: "m/s", group: "Velocity" },
    { id: "velocitykmh", name: "Kilometers/hour (km/h)", suffix: "km/h", group: "Velocity" },
    { id: "rotrpm", name: "Revolutions per minute (rpm)", suffix: "rpm", group: "Rotation" },
    { id: "rothz", name: "Hertz (Hz)", suffix: "Hz", group: "Rotation" },
    { id: "rotrads", name: "Radians per second (rad/s)", suffix: "rad/s", group: "Rotation" },
    { id: "degree", name: "Degrees (°)", suffix: "°", group: "Angle" },
    { id: "radian", name: "Radians", suffix: "rad", group: "Angle" },
    { id: "forceNm", name: "Newton-meters (Nm)", suffix: "Nm", group: "Force" },
    { id: "forcen", name: "Newtons (N)", suffix: "N", group: "Force" },
    { id: "forcekn", name: "Kilonewtons (kN)", suffix: "kN", group: "Force" },
    { id: "pressurebar", name: "Bars (bar)", suffix: "bar", group: "Pressure" },
    { id: "pressurepa", name: "Pascals (Pa)", suffix: "Pa", group: "Pressure" },
    { id: "pressurekpa", name: "Kilopascals (kPa)", suffix: "kPa", group: "Pressure" },
    { id: "watt", name: "Watt (W)", suffix: "W", group: "Energy" },
    { id: "kwatt", name: "Kilowatt (kW)", suffix: "kW", group: "Energy" },
    { id: "megwatt", name: "Megawatt (MW)", suffix: "MW", group: "Energy" },
    { id: "kwatth", name: "Kilowatt-hour (kWh)", suffix: "kWh", group: "Energy" },
    { id: "volt", name: "Volt (V)", suffix: "V", group: "Energy" },
    { id: "amp", name: "Ampere (A)", suffix: "A", group: "Energy" },
    { id: "lengthmm", name: "Millimeter (mm)", suffix: "mm", group: "Length" },
    { id: "lengthm", name: "Meter (m)", suffix: "m", group: "Length" },
    { id: "lengthkm", name: "Kilometer (km)", suffix: "km", group: "Length" },
    { id: "massg", name: "Gram (g)", suffix: "g", group: "Mass" },
    { id: "masskg", name: "Kilogram (kg)", suffix: "kg", group: "Mass" },
    { id: "humidity", name: "Humidity (%H)", suffix: "%H", group: "Misc" },
    { id: "ms", name: "Milliseconds (ms)", suffix: "ms", group: "Time" },
    { id: "s", name: "Seconds (s)", suffix: "s", group: "Time" },
    { id: "m", name: "Minutes (m)", suffix: "min", group: "Time" },
    { id: "h", name: "Hours (h)", suffix: "h", group: "Time" },
    { id: "hertz", name: "Hertz (1/s)", suffix: "Hz", group: "Frequency" },
];

// The unit of Grafana that matches the units text of a sensor's measurement ("m/s^2", "°C", "rpm"…);
// otherwise a custom suffix
export const unitFromSensor = (units: string | undefined): string => {
    const u = (units ?? "").trim();
    if (!u || u === "-") return "none";
    const normalized = u.replace("^2", "²").replace("deg", "°");
    const found = UNITS.find((x) => x.suffix && x.suffix.toLowerCase() === normalized.toLowerCase());
    return found ? found.id : `suffix:${u}`;
};

export const unitSuffix = (unit: string | undefined): string => {
    if (!unit) return "";
    if (unit.startsWith("suffix:")) return unit.slice(7);
    return UNITS.find((u) => u.id === unit)?.suffix ?? unit;
};

export const unitName = (unit: string | undefined): string => {
    if (!unit) return "Auto";
    if (unit.startsWith("suffix:")) return `Custom: ${unit.slice(7)}`;
    return UNITS.find((u) => u.id === unit)?.name ?? unit;
};

const autoDecimals = (value: number) => {
    const abs = Math.abs(value);
    if (abs === 0 || Number.isInteger(value)) return 0;
    if (abs >= 100) return 1;
    if (abs >= 10) return 2;
    if (abs >= 1) return 2;
    return Math.min(6, Math.max(2, 1 - Math.floor(Math.log10(abs)) + 1));
};

export interface FormattedValue {
    text: string;
    suffix: string;
}

// A value as Grafana writes it: decimals (auto or fixed) and the unit's suffix
export const formatValue = (value: number | null | undefined, unit?: string, decimals?: number, noValue = "No data"): FormattedValue => {
    if (value === null || value === undefined || !Number.isFinite(value)) return { text: noValue, suffix: "" };
    let v = value;
    let suffix = unitSuffix(unit);
    if (unit === "percentunit") v = value * 100;
    if (unit === "short") {
        const scales: [number, string][] = [[1e12, " T"], [1e9, " B"], [1e6, " Mil"], [1e3, " K"]];
        const found = scales.find(([s]) => Math.abs(v) >= s);
        if (found) {
            v = v / found[0];
            suffix = found[1].trim();
        }
    }
    const d = decimals ?? autoDecimals(v);
    const text = v.toFixed(Math.max(0, Math.min(10, d)));
    return { text: d === undefined ? String(Number(text)) : text, suffix };
};

export const formatWithUnit = (value: number | null | undefined, unit?: string, decimals?: number, noValue?: string) => {
    const f = formatValue(value, unit, decimals, noValue);
    if (!f.suffix) return f.text;
    return f.suffix === "%" || f.suffix === "°" ? `${f.text}${f.suffix}` : `${f.text} ${f.suffix}`;
};

// --- data and calculations ---------------------------------------------------------------------------------

// a bucket of admin_api: [t, mean, min, max, count, sum, last, first]
export type Bucket = (number | null)[];

const AGG_INDEX: Record<SeriesAgg, number> = { mean: 1, min: 2, max: 3, count: 4, sum: 5, last: 6, first: 7 };

export const bucketValue = (bucket: Bucket, agg: SeriesAgg = "mean"): number | null => {
    const v = bucket[AGG_INDEX[agg]] ?? (agg === "last" || agg === "first" ? bucket[1] : null);
    return v === undefined || v === null || !Number.isFinite(v) ? null : (v as number);
};

export interface Reducer {
    id: string;
    name: string;
}

export const REDUCERS: Reducer[] = [
    { id: "lastNotNull", name: "Last *" },
    { id: "last", name: "Last" },
    { id: "firstNotNull", name: "First *" },
    { id: "first", name: "First" },
    { id: "min", name: "Min" },
    { id: "max", name: "Max" },
    { id: "mean", name: "Mean" },
    { id: "sum", name: "Total" },
    { id: "count", name: "Count" },
    { id: "range", name: "Range" },
    { id: "delta", name: "Delta" },
];

export const reducerName = (id: string) => REDUCERS.find((r) => r.id === id)?.name ?? id;

// A calculation over the buckets of a series, from the aggregates of each bucket (so the mean is the mean of
// all the measurements, not of the means)
export const reduceBuckets = (buckets: Bucket[], calc: string): number | null => {
    const withData = buckets.filter((b) => (b[4] ?? 0) > 0);
    if (!withData.length) return calc === "count" ? 0 : null;
    const num = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) ? null : v);
    const lastOf = (b: Bucket) => num(b[6]) ?? num(b[1]);
    const firstOf = (b: Bucket) => num(b[7]) ?? num(b[1]);
    switch (calc) {
        case "last":
        case "lastNotNull":
            return lastOf(withData[withData.length - 1]);
        case "first":
        case "firstNotNull":
            return firstOf(withData[0]);
        case "min":
            return Math.min(...withData.map((b) => num(b[2]) ?? Infinity));
        case "max":
            return Math.max(...withData.map((b) => num(b[3]) ?? -Infinity));
        case "sum":
            return withData.reduce((a, b) => a + (num(b[5]) ?? (num(b[1]) ?? 0) * (b[4] as number)), 0);
        case "count":
            return withData.reduce((a, b) => a + (b[4] as number), 0);
        case "mean": {
            const count = withData.reduce((a, b) => a + (b[4] as number), 0);
            const sum = withData.reduce((a, b) => a + (num(b[5]) ?? (num(b[1]) ?? 0) * (b[4] as number)), 0);
            return count ? sum / count : null;
        }
        case "range":
            return Math.max(...withData.map((b) => num(b[3]) ?? -Infinity)) - Math.min(...withData.map((b) => num(b[2]) ?? Infinity));
        case "delta": {
            const first = firstOf(withData[0]);
            const last = lastOf(withData[withData.length - 1]);
            return first === null || last === null ? null : last - first;
        }
        default:
            return null;
    }
};

// --- the series of a panel, ready to draw -------------------------------------------------------------------

export interface DrawSeries {
    key: string;
    name: string;
    color: string;
    unit: string;
    axis: "left" | "right";
    hidden: boolean;
    // [t, value] per bucket, with the aggregation of the series
    values: [number, number | null][];
    buckets: Bucket[];
}

export interface SeriesSource {
    ref: ChartSeriesRef;
    label: string;
    sensorDescription: string;
    units: string;
    buckets: Bucket[];
}

// The series of a panel with their names, colours (palette, fixed, from thresholds or their own) and units
export const drawSeries = (sources: SeriesSource[], settings: ChartSettings): DrawSeries[] => {
    const d = settings.fieldConfig.defaults;
    const labels = sources.map((s) => s.label);
    return sources.map((s, i) => {
        const agg = (s.ref.agg as SeriesAgg) ?? "mean";
        const values = s.buckets.map((b): [number, number | null] => [b[0] as number, bucketValue(b, agg)]);
        const repeated = labels.filter((l) => l === s.label).length > 1;
        const name = s.ref.alias || (repeated ? `${s.label} · ${s.sensorDescription}` : s.label);
        let color = CLASSIC_PALETTE[i % CLASSIC_PALETTE.length];
        if (d.color?.mode === "fixed") color = resolveColor(d.color.fixedColor, color);
        if (d.color?.mode === "thresholds") color = thresholdColor(reduceBuckets(s.buckets, "lastNotNull"), d.thresholds, d.min, d.max);
        if (s.ref.color) color = resolveColor(s.ref.color, color);
        return {
            key: `${s.ref.sensor}|${s.ref.field}|${s.ref.index ?? ""}`,
            name,
            color,
            unit: d.unit ?? unitFromSensor(s.units),
            axis: s.ref.axis === "right" ? "right" : "left",
            hidden: !!s.ref.hide,
            values,
            buckets: s.buckets,
        };
    });
};

// what a reduced value shows: the mapping's text and colour, else the value with its unit and the thresholds'
export const displayValue = (value: number | null, unit: string, settings: ChartSettings) => {
    const d = settings.fieldConfig.defaults;
    const mapped = applyMappings(value, d.mappings);
    const formatted = formatValue(value, unit, d.decimals, d.noValue ?? "No data");
    const color = mapped?.color ? resolveColor(mapped.color) : thresholdColor(value, d.thresholds, d.min, d.max);
    return { text: mapped?.text ?? formatted.text, suffix: mapped?.text ? "" : formatted.suffix, color };
};

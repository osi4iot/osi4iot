// The visualizations drawn in HTML, as Grafana's: Stat (a big value per series, coloured by its thresholds,
// with a sparkline), Bar gauge (gradient, retro LCD or basic bars) and Table (a row per interval of time,
// coloured cells, sorting and a footer).
import { FC, useEffect, useMemo, useRef, useState } from "react";
import styled from "styled-components";
import { scrollbarStyle } from "../../../../Tools/FormTools";
import {
    Bucket,
    ChartSettings,
    DrawSeries,
    applyMappings,
    displayValue,
    formatValue,
    formatWithUnit,
    getPath,
    reduceBuckets,
    reducerName,
    resolveColor,
    sortedSteps,
    thresholdColor,
} from "./chartConfig";
import { formatBucketLabel, gaugeRange } from "./echartsOptions";

const useBoxSize = () => {
    const ref = useRef<HTMLDivElement>(null);
    const [size, setSize] = useState({ width: 0, height: 0 });
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const report = () => setSize({ width: el.clientWidth, height: el.clientHeight });
        report();
        if (typeof ResizeObserver === "undefined") return;
        const observer = new ResizeObserver(report);
        observer.observe(el);
        return () => observer.disconnect();
    }, []);
    return { ref, ...size };
};

// a click on a value (its links open)
export type ValueClick = (series: DrawSeries, value: number | null, time: number | undefined, event: React.MouseEvent) => void;

const linkable = (s: DrawSeries) => !!s.field.links?.length;

const calcOf = (settings: ChartSettings) => String((getPath(settings.options, "reduceOptions.calcs") as string[] | undefined)?.[0] ?? "lastNotNull");

const Box = styled.div`
    position: absolute;
    inset: 0;
    display: flex;
    gap: 6px;
    overflow: hidden;
`;

// --- Stat ---------------------------------------------------------------------------------------------------

const Tile = styled.div<{ $bg: string }>`
    position: relative;
    flex: 1;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 8px 12px;
    border-radius: 4px;
    background: ${({ $bg }) => $bg};
    overflow: hidden;
`;

const sparkPoints = (values: [number, number | null][], width: number, height: number) => {
    const pts = values.filter((v): v is [number, number] => v[1] !== null);
    if (pts.length < 2) return "";
    const t0 = pts[0][0];
    const t1 = pts[pts.length - 1][0];
    const vs = pts.map((p) => p[1]);
    const lo = Math.min(...vs);
    const hi = Math.max(...vs);
    const x = (t: number) => ((t - t0) / (t1 - t0 || 1)) * width;
    const y = (v: number) => height - ((v - lo) / (hi - lo || 1)) * (height * 0.9) - 2;
    return pts.map((p) => `${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join(" ");
};

export const StatViz: FC<{ series: DrawSeries[]; settings: ChartSettings; onValueClick?: ValueClick }> = ({ series, settings, onValueClick }) => {
    const { ref, width, height } = useBoxSize();
    const o = settings.options;
    const calc = calcOf(settings);
    const visible = series.filter((s) => !s.hidden);
    const colorMode = String(o.colorMode ?? "value");
    const graphMode = String(o.graphMode ?? "area");
    const justify = String(o.justifyMode ?? "auto");
    const textModeRaw = String(o.textMode ?? "auto");
    const textMode = textModeRaw === "auto" ? (visible.length > 1 ? "value_and_name" : "value") : textModeRaw;
    const horizontal = o.orientation === "horizontal" ? false : o.orientation === "vertical" ? true : width < height * 1.2;
    const n = Math.max(1, visible.length);
    const tileW = horizontal ? width : (width - 6 * (n - 1)) / n;
    const tileH = horizontal ? (height - 6 * (n - 1)) / n : height;
    const percentChange = o.showPercentChange === true;
    return (
        <Box ref={ref} style={{ flexDirection: horizontal ? "column" : "row" }}>
            {visible.length === 0 && <Empty>No data</Empty>}
            {visible.map((s) => {
                const value = reduceBuckets(s.buckets, calc);
                const shown = displayValue(value, s.unit, settings, s.field);
                const bg = colorMode === "background_solid" ? shown.color : colorMode === "background" ? `linear-gradient(120deg, ${shown.color}, ${shown.color}b3)` : "transparent";
                const onColor = colorMode.startsWith("background");
                const valueColor = onColor ? "#fff" : colorMode === "value" ? shown.color : "#e6e8eb";
                const text = `${shown.text}${shown.suffix ? ` ${shown.suffix}` : ""}`;
                const nameShown = textMode === "value_and_name" || textMode === "name";
                const valueShown = textMode !== "name" && textMode !== "none";
                const size = Math.max(12, Math.min(tileH * (nameShown ? 0.38 : 0.5), (tileW - 24) / Math.max(3, text.length * 0.62)));
                const first = reduceBuckets(s.buckets, "firstNotNull");
                const change = percentChange && first ? ((value ?? 0) - first) / Math.abs(first) : null;
                const spark = graphMode === "area" ? sparkPoints(s.values, 300, 60) : "";
                return (
                    <Tile
                        key={s.key}
                        $bg={bg}
                        data-color={shown.color}
                        aria-label={`${s.name}: ${text}`}
                        style={{ alignItems: justify === "center" ? "center" : "flex-start", cursor: linkable(s) ? "pointer" : undefined }}
                        onClick={linkable(s) ? (e) => onValueClick?.(s, value, undefined, e) : undefined}
                    >
                        {nameShown && (
                            <span style={{ fontSize: Math.max(11, Math.min(16, size * 0.32)), color: onColor ? "rgba(255,255,255,0.9)" : "#c7cbd1", zIndex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>
                                {s.name}
                            </span>
                        )}
                        {valueShown && (
                            <span style={{ fontSize: size, fontWeight: 600, lineHeight: 1.1, color: valueColor, zIndex: 1, whiteSpace: "nowrap" }}>
                                {shown.text}
                                {shown.suffix && <span style={{ fontSize: size * 0.5, fontWeight: 500 }}> {shown.suffix}</span>}
                            </span>
                        )}
                        {change !== null && Number.isFinite(change) && (
                            <span style={{ fontSize: Math.max(11, size * 0.28), color: onColor ? "#fff" : change >= 0 ? "#73BF69" : "#F2495C", zIndex: 1 }}>
                                {change >= 0 ? "↑" : "↓"} {Math.abs(change * 100).toFixed(1)}%
                            </span>
                        )}
                        {spark && (
                            <svg viewBox="0 0 300 60" preserveAspectRatio="none" aria-hidden="true" style={{ position: "absolute", left: 0, right: 0, bottom: 0, width: "100%", height: "40%" }}>
                                <polygon points={`0,60 ${spark} 300,60`} fill={onColor ? "#ffffff" : shown.color} opacity={0.18} />
                                <polyline points={spark} fill="none" stroke={onColor ? "#ffffff" : shown.color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" opacity={0.7} />
                            </svg>
                        )}
                    </Tile>
                );
            })}
        </Box>
    );
};

const Empty = styled.p`
    margin: auto;
    color: #9aa1aa;
    font-size: 13px;
`;

// --- Bar gauge ----------------------------------------------------------------------------------------------

export const BarGaugeViz: FC<{ series: DrawSeries[]; settings: ChartSettings; onValueClick?: ValueClick }> = ({ series, settings, onValueClick }) => {
    const { ref, width, height } = useBoxSize();
    const o = settings.options;
    const d = settings.fieldConfig.defaults;
    const calc = calcOf(settings);
    const visible = series.filter((s) => !s.hidden);
    const values = visible.map((s) => reduceBuckets(s.buckets, calc));
    const [min, max] = gaugeRange(values, settings);
    const vertical = o.orientation === "vertical";
    const mode = String(o.displayMode ?? "gradient");
    const valueMode = String(o.valueMode ?? "color");
    const namePlacement = String(o.namePlacement ?? "auto");
    const unfilled = o.showUnfilled !== false;
    const n = Math.max(1, visible.length);
    const steps = sortedSteps(d.thresholds?.steps ?? []);
    const gradientTo = (fraction: number) => {
        const stops = steps
            .map((s) => {
                const v = s.value === null ? min : d.thresholds?.mode === "percentage" ? min + (s.value / 100) * (max - min) : s.value;
                return { at: Math.max(0, Math.min(1, (v - min) / (max - min || 1))), color: resolveColor(s.color) };
            })
            .filter((s) => s.at <= fraction);
        if (!stops.length) return resolveColor(steps[0]?.color);
        const parts = stops.map((s) => `${s.color} ${((s.at / (fraction || 1)) * 100).toFixed(0)}%`);
        return `linear-gradient(${vertical ? "0deg" : "90deg"}, ${parts.join(", ")}${stops.length === 1 ? `, ${stops[0].color} 100%` : ""})`;
    };
    const nameOnTop = namePlacement === "top" || (namePlacement === "auto" && !vertical && height / n > 54);
    return (
        <Box ref={ref} style={{ flexDirection: vertical ? "row" : "column", justifyContent: "center", padding: "4px 6px", boxSizing: "border-box" }}>
            {visible.map((s, i) => {
                const value = values[i];
                const fraction = value === null ? 0 : Math.max(0, Math.min(1, (value - min) / (max - min || 1)));
                const shown = displayValue(value, s.unit, settings, s.field);
                const valueText = `${shown.text}${shown.suffix ? ` ${shown.suffix}` : ""}`;
                const thickness = vertical ? undefined : Math.max(Number(o.minVizHeight ?? 16), Math.min(64, (height - 8) / n - (nameOnTop ? 22 : 8)));
                const fill =
                    mode === "basic" ? shown.color : mode === "gradient" ? gradientTo(fraction) : "transparent";
                const cells = mode === "lcd" ? Math.max(8, Math.round((vertical ? height : width * 0.7) / 14)) : 0;
                return (
                    <div key={s.key} onClick={linkable(s) ? (e) => onValueClick?.(s, value, undefined, e) : undefined} style={{ cursor: linkable(s) ? "pointer" : undefined, flex: 1, minWidth: 0, minHeight: 0, display: "flex", flexDirection: vertical ? "column-reverse" : nameOnTop ? "column" : "row", alignItems: vertical ? "stretch" : nameOnTop ? "stretch" : "center", gap: 6 }}>
                        {namePlacement !== "hidden" && (
                            <span style={{ fontSize: 12, color: "#c7cbd1", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", width: !vertical && !nameOnTop ? 110 : undefined, flex: "none", textAlign: vertical ? "center" : "left" }}>
                                {s.name}
                            </span>
                        )}
                        <div style={{ flex: 1, display: "flex", flexDirection: vertical ? "column-reverse" : "row", alignItems: "center", gap: 8, minHeight: 0 }}>
                            <div
                                role="meter"
                                aria-label={s.name}
                                aria-valuemin={min}
                                aria-valuemax={max}
                                aria-valuenow={value ?? undefined}
                                aria-valuetext={valueText}
                                style={{ position: "relative", flex: 1, alignSelf: "stretch", height: vertical ? undefined : thickness, minHeight: vertical ? 20 : undefined, maxHeight: vertical ? undefined : thickness, background: unfilled ? "rgba(255,255,255,0.06)" : "transparent", borderRadius: 3, overflow: "hidden", display: "flex", flexDirection: vertical ? "column-reverse" : "row", gap: mode === "lcd" ? 2 : 0, padding: mode === "lcd" ? 2 : 0, boxSizing: "border-box" }}
                            >
                                {mode === "lcd"
                                    ? Array.from({ length: cells }, (_, c) => {
                                          const at = (c + 0.5) / cells;
                                          const cellValue = min + at * (max - min);
                                          const on = at <= fraction;
                                          const color = thresholdColor(cellValue, d.thresholds, min, max);
                                          return <span key={c} style={{ flex: 1, borderRadius: 1, background: on ? color : unfilled ? `${color}26` : "transparent" }} />;
                                      })
                                    : <span style={{ position: "absolute", left: 0, bottom: 0, [vertical ? "height" : "width"]: `${fraction * 100}%`, [vertical ? "width" : "height"]: "100%", background: fill, borderRadius: 3 } as React.CSSProperties} />}
                            </div>
                            {valueMode !== "hidden" && (
                                <span style={{ flex: "none", minWidth: vertical ? undefined : 70, fontSize: vertical ? 16 : Math.max(13, Math.min(28, (thickness ?? 24) * 0.7)), fontWeight: 600, color: valueMode === "color" ? shown.color : "#e6e8eb", textAlign: "right", whiteSpace: "nowrap" }}>
                                    {valueText}
                                </span>
                            )}
                        </div>
                    </div>
                );
            })}
            {visible.length === 0 && <Empty>No data</Empty>}
        </Box>
    );
};

// --- Table --------------------------------------------------------------------------------------------------

const TableBox = styled.div`
    position: absolute;
    inset: 0;
    overflow: auto;
    ${scrollbarStyle}

    table {
        width: 100%;
        border-collapse: collapse;
        font-size: 13px;
    }

    th {
        position: sticky;
        top: 0;
        background: #181b1f;
        color: #9aa1aa;
        font-weight: 600;
        border-bottom: 1px solid #2c3137;
        padding: 0;
        white-space: nowrap;
    }

    th button {
        width: 100%;
        height: 32px;
        padding: 0 10px;
        background: none;
        border: none;
        color: inherit;
        font: inherit;
        text-align: inherit;
        cursor: pointer;
    }

    td {
        border-bottom: 1px solid #1f2328;
        padding: 0 10px;
        white-space: nowrap;
    }

    tfoot td {
        position: sticky;
        bottom: 0;
        background: #181b1f;
        border-top: 1px solid #2c3137;
        color: #c7cbd1;
        font-weight: 600;
    }
`;

const CELL_HEIGHT: Record<string, number> = { sm: 30, md: 38, lg: 48 };

export const TableViz: FC<{ series: DrawSeries[]; settings: ChartSettings; bucketSeconds: number; onValueClick?: ValueClick }> = ({
    series,
    settings,
    bucketSeconds,
    onValueClick,
}) => {
    const o = settings.options;
    const d = settings.fieldConfig.defaults;
    const c = d.custom ?? {};
    const cellType = String(getPath(c, "cellOptions.type") ?? "auto");
    const align = String(c.align ?? "auto");
    const minWidth = Number(c.minWidth ?? 0);
    const visible = series.filter((s) => !s.hidden);
    const height = CELL_HEIGHT[String(o.cellHeight ?? "sm")] ?? 30;
    const saved = (o.sortBy as { displayName: string; desc?: boolean }[] | undefined)?.[0];
    const [sort, setSort] = useState<{ column: string; desc: boolean }>({ column: saved?.displayName ?? "Time", desc: saved ? !!saved.desc : true });
    const rows = useMemo(() => {
        const times = Array.from(new Set(visible.flatMap((s) => s.values.map(([t]) => t))));
        const maps = visible.map((s) => new Map(s.values));
        const list = times.map((t) => ({ t, values: maps.map((m) => m.get(t) ?? null) }));
        const index = visible.findIndex((s) => s.name === sort.column);
        list.sort((a, b) => {
            const va = index < 0 ? a.t : a.values[index] ?? -Infinity;
            const vb = index < 0 ? b.t : b.values[index] ?? -Infinity;
            return sort.desc ? (vb as number) - (va as number) : (va as number) - (vb as number);
        });
        return list;
    }, [visible, sort]);
    const ranges = visible.map((s) => gaugeRange(s.values.map(([, v]) => v), settings));
    const footer = (getPath(o, "footer.show") as boolean | undefined) === true;
    const footerCalc = String((getPath(o, "footer.reducer") as string[] | undefined)?.[0] ?? "sum");
    const textAlign = (numeric: boolean) => (align === "auto" ? (numeric ? "right" : "left") : align) as "left" | "right" | "center";
    const header = (name: string) => (
        <th key={name} scope="col" style={{ minWidth, textAlign: textAlign(name !== "Time") }} aria-sort={sort.column === name ? (sort.desc ? "descending" : "ascending") : "none"}>
            <button type="button" onClick={() => setSort((s) => ({ column: name, desc: s.column === name ? !s.desc : true }))}>
                {name} {sort.column === name ? (sort.desc ? "↓" : "↑") : ""}
            </button>
        </th>
    );
    const cell = (s: DrawSeries, value: number | null, i: number, key: string, time?: number) => {
        const f0 = s.field;
        const mapped = applyMappings(value, f0.mappings);
        const f = formatValue(value, s.unit, f0.decimals, "");
        const text = mapped?.text ?? (f.suffix ? `${f.text} ${f.suffix}` : f.text);
        const color = mapped?.color ? resolveColor(mapped.color) : thresholdColor(value, f0.thresholds, f0.min, f0.max);
        const style: React.CSSProperties = { height, textAlign: textAlign(true) };
        if (linkable(s) && value !== null) {
            style.cursor = "pointer";
            style.textDecoration = "underline dotted";
        }
        const onClick = linkable(s) && value !== null ? (e: React.MouseEvent) => onValueClick?.(s, value, time, e) : undefined;
        if (value !== null && (cellType === "color-text" || (mapped?.color && cellType === "auto"))) style.color = color;
        if (value !== null && cellType === "color-background") {
            style.background = color;
            style.color = "#fff";
        }
        if (cellType === "gauge") {
            const [lo, hi] = ranges[i];
            const fraction = value === null ? 0 : Math.max(0, Math.min(1, (value - lo) / (hi - lo || 1)));
            return (
                <td key={key} style={{ height, cursor: style.cursor }} onClick={onClick}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ flex: 1, height: Math.max(8, height - 18), background: "rgba(255,255,255,0.06)", borderRadius: 2 }}>
                            <div style={{ width: `${fraction * 100}%`, height: "100%", background: color, borderRadius: 2 }} />
                        </div>
                        <span style={{ minWidth: 64, textAlign: "right", color }}>{text}</span>
                    </div>
                </td>
            );
        }
        return (
            <td key={key} style={style} onClick={onClick}>
                {text}
            </td>
        );
    };
    // one row per series with its calculations (Grafana's "Reduce" transformation)
    if (o.rowMode === "series") {
        const calcs = ((o.rowCalcs as string[] | undefined) ?? ["lastNotNull", "min", "max", "mean"]).filter(Boolean);
        return (
            <TableBox>
                <table aria-label="Table">
                    {o.showHeader !== false && (
                        <thead>
                            <tr>
                                <th scope="col" style={{ textAlign: "left", padding: "0 10px", height: 32 }}>
                                    Name
                                </th>
                                {calcs.map((c2) => (
                                    <th key={c2} scope="col" style={{ minWidth, textAlign: textAlign(true), padding: "0 10px" }}>
                                        {reducerName(c2)}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                    )}
                    <tbody>
                        {visible.map((s, i) => (
                            <tr key={s.key}>
                                <td style={{ height, color: "#c7cbd1" }}>{s.name}</td>
                                {calcs.map((c2) => cell(s, reduceBuckets(s.buckets, c2), i, `${s.key}-${c2}`))}
                            </tr>
                        ))}
                    </tbody>
                </table>
                {visible.length === 0 && <Empty style={{ padding: 24, textAlign: "center" }}>No data</Empty>}
            </TableBox>
        );
    }
    return (
        <TableBox>
            <table aria-label="Table">
                {o.showHeader !== false && (
                    <thead>
                        <tr>
                            {header("Time")}
                            {visible.map((s) => header(s.name))}
                        </tr>
                    </thead>
                )}
                <tbody>
                    {rows.map((r) => (
                        <tr key={r.t}>
                            <td style={{ height, color: "#c7cbd1" }}>{formatBucketLabel(r.t, Math.min(bucketSeconds, 3600))}</td>
                            {visible.map((s, i) => cell(s, r.values[i], i, s.key, r.t))}
                        </tr>
                    ))}
                </tbody>
                {footer && (
                    <tfoot>
                        <tr>
                            <td style={{ height }}>{reducerName(footerCalc)}</td>
                            {visible.map((s) => (
                                <td key={s.key} style={{ height, textAlign: textAlign(true) }}>
                                    {formatWithUnit(reduceBuckets(s.buckets as Bucket[], footerCalc), s.unit, s.field.decimals ?? d.decimals, "-")}
                                </td>
                            ))}
                        </tr>
                    </tfoot>
                )}
            </table>
            {rows.length === 0 && <Empty style={{ padding: 24, textAlign: "center" }}>No data</Empty>}
        </TableBox>
    );
};

// --- State timeline -----------------------------------------------------------------------------------------

export interface StateSegment {
    from: number;
    to: number;
    value: number | null;
    text: string;
    color: string;
}

// The states of a series over time: each interval shows its value as the value mappings say (text and colour;
// else the value and the thresholds' colour); equal states next to each other merge
export const stateSegments = (s: DrawSeries, settings: ChartSettings, from: number, to: number, bucketSeconds: number, merge: boolean): StateSegment[] => {
    const field = s.field;
    const out: StateSegment[] = [];
    const points = s.values.filter(([t]) => t + bucketSeconds * 1000 > from && t < to);
    points.forEach(([t, v], i) => {
        const end = i + 1 < points.length ? points[i + 1][0] : Math.min(to, t + bucketSeconds * 1000);
        const shown = displayValue(v, s.unit, settings, field);
        const text = v === null ? "" : `${shown.text}${shown.suffix ? ` ${shown.suffix}` : ""}`;
        const color = v === null ? "transparent" : shown.color;
        const last = out[out.length - 1];
        if (merge && last && last.text === text && last.color === color && last.to >= t - 1) last.to = end;
        else out.push({ from: Math.max(from, t), to: end, value: v, text, color });
    });
    return out;
};

export const StateTimelineViz: FC<{ series: DrawSeries[]; settings: ChartSettings; from: number; to: number; bucketSeconds: number; onValueClick?: ValueClick }> = ({
    series,
    settings,
    from,
    to,
    bucketSeconds,
    onValueClick,
}) => {
    const o = settings.options;
    const merge = o.mergeValues !== false;
    const showValue = String(o.showValue ?? "auto");
    const align = String(o.alignValue ?? "left");
    const rowHeight = Math.max(0.2, Math.min(1, Number(o.rowHeight ?? 0.9)));
    const opacity = Number(settings.fieldConfig.defaults.custom?.fillOpacity ?? 70) / 100;
    const visible = series.filter((s) => !s.hidden);
    const span = to - from || 1;
    const legend = getPath(o, "legend.showLegend") !== false;
    const states = new Map<string, string>();
    const rows = visible.map((s) => {
        const segments = stateSegments(s, settings, from, to, bucketSeconds, merge);
        for (const seg of segments) if (seg.text && !states.has(seg.text) && states.size < 12) states.set(seg.text, seg.color);
        return { s, segments };
    });
    const ticks = Array.from({ length: 5 }, (_, i) => from + (span * (i + 0.5)) / 5);
    return (
        <Box style={{ flexDirection: "column", gap: 4 }}>
            <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", justifyContent: "space-around", gap: 4 }}>
                {rows.map(({ s, segments }) => (
                    <div key={s.key} style={{ flex: 1, minHeight: 14, display: "grid", gridTemplateColumns: "minmax(60px, 18%) minmax(0, 1fr)", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 12, color: "#c7cbd1", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.name}</span>
                        <div role="list" aria-label={`States of ${s.name}`} style={{ position: "relative", height: `${rowHeight * 100}%`, minHeight: 12 }}>
                            {segments.map((seg) => {
                                const left = ((seg.from - from) / span) * 100;
                                const width = ((seg.to - seg.from) / span) * 100;
                                const label = `${s.name}: ${seg.text || "no data"}, ${new Date(seg.from).toLocaleString()} – ${new Date(seg.to).toLocaleString()}`;
                                const show = showValue === "always" || (showValue === "auto" && width > 7);
                                return (
                                    <span
                                        key={seg.from}
                                        role="listitem"
                                        aria-label={label}
                                        title={label}
                                        onClick={linkable(s) && seg.value !== null ? (e) => onValueClick?.(s, seg.value, seg.from, e) : undefined}
                                        style={{
                                            position: "absolute",
                                            left: `${left}%`,
                                            width: `calc(${width}% - 1px)`,
                                            top: 0,
                                            bottom: 0,
                                            background: seg.color === "transparent" ? "transparent" : seg.color,
                                            opacity: seg.color === "transparent" ? 1 : Math.max(0.15, opacity),
                                            borderRadius: 2,
                                            overflow: "hidden",
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: align === "center" ? "center" : align === "right" ? "flex-end" : "flex-start",
                                            padding: "0 4px",
                                            boxSizing: "border-box",
                                            fontSize: 11,
                                            fontWeight: 600,
                                            color: "#0b0c0e",
                                            whiteSpace: "nowrap",
                                            cursor: linkable(s) ? "pointer" : undefined,
                                        }}
                                    >
                                        {show ? seg.text : ""}
                                    </span>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>
            <div aria-hidden="true" style={{ flex: "none", display: "grid", gridTemplateColumns: "minmax(60px, 18%) minmax(0, 1fr)", gap: 8, fontSize: 11, color: "#9aa1aa" }}>
                <span />
                <div style={{ position: "relative", height: 14 }}>
                    {ticks.map((t) => (
                        <span key={t} style={{ position: "absolute", left: `${((t - from) / span) * 100}%`, transform: "translateX(-50%)", whiteSpace: "nowrap" }}>
                            {formatBucketLabel(t, span > 2 * 86400_000 ? 86400 : 60)}
                        </span>
                    ))}
                </div>
            </div>
            {legend && states.size > 0 && (
                <ul aria-label="Legend" style={{ flex: "none", margin: 0, padding: 0, listStyle: "none", display: "flex", flexWrap: "wrap", gap: "4px 14px", fontSize: 12, color: "#c7cbd1" }}>
                    {Array.from(states.entries()).map(([text, color]) => (
                        <li key={text} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span aria-hidden="true" style={{ width: 12, height: 12, borderRadius: 3, background: color }} />
                            {text}
                        </li>
                    ))}
                </ul>
            )}
            {visible.length === 0 && <Empty>No data</Empty>}
        </Box>
    );
};

export const StatTimelineFallback: FC = () => <Empty>This visualization is not available</Empty>;


// A chart drawn from its settings and its data: the visualization (Time series, Bar chart, Stat, Gauge,
// Bar gauge, Table, Pie chart, State timeline, Histogram) and its legend. A click on a value opens its links.
// Used by the panels and by the panel editor.
import { FC, useCallback, useMemo, useState } from "react";
import { ChartSettings, DrawSeries, SeriesSource, displayValue, drawSeries, getPath, reduceBuckets } from "./chartConfig";
import { barchartOption, gaugeOption, histogramOption, pieOption, timeseriesOption } from "./echartsOptions";
import EchartsView from "./EchartsView";
import Legend, { legendSettings } from "./Legend";
import { BarGaugeViz, StatTimelineFallback, StatViz, StateTimelineViz, TableViz, ValueClick } from "./HtmlViz";
import { useLinkMenu } from "./Links";

export interface ChartViewProps {
    settings: ChartSettings;
    sources: SeriesSource[];
    from: number;
    to: number;
    bucketSeconds: number;
    label: string;
    // Histogram: the width of the bins
    binSize?: number;
}

const ECHARTS_VIZ = ["timeseries", "barchart", "gauge", "piechart", "histogram"];

const ChartView: FC<ChartViewProps> = ({ settings, sources, from, to, bucketSeconds, label, binSize }) => {
    const series = useMemo(() => drawSeries(sources, settings), [sources, settings]);
    // a click on a legend entry shows only that series; another click on it shows all
    const [hidden, setHidden] = useState<Set<string>>(new Set());
    const toggle = useCallback(
        (key: string) => {
            setHidden((current) => {
                const others = series.filter((s) => s.key !== key && !s.hidden).map((s) => s.key);
                const isolated = !current.has(key) && others.every((k) => current.has(k)) && others.length > 0;
                return isolated ? new Set() : new Set(others);
            });
        },
        [series],
    );
    const [box, setBox] = useState({ width: 0, height: 0 });
    const onSize = useCallback((width: number, height: number) => setBox((b) => (b.width === width && b.height === height ? b : { width, height })), []);
    const links = useLinkMenu();
    const onValueClick: ValueClick = (s, value, time, event) => {
        const shown = displayValue(value, s.unit, settings, s.field);
        links.open(s.field.links, { value, text: shown.text, time, seriesName: s.name, from, to }, event.clientX, event.clientY);
    };
    const option = useMemo(() => {
        if (settings.viz === "timeseries") return timeseriesOption({ series, settings, from, to, bucketSeconds, hidden });
        if (settings.viz === "barchart") return barchartOption({ series, settings, from, to, bucketSeconds, hidden });
        if (settings.viz === "gauge") return box.width ? gaugeOption({ series, settings, width: box.width, height: box.height }) : null;
        if (settings.viz === "piechart") return pieOption({ series, settings, hidden });
        if (settings.viz === "histogram") return histogramOption({ series, settings, size: binSize ?? 1, hidden });
        return null;
    }, [series, settings, from, to, bucketSeconds, hidden, box, binSize]);

    // the series behind a click of ECharts (the visible ones, in order)
    const onChartClick = (params: { seriesIndex?: number; dataIndex?: number; value?: unknown }, x: number, y: number) => {
        const visible = series.filter((s) => !s.hidden && !hidden.has(s.key));
        let s: DrawSeries | undefined;
        let value: number | null = null;
        let time: number | undefined;
        if (settings.viz === "piechart") {
            s = visible[params.dataIndex ?? -1];
            value = typeof params.value === "number" ? params.value : null;
        } else if (settings.viz === "gauge") {
            s = series.filter((x2) => !x2.hidden)[params.seriesIndex ?? -1];
            value = s ? reduceBuckets(s.buckets, String((getPath(settings.options, "reduceOptions.calcs") as string[] | undefined)?.[0] ?? "lastNotNull")) : null;
        } else {
            s = visible[params.seriesIndex ?? -1];
            const v = params.value;
            if (Array.isArray(v)) {
                time = typeof v[0] === "number" ? v[0] : undefined;
                value = typeof v[1] === "number" ? v[1] : null;
            } else if (typeof v === "number") value = v;
        }
        if (!s?.field.links?.length) return;
        const shown = displayValue(value, s.unit, settings, s.field);
        links.open(s.field.links, { value, text: shown.text, time, seriesName: s.name, from, to }, x, y);
    };

    let body;
    if (settings.viz === "stat") body = <StatViz series={series} settings={settings} onValueClick={onValueClick} />;
    else if (settings.viz === "bargauge") body = <BarGaugeViz series={series} settings={settings} onValueClick={onValueClick} />;
    else if (settings.viz === "table") body = <TableViz series={series} settings={settings} bucketSeconds={bucketSeconds} onValueClick={onValueClick} />;
    else if (settings.viz === "statetimeline")
        body = <StateTimelineViz series={series} settings={settings} from={from} to={to} bucketSeconds={bucketSeconds} onValueClick={onValueClick} />;
    else if (ECHARTS_VIZ.includes(settings.viz)) {
        const legend = legendSettings(settings);
        const withLegend = legend.show && settings.viz !== "gauge" && series.some((s) => !s.hidden && !s.hideFromLegend);
        const right = legend.placement === "right";
        const legendSettingsForViz =
            settings.viz === "piechart"
                ? { ...settings, options: { ...settings.options, legend: { ...(settings.options.legend as object), calcs: pieLegendCalcs(settings) } } }
                : settings;
        body = (
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: right ? "row" : "column", gap: 6 }}>
                <div style={{ position: "relative", flex: 1, minWidth: 0, minHeight: 0 }}>
                    <EchartsView option={option} label={label} onSize={onSize} onClick={onChartClick} />
                </div>
                {withLegend && <Legend series={series} settings={legendSettingsForViz} hidden={hidden} onToggle={toggle} percentOf={settings.viz === "piechart" ? pieTotal(series, settings) : undefined} />}
            </div>
        );
    } else body = <StatTimelineFallback />;

    return (
        <div ref={links.boxRef} style={{ position: "absolute", inset: 0 }}>
            {body}
            {links.element}
        </div>
    );
};

// the pie's legend shows the reduced value and/or its percent (Legend › Values)
const pieLegendCalcs = (settings: ChartSettings) => {
    const values = (getPath(settings.options, "legend.values") as string[] | undefined) ?? [];
    const calc = String((getPath(settings.options, "reduceOptions.calcs") as string[] | undefined)?.[0] ?? "lastNotNull");
    return values.map((v) => (v === "percent" ? "percent" : calc));
};

const pieTotal = (series: DrawSeries[], settings: ChartSettings) => {
    const calc = String((getPath(settings.options, "reduceOptions.calcs") as string[] | undefined)?.[0] ?? "lastNotNull");
    return series.filter((s) => !s.hidden).reduce((a, s) => a + Math.abs(reduceBuckets(s.buckets, calc) ?? 0), 0);
};

export default ChartView;

// A chart drawn from its settings and its data: the visualization (Time series, Bar chart, Stat, Gauge,
// Bar gauge, Table) and, for the first two, the legend. Used by the panels and by the panel editor.
import { FC, useCallback, useMemo, useState } from "react";
import { ChartSettings, SeriesSource, drawSeries } from "./chartConfig";
import { barchartOption, gaugeOption, timeseriesOption } from "./echartsOptions";
import EchartsView from "./EchartsView";
import Legend, { legendSettings } from "./Legend";
import { BarGaugeViz, StatViz, TableViz } from "./HtmlViz";

export interface ChartViewProps {
    settings: ChartSettings;
    sources: SeriesSource[];
    from: number;
    to: number;
    bucketSeconds: number;
    label: string;
}

const ChartView: FC<ChartViewProps> = ({ settings, sources, from, to, bucketSeconds, label }) => {
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
    const option = useMemo(() => {
        if (settings.viz === "timeseries") return timeseriesOption({ series, settings, from, to, bucketSeconds, hidden });
        if (settings.viz === "barchart") return barchartOption({ series, settings, from, to, bucketSeconds, hidden });
        if (settings.viz === "gauge") return box.width ? gaugeOption({ series, settings, width: box.width, height: box.height }) : null;
        return null;
    }, [series, settings, from, to, bucketSeconds, hidden, box]);

    if (settings.viz === "stat") return <StatViz series={series} settings={settings} />;
    if (settings.viz === "bargauge") return <BarGaugeViz series={series} settings={settings} />;
    if (settings.viz === "table") return <TableViz series={series} settings={settings} bucketSeconds={bucketSeconds} />;

    const legend = legendSettings(settings);
    const withLegend = legend.show && settings.viz !== "gauge" && series.some((s) => !s.hidden);
    const right = legend.placement === "right";
    return (
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: right ? "row" : "column", gap: 6 }}>
            <div style={{ position: "relative", flex: 1, minWidth: 0, minHeight: 0 }}>
                <EchartsView option={option} label={label} onSize={onSize} />
            </div>
            {withLegend && <Legend series={series} settings={settings} hidden={hidden} onToggle={toggle} />}
        </div>
    );
};

export default ChartView;

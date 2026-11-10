// A chart panel of the Viewer page, drawn as a Grafana panel (Time series, Bar chart, Stat, Gauge, Bar gauge,
// Table; charts/). Its data: the fields of the asset's sensors aggregated by interval of time in admin_api
// (/time_series), over the range of the page (or the panel's own relative time and time shift), asked for
// again at every refresh of the page.
import { FC, useEffect, useMemo, useRef, useState } from "react";
import styled from "styled-components";
import { WorkspacePanel } from "./workspaceLayout";
import { ChartSeriesOption, TimeSeriesResponse, formatBucket, resolveSeries } from "./chartSeries";
import { TimeSeriesQuery } from "./timeSeriesApi";
import { Bucket, ChartSettings, SeriesSource, chartSettingsOf } from "./charts/chartConfig";
import { TimeRange, panelTimeRange, spanMs } from "./charts/timeRange";
import ChartView from "./charts/ChartView";

const font = `Roboto, "Helvetica Neue", Arial, sans-serif`;
const MIN_POINTS = 30;
const MAX_POINTS = 1000;

const Wrap = styled.div`
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    font-family: ${font};
`;

const Plot = styled.div`
    position: relative;
    flex: 1;
    min-height: 0;
    margin: 6px 10px 8px;
`;

const Message = styled.p<{ $error?: boolean }>`
    position: absolute;
    inset: 0;
    margin: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 12px;
    text-align: center;
    font-size: 13px;
    color: ${({ $error }) => ($error ? "#ff7383" : "#9aa1aa")};
    pointer-events: none;
`;

const Notes = styled.div`
    flex: none;
    display: flex;
    justify-content: flex-end;
    padding-bottom: 2px;
    gap: 6px;
    font-size: 11px;
    pointer-events: none;

    span {
        padding: 1px 6px;
        border-radius: 4px;
        background: rgba(20, 22, 25, 0.85);
        white-space: nowrap;
    }
`;

export type FetchSeries = (query: TimeSeriesQuery, signal: AbortSignal) => Promise<TimeSeriesResponse>;

export interface ChartDataState {
    settings: ChartSettings;
    sources: SeriesSource[];
    data: TimeSeriesResponse | null;
    range: TimeRange;
    info: string | null;
    error: string | null;
    loading: boolean;
    missing: number;
    hasSeries: boolean;
}

// The data of a chart panel: asked for when the panel, the range or the refresh tick change
export const useChartData = (
    panel: WorkspacePanel,
    options: ChartSeriesOption[],
    groupId: number,
    pageRange: TimeRange,
    refreshTick: number,
    fetchSeries: FetchSeries,
    width: number,
    paused = false,
    now: () => number = Date.now,
): ChartDataState => {
    const settings = useMemo(() => chartSettingsOf(panel), [panel]);
    const refs = useMemo(() => (panel.series ?? []).filter((s) => !s.hide), [panel.series]);
    const { found, missing } = useMemo(() => resolveSeries(refs, options), [refs, options]);
    const [data, setData] = useState<TimeSeriesResponse | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const { range, info } = useMemo(
        () => panelTimeRange(pageRange, now(), panel.timeFrom, panel.timeShift),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [pageRange, panel.timeFrom, panel.timeShift, refreshTick],
    );
    const auto = Math.min(MAX_POINTS, Math.max(MIN_POINTS, Math.round(width / (settings.viz === "barchart" ? 24 : 2))));
    const points = panel.maxDataPoints ?? (Math.round(auto / 20) * 20 || 300);
    const query = useMemo(() => found.map(({ sensorId, field, index }) => ({ sensorId, field, index })), [found]);
    const queryKey = JSON.stringify(query);
    const requested = useRef(0);
    // the request on its way: a refresh does not cancel it (with a fast refresh, a slow query would never
    // finish); the refresh is skipped and the next one asks again
    const inFlight = useRef<{ controller: AbortController; key: string } | null>(null);
    const lastTick = useRef(refreshTick);
    const histogramKey = settings.viz === "histogram" ? JSON.stringify([settings.options.bucketCount, settings.options.bucketSize, settings.options.bucketOffset]) : "";
    useEffect(() => () => inFlight.current?.controller.abort(), []);

    useEffect(() => {
        const byRefresh = refreshTick !== lastTick.current;
        lastTick.current = refreshTick;
        if (paused || width === 0) {
            inFlight.current?.controller.abort();
            inFlight.current = null;
            return;
        }
        if (query.length === 0) {
            inFlight.current?.controller.abort();
            inFlight.current = null;
            setLoading(false);
            setData(null);
            return;
        }
        const key = JSON.stringify([groupId, queryKey, points, panel.interval, histogramKey]);
        if (byRefresh && inFlight.current?.key === key) return;
        inFlight.current?.controller.abort();
        const controller = new AbortController();
        const request = { controller, key };
        inFlight.current = request;
        const id = ++requested.current;
        setLoading(true);
        const histogram =
            settings.viz === "histogram"
                ? {
                      bins: Math.max(1, Math.min(500, Math.round(Number(settings.options.bucketCount ?? 30)) || 30)),
                      size: typeof settings.options.bucketSize === "number" ? settings.options.bucketSize : undefined,
                      offset: typeof settings.options.bucketOffset === "number" ? settings.options.bucketOffset : undefined,
                  }
                : undefined;
        fetchSeries({ groupId, series: query, from: range.from, to: range.to, points, interval: panel.interval, histogram }, controller.signal)
            .then((result) => {
                if (id !== requested.current) return;
                setData(result);
                setError(null);
            })
            .catch((err: any) => {
                if (id !== requested.current || err?.name === "CanceledError" || err?.name === "AbortError") return;
                setError(err?.response?.data?.message || err?.message || "The data could not be read");
            })
            .finally(() => {
                if (inFlight.current === request) inFlight.current = null;
                if (id === requested.current) setLoading(false);
            });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [groupId, queryKey, range.from, range.to, points, panel.interval, fetchSeries, paused, width === 0, refreshTick, histogramKey]);

    const sources = useMemo<SeriesSource[]>(() => {
        if (!data) return [];
        return found.map((option, i) => {
            const answer = data.series[i];
            const ref = refs.find((r) => r.sensor === option.sensor && r.field === option.field && (r.index ?? null) === (option.index ?? null)) ?? option;
            return {
                ref,
                label: answer?.label ?? option.label,
                sensorDescription: option.sensorDescription,
                units: answer?.units ?? option.units,
                buckets: (answer?.points ?? []) as Bucket[],
                bins: answer?.bins,
            };
        });
    }, [data, found, refs]);

    return { settings, sources, data, range, info, error, loading, missing: missing.length, hasSeries: found.length > 0 };
};

export interface ChartPanelProps {
    panel: WorkspacePanel;
    groupId: number;
    options: ChartSeriesOption[];
    fetchSeries: FetchSeries;
    // the range of the page and its refresh tick (a new number: ask again)
    pageRange: TimeRange;
    refreshTick: number;
    // the page is not shown (the Pipeline view): no requests
    paused?: boolean;
    now?: () => number;
}

const ChartPanel: FC<ChartPanelProps> = ({ panel, groupId, options, fetchSeries, pageRange, refreshTick, paused = false, now }) => {
    const plotRef = useRef<HTMLDivElement>(null);
    const [width, setWidth] = useState(0);
    useEffect(() => {
        const el = plotRef.current;
        if (!el) return;
        const report = () => setWidth(el.clientWidth || 600);
        report();
        if (typeof ResizeObserver === "undefined") return;
        const observer = new ResizeObserver(() => setWidth((w) => (Math.abs(w - el.clientWidth) > 40 ? el.clientWidth : w)));
        observer.observe(el);
        return () => observer.disconnect();
    }, []);
    const state = useChartData(panel, options, groupId, pageRange, refreshTick, fetchSeries, width, paused, now);
    return (
        <Wrap>
            <Plot ref={plotRef} className="ws-no-drag">
                <ChartBody state={state} label={panel.title || "Chart"} />
            </Plot>
        </Wrap>
    );
};

export const ChartBody: FC<{ state: ChartDataState; label: string }> = ({ state, label }) => {
    const { settings, sources, data, range, info, error, loading, missing, hasSeries } = state;
    let message: { text: string; error?: boolean } | null = null;
    if (!hasSeries) message = { text: missing ? "The sensors of this chart no longer exist." : "This chart has no series. Edit it to add some.", error: missing > 0 };
    else if (error && !data) message = { text: error, error: true };
    else if (loading && !data) message = { text: "Loading…" };
    else if (data && !data.series.some((s) => (s.points?.length ?? 0) > 0 || (s.bins?.length ?? 0) > 0)) message = { text: "No data" };
    const bucket = data?.bucketSeconds ?? 10;
    const notes = !!(info || (missing > 0 && hasSeries) || (error && data));
    return (
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column" }}>
            {notes && (
                <Notes>
                    {info && <span style={{ color: "#9cc2ff" }}>{info}</span>}
                    {missing > 0 && hasSeries && <span style={{ color: "#f2cc0c" }}>{missing === 1 ? "1 series no longer exists" : `${missing} series no longer exist`}</span>}
                    {error && data && (
                        <span style={{ color: "#ff7383" }} title={error}>
                            Not updated
                        </span>
                    )}
                </Notes>
            )}
            <div style={{ position: "relative", flex: 1, minHeight: 0 }}>
                {data && !message && (
                    <ChartView
                        settings={settings}
                        sources={sources}
                        from={range.from}
                        to={range.to}
                        bucketSeconds={bucket}
                        binSize={data.histogram?.size}
                        label={data.histogram ? `${label} (histogram)` : `${label} (${settings.viz}, ${formatBucket(bucket)} intervals)`}
                    />
                )}
                {message && <Message $error={message.error}>{message.text}</Message>}
            </div>
        </div>
    );
};

export const intervalSeconds = (text?: string) => (spanMs(text) ?? 0) / 1000;

export default ChartPanel;


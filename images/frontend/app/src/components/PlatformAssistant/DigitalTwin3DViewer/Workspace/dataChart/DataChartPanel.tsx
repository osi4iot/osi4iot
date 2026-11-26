// A Data chart panel on the Viewer page (dataChart.ts): its chart drawn again when the data it follows arrives (at
// most 4 times a second). 2D charts and heat maps with ECharts; 3D surfaces and points with ECharts GL, loaded the
// first time one is shown.
import { FC, Suspense, lazy, useEffect, useMemo, useRef } from "react";
import styled from "styled-components";
import { LiveValueStore, useLiveTick } from "../liveValues";
import EchartsView from "../charts/EchartsView";
import { createChartPointer } from "../charts/echartsOptions";
import { PlaybackState, playbackOf, subscribePlayback } from "../playbackClock";
import { computeSurface, surfaceChartOption } from "../surface/surfacePanel";
import {
    DataChartOptions,
    HeldRange,
    computeDataSeries,
    dataChartSources,
    dataExtent,
    heatmapChartOption,
    holdRange,
    isGridKind,
    points3dChartOption,
    xyChartOption,
} from "./dataChart";

const Chart3D = lazy(() => import("../surface/SurfaceChart"));

const Box = styled.div`
    position: absolute;
    inset: 0;
`;

const Message = styled.p<{ $warn?: boolean }>`
    margin: 12px;
    color: ${({ $warn }) => ($warn ? "#d6a35c" : "#9aa1aa")};
    font-size: 13px;
`;

const Note = styled.p`
    position: absolute;
    left: 8px;
    bottom: 4px;
    right: 8px;
    margin: 0;
    color: #9aa1aa;
    font-size: 11px;
    pointer-events: none;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
`;

// the playback cursor: the time played by the Picture panel of the frame
const Cursor = styled.div`
    position: absolute;
    width: 0;
    border-left: 2px solid #f0a23d;
    transform: translateX(-1px);
    pointer-events: none;
    z-index: 1;
`;

const noMessages = () => undefined;

const timeOf = (ms: number | undefined) =>
    ms
        ? new Date(ms).toLocaleTimeString(undefined, {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
          })
        : "";

export interface DataChartViewProps {
    data?: DataChartOptions;
    // the last messages of the topics, and the state of the asset (as the source "@assetState")
    store?: LiveValueStore;
    label?: string;
    // the playback clock of the frame (a Picture panel that plays series): the chart's cursor follows it
    clockKey?: string;
}

// what the panel shows: a message, or a chart (typed, so that "error" in it tells one from the other: the object
// literals of the memo, left to inference, are widened with an optional error each)
type Drawn = { error: string } | { option: Record<string, unknown>; three: boolean; notes: string[]; receivedAt?: number };

export const DataChartView: FC<DataChartViewProps> = ({ data, store, label = "Data chart", clockKey }) => {
    // the playback cursor: a line moved at each time of the clock (no new drawing of the chart)
    const pointer = useMemo(createChartPointer, []);
    const cursorRef = useRef<HTMLDivElement>(null);
    const showsCursor = !!clockKey && data?.kind === "xy" && !!data.cursor;
    useEffect(() => {
        if (!showsCursor || !clockKey) return;
        const place = ({ time }: PlaybackState) => {
            const line = cursorRef.current;
            if (!line) return;
            const px = time === null ? null : (pointer.toPixelX?.(time) ?? null);
            const rect = pointer.plotRect?.() ?? null;
            if (px === null || !rect || px < rect.x - 0.5 || px > rect.x + rect.width + 0.5) {
                line.style.display = "none";
                return;
            }
            line.style.display = "block";
            line.style.left = `${px}px`;
            line.style.top = `${rect.y}px`;
            line.style.height = `${rect.height}px`;
        };
        place(playbackOf(clockKey));
        return subscribePlayback(clockKey, place);
    }, [showsCursor, clockKey, pointer]);
    const sources = useMemo(() => dataChartSources(data), [data]);
    const tick = useLiveTick(store, sources, 250);
    const get = store ? store.get : noMessages;
    // the ranges the axes keep while the chart is shown (a chart that does not rescale); new ones when it is edited
    const dataKey = useMemo(() => JSON.stringify(data ?? null), [data]);
    const held = useRef<{ key?: string; x: HeldRange | null; y: HeldRange | null }>({ x: null, y: null });
    if (held.current.key !== dataKey) held.current = { key: dataKey, x: null, y: null };
    const drawn = useMemo((): Drawn => {
        if (!data) return { error: "Edit the panel to define its chart" };
        if (isGridKind(data.kind)) {
            if (!data.surface) return { error: "Edit the panel to define its grid" };
            const result = computeSurface(data.surface, get);
            if ("error" in result) return result;
            const receivedAt = data.surface.mode === "data" && data.surface.topicRef ? get(data.surface.topicRef)?.receivedAt : undefined;
            return {
                option: data.kind === "surface" ? surfaceChartOption(data.surface, result.grid) : heatmapChartOption(data.surface, result.grid),
                three: data.kind === "surface",
                notes: result.note ? [result.note] : [],
                receivedAt,
            };
        }
        const result = computeDataSeries(data, get);
        if ("error" in result) return result;
        let ranges: { x: HeldRange | null; y: HeldRange | null } | undefined;
        if (data.kind === "xy" && !data.rescale) {
            const h = held.current;
            // x without room (a time from 0 to 4 s keeps 0 to 4); y with a little, so a curve does not touch the frame
            if (data.xMin === undefined) h.x = holdRange(h.x, dataExtent(result, 0, !!data.xLog), !!data.xLog, 0);
            if (data.yMin === undefined) h.y = holdRange(h.y, dataExtent(result, 1, !!data.yLog), !!data.yLog);
            ranges = { x: h.x, y: h.y };
        }
        return {
            option: data.kind === "points3d" ? points3dChartOption(data, result) : xyChartOption(data, result, ranges),
            three: data.kind === "points3d",
            notes: result.notes,
            receivedAt: result.receivedAt,
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data, store, tick]);

    if ("error" in drawn) return <Message $warn={!drawn.error.startsWith("Waiting")}>{drawn.error}</Message>;
    const at = timeOf(drawn.receivedAt);
    const note = [at ? `Data of ${at}` : "", ...drawn.notes].filter(Boolean).join(" · ");
    return (
        <Box>
            {drawn.three ? (
                <Suspense fallback={<Message>Loading the 3D chart…</Message>}>
                    <Chart3D option={drawn.option} label={label} />
                </Suspense>
            ) : (
                <div style={{ position: "absolute", inset: note ? "0 0 16px 0" : 0 }}>
                    <EchartsView option={drawn.option} label={label} pointer={showsCursor ? pointer : undefined} />
                    {showsCursor && <Cursor ref={cursorRef} aria-hidden="true" style={{ display: "none" }} />}
                </div>
            )}
            {note && <Note title={note}>{note}</Note>}
        </Box>
    );
};

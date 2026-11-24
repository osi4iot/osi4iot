// A Data chart panel on the Viewer page (dataChart.ts): its chart drawn again when the data it follows arrives (at
// most 4 times a second). 2D charts and heat maps with ECharts; 3D surfaces and points with ECharts GL, loaded the
// first time one is shown.
import { FC, Suspense, lazy, useMemo } from "react";
import styled from "styled-components";
import { LiveValueStore, useLiveTick } from "../liveValues";
import EchartsView from "../charts/EchartsView";
import { computeSurface, surfaceChartOption } from "../surface/surfacePanel";
import { DataChartOptions, computeDataSeries, dataChartSources, heatmapChartOption, isGridKind, points3dChartOption, xyChartOption } from "./dataChart";

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
}

export const DataChartView: FC<DataChartViewProps> = ({ data, store, label = "Data chart" }) => {
    const sources = useMemo(() => dataChartSources(data), [data]);
    const tick = useLiveTick(store, sources, 250);
    const get = store ? store.get : noMessages;
    const drawn = useMemo(() => {
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
        return {
            option: data.kind === "points3d" ? points3dChartOption(data, result) : xyChartOption(data, result),
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
                    <EchartsView option={drawn.option} label={label} />
                </div>
            )}
            {note && <Note title={note}>{note}</Note>}
        </Box>
    );
};

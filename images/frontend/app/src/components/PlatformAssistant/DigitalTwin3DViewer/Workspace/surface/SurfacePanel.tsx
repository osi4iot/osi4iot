// A 3D Surface panel on the Viewer page: the surface of its formula or of the grid of a message, recomputed when
// the values it follows arrive (at most 4 times a second). The chart (ECharts GL) is loaded the first time one is
// shown.
import { FC, Suspense, lazy, useMemo } from "react";
import styled from "styled-components";
import { LiveValueStore, useLiveTick } from "../liveValues";
import { SurfaceOptions, computeSurface, surfaceChartOption, surfaceTopics } from "./surfacePanel";

const SurfaceChart = lazy(() => import("./SurfaceChart"));

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
    bottom: 6px;
    right: 60px;
    margin: 0;
    color: #9aa1aa;
    font-size: 11px;
    pointer-events: none;
`;

const noMessages = () => undefined;

export const SurfaceView: FC<{ surface?: SurfaceOptions; store?: LiveValueStore; label?: string }> = ({ surface, store, label = "3D Surface" }) => {
    const topics = useMemo(() => surfaceTopics(surface), [surface]);
    const tick = useLiveTick(store, topics, 250);
    const result = useMemo(
        () => (surface ? computeSurface(surface, store ? store.get : noMessages) : { error: "Edit the panel to define its surface" }),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [surface, store, tick],
    );
    const option = useMemo(() => (surface && "grid" in result ? surfaceChartOption(surface, result.grid) : null), [surface, result]);
    if ("error" in result || !option) return <Message $warn={"error" in result && !result.error.startsWith("Waiting")}>{"error" in result ? result.error : ""}</Message>;
    return (
        <Box>
            <Suspense fallback={<Message>Loading the 3D surface…</Message>}>
                <SurfaceChart option={option} label={label} />
            </Suspense>
            {result.note && <Note>{result.note}</Note>}
        </Box>
    );
};

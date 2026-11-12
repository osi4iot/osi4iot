// The scrollbars of the pipeline editor (as Node-RED): a horizontal and a vertical bar, in the style of the
// platform, that move the view over the pipeline. Their range is the box of all the nodes plus a margin, joined
// with what is shown now, so they follow the zoom and the nodes added or moved. Drag a thumb, or click the track
// to move a page. (React Flow has none: its canvas has no end.)
import { FC, PointerEvent as ReactPointerEvent, useLayoutEffect, useRef, useState } from "react";
import styled from "styled-components";
import { getNodesBounds, useNodes, useReactFlow, useStore } from "@xyflow/react";

const BAR = 10;
const GAP = 4;
// space around the nodes that can be scrolled to (screen pixels)
const MARGIN = 120;

const Track = styled.div<{ $vertical: boolean }>`
    position: absolute;
    z-index: 6;
    ${({ $vertical }) =>
        $vertical
            ? `top: ${GAP}px; bottom: ${BAR + 2 * GAP}px; right: ${GAP}px; width: ${BAR}px;`
            : `left: ${GAP}px; right: ${BAR + 2 * GAP}px; bottom: ${GAP}px; height: ${BAR}px;`}
    background: #202226;
    border-radius: ${BAR / 2}px;
    opacity: 0.85;
    cursor: default;

    &:hover {
        opacity: 1;
    }
`;

const Thumb = styled.div<{ $vertical: boolean }>`
    position: absolute;
    ${({ $vertical }) => ($vertical ? "left: 0; right: 0;" : "top: 0; bottom: 0;")}
    background: #2c3235;
    border-radius: ${BAR / 2}px;
    touch-action: none;

    &:hover,
    &.dragging {
        background: #343840;
    }
`;

// The view of a pipeline when it is opened: zoom 1, the top left corner of its nodes at `margin` pixels from the
// top left corner of the canvas
export const PIPELINE_MARGIN = 40;
export const topLeftViewport = (bounds: { x: number; y: number }, margin = PIPELINE_MARGIN, zoom = 1) => ({
    x: margin - bounds.x * zoom,
    y: margin - bounds.y * zoom,
    zoom,
});

// how far what is shown can move along one axis (screen pixels): not past the content (and its margin), but it
// can always come back to it
export const clampScroll = (delta: number, start: number, end: number, view: number, margin = MARGIN): number => {
    const most = Math.max(0, end + margin - view);
    const least = Math.min(0, start - margin);
    return Math.max(least, Math.min(most, delta));
};

export interface ScrollGeometry {
    // the range that can be scrolled to and what is shown, in screen pixels along one axis
    total: number;
    // where what is shown starts within the range
    offset: number;
    view: number;
}

// one axis: the content (from `start` to `end`, screen pixels, with the view at 0..view)
export const scrollGeometry = (start: number, end: number, view: number, margin = MARGIN): ScrollGeometry | null => {
    if (start >= 0 && end <= view) return null; // every node is shown: no bar
    const min = Math.min(start - margin, 0);
    const max = Math.max(end + margin, view);
    const total = max - min;
    if (total <= view + 1) return null; // everything is shown: no bar
    return { total, offset: -min, view };
};

const Bar: FC<{ vertical: boolean; geometry: ScrollGeometry; onScroll: (deltaScreen: number) => void }> = ({ vertical, geometry, onScroll }) => {
    const trackRef = useRef<HTMLDivElement>(null);
    const drag = useRef<{ pointer: number; scale: number } | null>(null);
    const { total, offset, view } = geometry;
    // the length of the track (it changes with the size of the editor)
    const [length, setLength] = useState(1);
    useLayoutEffect(() => {
        const track = trackRef.current;
        if (!track) return;
        const measure = () => setLength((vertical ? track.clientHeight : track.clientWidth) || 1);
        measure();
        const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
        observer?.observe(track);
        return () => observer?.disconnect();
    }, [vertical]);
    const thumb = Math.max(24, (view / total) * length);
    const at = (offset / (total - view)) * (length - thumb);
    const position = (e: { clientX: number; clientY: number }) => (vertical ? e.clientY : e.clientX);

    return (
        <Track
            ref={trackRef}
            $vertical={vertical}
            className="nopan nodrag nowheel"
            role="scrollbar"
            aria-orientation={vertical ? "vertical" : "horizontal"}
            aria-label={vertical ? "Scroll the pipeline up and down" : "Scroll the pipeline left and right"}
            aria-valuemin={0}
            aria-valuemax={Math.round(total - view)}
            aria-valuenow={Math.round(offset)}
            onPointerDown={(e) => {
                // a click on the track: a page towards it
                if (e.target !== e.currentTarget) return;
                const box = trackRef.current!.getBoundingClientRect();
                const where = position(e) - (vertical ? box.top : box.left);
                onScroll(where < at ? -view * 0.9 : view * 0.9);
            }}
        >
            <Thumb
                $vertical={vertical}
                style={vertical ? { top: at, height: thumb } : { left: at, width: thumb }}
                onPointerDown={(e: ReactPointerEvent<HTMLDivElement>) => {
                    e.stopPropagation();
                    e.currentTarget.setPointerCapture(e.pointerId);
                    e.currentTarget.classList.add("dragging");
                    // a pixel of the thumb is this many pixels of the pipeline
                    drag.current = { pointer: position(e), scale: (total - view) / Math.max(1, length - thumb) };
                }}
                onPointerMove={(e) => {
                    if (!drag.current) return;
                    const delta = position(e) - drag.current.pointer;
                    drag.current.pointer = position(e);
                    onScroll(delta * drag.current.scale);
                }}
                onPointerUp={(e) => {
                    drag.current = null;
                    e.currentTarget.classList.remove("dragging");
                }}
            />
        </Track>
    );
};

const FlowScrollbars: FC = () => {
    const nodes = useNodes();
    const [x, y, zoom] = useStore((s) => s.transform);
    const width = useStore((s) => s.width);
    const height = useStore((s) => s.height);
    const { setViewport, getViewport } = useReactFlow();
    if (!nodes.length || !width || !height) return null;
    const bounds = getNodesBounds(nodes);
    const horizontal = scrollGeometry(bounds.x * zoom + x, (bounds.x + bounds.width) * zoom + x, width);
    const vertical = scrollGeometry(bounds.y * zoom + y, (bounds.y + bounds.height) * zoom + y, height);
    // moving what is shown by `delta` screen pixels moves the pipeline the other way
    const scrollBy = (dx: number, dy: number) => {
        const v = getViewport();
        const left = bounds.x * v.zoom + v.x;
        const top = bounds.y * v.zoom + v.y;
        const cx = clampScroll(dx, left, left + bounds.width * v.zoom, width);
        const cy = clampScroll(dy, top, top + bounds.height * v.zoom, height);
        void setViewport({ x: v.x - cx, y: v.y - cy, zoom: v.zoom });
    };
    return (
        <>
            {horizontal && <Bar vertical={false} geometry={horizontal} onScroll={(d) => scrollBy(d, 0)} />}
            {vertical && <Bar vertical geometry={vertical} onScroll={(d) => scrollBy(0, d)} />}
        </>
    );
};

export default FlowScrollbars;

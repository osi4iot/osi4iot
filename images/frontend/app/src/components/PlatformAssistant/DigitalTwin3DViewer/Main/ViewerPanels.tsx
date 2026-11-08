// The pieces of the Viewer page (viewerLayout.ts): the bar of a panel with its "Full page" button, the
// splitter between the panels, and the floating bar that brings a full page panel back to the split view.
import { FC, KeyboardEvent, PointerEvent, ReactNode, useRef } from "react";
import styled, { css } from "styled-components";
import { Box, Camera, Maximize2, Minimize2 } from "lucide-react";
import { PANEL_HEADER_HEIGHT, Rect, clampShare } from "./viewerLayout";

// A panel of the Viewer page: framed in the split view, bare full page
export const ViewerPanel = styled.div<{ $framed: boolean }>`
    box-sizing: border-box;
    ${({ $framed }) =>
        $framed &&
        css`
            background-color: #141619;
            border: 1px solid #262a2f;
            border-radius: 12px;
            overflow: hidden;
        `}
`;

// height of the floating "Back to split view" bar
export const BACK_TO_SPLIT_HEIGHT = 46;

const Bar = styled.div`
    position: absolute;
    left: 0;
    right: 0;
    top: 0;
    height: ${PANEL_HEADER_HEIGHT}px;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 6px 0 14px;
    border-bottom: 1px solid #262a2f;
    background-color: #141619;
    color: #e6e8eb;
    font-family: Roboto, "Helvetica Neue", Arial, sans-serif;
    z-index: 5;

    h2 {
        margin: 0;
        font-size: 14px;
        font-weight: 600;
        white-space: nowrap;
    }

    > svg {
        width: 16px;
        height: 16px;
        flex: none;
    }
`;

const Meta = styled.span`
    font-size: 12px;
    color: #9aa1aa;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
`;

const ToggleButton = styled.button`
    margin-left: auto;
    flex: none;
    height: 32px;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 10px;
    background: #1b1e22;
    border: 1px solid #2c3137;
    border-radius: 7px;
    color: #d5d9de;
    font: 500 13px Roboto, "Helvetica Neue", Arial, sans-serif;
    cursor: pointer;

    &:hover {
        border-color: #3d82f0;
        color: #ffffff;
    }

    &:focus-visible {
        outline: 2px solid #3d82f0;
        outline-offset: 2px;
    }

    svg {
        width: 15px;
        height: 15px;
    }
`;

export type PanelKind = "model" | "image";

const PANEL_INFO: Record<PanelKind, { title: string; icon: ReactNode; full: string }> = {
    model: { title: "3D model", icon: <Box aria-hidden="true" color="#8fb8ff" />, full: "Show the 3D model full page" },
    image: { title: "Image", icon: <Camera aria-hidden="true" color="#ffb46b" />, full: "Show the image full page" },
};

interface PanelHeaderProps {
    kind: PanelKind;
    meta?: string;
    onFullPage: () => void;
}

// The bar on top of a panel in the split view
export const PanelHeader: FC<PanelHeaderProps> = ({ kind, meta, onFullPage }) => {
    const info = PANEL_INFO[kind];
    return (
        <Bar>
            {info.icon}
            <h2>{info.title}</h2>
            {meta && <Meta>{meta}</Meta>}
            <ToggleButton type="button" aria-label={info.full} title={info.full} onClick={onFullPage}>
                <Maximize2 aria-hidden="true" />
                Full page
            </ToggleButton>
        </Bar>
    );
};

const Floating = styled.div<{ $top: number; $left: number }>`
    position: absolute;
    height: ${BACK_TO_SPLIT_HEIGHT}px;
    box-sizing: border-box;
    top: ${({ $top }) => $top}px;
    left: ${({ $left }) => $left}px;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 6px 6px 12px;
    background-color: rgba(20, 22, 26, 0.88);
    backdrop-filter: blur(8px);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 12px;
    color: #e6e8eb;
    font: 600 13px Roboto, "Helvetica Neue", Arial, sans-serif;
    z-index: 950;

    > svg {
        width: 16px;
        height: 16px;
    }

    ${ToggleButton} {
        margin-left: 4px;
    }
`;

interface BackToSplitProps {
    kind: PanelKind;
    top: number;
    left: number;
    onBack: () => void;
}

// A full page panel: its name and the way back to the split view
export const BackToSplit: FC<BackToSplitProps> = ({ kind, top, left, onBack }) => {
    const info = PANEL_INFO[kind];
    return (
        <Floating $top={top} $left={left} role="group" aria-label={`${info.title} full page`}>
            {info.icon}
            <span>{info.title}</span>
            <ToggleButton type="button" onClick={onBack}>
                <Minimize2 aria-hidden="true" />
                Back to split view
            </ToggleButton>
        </Floating>
    );
};

const Handle = styled.div<{ $stacked: boolean }>`
    position: absolute;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: ${({ $stacked }) => ($stacked ? "row-resize" : "col-resize")};
    touch-action: none;
    z-index: 900;
    outline: none;

    &::after {
        content: "";
        display: block;
        border-radius: 3px;
        background-color: #2c3137;
        width: ${({ $stacked }) => ($stacked ? "56px" : "6px")};
        height: ${({ $stacked }) => ($stacked ? "6px" : "56px")};
        transition: background-color 0.15s;
    }

    &:hover::after,
    &:focus-visible::after,
    &[data-dragging="true"]::after {
        background-color: #3d82f0;
    }
`;

interface SplitterProps {
    rect: Rect;
    stacked: boolean;
    share: number;
    // the share of the 3D model for a pointer at (x, y) of the page
    shareAtPoint: (x: number, y: number) => number;
    onShare: (share: number) => void;
    // the page's top-left corner on the screen (pointer coordinates are of the screen)
    originRef: { current: HTMLElement | null };
}

const KEY_STEP = 0.05;

// The splitter between the two panels: drag it, or focus it and use the arrow keys
export const Splitter: FC<SplitterProps> = ({ rect, stacked, share, shareAtPoint, onShare, originRef }) => {
    const dragging = useRef(false);
    const point = (e: PointerEvent) => {
        const box = originRef.current?.getBoundingClientRect();
        return { x: e.clientX - (box?.left ?? 0), y: e.clientY - (box?.top ?? 0) };
    };
    const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
        dragging.current = true;
        e.currentTarget.setPointerCapture?.(e.pointerId);
        e.currentTarget.dataset.dragging = "true";
        e.preventDefault();
    };
    const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
        if (!dragging.current) return;
        const p = point(e);
        onShare(shareAtPoint(p.x, p.y));
    };
    const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
        dragging.current = false;
        e.currentTarget.releasePointerCapture?.(e.pointerId);
        e.currentTarget.dataset.dragging = "false";
    };
    const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
        const less = stacked ? "ArrowUp" : "ArrowLeft";
        const more = stacked ? "ArrowDown" : "ArrowRight";
        if (e.key === less) onShare(clampShare(share - KEY_STEP));
        else if (e.key === more) onShare(clampShare(share + KEY_STEP));
        else return;
        e.preventDefault();
    };
    return (
        <Handle
            role="separator"
            tabIndex={0}
            aria-label="Resize the 3D model and image panels"
            aria-orientation={stacked ? "horizontal" : "vertical"}
            aria-valuemin={20}
            aria-valuemax={80}
            aria-valuenow={Math.round(share * 100)}
            $stacked={stacked}
            style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onKeyDown={onKeyDown}
        />
    );
};

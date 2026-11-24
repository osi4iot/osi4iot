// The Canvas of a slide (canvasScene.ts): the whiteboard with its panels in it (canvasPanels.ts; CanvasBoard, loaded
// the first time one is shown), the steps of its presentation, its full screen and, while the layout is edited, its
// tools: Edit canvas (over the whole window: draw, and place the panels as shapes), Add frame (a 16:9 page), Insert
// panel (in the frame shown), its style, remove it. While drawing, ◀ ▶ go from frame to frame.
//
// The steps: its frames. ◀ ▶ (and the arrows, PageUp / PageDown of the keyboard or of a presenter's clicker) go through
// them; past the last one (or before the first) they go to the next slide (the previous one), as a presentation does.
// Coming back from the next slide it shows its last frame.
import { FC, ReactNode, Suspense, lazy, useEffect, useRef, useState } from "react";
import styled from "styled-components";
import { Check, Frame, Pointer, ChevronLeft, ChevronRight, Maximize, Minimize, Paintbrush, Plus, Trash2 } from "lucide-react";
import { LiveValueStore } from "../liveValues";
import { CANVAS_STYLES, CanvasStyle, SlideCanvas as SlideCanvasSettings, WorkspacePage } from "../workspaceLayout";
import { CanvasBoardControl } from "./CanvasBoard";
import { CANVAS_STYLE_LABELS, CanvasScene, nextCanvasStep } from "./canvasScene";
import { LaserPointer } from "./LaserPointer";

const CanvasBoard = lazy(() => import("./CanvasBoard"));

// the board under the slide's panels (a stacking context of its own: the menus of Excalidraw stay under the panels)
const Board = styled.div`
    position: absolute;
    inset: 0;
    z-index: 0;
    background: #121417;

    .excalidraw {
        --color-primary: #3d82f0;
    }
    /* the dark theme of Excalidraw inverts its canvases: not those of the panels in it (charts, the 3D model) */
    .osi-canvas-panel canvas {
        filter: none !important;
    }
`;

// over the panels
const Controls = styled.div`
    position: absolute;
    z-index: 2;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px;
    background: rgba(24, 27, 31, 0.92);
    border: 1px solid #2c3137;
    border-radius: 10px;
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.35);
    color: #d5d9de;
    font-size: 13px;

    button,
    select {
        height: 30px;
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 0 10px;
        background: #1b1e22;
        border: 1px solid #2c3137;
        border-radius: 7px;
        color: inherit;
        font-size: 13px;
        cursor: pointer;
    }
    button[aria-pressed="true"] {
        background: rgba(61, 130, 240, 0.18);
        border-color: #3d82f0;
        color: #e6e8eb;
    }
    button.danger {
        color: #ef8a8a;
    }
    button:disabled {
        opacity: 0.4;
        cursor: default;
    }
    svg {
        width: 15px;
        height: 15px;
    }
`;

const Message = styled.p`
    position: absolute;
    inset: 0;
    margin: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #9aa1aa;
    font-size: 13px;
`;

// typing in a field: the keys are the field's
const isTyping = (target: EventTarget | null) =>
    target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || !!target.closest('[role="dialog"]'));

export interface SlideCanvasProps {
    slideId: string;
    canvas: SlideCanvasSettings;
    // undefined: being read
    scene: CanvasScene | null | undefined;
    // the board is drawn again when it changes (a scene read, discarded…), not while it is edited
    sceneKey: number;
    error?: string | null;
    // the layout is being edited: the tools of the canvas are shown
    layoutEditing: boolean;
    canvasEditing: boolean;
    store?: LiveValueStore;
    // shows its last step first (coming back from the next slide)
    startAtEnd?: boolean;
    // the viewer is shown (its keys are listened to)
    active?: boolean;
    onCanvasEditing: (editing: boolean) => void;
    onSceneChange: (scene: CanvasScene) => void;
    onStyleChange: (style: CanvasStyle) => void;
    onRemove: () => void;
    // past its last step (1) or before its first (-1)
    onLeave: (delta: 1 | -1) => void;
    // the slide (the canvas and its panels) in full screen
    fullscreen?: boolean;
    onFullscreen?: () => void;
    // the slide's panels: elements of the drawing (canvasPanels.ts)
    page?: WorkspacePage;
    renderPanel?: (panelId: string) => ReactNode;
    onPanelsRemoved?: (ids: string[]) => void;
    // Insert panel (the Add panel dialog): it goes to the area shown, in its frame (null: none)
    onInsertPanel?: (frame: string | null) => void;
    // the frame of the step shown (its id; null: none), whose 3D model and simulator are the ones in use
    onShownFrame?: (frame: string | null) => void;
    // editing: the frame each panel is in (canvasPanels panelFrames)
    onPanelFrames?: (frames: Record<string, string>) => void;
}

export const SlideCanvas: FC<SlideCanvasProps> = ({
    slideId,
    canvas,
    scene,
    sceneKey,
    error,
    layoutEditing,
    canvasEditing,
    store,
    startAtEnd = false,
    active = true,
    onCanvasEditing,
    onSceneChange,
    onStyleChange,
    onRemove,
    onLeave,
    fullscreen = false,
    onFullscreen,
    page,
    renderPanel,
    onPanelsRemoved,
    onInsertPanel,
    onShownFrame,
    onPanelFrames,
}) => {
    const control = useRef<CanvasBoardControl | null>(null);
    // the frames of the drawing (their ids), in the order of the steps
    const [frameIds, setFrameIds] = useState<string[]>([]);
    const frames = frameIds.length;
    const [step, setStep] = useState(0);
    const [removeArmed, setRemoveArmed] = useState(false);
    // the laser pointer while presenting (K, or its button)
    const [laser, setLaser] = useState(false);
    const toggleLaser = () => setLaser((on) => !on);
    const presentingRef = useRef(false);
    const laserRef = useRef(toggleLaser);
    laserRef.current = toggleLaser;
    useEffect(() => setRemoveArmed(false), [slideId, layoutEditing]);
    const editing = layoutEditing && canvasEditing;
    const presenting = !editing && frames > 0;
    // a new slide, scene or mode: the first step (or the last one: the board takes its last frame)
    const start = startAtEnd ? Number.MAX_SAFE_INTEGER : 0;
    useEffect(() => {
        setStep(startAtEnd ? Number.MAX_SAFE_INTEGER : 0);
        // a new board: without the laser
        setLaser(false);
    }, [slideId, sceneKey, editing, startAtEnd]);
    const shownStep = Math.min(step, Math.max(0, frames - 1));
    const shownFrame = frames > 0 ? frameIds[shownStep] : null;
    const shownFrameRef = useRef(onShownFrame);
    shownFrameRef.current = onShownFrame;
    useEffect(() => {
        shownFrameRef.current?.(shownFrame);
    }, [shownFrame]);

    const go = (delta: 1 | -1) => {
        const next = nextCanvasStep(shownStep, frames, delta);
        if (next === "slide") {
            // drawing: from frame to frame only
            if (!editing) onLeave(delta);
            return;
        }
        setStep(next);
        control.current?.show(next);
    };

    // the keys of a presentation
    const goRef = useRef(go);
    goRef.current = go;
    presentingRef.current = presenting;
    useEffect(() => {
        if (editing || !active || layoutEditing) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || isTyping(e.target)) return;
            if (e.key === "k" || e.key === "K") {
                e.preventDefault();
                laserRef.current();
                return;
            }
            const delta = e.key === "ArrowRight" || e.key === "PageDown" ? 1 : e.key === "ArrowLeft" || e.key === "PageUp" ? -1 : 0;
            if (!delta || !presentingRef.current) return;
            // before the slide bar (PageUp / PageDown change the slide there): this step is the canvas's
            e.preventDefault();
            goRef.current(delta);
        };
        window.addEventListener("keydown", onKey, true);
        return () => window.removeEventListener("keydown", onKey, true);
    }, [editing, active, layoutEditing]);

    return (
        <>
            <Board data-testid="slide-canvas">
                {scene === undefined ? (
                    <Message>{error ? error : "Loading the canvas…"}</Message>
                ) : (
                    <Suspense fallback={<Message>Loading the canvas…</Message>}>
                        <CanvasBoard
                            key={`${slideId}-${sceneKey}-${editing ? "edit" : "view"}`}
                            scene={scene ?? { elements: [] }}
                            style={canvas.style}
                            editing={editing}
                            store={store}
                            startAt={start}
                            onChange={onSceneChange}
                            onFrames={setFrameIds}
                            onPanelFrames={onPanelFrames}
                            onControl={(c) => (control.current = c)}
                            page={page}
                            renderPanel={renderPanel}
                            onPanelsRemoved={onPanelsRemoved}
                            step={shownStep}
                            fullscreen={fullscreen}
                        />
                    </Suspense>
                )}
                {laser && !editing && <LaserPointer />}
            </Board>

            {(!editing || frames > 0) && (
                <Controls style={{ right: 12, bottom: 12 }} role="group" aria-label="Steps of the canvas">
                    {((presenting && frames > 1) || (editing && frames > 0)) && (
                        <>
                            <button type="button" aria-label="Previous step" onClick={() => go(-1)}>
                                <ChevronLeft aria-hidden="true" />
                            </button>
                            <span aria-live="polite" style={{ minWidth: 42, textAlign: "center" }}>
                                {shownStep + 1} / {frames}
                            </span>
                            <button type="button" aria-label="Next step" onClick={() => go(1)}>
                                <ChevronRight aria-hidden="true" />
                            </button>
                        </>
                    )}
                    {!editing && (
                        <button
                            type="button"
                            aria-pressed={laser}
                            aria-label={laser ? "Laser pointer: turn it off (K)" : "Laser pointer (K)"}
                            title={laser ? "Laser pointer: turn it off (K)" : "Laser pointer (K)"}
                            onClick={toggleLaser}
                        >
                            <Pointer aria-hidden="true" />
                        </button>
                    )}
                    {onFullscreen && !layoutEditing && !editing && (
                        <button
                            type="button"
                            aria-label={fullscreen ? "Leave the full screen" : "Full screen: the canvas and its panels"}
                            title={fullscreen ? "Leave the full screen (Esc)" : "Present in full screen: the canvas and its panels, in their proportions"}
                            onClick={onFullscreen}
                        >
                            {fullscreen ? <Minimize aria-hidden="true" /> : <Maximize aria-hidden="true" />}
                        </button>
                    )}
                </Controls>
            )}

            {layoutEditing && (
                <Controls style={{ left: "50%", bottom: 12, transform: "translateX(-50%)" }} role="toolbar" aria-label="Canvas">
                    {canvasEditing ? (
                        <button
                            type="button"
                            aria-pressed="true"
                            onClick={() => onCanvasEditing(false)}
                            title="Back to the slide (save the layout to keep the changes)"
                        >
                            <Check aria-hidden="true" />
                            Done
                        </button>
                    ) : (
                        <button type="button" onClick={() => onCanvasEditing(true)} title="Draw the canvas and place its panels, over the whole window">
                            <Paintbrush aria-hidden="true" />
                            Edit canvas
                        </button>
                    )}
                    <button
                        type="button"
                        disabled={!editing}
                        onClick={() => {
                            control.current?.addFrame();
                            // the new frame is the last step
                            setStep(Number.MAX_SAFE_INTEGER);
                        }}
                        title="A new 16:9 frame (a page of the presentation) after the last one: draw and put the panels in it"
                    >
                        <Frame aria-hidden="true" />
                        Add frame
                    </button>
                    {onInsertPanel && (
                        <button
                            type="button"
                            disabled={!editing}
                            onClick={() => onInsertPanel(control.current?.frameInView() ?? null)}
                            title="A new panel in the area shown: then move and resize it as any shape"
                        >
                            <Plus aria-hidden="true" />
                            Insert panel
                        </button>
                    )}
                    <select aria-label="Style of the canvas" value={canvas.style} onChange={(e) => onStyleChange(e.target.value as CanvasStyle)}>
                        {CANVAS_STYLES.map((s) => (
                            <option key={s} value={s}>
                                {CANVAS_STYLE_LABELS[s]}
                            </option>
                        ))}
                    </select>
                    <button
                        type="button"
                        disabled={!editing}
                        title="Draw every element of the canvas in its style"
                        onClick={() => control.current?.restyleAll(canvas.style)}
                    >
                        Apply to all
                    </button>
                    <button
                        type="button"
                        className="danger"
                        aria-label={removeArmed ? "Click again to remove the canvas" : "Remove the canvas"}
                        title="Removed when the layout is saved"
                        onClick={() => (removeArmed ? onRemove() : setRemoveArmed(true))}
                    >
                        <Trash2 aria-hidden="true" />
                        {removeArmed ? "Sure?" : "Remove"}
                    </button>
                </Controls>
            )}
        </>
    );
};

export default SlideCanvas;

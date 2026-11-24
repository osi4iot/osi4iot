// The whiteboard of a slide's Canvas: Excalidraw (MIT), loaded only when a canvas is shown (React.lazy in
// SlideCanvas.tsx). Its fonts come from the platform itself (vite.config.ts copies them to /excalidraw-assets/).
//
//   presenting  view mode, without its tools: its texts with {{topic.field}} show the live values, its frames are
//               the steps of the presentation (drawn without their outline and name), the whole drawing fits else
//   editing     every tool of Excalidraw; the new elements in the canvas's style; the scene is reported (at most
//               every 400 ms) to be saved with the layout
import { FC, ReactNode, useEffect, useMemo, useRef } from "react";
import { Excalidraw, MainMenu, CaptureUpdateAction, hashElementsVersion } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import "@excalidraw/excalidraw/index.css";
import { LiveValueStore, useLiveTick } from "../liveValues";
import { CanvasStyle, WorkspacePage } from "../workspaceLayout";
import { PANEL_LINK_PREFIX, Rect, panelFrames, panelIdOf, panelLink, panelsInScene, reconcilePanels } from "./canvasPanels";
import {
    CanvasElement,
    CanvasScene,
    frameAt,
    framesInOrder,
    newFrame,
    liveTemplates,
    restyleElements,
    sceneToSave,
    sceneTopics,
    styleAppState,
    withLiveValues,
} from "./canvasScene";

declare global {
    interface Window {
        EXCALIDRAW_ASSET_PATH?: string | string[];
    }
}
// before any font is asked for
if (typeof window !== "undefined") window.EXCALIDRAW_ASSET_PATH = "/excalidraw-assets/";

// What the slide's controls ask the board to do
export interface CanvasBoardControl {
    // shows a frame (its index among framesInOrder), or the whole drawing (-1)
    show: (index: number, animate?: boolean) => void;
    // every element in a style
    restyleAll: (style: CanvasStyle) => void;
    // a new 16:9 frame after the last one, shown (while drawing)
    addFrame: () => void;
    // the frame in the middle of what is shown (its id), where a panel inserted goes
    frameInView: () => string | null;
}

export interface CanvasBoardProps {
    scene: CanvasScene;
    style: CanvasStyle;
    editing: boolean;
    store?: LiveValueStore;
    // the frame shown first (-1: the whole drawing)
    startAt: number;
    // the scene as it is being edited
    onChange?: (scene: CanvasScene) => void;
    // the frames of the scene (their ids, in the order of the steps), once it is drawn
    onFrames?: (ids: string[]) => void;
    // editing: the frame each panel is in (panelFrames), when it changes
    onPanelFrames?: (frames: Record<string, string>) => void;
    onControl?: (control: CanvasBoardControl | null) => void;
    // the slide: its panels are elements of the drawing (canvasPanels.ts), drawn by renderPanel
    page?: WorkspacePage;
    renderPanel?: (panelId: string) => ReactNode;
    // panels whose element was deleted from the drawing (while editing): they leave the layout
    onPanelsRemoved?: (ids: string[]) => void;
    // the frame shown (drawn again when the board changes size: full screen, the window)
    step?: number;
    // the slide in full screen: the frames shown at 100 % (when they fit), the wheel only for the panels
    fullscreen?: boolean;
}

const UI_OPTIONS = {
    canvasActions: {
        loadScene: false,
        saveToActiveFile: false,
        export: { saveFileToDisk: true },
        saveAsImage: true,
        clearCanvas: true,
        changeViewBackgroundColor: true,
        toggleTheme: true,
    },
};

// The wheel over a panel stops at it: its own handlers (inside: the zoom of a 3D model, of a 3D chart) have had it,
// and Excalidraw's (on its container, around) must not zoom the drawing with it
const stopWheel = (e: WheelEvent) => e.stopPropagation();
const isolateWheel = (el: HTMLDivElement | null) => {
    if (el && !el.dataset.wheel) {
        el.dataset.wheel = "1";
        el.addEventListener("wheel", stopWheel, { passive: true });
    }
};

const CanvasBoard: FC<CanvasBoardProps> = ({
    scene,
    style,
    editing,
    store,
    startAt,
    onChange,
    onFrames,
    onPanelFrames,
    onControl,
    page,
    renderPanel,
    onPanelsRemoved,
    step = 0,
    fullscreen = false,
}) => {
    const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
    const stepRef = useRef(step);
    stepRef.current = step;
    const pageRef = useRef(page);
    pageRef.current = page;
    // the panels of the scene, to notice the ones deleted while drawing
    const panelIds = useRef<Set<string>>(new Set());
    const templates = useMemo(() => liveTemplates(scene.elements), [scene.elements]);
    const topics = useMemo(() => sceneTopics(scene.elements), [scene.elements]);
    const initialData = useMemo(
        () => ({
            elements: scene.elements as never,
            appState: {
                ...(scene.appState ?? {}),
                ...styleAppState(style),
                viewModeEnabled: !editing,
                zenModeEnabled: !editing,
                // presented: the frames without their outline and name
                ...(editing ? {} : { frameRendering: { enabled: true, name: false, outline: false, clip: true } }),
            },
            files: (scene.files ?? {}) as never,
        }),
        // the board is drawn again (a new key) when the scene or the mode changes
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [],
    );

    const fullscreenRef = useRef(fullscreen);
    fullscreenRef.current = fullscreen;
    const show = (index: number, animate = true) => {
        const api = apiRef.current;
        if (!api) return;
        const elements = api.getSceneElements();
        const target = index >= 0 ? framesInOrder(elements as unknown as CanvasElement[])[index] : undefined;
        if (index >= 0 && !target) return;
        // in full screen a frame that fits is shown at 100 % (its panels and drawings at their own size), centred
        if (target && fullscreenRef.current) {
            const state = api.getAppState();
            const f = { x: Number(target.x), y: Number(target.y), w: Number(target.width), h: Number(target.height) };
            if (f.w <= state.width && f.h <= state.height) {
                api.updateScene({
                    appState: { zoom: { value: 1 }, scrollX: state.width / 2 - (f.x + f.w / 2), scrollY: state.height / 2 - (f.y + f.h / 2) } as never,
                    captureUpdate: CaptureUpdateAction.NEVER,
                });
                return;
            }
        }
        api.scrollToContent((target as never) ?? elements, { fitToViewport: true, viewportZoomFactor: target ? 0.96 : 0.9, animate, duration: 450 });
    };

    // the slide's controls
    useEffect(() => {
        onControl?.({
            show,
            restyleAll: (s) => {
                const api = apiRef.current;
                if (!api) return;
                api.updateScene({
                    elements: restyleElements(api.getSceneElementsIncludingDeleted() as unknown as CanvasElement[], s) as never,
                    appState: styleAppState(s) as never,
                    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
                });
            },
            addFrame: () => {
                const api = apiRef.current;
                if (!api) return;
                const all = api.getSceneElementsIncludingDeleted() as unknown as CanvasElement[];
                const frame = newFrame(all.filter((e) => !e.isDeleted));
                api.updateScene({ elements: [...all, frame] as never, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
                const frames = framesInOrder(api.getSceneElements() as unknown as CanvasElement[]);
                onFrames?.(frames.map((f) => String(f.id)));
                show(frames.findIndex((f) => f.id === frame.id));
            },
            frameInView: () => {
                const frame = frameInView();
                return frame ? String(frame.id) : null;
            },
        });
        return () => onControl?.(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // a new style: for the next elements
    useEffect(() => {
        apiRef.current?.updateScene({ appState: styleAppState(style) as never, captureUpdate: CaptureUpdateAction.NEVER });
    }, [style]);

    // the panels of the slide in the drawing: the missing ones put (in the area shown while drawing, else in the
    // first frame), those it no longer has removed
    const placePanels = (area?: Rect) => {
        const api = apiRef.current;
        const current = pageRef.current;
        if (!api || !current) return;
        const elements = api.getSceneElementsIncludingDeleted() as unknown as CanvasElement[];
        const next = reconcilePanels(elements, current, area);
        if (next) api.updateScene({ elements: next as never, captureUpdate: editing ? CaptureUpdateAction.IMMEDIATELY : CaptureUpdateAction.NEVER });
        panelIds.current = panelsInScene((next ?? elements).filter((e) => !e.isDeleted));
        // no link icon by the panels (Excalidraw has validated their links: the elements stay embeds; the link is
        // given back to the scene when it is saved)
        {
            window.setTimeout(() => {
                const now = api.getSceneElementsIncludingDeleted() as unknown as CanvasElement[];
                const plain = now.map((e) => {
                    const id = panelIdOf(e);
                    return id && e.link ? ({ ...e, link: null, customData: { ...((e.customData as object) ?? {}), osi4iotPanel: id } } as CanvasElement) : e;
                });
                if (plain.some((e, i) => e !== now[i])) api.updateScene({ elements: plain as never, captureUpdate: CaptureUpdateAction.NEVER });
            }, 200);
        }
    };
    // what is shown of the drawing, and the frame in its middle
    const shownArea = (): Rect | null => {
        const api = apiRef.current;
        if (!api) return null;
        const state = api.getAppState();
        const zoom = state.zoom.value || 1;
        return { x: -state.scrollX, y: -state.scrollY, width: state.width / zoom, height: state.height / zoom };
    };
    const frameInView = (): CanvasElement | undefined => {
        const shown = shownArea();
        if (!shown || !apiRef.current) return undefined;
        return frameAt(apiRef.current.getSceneElements() as unknown as CanvasElement[], shown.x + shown.width / 2, shown.y + shown.height / 2);
    };
    const panelKey = (page?.panels ?? []).map((p) => p.id).join("|");
    const placedOnce = useRef(false);
    useEffect(() => {
        const shown = shownArea();
        if (!placedOnce.current || !shown) return;
        // a panel added while drawing: in the frame in the middle of what is shown, else in what is shown
        const frame = frameInView();
        const area = frame ? { x: Number(frame.x), y: Number(frame.y), width: Number(frame.width), height: Number(frame.height) } : shown;
        placePanels(editing ? area : undefined);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [panelKey]);

    // presenting: the frames without their outline and name, the first step shown
    const ready = (api: ExcalidrawImperativeAPI) => {
        apiRef.current = api;
        if (!editing) api.updateFrameRendering({ enabled: true, name: false, outline: false, clip: true });
        // once laid out
        window.setTimeout(() => {
            placePanels();
            placedOnce.current = true;
            const frames = framesInOrder(api.getSceneElements() as unknown as CanvasElement[]);
            const count = frames.length;
            onFrames?.(frames.map((f) => String(f.id)));
            frameIds.current = frames.map((f) => String(f.id)).join("|");
            if (editing && onPanelFrames) {
                const placed = panelFrames(api.getSceneElements() as unknown as CanvasElement[]);
                panelFramesKey.current = JSON.stringify(Object.entries(placed).sort());
                onPanelFrames(placed);
            }
            show(count ? Math.min(startAt, count - 1) : -1, false);
        }, 60);
    };

    // presenting: the frame shown again when the board changes size (full screen, the window)
    const box = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const el = box.current;
        if (!el || editing || typeof ResizeObserver === "undefined") return;
        let timer: number | undefined;
        let first = true;
        const observer = new ResizeObserver(() => {
            if (first) {
                first = false;
                return;
            }
            window.clearTimeout(timer);
            timer = window.setTimeout(() => {
                const count = framesInOrder((apiRef.current?.getSceneElements() ?? []) as unknown as CanvasElement[]).length;
                show(count ? Math.min(stepRef.current, count - 1) : -1, false);
            }, 120);
        });
        observer.observe(el);
        return () => {
            observer.disconnect();
            window.clearTimeout(timer);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [editing]);

    // presenting: the live values in the texts
    const tick = useLiveTick(store, editing ? [] : topics, 500);
    useEffect(() => {
        const api = apiRef.current;
        if (editing || !api || templates.size === 0 || !store) return;
        const current = api.getSceneElementsIncludingDeleted() as unknown as CanvasElement[];
        const next = withLiveValues(current, templates, store.get);
        if (next.some((e, i) => e !== current[i])) api.updateScene({ elements: next as never, captureUpdate: CaptureUpdateAction.NEVER });
    }, [tick, editing, templates, store]);

    // The wheel over a panel is the panel's (the zoom of a 3D model, of a 3D chart), not the drawing's: Excalidraw
    // zooms the drawing with the wheel over any canvas element, those of the panels too. In full screen the wheel
    // does not move nor zoom the drawing either: the frame stays as it is shown.
    useEffect(() => {
        const el = box.current;
        if (!el) return;
        const inPanel = (e: WheelEvent) => e.target instanceof Element && !!e.target.closest(".osi-canvas-panel");
        // over the drawing (capture: before Excalidraw's listener, on an element inside this one)
        const onCapture = (e: WheelEvent) => {
            if (!inPanel(e) && fullscreenRef.current && !editing) {
                e.preventDefault();
                e.stopPropagation();
            }
        };
        el.addEventListener("wheel", onCapture, { capture: true, passive: false });
        return () => el.removeEventListener("wheel", onCapture, { capture: true });
    }, [editing]);

    // editing: the scene reported when its elements, its look or its pictures change
    const last = useRef({
        version: hashElementsVersion(scene.elements as never),
        look: JSON.stringify(scene.appState ?? {}),
        files: Object.keys(scene.files ?? {}).length,
    });
    const timer = useRef<number | undefined>(undefined);
    useEffect(() => () => window.clearTimeout(timer.current), []);
    const frameIds = useRef("");
    const panelFramesKey = useRef("");
    const changed = (elements: readonly unknown[], appState: Record<string, unknown>, files: Record<string, unknown>) => {
        if (!editing || !onChange) return;
        // frames drawn, removed or renamed (their order): the steps
        const ids = framesInOrder(elements as CanvasElement[]).map((f) => String(f.id));
        if (placedOnce.current && ids.join("|") !== frameIds.current) {
            frameIds.current = ids.join("|");
            onFrames?.(ids);
        }
        // the frame of each panel (a 3D model, a simulator: that of their frame)
        if (placedOnce.current && onPanelFrames) {
            const frames = panelFrames(elements as CanvasElement[]);
            const key = JSON.stringify(Object.entries(frames).sort());
            if (key !== panelFramesKey.current) {
                panelFramesKey.current = key;
                onPanelFrames(frames);
            }
        }
        // a panel's element deleted while drawing: the panel leaves the slide
        if (placedOnce.current && onPanelsRemoved) {
            const now = panelsInScene((elements as CanvasElement[]).filter((e) => !e.isDeleted));
            const gone = [...panelIds.current].filter((id) => !now.has(id) && (pageRef.current?.panels ?? []).some((p) => p.id === id));
            panelIds.current = now;
            if (gone.length) onPanelsRemoved(gone);
        }
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => {
            // the panels keep their link in the scene (it was taken off the elements shown)
            const linked = (elements as CanvasElement[]).map((e) => {
                const id = panelIdOf(e);
                return id && !e.link ? ({ ...e, link: panelLink(id) } as CanvasElement) : e;
            });
            const saved = sceneToSave(linked, appState, files);
            const now = {
                version: hashElementsVersion(elements as never),
                look: JSON.stringify(saved.appState ?? {}),
                files: Object.keys(saved.files ?? {}).length,
            };
            if (now.version === last.current.version && now.look === last.current.look && now.files === last.current.files) return;
            last.current = now;
            onChange(saved);
        }, 400);
    };

    return (
        <div ref={box} style={{ position: "absolute", inset: 0 }}>
            <Excalidraw
                excalidrawAPI={ready}
                initialData={initialData as never}
                viewModeEnabled={!editing}
                zenModeEnabled={!editing}
                UIOptions={UI_OPTIONS as never}
                onChange={(elements, appState, files) =>
                    changed(elements, appState as unknown as Record<string, unknown>, files as unknown as Record<string, unknown>)
                }
                detectScroll={false}
                handleKeyboardGlobally={false}
                name="Canvas"
                validateEmbeddable={(url: string) => (url.startsWith(PANEL_LINK_PREFIX) ? true : undefined)}
                // the link of a panel is not a page to open
                onLinkOpen={(element, event) => {
                    if (panelIdOf(element as never)) event.preventDefault();
                }}
                renderEmbeddable={(element) => {
                    const id = panelIdOf(element as never);
                    if (!id || !renderPanel) return null;
                    // presenting, the panel is used as it is (its tooltips, the simulator's sliders); while drawing,
                    // the drawing moves it (a click in its middle lets it be used)
                    return (
                        <div
                            className="osi-canvas-panel"
                            ref={isolateWheel}
                            style={{ width: "100%", height: "100%", pointerEvents: editing ? undefined : "auto" }}
                        >
                            {renderPanel(id)}
                        </div>
                    );
                }}
            >
                <MainMenu>
                    <MainMenu.DefaultItems.SaveAsImage />
                    <MainMenu.DefaultItems.Export />
                    <MainMenu.DefaultItems.SearchMenu />
                    <MainMenu.DefaultItems.Help />
                    <MainMenu.DefaultItems.ClearCanvas />
                    <MainMenu.Separator />
                    <MainMenu.DefaultItems.ToggleTheme />
                    <MainMenu.DefaultItems.ChangeCanvasBackground />
                </MainMenu>
            </Excalidraw>
        </div>
    );
};

export default CanvasBoard;

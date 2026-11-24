// The Canvas of a slide (README, "Canvas"): a whiteboard of Excalidraw behind the slide's panels. Its scene — the
// elements, the pictures pasted in it and how it looks — is one JSON in S3 (admin_api slideCanvas.ts); the layout
// only says that the slide has one and its style (slide.canvas).
//
// Pure functions (no Excalidraw here: it is loaded only when a canvas is shown, CanvasBoard.tsx):
//   - the style: clean lines (a straight stroke, a plain font) or hand-drawn, for the new elements and, on demand,
//     for all of them
//   - the live values: the texts with {{topic.field}} or {{topic.field|decimals}} (as the Text panels) show the last
//     values of the messages (sensors dev2pdb_n, dtm2sim, dev2sim) while the canvas is presented
//   - the steps of a presentation: its frames, in the order of their names (1 Idea, 2 How…) and else of their place
import { LiveMessage, fillPlaceholders, placeholdersOf, topicRefsOf } from "../liveValues";
import { CanvasStyle } from "../workspaceLayout";

export type CanvasElement = Record<string, unknown> & { id: string; type: string; isDeleted?: boolean };

export interface CanvasScene {
    elements: CanvasElement[];
    appState?: Record<string, unknown>;
    files?: Record<string, unknown>;
}

// Excalidraw's dark theme shows the colours of a light drawing inverted: a white background is shown dark, a dark
// ink light. A scene is drawn with light colours, whatever its theme.
export const emptyCanvasScene = (): CanvasScene => ({ elements: [newFrame([])], appState: { theme: "dark", viewBackgroundColor: "#ffffff" }, files: {} });

// --- frames: the pages of a presentation ------------------------------------------------------------------

// a frame is a 16:9 page (what a screen shows: its panels and drawings keep their proportions in it), the next one
// to the right of the last one
export const FRAME_WIDTH = 1600;
export const FRAME_HEIGHT = 900;
export const FRAME_GAP = 200;

const randomInt = () => Math.floor(Math.random() * 2 ** 31) + 1;

// a new frame after the frames of a scene (the first one at 0, 0), named with its number so that it keeps its place
// among the steps ("3 Step")
export const newFrame = (elements: readonly CanvasElement[]): CanvasElement => {
    const frames = framesInOrder(elements);
    const right = frames.reduce((max, f) => Math.max(max, num(f.x) + num(f.width)), -Infinity);
    const x = frames.length ? right + FRAME_GAP : 0;
    const y = frames.length ? num(frames[0].y) : 0;
    return {
        id: `frame-${randomInt().toString(36)}${randomInt().toString(36)}`,
        type: "frame",
        x,
        y,
        width: FRAME_WIDTH,
        height: FRAME_HEIGHT,
        angle: 0,
        strokeColor: "#bbb",
        backgroundColor: "transparent",
        fillStyle: "solid",
        strokeWidth: 2,
        strokeStyle: "solid",
        roughness: 0,
        opacity: 100,
        groupIds: [],
        frameId: null,
        roundness: null,
        seed: randomInt(),
        version: 1,
        versionNonce: randomInt(),
        isDeleted: false,
        boundElements: null,
        updated: Date.now(),
        link: null,
        locked: false,
        name: `${frames.length + 1} Step`,
    };
};

// the frame that holds a point (the middle of what is shown)
export const frameAt = <T extends CanvasElement>(elements: readonly T[], x: number, y: number): T | undefined =>
    framesInOrder(elements).find((f) => x >= num(f.x) && x <= num(f.x) + num(f.width) && y >= num(f.y) && y <= num(f.y) + num(f.height));

// Excalidraw's fonts (its FONT_FAMILY): a plain one for clean lines, its hand-written one
const FONT_NUNITO = 6;
const FONT_EXCALIFONT = 5;
export const CANVAS_STYLE_LABELS: Record<CanvasStyle, string> = { clean: "Clean lines", hand: "Hand-drawn" };

// how the new elements are drawn
export const styleAppState = (style: CanvasStyle): Record<string, unknown> =>
    style === "clean"
        ? { currentItemRoughness: 0, currentItemFontFamily: FONT_NUNITO, currentItemRoundness: "sharp" }
        : { currentItemRoughness: 1, currentItemFontFamily: FONT_EXCALIFONT, currentItemRoundness: "round" };

// every element in a style (its stroke and, a text, its font)
export const restyleElements = <T extends CanvasElement>(elements: readonly T[], style: CanvasStyle): T[] =>
    elements.map((e) => {
        const change: Record<string, unknown> = {};
        if (typeof e.roughness === "number") change.roughness = style === "clean" ? 0 : 1;
        if (e.type === "text" && typeof e.fontFamily === "number") change.fontFamily = style === "clean" ? FONT_NUNITO : FONT_EXCALIFONT;
        return Object.keys(change).length ? ({ ...e, ...change } as T) : e;
    });

// --- what is kept ------------------------------------------------------------------------------------------

// what of the appState belongs to the scene (not the view of one user: zoom, selection, tool…)
const KEPT_APP_STATE = ["viewBackgroundColor", "theme", "gridSize", "gridStep", "gridModeEnabled"];

export const sceneToSave = (elements: readonly CanvasElement[], appState: Record<string, unknown>, files: Record<string, unknown>): CanvasScene => {
    const kept = elements.filter((e) => !e.isDeleted);
    const used = new Set(kept.map((e) => e.fileId).filter((id): id is string => typeof id === "string"));
    const state: Record<string, unknown> = {};
    for (const key of KEPT_APP_STATE) if (appState[key] !== undefined && appState[key] !== null) state[key] = appState[key];
    const ownFiles: Record<string, unknown> = {};
    for (const [id, file] of Object.entries(files ?? {})) if (used.has(id)) ownFiles[id] = file;
    return { elements: kept as CanvasElement[], appState: state, files: ownFiles };
};

// a scene as it comes (S3, a file): the valid parts, or null
export const sanitizeCanvasScene = (raw: unknown): CanvasScene | null => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const s = raw as Record<string, unknown>;
    if (!Array.isArray(s.elements)) return null;
    const elements = s.elements.filter(
        (e): e is CanvasElement => !!e && typeof e === "object" && typeof (e as CanvasElement).id === "string" && typeof (e as CanvasElement).type === "string",
    );
    const plain = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
    return { elements, appState: plain(s.appState), files: plain(s.files) };
};

// --- live values -------------------------------------------------------------------------------------------

const textOf = (e: CanvasElement) => (typeof e.originalText === "string" ? e.originalText : typeof e.text === "string" ? e.text : "");

// the texts with placeholders, by element: what they say before the values are put in
export const liveTemplates = (elements: readonly CanvasElement[]): Map<string, string> => {
    const out = new Map<string, string>();
    for (const e of elements) if (e.type === "text" && !e.isDeleted && placeholdersOf(textOf(e)).length) out.set(e.id, textOf(e));
    return out;
};

// the topics the texts of a scene name
export const sceneTopics = (elements: readonly CanvasElement[]): string[] => topicRefsOf(Array.from(liveTemplates(elements).values()));

// the elements with the values of the messages in their texts (the others as they are)
export const withLiveValues = <T extends CanvasElement>(
    elements: readonly T[],
    templates: Map<string, string>,
    get: (topicRef: string) => LiveMessage | undefined,
): T[] =>
    elements.map((e) => {
        const template = templates.get(e.id);
        if (template === undefined) return e;
        const text = fillPlaceholders(template, get);
        return text === e.text ? e : ({ ...e, text, originalText: text } as T);
    });

// --- the steps of a presentation ---------------------------------------------------------------------------

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

// the frames, in the order of their names (numbers first: "2 How" before "10 Next"), else top to bottom, left to right
export const framesInOrder = <T extends CanvasElement>(elements: readonly T[]): T[] =>
    elements
        .filter((e) => (e.type === "frame" || e.type === "magicframe") && !e.isDeleted)
        .sort((a, b) => {
            const na = typeof a.name === "string" ? a.name : "";
            const nb = typeof b.name === "string" ? b.name : "";
            const byName = na && nb ? na.localeCompare(nb, undefined, { numeric: true, sensitivity: "base" }) : 0;
            return byName || num(a.y) - num(b.y) || num(a.x) - num(b.x);
        });

// The step after a key (the frames of the canvas, then the slides): the frame to show, or "slide" (the step leaves
// the canvas: the next slide, or the previous one)
export const nextCanvasStep = (index: number, count: number, delta: 1 | -1): number | "slide" => {
    const next = index + delta;
    return next < 0 || next >= count ? "slide" : next;
};

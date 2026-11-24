// The panels of a slide with a canvas live IN the canvas: each one is an element of the drawing (an Excalidraw
// "embeddable" whose link names it, osi4iot://panel/<id>) that is moved, resized and aligned as any shape, belongs
// to a frame and zooms with it when presented. Its settings stay in the layout (the panel); the scene only keeps
// where it is.
//
// A panel of the layout that the scene does not have yet (a new one, a layout of before) is put in the drawing: in
// the area shown while drawing, else in the first frame, at the place of its cell of the slide's grid. An element of
// a panel that the layout no longer has goes.
import { gridOf, WorkspacePanel, WorkspacePage } from "../workspaceLayout";
import { CanvasElement, framesInOrder } from "./canvasScene";

export const PANEL_LINK_PREFIX = "osi4iot://panel/";
export const panelLink = (id: string) => `${PANEL_LINK_PREFIX}${id}`;
// (presented, the link is taken off the element so that Excalidraw draws no link icon by it: then its customData
// names the panel)
export const panelIdOf = (e: { type?: unknown; link?: unknown; isDeleted?: unknown; customData?: unknown }): string | null => {
    if (e.type !== "embeddable" || e.isDeleted) return null;
    if (typeof e.link === "string" && e.link.startsWith(PANEL_LINK_PREFIX)) return e.link.slice(PANEL_LINK_PREFIX.length);
    const own = (e.customData as { osi4iotPanel?: unknown } | undefined)?.osi4iotPanel;
    return typeof own === "string" ? own : null;
};

export interface Rect {
    x: number;
    y: number;
    width: number;
    height: number;
}

// the page of a scene without frames: what a 16:9 screen shows at 100 %
export const DEFAULT_PAGE: Rect = { x: 0, y: 0, width: 1600, height: 900 };

// where the cell of a panel in the slide's grid falls in a rect of the drawing
export const rectOfCell = (panel: WorkspacePanel, page: Pick<WorkspacePage, "canvas">, area: Rect): Rect => {
    const grid = gridOf(page);
    const fx = area.width / grid.cols;
    const fy = area.height / grid.rows;
    return {
        x: Math.round(area.x + panel.x * fx),
        y: Math.round(area.y + Math.min(panel.y, grid.rows - 1) * fy),
        width: Math.max(160, Math.round(panel.w * fx)),
        height: Math.max(120, Math.round(Math.min(panel.h, grid.rows) * fy)),
    };
};

let seed = 1;
const random = () => Math.floor(Math.random() * 2 ** 31) || ++seed;

// the element of a panel
export const panelElement = (panelId: string, rect: Rect, frameId: string | null): CanvasElement => ({
    id: `panel-${panelId}-${random().toString(36)}`,
    type: "embeddable",
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    angle: 0,
    strokeColor: "transparent",
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 0,
    strokeStyle: "solid",
    roughness: 0,
    opacity: 100,
    groupIds: [],
    frameId,
    roundness: null,
    seed: random(),
    version: 1,
    versionNonce: random(),
    isDeleted: false,
    boundElements: null,
    updated: Date.now(),
    link: panelLink(panelId),
    locked: false,
});

const inside = (r: Rect, f: Rect) => r.x >= f.x && r.y >= f.y && r.x + r.width <= f.x + f.width && r.y + r.height <= f.y + f.height;

const rectOf = (e: CanvasElement): Rect => ({ x: Number(e.x) || 0, y: Number(e.y) || 0, width: Number(e.width) || 0, height: Number(e.height) || 0 });

// The scene with the panels of the layout: the missing ones added (in `area`, else the first frame), those of panels
// it no longer has removed. null when nothing changes.
export const reconcilePanels = <T extends CanvasElement>(elements: readonly T[], page: WorkspacePage, area?: Rect): T[] | null => {
    const ids = new Set(page.panels.map((p) => p.id));
    const placed = new Set<string>();
    let changed = false;
    const kept: T[] = [];
    for (const e of elements) {
        const id = panelIdOf(e);
        // the panel is no longer in the layout, or it is twice (a copy pasted): its element goes
        if (id !== null && (!ids.has(id) || placed.has(id))) {
            changed = true;
            continue;
        }
        if (id !== null) placed.add(id);
        kept.push(e);
    }
    const frames = framesInOrder(kept);
    const target = area ?? (frames[0] ? rectOf(frames[0]) : DEFAULT_PAGE);
    for (const panel of page.panels) {
        if (placed.has(panel.id)) continue;
        const rect = rectOfCell(panel, page, target);
        // the frame it falls in
        const frame = frames.find((f) => inside(rect, rectOf(f)));
        kept.push(panelElement(panel.id, rect, frame ? frame.id : null) as T);
        changed = true;
    }
    return changed ? kept : null;
};

// the panels whose element is in the scene
export const panelsInScene = (elements: readonly CanvasElement[]): Set<string> =>
    new Set(elements.map((e) => panelIdOf(e)).filter((id): id is string => id !== null));

// The frame each panel of the scene is in (by panel id: the id of its frame), as Excalidraw keeps it (frameId) for
// a frame of the scene; a panel outside every frame is not listed.
export const panelFrames = (elements: readonly CanvasElement[]): Record<string, string> => {
    const frames = new Set(framesInOrder(elements).map((f) => String(f.id)));
    const out: Record<string, string> = {};
    for (const e of elements) {
        const id = panelIdOf(e);
        const frame = (e as { frameId?: unknown }).frameId;
        if (id !== null && typeof frame === "string" && frames.has(frame)) out[id] = frame;
    }
    return out;
};



// The layout of the Viewer page: slides, one screen each, and in each slide panels on a grid of GRID_COLS
// columns (react-grid-layout). One layout per digital twin, saved by a group administrator for the whole group
// (admin_api /viewer_layout); the others can change it for themselves while the viewer is open, without saving.
// Without a saved layout the page builds the automatic one: one slide with the 3D model and the image of the
// asset's camera side by side. A layout of version 1 (one grid, before the slides) becomes one slide.
//
// Each slide has a title (its tab) and a tag: the filters of the page show or hide the slides of a tag. A new
// slide is "Slide N" with the tag "Slide_N"; administrators give the same tag to the slides that go together.
//
// Pure functions, so they are easy to test. admin_api checks the same shape (viewerLayoutValidation.ts).
import { PICTURE_FITS, PictureBinding, PictureFit, sanitizeBindings } from "./pictureBindings";
import { isPlaybackSpeed } from "./playbackClock";
import { REFRESH_INTERVALS } from "./charts/timeRange";
import { SurfaceOptions, defaultSurface, sanitizeSurface, surfaceTopics } from "./surface/surfacePanel";
import { DataChartOptions, dataChartOfSurface, dataChartTopics, defaultDataChart, sanitizeDataChart } from "./dataChart/dataChart";
import { AssetStateField, sanitizeAssetStateSettings } from "./assetStatePanel";
import { OrgOverviewPeriod, sanitizeOrgOverviewSettings } from "./orgOverview";

export const WORKSPACE_LAYOUT_VERSION = 2;
export const MAX_SLIDES = 20;
export const SLIDE_TITLE_MAX = 60;
// a tag: letters (any language), digits, spaces, _ . - (as admin_api)
export const SLIDE_TAG = /^[\p{L}\p{N} _.-]{1,40}$/u;
export const GRID_COLS = 12;
// rows that fill the page: a panel of PAGE_ROWS rows is as high as the page (more rows scroll)
export const PAGE_ROWS = 12;
export const MAX_ROWS = 96;
export const MAX_PANELS = 40;
export const GRID_MARGIN = 12;
export const MIN_ROW_HEIGHT = 24;
// below this width the page shows one panel at a time, with tabs
export const WORKSPACE_PHONE_BELOW = 640;

export const ANY_IMAGE_SOURCE = "any";

export type PanelType =
    | "model"
    | "image"
    | "chart"
    | "alarms"
    | "approvals"
    | "markdown"
    | "picture"
    | "surface"
    | "dataChart"
    | "assetState"
    | "health"
    | "pipelineLogs"
    | "orgOverview"
    | "simulator";
// the text of a Text panel (markdown, LaTeX and {{topicRef.path}} values): at most these characters
export const MARKDOWN_MAX_LENGTH = 20000;
// how an Image panel shows the frames of its source: as a video (live, with pause) or as a photo (the last
// one and when it arrived)
export type ImageDisplay = "video" | "photo";
export const imageDisplayOf = (panel: { display?: ImageDisplay }): ImageDisplay => (panel.display === "photo" ? "photo" : "video");
// at most one panel of these types on a page
export const SINGLE_PANEL_TYPES: PanelType[] = ["model", "alarms", "approvals", "assetState", "health", "pipelineLogs", "orgOverview", "simulator"];
// of these, one in each frame of a canvas (each frame its own 3D model and simulator: the scope slide:frame)
export const ONE_PER_FRAME_TYPES: PanelType[] = ["model", "simulator"];

// The scope of a 3D model and of a simulator: their slide, or a frame of its canvas ("<slideId>:<frameId>", the id
// of the frame in the scene). The files of a model are those of its scope (admin_api slideModels.ts), and the
// messages of a simulator carry its scope ("$slide"): they go to the model and the panels of that scope.
export const scopeOf = (slideId: string, frame?: string | null): string => (frame ? `${slideId}:${frame}` : slideId);
export const slideOfScope = (scope: string): string => scope.split(":")[0];
export const frameOfScope = (scope: string): string | null => scope.split(":")[1] ?? null;
// the id of a frame of a canvas (Excalidraw's ids)
export const FRAME_ID = /^[A-Za-z0-9_-]{1,40}$/;
// a panel's place among those of its type that are one per slide, or one per frame of a canvas
const sameSingleSlot = (type: PanelType, a: Pick<WorkspacePanel, "frame">, frame: string | null | undefined) =>
    !ONE_PER_FRAME_TYPES.includes(type) || (a.frame ?? null) === (frame ?? null);
// the panels that can float over the slide instead of taking a place in its grid (also over a panel in full screen)
export const FLOATING_PANEL_TYPES: PanelType[] = ["simulator"];
// a floating window, in fractions (0 to 1) of the slide's area; its grid place (x, y, w, h) is where it docks
export interface FloatRect {
    x: number;
    y: number;
    w: number;
    h: number;
}
export const FLOAT_MIN_FRACTION = 0.05;
// where a simulator floats when nobody has moved it: on the right, near the top
export const DEFAULT_FLOAT: FloatRect = { x: 0.66, y: 0.04, w: 0.32, h: 0.62 };
// the panels of a group's control room only (controlRoom.ts)
export const CONTROL_ROOM_PANEL_TYPES: PanelType[] = ["health", "pipelineLogs"];
// the panels of the organization overview only (orgOverview.ts)
export const ORGANIZATION_PANEL_TYPES: PanelType[] = ["orgOverview"];

// a series of a chart: a field of a sensor of the asset (an item, for an array field)
export interface ChartSeriesRef {
    sensor: string; // sensorRef
    field: string;
    index?: number;
    // how each interval of time is summarized (mean by default), the name and colour shown, the Y axis
    agg?: "mean" | "min" | "max" | "last" | "first" | "sum" | "count";
    alias?: string;
    color?: string;
    axis?: "left" | "right";
    hide?: boolean;
}

// the range of time and refresh of the page (Grafana's dashboard time picker)
export interface WorkspaceTime {
    from: string;
    to: string;
    refresh: string;
}

export const CHART_RANGES = ["15m", "1h", "6h", "24h", "7d", "30d"] as const;
export type ChartRange = (typeof CHART_RANGES)[number];
export const DEFAULT_CHART_RANGE: ChartRange = "1h";
export const CHART_MAX_SERIES = 8;

export interface WorkspacePanel {
    id: string;
    type: PanelType;
    title?: string;
    // image: the topicRef of its frames, or "any", and how they are shown (video when not said)
    source?: string;
    display?: ImageDisplay;
    // markdown: its text
    text?: string;
    // picture: the image (a file of the twin, folder viewerImages), how it fits the panel and, for an SVG, the
    // animations of its elements with the values of the NATS messages
    file?: string;
    fit?: PictureFit;
    bindings?: PictureBinding[];
    // a picture that plays series in time: the speed it starts with (1: real time)
    playbackSpeed?: number;
    // surface: a 3D Surface, of a formula or of a grid of values of the messages (surface/surfacePanel.ts); read as a
    // Data chart of kind "surface" (sanitizePanels)
    surface?: SurfaceOptions;
    // dataChart: the data of one JSON (a message, the asset's state or a formula) as a 2D chart, a heat map, a 3D
    // surface or 3D points (dataChart/dataChart.ts)
    data?: DataChartOptions;
    // assetState: the fields of the state shown, the colour of each status, after how many minutes it is old
    stateFields?: AssetStateField[];
    statusColors?: Record<string, string>;
    staleMinutes?: number;
    // orgOverview: the statuses that are not available ("Alarm" when none) and the period it opens with
    unavailableStatuses?: string[];
    period?: OrgOverviewPeriod;
    // simulator: floating over the slide (its window: float) instead of in its place of the grid
    floating?: boolean;
    // a translucent background (blurred): what is behind it shows through (a canvas, the panels under it)
    translucent?: boolean;
    // on a canvas: the frame of the drawing it is in (its id; kept from the scene: withPanelFrames). A 3D model or a
    // simulator in a frame is that frame's (scopeOf)
    frame?: string;
    float?: FloatRect;
    // simulator: its own format, that of its slide (none: the digital twin's); the values it sends carry the slide
    // ("$slide") and the answers with it go to the panels of the slide
    format?: Record<string, SimulatorParameter>;
    // chart: its series, its visualization and settings (Grafana's options and fieldConfig) and its own time
    series?: ChartSeriesRef[];
    // the panels of 1.4.0 before the editor: now timeFrom
    range?: ChartRange;
    viz?: string;
    options?: Record<string, unknown>;
    fieldConfig?: Record<string, unknown>;
    timeFrom?: string;
    timeShift?: string;
    interval?: string;
    maxDataPoints?: number;
    // chart: the seconds shown of its live series (LIVE_SERIES_PREFIX); CHART_LIVE_WINDOW_DEFAULT without it
    liveWindow?: number;
    x: number;
    y: number;
    w: number;
    h: number;
}

// the panels of one screen
export interface WorkspacePage {
    panels: WorkspacePanel[];
    // a whiteboard behind the panels (canvas/canvasScene.ts): the panels are then on the fine grid (gridOf)
    canvas?: SlideCanvas;
}

// --- Canvas ----------------------------------------------------------------------------------------------------

export const CANVAS_STYLES = ["clean", "hand"] as const;
export type CanvasStyle = (typeof CANVAS_STYLES)[number];
export interface SlideCanvas {
    // clean lines (a straight stroke and a plain font) or hand-drawn: how new elements are drawn
    style: CanvasStyle;
}

// A slide with a canvas is one page whose panels are on a grid CANVAS_SCALE times finer (48 × 48), without
// compaction (a panel stays where it is put, leaving the canvas seen around it) and with overlaps allowed
export const CANVAS_SCALE = 4;
export const CANVAS_GRID_MARGIN = 4;
export interface PageGrid {
    cols: number;
    // the rows of one page, and the most a panel can reach
    rows: number;
    maxRows: number;
    scale: number;
    margin: number;
    // panels move up to fill gaps (no: they stay where they are put, and may overlap)
    compact: boolean;
}
export const gridOf = (page: Pick<WorkspacePage, "canvas"> | null | undefined): PageGrid =>
    page?.canvas
        ? { cols: GRID_COLS * CANVAS_SCALE, rows: PAGE_ROWS * CANVAS_SCALE, maxRows: PAGE_ROWS * CANVAS_SCALE, scale: CANVAS_SCALE, margin: CANVAS_GRID_MARGIN, compact: false }
        : { cols: GRID_COLS, rows: PAGE_ROWS, maxRows: MAX_ROWS, scale: 1, margin: GRID_MARGIN, compact: true };

const sanitizeCanvas = (raw: unknown): SlideCanvas | undefined =>
    plainObject(raw) && CANVAS_STYLES.includes(raw.style as CanvasStyle) ? { style: raw.style as CanvasStyle } : undefined;

// A panel of one grid on another (a slide gets or loses its canvas): its place and size scaled, kept inside the page
const regrid = (p: WorkspacePanel, from: PageGrid, to: PageGrid): WorkspacePanel => {
    const f = to.scale / from.scale;
    const w = clamp(Math.round(p.w * f), 1, to.cols);
    const h = clamp(Math.round(p.h * f), 1, to.maxRows);
    return { ...p, x: clamp(Math.round(p.x * f), 0, to.cols - w), y: clamp(Math.round(p.y * f), 0, to.maxRows - h), w, h };
};

// A slide with a canvas (or without it: null): its panels go to the grid of the new page
export const setSlideCanvas = <T extends WorkspacePage>(slide: T, canvas: SlideCanvas | null): T => {
    const from = gridOf(slide);
    const next = { ...slide } as T;
    if (canvas) next.canvas = canvas;
    else delete next.canvas;
    const to = gridOf(next);
    if (from.scale !== to.scale) next.panels = slide.panels.map((p) => regrid(p, from, to));
    // without a canvas there are no frames
    if (!canvas && next.panels.some((p) => p.frame)) next.panels = next.panels.map(({ frame: _frame, ...p }) => p);
    return next;
};

// The panels with the frames the scene puts them in (panelFrames of canvasPanels.ts): the same page when nothing
// changes. A 3D model or a simulator that would share a frame with another of its type stays out of frames.
export const withPanelFrames = <T extends WorkspacePage>(page: T, frames: Record<string, string>): T => {
    let changed = false;
    const taken = new Set<string>();
    const panels = page.panels.map((p) => {
        let frame: string | undefined = page.canvas ? frames[p.id] : undefined;
        if (frame && ONE_PER_FRAME_TYPES.includes(p.type)) {
            const key = `${p.type}|${frame}`;
            if (taken.has(key)) frame = undefined;
            else taken.add(key);
        }
        if ((p.frame ?? undefined) === frame) return p;
        changed = true;
        const { frame: _old, ...rest } = p;
        return frame ? { ...rest, frame } : rest;
    });
    return changed ? { ...page, panels } : page;
};

// the scope of a panel of a slide (scopeOf)
export const panelScope = (slideId: string, panel: Pick<WorkspacePanel, "frame">): string => scopeOf(slideId, panel.frame);

// The 3D model or the simulator in use on a slide when a frame of its canvas is shown (null: none, or no canvas):
// the one in that frame, else the slide's own (outside every frame)
export const panelInUse = (page: WorkspacePage, type: PanelType, frame: string | null): WorkspacePanel | undefined =>
    (frame ? page.panels.find((p) => p.type === type && p.frame === frame) : undefined) ?? page.panels.find((p) => p.type === type && !p.frame);

export interface WorkspaceSlide extends WorkspacePage {
    id: string;
    title: string;
    tag: string;
}

export interface WorkspaceLayout {
    version: number;
    time?: WorkspaceTime;
    slides: WorkspaceSlide[];
    // saved once simulator panels existed: a layout without it gets a floating simulator on its first slide when the
    // twin has a simulator format (withSimulatorPanel; the simulator of older versions was a floating window)
    simulatorPlaced?: boolean;
}

export interface WorkspaceContext {
    // the twin has a 3D model: its automatic layout shows it
    hasModel: boolean;
    // 3D Model panels may be added and kept (each slide loads its own model in its panel); default: hasModel
    modelPanels?: boolean;
    hasCamera: boolean;
    // a group's control room: its automatic layout shows the whole group
    controlRoom?: boolean;
    // the organization overview: its automatic layout shows the indicators of the organization
    organization?: boolean;
    // the twin has a simulator format: its automatic layout has a floating simulator
    hasSimulator?: boolean;
}

// size of a new panel of each type
const NEW_PANEL_SIZE: Record<PanelType, { w: number; h: number }> = {
    model: { w: 7, h: 8 },
    image: { w: 4, h: 6 },
    chart: { w: 6, h: 5 },
    alarms: { w: 5, h: 6 },
    approvals: { w: 5, h: 6 },
    markdown: { w: 4, h: 4 },
    picture: { w: 5, h: 6 },
    surface: { w: 6, h: 7 },
    dataChart: { w: 6, h: 6 },
    assetState: { w: 4, h: 5 },
    health: { w: 6, h: 6 },
    pipelineLogs: { w: 6, h: 6 },
    orgOverview: { w: 12, h: 12 },
    simulator: { w: 4, h: 8 },
};
const MIN_SIZE: Record<PanelType, { w: number; h: number }> = {
    model: { w: 3, h: 3 },
    image: { w: 2, h: 2 },
    chart: { w: 3, h: 3 },
    alarms: { w: 3, h: 3 },
    approvals: { w: 3, h: 3 },
    markdown: { w: 2, h: 1 },
    picture: { w: 2, h: 2 },
    surface: { w: 3, h: 3 },
    dataChart: { w: 3, h: 3 },
    assetState: { w: 2, h: 2 },
    health: { w: 3, h: 3 },
    pipelineLogs: { w: 3, h: 3 },
    orgOverview: { w: 6, h: 6 },
    simulator: { w: 3, h: 4 },
};

export const minSizeOf = (type: PanelType) => MIN_SIZE[type];

const PANEL_TYPES: PanelType[] = [
    "model",
    "image",
    "chart",
    "alarms",
    "approvals",
    "markdown",
    "picture",
    "surface",
    "dataChart",
    "assetState",
    "health",
    "pipelineLogs",
    "orgOverview",
    "simulator",
];
export const PICTURE_FILE = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,79}\.(png|jpe?g|webp|gif|svg)$/i;
const PANEL_ID = /^[A-Za-z0-9_-]{1,40}$/;
const SOURCE = /^[A-Za-z0-9_.-]{1,60}$/;
// a sensor, the history of the twin's asset state (ASSET_STATE_SERIES) or the values of a topic since the viewer was
// opened (LIVE_SERIES_PREFIX + topic)
const SENSOR_REF = /^(@assetState|@live:[A-Za-z0-9_.-]{1,60}|[A-Za-z0-9_.-]{1,60})$/;
export const ASSET_STATE_SERIES = "@assetState";
export const LIVE_SERIES_PREFIX = "@live:";
export const CHART_LIVE_WINDOW_MIN = 10;
export const CHART_LIVE_WINDOW_MAX = 3600;
export const CHART_LIVE_WINDOW_DEFAULT = 300;
export const liveTopicOfSeries = (sensor: string) => (sensor.startsWith(LIVE_SERIES_PREFIX) ? sensor.slice(LIVE_SERIES_PREFIX.length) : null);

export const isChartRange = (value: unknown): value is ChartRange => CHART_RANGES.includes(value as ChartRange);

// the valid series of a chart (at most CHART_MAX_SERIES, without repetitions)
export const sanitizeChartSeries = (raw: unknown): ChartSeriesRef[] => {
    if (!Array.isArray(raw)) return [];
    const seen = new Set<string>();
    const result: ChartSeriesRef[] = [];
    for (const item of raw) {
        if (!item || typeof item !== "object") continue;
        const { sensor, field, index, agg, alias, color, axis, hide } = item as Record<string, unknown>;
        if (typeof sensor !== "string" || !SENSOR_REF.test(sensor)) continue;
        if (typeof field !== "string" || field === "" || field.length > 100) continue;
        const series: ChartSeriesRef = { sensor, field };
        if (index !== undefined) {
            if (!isInt(index) || index < 0 || index > 63) continue;
            series.index = index;
        }
        if (typeof agg === "string" && SERIES_AGG_IDS.includes(agg)) series.agg = agg as ChartSeriesRef["agg"];
        if (typeof alias === "string" && alias.trim()) series.alias = alias.slice(0, 80);
        if (typeof color === "string" && /^(#[0-9a-fA-F]{3,8}|[a-z-]{3,30})$/.test(color)) series.color = color;
        if (axis === "right") series.axis = "right";
        if (hide === true) series.hide = true;
        const key = seriesKey(series);
        if (seen.has(key)) continue;
        seen.add(key);
        result.push(series);
        if (result.length === CHART_MAX_SERIES) break;
    }
    return result;
};

const SERIES_AGG_IDS = ["mean", "min", "max", "last", "first", "sum", "count"];
const SPAN_TEXT = /^\d{1,6}[smhdwMy]$/;
// the minimum interval of a chart can also be in milliseconds (200ms, 500ms)
const INTERVAL_TEXT = /^(\d{1,6}(ms|[smhdwMy])|raw)$/;
const CHART_VIZ_IDS = ["timeseries", "barchart", "stat", "gauge", "bargauge", "table", "piechart", "statetimeline", "histogram"];
const TIME_TEXT = /^(now(-\d{1,6}[smhdwMy])?(\/[smhdwMy])?|\d{10,14}|\d{4}-\d{2}-\d{2}.{0,30})$/;

const plainObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

export const sanitizeTime = (raw: unknown): WorkspaceTime | undefined => {
    if (!plainObject(raw)) return undefined;
    const { from, to, refresh } = raw;
    if (typeof from !== "string" || typeof to !== "string" || !TIME_TEXT.test(from) || !TIME_TEXT.test(to)) return undefined;
    return { from, to, refresh: typeof refresh === "string" && REFRESH_INTERVALS.includes(refresh) ? refresh : "" };
};

export const seriesKey = (s: ChartSeriesRef) => `${s.sensor}|${s.field}|${s.index ?? ""}`;

// a group's control room: the states, health, alarms and approvals of the group; then the pipelines' logs
export const controlRoomWorkspaceLayout = (): WorkspaceLayout => ({
    version: WORKSPACE_LAYOUT_VERSION,
    slides: [
        {
            id: "slide-1",
            title: "Overview",
            tag: "Slide_1",
            panels: [
                { id: "states", type: "assetState", x: 0, y: 0, w: 7, h: 6 },
                { id: "health", type: "health", x: 7, y: 0, w: 5, h: 6 },
                { id: "alarms", type: "alarms", x: 0, y: 6, w: 6, h: 6 },
                { id: "approvals", type: "approvals", x: 6, y: 6, w: 6, h: 6 },
            ],
        },
        { id: "slide-2", title: "Pipeline logs", tag: "Slide_2", panels: [{ id: "logs", type: "pipelineLogs", x: 0, y: 0, w: GRID_COLS, h: PAGE_ROWS }] },
    ],
});

// the organization overview: its indicators, the whole page
export const organizationWorkspaceLayout = (): WorkspaceLayout => ({
    version: WORKSPACE_LAYOUT_VERSION,
    slides: [{ id: "slide-1", title: "Overview", tag: "Slide_1", panels: [{ id: "overview", type: "orgOverview", x: 0, y: 0, w: GRID_COLS, h: 24 }] }],
});

export const defaultWorkspaceLayout = ({ hasModel, hasCamera, controlRoom, organization, hasSimulator }: WorkspaceContext): WorkspaceLayout => {
    if (organization) return organizationWorkspaceLayout();
    if (controlRoom) return controlRoomWorkspaceLayout();
    const panels: WorkspacePanel[] = [];
    if (hasModel && hasCamera) {
        panels.push({ id: "model", type: "model", x: 0, y: 0, w: 7, h: PAGE_ROWS });
        panels.push({ id: "image", type: "image", source: ANY_IMAGE_SOURCE, x: 7, y: 0, w: 5, h: PAGE_ROWS });
    } else if (hasModel) {
        panels.push({ id: "model", type: "model", x: 0, y: 0, w: GRID_COLS, h: PAGE_ROWS });
    } else if (hasCamera) {
        panels.push({ id: "image", type: "image", source: ANY_IMAGE_SOURCE, x: 0, y: 0, w: GRID_COLS, h: PAGE_ROWS });
    }
    const slide: WorkspaceSlide = { ...slideNames(1), panels };
    return { version: WORKSPACE_LAYOUT_VERSION, slides: [hasSimulator ? withFloatingSimulator(slide) : slide] };
};

// a slide with a floating simulator (it docks in the first free place of its size)
const withFloatingSimulator = <T extends WorkspacePage>(slide: T): T => {
    if (slide.panels.some((p) => p.type === "simulator")) return slide;
    const grid = gridOf(slide);
    const w = NEW_PANEL_SIZE.simulator.w * grid.scale;
    const h = Math.min(NEW_PANEL_SIZE.simulator.h * grid.scale, grid.maxRows);
    const { x, y } = freePlace(slide.panels, w, h, grid);
    const panel: WorkspacePanel = { id: newPanelId(slide.panels, "simulator"), type: "simulator", x, y, w, h, floating: true, float: { ...DEFAULT_FLOAT } };
    return { ...slide, panels: [...slide.panels, panel] };
};

// The layouts saved before simulator panels existed get a floating simulator on their first slide when the twin has
// a simulator format: the simulator was a floating window then. Not those saved since (simulatorPlaced), where an
// editor may have removed it on purpose.
export const withSimulatorPanel = (layout: WorkspaceLayout, hasSimulator: boolean): WorkspaceLayout => {
    if (!hasSimulator || layout.simulatorPlaced || layout.slides.length === 0) return layout;
    if (layout.slides.some((s) => s.panels.some((p) => p.type === "simulator"))) return layout;
    return { ...layout, slides: [withFloatingSimulator(layout.slides[0]), ...layout.slides.slice(1)] };
};

const isFraction = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;

// A parameter of a simulator's format (the slider of the Simulator panel)
export interface SimulatorParameter {
    label: string;
    units: string;
    minValue: number;
    maxValue: number;
    defaultValue: number;
    step: number;
}

// the format of a slide's simulator, as admin_api checks it (validateSimulatorFormat); undefined: not a format
export const sanitizeSimulatorFormat = (raw: unknown): Record<string, SimulatorParameter> | undefined => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
    const entries = Object.entries(raw as Record<string, unknown>);
    if (entries.length > 200) return undefined;
    const format: Record<string, SimulatorParameter> = {};
    for (const [name, value] of entries) {
        if (!/^[A-Za-z0-9_.-]{1,80}$/.test(name) || !value || typeof value !== "object") return undefined;
        const v = value as Record<string, unknown>;
        const n = (k: string) => (typeof v[k] === "number" && Number.isFinite(v[k]) ? (v[k] as number) : NaN);
        const [minValue, maxValue, defaultValue, step] = [n("minValue"), n("maxValue"), n("defaultValue"), n("step")];
        if (typeof v.label !== "string" || typeof v.units !== "string") return undefined;
        if (![minValue, maxValue, defaultValue, step].every(Number.isFinite) || minValue >= maxValue || step <= 0) return undefined;
        if (defaultValue < minValue || defaultValue > maxValue) return undefined;
        format[name] = { label: v.label, units: v.units, minValue, maxValue, defaultValue, step };
    }
    return format;
};

// the slide with its simulator's own format (the simulator of the slide, or that of one of the frames of its canvas:
// panelId)
export const setSimulatorFormat = <T extends WorkspacePage>(slide: T, format: Record<string, SimulatorParameter>, panelId?: string): T => ({
    ...slide,
    panels: slide.panels.map((p) => (p.type === "simulator" && (!panelId || p.id === panelId) ? { ...p, format } : p)),
});

// a floating window inside the slide and not too small, or undefined
export const sanitizeFloat = (raw: unknown): FloatRect | undefined => {
    if (!raw || typeof raw !== "object") return undefined;
    const { x, y, w, h } = raw as Record<string, unknown>;
    if (!isFraction(x) || !isFraction(y) || !isFraction(w) || !isFraction(h)) return undefined;
    if (w < FLOAT_MIN_FRACTION || h < FLOAT_MIN_FRACTION) return undefined;
    return { x: Math.min(x, 1 - w), y: Math.min(y, 1 - h), w, h };
};

// The topics of the simulation: what the simulator sends to the pipeline (sim2dtm) and what the pipeline answers
// with (dtm2sim).
const SIMULATION_TOPICS = ["dtm2sim", "sim2dtm"];
const SIMULATION_TOPIC_IN_TEXT = /\b(dtm2sim|sim2dtm)\b/;

// Whether a panel shows the simulation: the 3D model, and the panels that use its topics (a 3D Surface of their
// values, an image of dtm2sim, an animated picture or a text with their values). The simulator floats only over
// these, when one is in full screen: over the rest (charts and alarms read the database, cameras the real world)
// the values being simulated change nothing.
export const showsSimulation = (panel: WorkspacePanel): boolean => {
    switch (panel.type) {
        case "model":
            return true;
        case "surface":
            return surfaceTopics(panel.surface).some((t) => SIMULATION_TOPICS.includes(t));
        case "dataChart":
            return dataChartTopics(panel.data).some((t) => SIMULATION_TOPICS.includes(t));
        case "chart":
            return (panel.series ?? []).some((s) => SIMULATION_TOPICS.includes(liveTopicOfSeries(s.sensor) ?? ""));
        case "image":
            return SIMULATION_TOPICS.includes(panel.source ?? "");
        case "picture":
            return (panel.bindings ?? []).some((b) => SIMULATION_TOPICS.includes(b.topicRef));
        case "markdown":
            return SIMULATION_TOPIC_IN_TEXT.test(panel.text ?? "");
        default:
            return false;
    }
};

export const isFloating = (panel: WorkspacePanel) => FLOATING_PANEL_TYPES.includes(panel.type) && panel.floating === true;

// a panel with a translucent background, or opaque again (not the 3D model: it draws its own background)
export const setPanelTranslucent = <T extends WorkspacePage>(layout: T, id: string, translucent: boolean): T => ({
    ...layout,
    panels: layout.panels.map((p) => {
        if (p.id !== id || p.type === "model") return p;
        const next: WorkspacePanel = { ...p };
        if (translucent) next.translucent = true;
        else delete next.translucent;
        return next;
    }),
});

// a panel floated or docked, or its window moved (an editor saving the layout)
export const setPanelFloat = <T extends WorkspacePage>(layout: T, id: string, floating: boolean, float?: FloatRect): T => ({
    ...layout,
    panels: layout.panels.map((p) => {
        if (p.id !== id || !FLOATING_PANEL_TYPES.includes(p.type)) return p;
        const next: WorkspacePanel = { ...p, float: float ?? p.float ?? { ...DEFAULT_FLOAT } };
        if (floating) next.floating = true;
        else delete next.floating;
        return next;
    }),
});

// the id, title and tag of the slide number n
const slideNames = (n: number) => ({ id: `slide-${n}`, title: `Slide ${n}`, tag: `Slide_${n}` });

// The id of a new slide: never used before in this twin (its 3D model's files are kept under it, admin_api
// slideModels.ts, and a slide keeps it when renamed or moved), unlike "slide-<n>", which a removed slide may have had
export const newSlideId = (layout: WorkspaceLayout): string => {
    const used = new Set(layout.slides.map((s) => s.id));
    for (;;) {
        const random =
            typeof crypto !== "undefined" && "getRandomValues" in crypto
                ? Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => (b % 36).toString(36)).join("")
                : Math.random().toString(36).slice(2, 10);
        const id = `s-${random}`;
        if (!used.has(id)) return id;
    }
};

const isInt = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value);
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

// A layout read from admin_api or from memory, made safe: unknown or broken slides and panels are dropped,
// sizes are kept inside the grid, and the model panels are dropped when the twin has no 3D model. A layout of
// version 1 becomes one slide. null when it is not a layout.
export const sanitizeWorkspaceLayout = (
    raw: unknown,
    { hasModel, modelPanels }: Pick<WorkspaceContext, "hasModel" | "modelPanels">,
): WorkspaceLayout | null => {
    const keepModels = modelPanels ?? hasModel;
    if (!plainObject(raw)) return null;
    const { version, panels, slides } = raw;
    let rawSlides: unknown[];
    if (version === 1 && Array.isArray(panels)) rawSlides = [{ ...slideNames(1), panels }];
    else if (version === WORKSPACE_LAYOUT_VERSION && Array.isArray(slides)) rawSlides = slides;
    else return null;
    const slideIds = new Set<string>();
    const clean: WorkspaceSlide[] = [];
    for (const item of rawSlides.slice(0, MAX_SLIDES)) {
        if (!plainObject(item)) continue;
        if (typeof item.id !== "string" || !PANEL_ID.test(item.id) || slideIds.has(item.id)) continue;
        const n = clean.length + 1;
        const title = typeof item.title === "string" && item.title.trim() ? item.title.trim().slice(0, SLIDE_TITLE_MAX) : `Slide ${n}`;
        const tag = typeof item.tag === "string" && SLIDE_TAG.test(item.tag.trim()) ? item.tag.trim() : `Slide_${n}`;
        slideIds.add(item.id);
        const canvas = sanitizeCanvas(item.canvas);
        clean.push({ id: item.id, title, tag, panels: sanitizePanels(item.panels, keepModels, gridOf({ canvas })), ...(canvas ? { canvas } : {}) });
    }
    if (clean.length === 0) return null;
    const layout: WorkspaceLayout = { version: WORKSPACE_LAYOUT_VERSION, slides: clean };
    const time = sanitizeTime(raw.time);
    if (time) layout.time = time;
    if (raw.simulatorPlaced === true) layout.simulatorPlaced = true;
    return layout;
};

// The panels of one slide, made safe
const sanitizePanels = (panels: unknown, hasModel: boolean, grid: PageGrid = gridOf(null)): WorkspacePanel[] => {
    if (!Array.isArray(panels)) return [];
    const ids = new Set<string>();
    const clean: WorkspacePanel[] = [];
    for (const item of panels.slice(0, MAX_PANELS)) {
        if (!item || typeof item !== "object") continue;
        const p = item as Record<string, unknown>;
        if (typeof p.id !== "string" || !PANEL_ID.test(p.id) || ids.has(p.id)) continue;
        if (!PANEL_TYPES.includes(p.type as PanelType)) continue;
        const type = p.type as PanelType;
        // on a canvas, the frame it is in (the 3D model and the simulator: one in each frame)
        const frame = !grid.compact && typeof p.frame === "string" && FRAME_ID.test(p.frame) ? p.frame : undefined;
        if (type === "model" && !hasModel) continue;
        if (SINGLE_PANEL_TYPES.includes(type) && clean.some((q) => q.type === type && sameSingleSlot(type, q, frame))) continue;
        if (!isInt(p.x) || !isInt(p.y) || !isInt(p.w) || !isInt(p.h)) continue;
        const w = clamp(p.w, 1, grid.cols);
        const h = clamp(p.h, 1, grid.maxRows);
        const panel: WorkspacePanel = {
            id: p.id,
            type,
            x: clamp(p.x, 0, grid.cols - w),
            // one page with a canvas
            y: clamp(p.y, 0, grid.compact ? grid.maxRows - 1 : grid.maxRows - h),
            w,
            h,
        };
        if (frame) panel.frame = frame;
        if (typeof p.title === "string" && p.title.trim()) panel.title = p.title.trim().slice(0, 80);
        if (p.type === "image") {
            panel.source = typeof p.source === "string" && SOURCE.test(p.source) ? p.source : ANY_IMAGE_SOURCE;
            if (p.display === "photo" || p.display === "video") panel.display = p.display;
        }
        if (p.type === "markdown") panel.text = typeof p.text === "string" ? p.text.slice(0, MARKDOWN_MAX_LENGTH) : "";
        if (p.type === "picture") {
            if (typeof p.file === "string" && PICTURE_FILE.test(p.file)) panel.file = p.file;
            if (PICTURE_FITS.includes(p.fit as PictureFit)) panel.fit = p.fit as PictureFit;
            const bindings = sanitizeBindings(p.bindings);
            if (bindings.length) panel.bindings = bindings;
            if (isPlaybackSpeed(p.playbackSpeed)) panel.playbackSpeed = p.playbackSpeed;
        }
        if (p.translucent === true && type !== "model") panel.translucent = true;
        if (p.type === "assetState") Object.assign(panel, sanitizeAssetStateSettings(p));
        if (p.type === "orgOverview") Object.assign(panel, sanitizeOrgOverviewSettings(p));
        if (FLOATING_PANEL_TYPES.includes(type)) {
            const float = sanitizeFloat(p.float);
            if (float) panel.float = float;
            if (p.floating === true) panel.floating = true;
        }
        if (p.type === "simulator" && p.format !== undefined) {
            const format = sanitizeSimulatorFormat(p.format);
            if (format) panel.format = format;
        }
        // the 3D Surface panels of before: Data charts of kind "surface" now
        if (p.type === "surface") {
            const surface = sanitizeSurface(p.surface);
            if (!surface) continue;
            panel.type = "dataChart";
            panel.data = dataChartOfSurface(surface);
        }
        if (p.type === "dataChart") {
            const data = sanitizeDataChart(p.data);
            if (!data) continue;
            panel.data = data;
        }
        if (p.type === "chart") {
            const series = sanitizeChartSeries(p.series);
            if (series.length === 0) continue;
            panel.series = series;
            if (typeof p.viz === "string" && CHART_VIZ_IDS.includes(p.viz)) panel.viz = p.viz;
            if (plainObject(p.options)) panel.options = p.options;
            if (plainObject(p.fieldConfig)) panel.fieldConfig = p.fieldConfig;
            for (const key of ["timeFrom", "timeShift", "interval"] as const) {
                const valid = key === "interval" ? INTERVAL_TEXT : SPAN_TEXT;
                if (typeof p[key] === "string" && valid.test(p[key] as string)) panel[key] = p[key] as string;
            }
            // the charts of 1.4.0 before the editor had a range of their own: their relative time now
            if (!panel.timeFrom && isChartRange(p.range)) panel.timeFrom = p.range;
            if (isInt(p.maxDataPoints) && p.maxDataPoints >= 10 && p.maxDataPoints <= 2000) panel.maxDataPoints = p.maxDataPoints;
            if (isInt(p.liveWindow) && p.liveWindow >= CHART_LIVE_WINDOW_MIN && p.liveWindow <= CHART_LIVE_WINDOW_MAX) panel.liveWindow = p.liveWindow;
        }
        ids.add(p.id);
        clean.push(panel);
    }
    return clean;
};

// The layout the page shows: the user's temporary one, else the group's, else the automatic one
export const effectiveWorkspaceLayout = (
    local: unknown,
    saved: unknown,
    context: WorkspaceContext,
): { layout: WorkspaceLayout; origin: "local" | "group" | "automatic" } => {
    const fromLocal = sanitizeWorkspaceLayout(local, context);
    if (fromLocal) return { layout: fromLocal, origin: "local" };
    const fromSaved = sanitizeWorkspaceLayout(saved, context);
    // a layout saved before simulator panels existed: the simulator floats on its first slide, as it used to
    if (fromSaved) return { layout: withSimulatorPanel(fromSaved, !!context.hasSimulator), origin: "group" };
    return { layout: defaultWorkspaceLayout(context), origin: "automatic" };
};

const collides = (a: { x: number; y: number; w: number; h: number }, b: WorkspacePanel) =>
    a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

// The first free place of w × h, from the top left; below everything if there is none
export const freePlace = (panels: WorkspacePanel[], w: number, h: number, grid: PageGrid = gridOf(null)): { x: number; y: number } => {
    const bottom = panels.reduce((max, p) => Math.max(max, p.y + p.h), 0);
    // one page (a canvas): the free place in it, else the top left corner (panels may overlap there)
    const last = grid.compact ? bottom : grid.maxRows - h;
    for (let y = 0; y <= last; y++) {
        for (let x = 0; x + w <= grid.cols; x++) {
            const box = { x, y, w, h };
            if (!panels.some((p) => collides(box, p))) return { x, y };
        }
    }
    return grid.compact ? { x: 0, y: bottom } : { x: 0, y: 0 };
};

export const newPanelId = (panels: WorkspacePanel[], type: PanelType): string => {
    if (type === "model" && !panels.some((p) => p.id === "model")) return "model";
    let n = 1;
    while (panels.some((p) => p.id === `${type}-${n}`)) n++;
    return `${type}-${n}`;
};

export interface NewPanel {
    type: PanelType;
    source?: string;
    display?: ImageDisplay;
    text?: string;
    file?: string;
    title?: string;
    series?: ChartSeriesRef[];
    viz?: string;
    // on a canvas: the frame it goes to
    frame?: string | null;
}

// frame: on a canvas, the frame the panel would go to (a 3D model and a simulator: one in each frame)
export const canAddModelPanel = (layout: WorkspacePage, hasModel: boolean, frame?: string | null) => canAddPanelType(layout, "model", hasModel, frame);

// a type that can be added: one model (when the twin has one), one alarms and one approvals panel; on a canvas, one
// model and one simulator in each frame
export const canAddPanelType = (layout: WorkspacePage, type: PanelType, hasModel: boolean, frame?: string | null) => {
    if (type === "model" && !hasModel) return false;
    const slot = layout.canvas ? frame : null;
    return !SINGLE_PANEL_TYPES.includes(type) || !layout.panels.some((p) => p.type === type && sameSingleSlot(type, p, slot));
};

export const addPanel = <T extends WorkspacePage>(layout: T, spec: NewPanel): T => {
    if (layout.panels.length >= MAX_PANELS) return layout;
    if (!canAddPanelType(layout, spec.type, true, spec.frame)) return layout;
    const grid = gridOf(layout);
    const w = NEW_PANEL_SIZE[spec.type].w * grid.scale;
    const h = Math.min(NEW_PANEL_SIZE[spec.type].h * grid.scale, grid.maxRows);
    const { x, y } = freePlace(layout.panels, w, h, grid);
    const panel: WorkspacePanel = { id: newPanelId(layout.panels, spec.type), type: spec.type, x, y, w, h };
    if (spec.type === "image") {
        panel.source = spec.source || ANY_IMAGE_SOURCE;
        panel.display = spec.display === "photo" ? "photo" : "video";
    }
    if (spec.type === "markdown") panel.text = (spec.text ?? "").slice(0, MARKDOWN_MAX_LENGTH);
    if (spec.type === "picture" && spec.file && PICTURE_FILE.test(spec.file)) panel.file = spec.file;
    // a 3D Surface is a Data chart of kind "surface"
    if (spec.type === "surface") {
        panel.type = "dataChart";
        panel.data = dataChartOfSurface(defaultSurface());
    }
    if (spec.type === "dataChart") panel.data = defaultDataChart();
    if (spec.type === "chart") {
        const series = sanitizeChartSeries(spec.series);
        if (series.length === 0) return layout;
        panel.series = series;
        if (spec.viz) panel.viz = spec.viz;
    }
    if (spec.title?.trim()) panel.title = spec.title.trim().slice(0, 80);
    if (layout.canvas && spec.frame && FRAME_ID.test(spec.frame)) panel.frame = spec.frame;
    return { ...layout, panels: [...layout.panels, panel] };
};

export const removePanel = <T extends WorkspacePage>(layout: T, id: string): T => ({
    ...layout,
    panels: layout.panels.filter((p) => p.id !== id),
});

export const renamePanel = <T extends WorkspacePage>(layout: T, id: string, title: string): T => ({
    ...layout,
    panels: layout.panels.map((p) => {
        if (p.id !== id) return p;
        const { title: _old, ...rest } = p;
        return title.trim() ? { ...rest, title: title.trim().slice(0, 80) } : rest;
    }),
});

export const replacePanel = <T extends WorkspacePage>(layout: T, panel: WorkspacePanel): T => ({
    ...layout,
    panels: layout.panels.map((p) => (p.id === panel.id ? panel : p)),
});

export const setLayoutTime = (layout: WorkspaceLayout, time: WorkspaceTime | undefined): WorkspaceLayout => {
    const { time: _old, ...rest } = layout;
    return time ? { ...rest, time } : rest;
};

// The positions and sizes react-grid-layout gives back, applied to the panels
export const applyGridItems = <T extends WorkspacePage>(
    layout: T,
    items: readonly { i: string; x: number; y: number; w: number; h: number }[],
): T => {
    const byId = new Map(items.map((item) => [item.i, item]));
    let changed = false;
    const panels = layout.panels.map((p) => {
        const item = byId.get(p.id);
        if (!item || (item.x === p.x && item.y === p.y && item.w === p.w && item.h === p.h)) return p;
        changed = true;
        return { ...p, x: item.x, y: item.y, w: item.w, h: item.h };
    });
    return changed ? { ...layout, panels } : layout;
};

export const toGridItems = (layout: WorkspacePage, editable: boolean) =>
    layout.panels.map((p) => ({
        i: p.id,
        x: p.x,
        y: p.y,
        w: p.w,
        h: p.h,
        minW: minSizeOf(p.type).w * gridOf(layout).scale,
        minH: minSizeOf(p.type).h * gridOf(layout).scale,
        isDraggable: editable,
        isResizable: editable,
    }));

// a value as JSON with the keys of its objects in order (two panels with the same settings give the same text)
const stableJson = (value: unknown): string =>
    Array.isArray(value)
        ? `[${value.map(stableJson).join(",")}]`
        : value !== null && typeof value === "object"
          ? `{${Object.keys(value as object)
                .filter((k) => (value as Record<string, unknown>)[k] !== undefined)
                .sort()
                .map((k) => `${JSON.stringify(k)}:${stableJson((value as Record<string, unknown>)[k])}`)
                .join(",")}}`
          : JSON.stringify(value ?? null);

// every setting of the panels (their text, picture, Data chart, format… too), in the order of their ids
const normalized = (layout: WorkspacePage) => stableJson([...layout.panels].sort((a, b) => a.id.localeCompare(b.id)));

const sameSlide = (a: WorkspaceSlide, b: WorkspaceSlide) =>
    a.id === b.id && a.title === b.title && a.tag === b.tag && stableJson(a.canvas ?? null) === stableJson(b.canvas ?? null) && normalized(a) === normalized(b);

export const sameLayout = (a: WorkspaceLayout, b: WorkspaceLayout) =>
    !!a.simulatorPlaced === !!b.simulatorPlaced &&
    a.slides.length === b.slides.length &&
    a.slides.every((slide, i) => sameSlide(slide, b.slides[i])) &&
    JSON.stringify(a.time ?? null) === JSON.stringify(b.time ?? null);

// --- Slides ---------------------------------------------------------------------------------------------------

// the first number n with no slide slide-n, "Slide_n" nor "Slide n"
const freeSlideNumber = (layout: WorkspaceLayout) => {
    let n = layout.slides.length + 1;
    const taken = (k: number) => layout.slides.some((s) => s.id === `slide-${k}` || s.tag === `Slide_${k}` || s.title === `Slide ${k}`);
    while (taken(n)) n++;
    return n;
};

export const canAddSlide = (layout: WorkspaceLayout) => layout.slides.length < MAX_SLIDES;

// A new empty slide after the slide `after` (at the end without it); returns the layout and the new slide's id
export const addSlide = (layout: WorkspaceLayout, after?: string): { layout: WorkspaceLayout; id: string } => {
    if (!canAddSlide(layout)) return { layout, id: after ?? layout.slides[0].id };
    const slide: WorkspaceSlide = { ...slideNames(freeSlideNumber(layout)), id: newSlideId(layout), panels: [] };
    const at = after ? layout.slides.findIndex((s) => s.id === after) : -1;
    const slides = [...layout.slides];
    slides.splice(at === -1 ? slides.length : at + 1, 0, slide);
    return { layout: { ...layout, slides }, id: slide.id };
};

// A copy of a slide, after it: same panels and tag, the title "… (copy)"
export const duplicateSlide = (layout: WorkspaceLayout, id: string): { layout: WorkspaceLayout; id: string } => {
    const at = layout.slides.findIndex((s) => s.id === id);
    if (at === -1 || !canAddSlide(layout)) return { layout, id };
    const source = layout.slides[at];
    const copy: WorkspaceSlide = {
        id: newSlideId(layout),
        title: `${source.title} (copy)`.slice(0, SLIDE_TITLE_MAX),
        tag: source.tag,
        panels: source.panels.map((p) => ({ ...p })),
        ...(source.canvas ? { canvas: { ...source.canvas } } : {}),
    };
    const slides = [...layout.slides];
    slides.splice(at + 1, 0, copy);
    return { layout: { ...layout, slides }, id: copy.id };
};

// Removes a slide (never the last one); returns the layout and the slide to show then
export const removeSlide = (layout: WorkspaceLayout, id: string): { layout: WorkspaceLayout; id: string } => {
    const at = layout.slides.findIndex((s) => s.id === id);
    if (at === -1 || layout.slides.length === 1) return { layout, id };
    const slides = layout.slides.filter((s) => s.id !== id);
    return { layout: { ...layout, slides }, id: slides[Math.min(at, slides.length - 1)].id };
};

// Moves a slide one place before (-1) or after (+1)
export const moveSlide = (layout: WorkspaceLayout, id: string, delta: -1 | 1): WorkspaceLayout => {
    const at = layout.slides.findIndex((s) => s.id === id);
    const to = at + delta;
    if (at === -1 || to < 0 || to >= layout.slides.length) return layout;
    const slides = [...layout.slides];
    [slides[at], slides[to]] = [slides[to], slides[at]];
    return { ...layout, slides };
};

// Puts a slide at the place `to` (0 = first), the others keep their order
export const reorderSlide = (layout: WorkspaceLayout, id: string, to: number): WorkspaceLayout => {
    const at = layout.slides.findIndex((s) => s.id === id);
    const target = Math.max(0, Math.min(layout.slides.length - 1, to));
    if (at === -1 || at === target) return layout;
    const slides = [...layout.slides];
    const [slide] = slides.splice(at, 1);
    slides.splice(target, 0, slide);
    return { ...layout, slides };
};

// The slides whose title, tag or panel titles contain the text (without case or accents)
const fold = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
export const searchSlides = (slides: WorkspaceSlide[], query: string): WorkspaceSlide[] => {
    const q = fold(query.trim());
    if (!q) return slides;
    return slides.filter((s) => [s.title, s.tag, ...s.panels.map(panelTitle)].some((text) => fold(text).includes(q)));
};

// The title and the tag of a slide (an empty or invalid value keeps the current one)
export const updateSlide = (layout: WorkspaceLayout, id: string, patch: { title?: string; tag?: string }): WorkspaceLayout => ({
    ...layout,
    slides: layout.slides.map((s) => {
        if (s.id !== id) return s;
        const title = patch.title?.trim() ? patch.title.trim().slice(0, SLIDE_TITLE_MAX) : s.title;
        const tag = patch.tag !== undefined && SLIDE_TAG.test(patch.tag.trim()) ? patch.tag.trim() : s.tag;
        return { ...s, title, tag };
    }),
});

// A slide changed (its panels) put back in the layout
export const replaceSlide = (layout: WorkspaceLayout, slide: WorkspaceSlide): WorkspaceLayout => ({
    ...layout,
    slides: layout.slides.map((s) => (s.id === slide.id ? slide : s)),
});

// The tags of the slides, in the order of the slides
export const slideTags = (layout: WorkspaceLayout): string[] => [...new Set(layout.slides.map((s) => s.tag))];

// The slides shown in the slide bar: all but those the user hid (all of them when every slide is hidden)
export const visibleSlides = (layout: WorkspaceLayout, hiddenIds: readonly string[]): WorkspaceSlide[] => {
    const shown = layout.slides.filter((s) => !hiddenIds.includes(s.id));
    return shown.length ? shown : layout.slides;
};

// The slide to show: the one asked for when it is not hidden, else the first one shown
export const currentSlideOf = (layout: WorkspaceLayout, id: string | null | undefined, hiddenIds: readonly string[]): WorkspaceSlide => {
    const shown = visibleSlides(layout, hiddenIds);
    return shown.find((s) => s.id === id) ?? shown[0];
};

// The slide before or after the current one among those shown (round)
export const stepSlide = (layout: WorkspaceLayout, id: string, delta: number, hiddenIds: readonly string[]): string => {
    const shown = visibleSlides(layout, hiddenIds);
    const at = Math.max(0, shown.findIndex((s) => s.id === id));
    return shown[(((at + delta) % shown.length) + shown.length) % shown.length].id;
};

// Hides (or shows) the slides `ids`. Some slide is always shown: hiding the last ones shown changes nothing.
// The ids of slides no longer in the layout are forgotten.
export const setSlidesHidden = (layout: WorkspaceLayout, hiddenIds: readonly string[], ids: readonly string[], hide: boolean): string[] => {
    const exists = new Set(layout.slides.map((s) => s.id));
    const kept = hiddenIds.filter((id) => exists.has(id));
    const next = hide ? [...new Set([...kept, ...ids.filter((id) => exists.has(id))])] : kept.filter((id) => !ids.includes(id));
    return next.length >= layout.slides.length ? kept : next;
};

// What a topic of images is, in words
const SOURCE_LABELS: Record<string, string> = {
    [ANY_IMAGE_SOURCE]: "All images",
    dtm2sim: "Pipeline images",
    sim2dtm: "Viewer images",
};

// a device topic of the asset: what a device (a camera, the mobile phone...) sends to the digital twin
export const DEVICE_IMAGE_SOURCE = /^dev2dtm_\d+$/;

export const imageSourceLabel = (source: string | undefined): string => {
    const key = source || ANY_IMAGE_SOURCE;
    if (DEVICE_IMAGE_SOURCE.test(key)) return `Device (${key})`;
    return SOURCE_LABELS[key] ?? key;
};

// A source typed by the user: valid (a topic reference) or not
export const isImageSource = (source: string): boolean => SOURCE.test(source);

// The device topics shown by the Image panels of the layout (the viewer listens to them only while a panel shows
// them: the frames of a device can be many)
export const deviceImageSources = (layout: WorkspaceLayout): string[] =>
    Array.from(
        new Set(
            layout.slides.flatMap((slide) =>
                slide.panels.filter((p) => p.type === "image" && p.source && DEVICE_IMAGE_SOURCE.test(p.source)).map((p) => p.source as string),
            ),
        ),
    ).sort((a, b) => Number(a.split("_")[1]) - Number(b.split("_")[1]));

// An Image panel shown as a video or as a photo
export const setPanelDisplay = <T extends WorkspacePage>(layout: T, id: string, display: ImageDisplay): T => ({
    ...layout,
    panels: layout.panels.map((p) => (p.id === id && p.type === "image" ? { ...p, display } : p)),
});

// The source of an Image panel changed
export const setPanelSource = <T extends WorkspacePage>(layout: T, id: string, source: string): T => ({
    ...layout,
    panels: layout.panels.map((p) => (p.id === id && p.type === "image" && isImageSource(source) ? { ...p, source } : p)),
});

export const panelTitle = (panel: WorkspacePanel): string => {
    if (panel.title) return panel.title;
    if (panel.type === "model") return "3D model";
    if (panel.type === "chart") return "Time series chart";
    if (panel.type === "alarms") return "Alarms";
    if (panel.type === "approvals") return "Approvals";
    if (panel.type === "markdown") return "Text";
    if (panel.type === "picture") return panel.file ? panel.file.replace(/\.[^.]+$/, "") : "Picture";
    if (panel.type === "surface") return "3D Surface";
    if (panel.type === "dataChart") return "Data chart";
    if (panel.type === "assetState") return "Asset state";
    if (panel.type === "health") return "Health";
    if (panel.type === "pipelineLogs") return "Pipeline logs";
    if (panel.type === "orgOverview") return "Organization overview";
    if (panel.type === "simulator") return "Simulator";
    const kind = imageDisplayOf(panel) === "photo" ? "Photo" : "Video";
    return panel.source && panel.source !== ANY_IMAGE_SOURCE ? `${kind} · ${imageSourceLabel(panel.source)}` : kind;
};

export interface ImageSourceOption {
    value: string;
    label: string;
    // images have arrived from it since the viewer was opened
    live: boolean;
}

// The sources an Image panel can show: all images, the topics with images of the digital twin (dtm2sim) and of
// its asset (dev2dtm_1, dev2dtm_2...), and any other source that has sent images (those receiving first)
export const imageSourceOptions = (topicRefs: string[], liveSources: string[]): ImageSourceOption[] => {
    const live = new Set(liveSources);
    const refs = Array.from(new Set([...topicRefs, ...liveSources])).filter((ref) => SOURCE.test(ref) && ref !== ANY_IMAGE_SOURCE);
    const device = (ref: string) => DEVICE_IMAGE_SOURCE.test(ref);
    refs.sort(
        (a, b) =>
            Number(live.has(b)) - Number(live.has(a)) ||
            Number(device(a)) - Number(device(b)) ||
            (device(a) && device(b) ? Number(a.split("_")[1]) - Number(b.split("_")[1]) : a.localeCompare(b)),
    );
    return [
        { value: ANY_IMAGE_SOURCE, label: imageSourceLabel(ANY_IMAGE_SOURCE), live: liveSources.length > 0 },
        ...refs.map((ref) => ({
            value: ref,
            label: device(ref) ? imageSourceLabel(ref) : SOURCE_LABELS[ref] ? `${SOURCE_LABELS[ref]} (${ref})` : ref,
            live: live.has(ref),
        })),
    ];
};

// Height of a row so that PAGE_ROWS rows fill the page
export const rowHeightFor = (height: number, margin = GRID_MARGIN, rows = PAGE_ROWS) =>
    rows === PAGE_ROWS
        ? Math.max(MIN_ROW_HEIGHT, Math.floor((height - margin * (rows - 1)) / rows))
        : // a canvas: its rows fill the page exactly (they are small)
          Math.max(4, (height - margin * (rows - 1)) / rows);

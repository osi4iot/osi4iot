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
import { REFRESH_INTERVALS } from "./charts/timeRange";

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

export type PanelType = "model" | "image" | "chart" | "alarms" | "approvals" | "markdown" | "picture";
// the text of a Text panel (markdown, LaTeX and {{topicRef.path}} values): at most these characters
export const MARKDOWN_MAX_LENGTH = 20000;
// how an Image panel shows the frames of its source: as a video (live, with pause) or as a photo (the last
// one and when it arrived)
export type ImageDisplay = "video" | "photo";
export const imageDisplayOf = (panel: { display?: ImageDisplay }): ImageDisplay => (panel.display === "photo" ? "photo" : "video");
// at most one panel of these types on a page
export const SINGLE_PANEL_TYPES: PanelType[] = ["model", "alarms", "approvals"];

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
    x: number;
    y: number;
    w: number;
    h: number;
}

// the panels of one screen
export interface WorkspacePage {
    panels: WorkspacePanel[];
}

export interface WorkspaceSlide extends WorkspacePage {
    id: string;
    title: string;
    tag: string;
}

export interface WorkspaceLayout {
    version: number;
    time?: WorkspaceTime;
    slides: WorkspaceSlide[];
}

export interface WorkspaceContext {
    hasModel: boolean;
    hasCamera: boolean;
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
};
const MIN_SIZE: Record<PanelType, { w: number; h: number }> = {
    model: { w: 3, h: 3 },
    image: { w: 2, h: 2 },
    chart: { w: 3, h: 3 },
    alarms: { w: 3, h: 3 },
    approvals: { w: 3, h: 3 },
    markdown: { w: 2, h: 1 },
    picture: { w: 2, h: 2 },
};

export const minSizeOf = (type: PanelType) => MIN_SIZE[type];

const PANEL_TYPES: PanelType[] = ["model", "image", "chart", "alarms", "approvals", "markdown", "picture"];
export const PICTURE_FILE = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,79}\.(png|jpe?g|webp|gif|svg)$/i;
const PANEL_ID = /^[A-Za-z0-9_-]{1,40}$/;
const SOURCE = /^[A-Za-z0-9_.-]{1,60}$/;
const SENSOR_REF = /^[A-Za-z0-9_.-]{1,60}$/;

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

export const defaultWorkspaceLayout = ({ hasModel, hasCamera }: WorkspaceContext): WorkspaceLayout => {
    const panels: WorkspacePanel[] = [];
    if (hasModel && hasCamera) {
        panels.push({ id: "model", type: "model", x: 0, y: 0, w: 7, h: PAGE_ROWS });
        panels.push({ id: "image", type: "image", source: ANY_IMAGE_SOURCE, x: 7, y: 0, w: 5, h: PAGE_ROWS });
    } else if (hasModel) {
        panels.push({ id: "model", type: "model", x: 0, y: 0, w: GRID_COLS, h: PAGE_ROWS });
    } else if (hasCamera) {
        panels.push({ id: "image", type: "image", source: ANY_IMAGE_SOURCE, x: 0, y: 0, w: GRID_COLS, h: PAGE_ROWS });
    }
    return { version: WORKSPACE_LAYOUT_VERSION, slides: [{ ...slideNames(1), panels }] };
};

// the id, title and tag of the slide number n
const slideNames = (n: number) => ({ id: `slide-${n}`, title: `Slide ${n}`, tag: `Slide_${n}` });

const isInt = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value);
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

// A layout read from admin_api or from memory, made safe: unknown or broken slides and panels are dropped,
// sizes are kept inside the grid, and the model panels are dropped when the twin has no 3D model. A layout of
// version 1 becomes one slide. null when it is not a layout.
export const sanitizeWorkspaceLayout = (raw: unknown, { hasModel }: Pick<WorkspaceContext, "hasModel">): WorkspaceLayout | null => {
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
        clean.push({ id: item.id, title, tag, panels: sanitizePanels(item.panels, hasModel) });
    }
    if (clean.length === 0) return null;
    const layout: WorkspaceLayout = { version: WORKSPACE_LAYOUT_VERSION, slides: clean };
    const time = sanitizeTime(raw.time);
    if (time) layout.time = time;
    return layout;
};

// The panels of one slide, made safe
const sanitizePanels = (panels: unknown, hasModel: boolean): WorkspacePanel[] => {
    if (!Array.isArray(panels)) return [];
    const ids = new Set<string>();
    const clean: WorkspacePanel[] = [];
    let hasModelPanel = false;
    for (const item of panels.slice(0, MAX_PANELS)) {
        if (!item || typeof item !== "object") continue;
        const p = item as Record<string, unknown>;
        if (typeof p.id !== "string" || !PANEL_ID.test(p.id) || ids.has(p.id)) continue;
        if (!PANEL_TYPES.includes(p.type as PanelType)) continue;
        const type = p.type as PanelType;
        if (type === "model" && (!hasModel || hasModelPanel)) continue;
        if ((type === "alarms" || type === "approvals") && clean.some((q) => q.type === type)) continue;
        if (!isInt(p.x) || !isInt(p.y) || !isInt(p.w) || !isInt(p.h)) continue;
        const w = clamp(p.w, 1, GRID_COLS);
        const panel: WorkspacePanel = {
            id: p.id,
            type,
            x: clamp(p.x, 0, GRID_COLS - w),
            y: clamp(p.y, 0, MAX_ROWS - 1),
            w,
            h: clamp(p.h, 1, MAX_ROWS),
        };
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
        }
        if (p.type === "chart") {
            const series = sanitizeChartSeries(p.series);
            if (series.length === 0) continue;
            panel.series = series;
            if (typeof p.viz === "string" && CHART_VIZ_IDS.includes(p.viz)) panel.viz = p.viz;
            if (plainObject(p.options)) panel.options = p.options;
            if (plainObject(p.fieldConfig)) panel.fieldConfig = p.fieldConfig;
            for (const key of ["timeFrom", "timeShift", "interval"] as const) {
                if (typeof p[key] === "string" && SPAN_TEXT.test(p[key] as string)) panel[key] = p[key] as string;
            }
            // the charts of 1.4.0 before the editor had a range of their own: their relative time now
            if (!panel.timeFrom && isChartRange(p.range)) panel.timeFrom = p.range;
            if (isInt(p.maxDataPoints) && p.maxDataPoints >= 10 && p.maxDataPoints <= 2000) panel.maxDataPoints = p.maxDataPoints;
        }
        if (p.type === "model") hasModelPanel = true;
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
    if (fromSaved) return { layout: fromSaved, origin: "group" };
    return { layout: defaultWorkspaceLayout(context), origin: "automatic" };
};

const collides = (a: { x: number; y: number; w: number; h: number }, b: WorkspacePanel) =>
    a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

// The first free place of w × h, from the top left; below everything if there is none
export const freePlace = (panels: WorkspacePanel[], w: number, h: number): { x: number; y: number } => {
    const bottom = panels.reduce((max, p) => Math.max(max, p.y + p.h), 0);
    for (let y = 0; y <= bottom; y++) {
        for (let x = 0; x + w <= GRID_COLS; x++) {
            const box = { x, y, w, h };
            if (!panels.some((p) => collides(box, p))) return { x, y };
        }
    }
    return { x: 0, y: bottom };
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
}

export const canAddModelPanel = (layout: WorkspacePage, hasModel: boolean) =>
    hasModel && !layout.panels.some((p) => p.type === "model");

// a type that can be added: one model (when the twin has one), one alarms and one approvals panel
export const canAddPanelType = (layout: WorkspacePage, type: PanelType, hasModel: boolean) => {
    if (type === "model" && !hasModel) return false;
    return !SINGLE_PANEL_TYPES.includes(type) || !layout.panels.some((p) => p.type === type);
};

export const addPanel = <T extends WorkspacePage>(layout: T, spec: NewPanel): T => {
    if (layout.panels.length >= MAX_PANELS) return layout;
    if (SINGLE_PANEL_TYPES.includes(spec.type) && layout.panels.some((p) => p.type === spec.type)) return layout;
    const { w, h } = NEW_PANEL_SIZE[spec.type];
    const { x, y } = freePlace(layout.panels, w, h);
    const panel: WorkspacePanel = { id: newPanelId(layout.panels, spec.type), type: spec.type, x, y, w, h };
    if (spec.type === "image") {
        panel.source = spec.source || ANY_IMAGE_SOURCE;
        panel.display = spec.display === "photo" ? "photo" : "video";
    }
    if (spec.type === "markdown") panel.text = (spec.text ?? "").slice(0, MARKDOWN_MAX_LENGTH);
    if (spec.type === "picture" && spec.file && PICTURE_FILE.test(spec.file)) panel.file = spec.file;
    if (spec.type === "chart") {
        const series = sanitizeChartSeries(spec.series);
        if (series.length === 0) return layout;
        panel.series = series;
        if (spec.viz) panel.viz = spec.viz;
    }
    if (spec.title?.trim()) panel.title = spec.title.trim().slice(0, 80);
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
        minW: minSizeOf(p.type).w,
        minH: minSizeOf(p.type).h,
        isDraggable: editable,
        isResizable: editable,
    }));

const normalized = (layout: WorkspacePage) =>
    JSON.stringify(
        [...layout.panels]
            .sort((a, b) => a.id.localeCompare(b.id))
            .map((p) => [
                p.id,
                p.type,
                p.title ?? "",
                p.source ?? "",
                JSON.stringify(p.series ?? []),
                p.range ?? "",
                p.viz ?? "",
                JSON.stringify(p.options ?? {}),
                JSON.stringify(p.fieldConfig ?? {}),
                p.timeFrom ?? "",
                p.timeShift ?? "",
                p.interval ?? "",
                p.maxDataPoints ?? "",
                p.x,
                p.y,
                p.w,
                p.h,
            ]),
    );

const sameSlide = (a: WorkspaceSlide, b: WorkspaceSlide) =>
    a.id === b.id && a.title === b.title && a.tag === b.tag && normalized(a) === normalized(b);

export const sameLayout = (a: WorkspaceLayout, b: WorkspaceLayout) =>
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
    const slide: WorkspaceSlide = { ...slideNames(freeSlideNumber(layout)), panels: [] };
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
        id: slideNames(freeSlideNumber(layout)).id,
        title: `${source.title} (copy)`.slice(0, SLIDE_TITLE_MAX),
        tag: source.tag,
        panels: source.panels.map((p) => ({ ...p })),
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
    if (panel.type === "chart") return "Chart";
    if (panel.type === "alarms") return "Alarms";
    if (panel.type === "approvals") return "Approvals";
    if (panel.type === "markdown") return "Text";
    if (panel.type === "picture") return panel.file ? panel.file.replace(/\.[^.]+$/, "") : "Picture";
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
export const rowHeightFor = (height: number, margin = GRID_MARGIN) =>
    Math.max(MIN_ROW_HEIGHT, Math.floor((height - margin * (PAGE_ROWS - 1)) / PAGE_ROWS));

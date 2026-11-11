// The layout of the Viewer page of a digital twin (the panels a group administrator arranges for the whole
// group). admin_api checks its shape so that a bad client cannot store anything else; the frontend checks it
// again when it reads it (a panel whose source no longer exists is shown empty or dropped there).
//
//   { version: 2, time?: { from, to, refresh }, slides: [{ id, title, tag, panels: [{ id, type, title?, source?,
//     x, y, w, h, ... }] }] }
//
// slides: the screens of the Viewer, one after another (arrows, tabs); each has its own grid of panels, a title
// and a tag (the filters of the Viewer show or hide the slides of a tag; by default "Slide_1", "Slide_2"…).
// Version 1 (one grid: { version: 1, panels }) is still accepted and becomes one slide.
//
// time: the range of time and the refresh of the whole page, as in a Grafana dashboard ("now-6h", "now",
// "30s"; from / to may also be dates).
//
// x, w: columns of a grid of VIEWER_LAYOUT_COLS; y, h: rows (the page shows VIEWER_LAYOUT_ROWS rows, more
// scroll). Types: "model" (the 3D model, at most one), "image" (frames of a topic, "any" = all of them) and
// "chart" (fields of sensors of the asset, drawn as a Grafana panel: viz, series, options, fieldConfig, and
// the panel's own time: timeFrom, timeShift, interval, maxDataPoints),
// "alarms" and "approvals" (the twin's alarms and approval requests, from the history tables; one of each) and
// "markdown" (a Text panel: text with markdown, LaTeX and values of the NATS messages) and "picture" (an image of
// the twin's files, viewerImages; an SVG with animations of its elements: bindings).

export const VIEWER_LAYOUT_VERSION = 2;
export const VIEWER_LAYOUT_MAX_SLIDES = 20;
export const VIEWER_LAYOUT_COLS = 12;
export const VIEWER_LAYOUT_MAX_ROWS = 96;
export const VIEWER_LAYOUT_MAX_PANELS = 40;
export const VIEWER_LAYOUT_MAX_BYTES = 1000000;
// the settings of a chart (options, fieldConfig): JSON objects, at most this size and depth
export const CHART_SETTINGS_MAX_BYTES = 20000;
export const CHART_SETTINGS_MAX_DEPTH = 8;
export const CHART_VIZ = ["timeseries", "barchart", "stat", "gauge", "bargauge", "table", "piechart", "statetimeline", "histogram"] as const;
// links (data links, panel links): web addresses or paths of this platform only (no javascript:, data:…)
const SAFE_URL = /^(https?:\/\/|\/(?!\/))/i;
export const SERIES_AGGREGATIONS = ["mean", "min", "max", "last", "first", "sum", "count"] as const;
export const REFRESH_INTERVALS = ["", "200ms", "1s", "5s", "10s", "30s", "1m", "5m", "15m", "30m", "1h", "2h", "1d"] as const;
export const VIEWER_PANEL_TYPES = ["model", "image", "chart", "alarms", "approvals", "markdown", "picture"] as const;
// a Picture panel: an image of the twin (folder viewerImages of its files) and, for an SVG, animations of its
// elements with values of the NATS messages
export const VIEWER_PICTURE_FILE = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,79}\.(png|jpe?g|webp|gif|svg)$/i;
export const VIEWER_PICTURE_FITS = ["contain", "cover", "fill"] as const;
export const VIEWER_PICTURE_ACTIONS = ["text", "color", "rotate", "translateX", "translateY", "scale", "opacity", "visible"] as const;
export const VIEWER_PICTURE_MAX_BINDINGS = 100;
const PICTURE_ELEMENT = /^[A-Za-z_][A-Za-z0-9_.:-]{0,79}$/;
const PICTURE_PATH = /^[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+){0,15}$/;
const PICTURE_COLOR = /^(#[0-9a-fA-F]{3,8}|[a-zA-Z]{3,20}|rgba?\([\d\s.,%]+\))$/;
const PICTURE_COMPARE = [">", ">=", "<", "<=", "==", "!="];

export interface IPictureBinding {
	element: string;
	topicRef: string;
	path: string;
	action: (typeof VIEWER_PICTURE_ACTIONS)[number];
	[key: string]: unknown;
}

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

const validatePictureBindings = (raw: unknown): IPictureBinding[] | string => {
	if (raw === undefined) return [];
	if (!Array.isArray(raw)) return "bindings must be an array";
	if (raw.length > VIEWER_PICTURE_MAX_BINDINGS) return `at most ${VIEWER_PICTURE_MAX_BINDINGS} animations`;
	const out: IPictureBinding[] = [];
	for (const [i, item] of raw.entries()) {
		const where = `animation ${i + 1}`;
		if (!item || typeof item !== "object" || Array.isArray(item)) return `${where}: must be an object`;
		const b = item as Record<string, unknown>;
		if (typeof b.element !== "string" || !PICTURE_ELEMENT.test(b.element)) return `${where}: invalid element id`;
		if (typeof b.topicRef !== "string" || !SOURCE.test(b.topicRef)) return `${where}: invalid topic`;
		if (typeof b.path !== "string" || !PICTURE_PATH.test(b.path)) return `${where}: invalid field`;
		if (!VIEWER_PICTURE_ACTIONS.includes(b.action as IPictureBinding["action"])) return `${where}: invalid action`;
		const binding: IPictureBinding = { element: b.element, topicRef: b.topicRef, path: b.path, action: b.action as IPictureBinding["action"] };
		for (const key of ["inMin", "inMax", "outMin", "outMax", "cx", "cy", "value", "decimals"]) {
			if (b[key] === undefined) continue;
			if (!isNum(b[key])) return `${where}: ${key} must be a number`;
			binding[key] = b[key];
		}
		for (const key of ["prefix", "suffix"]) {
			if (b[key] === undefined) continue;
			if (typeof b[key] !== "string" || (b[key] ).length > 20) return `${where}: ${key} must be a text of at most 20 characters`;
			binding[key] = b[key];
		}
		if (b.target !== undefined) {
			if (b.target !== "fill" && b.target !== "stroke") return `${where}: target must be "fill" or "stroke"`;
			binding.target = b.target;
		}
		if (b.op !== undefined) {
			if (!PICTURE_COMPARE.includes(b.op as string)) return `${where}: invalid comparison`;
			binding.op = b.op;
		}
		if (b.thresholds !== undefined) {
			if (!Array.isArray(b.thresholds) || b.thresholds.length > 20) return `${where}: thresholds must be a list of at most 20`;
			for (const t of b.thresholds) {
				if (!t || typeof t !== "object" || typeof t.color !== "string" || !PICTURE_COLOR.test(t.color) || !(t.value === null || isNum(t.value))) {
					return `${where}: each threshold has a value (or null) and a colour`;
				}
			}
			binding.thresholds = b.thresholds.map((t: { value: number | null; color: string }) => ({ value: t.value, color: t.color }));
		}
		out.push(binding);
	}
	return out;
};
// the text of a Text panel (markdown, LaTeX and {{topicRef.path}} values of the NATS messages)
export const VIEWER_MARKDOWN_MAX_LENGTH = 20000;
export const CHART_RANGES = ["15m", "1h", "6h", "24h", "7d", "30d"] as const;
export const CHART_MAX_SERIES = 8;

export type ViewerPanelType = (typeof VIEWER_PANEL_TYPES)[number];

export interface IChartSeries {
	sensor: string;
	field: string;
	index?: number;
	agg?: (typeof SERIES_AGGREGATIONS)[number];
	alias?: string;
	color?: string;
	axis?: "left" | "right";
	hide?: boolean;
}

export interface IViewerTime {
	from: string;
	to: string;
	refresh: string;
}

export interface IViewerPanel {
	id: string;
	type: ViewerPanelType;
	title?: string;
	source?: string;
	// image: shown as a video (live, with pause) or as a photo (the last one); video when not said
	display?: "video" | "photo";
	text?: string;
	file?: string;
	fit?: (typeof VIEWER_PICTURE_FITS)[number];
	bindings?: IPictureBinding[];
	series?: IChartSeries[];
	range?: (typeof CHART_RANGES)[number];
	viz?: (typeof CHART_VIZ)[number];
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

export interface IViewerSlide {
	id: string;
	title: string;
	tag: string;
	panels: IViewerPanel[];
}

export interface IViewerLayout {
	version: number;
	time?: IViewerTime;
	slides: IViewerSlide[];
}

// "now", "now-6h", "now-1d/d", "now/w" (Grafana's relative times) or a date (ISO, or milliseconds)
const RELATIVE_TIME = /^now(-\d{1,6}[smhdwMy])?(\/[smhdwMy])?$/;
const isTimeText = (value: unknown): value is string =>
	typeof value === "string" &&
	value.length <= 40 &&
	(RELATIVE_TIME.test(value) || /^\d{10,14}$/.test(value) || (/^\d{4}-\d{2}-\d{2}/.test(value) && !Number.isNaN(Date.parse(value))));
// a span of time: 30s, 5m, 1h, 7d…
const SPAN = /^\d{1,6}[smhdwMy]$/;

const validateTime = (raw: unknown): IViewerTime | string => {
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) return "time must be an object";
	const { from, to, refresh } = raw as Record<string, unknown>;
	if (!isTimeText(from) || !isTimeText(to)) return "time: from and to must be like now-6h, now or a date";
	if (!REFRESH_INTERVALS.includes((refresh ?? "") as (typeof REFRESH_INTERVALS)[number])) return "time: invalid refresh";
	return { from, to, refresh: (refresh ?? "") as string };
};

// a JSON object of settings: plain values, not too big nor too deep
const validateSettings = (raw: unknown, name: string): Record<string, unknown> | string => {
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) return `${name} must be an object`;
	if (JSON.stringify(raw).length > CHART_SETTINGS_MAX_BYTES) return `${name} is too big`;
	const depth = (value: unknown): number =>
		value && typeof value === "object" ? 1 + Math.max(0, ...Object.values(value ).map(depth)) : 0;
	if (depth(raw) > CHART_SETTINGS_MAX_DEPTH) return `${name} is too deep`;
	const badUrl = (value: unknown): boolean => {
		if (Array.isArray(value)) return value.some(badUrl);
		if (!value || typeof value !== "object") return false;
		return Object.entries(value as Record<string, unknown>).some(
			([key, v]) => (key === "url" && (typeof v !== "string" || !SAFE_URL.test(v.trim()))) || badUrl(v)
		);
	};
	if (badUrl(raw)) return `${name}: links must be web addresses (http:// or https://) or paths of the platform`;
	return raw as Record<string, unknown>;
};

const PANEL_ID = /^[A-Za-z0-9_-]{1,40}$/;
// a topicRef (dtm2sim, dev2dtm_1…) or "any"
const SOURCE = /^[A-Za-z0-9_.-]{1,60}$/;

const isInt = (value: unknown, min: number, max: number): value is number =>
	typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;

// The layout cleaned up (only the known keys), or the reason why it is not valid. Version 1 becomes one slide.
export const validateViewerLayout = (raw: unknown): IViewerLayout | string => {
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) return "The layout must be a JSON object";
	if (JSON.stringify(raw).length > VIEWER_LAYOUT_MAX_BYTES) {
		return `The layout must be at most ${VIEWER_LAYOUT_MAX_BYTES / 1000} kB`;
	}
	const { version, panels, slides, time } = raw as Record<string, unknown>;
	let rawSlides: unknown[];
	if (version === 1) {
		if (!Array.isArray(panels)) return "The layout must have a list of panels";
		rawSlides = [{ id: "slide-1", title: "Slide 1", tag: "Slide_1", panels }];
	} else if (version === VIEWER_LAYOUT_VERSION) {
		if (!Array.isArray(slides) || slides.length === 0) return "The layout must have a list of slides";
		rawSlides = slides;
	} else {
		return `Unknown layout version (expected ${VIEWER_LAYOUT_VERSION})`;
	}
	if (rawSlides.length > VIEWER_LAYOUT_MAX_SLIDES) return `At most ${VIEWER_LAYOUT_MAX_SLIDES} slides`;
	const slideIds = new Set<string>();
	const cleanSlides: IViewerSlide[] = [];
	for (const [index, item] of rawSlides.entries()) {
		const where = `Slide ${index + 1}`;
		if (!item || typeof item !== "object" || Array.isArray(item)) return `${where} must be an object`;
		const sl = item as Record<string, unknown>;
		if (typeof sl.id !== "string" || !PANEL_ID.test(sl.id)) return `${where}: invalid id`;
		if (slideIds.has(sl.id)) return `${where}: repeated id ${sl.id}`;
		slideIds.add(sl.id);
		if (typeof sl.title !== "string" || !sl.title.trim() || sl.title.length > 60) {
			return `${where}: the title must have from 1 to 60 characters`;
		}
		if (typeof sl.tag !== "string" || !SLIDE_TAG.test(sl.tag)) {
			return `${where}: the tag must have from 1 to 40 letters, digits, spaces, _ . or -`;
		}
		const checked = validatePanels(sl.panels, slides === undefined ? "" : `${where}, `);
		if (typeof checked === "string") return checked;
		cleanSlides.push({ id: sl.id, title: sl.title.trim(), tag: sl.tag.trim(), panels: checked });
	}
	const layout: IViewerLayout = { version: VIEWER_LAYOUT_VERSION, slides: cleanSlides };
	if (time !== undefined) {
		const checked = validateTime(time);
		if (typeof checked === "string") return checked;
		layout.time = checked;
	}
	return layout;
};

// a tag of slides: letters (any language), digits, spaces, _ . -
const SLIDE_TAG = /^[\p{L}\p{N} _.-]{1,40}$/u;

// The panels of one slide
const validatePanels = (panels: unknown, prefix: string): IViewerPanel[] | string => {
	if (!Array.isArray(panels)) return `${prefix}the panels must be a list`;
	if (panels.length > VIEWER_LAYOUT_MAX_PANELS) return `${prefix}at most ${VIEWER_LAYOUT_MAX_PANELS} panels`;
	const ids = new Set<string>();
	const clean: IViewerPanel[] = [];
	let models = 0;
	for (const [index, item] of panels.entries()) {
		const where = `${prefix}Panel ${index + 1}`;
		if (!item || typeof item !== "object" || Array.isArray(item)) return `${where} must be an object`;
		const p = item as Record<string, unknown>;
		if (typeof p.id !== "string" || !PANEL_ID.test(p.id)) return `${where}: invalid id`;
		if (ids.has(p.id)) return `${where}: repeated id ${p.id}`;
		ids.add(p.id);
		if (!VIEWER_PANEL_TYPES.includes(p.type as ViewerPanelType)) return `${where}: unknown type`;
		if (p.type === "model" && ++models > 1) return `${prefix}only one 3D model panel`;
		if ((p.type === "alarms" || p.type === "approvals") && clean.some((q) => q.type === p.type)) {
			return `${prefix}only one ${p.type} panel`;
		}
		if (!isInt(p.x, 0, VIEWER_LAYOUT_COLS - 1)) return `${where}: invalid x`;
		if (!isInt(p.w, 1, VIEWER_LAYOUT_COLS) || (p.x ) + (p.w ) > VIEWER_LAYOUT_COLS) {
			return `${where}: invalid width`;
		}
		if (!isInt(p.y, 0, VIEWER_LAYOUT_MAX_ROWS - 1)) return `${where}: invalid y`;
		if (!isInt(p.h, 1, VIEWER_LAYOUT_MAX_ROWS)) return `${where}: invalid height`;
		const panel: IViewerPanel = { id: p.id, type: p.type as ViewerPanelType, x: p.x, y: p.y, w: p.w, h: p.h };
		if (p.title !== undefined) {
			if (typeof p.title !== "string" || p.title.length > 80) return `${where}: the title must have at most 80 characters`;
			if (p.title.trim()) panel.title = p.title.trim();
		}
		if (p.type === "image") {
			if (typeof p.source !== "string" || !SOURCE.test(p.source)) return `${where}: invalid image source`;
			panel.source = p.source;
			if (p.display !== undefined) {
				if (p.display !== "video" && p.display !== "photo") return `${where}: display must be "video" or "photo"`;
				panel.display = p.display;
			}
		}
		if (p.type === "markdown") {
			if (p.text !== undefined && typeof p.text !== "string") return `${where}: the text must be a string`;
			const text = (p.text as string | undefined) ?? "";
			if (text.length > VIEWER_MARKDOWN_MAX_LENGTH) return `${where}: the text must have at most ${VIEWER_MARKDOWN_MAX_LENGTH} characters`;
			panel.text = text;
		}
		if (p.type === "picture") {
			if (p.file !== undefined) {
				if (typeof p.file !== "string" || !VIEWER_PICTURE_FILE.test(p.file)) return `${where}: invalid picture file`;
				panel.file = p.file;
			}
			if (p.fit !== undefined) {
				if (!VIEWER_PICTURE_FITS.includes(p.fit as IViewerPanel["fit"])) return `${where}: fit must be contain, cover or fill`;
				panel.fit = p.fit as IViewerPanel["fit"];
			}
			const bindings = validatePictureBindings(p.bindings);
			if (typeof bindings === "string") return `${where}: ${bindings}`;
			if (bindings.length) panel.bindings = bindings;
		}
		if (p.type === "chart") {
			const series = validateChartSeries(p.series);
			if (typeof series === "string") return `${where}: ${series}`;
			panel.series = series;
			// range: the panels of version 1.4.0 before the panel editor (now timeFrom)
			if (p.range !== undefined) {
				if (!CHART_RANGES.includes(p.range as (typeof CHART_RANGES)[number])) return `${where}: invalid range`;
				panel.range = p.range as (typeof CHART_RANGES)[number];
			}
			if (p.viz !== undefined) {
				if (!CHART_VIZ.includes(p.viz as (typeof CHART_VIZ)[number])) return `${where}: unknown visualization`;
				panel.viz = p.viz as (typeof CHART_VIZ)[number];
			}
			for (const key of ["options", "fieldConfig"] as const) {
				if (p[key] === undefined) continue;
				const settings = validateSettings(p[key], key);
				if (typeof settings === "string") return `${where}: ${settings}`;
				panel[key] = settings;
			}
			for (const key of ["timeFrom", "timeShift", "interval"] as const) {
				if (p[key] === undefined || p[key] === "") continue;
				if (typeof p[key] !== "string" || !SPAN.test(p[key] )) return `${where}: invalid ${key}`;
				panel[key] = p[key] ;
			}
			if (p.maxDataPoints !== undefined) {
				if (!isInt(p.maxDataPoints, 10, 2000)) return `${where}: maxDataPoints must be from 10 to 2000`;
				panel.maxDataPoints = p.maxDataPoints;
			}
		}
		clean.push(panel);
	}
	return clean;
};

const SENSOR_REF = /^[A-Za-z0-9_.-]{1,60}$/;

const validateChartSeries = (raw: unknown): IChartSeries[] | string => {
	if (!Array.isArray(raw) || raw.length === 0) return "a chart needs at least one series";
	if (raw.length > CHART_MAX_SERIES) return `at most ${CHART_MAX_SERIES} series`;
	const result: IChartSeries[] = [];
	for (const item of raw) {
		if (!item || typeof item !== "object" || Array.isArray(item)) return "invalid series";
		const { sensor, field, index, agg, alias, color, axis, hide } = item as Record<string, unknown>;
		if (typeof sensor !== "string" || !SENSOR_REF.test(sensor)) return "invalid sensor of a series";
		if (typeof field !== "string" || field === "" || field.length > 100) return "invalid field of a series";
		const series: IChartSeries = { sensor, field };
		if (index !== undefined) {
			if (!isInt(index, 0, 63)) return "invalid index of a series";
			series.index = index;
		}
		if (agg !== undefined) {
			if (!SERIES_AGGREGATIONS.includes(agg as (typeof SERIES_AGGREGATIONS)[number])) return "invalid aggregation of a series";
			series.agg = agg as (typeof SERIES_AGGREGATIONS)[number];
		}
		if (alias !== undefined && alias !== "") {
			if (typeof alias !== "string" || alias.length > 80) return "the name of a series must have at most 80 characters";
			series.alias = alias;
		}
		if (color !== undefined && color !== "") {
			if (typeof color !== "string" || !/^(#[0-9a-fA-F]{3,8}|[a-z-]{3,30})$/.test(color)) return "invalid color of a series";
			series.color = color;
		}
		if (axis !== undefined) {
			if (axis !== "left" && axis !== "right") return "the axis of a series must be left or right";
			series.axis = axis;
		}
		if (hide !== undefined) {
			if (typeof hide !== "boolean") return "hide must be true or false";
			if (hide) series.hide = true;
		}
		result.push(series);
	}
	return result;
};

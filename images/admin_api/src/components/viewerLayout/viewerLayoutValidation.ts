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
// the twin's files, viewerImages; an SVG with animations of its elements: bindings) and "dataChart" (the data of
// one JSON as a 2D chart, a heat map, a 3D surface or 3D points: data; see validateDataChart) and "surface" (a 3D Surface,
// now a Data chart of kind "surface":
// z = f(x, y) of a formula whose parameters can be values of the NATS messages, or a grid of values that a message
// carries) and "assetState" (the current state of the twin's asset, iot_data.assetState; one per slide: stateFields,
// the fields of the state shown with their label and unit; statusColors, the colour of each status; staleMinutes,
// after how long without a change the state is shown as old), "health" and "pipelineLogs" (a group's control room)
// and "orgOverview" (the indicators of the organization, organizationOverview.ts: unavailableStatuses, the statuses
// that are not available, "Alarm" when none; period, the one it opens with) and "simulator" (the digital twin's
// simulator; one per slide; format: its own parameters, those of its slide; without it, the digital twin's format).
//
// On a slide with a canvas, frame is the frame of the drawing a panel is in (the frontend keeps it as the panel is
// placed). There each frame can have its own 3D model and its own simulator: the scope "<slide>:<frame>"
// (slideModels.ts), whose files are under slides/<slide>/frames/<frame>/ and whose messages carry it ("$slide").
//
// A "simulator" panel can float over the slide (floating: true) instead of taking its place in the grid (x, y, w, h,
// kept as where it docks): float is its window, as fractions (0 to 1) of the slide's area: { x, y, w, h }.
// simulatorPlaced: the layout was saved once simulator panels existed; layouts without it get a floating simulator
// on their first slide when the twin has a simulator format (the frontend adds it: the simulator of older versions
// was a floating window).

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
export const VIEWER_PANEL_TYPES = [
	"model",
	"image",
	"chart",
	"alarms",
	"approvals",
	"markdown",
	"picture",
	"surface",
	"assetState",
	// a group's control room: its Health and Pipeline logs (one of each per slide)
	"health",
	"pipelineLogs",
	// the organization overview: its indicators (one per slide)
	"orgOverview",
	// the digital twin's simulator (one per slide; docked or floating)
	"simulator",
	// a Data chart: the data of one JSON (the last message of a topic, the asset's state or a formula) as a 2D chart,
	// a heat map, a 3D surface or 3D points (data). The 3D Surface panels ("surface") are Data charts of kind
	// "surface" now: still accepted, the frontend turns them into Data charts.
	"dataChart",
] as const;
const ONE_PER_SLIDE = ["alarms", "approvals", "assetState", "health", "pipelineLogs", "orgOverview"];
// one per slide, or one per frame of its canvas (slideModels.ts: the scope slide:frame)
const ONE_PER_FRAME = ["model", "simulator"];
// the panels that can float over the slide
const FLOATING_TYPES = ["simulator"];
// a floating window: at least this fraction of the slide's area wide and high
export const FLOAT_MIN_FRACTION = 0.05;
// an "Organization overview" panel (organizationOverview.ts and the frontend's orgOverview.ts say the same)
export const ORG_OVERVIEW_PERIODS = ["7d", "30d", "90d", "12m"] as const;
export const ORG_OVERVIEW_MAX_STATUSES = 12;
// an "Asset state" panel (the frontend's assetStatePanel.ts says the same)
export const ASSET_STATE_MAX_FIELDS = 20;
export const ASSET_STATE_MAX_COLORS = 12;
export const ASSET_STATE_MAX_STALE_MINUTES = 10080;
// a path of the state: keys separated by dots ("production.speed", "lots.0.id"), at most 10, of 64 characters
const STATE_PATH_KEY = /^[^./"'\\\u0000-\u001f]{1,64}$/;
const STATUS_NAME = /^[\p{L}\p{N} _.-]{1,40}$/u;
// a 3D Surface panel (the frontend's surfacePanel.ts says the same)
export const VIEWER_SURFACE_MODES = ["function", "data"] as const;
export const VIEWER_SURFACE_COLORS = ["viridis", "turbo", "coolwarm", "blues", "grays"] as const;
export const VIEWER_SURFACE_MAX_EXPRESSION = 500;
export const VIEWER_SURFACE_MAX_PARAMS = 20;
export const VIEWER_SURFACE_STEPS = [5, 150] as const;
export const VIEWER_SURFACE_MAX_LABEL = 40;
const SURFACE_PARAM = /^[A-Za-z_][A-Za-z0-9_]{0,19}$/;
// names a parameter cannot have: the variables, the constants and the functions of the formulas
const SURFACE_RESERVED = new Set([
	"x", "y", "pi", "e", "sin", "cos", "tan", "asin", "acos", "atan", "atan2", "sinh", "cosh", "tanh", "exp", "log",
	"ln", "log10", "log2", "sqrt", "cbrt", "abs", "min", "max", "pow", "floor", "ceil", "round", "sign", "hypot", "mod",
]);

export interface IViewerSurfaceParam {
	name: string;
	value: number;
	topicRef?: string;
	path?: string;
}

export interface IViewerSurface {
	mode: (typeof VIEWER_SURFACE_MODES)[number];
	expression?: string;
	params?: IViewerSurfaceParam[];
	// function: its ranges of x and y from a message ({xMin, xMax, yMin, yMax}), else its own
	range?: ILiveRange;
	// function: drawn only up to this height (a number, or one of its parameters)
	clipAbove?: number | string;
	topicRef?: string;
	path?: string;
	xMin: number;
	xMax: number;
	yMin: number;
	yMax: number;
	steps?: number;
	zMin?: number;
	zMax?: number;
	xLabel?: string;
	yLabel?: string;
	zLabel?: string;
	colors?: (typeof VIEWER_SURFACE_COLORS)[number];
	wireframe?: boolean;
	opacity?: number;
	// heat map: its contour lines and about how many levels
	contours?: boolean;
	contourLevels?: number;
}
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
			if (typeof b[key] !== "string" || (b[key]).length > 20) return `${where}: ${key} must be a text of at most 20 characters`;
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

// A 3D Surface panel: the formula is only kept here (the Viewer evaluates it with its own interpreter, never as
// code), so it is checked for its length and its characters only
// the parameters of a formula: fixed, or values of a topic or of the asset's state
const validateSurfaceParams = (raw: unknown): IViewerSurfaceParam[] | string => {
	if (!Array.isArray(raw) || raw.length > VIEWER_SURFACE_MAX_PARAMS) return `the parameters must be a list of at most ${VIEWER_SURFACE_MAX_PARAMS}`;
	const names = new Set<string>();
	const params: IViewerSurfaceParam[] = [];
	for (const [i, item] of raw.entries()) {
		const where = `parameter ${i + 1}`;
		if (!item || typeof item !== "object" || Array.isArray(item)) return `${where}: must be an object`;
		const q = item as Record<string, unknown>;
		if (typeof q.name !== "string" || !SURFACE_PARAM.test(q.name) || SURFACE_RESERVED.has(q.name.toLowerCase())) return `${where}: invalid name`;
		if (names.has(q.name)) return `${where}: repeated name ${q.name}`;
		names.add(q.name);
		if (!isNum(q.value)) return `${where}: its value must be a number`;
		const param: IViewerSurfaceParam = { name: q.name, value: q.value };
		if (q.topicRef !== undefined || q.path !== undefined) {
			if (typeof q.topicRef !== "string" || !DATA_SOURCE.test(q.topicRef)) return `${where}: invalid topic`;
			if (typeof q.path !== "string" || !PICTURE_PATH.test(q.path)) return `${where}: invalid field`;
			param.topicRef = q.topicRef;
			param.path = q.path;
		}
		params.push(param);
	}
	return params;
};

// the ranges of the axes of a formula from a message: the field of a topic with {xMin, xMax, yMin?, yMax?}
export interface ILiveRange {
	topicRef: string;
	path: string;
}
const validateLiveRange = (raw: unknown): ILiveRange | string => {
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) return "the range from a message needs its topic and field";
	const r = raw as Record<string, unknown>;
	if (typeof r.topicRef !== "string" || !DATA_SOURCE.test(r.topicRef)) return "invalid topic of the range";
	if (typeof r.path !== "string" || !PICTURE_PATH.test(r.path)) return "invalid field of the range";
	return { topicRef: r.topicRef, path: r.path };
};

const validateFormulaText = (expression: unknown): string | null =>
	typeof expression !== "string" || expression.length > VIEWER_SURFACE_MAX_EXPRESSION || !/^[\w\s.+\-*/^(),]*$/.test(expression)
		? `the formula must have at most ${VIEWER_SURFACE_MAX_EXPRESSION} characters: letters, digits, spaces and . + - * / ^ ( ) ,`
		: null;

const validateSurface = (raw: unknown): IViewerSurface | string => {
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) return "a 3D Surface needs its settings";
	const s = raw as Record<string, unknown>;
	if (!VIEWER_SURFACE_MODES.includes(s.mode as IViewerSurface["mode"])) return 'the mode must be "function" or "data"';
	for (const key of ["xMin", "xMax", "yMin", "yMax"]) {
		if (!isNum(s[key])) return `${key} must be a number`;
	}
	if ((s.xMin as number) >= (s.xMax as number) || (s.yMin as number) >= (s.yMax as number)) return "each axis needs its minimum below its maximum";
	const surface: IViewerSurface = { mode: s.mode as IViewerSurface["mode"], xMin: s.xMin as number, xMax: s.xMax as number, yMin: s.yMin as number, yMax: s.yMax as number };
	if (surface.mode === "function") {
		const wrong = validateFormulaText(s.expression);
		if (wrong) return wrong;
		surface.expression = s.expression as string;
		if (s.params !== undefined) {
			const params = validateSurfaceParams(s.params);
			if (typeof params === "string") return params;
			surface.params = params;
		}
		if (s.range !== undefined) {
			const range = validateLiveRange(s.range);
			if (typeof range === "string") return range;
			surface.range = range;
		}
		// drawn only up to a height: a number, or one of its parameters
		if (s.clipAbove !== undefined) {
			const ok = isNum(s.clipAbove) || (typeof s.clipAbove === "string" && (surface.params ?? []).some((p) => p.name === s.clipAbove));
			if (!ok) return "the height to cut the surface at must be a number or one of its parameters";
			surface.clipAbove = s.clipAbove as number | string;
		}
		if (s.steps !== undefined) {
			if (!isInt(s.steps, VIEWER_SURFACE_STEPS[0], VIEWER_SURFACE_STEPS[1])) return `the resolution must be from ${VIEWER_SURFACE_STEPS[0]} to ${VIEWER_SURFACE_STEPS[1]}`;
			surface.steps = s.steps;
		}
	} else {
		if (typeof s.topicRef !== "string" || !DATA_SOURCE.test(s.topicRef)) return "invalid topic of the data";
		if (typeof s.path !== "string" || !PICTURE_PATH.test(s.path)) return "invalid field of the data";
		surface.topicRef = s.topicRef;
		surface.path = s.path;
	}
	if (s.zMin !== undefined || s.zMax !== undefined) {
		if (!isNum(s.zMin) || !isNum(s.zMax) || s.zMin >= s.zMax) return "a fixed z range needs a minimum below its maximum";
		surface.zMin = s.zMin;
		surface.zMax = s.zMax;
	}
	for (const key of ["xLabel", "yLabel", "zLabel"] as const) {
		const label: unknown = s[key];
		if (label === undefined) continue;
		if (typeof label !== "string" || label.length > 40) return `${key} must have at most 40 characters`;
		if (label.trim()) surface[key] = label.trim();
	}
	if (s.colors !== undefined) {
		if (!VIEWER_SURFACE_COLORS.includes(s.colors as NonNullable<IViewerSurface["colors"]>)) return "unknown colour scale";
		surface.colors = s.colors as IViewerSurface["colors"];
	}
	if (s.wireframe !== undefined) {
		if (typeof s.wireframe !== "boolean") return "wireframe must be true or false";
		surface.wireframe = s.wireframe;
	}
	if (s.opacity !== undefined) {
		if (!isNum(s.opacity) || s.opacity < 0.1 || s.opacity > 1) return "the opacity must be from 0.1 to 1";
		surface.opacity = s.opacity;
	}
	if (s.contours !== undefined) {
		if (typeof s.contours !== "boolean") return "contours must be true or false";
		surface.contours = s.contours;
	}
	if (s.contourLevels !== undefined) {
		if (!Number.isInteger(s.contourLevels) || (s.contourLevels as number) < 2 || (s.contourLevels as number) > 30)
			return "the contour levels must be a whole number from 2 to 30";
		surface.contourLevels = s.contourLevels as number;
	}
	return surface;
};
// The data of a Data chart: the last message of a topic (its topicRef) or the state of the twin's asset
// (iot_data.assetState.state)
export const ASSET_STATE_SOURCE = "@assetState";
export const FORMULA_SOURCE = "@formula";
export const DATA_FORMULA_POINTS: [number, number] = [2, 2000];
const DATA_SOURCE = /^(@assetState|[A-Za-z0-9_.-]{1,60})$/;
// a path of the data; "*" takes a field of every item of a list (points.*.f)
const DATA_PATH = /^([A-Za-z0-9_-]+|\*)(\.([A-Za-z0-9_-]+|\*)){0,15}$/;
export const DATA_CHART_KINDS = ["xy", "heatmap", "surface", "points3d"] as const;
export const DATA_CHART_STYLES = ["line", "scatter", "bar", "area"] as const;
export const DATA_CHART_MAX_SERIES = 8;
const DATA_COLOR = /^#[0-9a-fA-F]{6}$/;

// a series of a formula y = f(x) (source "@formula", 2D charts only): its parameters as those of a surface, over
// [xMin, xMax] at `points` points
export interface IDataFormula {
	expression: string;
	params?: IViewerSurfaceParam[];
	xMin: number;
	xMax: number;
	// its range of x from a message ({xMin, xMax}), else its own
	range?: ILiveRange;
	points?: number;
}

export interface IDataSeries {
	source: string;
	formula?: IDataFormula;
	x?: string;
	// the field of y (all but the formulas)
	y?: string;
	z?: string;
	name?: string;
	style?: (typeof DATA_CHART_STYLES)[number];
	color?: string;
}

export interface IDataChart {
	kind: (typeof DATA_CHART_KINDS)[number];
	// heatmap and surface: a formula or a grid (the settings of the 3D Surface panels)
	surface?: IViewerSurface;
	// xy and points3d
	series?: IDataSeries[];
	xLabel?: string;
	yLabel?: string;
	zLabel?: string;
	xLog?: boolean;
	yLog?: boolean;
	xMin?: number;
	xMax?: number;
	yMin?: number;
	yMax?: number;
	legend?: boolean;
}

// the name, style and colour of a series (into `series`), or what is wrong
const validateSeriesLook = (q: Record<string, unknown>, series: IDataSeries): string | null => {
	if (q.name !== undefined && q.name !== "") {
		if (typeof q.name !== "string" || q.name.length > 40) return "the name has at most 40 characters";
		series.name = q.name.trim();
	}
	if (q.style !== undefined) {
		if (!DATA_CHART_STYLES.includes(q.style as (typeof DATA_CHART_STYLES)[number])) return "invalid style";
		series.style = q.style as IDataSeries["style"];
	}
	if (q.color !== undefined && q.color !== "") {
		if (typeof q.color !== "string" || !DATA_COLOR.test(q.color)) return "invalid colour";
		series.color = q.color;
	}
	return null;
};

const validateDataFormula = (raw: unknown): IDataFormula | string => {
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) return "a formula series needs its formula";
	const f = raw as Record<string, unknown>;
	const wrong = validateFormulaText(f.expression);
	if (wrong) return wrong;
	if (!isNum(f.xMin) || !isNum(f.xMax) || f.xMin >= f.xMax) return "the range of x needs its minimum below its maximum";
	const formula: IDataFormula = { expression: f.expression as string, xMin: f.xMin, xMax: f.xMax };
	if (f.params !== undefined) {
		const params = validateSurfaceParams(f.params);
		if (typeof params === "string") return params;
		formula.params = params;
	}
	if (f.range !== undefined) {
		const range = validateLiveRange(f.range);
		if (typeof range === "string") return range;
		formula.range = range;
	}
	if (f.points !== undefined) {
		if (!isInt(f.points, DATA_FORMULA_POINTS[0], DATA_FORMULA_POINTS[1])) return `the points must be from ${DATA_FORMULA_POINTS[0]} to ${DATA_FORMULA_POINTS[1]}`;
		formula.points = f.points;
	}
	return formula;
};

const validateDataChart = (raw: unknown): IDataChart | string => {
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) return "a Data chart needs its settings";
	const d = raw as Record<string, unknown>;
	if (!DATA_CHART_KINDS.includes(d.kind as IDataChart["kind"])) return `the kind must be ${DATA_CHART_KINDS.join(", ")}`;
	const data: IDataChart = { kind: d.kind as IDataChart["kind"] };
	if (data.kind === "heatmap" || data.kind === "surface") {
		const surface = validateSurface(d.surface);
		if (typeof surface === "string") return surface;
		data.surface = surface;
		return data;
	}
	if (!Array.isArray(d.series) || d.series.length === 0 || d.series.length > DATA_CHART_MAX_SERIES) {
		return `a Data chart needs from 1 to ${DATA_CHART_MAX_SERIES} series`;
	}
	data.series = [];
	for (const [i, item] of d.series.entries()) {
		const where = `series ${i + 1}`;
		if (!item || typeof item !== "object" || Array.isArray(item)) return `${where}: must be an object`;
		const q = item as Record<string, unknown>;
		if (q.source === FORMULA_SOURCE) {
			if (data.kind !== "xy") return `${where}: a formula is only for 2D charts`;
			const formula = validateDataFormula(q.formula);
			if (typeof formula === "string") return `${where}: ${formula}`;
			const formulaSeries: IDataSeries = { source: FORMULA_SOURCE, formula };
			const wrongLook = validateSeriesLook(q, formulaSeries);
			if (wrongLook) return `${where}: ${wrongLook}`;
			data.series.push(formulaSeries);
			continue;
		}
		if (typeof q.source !== "string" || !DATA_SOURCE.test(q.source)) return `${where}: invalid source`;
		if (typeof q.y !== "string" || !DATA_PATH.test(q.y)) return `${where}: invalid field of y`;
		const series: IDataSeries = { source: q.source, y: q.y };
		for (const axis of ["x", "z"] as const) {
			if (q[axis] === undefined || q[axis] === "") continue;
			if (typeof q[axis] !== "string" || !DATA_PATH.test(q[axis])) return `${where}: invalid field of ${axis}`;
			series[axis] = q[axis];
		}
		if (data.kind === "points3d" && (!series.x || !series.z)) return `${where}: 3D points need the fields of x, y and z`;
		const look = validateSeriesLook(q, series);
		if (look) return `${where}: ${look}`;
		data.series.push(series);
	}
	for (const key of ["xLabel", "yLabel", "zLabel"] as const) {
		if (d[key] === undefined || d[key] === "") continue;
		if (typeof d[key] !== "string" || d[key].length > VIEWER_SURFACE_MAX_LABEL) return `${key} has at most ${VIEWER_SURFACE_MAX_LABEL} characters`;
		data[key] = d[key].trim();
	}
	for (const key of ["xLog", "yLog", "legend"] as const) {
		if (d[key] === undefined) continue;
		if (typeof d[key] !== "boolean") return `${key} must be true or false`;
		data[key] = d[key];
	}
	for (const [lo, hi] of [["xMin", "xMax"], ["yMin", "yMax"]] as const) {
		if (d[lo] === undefined && d[hi] === undefined) continue;
		if (!isNum(d[lo]) || !isNum(d[hi]) || d[lo] >= d[hi]) return `${lo} and ${hi} must be numbers, the first below the second`;
		data[lo] = d[lo];
		data[hi] = d[hi];
	}
	return data;
};

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

export interface IAssetStateField {
	path: string;
	label?: string;
	unit?: string;
}

export const isStatePath = (path: unknown): path is string => {
	if (typeof path !== "string" || path.length === 0 || path.length > 200) return false;
	const keys = path.split(".");
	return keys.length <= 10 && keys.every((key) => STATE_PATH_KEY.test(key));
};

// The settings of an "Asset state" panel
const validateOrgOverview = (p: Record<string, unknown>, panel: IViewerPanel): string | null => {
	if (p.unavailableStatuses !== undefined) {
		if (!Array.isArray(p.unavailableStatuses)) return "unavailableStatuses must be a list";
		if (p.unavailableStatuses.length > ORG_OVERVIEW_MAX_STATUSES) return `at most ${ORG_OVERVIEW_MAX_STATUSES} unavailable statuses`;
		const statuses: string[] = [];
		for (const status of p.unavailableStatuses as unknown[]) {
			if (typeof status !== "string" || !STATUS_NAME.test(status.trim())) return "invalid unavailable status";
			if (!statuses.includes(status.trim())) statuses.push(status.trim());
		}
		if (statuses.length) panel.unavailableStatuses = statuses;
	}
	if (p.period !== undefined) {
		if (!ORG_OVERVIEW_PERIODS.includes(p.period as IViewerPanel["period"] & string)) return "period must be 7d, 30d, 90d or 12m";
		panel.period = p.period as IViewerPanel["period"];
	}
	return null;
};

const validateAssetState = (p: Record<string, unknown>, panel: IViewerPanel): string | null => {
	if (p.stateFields !== undefined) {
		if (!Array.isArray(p.stateFields)) return "the fields must be a list";
		if (p.stateFields.length > ASSET_STATE_MAX_FIELDS) return `at most ${ASSET_STATE_MAX_FIELDS} fields`;
		const fields: IAssetStateField[] = [];
		for (const raw of p.stateFields as unknown[]) {
			if (!raw || typeof raw !== "object" || Array.isArray(raw)) return "each field must be an object";
			const f = raw as Record<string, unknown>;
			if (!isStatePath(f.path)) return `invalid path of a field: keys separated by dots, without / " ' \\`;
			const field: IAssetStateField = { path: f.path };
			for (const key of ["label", "unit"] as const) {
				const text: unknown = f[key];
				if (text === undefined || text === "") continue;
				if (typeof text !== "string" || text.length > 40) return `the ${key} of a field: at most 40 characters`;
				field[key] = text;
			}
			fields.push(field);
		}
		if (fields.length) panel.stateFields = fields;
	}
	if (p.statusColors !== undefined) {
		if (!p.statusColors || typeof p.statusColors !== "object" || Array.isArray(p.statusColors)) {
			return "statusColors must be an object";
		}
		const entries = Object.entries(p.statusColors as Record<string, unknown>);
		if (entries.length > ASSET_STATE_MAX_COLORS) return `at most ${ASSET_STATE_MAX_COLORS} status colours`;
		const colors: Record<string, string> = {};
		for (const [status, color] of entries) {
			if (!STATUS_NAME.test(status)) return `invalid status name: ${status.slice(0, 40)}`;
			if (typeof color !== "string" || !PICTURE_COLOR.test(color)) return `invalid colour of status ${status}`;
			colors[status] = color;
		}
		if (entries.length) panel.statusColors = colors;
	}
	if (p.staleMinutes !== undefined) {
		if (!isInt(p.staleMinutes, 0, ASSET_STATE_MAX_STALE_MINUTES)) {
			return `staleMinutes must be from 0 to ${ASSET_STATE_MAX_STALE_MINUTES}`;
		}
		if (p.staleMinutes > 0) panel.staleMinutes = p.staleMinutes;
	}
	return null;
};

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
	surface?: IViewerSurface;
	data?: IDataChart;
	series?: IChartSeries[];
	range?: (typeof CHART_RANGES)[number];
	viz?: (typeof CHART_VIZ)[number];
	options?: Record<string, unknown>;
	fieldConfig?: Record<string, unknown>;
	timeFrom?: string;
	timeShift?: string;
	interval?: string;
	maxDataPoints?: number;
	// chart: the seconds of the live series ("@live:…") shown
	liveWindow?: number;
	stateFields?: IAssetStateField[];
	statusColors?: Record<string, string>;
	staleMinutes?: number;
	unavailableStatuses?: string[];
	period?: (typeof ORG_OVERVIEW_PERIODS)[number];
	floating?: boolean;
	// a translucent background: what is behind it (a canvas) shows through
	translucent?: boolean;
	// on a canvas: the frame of the drawing it is in (its id in the scene); a 3D model or a simulator in a frame is
	// that frame's (scope slide:frame)
	frame?: string;
	float?: IFloatRect;
	// a simulator's own format (that of its slide: none, the digital twin's)
	format?: Record<string, ISimulatorParameter>;
	x: number;
	y: number;
	w: number;
	h: number;
}

// A parameter of a simulator's format (the frontend's digitalTwinFormatValidation, and its editor)
export interface ISimulatorParameter {
	label: string;
	units: string;
	minValue: number;
	maxValue: number;
	defaultValue: number;
	step: number;
}
export const MAX_SIMULATOR_PARAMETERS = 200;
const SIMULATOR_PARAMETER_NAME = /^[A-Za-z0-9_.-]{1,80}$/;

// The format of the simulator of a slide (its parameters: the fields of the sim2dtm messages it sends), or why not
export const validateSimulatorFormat = (raw: unknown): Record<string, ISimulatorParameter> | string => {
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) return "format must be an object of parameters";
	const entries = Object.entries(raw as Record<string, unknown>);
	if (entries.length > MAX_SIMULATOR_PARAMETERS) return `format has at most ${MAX_SIMULATOR_PARAMETERS} parameters`;
	const format: Record<string, ISimulatorParameter> = {};
	for (const [name, value] of entries) {
		if (!SIMULATOR_PARAMETER_NAME.test(name)) return `invalid parameter name: ${name.slice(0, 80)}`;
		if (!value || typeof value !== "object" || Array.isArray(value)) return `the parameter ${name} must be an object`;
		const v = value as Record<string, unknown>;
		const num = (key: string) => (typeof v[key] === "number" && Number.isFinite(v[key]) ? Number(v[key]) : null);
		const [minValue, maxValue, defaultValue, step] = [num("minValue"), num("maxValue"), num("defaultValue"), num("step")];
		if (typeof v.label !== "string" || v.label.length > 120) return `the parameter ${name} needs a label (at most 120 characters)`;
		if (typeof v.units !== "string" || v.units.length > 40) return `the parameter ${name} needs units (at most 40 characters)`;
		if (minValue === null || maxValue === null || defaultValue === null || step === null) {
			return `the parameter ${name} needs minValue, maxValue, defaultValue and step (numbers)`;
		}
		if (minValue >= maxValue) return `the parameter ${name}: minValue must be lower than maxValue`;
		if (defaultValue < minValue || defaultValue > maxValue) return `the parameter ${name}: defaultValue must be between minValue and maxValue`;
		if (step <= 0) return `the parameter ${name}: step must be greater than 0`;
		format[name] = { label: v.label, units: v.units, minValue, maxValue, defaultValue, step };
	}
	return format;
};

// a floating window, in fractions of the slide's area
export interface IFloatRect {
	x: number;
	y: number;
	w: number;
	h: number;
}

const isFraction = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;

const validateFloat = (raw: unknown): IFloatRect | string => {
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) return "float must be an object";
	const { x, y, w, h } = raw as Record<string, unknown>;
	if (!isFraction(x) || !isFraction(y) || !isFraction(w) || !isFraction(h)) return "float: x, y, w and h must be from 0 to 1";
	if (w < FLOAT_MIN_FRACTION || h < FLOAT_MIN_FRACTION) return "float: the window is too small";
	if (x + w > 1.0001 || y + h > 1.0001) return "float: the window must be inside the slide";
	return { x, y, w, h };
};

// A Canvas: a whiteboard (Excalidraw) behind the panels of its slide, its scene in S3 (slides/<id>/canvas/scene.json,
// slideCanvas.ts). Its slide's panels are on a fine grid (CANVAS_GRID: 48 × 48, one page, without compaction).
export const CANVAS_STYLES = ["clean", "hand"] as const;
export interface IViewerCanvas {
	style: (typeof CANVAS_STYLES)[number];
}
export const CANVAS_GRID = { cols: 48, maxRows: 48 };

export interface IViewerSlide {
	id: string;
	title: string;
	tag: string;
	panels: IViewerPanel[];
	canvas?: IViewerCanvas;
}

export interface IViewerLayout {
	version: number;
	time?: IViewerTime;
	slides: IViewerSlide[];
	simulatorPlaced?: boolean;
}

// "now", "now-6h", "now-1d/d", "now/w" (Grafana's relative times) or a date (ISO, or milliseconds)
const RELATIVE_TIME = /^now(-\d{1,6}[smhdwMy])?(\/[smhdwMy])?$/;
const isTimeText = (value: unknown): value is string =>
	typeof value === "string" &&
	value.length <= 40 &&
	(RELATIVE_TIME.test(value) || /^\d{10,14}$/.test(value) || (/^\d{4}-\d{2}-\d{2}/.test(value) && !Number.isNaN(Date.parse(value))));
// a span of time: 30s, 5m, 1h, 7d…
const SPAN = /^\d{1,6}[smhdwMy]$/;
// the minimum interval of a chart can also be in milliseconds (200ms, 500ms)
const INTERVAL = /^(\d{1,6}(ms|[smhdwMy])|raw)$/;

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
// the id of a frame of a canvas (Excalidraw's ids)
export const FRAME_ID = /^[A-Za-z0-9_-]{1,40}$/;
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
	const { version, panels, slides, time, simulatorPlaced } = raw as Record<string, unknown>;
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
		let canvas: IViewerCanvas | undefined;
		if (sl.canvas !== undefined) {
			const c = sl.canvas as Record<string, unknown>;
			if (!c || typeof c !== "object" || Array.isArray(c) || !CANVAS_STYLES.includes(c.style as IViewerCanvas["style"])) {
				return `${where}: the canvas needs its style (${CANVAS_STYLES.join(" or ")})`;
			}
			canvas = { style: c.style as IViewerCanvas["style"] };
		}
		const checked = validatePanels(sl.panels, slides === undefined ? "" : `${where}, `, canvas ? CANVAS_GRID : undefined);
		if (typeof checked === "string") return checked;
		cleanSlides.push({ id: sl.id, title: sl.title.trim(), tag: sl.tag.trim(), panels: checked, ...(canvas ? { canvas } : {}) });
	}
	const layout: IViewerLayout = { version: VIEWER_LAYOUT_VERSION, slides: cleanSlides };
	if (time !== undefined) {
		const checked = validateTime(time);
		if (typeof checked === "string") return checked;
		layout.time = checked;
	}
	if (simulatorPlaced !== undefined) {
		if (typeof simulatorPlaced !== "boolean") return "simulatorPlaced must be true or false";
		if (simulatorPlaced) layout.simulatorPlaced = true;
	}
	return layout;
};

// a tag of slides: letters (any language), digits, spaces, _ . -
const SLIDE_TAG = /^[\p{L}\p{N} _.-]{1,40}$/u;

// The panels of one slide
const validatePanels = (
	panels: unknown,
	prefix: string,
	grid: { cols: number; maxRows: number } = { cols: VIEWER_LAYOUT_COLS, maxRows: VIEWER_LAYOUT_MAX_ROWS }
): IViewerPanel[] | string => {
	if (!Array.isArray(panels)) return `${prefix}the panels must be a list`;
	if (panels.length > VIEWER_LAYOUT_MAX_PANELS) return `${prefix}at most ${VIEWER_LAYOUT_MAX_PANELS} panels`;
	const ids = new Set<string>();
	const clean: IViewerPanel[] = [];
	for (const [index, item] of panels.entries()) {
		const where = `${prefix}Panel ${index + 1}`;
		if (!item || typeof item !== "object" || Array.isArray(item)) return `${where} must be an object`;
		const p = item as Record<string, unknown>;
		if (typeof p.id !== "string" || !PANEL_ID.test(p.id)) return `${where}: invalid id`;
		if (ids.has(p.id)) return `${where}: repeated id ${p.id}`;
		ids.add(p.id);
		if (!VIEWER_PANEL_TYPES.includes(p.type as ViewerPanelType)) return `${where}: unknown type`;
		const type = p.type as ViewerPanelType;
		// on a canvas, the frame of the drawing the panel is in (a frame of Excalidraw: its id)
		let frame: string | undefined;
		if (p.frame !== undefined) {
			if (typeof p.frame !== "string" || !FRAME_ID.test(p.frame)) return `${where}: invalid frame`;
			if (grid === CANVAS_GRID) frame = p.frame;
		}
		// the 3D model and the simulator: one of each per slide, or per frame of its canvas (each its own scope)
		if (ONE_PER_FRAME.includes(type)) {
			if (clean.some((q) => q.type === type && q.frame === frame)) {
				const label = type === "model" ? "3D model" : type;
				return frame ? `${prefix}only one ${label} panel in each frame of the canvas` : `${prefix}only one ${label} panel`;
			}
		} else if (ONE_PER_SLIDE.includes(type) && clean.some((q) => q.type === type)) {
			return `${prefix}only one ${type} panel`;
		}
		if (!isInt(p.x, 0, grid.cols - 1)) return `${where}: invalid x`;
		if (!isInt(p.w, 1, grid.cols) || p.x + p.w > grid.cols) {
			return `${where}: invalid width`;
		}
		if (!isInt(p.y, 0, grid.maxRows - 1)) return `${where}: invalid y`;
		if (!isInt(p.h, 1, grid.maxRows)) return `${where}: invalid height`;
		// a slide with a canvas is one page
		if (grid === CANVAS_GRID && p.y + p.h > grid.maxRows) return `${where}: below the page of the canvas`;
		const panel: IViewerPanel = { id: p.id, type: p.type as ViewerPanelType, x: p.x, y: p.y, w: p.w, h: p.h };
		if (frame) panel.frame = frame;
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
		if (p.type === "assetState") {
			const problem = validateAssetState(p, panel);
			if (problem) return `${where}: ${problem}`;
		}
		if (p.type === "orgOverview") {
			const problem = validateOrgOverview(p, panel);
			if (problem) return `${where}: ${problem}`;
		}
		// a translucent background (not the 3D model: it draws its own)
		if (p.translucent !== undefined) {
			if (typeof p.translucent !== "boolean") return `${where}: translucent must be true or false`;
			if (p.translucent && type !== "model") panel.translucent = true;
		}
		if (p.floating !== undefined || p.float !== undefined) {
			if (!FLOATING_TYPES.includes(type)) return `${where}: only a simulator panel can float`;
			if (p.floating !== undefined) {
				if (typeof p.floating !== "boolean") return `${where}: floating must be true or false`;
				if (p.floating) panel.floating = true;
			}
			if (p.float !== undefined) {
				const float = validateFloat(p.float);
				if (typeof float === "string") return `${where}: ${float}`;
				panel.float = float;
			}
		}
		if (p.format !== undefined) {
			if (type !== "simulator") return `${where}: only a simulator panel has a format`;
			const format = validateSimulatorFormat(p.format);
			if (typeof format === "string") return `${where}: ${format}`;
			panel.format = format;
		}
		if (p.type === "surface") {
			const surface = validateSurface(p.surface);
			if (typeof surface === "string") return `${where}: ${surface}`;
			panel.surface = surface;
		}
		if (p.type === "dataChart") {
			const data = validateDataChart(p.data);
			if (typeof data === "string") return `${where}: ${data}`;
			panel.data = data;
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
				const valid = key === "interval" ? INTERVAL : SPAN;
				if (typeof p[key] !== "string" || !valid.test(p[key])) return `${where}: invalid ${key}`;
				panel[key] = p[key];
			}
			if (p.maxDataPoints !== undefined) {
				if (!isInt(p.maxDataPoints, 10, 2000)) return `${where}: maxDataPoints must be from 10 to 2000`;
				panel.maxDataPoints = p.maxDataPoints;
			}
			if (p.liveWindow !== undefined) {
				if (!isInt(p.liveWindow, CHART_LIVE_WINDOW[0], CHART_LIVE_WINDOW[1])) {
					return `${where}: liveWindow must be from ${CHART_LIVE_WINDOW[0]} to ${CHART_LIVE_WINDOW[1]} seconds`;
				}
				panel.liveWindow = p.liveWindow;
			}
		}
		clean.push(panel);
	}
	return clean;
};

// a sensor, or the history of the state of the twin's asset ("@assetState": field a dotted path of the state),
// or the values of a topic since the viewer was opened ("@live:dtm2sim")
const SENSOR_REF = /^(@assetState|@live:[A-Za-z0-9_.-]{1,60}|[A-Za-z0-9_.-]{1,60})$/;
export const CHART_LIVE_WINDOW: [number, number] = [10, 3600];

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

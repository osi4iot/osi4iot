// The Picture panels of the Viewer page: an image of the digital twin (JPEG, PNG, WebP, GIF or SVG, uploaded
// to its files) and, for an SVG, animations of its elements with the values of the NATS messages: each binding
// joins an element of the SVG (by its id) to a value ({{topicRef.path}}) and says what the value does to it.
//
//   text       the element's text is the value (with decimals, before and after it)
//   color      the fill (or the stroke) is the colour of the threshold the value reaches
//   rotate     turns the element about its centre (or cx, cy): the value from inMin..inMax to outMin..outMax degrees
//   translateX / translateY   moves it: the value to outMin..outMax units of the SVG
//   scale      scales it about its centre: the value to outMin..outMax
//   opacity    the value to outMin..outMax (0 to 1)
//   visible    shown only when the value compares true with `value` (op: > >= < <= == !=); hidden without a value
//   scaleX / scaleY   stretches it along x (or y) about a fixed point (cx or cy; its box centre when not said): a
//              spring anchored to a wall, an arrow from its tail
//
// A binding can also PLAY a series in time: with `timePath`, its field (`path`) is a list of values and `timePath`
// the list of their times (e.g. resp.u and resp.t of a pipeline's answer). The panel then runs a clock (play, pause,
// restart, speed, in a loop) and the value is the series at the clock's time — the drawing moves as the solution the
// pipeline computed, at the screen's pace. A new message starts it again from the first time. The clock of a panel
// is shared with the Data charts of its frame that show a playback cursor (playbackClock.ts).
//
// The SVG is cleaned before it is drawn: no scripts, no event attributes, no links or external resources. The
// SVG runs nothing of its own; the animations are only these bindings.
import { LiveMessage, valueAt } from "./liveValues";

export const PICTURE_ACTIONS = ["text", "color", "rotate", "translateX", "translateY", "scale", "scaleX", "scaleY", "opacity", "visible"] as const;
export type PictureAction = (typeof PICTURE_ACTIONS)[number];
export const PICTURE_COMPARE = [">", ">=", "<", "<=", "==", "!="] as const;
export type PictureCompare = (typeof PICTURE_COMPARE)[number];
export const PICTURE_FITS = ["contain", "cover", "fill"] as const;
export type PictureFit = (typeof PICTURE_FITS)[number];
export const PICTURE_MAX_BINDINGS = 100;

export interface PictureThreshold {
    // null: the base colour (below the first value)
    value: number | null;
    color: string;
}

export interface PictureBinding {
    element: string;
    topicRef: string;
    path: string;
    // a series played in time: the field of the times of the values of `path` (both lists)
    timePath?: string;
    action: PictureAction;
    // text
    decimals?: number;
    prefix?: string;
    suffix?: string;
    // color
    target?: "fill" | "stroke";
    thresholds?: PictureThreshold[];
    // rotate, translate, scale, opacity: the value from inMin..inMax to outMin..outMax (clamped)
    inMin?: number;
    inMax?: number;
    outMin?: number;
    outMax?: number;
    // rotate, scale: the centre (units of the SVG); its box centre when not said
    cx?: number;
    cy?: number;
    // visible
    op?: PictureCompare;
    value?: number;
}

const ELEMENT_ID = /^[A-Za-z_][A-Za-z0-9_.:-]{0,79}$/;
const TOPIC_REF = /^[A-Za-z0-9_-]{1,60}$/;
const PATH = /^[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+){0,15}$/;
const COLOR = /^(#[0-9a-fA-F]{3,8}|[a-zA-Z]{3,20}|rgba?\([\d\s.,%]+\))$/;
const AFFIX = 20;

const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

export const sanitizeBindings = (raw: unknown): PictureBinding[] => {
    if (!Array.isArray(raw)) return [];
    const out: PictureBinding[] = [];
    for (const item of raw.slice(0, PICTURE_MAX_BINDINGS)) {
        if (!item || typeof item !== "object") continue;
        const b = item as Record<string, unknown>;
        if (typeof b.element !== "string" || !ELEMENT_ID.test(b.element)) continue;
        if (typeof b.topicRef !== "string" || !TOPIC_REF.test(b.topicRef)) continue;
        if (typeof b.path !== "string" || !PATH.test(b.path)) continue;
        if (!PICTURE_ACTIONS.includes(b.action as PictureAction)) continue;
        const binding: PictureBinding = { element: b.element, topicRef: b.topicRef, path: b.path, action: b.action as PictureAction };
        if (typeof b.timePath === "string" && PATH.test(b.timePath)) binding.timePath = b.timePath;
        const decimals = num(b.decimals);
        if (decimals !== undefined && Number.isInteger(decimals) && decimals >= 0 && decimals <= 10) binding.decimals = decimals;
        for (const key of ["prefix", "suffix"] as const) if (typeof b[key] === "string") binding[key] = (b[key] as string).slice(0, AFFIX);
        if (b.target === "fill" || b.target === "stroke") binding.target = b.target;
        if (Array.isArray(b.thresholds)) {
            binding.thresholds = b.thresholds
                .slice(0, 20)
                .filter((t) => t && typeof t === "object" && typeof t.color === "string" && COLOR.test(t.color) && (t.value === null || num(t.value) !== undefined))
                .map((t) => ({ value: t.value as number | null, color: t.color as string }));
        }
        for (const key of ["inMin", "inMax", "outMin", "outMax", "cx", "cy", "value"] as const) {
            const v = num(b[key]);
            if (v !== undefined) binding[key] = v;
        }
        if (PICTURE_COMPARE.includes(b.op as PictureCompare)) binding.op = b.op as PictureCompare;
        out.push(binding);
    }
    return out;
};

// --- the SVG, cleaned ------------------------------------------------------------------------------------------

const FORBIDDEN_ELEMENTS = ["script", "foreignObject", "iframe", "embed", "object", "audio", "video", "canvas", "handler", "listener"];
const SAFE_URL = /^(#|data:image\/(png|jpe?g|gif|webp);base64,)/i;

// The SVG text without anything that runs or loads from elsewhere; null if it is not an SVG
export const sanitizeSvg = (text: string): string | null => {
    const doc = new DOMParser().parseFromString(text, "image/svg+xml");
    const svg = doc.documentElement;
    if (!svg || svg.nodeName.toLowerCase() !== "svg" || doc.getElementsByTagName("parsererror").length) return null;
    for (const name of FORBIDDEN_ELEMENTS) {
        Array.from(svg.getElementsByTagName(name)).forEach((el) => el.remove());
    }
    const all = [svg, ...Array.from(svg.getElementsByTagName("*"))];
    for (const el of all) {
        for (const attr of Array.from(el.attributes)) {
            const name = attr.name.toLowerCase();
            const value = attr.value.trim();
            if (name.startsWith("on")) el.removeAttribute(attr.name);
            else if ((name === "href" || name === "xlink:href" || name === "src") && !SAFE_URL.test(value)) el.removeAttribute(attr.name);
            else if (name === "style" && /(url\s*\(\s*['"]?(?!#|data:image)|expression\s*\(|javascript:)/i.test(value)) el.removeAttribute(attr.name);
            else if (/^(fill|stroke|filter|clip-path|mask|marker-(start|mid|end))$/.test(name) && /url\s*\(\s*['"]?(?!#)/i.test(value)) el.removeAttribute(attr.name);
        }
        // animations of links (<set attributeName="href">) and links themselves
        if (/^(set|animate)$/i.test(el.nodeName) && /href/i.test(el.getAttribute("attributeName") ?? "")) el.remove();
        if (el.nodeName.toLowerCase() === "style" && el.textContent) {
            el.textContent = el.textContent.replace(/@import[^;]*;?/gi, "").replace(/url\s*\(\s*['"]?(?!#|data:image)[^)]*\)/gi, "none");
        }
    }
    // it fills its panel, keeping its proportions
    if (!svg.getAttribute("viewBox")) {
        const w = parseFloat(svg.getAttribute("width") ?? "");
        const h = parseFloat(svg.getAttribute("height") ?? "");
        if (w > 0 && h > 0) svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    }
    svg.removeAttribute("width");
    svg.removeAttribute("height");
    return new XMLSerializer().serializeToString(svg);
};

// the ids of the elements of an SVG text, to choose them in the editor
export const svgElementIds = (svgText: string): { id: string; tag: string }[] => {
    const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
    return Array.from(doc.querySelectorAll("[id]"))
        .map((el) => ({ id: el.getAttribute("id") ?? "", tag: el.nodeName }))
        .filter((e) => ELEMENT_ID.test(e.id) && !/^(defs|style|lineargradient|radialgradient|stop|clippath|mask|filter|marker|pattern)$/i.test(e.tag))
        .slice(0, 500);
};

// --- what a value does --------------------------------------------------------------------------------------

const clampMap = (value: number, b: PictureBinding, outMin = 0, outMax = 1): number => {
    const inMin = b.inMin ?? 0;
    const inMax = b.inMax ?? 1;
    const oMin = b.outMin ?? outMin;
    const oMax = b.outMax ?? outMax;
    if (inMax === inMin) return oMin;
    const t = Math.max(0, Math.min(1, (value - inMin) / (inMax - inMin)));
    return oMin + t * (oMax - oMin);
};

export const thresholdColor = (value: number, thresholds: PictureThreshold[] = []): string | undefined => {
    const sorted = [...thresholds].sort((a, b) => (a.value ?? -Infinity) - (b.value ?? -Infinity));
    let color: string | undefined;
    for (const t of sorted) if (t.value === null || value >= t.value) color = t.color;
    return color;
};

export const compare = (value: number, op: PictureCompare = ">", ref = 0): boolean =>
    op === ">" ? value > ref : op === ">=" ? value >= ref : op === "<" ? value < ref : op === "<=" ? value <= ref : op === "==" ? value === ref : value !== ref;

export const bindingText = (value: unknown, b: PictureBinding): string => {
    let text: string;
    if (typeof value === "number" && Number.isFinite(value)) text = b.decimals !== undefined ? value.toFixed(b.decimals) : String(Number(value.toPrecision(6)));
    else if (value === undefined || value === null) text = "–";
    else text = typeof value === "string" ? value : JSON.stringify(value);
    return `${b.prefix ?? ""}${text}${b.suffix ?? ""}`;
};

export interface ElementEffect {
    text?: string;
    fill?: string;
    stroke?: string;
    opacity?: number;
    visible?: boolean;
    rotate?: number;
    translateX?: number;
    translateY?: number;
    scale?: number;
    scaleX?: number;
    scaleY?: number;
    cx?: number;
    cy?: number;
}

// --- series played in time ----------------------------------------------------------------------------------

const numbersOf = (value: unknown): number[] | null => (Array.isArray(value) ? value.map((v) => (typeof v === "number" ? v : Number(v))) : null);

// The value of a series at time t: linear between the times around it (the first or the last value outside them)
export const seriesValueAt = (values: unknown, times: unknown, t: number): number => {
    const ys = numbersOf(values);
    const ts = numbersOf(times);
    if (!ys || !ts) return NaN;
    const n = Math.min(ys.length, ts.length);
    if (n === 0) return NaN;
    if (n === 1 || t <= ts[0]) return ys[0];
    if (t >= ts[n - 1]) return ys[n - 1];
    let lo = 0;
    let hi = n - 1;
    while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (ts[mid] <= t) lo = mid;
        else hi = mid;
    }
    const span = ts[hi] - ts[lo];
    const r = span > 0 ? (t - ts[lo]) / span : 0;
    const a = ys[lo];
    const b = ys[hi];
    return Number.isFinite(a) && Number.isFinite(b) ? a + r * (b - a) : Number.isFinite(a) ? a : b;
};

export const playsSeries = (bindings: PictureBinding[]) => bindings.some((b) => !!b.timePath);

// how long the series last: the largest last time of their lists (0 without any)
export const playbackDuration = (bindings: PictureBinding[], get: (topicRef: string) => LiveMessage | undefined): number => {
    let end = 0;
    for (const b of bindings) {
        if (!b.timePath) continue;
        const ts = numbersOf(valueAt(get(b.topicRef)?.payload, b.timePath.split(".")));
        const last = ts && ts.length ? ts[ts.length - 1] : NaN;
        if (Number.isFinite(last) && last > end) end = last;
    }
    return end;
};

// when the messages of the series arrived: a new one starts the playback again
export const playbackStamp = (bindings: PictureBinding[], get: (topicRef: string) => LiveMessage | undefined): string =>
    Array.from(new Set(bindings.filter((b) => b.timePath).map((b) => b.topicRef)))
        .map((ref) => `${ref}:${get(ref)?.receivedAt ?? ""}`)
        .join("|");

// What the bindings do to each element with the latest values (elements without a value are left as they are)
// (`time`: the clock of the playback, for the bindings that play a series)
export const bindingEffects = (bindings: PictureBinding[], get: (topicRef: string) => LiveMessage | undefined, time = 0): Map<string, ElementEffect> => {
    const effects = new Map<string, ElementEffect>();
    for (const b of bindings) {
        const payload = get(b.topicRef)?.payload;
        const raw = b.timePath ? seriesValueAt(valueAt(payload, b.path.split(".")), valueAt(payload, b.timePath.split(".")), time) : valueAt(payload, b.path.split("."));
        const effect = effects.get(b.element) ?? {};
        if (b.action === "text") {
            effect.text = bindingText(raw, b);
            effects.set(b.element, effect);
            continue;
        }
        const value = typeof raw === "number" ? raw : typeof raw === "boolean" ? Number(raw) : typeof raw === "string" && raw.trim() !== "" ? Number(raw) : NaN;
        // "visible if": without a value the condition is not met (a warning stays hidden until there is a value)
        if (!Number.isFinite(value)) {
            if (b.action === "visible") {
                effect.visible = false;
                effects.set(b.element, effect);
            }
            continue;
        }
        if (b.action === "color") {
            const color = thresholdColor(value, b.thresholds);
            if (color) effect[b.target === "stroke" ? "stroke" : "fill"] = color;
        } else if (b.action === "rotate") {
            effect.rotate = clampMap(value, b, 0, 360);
            if (b.cx !== undefined && b.cy !== undefined) [effect.cx, effect.cy] = [b.cx, b.cy];
        } else if (b.action === "translateX") effect.translateX = clampMap(value, b, 0, 100);
        else if (b.action === "translateY") effect.translateY = clampMap(value, b, 0, 100);
        else if (b.action === "scale") {
            effect.scale = clampMap(value, b, 1, 2);
            if (b.cx !== undefined && b.cy !== undefined) [effect.cx, effect.cy] = [b.cx, b.cy];
        } else if (b.action === "scaleX" || b.action === "scaleY") {
            effect[b.action] = clampMap(value, b, 1, 2);
            if (b.action === "scaleX" && b.cx !== undefined) effect.cx = b.cx;
            if (b.action === "scaleY" && b.cy !== undefined) effect.cy = b.cy;
        } else if (b.action === "opacity") effect.opacity = Math.max(0, Math.min(1, clampMap(value, b, 0, 1)));
        else if (b.action === "visible") effect.visible = compare(value, b.op, b.value ?? 0);
        effects.set(b.element, effect);
    }
    return effects;
};

// The transform of an element: its own, then the move, and the turn and the scale about its centre
export const effectTransform = (own: string, effect: ElementEffect, centre: { x: number; y: number }): string => {
    const parts: string[] = [];
    if (own) parts.push(own);
    if (effect.translateX !== undefined || effect.translateY !== undefined) parts.push(`translate(${round(effect.translateX ?? 0)} ${round(effect.translateY ?? 0)})`);
    const cx = effect.cx ?? centre.x;
    const cy = effect.cy ?? centre.y;
    if (effect.rotate !== undefined) parts.push(`rotate(${round(effect.rotate)} ${round(cx)} ${round(cy)})`);
    if (effect.scale !== undefined) parts.push(`translate(${round(cx)} ${round(cy)}) scale(${round(effect.scale)}) translate(${round(-cx)} ${round(-cy)})`);
    if (effect.scaleX !== undefined || effect.scaleY !== undefined)
        parts.push(`translate(${round(cx)} ${round(cy)}) scale(${round(effect.scaleX ?? 1)} ${round(effect.scaleY ?? 1)}) translate(${round(-cx)} ${round(-cy)})`);
    return parts.join(" ");
};

const round = (v: number) => Math.round(v * 1000) / 1000;

// Applies the effects to the SVG drawn (`root`): each element remembers its own transform, fill, stroke and
// text the first time, so that values that no longer arrive leave it as the SVG had it
export const applyEffects = (root: Element, effects: Map<string, ElementEffect>) => {
    effects.forEach((effect, id) => {
        const el = root.querySelector(`[id="${CSS.escape(id)}"]`) as SVGGraphicsElement | null;
        if (!el) return;
        const own = el as unknown as { __own?: { transform: string; text: string | null; centre: { x: number; y: number } } };
        if (!own.__own) {
            let centre = { x: 0, y: 0 };
            try {
                const box = el.getBBox();
                centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
            } catch {
                // not drawn (tests): the origin
            }
            own.__own = { transform: el.getAttribute("transform") ?? "", text: el.textContent, centre };
        }
        if (effect.text !== undefined) {
            // the text of a <text> (or of its first <tspan>, keeping its position)
            const target = el.querySelector("tspan") ?? el;
            target.textContent = effect.text;
        }
        if (effect.fill) el.style.fill = effect.fill;
        if (effect.stroke) el.style.stroke = effect.stroke;
        if (effect.opacity !== undefined) el.style.opacity = String(effect.opacity);
        if (effect.visible !== undefined) el.style.visibility = effect.visible ? "" : "hidden";
        if (
            effect.rotate !== undefined ||
            effect.scale !== undefined ||
            effect.scaleX !== undefined ||
            effect.scaleY !== undefined ||
            effect.translateX !== undefined ||
            effect.translateY !== undefined
        ) {
            el.setAttribute("transform", effectTransform(own.__own.transform, effect, own.__own.centre));
        }
    });
};

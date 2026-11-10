// The range of time of the Viewer page, as in a Grafana dashboard: relative times ("now-6h", "now",
// "now-1d/d", "now/w") or dates, quick ranges, the refresh interval, and the panel's own time
// (Grafana's "Relative time" and "Time shift"). Pure functions, so they are easy to test.

export interface RawTimeRange {
    from: string;
    to: string;
}

export interface TimeRange {
    from: number;
    to: number;
}

export interface PageTime extends RawTimeRange {
    refresh: string;
}

export const DEFAULT_PAGE_TIME: PageTime = { from: "now-1h", to: "now", refresh: "10s" };

const UNIT_MS: Record<string, number> = {
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
    w: 7 * 86_400_000,
    M: 30 * 86_400_000,
    y: 365 * 86_400_000,
};

const UNIT_NAMES: Record<string, [string, string]> = {
    s: ["second", "seconds"],
    m: ["minute", "minutes"],
    h: ["hour", "hours"],
    d: ["day", "days"],
    w: ["week", "weeks"],
    M: ["month", "months"],
    y: ["year", "years"],
};

const SPAN = /^(\d{1,6})([smhdwMy])$/;
const RELATIVE = /^now(?:-(\d{1,6})([smhdwMy]))?(?:\/([smhdwMy]))?$/;

// 30s, 5m, 1h, 7d… in milliseconds (null: not a span)
export const spanMs = (text: string | undefined | null): number | null => {
    if (!text) return null;
    const m = SPAN.exec(text.trim());
    return m ? Number(m[1]) * UNIT_MS[m[2]] : null;
};

export const isSpan = (text: string) => SPAN.test(text.trim());

// The start (or, with roundUp, the end) of the unit that holds t, in local time
const roundTo = (t: number, unit: string, roundUp: boolean): number => {
    const d = new Date(t);
    if (unit === "s") d.setMilliseconds(0);
    else if (unit === "m") d.setSeconds(0, 0);
    else if (unit === "h") d.setMinutes(0, 0, 0);
    else {
        d.setHours(0, 0, 0, 0);
        if (unit === "w") d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // weeks start on Monday
        if (unit === "M") d.setDate(1);
        if (unit === "y") d.setMonth(0, 1);
    }
    if (!roundUp) return d.getTime();
    const next = new Date(d);
    if (unit === "s") next.setSeconds(next.getSeconds() + 1);
    else if (unit === "m") next.setMinutes(next.getMinutes() + 1);
    else if (unit === "h") next.setHours(next.getHours() + 1);
    else if (unit === "d") next.setDate(next.getDate() + 1);
    else if (unit === "w") next.setDate(next.getDate() + 7);
    else if (unit === "M") next.setMonth(next.getMonth() + 1);
    else next.setFullYear(next.getFullYear() + 1);
    return next.getTime() - 1;
};

// A time of the range: "now…", milliseconds or a date. null when it is none of them.
export const parseTime = (text: string, now: number, roundUp = false): number | null => {
    const value = (text ?? "").trim();
    const m = RELATIVE.exec(value);
    if (m) {
        let t = now;
        if (m[1]) t -= Number(m[1]) * UNIT_MS[m[2]];
        if (m[3]) t = roundTo(t, m[3], roundUp);
        return t;
    }
    if (/^\d{10,14}$/.test(value)) return Number(value);
    if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
        const t = Date.parse(value);
        return Number.isNaN(t) ? null : t;
    }
    return null;
};

export const isValidTime = (text: string) => parseTime(text, Date.now()) !== null;

export const resolveRange = (raw: RawTimeRange, now: number): TimeRange | null => {
    const from = parseTime(raw.from, now, false);
    const to = parseTime(raw.to, now, true);
    if (from === null || to === null || from >= to) return null;
    return { from, to };
};

// the range follows the present (it is refreshed)
export const isLive = (raw: RawTimeRange) => raw.to.trim().startsWith("now");

export interface QuickRange extends RawTimeRange {
    display: string;
}

export const QUICK_RANGES: QuickRange[] = [
    { from: "now-5m", to: "now", display: "Last 5 minutes" },
    { from: "now-15m", to: "now", display: "Last 15 minutes" },
    { from: "now-30m", to: "now", display: "Last 30 minutes" },
    { from: "now-1h", to: "now", display: "Last 1 hour" },
    { from: "now-3h", to: "now", display: "Last 3 hours" },
    { from: "now-6h", to: "now", display: "Last 6 hours" },
    { from: "now-12h", to: "now", display: "Last 12 hours" },
    { from: "now-24h", to: "now", display: "Last 24 hours" },
    { from: "now-2d", to: "now", display: "Last 2 days" },
    { from: "now-7d", to: "now", display: "Last 7 days" },
    { from: "now-30d", to: "now", display: "Last 30 days" },
    { from: "now-90d", to: "now", display: "Last 90 days" },
    { from: "now/d", to: "now/d", display: "Today" },
    { from: "now/d", to: "now", display: "Today so far" },
    { from: "now-1d/d", to: "now-1d/d", display: "Yesterday" },
    { from: "now/w", to: "now/w", display: "This week" },
    { from: "now/w", to: "now", display: "This week so far" },
    { from: "now/M", to: "now/M", display: "This month" },
];

const formatDate = (t: number) => {
    const d = new Date(t);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

// What a time says, for the eyes: "now-6h" stays as it is; a date in local time
export const timeText = (text: string): string => {
    const value = text.trim();
    if (RELATIVE.test(value)) return value;
    const t = parseTime(value, Date.now());
    return t === null ? value : formatDate(t);
};

// "Last 6 hours", "Today", "now-2h to now-1h", "2026-11-09 10:00:00 to 2026-11-09 12:00:00"
export const describeRange = (raw: RawTimeRange): string => {
    const quick = QUICK_RANGES.find((q) => q.from === raw.from && q.to === raw.to);
    if (quick) return quick.display;
    const m = RELATIVE.exec(raw.from.trim());
    if (raw.to.trim() === "now" && m && m[1] && !m[3]) {
        const n = Number(m[1]);
        return `Last ${n} ${UNIT_NAMES[m[2]][n === 1 ? 0 : 1]}`;
    }
    return `${timeText(raw.from)} to ${timeText(raw.to)}`;
};

// A local date for <input type="datetime-local"> and back
export const toInputDate = (t: number) => {
    const d = new Date(t);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

// --- refresh ---------------------------------------------------------------------------------------------

export const REFRESH_INTERVALS = ["", "200ms", "1s", "5s", "10s", "30s", "1m", "5m", "15m", "30m", "1h", "2h", "1d"];

// 200ms, 1s, 5m… in milliseconds (only the refresh takes milliseconds)
export const refreshMs = (text: string): number | null => {
    const ms = /^(\d{1,6})ms$/.exec(text?.trim() ?? "");
    return ms ? Number(ms[1]) : spanMs(text);
};

// The refresh tick of the page, out of React's state: only the components that use it (the chart panels and
// the panel editor) draw again at every refresh, not the whole Viewer (with 200ms, five times a second)
export interface RefreshClock {
    subscribe: (listener: () => void) => () => void;
    get: () => number;
    bump: () => void;
}

export const createRefreshClock = (): RefreshClock => {
    let tick = 0;
    const listeners = new Set<() => void>();
    return {
        subscribe: (listener) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        get: () => tick,
        bump: () => {
            tick += 1;
            listeners.forEach((l) => l());
        },
    };
};

export const refreshText = (text: string) => (text ? text : "Off");

// --- moving the range ------------------------------------------------------------------------------------

// Twice as long, around the same centre (Grafana's zoom out); absolute dates, unless it ends now
export const zoomOut = (range: TimeRange, now: number): TimeRange => {
    const span = range.to - range.from;
    const centre = range.from + span / 2;
    let to = centre + span;
    let from = centre - span;
    if (to > now) {
        from -= to - now;
        to = now;
    }
    return { from: Math.round(from), to: Math.round(to) };
};

// Half the range back (-1) or forward (+1), as Grafana's arrows
export const shiftRange = (range: TimeRange, direction: -1 | 1, now: number): TimeRange => {
    const step = (range.to - range.from) / 2;
    let from = range.from + direction * step;
    let to = range.to + direction * step;
    if (to > now) {
        from -= to - now;
        to = now;
    }
    return { from: Math.round(from), to: Math.round(to) };
};

export const absoluteRaw = (range: TimeRange): RawTimeRange => ({
    from: new Date(range.from).toISOString(),
    to: new Date(range.to).toISOString(),
});

// --- the panel's own time ----------------------------------------------------------------------------------

export interface PanelTime {
    range: TimeRange;
    // what the panel shows in its bar when it does not follow the page ("Last 24 hours, shifted 1d")
    info: string | null;
}

// Grafana's "Relative time" (timeFrom: the panel shows the last <span>) and "Time shift" (timeShift: the
// range moved back by <span>)
export const panelTimeRange = (page: TimeRange, now: number, timeFrom?: string, timeShift?: string): PanelTime => {
    let range = page;
    const info: string[] = [];
    const from = spanMs(timeFrom);
    if (from) {
        range = { from: now - from, to: now };
        const m = SPAN.exec(timeFrom!.trim())!;
        const n = Number(m[1]);
        info.push(`Last ${n} ${UNIT_NAMES[m[2]][n === 1 ? 0 : 1]}`);
    }
    const shift = spanMs(timeShift);
    if (shift) {
        range = { from: range.from - shift, to: range.to - shift };
        info.push(`shifted ${timeShift!.trim()}`);
    }
    return { range, info: info.length ? info.join(", ") : null };
};

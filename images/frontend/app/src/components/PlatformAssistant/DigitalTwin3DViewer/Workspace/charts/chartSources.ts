// The sources of the Time series charts beside the sensors' measurements (admin_api /time_series):
//
//   "@assetState"   a field of the state of the twin's asset, kept in its history (iot_data.asset_state_history,
//                   when the history is on for the asset): asked to admin_api with the asset's id
//   "@live:<topic>" a field of the messages of a topic (dtm2sim…) since the viewer was opened: kept in the browser
//                   (LiveSeriesBuffer, at most an hour), those of the slide shown and those of no slide ("$slide")
//
// combineFetchSeries asks admin_api for the first and the sensors and computes the second, and gives one answer as
// admin_api's (a point per interval: [t, mean, min, max, count, sum, last, first]), so the charts draw them all alike.
import { LiveValueStore, SLIDE_FIELD, fieldPaths, scopeReaches, valueAt } from "../liveValues";
import { ASSET_STATE_SERIES, WorkspaceLayout, liveTopicOfSeries } from "../workspaceLayout";
import { SeriesPoint, TimeSeriesResponse, sourceSeriesLabel } from "../chartSeries";
import { TimeSeriesQuery } from "../timeSeriesApi";
import { spanMs } from "./timeRange";

// --- the values of the topics since the viewer was opened -----------------------------------------------

export const LIVE_MAX_AGE_MS = 3_600_000;
export const LIVE_MAX_SAMPLES = 20_000;
const LIVE_MAX_FIELDS = 200;

interface LiveSample {
    t: number;
    slide: string | null;
    values: Record<string, number>;
}

export interface LiveSeriesBuffer {
    record: (topicRef: string, payload: unknown, receivedAt: number) => void;
    // the values of a field (dotted path, items of lists by their position: vibration.1) in [from, to), of a slide
    // and of no slide
    values: (topicRef: string, path: string, slideId: string | null, from: number, to: number) => [number, number][];
    // the numeric fields seen in the messages of a topic
    fields: (topicRef: string) => string[];
}

const toNumber = (v: unknown): number | null => {
    if (typeof v === "number") return Number.isFinite(v) ? v : null;
    if (typeof v === "boolean") return v ? 1 : 0;
    if (typeof v === "string" && /^\s*[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?\s*$/.test(v)) return Number(v);
    return null;
};

// the numbers of a message by their path (booleans 1 / 0, texts that are numbers), at most LIVE_MAX_FIELDS
export const numericValues = (payload: unknown): Record<string, number> => {
    const out: Record<string, number> = {};
    for (const path of fieldPaths(payload, LIVE_MAX_FIELDS)) {
        if (path === SLIDE_FIELD) continue;
        const n = toNumber(valueAt(payload, path.split(".")));
        if (n !== null) out[path] = n;
    }
    return out;
};

export const createLiveSeriesBuffer = (maxAgeMs = LIVE_MAX_AGE_MS, maxSamples = LIVE_MAX_SAMPLES): LiveSeriesBuffer => {
    const samples = new Map<string, LiveSample[]>();
    const seen = new Map<string, Set<string>>();
    return {
        record: (topicRef, payload, receivedAt) => {
            if (!payload || typeof payload !== "object" || Array.isArray(payload)) return;
            const values = numericValues(payload);
            const keys = Object.keys(values);
            if (keys.length === 0) return;
            const slide = (payload as Record<string, unknown>)[SLIDE_FIELD];
            if (!samples.has(topicRef)) samples.set(topicRef, []);
            const list = samples.get(topicRef)!;
            list.push({ t: receivedAt, slide: typeof slide === "string" ? slide : null, values });
            // the old ones go (in blocks, not one by one)
            const oldest = receivedAt - maxAgeMs;
            let drop = 0;
            while (drop < list.length && list[drop].t < oldest) drop++;
            if (list.length - drop > maxSamples) drop = list.length - maxSamples;
            if (drop > 0) list.splice(0, drop);
            if (!seen.has(topicRef)) seen.set(topicRef, new Set());
            const known = seen.get(topicRef)!;
            if (known.size < LIVE_MAX_FIELDS) keys.forEach((k) => known.add(k));
        },
        values: (topicRef, path, slideId, from, to) => {
            const out: [number, number][] = [];
            for (const s of samples.get(topicRef) ?? []) {
                if (s.t < from || s.t >= to || (s.slide !== null && (slideId === null || !scopeReaches(s.slide, slideId)))) continue;
                const v = s.values[path];
                if (v !== undefined) out.push([s.t, v]);
            }
            return out;
        },
        fields: (topicRef) => Array.from(seen.get(topicRef) ?? []).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    };
};

// the topics of the live series of the charts of a layout (every slide: kept from the opening of the viewer)
export const chartLiveTopics = (layout: WorkspaceLayout): string[] =>
    Array.from(
        new Set(
            layout.slides.flatMap((slide) =>
                slide.panels.flatMap((p) =>
                    p.type === "chart" ? (p.series ?? []).map((s) => liveTopicOfSeries(s.sensor)).filter((t): t is string => !!t) : [],
                ),
            ),
        ),
    );

// the numeric fields of an asset's state (its history can draw them)
export const numericStatePaths = (state: Record<string, unknown> | undefined): string[] => Object.keys(numericValues(state ?? {}));

// --- intervals as admin_api's ---------------------------------------------------------------------------

const BUCKET_STEPS = [0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 10800, 21600, 43200, 86400, 172800, 604800];

export const liveBucketSeconds = (from: number, to: number, points: number, interval?: string): number => {
    const needed = (to - from) / 1000 / Math.max(1, points);
    const auto = BUCKET_STEPS.find((step) => step >= needed) ?? BUCKET_STEPS[BUCKET_STEPS.length - 1];
    const min = interval ? (spanMs(interval) ?? 0) / 1000 : 0;
    return min > auto ? min : auto;
};

const round = (v: number) => (Number.isFinite(v) ? Number(v.toPrecision(7)) : null);

// [t, v] in points of intervals of `bucketSeconds` (or one point per sample: raw)
export const bucketize = (values: [number, number][], bucketSeconds: number, raw = false): SeriesPoint[] => {
    if (raw) return values.map(([t, v]) => [t, round(v), round(v), round(v), 1, round(v), round(v), round(v)]);
    const size = bucketSeconds * 1000;
    const out: SeriesPoint[] = [];
    let start = NaN;
    let sum = 0;
    let count = 0;
    let min = Infinity;
    let max = -Infinity;
    let first = 0;
    let last = 0;
    const flush = () => {
        if (count) out.push([start, round(sum / count), round(min), round(max), count, round(sum), round(last), round(first)]);
    };
    for (const [t, v] of values) {
        const bucket = Math.floor(t / size) * size;
        if (bucket !== start) {
            flush();
            start = bucket;
            sum = 0;
            count = 0;
            min = Infinity;
            max = -Infinity;
            first = v;
        }
        sum += v;
        count++;
        min = Math.min(min, v);
        max = Math.max(max, v);
        last = v;
    }
    flush();
    return out;
};

// a round width that gives about `bins` bins between min and max (as admin_api's)
const niceBinSize = (min: number, max: number, bins: number): number => {
    const raw = (max - min) / Math.max(1, bins);
    if (!(raw > 0)) return 1;
    const power = Math.pow(10, Math.floor(Math.log10(raw)));
    return ([1, 2, 2.5, 5, 10].find((m) => m * power >= raw) ?? 10) * power;
};

const binsOf = (values: number[], size: number, offset: number): [number, number][] => {
    const counts = new Map<number, number>();
    for (const v of values) {
        const bin = Math.floor((v - offset) / size);
        counts.set(bin, (counts.get(bin) ?? 0) + 1);
    }
    return Array.from(counts.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([bin, count]) => [Number((offset + bin * size).toPrecision(12)), count]);
};

// --- one answer for all the series ----------------------------------------------------------------------

type Fetch = (query: TimeSeriesQuery, signal: AbortSignal) => Promise<TimeSeriesResponse>;

export interface ChartSourcesContext {
    // the twin's asset (its state's history)
    assetId?: number;
    buffer?: LiveSeriesBuffer;
    // the slide shown (its live values, and those of no slide)
    slideId: () => string | null;
}

// the typical step of raw samples (seconds): a long one (90th percentile), as admin_api's
const rawStep = (lists: ([number, number][] | null)[]): number => {
    const steps: number[] = [];
    for (const list of lists) for (let i = 1; i < (list?.length ?? 0); i++) steps.push(list![i][0] - list![i - 1][0]);
    const positive = steps.filter((s) => s > 0).sort((a, b) => a - b);
    return positive.length ? Math.max(0.001, positive[Math.floor(positive.length * 0.9)] / 1000) : 1;
};

export const combineFetchSeries =
    (server: Fetch, context: ChartSourcesContext): Fetch =>
    async (query, signal) => {
        const items = query.series;
        const liveOf = (i: number) => (items[i].sensor ? liveTopicOfSeries(items[i].sensor!) : null);
        // what admin_api answers: the sensors, and the asset's state when the twin has an asset
        const asked: number[] = [];
        const serverSeries: TimeSeriesQuery["series"] = [];
        items.forEach((item, i) => {
            if (liveOf(i) !== null) return;
            if (item.sensor === ASSET_STATE_SERIES) {
                if (context.assetId === undefined) return;
                serverSeries.push({ sensorId: 0, assetId: context.assetId, field: item.field, ...(item.index === undefined ? {} : { index: item.index }) });
            } else serverSeries.push({ sensorId: item.sensorId, field: item.field, ...(item.index === undefined ? {} : { index: item.index }) });
            asked.push(i);
        });
        const answer = serverSeries.length ? await server({ ...query, series: serverSeries }, signal) : null;
        if (answer && asked.length === items.length) return answer;
        const raw = query.interval === "raw";
        const live = items.map((item, i) => {
            const topic = liveOf(i);
            if (topic === null) return null;
            const path = item.index === undefined ? item.field : `${item.field}.${item.index}`;
            return context.buffer?.values(topic, path, context.slideId(), query.from, query.to) ?? [];
        });
        const bucketSeconds = answer?.bucketSeconds ?? (raw ? rawStep(live) : liveBucketSeconds(query.from, query.to, query.points, query.interval));
        // the histogram: the bins of admin_api's, or their own
        let histogram = answer?.histogram;
        if (query.histogram && !histogram) {
            const all = live.flatMap((v) => (v ?? []).map(([, x]) => x));
            const min = all.length ? Math.min(...all) : 0;
            const max = all.length ? Math.max(...all) : 0;
            histogram = { min, max, size: query.histogram.size ?? niceBinSize(min, max, query.histogram.bins), offset: query.histogram.offset ?? 0 };
        }
        const series = items.map((item, i) => {
            const k = asked.indexOf(i);
            if (k >= 0 && answer) return answer.series[k];
            const topic = liveOf(i);
            const base = { sensorId: 0, field: item.field, ...(item.index === undefined ? {} : { index: item.index }), units: "-" };
            if (topic === null) {
                // the asset's state of a twin without an asset
                return { ...base, label: sourceSeriesLabel(item.field), sensor: "Asset state", points: [], historyOff: true };
            }
            const values = live[i] ?? [];
            const label = sourceSeriesLabel(item.index === undefined ? item.field : `${item.field}.${item.index}`);
            if (query.histogram && histogram) {
                return {
                    ...base,
                    label,
                    sensor: `Live · ${topic}`,
                    live: true,
                    points: [],
                    count: values.length,
                    bins: binsOf(
                        values.map(([, v]) => v),
                        histogram.size,
                        histogram.offset,
                    ),
                };
            }
            return { ...base, label, sensor: `Live · ${topic}`, live: true, points: bucketize(values, bucketSeconds, raw) };
        });
        return {
            from: answer?.from ?? new Date(query.from).toISOString(),
            to: answer?.to ?? new Date(query.to).toISOString(),
            bucketSeconds,
            ...(raw ? { raw: true } : {}),
            ...(histogram && query.histogram ? { histogram } : {}),
            series,
        };
    };

// The store of the live values that also keeps the numbers of the messages in the buffer
export const recordingStore = (store: LiveValueStore, buffer: LiveSeriesBuffer): LiveValueStore => ({
    ...store,
    publish: (topicRef, payload, receivedAt = Date.now()) => {
        buffer.record(topicRef, payload, receivedAt);
        store.publish(topicRef, payload, receivedAt);
    },
});

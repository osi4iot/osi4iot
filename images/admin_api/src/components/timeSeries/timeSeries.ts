// Aggregated time series of sensor fields, for the chart panels of the Viewer page: the measurements of
// iot_data.thingData grouped in buckets of time (TimescaleDB time_bucket), with the mean, minimum and maximum
// of each bucket. The bucket grows with the range, so a chart never gets more than about `points` points.
//
// Pure functions (parsing, bucket, SQL), so they are easy to test.
import { Measurements, toMeasurements } from "../../utils/measurements/measurements";

export const MAX_SERIES = 8;
export const MAX_FIELD_LENGTH = 100;
export const MAX_ARRAY_INDEX = 63;
export const DEFAULT_RANGE_MS = 60 * 60 * 1000;
export const MAX_RANGE_DAYS = 400;
export const DEFAULT_POINTS = 600;
export const MIN_POINTS = 10;
export const MAX_POINTS = 2000;

// the buckets used, in seconds (round values that read well on an axis)
export const BUCKET_STEPS = [
	1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 10800, 21600, 43200, 86400, 172800, 604800,
];

export interface SeriesRequest {
	sensorId: number;
	field: string;
	// item of an array field (accelerations[1]…)
	index?: number;
}

export interface TimeRange {
	from: Date;
	to: Date;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

// series: JSON [{ "sensorId": 12, "field": "temperature" }, { "sensorId": 13, "field": "accelerations", "index": 1 }]
export const parseSeries = (raw: unknown): SeriesRequest[] | string => {
	if (typeof raw !== "string" || raw.trim() === "") return "Missing the series (a JSON list)";
	let data: unknown;
	try {
		data = JSON.parse(raw);
	} catch {
		return "The series must be a JSON list";
	}
	if (!Array.isArray(data) || data.length === 0) return "The series must be a non empty JSON list";
	if (data.length > MAX_SERIES) return `At most ${MAX_SERIES} series`;
	const result: SeriesRequest[] = [];
	for (const [i, item] of data.entries()) {
		const where = `Series ${i + 1}`;
		if (!isRecord(item)) return `${where} must be an object`;
		const { sensorId, field, index } = item;
		if (typeof sensorId !== "number" || !Number.isInteger(sensorId) || sensorId <= 0) return `${where}: invalid sensorId`;
		if (typeof field !== "string" || field === "" || field.length > MAX_FIELD_LENGTH) return `${where}: invalid field`;
		const series: SeriesRequest = { sensorId, field };
		if (index !== undefined && index !== null) {
			if (typeof index !== "number" || !Number.isInteger(index) || index < 0 || index > MAX_ARRAY_INDEX) {
				return `${where}: invalid index`;
			}
			series.index = index;
		}
		result.push(series);
	}
	return result;
};

const parseDate = (value: unknown): Date | null | undefined => {
	if (value === undefined || value === "") return undefined;
	if (typeof value !== "string") return null;
	const date = /^\d+$/.test(value) ? new Date(Number(value)) : new Date(value);
	return Number.isNaN(date.getTime()) ? null : date;
};

// from / to: ISO dates or milliseconds; by default the last hour
export const parseRange = (fromRaw: unknown, toRaw: unknown, now = new Date()): TimeRange | string => {
	const to = parseDate(toRaw);
	const from = parseDate(fromRaw);
	if (to === null) return "Invalid 'to' date";
	if (from === null) return "Invalid 'from' date";
	const end = to ?? now;
	const start = from ?? new Date(end.getTime() - DEFAULT_RANGE_MS);
	if (start.getTime() >= end.getTime()) return "'from' must be before 'to'";
	if (end.getTime() - start.getTime() > MAX_RANGE_DAYS * 86400000) return `The range must be at most ${MAX_RANGE_DAYS} days`;
	return { from: start, to: end };
};

// A minimum bucket (Grafana's "Min interval"): 30s, 5m, 1h… (none: automatic)
export const parseInterval = (raw: unknown): number | null | string => {
	if (raw === undefined || raw === "" || raw === "auto") return null;
	if (typeof raw !== "string") return "Invalid interval";
	const m = /^(\d{1,6})(s|m|h|d|w)$/.exec(raw);
	if (!m) return "The interval must be like 30s, 5m, 1h, 1d or 1w";
	const seconds = Number(m[1]) * { s: 1, m: 60, h: 3600, d: 86400, w: 604800 }[m[2] as "s" | "m" | "h" | "d" | "w"];
	return seconds > 0 ? seconds : "Invalid interval";
};

export const parsePoints = (raw: unknown): number => {
	const n = typeof raw === "string" ? Number(raw) : NaN;
	if (!Number.isFinite(n)) return DEFAULT_POINTS;
	return Math.min(MAX_POINTS, Math.max(MIN_POINTS, Math.round(n)));
};

// the smallest round bucket that leaves at most `points` buckets in the range (and is not below the minimum
// interval, when there is one: then the interval itself if it is not a round step)
export const bucketSeconds = ({ from, to }: TimeRange, points: number, minInterval: number | null = null): number => {
	const needed = (to.getTime() - from.getTime()) / 1000 / points;
	const auto = BUCKET_STEPS.find((step) => step >= needed) ?? BUCKET_STEPS[BUCKET_STEPS.length - 1];
	if (minInterval === null || minInterval <= auto) return auto;
	return minInterval;
};

// The values of a field: numbers, and texts that are numbers ("21.5", as Grafana's CAST accepts); anything
// else (null, objects, words) is left out instead of failing the query.
export const SERIES_SQL = `
SELECT
	(extract(epoch FROM time_bucket($1::interval, timestamp)) * 1000)::bigint AS "t",
	avg(v) AS "avg", min(v) AS "min", max(v) AS "max", count(*)::int AS "count",
	sum(v) AS "sum", last(v, timestamp) AS "last", first(v, timestamp) AS "first"
FROM (
	SELECT timestamp,
		CASE
			WHEN jsonb_typeof(x) = 'number' THEN (x #>> '{}')::double precision
			WHEN jsonb_typeof(x) = 'string' AND (x #>> '{}') ~ '^\\s*[-+]?(\\d+\\.?\\d*|\\.\\d+)([eE][-+]?\\d+)?\\s*$'
				THEN (x #>> '{}')::double precision
		END AS v
	FROM (
		SELECT timestamp, payload #> $2::text[] AS x
		FROM iot_data.thingData
		WHERE group_uid = $3 AND topic = $4 AND timestamp >= $5 AND timestamp < $6
	) AS raw
) AS vals
WHERE v IS NOT NULL AND v <> 'NaN'::double precision AND v <> 'Infinity'::double precision AND v <> '-Infinity'::double precision
GROUP BY 1
ORDER BY 1`;

export const seriesPath = (series: SeriesRequest): string[] =>
	series.index === undefined ? [series.field] : [series.field, String(series.index)];

// label and units of a field from the measurements of the sensor (or of its type)
export const seriesLabel = (
	series: SeriesRequest,
	measurements: Measurements
): { label: string; units: string } => {
	const m = measurements[series.field];
	if (!m) return { label: series.index === undefined ? series.field : `${series.field}[${series.index}]`, units: "-" };
	if (series.index !== undefined) {
		const items = m.label.split(",").map((s) => s.trim());
		return { label: items[series.index] || `${series.field}[${series.index}]`, units: m.units };
	}
	return { label: m.label, units: m.units };
};

export const sensorMeasurements = (own: unknown, ofType: unknown): Measurements => {
	const measurements = toMeasurements(own);
	return Object.keys(measurements).length ? measurements : toMeasurements(ofType);
};

// [t (ms), mean, min, max, count, sum, last, first] rounded to keep the answer small
export interface SeriesRow {
	t: string | number;
	avg: number;
	min: number;
	max: number;
	count: number;
	sum: number;
	last: number;
	first: number;
}

export const toPoint = (row: SeriesRow) => {
	const round = (v: number) => (Number.isFinite(v) ? Number(v.toPrecision(7)) : null);
	return [
		Number(row.t),
		round(Number(row.avg)),
		round(Number(row.min)),
		round(Number(row.max)),
		Number(row.count),
		round(Number(row.sum)),
		round(Number(row.last)),
		round(Number(row.first)),
	];
};

// --- histograms (the Histogram panel): how many values fall in each bin, the same bins for every series --

export const HISTOGRAM_MAX_BINS = 500;
export const HISTOGRAM_DEFAULT_BINS = 30;

// The values of a field in the range, as a subquery "vals" with a column v (the same rules as SERIES_SQL);
// its parameters start at $first: path, group_uid, topic, from, to
export const valuesSql = (first: number) => `(
	SELECT timestamp,
		CASE
			WHEN jsonb_typeof(x) = 'number' THEN (x #>> '{}')::double precision
			WHEN jsonb_typeof(x) = 'string' AND (x #>> '{}') ~ '^\\s*[-+]?(\\d+\\.?\\d*|\\.\\d+)([eE][-+]?\\d+)?\\s*$'
				THEN (x #>> '{}')::double precision
		END AS v
	FROM (
		SELECT timestamp, payload #> $${first}::text[] AS x
		FROM iot_data.thingData
		WHERE group_uid = $${first + 1} AND topic = $${first + 2} AND timestamp >= $${first + 3} AND timestamp < $${first + 4}
	) AS raw
) AS vals
WHERE v IS NOT NULL AND v <> 'NaN'::double precision AND v <> 'Infinity'::double precision AND v <> '-Infinity'::double precision`;

export const EXTENT_SQL = `SELECT min(v) AS "min", max(v) AS "max", count(*)::int AS "count" FROM ${valuesSql(1)}`;

export const HISTOGRAM_SQL = `SELECT floor((v - $6::double precision) / $7::double precision)::bigint AS "bin", count(*)::int AS "count"
FROM ${valuesSql(1)}
GROUP BY 1
ORDER BY 1`;

export interface HistogramRequest {
	bins: number;
	size: number | null;
	offset: number;
}

// histogram=30 (bins), bucketSize=0.1, bucketOffset=0 (Grafana's Histogram options); null: not a histogram
export const parseHistogram = (bins: unknown, size: unknown, offset: unknown): HistogramRequest | null | string => {
	if (bins === undefined || bins === "") return null;
	const n = Number(bins);
	if (!Number.isInteger(n) || n < 1 || n > HISTOGRAM_MAX_BINS) return `histogram must be the number of bins, 1 to ${HISTOGRAM_MAX_BINS}`;
	let bucketSize: number | null = null;
	if (size !== undefined && size !== "") {
		bucketSize = Number(size);
		if (!Number.isFinite(bucketSize) || bucketSize <= 0) return "bucketSize must be a positive number";
	}
	const bucketOffset = offset === undefined || offset === "" ? 0 : Number(offset);
	if (!Number.isFinite(bucketOffset)) return "bucketOffset must be a number";
	return { bins: n, size: bucketSize, offset: bucketOffset };
};

// a round width (1, 2 or 5 times a power of ten) that gives about `bins` bins between min and max
export const niceBinSize = (min: number, max: number, bins: number): number => {
	const raw = (max - min) / Math.max(1, bins);
	if (!(raw > 0)) return 1;
	const power = Math.pow(10, Math.floor(Math.log10(raw)));
	const step = [1, 2, 2.5, 5, 10].find((m) => m * power >= raw) ?? 10;
	return step * power;
};

// The width of the bins, never so small that there would be more than HISTOGRAM_MAX_BINS
export const histogramBinSize = (min: number, max: number, request: HistogramRequest): number => {
	const size = request.size ?? niceBinSize(min, max, request.bins);
	const smallest = (max - min) / HISTOGRAM_MAX_BINS;
	return size < smallest ? niceBinSize(min, max, HISTOGRAM_MAX_BINS) : size;
};
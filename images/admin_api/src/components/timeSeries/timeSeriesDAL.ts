import { readQuery } from "../../config/dbconfig";
import { timescaledbReadQuery } from "../../config/timescaledb_config";
import {
	EXTENT_SQL,
	HISTOGRAM_SQL,
	RAW_MAX_SAMPLES,
	RAW_SQL,
	SERIES_SQL,
	SeriesRequest,
	SeriesRow,
	TimeRange,
	overAssetStates,
	seriesPath,
	toPoint,
} from "./timeSeries";

// The queries over the history of the asset states (the series with assetId): `key` is then the asset's uid
const STATE_SQL = {
	series: overAssetStates(SERIES_SQL),
	raw: overAssetStates(RAW_SQL),
	extent: overAssetStates(EXTENT_SQL),
	histogram: overAssetStates(HISTOGRAM_SQL),
};
// the topic of a sensor's messages, or the asset of a state
const keyOf = (series: SeriesRequest, key: string) => (series.assetId !== undefined ? key : `Topic_${key}`);

export interface ISeriesSensor {
	id: number;
	description: string;
	topicUid: string;
	measurements: unknown;
	defaultMeasurements: unknown;
}

// the sensors of the group among ids (the others are left out)
export const getSeriesSensors = async (groupId: number, ids: number[]): Promise<ISeriesSensor[]> => {
	const result = await readQuery<ISeriesSensor>(
		`SELECT grafanadb.sensor.id, grafanadb.sensor.description,
		grafanadb.topic.topic_uid AS "topicUid",
		grafanadb.sensor.measurements,
		grafanadb.sensor_type.default_measurements AS "defaultMeasurements"
		FROM grafanadb.sensor
		INNER JOIN grafanadb.asset ON grafanadb.sensor.asset_id = grafanadb.asset.id
		INNER JOIN grafanadb.topic ON grafanadb.topic.id = grafanadb.sensor.topic_id
		INNER JOIN grafanadb.sensor_type ON grafanadb.sensor_type.id = grafanadb.sensor.sensor_type_id
		WHERE grafanadb.asset.group_id = $1 AND grafanadb.sensor.id = ANY($2::bigint[])`,
		[groupId, ids]
	);
	return result.rows;
};

export const getSeriesPoints = async (
	groupUid: string,
	topicUid: string,
	series: SeriesRequest,
	range: TimeRange,
	bucket: number
): Promise<(number | null)[][]> => {
	const result = await timescaledbReadQuery(series.assetId !== undefined ? STATE_SQL.series : SERIES_SQL, [
		`${bucket} seconds`,
		seriesPath(series),
		groupUid,
		keyOf(series, topicUid),
		range.from.toISOString(),
		range.to.toISOString(),
	]);
	// the rows of pg are QueryResultRow ({[column]: any}): the columns of SERIES_SQL
	return result.rows.map((row) => toPoint(row as SeriesRow));
};

// every sample of the range (the last RAW_MAX_SAMPLES), as points of one sample each
export const getRawSeriesPoints = async (
	groupUid: string,
	topicUid: string,
	series: SeriesRequest,
	range: TimeRange
): Promise<(number | null)[][]> => {
	const result = await timescaledbReadQuery(series.assetId !== undefined ? STATE_SQL.raw : RAW_SQL, [
		seriesPath(series),
		groupUid,
		keyOf(series, topicUid),
		range.from.toISOString(),
		range.to.toISOString(),
		RAW_MAX_SAMPLES,
	]);
	return result.rows.map((row) => toPoint(row as SeriesRow));
};

const valuesParams = (groupUid: string, topicUid: string, series: SeriesRequest, range: TimeRange) => [
	seriesPath(series),
	groupUid,
	keyOf(series, topicUid),
	range.from.toISOString(),
	range.to.toISOString(),
];

export const getSeriesExtent = async (
	groupUid: string,
	topicUid: string,
	series: SeriesRequest,
	range: TimeRange
): Promise<{ min: number | null; max: number | null; count: number }> => {
	const result = await timescaledbReadQuery(series.assetId !== undefined ? STATE_SQL.extent : EXTENT_SQL, valuesParams(groupUid, topicUid, series, range));
	const row = result.rows[0] ?? {};
	return {
		min: row.min === null || row.min === undefined ? null : Number(row.min),
		max: row.max === null || row.max === undefined ? null : Number(row.max),
		count: Number(row.count ?? 0),
	};
};

// [start of the bin, count] of the bins with values
export const getSeriesHistogram = async (
	groupUid: string,
	topicUid: string,
	series: SeriesRequest,
	range: TimeRange,
	size: number,
	offset: number
): Promise<[number, number][]> => {
	const result = await timescaledbReadQuery(series.assetId !== undefined ? STATE_SQL.histogram : HISTOGRAM_SQL, [
		...valuesParams(groupUid, topicUid, series, range),
		offset,
		size,
	]);
	return result.rows.map((row) => [Number((offset + Number(row.bin) * size).toPrecision(12)), Number(row.count)]);
};

export interface ISeriesAsset {
	id: number;
	assetUid: string;
	description: string;
	// the history of its states is kept (status changes or copies)
	historyOn: boolean;
}

// the assets of the group among ids, with whether their states are kept
export const getSeriesAssets = async (groupId: number, groupUid: string, ids: number[]): Promise<ISeriesAsset[]> => {
	const assets = await readQuery<{ id: number; assetUid: string; description: string }>(
		`SELECT id, asset_uid AS "assetUid", description FROM grafanadb.asset WHERE group_id = $1 AND id = ANY($2::bigint[])`,
		[groupId, ids]
	);
	if (!assets.rows.length) return [];
	const settings = await timescaledbReadQuery(
		`SELECT asset_uid AS "assetUid", (history_status_changes OR history_snapshot_minutes > 0) AS "on"
		 FROM iot_data.assetState WHERE group_uid = $1 AND asset_uid = ANY($2::text[])`,
		[groupUid, assets.rows.map((a) => a.assetUid)]
	).catch(() => ({ rows: [] as { assetUid: string; on: boolean }[] }));
	const on = new Set(settings.rows.filter((r) => r.on).map((r) => r.assetUid as string));
	return assets.rows.map((a) => ({ id: Number(a.id), assetUid: a.assetUid, description: a.description, historyOn: on.has(a.assetUid) }));
};

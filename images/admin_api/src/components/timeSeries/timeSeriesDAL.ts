import { readQuery } from "../../config/dbconfig";
import { timescaledbReadQuery } from "../../config/timescaledb_config";
import { EXTENT_SQL, HISTOGRAM_SQL, SERIES_SQL, SeriesRequest, SeriesRow, TimeRange, seriesPath, toPoint } from "./timeSeries";

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
	const result = await timescaledbReadQuery(SERIES_SQL, [
		`${bucket} seconds`,
		seriesPath(series),
		groupUid,
		`Topic_${topicUid}`,
		range.from.toISOString(),
		range.to.toISOString(),
	]);
	// the rows of pg are QueryResultRow ({[column]: any}): the columns of SERIES_SQL
	return result.rows.map((row) => toPoint(row as SeriesRow));
};

const valuesParams = (groupUid: string, topicUid: string, series: SeriesRequest, range: TimeRange) => [
	seriesPath(series),
	groupUid,
	`Topic_${topicUid}`,
	range.from.toISOString(),
	range.to.toISOString(),
];

export const getSeriesExtent = async (
	groupUid: string,
	topicUid: string,
	series: SeriesRequest,
	range: TimeRange
): Promise<{ min: number | null; max: number | null; count: number }> => {
	const result = await timescaledbReadQuery(EXTENT_SQL, valuesParams(groupUid, topicUid, series, range));
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
	const result = await timescaledbReadQuery(HISTOGRAM_SQL, [...valuesParams(groupUid, topicUid, series, range), offset, size]);
	return result.rows.map((row) => [Number((offset + Number(row.bin) * size).toPrecision(12)), Number(row.count)]);
};
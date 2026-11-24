// Aggregated time series of sensor fields and of the states of assets (the chart panels of the Viewer page):
//
//   GET /time_series/:groupId?series=[{"sensorId":12,"field":"temperature"},{"sensorId":13,"field":"acc","index":1},
//                                     {"assetId":4,"field":"kpi.oee"}]
//                            &from=<ISO|ms>&to=<ISO|ms>&points=600&interval=1m
//
//   { from, to, bucketSeconds, series: [{ sensorId | assetId, field, index?, label, units, sensor,
//     points: [[t, mean, min, max, count, sum, last, first]], historyOff? }] }
//
// A field of an asset's state (assetId) is read from the history of its states (iot_data.asset_state_history):
// historyOff when it is not kept (its points are then those kept before, if any).
//
// interval: the minimum bucket (Grafana's "Min interval"); by default the bucket only depends on the range.
//
// &histogram=30[&bucketSize=0.5&bucketOffset=0]: the Histogram panel instead; the same bins for every series
//   { from, to, histogram: { min, max, size, offset }, series: [{ ..., bins: [[start, count]] }] }
//
// Default range: the last hour. The bucket grows with the range (at most `points` buckets). The viewer is
// opened by group administrators, so the series need the same rights.
import { Router, NextFunction, Response } from "express";
import IController from "../../interfaces/controller.interface";
import groupExists from "../../middleware/groupExists.middleware";
import { groupViewerAuth } from "../../middleware/auth.middleware";
import IRequestWithGroup from "../group/interfaces/requestWithGroup.interface";
import HttpException from "../../exceptions/HttpException";
import {
	bucketSeconds,
	histogramBinSize,
	parseHistogram,
	parseInterval,
	parsePoints,
	parseRange,
	parseSeries,
	RAW_INTERVAL,
	rawStepSeconds,
	resolvedSeries,
	sensorMeasurements,
	SeriesRequest,
	seriesLabel,
} from "./timeSeries";
import { getRawSeriesPoints, getSeriesAssets, getSeriesExtent, getSeriesHistogram, getSeriesPoints, getSeriesSensors } from "./timeSeriesDAL";

class TimeSeriesController implements IController {
	public path = "/time_series";

	public router = Router();

	constructor() {
		this.router.get(`${this.path}/:groupId`, groupExists, groupViewerAuth, this.getTimeSeries);
	}

	private getTimeSeries = async (req: IRequestWithGroup, res: Response, next: NextFunction): Promise<void> => {
		try {
			const series = parseSeries(req.query.series);
			if (typeof series === "string") throw new HttpException(req, res, 400, series);
			const range = parseRange(req.query.from, req.query.to);
			if (typeof range === "string") throw new HttpException(req, res, 400, range);
			// "raw": every sample, without intervals (as Grafana's raw SQL)
			const raw = req.query.interval === RAW_INTERVAL;
			const interval = raw ? null : parseInterval(req.query.interval);
			if (typeof interval === "string") throw new HttpException(req, res, 400, interval);
			const bucket = bucketSeconds(range, parsePoints(req.query.points), interval);
			const group = req.group;
			const ids = Array.from(new Set(series.filter((s) => s.sensorId !== undefined).map((s) => s.sensorId)));
			const sensors = ids.length ? await getSeriesSensors(Number(group.id), ids) : [];
			const byId = new Map(sensors.map((s) => [Number(s.id), s]));
			const missing = ids.filter((id) => !byId.has(id));
			if (missing.length) {
				throw new HttpException(req, res, 404, `Sensors not found in the group: ${missing.join(", ")}`);
			}
			const assetIds = Array.from(new Set(series.filter((s) => s.assetId !== undefined).map((s) => s.assetId)));
			const assets = assetIds.length ? await getSeriesAssets(Number(group.id), group.groupUid, assetIds) : [];
			const assetById = new Map(assets.map((a) => [a.id, a]));
			const missingAssets = assetIds.filter((id) => !assetById.has(id));
			if (missingAssets.length) {
				throw new HttpException(req, res, 404, `Assets not found in the group: ${missingAssets.join(", ")}`);
			}
			// each series with the path of its value, as the measurements of its sensor say (a state: its path)
			const located = (s: SeriesRequest) => {
				if (s.assetId !== undefined) return s;
				const sensor = byId.get(s.sensorId);
				return resolvedSeries(s, sensorMeasurements(sensor.measurements, sensor.defaultMeasurements));
			};
			// where the values are (the topic of a sensor, an asset), its name, label and units
			const describe = (s: SeriesRequest) => {
				if (s.assetId !== undefined) {
					const asset = assetById.get(s.assetId);
					const stateLabel = s.index === undefined ? s.field : `${s.field}[${s.index}]`;
					return { key: asset.assetUid, label: stateLabel, units: "-", sensor: `${asset.description} · state`, extra: asset.historyOn ? {} : { historyOff: true } };
				}
				const sensor = byId.get(s.sensorId);
				const { label, units } = seriesLabel(s, sensorMeasurements(sensor.measurements, sensor.defaultMeasurements));
				return { key: sensor.topicUid, label, units, sensor: sensor.description, extra: {} };
			};
			const histogram = parseHistogram(req.query.histogram, req.query.bucketSize, req.query.bucketOffset);
			if (typeof histogram === "string") throw new HttpException(req, res, 400, histogram);
			if (histogram) {
				const extents = await Promise.all(
					series.map((s) => getSeriesExtent(group.groupUid, describe(s).key, located(s), range))
				);
				const mins = extents.map((e) => e.min).filter((v): v is number => v !== null);
				const maxs = extents.map((e) => e.max).filter((v): v is number => v !== null);
				const min = mins.length ? Math.min(...mins) : 0;
				const max = maxs.length ? Math.max(...maxs) : 0;
				const size = histogramBinSize(min, max, histogram);
				const bins = await Promise.all(
					series.map(async (s, i) => {
						const { key, label, units, sensor, extra } = describe(s);
						const counted = extents[i].count
							? await getSeriesHistogram(group.groupUid, key, located(s), range, size, histogram.offset)
							: [];
						return { ...s, label, units, sensor, ...extra, count: extents[i].count, bins: counted };
					})
				);
				res.status(200).send({
					from: range.from.toISOString(),
					to: range.to.toISOString(),
					histogram: { min, max, size, offset: histogram.offset },
					series: bins,
				});
				return;
			}
			const result = await Promise.all(
				series.map(async (s) => {
					const { key, label, units, sensor, extra } = describe(s);
					const points = raw
						? await getRawSeriesPoints(group.groupUid, key, located(s), range)
						: await getSeriesPoints(group.groupUid, key, located(s), range, bucket);
					return { ...s, label, units, sensor, ...extra, points };
				})
			);
			res.status(200).send({
				from: range.from.toISOString(),
				to: range.to.toISOString(),
				// raw: the typical step between samples (the chart breaks the line where they are missing)
				bucketSeconds: raw ? rawStepSeconds(result.map((r) => r.points)) : bucket,
				...(raw ? { raw: true } : {}),
				series: result,
			});
		} catch (error) {
			next(error);
		}
	};
}

export default TimeSeriesController;

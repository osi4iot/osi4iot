// Aggregated time series of sensor fields (the chart panels of the Viewer page):
//
//   GET /time_series/:groupId?series=[{"sensorId":12,"field":"temperature"},{"sensorId":13,"field":"acc","index":1}]
//                            &from=<ISO|ms>&to=<ISO|ms>&points=600&interval=1m
//
//   { from, to, bucketSeconds, series: [{ sensorId, field, index?, label, units, sensor,
//     points: [[t, mean, min, max, count, sum, last, first]] }] }
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
import { groupAdminAuth } from "../../middleware/auth.middleware";
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
	sensorMeasurements,
	seriesLabel,
} from "./timeSeries";
import { getSeriesExtent, getSeriesHistogram, getSeriesPoints, getSeriesSensors } from "./timeSeriesDAL";

class TimeSeriesController implements IController {
	public path = "/time_series";

	public router = Router();

	constructor() {
		this.router.get(`${this.path}/:groupId`, groupExists, groupAdminAuth, this.getTimeSeries);
	}

	private getTimeSeries = async (req: IRequestWithGroup, res: Response, next: NextFunction): Promise<void> => {
		try {
			const series = parseSeries(req.query.series);
			if (typeof series === "string") throw new HttpException(req, res, 400, series);
			const range = parseRange(req.query.from, req.query.to);
			if (typeof range === "string") throw new HttpException(req, res, 400, range);
			const interval = parseInterval(req.query.interval);
			if (typeof interval === "string") throw new HttpException(req, res, 400, interval);
			const bucket = bucketSeconds(range, parsePoints(req.query.points), interval);
			const group = req.group;
			const ids = Array.from(new Set(series.map((s) => s.sensorId)));
			const sensors = await getSeriesSensors(Number(group.id), ids);
			const byId = new Map(sensors.map((s) => [Number(s.id), s]));
			const missing = ids.filter((id) => !byId.has(id));
			if (missing.length) {
				throw new HttpException(req, res, 404, `Sensors not found in the group: ${missing.join(", ")}`);
			}
			const histogram = parseHistogram(req.query.histogram, req.query.bucketSize, req.query.bucketOffset);
			if (typeof histogram === "string") throw new HttpException(req, res, 400, histogram);
			if (histogram) {
				const extents = await Promise.all(
					series.map((s) => getSeriesExtent(group.groupUid, byId.get(s.sensorId).topicUid, s, range))
				);
				const mins = extents.map((e) => e.min).filter((v): v is number => v !== null);
				const maxs = extents.map((e) => e.max).filter((v): v is number => v !== null);
				const min = mins.length ? Math.min(...mins) : 0;
				const max = maxs.length ? Math.max(...maxs) : 0;
				const size = histogramBinSize(min, max, histogram);
				const bins = await Promise.all(
					series.map(async (s, i) => {
						const sensor = byId.get(s.sensorId);
						const { label, units } = seriesLabel(s, sensorMeasurements(sensor.measurements, sensor.defaultMeasurements));
						const counted = extents[i].count
							? await getSeriesHistogram(group.groupUid, sensor.topicUid, s, range, size, histogram.offset)
							: [];
						return { ...s, label, units, sensor: sensor.description, count: extents[i].count, bins: counted };
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
					const sensor = byId.get(s.sensorId);
					const { label, units } = seriesLabel(s, sensorMeasurements(sensor.measurements, sensor.defaultMeasurements));
					const points = await getSeriesPoints(group.groupUid, sensor.topicUid, s, range, bucket);
					return { ...s, label, units, sensor: sensor.description, points };
				})
			);
			res.status(200).send({
				from: range.from.toISOString(),
				to: range.to.toISOString(),
				bucketSeconds: bucket,
				series: result,
			});
		} catch (error) {
			next(error);
		}
	};
}

export default TimeSeriesController;

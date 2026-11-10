// History of the alarms of a group (the events of the Alarm nodes of its digital twins, kept 2 years):
//
//   GET /alarm_history/:groupId?from=YYYY-MM-DD&to=YYYY-MM-DD&digitalTwinId=n&limit=n
//       The events of the range (both days included, UTC; by default the last 30 days), newest first:
//       { events: [...], truncated, retentionDays }.
//   GET /alarm_history_event/:groupId/:eventId
//       One event, with the alarm's settings and the copy of the message that caused it.
//   GET /alarm_history_export/:groupId?from=...&to=...&digitalTwinId=n&format=csv|json
//       All the columns of the events of the range, oldest first, as a file (to analyse them or train models).
import { Router, NextFunction, Response } from "express";
import IController from "../../interfaces/controller.interface";
import groupExists from "../../middleware/groupExists.middleware";
import { groupAdminAuth } from "../../middleware/auth.middleware";
import IRequestWithUserAndGroup from "../group/interfaces/requestWithUserAndGroup.interface";
import HttpException from "../../exceptions/HttpException";
import {
	EVENT_ID_PATTERN,
	HISTORY_EXPORT_MAX_ROWS,
	HISTORY_RETENTION_DAYS,
	historyFilterOf,
	historyLimitOf,
	panelFilterOf,
	toCsv,
} from "../../utils/eventHistory/eventHistory";
import { ALARM_EXPORT_COLUMNS, exportAlarmHistory, getAlarmEvent, getAlarmHistory, getActiveAlarms } from "./alarmHistoryDAL";

class AlarmHistoryController implements IController {
	public path = "/alarm_history";

	public router = Router();

	constructor() {
		this.initializeRoutes();
	}

	private initializeRoutes(): void {
		this.router
			.get(`${this.path}/:groupId`, groupExists, groupAdminAuth, this.getHistory)
			.get(`${this.path}_event/:groupId/:eventId`, groupExists, groupAdminAuth, this.getEvent)
			.get(`${this.path}_export/:groupId`, groupExists, groupAdminAuth, this.exportHistory)
			// the panel of the Viewer page: ?digitalTwinId=n&days=30
			.get(`${this.path}_active/:groupId`, groupExists, groupAdminAuth, this.getPanel);
	}

	private getHistory = async (req: IRequestWithUserAndGroup, res: Response, next: NextFunction): Promise<void> => {
		try {
			const filter = historyFilterOf(Number(req.group.id), req.query);
			if (typeof filter === "string") throw new HttpException(req, res, 400, filter);
			const { rows, truncated } = await getAlarmHistory(filter, historyLimitOf(req.query.limit));
			res.status(200).send({ events: rows, truncated, retentionDays: HISTORY_RETENTION_DAYS });
		} catch (error) {
			next(error);
		}
	};

	private getPanel = async (req: IRequestWithUserAndGroup, res: Response, next: NextFunction): Promise<void> => {
		try {
			const filter = panelFilterOf(Number(req.group.id), req.query);
			if (typeof filter === "string") throw new HttpException(req, res, 400, filter);
			const rows = await getActiveAlarms(filter);
			res.status(200).send({ alarms: rows, days: filter.days });
		} catch (error) {
			next(error);
		}
	};

	private getEvent = async (req: IRequestWithUserAndGroup, res: Response, next: NextFunction): Promise<void> => {
		try {
			const { eventId } = req.params;
			if (!EVENT_ID_PATTERN.test(eventId)) throw new HttpException(req, res, 400, "Invalid event id");
			const event = await getAlarmEvent(Number(req.group.id), eventId);
			if (!event) throw new HttpException(req, res, 404, "The event was not found (deleted after 2 years?)");
			res.status(200).send(event);
		} catch (error) {
			next(error);
		}
	};

	private exportHistory = async (req: IRequestWithUserAndGroup, res: Response, next: NextFunction): Promise<void> => {
		try {
			const filter = historyFilterOf(Number(req.group.id), req.query);
			if (typeof filter === "string") throw new HttpException(req, res, 400, filter);
			const format = req.query.format === "json" ? "json" : "csv";
			const rows = await exportAlarmHistory(filter, HISTORY_EXPORT_MAX_ROWS);
			const name = `alarm_history_group_${req.group.id}_${filter.from.toISOString().slice(0, 10)}_${new Date(
				filter.to.getTime() - 1
			)
				.toISOString()
				.slice(0, 10)}.${format}`;
			res.setHeader("Content-Disposition", `attachment; filename="${name}"`);
			if (format === "json") {
				res.setHeader("Content-Type", "application/json; charset=utf-8");
				res.status(200).send(JSON.stringify(rows));
			} else {
				res.setHeader("Content-Type", "text/csv; charset=utf-8");
				res.status(200).send(toCsv(rows, ALARM_EXPORT_COLUMNS));
			}
		} catch (error) {
			next(error);
		}
	};
}

export default AlarmHistoryController;

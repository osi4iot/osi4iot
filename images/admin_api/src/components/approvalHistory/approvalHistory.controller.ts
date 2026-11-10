// History of the approvals of a group (the requests of the Approval nodes of its digital twins, kept 2 years):
//
//   GET /approval_history/:groupId?from=YYYY-MM-DD&to=YYYY-MM-DD&digitalTwinId=n&limit=n
//       The events of the range (both days included, UTC; by default the last 30 days), newest first:
//       { events: [...], truncated, retentionDays }.
//   GET /approval_history_event/:groupId/:eventId
//       One event, with the copy of the message that waited for the decision.
//   GET /approval_history_export/:groupId?from=...&to=...&digitalTwinId=n&format=csv|json
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
import { APPROVAL_EXPORT_COLUMNS, exportApprovalHistory, getApprovalEvent, getApprovalHistory, getPendingApprovals } from "./approvalHistoryDAL";

class ApprovalHistoryController implements IController {
	public path = "/approval_history";

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
			.get(`${this.path}_pending/:groupId`, groupExists, groupAdminAuth, this.getPanel);
	}

	private getHistory = async (req: IRequestWithUserAndGroup, res: Response, next: NextFunction): Promise<void> => {
		try {
			const filter = historyFilterOf(Number(req.group.id), req.query);
			if (typeof filter === "string") throw new HttpException(req, res, 400, filter);
			const { rows, truncated } = await getApprovalHistory(filter, historyLimitOf(req.query.limit));
			res.status(200).send({ events: rows, truncated, retentionDays: HISTORY_RETENTION_DAYS });
		} catch (error) {
			next(error);
		}
	};

	private getPanel = async (req: IRequestWithUserAndGroup, res: Response, next: NextFunction): Promise<void> => {
		try {
			const filter = panelFilterOf(Number(req.group.id), req.query);
			if (typeof filter === "string") throw new HttpException(req, res, 400, filter);
			const rows = await getPendingApprovals(filter);
			res.status(200).send({ requests: rows, days: filter.days });
		} catch (error) {
			next(error);
		}
	};

	private getEvent = async (req: IRequestWithUserAndGroup, res: Response, next: NextFunction): Promise<void> => {
		try {
			const { eventId } = req.params;
			if (!EVENT_ID_PATTERN.test(eventId)) throw new HttpException(req, res, 400, "Invalid event id");
			const event = await getApprovalEvent(Number(req.group.id), eventId);
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
			const rows = await exportApprovalHistory(filter, HISTORY_EXPORT_MAX_ROWS);
			const name = `approval_history_group_${req.group.id}_${filter.from.toISOString().slice(0, 10)}_${new Date(
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
				res.status(200).send(toCsv(rows, APPROVAL_EXPORT_COLUMNS));
			}
		} catch (error) {
			next(error);
		}
	};
}

export default ApprovalHistoryController;

// LLM usage of the organizations (tokens of their LLM provider, audio seconds, characters).
//
//   POST /llm_usage
//       pipelines (platform admin) sends what its nodes consumed: { records: [...] }. Answers with the
//       month's tokens of each organization in the batch and, once per month and threshold, whether the
//       warning percentage or the limit has just been crossed: { orgs: [{ orgId, monthTokens,
//       monthlyTokenLimit, warningPercent, notify }] }.
//   GET /llm_usage/:orgId?from=YYYY-MM-DD&to=YYYY-MM-DD
//       Totals of the organization between two days (both included, UTC; by default the current month)
//       by provider and model, node type, group, digital twin, node, user and day, with the limit and
//       retentionDays (older usage has been deleted).
//   GET /llm_usage_trend/:orgId
//       Monthly totals of the organization over the last years (the long-term trend, kept longer than the
//       detail): { months: [{ month, ...totals, byModel, bySource }], retentionYears }.
//   PUT /llm_usage_limit/:orgId
//       { monthlyTokenLimit, warningPercent }: 0 = no limit. Only a warning: nothing is blocked.
import { Router, NextFunction, Request, Response } from "express";
import IController from "../../interfaces/controller.interface";
import organizationExists from "../../middleware/organizationExists.middleware";
import { organizationAdminAuth, superAdminAuth } from "../../middleware/auth.middleware";
import IRequestWithOrganization from "../organization/interfaces/requestWithOrganization.interface";
import HttpException from "../../exceptions/HttpException";
import { logger } from "../../config/winston";
import {
	getMonthTokens,
	getOrgTokenLimit,
	getUsageSummary,
	getUsageTrend,
	insertUsageRecords,
	LLM_USAGE_RETENTION_DAYS,
	LLM_USAGE_TREND_RETENTION_YEARS,
	normalizeUsageRecord,
	updateOrgTokenLimit,
	updateOrgTokenStatus,
} from "./llmUsageDAL";

const MAX_RECORDS_PER_POST = 2000;
const MAX_RANGE_DAYS = LLM_USAGE_RETENTION_DAYS + 1;

const parseDay = (value: unknown): Date | null => {
	if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
	const date = new Date(`${value}T00:00:00Z`);
	return Number.isNaN(date.getTime()) ? null : date;
};

// [from, to) in UTC from two days, both included; the current month by default
export const usageRange = (fromDay: unknown, toDay: unknown, now = new Date()): { from: Date; to: Date } | null => {
	const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
	const nextMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
	const from = fromDay === undefined ? monthStart : parseDay(fromDay);
	const toIncluded = toDay === undefined ? null : parseDay(toDay);
	if (!from || (toDay !== undefined && !toIncluded)) return null;
	const to = toIncluded ? new Date(toIncluded.getTime() + 24 * 3600 * 1000) : nextMonthStart;
	if (to <= from || to.getTime() - from.getTime() > MAX_RANGE_DAYS * 24 * 3600 * 1000) return null;
	return { from, to };
};

class LlmUsageController implements IController {
	public path = "/llm_usage";

	public router = Router();

	constructor() {
		this.initializeRoutes();
	}

	private initializeRoutes(): void {
		this.router
			.post(`${this.path}`, superAdminAuth, this.postUsage)
			.get(`${this.path}/:orgId`, organizationAdminAuth, organizationExists, this.getUsage)
			.get(`${this.path}_trend/:orgId`, organizationAdminAuth, organizationExists, this.getTrend)
			.put(`${this.path}_limit/:orgId`, organizationAdminAuth, organizationExists, this.putLimit);
	}

	private postUsage = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
		try {
			const raw = (req.body as { records?: unknown })?.records;
			if (!Array.isArray(raw)) throw new HttpException(req, res, 400, "records must be a list");
			if (raw.length > MAX_RECORDS_PER_POST) {
				throw new HttpException(req, res, 400, `At most ${MAX_RECORDS_PER_POST} records per request`);
			}
			const records = raw.map(normalizeUsageRecord).filter((r): r is NonNullable<typeof r> => r !== null);
			if (records.length < raw.length) {
				logger.log("warn", `LLM usage: ${raw.length - records.length} invalid records were discarded`);
			}
			try {
				await insertUsageRecords(records);
			} catch (error) {
				// an organization deleted meanwhile (foreign key): store the others
				const message = error instanceof Error ? error.message : String(error);
				logger.log("warn", `LLM usage: storing the records one by one after an error: ${message}`);
				for (const record of records) {
					await insertUsageRecords([record]).catch((): undefined => undefined);
				}
			}
			const orgIds = Array.from(new Set(records.map((r) => r.orgId)));
			const orgs = await updateOrgTokenStatus(orgIds);
			res.status(200).send({ stored: records.length, orgs });
		} catch (error) {
			next(error);
		}
	};

	private getUsage = async (req: IRequestWithOrganization, res: Response, next: NextFunction): Promise<void> => {
		try {
			const range = usageRange(req.query.from, req.query.to);
			if (!range) {
				throw new HttpException(
					req,
					res,
					400,
					`from and to must be days (YYYY-MM-DD), from not after to, at most ${MAX_RANGE_DAYS} days apart`
				);
			}
			const orgId = Number(req.organization.id);
			const [summary, limit, monthTokens] = await Promise.all([
				getUsageSummary(orgId, range.from, range.to),
				getOrgTokenLimit(orgId),
				getMonthTokens(orgId),
			]);
			res.status(200).send({
				...summary,
				...limit,
				monthTokens,
				retentionDays: LLM_USAGE_RETENTION_DAYS,
				trendRetentionYears: LLM_USAGE_TREND_RETENTION_YEARS,
			});
		} catch (error) {
			next(error);
		}
	};

	private getTrend = async (req: IRequestWithOrganization, res: Response, next: NextFunction): Promise<void> => {
		try {
			const months = await getUsageTrend(Number(req.organization.id));
			res.status(200).send({ months, retentionYears: LLM_USAGE_TREND_RETENTION_YEARS });
		} catch (error) {
			next(error);
		}
	};

	private putLimit = async (req: IRequestWithOrganization, res: Response, next: NextFunction): Promise<void> => {
		try {
			const body = (req.body || {}) as { monthlyTokenLimit?: unknown; warningPercent?: unknown };
			const limit = Number(body.monthlyTokenLimit);
			const percent = body.warningPercent === undefined ? 80 : Number(body.warningPercent);
			if (!Number.isInteger(limit) || limit < 0 || limit > 1e15) {
				throw new HttpException(req, res, 400, "monthlyTokenLimit must be a whole number, 0 for no limit");
			}
			if (!Number.isInteger(percent) || percent < 1 || percent > 100) {
				throw new HttpException(req, res, 400, "warningPercent must be a whole number between 1 and 100");
			}
			const orgId = Number(req.organization.id);
			await updateOrgTokenLimit(orgId, limit, percent);
			res.status(200).send({ monthlyTokenLimit: limit, warningPercent: percent });
		} catch (error) {
			next(error);
		}
	};
}

export default LlmUsageController;
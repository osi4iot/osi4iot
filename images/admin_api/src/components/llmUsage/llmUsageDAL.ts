//
// The rows are time series data, so they live in the metrics database (TimescaleDB, iot_data_db) as the
// hypertable iot_data.llm_usage with a retention policy: they are deleted after LLM_USAGE_RETENTION_DAYS.
// The admin database keeps only each organization's settings: its monthly token limit, the warning
// percentage and which threshold was already notified this month. Crossing the warning percentage and
// the limit is notified once per month (pipelines tells the users in the logs and the chat); nothing is
// blocked.
import pool, { readQuery } from "../../config/dbconfig";
import timescaledb_pool, { timescaledbReadQuery } from "../../config/timescaledb_config";

// How long the usage rows are kept: 13 months and a bit, so that a month can be compared with the same
// month of the previous year. The table, its retention policy and the monthly continuous aggregate are
// created when the metrics cluster is bootstrapped (patroni_metrics/templates/init_metrics.sql.template):
// these two values must match the intervals set there.
export const LLM_USAGE_RETENTION_DAYS = 400;

// The long-term trend: monthly totals by organization, node type, provider and model (a continuous
// aggregate of the rows, a few rows per organization and month), kept for this many years.
export const LLM_USAGE_TREND_RETENTION_YEARS = 5;

export const LLM_USAGE_SOURCES = ["ai_agent", "translator", "transcriptor", "text2speech", "embeddings"] as const;
export type LlmUsageSource = (typeof LLM_USAGE_SOURCES)[number];

export interface ILlmUsageRecord {
	time?: string; // ISO date of the operation; now when missing
	orgId: number;
	groupId?: number | null;
	digitalTwinId?: number | null;
	digitalTwinUid?: string;
	nodeUid?: string;
	nodeName?: string;
	nodeType?: string;
	userName?: string;
	source: LlmUsageSource;
	providerType?: string;
	providerHost?: string;
	model?: string;
	requests?: number;
	inputTokens?: number;
	outputTokens?: number;
	cacheReadTokens?: number;
	reasoningTokens?: number;
	audioSeconds?: number;
	characters?: number;
}

export interface IOrgTokenStatus {
	orgId: number;
	month: string; // YYYY-MM (UTC)
	monthTokens: number;
	monthlyTokenLimit: number; // 0: no limit
	warningPercent: number;
	// set when this batch crossed a threshold not notified yet this month
	notify: "warning" | "limit" | null;
}

const MAX_TEXT = { uid: 40, name: 190, type: 40, host: 255, model: 255, provider: 30, source: 20 };

const text = (value: unknown, max: number): string => (typeof value === "string" ? value.trim().slice(0, max) : "");
const count = (value: unknown): number => {
	const n = Number(value);
	return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
};
const positive = (value: unknown): number => {
	const n = Number(value);
	return Number.isFinite(n) && n > 0 ? n : 0;
};
const id = (value: unknown): number | null => {
	const n = Number(value);
	return Number.isInteger(n) && n > 0 ? n : null;
};

// Validated copy of a record sent by pipelines; null when it cannot be stored
export const normalizeUsageRecord = (raw: unknown): ILlmUsageRecord | null => {
	if (!raw || typeof raw !== "object") return null;
	const r = raw as Record<string, unknown>;
	const orgId = id(r.orgId);
	const source = text(r.source, MAX_TEXT.source) as LlmUsageSource;
	if (!orgId || !LLM_USAGE_SOURCES.includes(source)) return null;
	const time = typeof r.time === "string" && !Number.isNaN(Date.parse(r.time)) ? new Date(r.time).toISOString() : undefined;
	return {
		time,
		orgId,
		groupId: id(r.groupId),
		digitalTwinId: id(r.digitalTwinId),
		digitalTwinUid: text(r.digitalTwinUid, MAX_TEXT.uid),
		nodeUid: text(r.nodeUid, MAX_TEXT.uid),
		nodeName: text(r.nodeName, MAX_TEXT.name),
		nodeType: text(r.nodeType, MAX_TEXT.type),
		userName: text(r.userName, MAX_TEXT.name),
		source,
		providerType: text(r.providerType, MAX_TEXT.provider),
		providerHost: text(r.providerHost, MAX_TEXT.host),
		model: text(r.model, MAX_TEXT.model),
		requests: Math.max(1, count(r.requests)),
		inputTokens: count(r.inputTokens),
		outputTokens: count(r.outputTokens),
		cacheReadTokens: count(r.cacheReadTokens),
		reasoningTokens: count(r.reasoningTokens),
		audioSeconds: positive(r.audioSeconds),
		characters: count(r.characters),
	};
};

const COLUMNS = [
	"created_at",
	"org_id",
	"group_id",
	"digital_twin_id",
	"digital_twin_uid",
	"node_uid",
	"node_name",
	"node_type",
	"user_name",
	"source",
	"provider_type",
	"provider_host",
	"model",
	"requests",
	"input_tokens",
	"output_tokens",
	"cache_read_tokens",
	"reasoning_tokens",
	"audio_seconds",
	"characters",
];

export const insertUsageRecords = async (records: ILlmUsageRecord[]): Promise<void> => {
	if (records.length === 0) return;
	const values: unknown[] = [];
	const rows = records.map((r, i) => {
		values.push(
			r.time ?? new Date().toISOString(),
			r.orgId,
			r.groupId ?? null,
			r.digitalTwinId ?? null,
			r.digitalTwinUid ?? "",
			r.nodeUid ?? "",
			r.nodeName ?? "",
			r.nodeType ?? "",
			r.userName ?? "",
			r.source,
			r.providerType ?? "",
			r.providerHost ?? "",
			r.model ?? "",
			r.requests ?? 1,
			r.inputTokens ?? 0,
			r.outputTokens ?? 0,
			r.cacheReadTokens ?? 0,
			r.reasoningTokens ?? 0,
			r.audioSeconds ?? 0,
			r.characters ?? 0
		);
		const base = i * COLUMNS.length;
		return `(${COLUMNS.map((_, j) => `$${base + j + 1}`).join(", ")})`;
	});
	await timescaledb_pool.query(`INSERT INTO iot_data.llm_usage (${COLUMNS.join(", ")}) VALUES ${rows.join(", ")};`, values);
};

const monthOf = (date = new Date()): string => date.toISOString().slice(0, 7);

const MONTH_START_SQL = "date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'";

// Tokens of the current month (UTC) of some organizations, from the metrics database (its primary: the
// rows just written must count)
const monthTokensByOrg = async (orgIds: number[]): Promise<Map<number, number>> => {
	const totals = await timescaledb_pool.query(
		`SELECT org_id, COALESCE(SUM(input_tokens + output_tokens), 0) AS tokens
		 FROM iot_data.llm_usage
		 WHERE org_id = ANY($1::bigint[]) AND created_at >= ${MONTH_START_SQL}
		 GROUP BY org_id;`,
		[orgIds]
	);
	return new Map<number, number>(totals.rows.map((row) => [Number(row.org_id), Number(row.tokens)]));
};

// Tokens of the current month (UTC) for each organization, with their limit settings. The organizations'
// rows are locked while the thresholds are checked and the notification recorded, so that with several
// pipelines replicas posting at the same time each threshold is notified only once.
export const updateOrgTokenStatus = async (orgIds: number[]): Promise<IOrgTokenStatus[]> => {
	if (orgIds.length === 0) return [];
	const month = monthOf();
	const client = await pool.connect();
	try {
		await client.query("BEGIN");
		const orgs = await client.query(
			`SELECT id, llm_monthly_token_limit, llm_token_warning_percent, llm_token_notified
			 FROM grafanadb.org WHERE id = ANY($1::bigint[]) FOR UPDATE;`,
			[orgIds]
		);
		const tokensByOrg = await monthTokensByOrg(orgIds);
		const status: IOrgTokenStatus[] = [];
		for (const org of orgs.rows) {
			const orgId = Number(org.id);
			const monthTokens = tokensByOrg.get(orgId) ?? 0;
			const limit = Number(org.llm_monthly_token_limit) || 0;
			const warningPercent = Number(org.llm_token_warning_percent) || 80;
			const notified = String(org.llm_token_notified || "");
			const [notifiedMonth, notifiedLevel] = notified.split(":");
			const levelThisMonth = notifiedMonth === month ? notifiedLevel : "";
			let notify: IOrgTokenStatus["notify"] = null;
			if (limit > 0) {
				if (monthTokens >= limit && levelThisMonth !== "limit") notify = "limit";
				else if (monthTokens >= (limit * warningPercent) / 100 && monthTokens < limit && levelThisMonth === "")
					notify = "warning";
			}
			if (notify) {
				await client.query("UPDATE grafanadb.org SET llm_token_notified = $1 WHERE id = $2;", [
					`${month}:${notify}`,
					orgId,
				]);
			}
			status.push({ orgId, month, monthTokens, monthlyTokenLimit: limit, warningPercent, notify });
		}
		await client.query("COMMIT");
		return status;
	} catch (error) {
		await client.query("ROLLBACK").catch((): undefined => undefined);
		throw error;
	} finally {
		client.release();
	}
};

export const getOrgTokenLimit = async (orgId: number): Promise<{ monthlyTokenLimit: number; warningPercent: number }> => {
	const result = await readQuery(
		"SELECT llm_monthly_token_limit, llm_token_warning_percent FROM grafanadb.org WHERE id = $1;",
		[orgId]
	);
	const row = result.rows[0] ?? {};
	return {
		monthlyTokenLimit: Number(row.llm_monthly_token_limit) || 0,
		warningPercent: Number(row.llm_token_warning_percent) || 80,
	};
};

// A new limit (or warning percentage) is notified again when it is crossed: the month's notification
// is cleared.
export const updateOrgTokenLimit = async (orgId: number, monthlyTokenLimit: number, warningPercent: number): Promise<void> => {
	await pool.query(
		`UPDATE grafanadb.org SET llm_monthly_token_limit = $1, llm_token_warning_percent = $2, llm_token_notified = ''
		 WHERE id = $3;`,
		[monthlyTokenLimit, warningPercent, orgId]
	);
};

export interface IUsageTotals {
	requests: number;
	inputTokens: number;
	outputTokens: number;
	cacheReadTokens: number;
	reasoningTokens: number;
	audioSeconds: number;
	characters: number;
	operations: number;
}

const TOTALS_SQL = `COUNT(*) AS operations, COALESCE(SUM(requests), 0) AS requests,
	COALESCE(SUM(input_tokens), 0) AS input_tokens, COALESCE(SUM(output_tokens), 0) AS output_tokens,
	COALESCE(SUM(cache_read_tokens), 0) AS cache_read_tokens, COALESCE(SUM(reasoning_tokens), 0) AS reasoning_tokens,
	COALESCE(SUM(audio_seconds), 0) AS audio_seconds, COALESCE(SUM(characters), 0) AS characters`;

const totalsOf = (row: Record<string, unknown>): IUsageTotals => ({
	operations: Number(row.operations) || 0,
	requests: Number(row.requests) || 0,
	inputTokens: Number(row.input_tokens) || 0,
	outputTokens: Number(row.output_tokens) || 0,
	cacheReadTokens: Number(row.cache_read_tokens) || 0,
	reasoningTokens: Number(row.reasoning_tokens) || 0,
	audioSeconds: Math.round((Number(row.audio_seconds) || 0) * 10) / 10,
	characters: Number(row.characters) || 0,
});

export interface IUsageSummary {
	from: string;
	to: string;
	totals: IUsageTotals;
	byProviderModel: (IUsageTotals & { providerType: string; providerHost: string; model: string })[];
	bySource: (IUsageTotals & { source: string })[];
	byGroup: (IUsageTotals & { groupId: number | null; groupName: string })[];
	byDigitalTwin: (IUsageTotals & { digitalTwinUid: string; digitalTwinName: string; groupName: string })[];
	byNode: (IUsageTotals & { nodeUid: string; nodeName: string; nodeType: string; digitalTwinUid: string })[];
	byUser: (IUsageTotals & { userName: string })[];
	daily: (IUsageTotals & { day: string })[];
}

// Usage of an organization between two instants (from inclusive, to exclusive)
export const getUsageSummary = async (orgId: number, from: Date, to: Date): Promise<IUsageSummary> => {
	const where = "u.org_id = $1 AND u.created_at >= $2 AND u.created_at < $3";
	const params = [orgId, from.toISOString(), to.toISOString()];
	const query = timescaledbReadQuery;
	const [totals, byProviderModel, bySource, byGroup, byDigitalTwin, byNode, byUser, daily] = await Promise.all([
		query(`SELECT ${TOTALS_SQL} FROM iot_data.llm_usage u WHERE ${where};`, params),
		query(
			`SELECT provider_type, provider_host, model, ${TOTALS_SQL} FROM iot_data.llm_usage u WHERE ${where}
			 GROUP BY provider_type, provider_host, model ORDER BY SUM(input_tokens + output_tokens) DESC;`,
			params
		),
		query(
			`SELECT source, ${TOTALS_SQL} FROM iot_data.llm_usage u WHERE ${where}
			 GROUP BY source ORDER BY SUM(input_tokens + output_tokens) DESC;`,
			params
		),
		query(
			`SELECT group_id, ${TOTALS_SQL} FROM iot_data.llm_usage u WHERE ${where}
			 GROUP BY group_id ORDER BY SUM(input_tokens + output_tokens) DESC;`,
			params
		),
		query(
			`SELECT digital_twin_uid, MAX(group_id) AS group_id, ${TOTALS_SQL}
			 FROM iot_data.llm_usage u WHERE ${where} AND digital_twin_uid <> ''
			 GROUP BY digital_twin_uid ORDER BY SUM(input_tokens + output_tokens) DESC LIMIT 100;`,
			params
		),
		query(
			`SELECT node_uid, MAX(node_name) AS node_name, MAX(node_type) AS node_type,
			        MAX(digital_twin_uid) AS digital_twin_uid, ${TOTALS_SQL}
			 FROM iot_data.llm_usage u WHERE ${where} AND node_uid <> ''
			 GROUP BY node_uid ORDER BY SUM(input_tokens + output_tokens) DESC LIMIT 100;`,
			params
		),
		query(
			`SELECT user_name, ${TOTALS_SQL} FROM iot_data.llm_usage u WHERE ${where} AND user_name <> ''
			 GROUP BY user_name ORDER BY SUM(input_tokens + output_tokens) DESC LIMIT 100;`,
			params
		),
		query(
			`SELECT to_char(date_trunc('day', created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day, ${TOTALS_SQL}
			 FROM iot_data.llm_usage u WHERE ${where} GROUP BY 1 ORDER BY 1;`,
			params
		),
	]);
	// The names of the groups and digital twins are in the admin database (they may have changed or been
	// deleted since: then the id or uid is shown)
	const groupIds = Array.from(
		new Set([...byGroup.rows, ...byDigitalTwin.rows].map((row) => Number(row.group_id)).filter((n) => n > 0))
	);
	const dtUids = byDigitalTwin.rows.map((row) => String(row.digital_twin_uid));
	const [groupNames, dtNames] = await Promise.all([
		groupIds.length
			? readQuery("SELECT id, name FROM grafanadb.group WHERE id = ANY($1::bigint[]);", [groupIds])
			: Promise.resolve({ rows: [] as Record<string, unknown>[] }),
		dtUids.length
			? readQuery("SELECT digital_twin_uid, description FROM grafanadb.digital_twin WHERE digital_twin_uid = ANY($1::text[]);", [dtUids])
			: Promise.resolve({ rows: [] as Record<string, unknown>[] }),
	]);
	const groupName = new Map(groupNames.rows.map((row) => [Number(row.id), String(row.name ?? "")]));
	const dtName = new Map(dtNames.rows.map((row) => [String(row.digital_twin_uid), String(row.description ?? "")]));
	return {
		from: from.toISOString(),
		to: to.toISOString(),
		totals: totalsOf(totals.rows[0] ?? {}),
		byProviderModel: byProviderModel.rows.map((row) => ({
			...totalsOf(row),
			providerType: String(row.provider_type ?? ""),
			providerHost: String(row.provider_host ?? ""),
			model: String(row.model ?? ""),
		})),
		bySource: bySource.rows.map((row) => ({ ...totalsOf(row), source: String(row.source ?? "") })),
		byGroup: byGroup.rows.map((row) => ({
			...totalsOf(row),
			groupId: row.group_id === null ? null : Number(row.group_id),
			groupName: groupName.get(Number(row.group_id)) ?? "",
		})),
		byDigitalTwin: byDigitalTwin.rows.map((row) => ({
			...totalsOf(row),
			digitalTwinUid: String(row.digital_twin_uid ?? ""),
			digitalTwinName: dtName.get(String(row.digital_twin_uid)) ?? "",
			groupName: groupName.get(Number(row.group_id)) ?? "",
		})),
		byNode: byNode.rows.map((row) => ({
			...totalsOf(row),
			nodeUid: String(row.node_uid ?? ""),
			nodeName: String(row.node_name ?? ""),
			nodeType: String(row.node_type ?? ""),
			digitalTwinUid: String(row.digital_twin_uid ?? ""),
		})),
		byUser: byUser.rows.map((row) => ({ ...totalsOf(row), userName: String(row.user_name ?? "") })),
		daily: daily.rows.map((row) => ({ ...totalsOf(row), day: String(row.day ?? "") })),
	};
};

// Tokens of the current month (UTC) of one organization
export const getMonthTokens = async (orgId: number): Promise<number> => {
	const result = await timescaledbReadQuery(
		`SELECT COALESCE(SUM(input_tokens + output_tokens), 0) AS tokens FROM iot_data.llm_usage
		 WHERE org_id = $1 AND created_at >= ${MONTH_START_SQL};`,
		[orgId]
	);
	return Number(result.rows[0]?.tokens) || 0;
};

export interface IUsageTrendMonth extends IUsageTotals {
	month: string; // YYYY-MM (UTC)
	byModel: (IUsageTotals & { providerType: string; providerHost: string; model: string })[];
	bySource: (IUsageTotals & { source: string })[];
}

// Monthly totals of an organization over the trend's retention, oldest first
export const getUsageTrend = async (orgId: number): Promise<IUsageTrendMonth[]> => {
	const result = await timescaledbReadQuery(
		`SELECT to_char(month AT TIME ZONE 'UTC', 'YYYY-MM') AS month, source, provider_type, provider_host, model,
			operations, requests, input_tokens, output_tokens, cache_read_tokens, reasoning_tokens, audio_seconds, characters
		 FROM iot_data.llm_usage_monthly
		 WHERE org_id = $1 AND month >= date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
			- INTERVAL '${LLM_USAGE_TREND_RETENTION_YEARS} years'
		 ORDER BY month;`,
		[orgId]
	);
	const add = (a: IUsageTotals, b: IUsageTotals) => {
		a.operations += b.operations;
		a.requests += b.requests;
		a.inputTokens += b.inputTokens;
		a.outputTokens += b.outputTokens;
		a.cacheReadTokens += b.cacheReadTokens;
		a.reasoningTokens += b.reasoningTokens;
		a.audioSeconds = Math.round((a.audioSeconds + b.audioSeconds) * 10) / 10;
		a.characters += b.characters;
	};
	const empty = (): IUsageTotals => ({
		operations: 0,
		requests: 0,
		inputTokens: 0,
		outputTokens: 0,
		cacheReadTokens: 0,
		reasoningTokens: 0,
		audioSeconds: 0,
		characters: 0,
	});
	const months = new Map<string, IUsageTrendMonth>();
	for (const row of result.rows) {
		const month = String(row.month);
		const totals = totalsOf(row);
		let entry = months.get(month);
		if (!entry) {
			entry = { month, ...empty(), byModel: [], bySource: [] };
			months.set(month, entry);
		}
		add(entry, totals);
		const providerType = String(row.provider_type ?? "");
		const providerHost = String(row.provider_host ?? "");
		const model = String(row.model ?? "");
		let byModel = entry.byModel.find((m) => m.providerType === providerType && m.providerHost === providerHost && m.model === model);
		if (!byModel) {
			byModel = { ...empty(), providerType, providerHost, model };
			entry.byModel.push(byModel);
		}
		add(byModel, totals);
		const source = String(row.source ?? "");
		let bySource = entry.bySource.find((s) => s.source === source);
		if (!bySource) {
			bySource = { ...empty(), source };
			entry.bySource.push(bySource);
		}
		add(bySource, totals);
	}
	const tokens = (t: IUsageTotals) => t.inputTokens + t.outputTokens;
	return Array.from(months.values()).map((m) => ({
		...m,
		byModel: m.byModel.sort((a, b) => tokens(b) - tokens(a)),
		bySource: m.bySource.sort((a, b) => tokens(b) - tokens(a)),
	}));
};

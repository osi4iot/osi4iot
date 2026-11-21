// The indicators of an organization (README, "Organization overview"): the Organization overview panel of the
// organization's digital twin (its virtual asset of context "organization", in the default group). Only the
// organization's administrators and the platform's administrators read them
// (GET /organization_overview/:groupId/:digitalTwinId).
//
// - Availability, MTBF, MTTR and the time in each status of the assets, from their status changes
//   (iot_data.asset_state_history): only the assets with the state history on. A status is available unless it is
//   one of the unavailable ones (by default "Alarm"; the panel says which: each pipeline names its statuses). An
//   asset whose state was not written in the period ("No data recorded") is inactive: it counts apart, not in the
//   availability.
// - The alarms raised in the period, how long they took to be acknowledged (MTTA), the active ones and the most
//   repeated (iot_data.alarm), and the approval requests waiting (iot_data.approval).
// - The resources: the LLM tokens of the month (UTC) against the limits (iot_data.llm_usage), the S3 archives
//   (grafanadb.s3_folder), and the pipelines: how many are deployed, the NATS subjects where they say their status
//   (the panel listens to them), and their failures and the nodes' errors in the kept pipeline logs
//   (observability.log_entries, 7 days).
import pool from "../../config/dbconfig";
import { timescaledbReadQuery } from "../../config/timescaledb_config";
import { natsSubject } from "./controlRoomData";
import { PIPELINE_LOG_DAYS, PIPELINE_LOG_EVENT } from "./controlRoomLogs";

export const OVERVIEW_PERIODS = ["7d", "30d", "90d", "12m"] as const;
export type OverviewPeriod = (typeof OVERVIEW_PERIODS)[number];
export type OverviewBucket = "day" | "week" | "month";
// the panel's default and the most statuses it may name
export const DEFAULT_UNAVAILABLE_STATUSES = ["Alarm"];
export const MAX_UNAVAILABLE_STATUSES = 12;
const STATUS_NAME = /^[\p{L}\p{N} _.-]{1,40}$/u;
// the active alarms and pending requests: as the Alarms and Approvals panels (PANEL_DAYS)
const ACTIVE_DAYS = 30;
const TOP_ALARMS = 10;
// the statuses kept by name in "time in each status" (the others, together)
const MAX_STATUSES_SHOWN = 5;

export const overviewPeriodOf = (value: unknown): OverviewPeriod =>
	OVERVIEW_PERIODS.includes(value as OverviewPeriod) ? (value as OverviewPeriod) : "30d";

// "Alarm,Fault" (the query) as a list of statuses; the default when it says none; null when one is not valid
export const unavailableStatusesOf = (value: unknown): string[] | null => {
	if (value === undefined || value === "") return DEFAULT_UNAVAILABLE_STATUSES;
	if (typeof value !== "string") return null;
	const list = [
		...new Set(
			value
				.split(",")
				.map((s) => s.trim())
				.filter(Boolean)
		),
	];
	if (list.length === 0) return DEFAULT_UNAVAILABLE_STATUSES;
	if (list.length > MAX_UNAVAILABLE_STATUSES || list.some((s) => !STATUS_NAME.test(s))) return null;
	return list;
};

const DAY = 86_400_000;

// the start of the period, and how its series is cut: by day up to 30 days, by week for 90, by month for 12 months
export const periodRange = (period: OverviewPeriod, now: Date): { from: Date; bucket: OverviewBucket } => {
	if (period === "12m") {
		return { from: new Date(Date.UTC(now.getUTCFullYear() - 1, now.getUTCMonth() + 1, 1)), bucket: "month" };
	}
	const days = period === "7d" ? 7 : period === "30d" ? 30 : 90;
	const from = new Date(now.getTime() - days * DAY);
	return { from, bucket: period === "90d" ? "week" : "day" };
};

// the start of the bucket a time falls in (UTC; the weeks start on Monday, as PostgreSQL's date_trunc)
export const bucketStart = (t: number, bucket: OverviewBucket): number => {
	const d = new Date(t);
	if (bucket === "month") return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
	const day = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
	if (bucket === "day") return day;
	return day - ((d.getUTCDay() + 6) % 7) * DAY;
};

const nextBucket = (t: number, bucket: OverviewBucket): number => {
	if (bucket === "day") return t + DAY;
	if (bucket === "week") return t + 7 * DAY;
	const d = new Date(t);
	return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
};

// the buckets of the period, oldest first: [start, end)
export const bucketsOf = (from: number, to: number, bucket: OverviewBucket): { start: number; end: number }[] => {
	const list: { start: number; end: number }[] = [];
	for (let start = bucketStart(from, bucket); start < to && list.length < 400; start = nextBucket(start, bucket)) {
		list.push({ start, end: nextBucket(start, bucket) });
	}
	return list;
};

export interface StatusSpan {
	status: string;
	from: number;
	to: number;
}

export interface AssetAvailability {
	// seconds with a known status, and of those, available
	known: number;
	available: number;
	// entries into an unavailable status in the period, and the unavailable spans that ended in it
	failures: number;
	repairs: number;
	repairSeconds: number;
	// seconds in each status (as the pipeline names it)
	byStatus: Record<string, number>;
}

const isUnavailable = (status: string, unavailable: Set<string>) => unavailable.has(status.trim().toLowerCase());

export const unavailableSet = (statuses: string[]): Set<string> => new Set(statuses.map((s) => s.trim().toLowerCase()));

// The availability of an asset from its status spans in the period [from, to), oldest first
export const availabilityOf = (
	spans: StatusSpan[],
	unavailable: Set<string>,
	from: number,
	to: number
): AssetAvailability => {
	const result: AssetAvailability = {
		known: 0,
		available: 0,
		failures: 0,
		repairs: 0,
		repairSeconds: 0,
		byStatus: {},
	};
	let previousDown: boolean | null = null;
	for (const span of spans) {
		const start = Math.max(from, span.from);
		const end = Math.min(to, span.to);
		const down = isUnavailable(span.status, unavailable);
		if (end > start) {
			const seconds = (end - start) / 1000;
			result.known += seconds;
			if (!down) result.available += seconds;
			const name = span.status.trim() || "(no status)";
			result.byStatus[name] = (result.byStatus[name] ?? 0) + seconds;
		}
		// a failure: it went down inside the period, from an available status
		if (down && previousDown === false && span.from >= from && span.from < to) result.failures++;
		// a repair: an unavailable span that ended inside the period
		if (down && span.to < to && span.to > from) {
			result.repairs++;
			result.repairSeconds += (span.to - Math.max(span.from, from)) / 1000;
		}
		previousDown = down;
	}
	return result;
};

// the availability of each bucket (null: no known status in it)
export const availabilityByBucket = (
	assets: StatusSpan[][],
	unavailable: Set<string>,
	buckets: { start: number; end: number }[],
	to: number
): (number | null)[] =>
	buckets.map((b) => {
		let known = 0;
		let available = 0;
		for (const spans of assets) {
			const a = availabilityOf(spans, unavailable, b.start, Math.min(b.end, to));
			known += a.known;
			available += a.available;
		}
		return known > 0 ? available / known : null;
	});

export interface IOverviewGroup {
	id: number;
	name: string;
	assets: number;
	assetsWithHistory: number;
	inactiveAssets: number;
	availability: number | null;
	mtbfHours: number | null;
	mttrHours: number | null;
	failures: number;
	alarmsRaised: number;
	mttaMinutes: number | null;
	activeAlarms: number;
	activeAlarmsByLevel: Record<string, number>;
	approvalsPending: number;
	// seconds in each status of its assets with history (the MAX_STATUSES_SHOWN longest, the rest in "Other"),
	// and without a known status ("No data recorded")
	statusTime: { status: string; seconds: number }[];
	noDataSeconds: number;
	ai: IOverviewAi;
	s3: IOverviewS3;
	pipelines: IOverviewPipelines;
}

export interface IOverviewAi {
	monthTokens: number;
	monthlyTokenLimit: number; // 0: no limit
}

export interface IOverviewS3 {
	folders: number;
	bytes: number;
	lastStorage: string | null;
}

export interface IOverviewPipelines {
	// the digital twins with a pipeline
	deployed: number;
	// in the kept logs (the last PIPELINE_LOG_DAYS days, at most the period): the failures of the pipelines
	// themselves (creation, start, stop, no GPU…) and the errors of their nodes
	failures: number;
	nodeErrors: number;
	// where each one says its status every second while it runs (state2sim)
	statusSubjects: { digitalTwinId: number; description: string; subject: string }[];
}

const emptyResources = (): Pick<IOverviewGroup, "ai" | "s3" | "pipelines"> => ({
	ai: { monthTokens: 0, monthlyTokenLimit: 0 },
	s3: { folders: 0, bytes: 0, lastStorage: null },
	pipelines: { deployed: 0, failures: 0, nodeErrors: 0, statusSubjects: [] },
});

const MONTH_START_SQL = "date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'";
const TOP_MODELS = 6;

interface IOverviewResources {
	byGroup: Map<number, Pick<IOverviewGroup, "ai" | "s3" | "pipelines">>;
	ai: {
		month: string;
		monthTokens: number;
		monthlyTokenLimit: number;
		warningPercent: number;
		byModel: { model: string; providerType: string; tokens: number }[];
	};
	pipelineLogDays: number;
}

// The resources of the groups of an organization (the logs from `from`, at most PIPELINE_LOG_DAYS back)
export const getOverviewResources = async (orgId: number, from: Date): Promise<IOverviewResources> => {
	const logsFrom = new Date(Math.max(from.getTime(), Date.now() - PIPELINE_LOG_DAYS * 86_400_000));
	const [groups, s3, twins, org] = await Promise.all([
		pool.query<{ id: number; groupUid: string; limit: string | number }>(
			`SELECT id, group_uid AS "groupUid", llm_monthly_token_limit AS "limit" FROM grafanadb.group WHERE org_id = $1`,
			[orgId]
		),
		pool.query<{ groupId: number; folders: string; bytes: string | null; lastStorage: Date | null }>(
			`SELECT a.group_id AS "groupId", count(*) AS folders, sum(f.parquet_total_bytes) AS bytes, max(f.last_s3_storage) AS "lastStorage"
			 FROM grafanadb.s3_folder f
			 INNER JOIN grafanadb.asset a ON a.id = f.asset_id
			 INNER JOIN grafanadb.group g ON g.id = a.group_id
			 WHERE g.org_id = $1 AND f.is_current
			 GROUP BY a.group_id`,
			[orgId]
		),
		pool.query<{
			id: number;
			groupId: number;
			groupUid: string;
			description: string;
			topicType: string | null;
			topicUid: string | null;
		}>(
			`SELECT dt.id, dt.group_id AS "groupId", g.group_uid AS "groupUid", dt.description,
			        t.topic_type AS "topicType", t.topic_uid AS "topicUid"
			 FROM grafanadb.digital_twin dt
			 INNER JOIN grafanadb.group g ON g.id = dt.group_id
			 LEFT JOIN grafanadb.digital_twin_topic dtt ON dtt.digital_twin_id = dt.id AND dtt.topic_ref = 'state2sim'
			 LEFT JOIN grafanadb.topic t ON t.id = dtt.topic_id
			 WHERE g.org_id = $1 AND dt.pipeline_file_data <> ''
			 ORDER BY dt.description`,
			[orgId]
		),
		pool.query<{ limit: string | number; warning: string | number }>(
			`SELECT llm_monthly_token_limit AS "limit", llm_token_warning_percent AS warning FROM grafanadb.org WHERE id = $1`,
			[orgId]
		),
	]);
	const groupIds = groups.rows.map((g) => Number(g.id));
	const groupUids = groups.rows.map((g) => g.groupUid);
	const [tokens, models, logs] = await Promise.all([
		groupIds.length
			? timescaledbReadQuery<{ groupId: number; tokens: string }>(
					`SELECT group_id AS "groupId", COALESCE(SUM(input_tokens + output_tokens), 0) AS tokens
					 FROM iot_data.llm_usage WHERE org_id = $1 AND created_at >= ${MONTH_START_SQL}
					 GROUP BY group_id`,
					[orgId]
			  )
			: Promise.resolve({ rows: [] as { groupId: number; tokens: string }[] }),
		timescaledbReadQuery<{ model: string; providerType: string; tokens: string }>(
			`SELECT model, provider_type AS "providerType", COALESCE(SUM(input_tokens + output_tokens), 0) AS tokens
			 FROM iot_data.llm_usage WHERE org_id = $1 AND created_at >= ${MONTH_START_SQL}
			 GROUP BY 1, 2 ORDER BY 3 DESC LIMIT $2`,
			[orgId, TOP_MODELS]
		),
		groupUids.length
			? timescaledbReadQuery<{ groupUid: string; failures: number; nodeErrors: number }>(
					`SELECT metadata->>'groupUid' AS "groupUid",
					        count(*) FILTER (WHERE metadata->>'component' = 'pipeline')::int AS failures,
					        count(*) FILTER (WHERE metadata->>'component' IS DISTINCT FROM 'pipeline')::int AS "nodeErrors"
					 FROM observability.log_entries
					 WHERE time > $1 AND service LIKE '%pipelines%' AND level IN ('error', 'fatal')
					   AND metadata->>'event' = $2 AND metadata->>'groupUid' = ANY($3::text[])
					   AND metadata->>'name' IS DISTINCT FROM 'LLM usage'
					 GROUP BY 1`,
					[logsFrom, PIPELINE_LOG_EVENT, groupUids]
			  )
			: Promise.resolve({ rows: [] as { groupUid: string; failures: number; nodeErrors: number }[] }),
	]);
	const byGroup = new Map(
		groups.rows.map((g) => {
			const r = emptyResources();
			r.ai.monthlyTokenLimit = Number(g.limit) || 0;
			return [Number(g.id), r];
		})
	);
	const idOfUid = new Map(groups.rows.map((g) => [g.groupUid, Number(g.id)]));
	for (const t of tokens.rows) {
		const r = byGroup.get(Number(t.groupId));
		if (r) r.ai.monthTokens = Number(t.tokens) || 0;
	}
	for (const f of s3.rows) {
		const r = byGroup.get(Number(f.groupId));
		if (r)
			r.s3 = {
				folders: Number(f.folders) || 0,
				bytes: Number(f.bytes) || 0,
				lastStorage: f.lastStorage ? new Date(f.lastStorage).toISOString() : null,
			};
	}
	for (const t of twins.rows) {
		const r = byGroup.get(Number(t.groupId));
		if (!r) continue;
		r.pipelines.deployed++;
		if (t.topicType && t.topicUid) {
			r.pipelines.statusSubjects.push({
				digitalTwinId: Number(t.id),
				description: t.description,
				subject: natsSubject(t.topicType, t.groupUid, t.topicUid),
			});
		}
	}
	for (const l of logs.rows) {
		const id = idOfUid.get(l.groupUid);
		const r = id === undefined ? undefined : byGroup.get(id);
		if (r) {
			r.pipelines.failures = l.failures;
			r.pipelines.nodeErrors = l.nodeErrors;
		}
	}
	// the org's tokens: those of its groups (a usage without a group counts only in the organization's)
	const orgTokens = await timescaledbReadQuery<{ tokens: string }>(
		`SELECT COALESCE(SUM(input_tokens + output_tokens), 0) AS tokens FROM iot_data.llm_usage WHERE org_id = $1 AND created_at >= ${MONTH_START_SQL}`,
		[orgId]
	);
	return {
		byGroup,
		ai: {
			month: new Date().toISOString().slice(0, 7),
			monthTokens: Number(orgTokens.rows[0]?.tokens) || 0,
			monthlyTokenLimit: Number(org.rows[0]?.limit) || 0,
			warningPercent: Number(org.rows[0]?.warning) || 0,
			byModel: models.rows.map((m) => ({
				model: m.model || "(unknown)",
				providerType: m.providerType ?? "",
				tokens: Number(m.tokens) || 0,
			})),
		},
		pipelineLogDays: Math.max(1, Math.round((Date.now() - logsFrom.getTime()) / 86_400_000)),
	};
};

export interface IOrganizationOverview {
	orgId: number;
	period: OverviewPeriod;
	from: string;
	to: string;
	bucket: OverviewBucket;
	unavailableStatuses: string[];
	totals: Omit<IOverviewGroup, "id" | "name" | "statusTime" | "noDataSeconds" | "ai" | "pipelines"> & {
		groups: number;
		pipelines: Omit<IOverviewPipelines, "statusSubjects">;
	};
	// the LLM tokens of the organization this month (UTC) against its limit, by model
	ai: IOverviewResources["ai"];
	// how many days of pipeline logs the failures and node errors count (the period, at most 7)
	pipelineLogDays: number;
	groups: IOverviewGroup[];
	series: { start: string; availability: number | null; alarms: Record<string, number> }[];
	topAlarms: { groupId: number; group: string; name: string; asset: string; node: string; count: number }[];
}

interface GroupAssetRow {
	id: number;
	name: string;
	groupUid: string;
	assetUid: string | null;
	description: string | null;
}

interface StateRow {
	groupUid: string;
	assetUid: string;
	history: boolean;
	lastUpdated: Date | null;
	status: string | null;
}

interface SpanRow {
	groupUid: string;
	assetUid: string;
	status: string;
	from: Date;
	to: Date;
	inside: boolean;
}

// the status spans of the assets with history in the period: the status before it (the last change before, or
// the previous status of the first change in it) from its start, then each change until the next one
export const STATUS_SPANS_SQL = `WITH a AS (
	SELECT * FROM unnest($1::text[], $2::text[]) AS a(group_uid, asset_uid)
),
before AS (
	SELECT a.group_uid, a.asset_uid, $3::timestamptz AS time, b.status
	FROM a CROSS JOIN LATERAL (
		SELECT h.status FROM iot_data.asset_state_history h
		WHERE h.group_uid = a.group_uid AND h.asset_uid = a.asset_uid AND h.cause = 'status_change' AND h.time < $3
		ORDER BY h.time DESC LIMIT 1
	) b
),
inside AS (
	SELECT h.group_uid, h.asset_uid, h.time, h.status, h.previous_status,
	       row_number() OVER (PARTITION BY h.group_uid, h.asset_uid ORDER BY h.time) AS n
	FROM iot_data.asset_state_history h
	INNER JOIN a ON a.group_uid = h.group_uid AND a.asset_uid = h.asset_uid
	WHERE h.cause = 'status_change' AND h.time >= $3 AND h.time < $4
),
seq AS (
	SELECT group_uid, asset_uid, time, status, false AS inside FROM before
	UNION ALL
	SELECT i.group_uid, i.asset_uid, $3::timestamptz, i.previous_status, false FROM inside i
	WHERE i.n = 1 AND i.previous_status <> ''
	  AND NOT EXISTS (SELECT 1 FROM before b WHERE b.group_uid = i.group_uid AND b.asset_uid = i.asset_uid)
	UNION ALL
	SELECT group_uid, asset_uid, time, status, true FROM inside
)
SELECT group_uid AS "groupUid", asset_uid AS "assetUid", status, time AS "from",
       LEAD(time, 1, $4::timestamptz) OVER (PARTITION BY group_uid, asset_uid ORDER BY time) AS "to", inside
FROM seq
ORDER BY group_uid, asset_uid, time`;

const roundTo = (value: number, digits: number) => Math.round(value * 10 ** digits) / 10 ** digits;

export const getOrganizationOverview = async (
	orgId: number,
	period: OverviewPeriod,
	unavailableStatuses: string[],
	now = new Date()
): Promise<IOrganizationOverview> => {
	const { from, bucket } = periodRange(period, now);
	const fromMs = from.getTime();
	const toMs = now.getTime();
	const unavailable = unavailableSet(unavailableStatuses);

	const groupRows = await pool.query<GroupAssetRow>(
		`SELECT g.id, g.name, g.group_uid AS "groupUid", a.asset_uid AS "assetUid", a.description
		 FROM grafanadb.group g
		 LEFT JOIN grafanadb.asset a ON a.group_id = g.id AND a.context = 'asset'
		 WHERE g.org_id = $1
		 ORDER BY g.name`,
		[orgId]
	);
	const groupUids = [...new Set(groupRows.rows.map((r) => r.groupUid))];
	const states = groupUids.length
		? await timescaledbReadQuery<StateRow>(
				`SELECT group_uid AS "groupUid", asset_uid AS "assetUid", history_status_changes AS history, last_updated AS "lastUpdated",
				        state->>'status' AS status
				 FROM iot_data.assetState WHERE group_uid = ANY($1::text[])`,
				[groupUids]
		  )
		: { rows: [] as StateRow[] };
	const key = (g: string, a: string) => `${g}|${a}`;
	const stateOf = new Map(states.rows.map((s) => [key(s.groupUid, s.assetUid), s]));
	const withHistory = groupRows.rows
		.filter((r): r is GroupAssetRow & { assetUid: string } => !!r.assetUid)
		.filter((r) => stateOf.get(key(r.groupUid, r.assetUid))?.history === true);

	const resourcesRead = getOverviewResources(orgId, from);
	const [spans, raised, acks, active, pending, top] = await Promise.all([
		withHistory.length
			? timescaledbReadQuery<SpanRow>(STATUS_SPANS_SQL, [
					withHistory.map((r) => r.groupUid),
					withHistory.map((r) => r.assetUid),
					from,
					now,
			  ])
			: Promise.resolve({ rows: [] as SpanRow[] }),
		timescaledbReadQuery<{ groupId: number; bucket: Date; level: string; n: number }>(
			`SELECT group_id AS "groupId", date_trunc($3, time, 'UTC') AS bucket, level, count(*)::int AS n
			 FROM iot_data.alarm WHERE org_id = $1 AND time >= $2 AND event = 'raised'
			 GROUP BY 1, 2, 3`,
			[orgId, from, bucket]
		),
		timescaledbReadQuery<{ groupId: number; seconds: number; n: number }>(
			`SELECT group_id AS "groupId", sum(extract(epoch FROM ack_at - raised_at))::float8 AS seconds, count(*)::int AS n
			 FROM iot_data.alarm
			 WHERE org_id = $1 AND time >= $2 AND event = 'acknowledged' AND ack_at IS NOT NULL AND raised_at IS NOT NULL
			   AND ack_at >= raised_at
			 GROUP BY 1`,
			[orgId, from]
		),
		timescaledbReadQuery<{ groupId: number; level: string; n: number }>(
			`SELECT "groupId", level, count(*)::int AS n FROM (
				SELECT DISTINCT ON (node_uid, alarm_key) group_id AS "groupId", level, state
				FROM iot_data.alarm WHERE org_id = $1 AND time >= NOW() - make_interval(days => $2)
				ORDER BY node_uid, alarm_key, time DESC
			) latest WHERE state <> 'normal' GROUP BY 1, 2`,
			[orgId, ACTIVE_DAYS]
		),
		timescaledbReadQuery<{ groupId: number; n: number }>(
			`SELECT "groupId", count(*)::int AS n FROM (
				SELECT DISTINCT ON (request_id) group_id AS "groupId", event, expires_at
				FROM iot_data.approval WHERE org_id = $1 AND time >= NOW() - make_interval(days => $2)
				ORDER BY request_id, time DESC
			) latest WHERE event = 'requested' AND (expires_at IS NULL OR expires_at > NOW()) GROUP BY 1`,
			[orgId, ACTIVE_DAYS]
		),
		timescaledbReadQuery<{ groupId: number; name: string; asset: string; node: string; n: number }>(
			`SELECT group_id AS "groupId", max(alarm_name) AS name, max(asset_description) AS asset, max(node_name) AS node, count(*)::int AS n
			 FROM iot_data.alarm WHERE org_id = $1 AND time >= $2 AND event = 'raised'
			 GROUP BY group_id, node_uid, alarm_key
			 ORDER BY n DESC, name
			 LIMIT $3`,
			[orgId, from, TOP_ALARMS]
		),
	]);

	// the spans of each asset, and whether its state was written in the period
	const spansOf = new Map<string, StatusSpan[]>();
	const changedInPeriod = new Set<string>();
	for (const s of spans.rows) {
		const k = key(s.groupUid, s.assetUid);
		const list = spansOf.get(k) ?? [];
		list.push({ status: s.status ?? "", from: new Date(s.from).getTime(), to: new Date(s.to).getTime() });
		spansOf.set(k, list);
		if (s.inside) changedInPeriod.add(k);
	}
	// written in the period without a change of status since the history is on: its current status all along
	for (const r of withHistory) {
		const k = key(r.groupUid, r.assetUid);
		const st = stateOf.get(k);
		if (spansOf.has(k) || !st?.lastUpdated || new Date(st.lastUpdated).getTime() < fromMs || !st.status) continue;
		spansOf.set(k, [{ status: st.status, from: fromMs, to: toMs }]);
	}
	const isActive = (g: string, a: string): boolean => {
		const k = key(g, a);
		if (changedInPeriod.has(k)) return true;
		const last = stateOf.get(k)?.lastUpdated;
		return !!last && new Date(last).getTime() >= fromMs && spansOf.has(k);
	};

	const buckets = bucketsOf(fromMs, toMs, bucket);
	const seriesAlarms = buckets.map(() => ({} as Record<string, number>));
	const bucketIndex = new Map(buckets.map((b, i) => [b.start, i]));

	const groupsById = new Map<number, { name: string; groupUid: string; assets: string[] }>();
	for (const r of groupRows.rows) {
		const g = groupsById.get(r.id) ?? { name: r.name, groupUid: r.groupUid, assets: [] };
		if (r.assetUid) g.assets.push(r.assetUid);
		groupsById.set(r.id, g);
	}
	const raisedOf = new Map<number, number>();
	for (const r of raised.rows) {
		raisedOf.set(Number(r.groupId), (raisedOf.get(Number(r.groupId)) ?? 0) + r.n);
		const i = bucketIndex.get(new Date(r.bucket).getTime());
		if (i !== undefined) seriesAlarms[i][r.level || "Alarm"] = (seriesAlarms[i][r.level || "Alarm"] ?? 0) + r.n;
	}
	const ackOf = new Map(acks.rows.map((r) => [Number(r.groupId), r]));
	const activeOf = new Map<number, Record<string, number>>();
	for (const r of active.rows) {
		const levels = activeOf.get(Number(r.groupId)) ?? {};
		levels[r.level || "Alarm"] = (levels[r.level || "Alarm"] ?? 0) + r.n;
		activeOf.set(Number(r.groupId), levels);
	}
	const pendingOf = new Map(pending.rows.map((r) => [Number(r.groupId), r.n]));

	const periodSeconds = (toMs - fromMs) / 1000;
	const activeSpans: StatusSpan[][] = [];
	const totals = {
		groups: groupsById.size,
		assets: 0,
		assetsWithHistory: 0,
		inactiveAssets: 0,
		known: 0,
		available: 0,
		failures: 0,
		repairs: 0,
		repairSeconds: 0,
		alarmsRaised: 0,
		ackSeconds: 0,
		acks: 0,
		activeAlarmsByLevel: {} as Record<string, number>,
		approvalsPending: 0,
	};

	const groups: IOverviewGroup[] = [...groupsById.entries()].map(([id, g]) => {
		let known = 0;
		let available = 0;
		let failures = 0;
		let repairs = 0;
		let repairSeconds = 0;
		let inactive = 0;
		let historyCount = 0;
		let noData = 0;
		const byStatus: Record<string, number> = {};
		for (const assetUid of g.assets) {
			if (stateOf.get(key(g.groupUid, assetUid))?.history !== true) continue;
			historyCount++;
			if (!isActive(g.groupUid, assetUid)) {
				inactive++;
				noData += periodSeconds;
				continue;
			}
			const spansOfAsset = spansOf.get(key(g.groupUid, assetUid)) ?? [];
			activeSpans.push(spansOfAsset);
			const a = availabilityOf(spansOfAsset, unavailable, fromMs, toMs);
			known += a.known;
			available += a.available;
			failures += a.failures;
			repairs += a.repairs;
			repairSeconds += a.repairSeconds;
			noData += Math.max(0, periodSeconds - a.known);
			for (const [status, seconds] of Object.entries(a.byStatus))
				byStatus[status] = (byStatus[status] ?? 0) + seconds;
		}
		const sorted = Object.entries(byStatus).sort((x, y) => y[1] - x[1]);
		const statusTime = sorted
			.slice(0, MAX_STATUSES_SHOWN)
			.map(([status, seconds]) => ({ status, seconds: Math.round(seconds) }));
		const rest = sorted.slice(MAX_STATUSES_SHOWN).reduce((s, [, seconds]) => s + seconds, 0);
		if (rest > 0) statusTime.push({ status: "Other", seconds: Math.round(rest) });
		const ack = ackOf.get(id);
		const activeLevels = activeOf.get(id) ?? {};
		const activeCount = Object.values(activeLevels).reduce((s, n) => s + n, 0);

		totals.assets += g.assets.length;
		totals.assetsWithHistory += historyCount;
		totals.inactiveAssets += inactive;
		totals.known += known;
		totals.available += available;
		totals.failures += failures;
		totals.repairs += repairs;
		totals.repairSeconds += repairSeconds;
		totals.alarmsRaised += raisedOf.get(id) ?? 0;
		totals.ackSeconds += ack?.seconds ?? 0;
		totals.acks += ack?.n ?? 0;
		for (const [level, n] of Object.entries(activeLevels))
			totals.activeAlarmsByLevel[level] = (totals.activeAlarmsByLevel[level] ?? 0) + n;
		totals.approvalsPending += pendingOf.get(id) ?? 0;

		return {
			id,
			name: g.name,
			assets: g.assets.length,
			assetsWithHistory: historyCount,
			inactiveAssets: inactive,
			availability: known > 0 ? roundTo(available / known, 5) : null,
			mtbfHours: failures > 0 ? roundTo(available / failures / 3600, 2) : null,
			mttrHours: repairs > 0 ? roundTo(repairSeconds / repairs / 3600, 2) : null,
			failures,
			alarmsRaised: raisedOf.get(id) ?? 0,
			mttaMinutes: ack && ack.n > 0 ? roundTo(ack.seconds / ack.n / 60, 1) : null,
			activeAlarms: activeCount,
			activeAlarmsByLevel: activeLevels,
			approvalsPending: pendingOf.get(id) ?? 0,
			statusTime,
			noDataSeconds: Math.round(noData),
			...emptyResources(),
		};
	});

	const availabilitySeries = availabilityByBucket(activeSpans, unavailable, buckets, toMs);
	const resources = await resourcesRead;
	for (const g of groups) Object.assign(g, resources.byGroup.get(g.id) ?? emptyResources());
	const s3Totals = groups.reduce(
		(t, g) => ({
			folders: t.folders + g.s3.folders,
			bytes: t.bytes + g.s3.bytes,
			lastStorage:
				g.s3.lastStorage && (!t.lastStorage || g.s3.lastStorage > t.lastStorage)
					? g.s3.lastStorage
					: t.lastStorage,
		}),
		{ folders: 0, bytes: 0, lastStorage: null as string | null }
	);
	const pipelineTotals = groups.reduce(
		(t, g) => ({
			deployed: t.deployed + g.pipelines.deployed,
			failures: t.failures + g.pipelines.failures,
			nodeErrors: t.nodeErrors + g.pipelines.nodeErrors,
		}),
		{ deployed: 0, failures: 0, nodeErrors: 0 }
	);
	const groupName = new Map(groups.map((g) => [g.id, g.name]));

	return {
		orgId,
		period,
		from: from.toISOString(),
		to: now.toISOString(),
		bucket,
		unavailableStatuses,
		totals: {
			groups: totals.groups,
			assets: totals.assets,
			assetsWithHistory: totals.assetsWithHistory,
			inactiveAssets: totals.inactiveAssets,
			availability: totals.known > 0 ? roundTo(totals.available / totals.known, 5) : null,
			mtbfHours: totals.failures > 0 ? roundTo(totals.available / totals.failures / 3600, 2) : null,
			mttrHours: totals.repairs > 0 ? roundTo(totals.repairSeconds / totals.repairs / 3600, 2) : null,
			failures: totals.failures,
			alarmsRaised: totals.alarmsRaised,
			mttaMinutes: totals.acks > 0 ? roundTo(totals.ackSeconds / totals.acks / 60, 1) : null,
			activeAlarms: Object.values(totals.activeAlarmsByLevel).reduce((s, n) => s + n, 0),
			activeAlarmsByLevel: totals.activeAlarmsByLevel,
			approvalsPending: totals.approvalsPending,
			s3: s3Totals,
			pipelines: pipelineTotals,
		},
		ai: resources.ai,
		pipelineLogDays: resources.pipelineLogDays,
		groups,
		series: buckets.map((b, i) => {
			const availability = availabilitySeries[i];
			return {
				start: new Date(b.start).toISOString(),
				availability: availability === null ? null : roundTo(availability, 5),
				alarms: seriesAlarms[i],
			};
		}),
		topAlarms: top.rows.map((r) => ({
			groupId: Number(r.groupId),
			group: groupName.get(Number(r.groupId)) ?? "",
			name: r.name ?? "",
			asset: r.asset ?? "",
			node: r.node ?? "",
			count: r.n,
		})),
	};
};

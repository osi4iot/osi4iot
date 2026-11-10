// The history of the alarms and approvals in the IoT database (patroni_metrics, iot_data_db): the hypertables
// iot_data.alarm and iot_data.approval, one row per event, written by pipelines (iotdb/history.go) and kept
// HISTORY_RETENTION_DAYS. The clusters created from now on get them from
// patroni_metrics/templates/init_metrics.sql.template (run once, when the cluster is bootstrapped); the
// existing ones from ensureEventHistoryTables, at admin_api's start: these statements must say the same as
// the template.
import timescaledb_pool from "../../config/timescaledb_config";
import { logger } from "../../config/winston";

export const HISTORY_RETENTION_DAYS = 730;

// The rows shown in the table at most (newest first) and exported at most (oldest first)
export const HISTORY_LIST_MAX_ROWS = 10000;
export const HISTORY_EXPORT_MAX_ROWS = 200000;

export interface IHistoryFilter {
	groupId: number;
	from: Date;
	to: Date;
	digitalTwinId?: number;
}

// The WHERE of a filter, with its parameters
export const historyWhere = (f: IHistoryFilter): { sql: string; params: unknown[] } => {
	const params: unknown[] = [f.groupId, f.from, f.to];
	let sql = "group_id = $1 AND time >= $2 AND time < $3";
	if (f.digitalTwinId) {
		params.push(f.digitalTwinId);
		sql += ` AND digital_twin_id = $${params.length}`;
	}
	return { sql, params };
};

// As in init_metrics.sql.template (all of them can run again: IF NOT EXISTS / if_not_exists)
export const EVENT_HISTORY_DDL: string[] = [
	`CREATE TABLE IF NOT EXISTS iot_data.alarm (
	    time                     TIMESTAMPTZ   NOT NULL,
	    event_id                 UUID          NOT NULL,
	    org_id                   BIGINT        NOT NULL,
	    group_id                 BIGINT        NOT NULL,
	    group_uid                VARCHAR(42)   NOT NULL DEFAULT '',
	    asset_id                 BIGINT,
	    asset_uid                VARCHAR(42)   NOT NULL DEFAULT '',
	    asset_description        VARCHAR(190)  NOT NULL DEFAULT '',
	    digital_twin_id          BIGINT,
	    digital_twin_uid         VARCHAR(40)   NOT NULL DEFAULT '',
	    digital_twin_description VARCHAR(190)  NOT NULL DEFAULT '',
	    node_uid                 VARCHAR(40)   NOT NULL,
	    node_name                VARCHAR(190)  NOT NULL DEFAULT '',
	    alarm_name               VARCHAR(190)  NOT NULL DEFAULT '',
	    alarm_key                VARCHAR(255)  NOT NULL DEFAULT '',
	    event                    VARCHAR(20)   NOT NULL,
	    level                    VARCHAR(10)   NOT NULL DEFAULT '',
	    state                    VARCHAR(20)   NOT NULL DEFAULT '',
	    shelved                  BOOLEAN       NOT NULL DEFAULT FALSE,
	    raised_at                TIMESTAMPTZ,
	    value                    JSONB,
	    threshold                VARCHAR(255)  NOT NULL DEFAULT '',
	    property                 VARCHAR(255)  NOT NULL DEFAULT '',
	    condition                VARCHAR(10)   NOT NULL DEFAULT '',
	    units                    VARCHAR(40)   NOT NULL DEFAULT '',
	    description              TEXT          NOT NULL DEFAULT '',
	    ack_by                   VARCHAR(190)  NOT NULL DEFAULT '',
	    ack_at                   TIMESTAMPTZ,
	    user_name                VARCHAR(190)  NOT NULL DEFAULT '',
	    message                  TEXT          NOT NULL DEFAULT '',
	    config                   JSONB,
	    event_data               JSONB,
	    trigger_topic            VARCHAR(1024) NOT NULL DEFAULT '',
	    trigger_payload          JSONB
	);`,
	`SELECT create_hypertable(
	    'iot_data.alarm', 'time',
	    chunk_time_interval => INTERVAL '30 days',
	    if_not_exists       => TRUE
	);`,
	`CREATE UNIQUE INDEX IF NOT EXISTS idx_alarm_event_id ON iot_data.alarm (event_id, time);`,
	`CREATE INDEX IF NOT EXISTS idx_alarm_group_time ON iot_data.alarm (group_id, time DESC);`,
	`CREATE INDEX IF NOT EXISTS idx_alarm_occurrence ON iot_data.alarm (node_uid, alarm_key, raised_at);`,
	`SELECT add_retention_policy(
	    'iot_data.alarm',
	    drop_after    => INTERVAL '730 days',
	    if_not_exists => TRUE
	);`,
	`CREATE TABLE IF NOT EXISTS iot_data.approval (
	    time                     TIMESTAMPTZ   NOT NULL,
	    event_id                 UUID          NOT NULL,
	    org_id                   BIGINT        NOT NULL,
	    group_id                 BIGINT        NOT NULL,
	    group_uid                VARCHAR(42)   NOT NULL DEFAULT '',
	    asset_id                 BIGINT,
	    asset_uid                VARCHAR(42)   NOT NULL DEFAULT '',
	    asset_description        VARCHAR(190)  NOT NULL DEFAULT '',
	    digital_twin_id          BIGINT,
	    digital_twin_uid         VARCHAR(40)   NOT NULL DEFAULT '',
	    digital_twin_description VARCHAR(190)  NOT NULL DEFAULT '',
	    node_uid                 VARCHAR(40)   NOT NULL,
	    node_name                VARCHAR(190)  NOT NULL DEFAULT '',
	    request_id               VARCHAR(40)   NOT NULL,
	    event                    VARCHAR(20)   NOT NULL,
	    title                    TEXT          NOT NULL DEFAULT '',
	    detail                   TEXT          NOT NULL DEFAULT '',
	    channel                  VARCHAR(20)   NOT NULL DEFAULT '',
	    requested_at             TIMESTAMPTZ   NOT NULL,
	    expires_at               TIMESTAMPTZ,
	    decided_at               TIMESTAMPTZ,
	    decided_by               VARCHAR(190)  NOT NULL DEFAULT '',
	    via                      VARCHAR(20)   NOT NULL DEFAULT '',
	    comment                  TEXT          NOT NULL DEFAULT '',
	    wait_seconds             DOUBLE PRECISION,
	    trigger_topic            VARCHAR(1024) NOT NULL DEFAULT '',
	    trigger_payload          JSONB
	);`,
	`SELECT create_hypertable(
	    'iot_data.approval', 'time',
	    chunk_time_interval => INTERVAL '30 days',
	    if_not_exists       => TRUE
	);`,
	`CREATE UNIQUE INDEX IF NOT EXISTS idx_approval_event_id ON iot_data.approval (event_id, time);`,
	`CREATE INDEX IF NOT EXISTS idx_approval_group_time ON iot_data.approval (group_id, time DESC);`,
	`CREATE INDEX IF NOT EXISTS idx_approval_request ON iot_data.approval (request_id);`,
	`SELECT add_retention_policy(
	    'iot_data.approval',
	    drop_after    => INTERVAL '730 days',
	    if_not_exists => TRUE
	);`
];

// The retention policy of a hypertable, set to the interval if it has another one (add_retention_policy with
// if_not_exists does not change an existing policy). Answers whether it changed it.
export const ensureRetentionPolicy = async (table: string, days: number): Promise<boolean> => {
	const [schema, name] = table.split(".");
	const result = await timescaledb_pool.query(
		`SELECT config->>'drop_after' AS "dropAfter" FROM timescaledb_information.jobs
		WHERE proc_name = 'policy_retention' AND hypertable_schema = $1 AND hypertable_name = $2`,
		[schema, name]
	);
	const current = result.rows[0]?.dropAfter as string | undefined;
	if (current === `${days} days`) return false;
	await timescaledb_pool.query("SELECT remove_retention_policy($1::regclass, if_exists => TRUE)", [table]);
	await timescaledb_pool.query("SELECT add_retention_policy($1::regclass, drop_after => make_interval(days => $2))", [
		table,
		days,
	]);
	logger.log("info", `Retention of ${table}: ${current ?? "none"} -> ${days} days`);
	return true;
};

// The history tables of a cluster created before them, and the retention of the LLM usage (2 years).
export const ensureEventHistoryTables = async (llmUsageRetentionDays: number): Promise<void> => {
	for (const statement of EVENT_HISTORY_DDL) {
		await timescaledb_pool.query(statement);
	}
	await ensureRetentionPolicy("iot_data.alarm", HISTORY_RETENTION_DAYS);
	await ensureRetentionPolicy("iot_data.approval", HISTORY_RETENTION_DAYS);
	await ensureRetentionPolicy("iot_data.llm_usage", llmUsageRetentionDays);
};

// [from, to) in UTC from two days (YYYY-MM-DD), both included; by default the last 30 days. Null when they
// are not days, from is after to, or they are more than the retention apart.
export const historyRange = (fromDay: unknown, toDay: unknown, now = new Date()): { from: Date; to: Date } | null => {
	const day = (value: unknown): Date | null => {
		if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
		const date = new Date(`${value}T00:00:00Z`);
		return Number.isNaN(date.getTime()) ? null : date;
	};
	const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
	const dayMs = 24 * 3600 * 1000;
	const toIncluded = toDay === undefined || toDay === "" ? today : day(toDay);
	const from = fromDay === undefined || fromDay === "" ? new Date(today.getTime() - 29 * dayMs) : day(fromDay);
	if (!from || !toIncluded) return null;
	const to = new Date(toIncluded.getTime() + dayMs);
	if (to <= from || to.getTime() - from.getTime() > (HISTORY_RETENTION_DAYS + 1) * dayMs) return null;
	return { from, to };
};

// A CSV cell: objects as JSON, dates as ISO, quoted when needed (RFC 4180)
const csvCell = (value: unknown): string => {
	if (value === null || value === undefined) return "";
	let text: string;
	if (value instanceof Date) text = value.toISOString();
	else if (typeof value === "object") text = JSON.stringify(value);
	else text = String(value);
	return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export const toCsv = (rows: Record<string, unknown>[], columns: string[]): string =>
	[columns.join(","), ...rows.map((row) => columns.map((c) => csvCell(row[c])).join(","))].join("\r\n") + "\r\n";

// The filter of a request: ?from=YYYY-MM-DD&to=YYYY-MM-DD&digitalTwinId=n (a text with what is wrong otherwise)
export const historyFilterOf = (groupId: number, query: Record<string, unknown>): IHistoryFilter | string => {
	const range = historyRange(query.from, query.to);
	if (!range) {
		return `from and to must be days (YYYY-MM-DD), from not after to, at most ${HISTORY_RETENTION_DAYS} days apart`;
	}
	const filter: IHistoryFilter = { groupId, ...range };
	if (query.digitalTwinId !== undefined && query.digitalTwinId !== "") {
		const id = Number(query.digitalTwinId);
		if (!Number.isInteger(id) || id <= 0) return "digitalTwinId must be a digital twin id";
		filter.digitalTwinId = id;
	}
	return filter;
};

// The rows of a list request (?limit=n): by default and at most HISTORY_LIST_MAX_ROWS
export const historyLimitOf = (value: unknown): number => {
	const n = Number(value);
	return Number.isInteger(n) && n > 0 ? Math.min(n, HISTORY_LIST_MAX_ROWS) : HISTORY_LIST_MAX_ROWS;
};

// The panels of the Viewer page (active alarms, pending approvals): the latest event of each alarm or request
// of the last `days` days (by default PANEL_DAYS), of a digital twin or of the whole group
export const PANEL_DAYS = 30;
export const PANEL_MAX_ROWS = 200;

export interface IPanelFilter {
	groupId: number;
	days: number;
	digitalTwinId?: number;
}

export const panelFilterOf = (groupId: number, query: Record<string, unknown>): IPanelFilter | string => {
	const filter: IPanelFilter = { groupId, days: PANEL_DAYS };
	if (query.days !== undefined && query.days !== "") {
		const days = Number(query.days);
		if (!Number.isInteger(days) || days < 1 || days > HISTORY_RETENTION_DAYS) {
			return `days must be a whole number from 1 to ${HISTORY_RETENTION_DAYS}`;
		}
		filter.days = days;
	}
	if (query.digitalTwinId !== undefined && query.digitalTwinId !== "") {
		const id = Number(query.digitalTwinId);
		if (!Number.isInteger(id) || id <= 0) return "digitalTwinId must be a digital twin id";
		filter.digitalTwinId = id;
	}
	return filter;
};

// The WHERE of a panel filter, with its parameters
export const panelWhere = (f: IPanelFilter): { sql: string; params: unknown[] } => {
	const params: unknown[] = [f.groupId, f.days];
	let sql = "group_id = $1 AND time >= NOW() - make_interval(days => $2)";
	if (f.digitalTwinId) {
		params.push(f.digitalTwinId);
		sql += ` AND digital_twin_id = $${params.length}`;
	}
	return { sql, params };
};

export const EVENT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The history of a group goes with it (deleted group), and that of all the groups of a deleted organization.
// A failure is logged and does not stop the deletion (the rows would go anyway with the retention).
const deleteHistoryWhere = async (column: "group_id" | "org_id", id: number, what: string): Promise<void> => {
	for (const table of ["iot_data.alarm", "iot_data.approval"]) {
		try {
			await timescaledb_pool.query(`DELETE FROM ${table} WHERE ${column} = $1`, [id]);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			logger.log("error", `The history of ${what} could not be deleted from ${table}: ${message}`);
		}
	}
};

export const deleteHistoryOfGroup = (groupId: number): Promise<void> => deleteHistoryWhere("group_id", groupId, `group ${groupId}`);

export const deleteHistoryOfOrg = (orgId: number): Promise<void> => deleteHistoryWhere("org_id", orgId, `organization ${orgId}`);

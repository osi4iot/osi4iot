// The history of the Approval nodes of a group: the table iot_data.approval of the IoT database (one row per event,
// see utils/eventHistory/eventHistory.ts).
import { timescaledbReadQuery } from "../../config/timescaledb_config";
import {
	historyWhere,
	IHistoryFilter,
	IPanelFilter,
	PANEL_MAX_ROWS,
	panelWhere,
} from "../../utils/eventHistory/eventHistory";

// What the table shows: no copy of the message, no settings (they are in the detail and the export)
const LIST_COLUMNS = `time, event_id AS "eventId", digital_twin_id AS "digitalTwinId",
	digital_twin_uid AS "digitalTwinUid", digital_twin_description AS "digitalTwinDescription",
	asset_uid AS "assetUid", asset_description AS "assetDescription", node_uid AS "nodeUid", node_name AS "nodeName",
	request_id AS "requestId", event, title, detail, channel, requested_at AS "requestedAt",
	expires_at AS "expiresAt", decided_at AS "decidedAt", decided_by AS "decidedBy", via, comment,
	wait_seconds AS "waitSeconds"`;

const DETAIL_COLUMNS = `${LIST_COLUMNS}, trigger_topic AS "triggerTopic", trigger_payload AS "triggerPayload"`;

// The columns of the export, as in the table (for training: the same names as in the database)
export const APPROVAL_EXPORT_COLUMNS = [
	"time", "event_id", "org_id", "group_id", "group_uid", "asset_id", "asset_uid", "asset_description",
	"digital_twin_id", "digital_twin_uid", "digital_twin_description", "node_uid", "node_name", "request_id",
	"event", "title", "detail", "channel", "requested_at", "expires_at", "decided_at", "decided_by", "via",
	"comment", "wait_seconds", "trigger_topic", "trigger_payload",
];

// The events of the range, newest first, at most limit (and whether there were more)
export const getApprovalHistory = async (f: IHistoryFilter, limit: number): Promise<{ rows: any[]; truncated: boolean }> => {
	const w = historyWhere(f);
	const result = await timescaledbReadQuery(
		`SELECT ${LIST_COLUMNS} FROM iot_data.approval WHERE ${w.sql} ORDER BY time DESC LIMIT ${limit + 1}`,
		w.params
	);
	return { rows: result.rows.slice(0, limit), truncated: result.rows.length > limit };
};

// One event, with the copy of the message that caused it
export const getApprovalEvent = async (groupId: number, eventId: string): Promise<any | null> => {
	const result = await timescaledbReadQuery(
		`SELECT ${DETAIL_COLUMNS} FROM iot_data.approval WHERE group_id = $1 AND event_id = $2 LIMIT 1`,
		[groupId, eventId]
	);
	return result.rows[0] ?? null;
};

// All the columns of the events of the range, oldest first (at most limit)
export const exportApprovalHistory = async (f: IHistoryFilter, limit: number): Promise<any[]> => {
	const w = historyWhere(f);
	const result = await timescaledbReadQuery(
		`SELECT ${APPROVAL_EXPORT_COLUMNS.join(", ")} FROM iot_data.approval WHERE ${w.sql} ORDER BY time LIMIT ${limit}`,
		w.params
	);
	return result.rows;
};

// The requests still waiting: the latest event of each request of the period is "requested" and it has not
// expired (a pipeline that stopped leaves requests without a decision: they expire with their time)
export const getPendingApprovals = async (f: IPanelFilter): Promise<any[]> => {
	const w = panelWhere(f);
	const result = await timescaledbReadQuery(
		`SELECT * FROM (
			SELECT DISTINCT ON (request_id) ${LIST_COLUMNS}
			FROM iot_data.approval WHERE ${w.sql}
			ORDER BY request_id, time DESC
		) AS latest
		WHERE event = 'requested' AND ("expiresAt" IS NULL OR "expiresAt" > NOW())
		ORDER BY "requestedAt" DESC
		LIMIT ${PANEL_MAX_ROWS}`,
		w.params
	);
	return result.rows;
};

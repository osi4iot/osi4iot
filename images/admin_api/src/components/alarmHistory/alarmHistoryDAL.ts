// The history of the Alarm nodes of a group: the table iot_data.alarm of the IoT database (one row per event,
// see utils/eventHistory/eventHistory.ts).
import { timescaledbReadQuery } from "../../config/timescaledb_config";
import { historyWhere, IHistoryFilter } from "../../utils/eventHistory/eventHistory";

// What the table shows: no copy of the message, no settings (they are in the detail and the export)
const LIST_COLUMNS = `time, event_id AS "eventId", digital_twin_id AS "digitalTwinId",
	digital_twin_uid AS "digitalTwinUid", digital_twin_description AS "digitalTwinDescription",
	asset_uid AS "assetUid", asset_description AS "assetDescription", node_uid AS "nodeUid", node_name AS "nodeName",
	alarm_name AS "alarmName", alarm_key AS "alarmKey", event, level, state, shelved, raised_at AS "raisedAt",
	value, threshold, units, ack_by AS "ackBy", ack_at AS "ackAt", user_name AS "userName", message`;

const DETAIL_COLUMNS = `${LIST_COLUMNS}, property, condition, description, config, event_data AS "eventData",
	trigger_topic AS "triggerTopic", trigger_payload AS "triggerPayload"`;

// The columns of the export, as in the table (for training: the same names as in the database)
export const ALARM_EXPORT_COLUMNS = [
	"time", "event_id", "org_id", "group_id", "group_uid", "asset_id", "asset_uid", "asset_description",
	"digital_twin_id", "digital_twin_uid", "digital_twin_description", "node_uid", "node_name", "alarm_name",
	"alarm_key", "event", "level", "state", "shelved", "raised_at", "value", "threshold", "property", "condition",
	"units", "description", "ack_by", "ack_at", "user_name", "message", "config", "event_data", "trigger_topic",
	"trigger_payload",
];

// The events of the range, newest first, at most limit (and whether there were more)
export const getAlarmHistory = async (f: IHistoryFilter, limit: number): Promise<{ rows: any[]; truncated: boolean }> => {
	const w = historyWhere(f);
	const result = await timescaledbReadQuery(
		`SELECT ${LIST_COLUMNS} FROM iot_data.alarm WHERE ${w.sql} ORDER BY time DESC LIMIT ${limit + 1}`,
		w.params
	);
	return { rows: result.rows.slice(0, limit), truncated: result.rows.length > limit };
};

// One event, with the copy of the message that caused it
export const getAlarmEvent = async (groupId: number, eventId: string): Promise<any | null> => {
	const result = await timescaledbReadQuery(
		`SELECT ${DETAIL_COLUMNS} FROM iot_data.alarm WHERE group_id = $1 AND event_id = $2 LIMIT 1`,
		[groupId, eventId]
	);
	return result.rows[0] ?? null;
};

// All the columns of the events of the range, oldest first (at most limit)
export const exportAlarmHistory = async (f: IHistoryFilter, limit: number): Promise<any[]> => {
	const w = historyWhere(f);
	const result = await timescaledbReadQuery(
		`SELECT ${ALARM_EXPORT_COLUMNS.join(", ")} FROM iot_data.alarm WHERE ${w.sql} ORDER BY time LIMIT ${limit}`,
		w.params
	);
	return result.rows;
};

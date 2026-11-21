// What the pipelines of a group's digital twins logged (README, "Control room"): the Pipeline logs panel of the
// control room shows these first, then the live ones by NATS. pipelines writes every dtmlog message but the debug
// ones as a line of its output (pipelines/pipelinelog) and Vector keeps them in observability.log_entries for 7 days,
// with the uids of the group and of the dtmlog topic in metadata. Only the editors and administrators of the group
// read them (GET /control_room_logs/:groupId/:digitalTwinId): the logs tell how the pipelines work inside, the nodes'
// errors and what the AI agents answered.
import pool from "../../config/dbconfig";
import { timescaledbReadQuery } from "../../config/timescaledb_config";

// as long as observability.log_entries keeps them (its retention policy, init_metrics.sql.template)
export const PIPELINE_LOG_DAYS = 7;
// the newest, at most (the panel keeps as many: controlRoom.ts MAX_LOG_EVENTS)
export const MAX_PIPELINE_LOGS = 300;
// pipelines/pipelinelog Event
export const PIPELINE_LOG_EVENT = "pipeline_log";

// "important": the warnings and errors, and the events of the pipelines themselves (component "pipeline": created,
// started, stopped, deleted, failed; the notices of the LLM token limits). "all": also the info of the nodes.
export type PipelineLogLevels = "important" | "all";

export const pipelineLogLevelsOf = (value: unknown): PipelineLogLevels => (value === "all" ? "all" : "important");

export interface IControlRoomLog {
	at: string;
	level: string;
	component: string;
	name: string;
	message: string;
	digitalTwinId: number;
	digitalTwin: string;
	asset: string;
}

export interface IControlRoomLogs {
	days: number;
	levels: PipelineLogLevels;
	logs: IControlRoomLog[];
}

interface TwinLogTopicRow {
	id: number;
	description: string;
	asset: string;
	topicUid: string;
}

interface LogRow {
	time: Date;
	level: string;
	message: string | null;
	topicUid: string | null;
	component: string | null;
	name: string | null;
}

// zap and Vector say "warn"; the panels, as pipelines' dtmlog, "warning"
export const panelLevel = (level: string | null | undefined): string => {
	const l = (level ?? "").toLowerCase();
	return l === "warn" ? "warning" : l || "info";
};

// The query of the logs of a group. The service filter lets TimescaleDB skip the other services' compressed chunks
// (segmentby service, level); the metadata one uses the GIN index.
export const PIPELINE_LOGS_SQL = `SELECT time, level, message,
        metadata->>'topicUid' AS "topicUid", metadata->>'component' AS component, metadata->>'name' AS name
 FROM observability.log_entries
 WHERE time > NOW() - make_interval(days => $2)
   AND service LIKE '%pipelines%'
   AND metadata @> jsonb_build_object('event', $1::text, 'groupUid', $3::text)
   AND ($4::text = 'all' OR level IN ('warn', 'warning', 'error', 'fatal') OR metadata->>'component' = 'pipeline')
 ORDER BY time DESC
 LIMIT $5`;

export const getControlRoomLogs = async (
	groupId: number,
	groupUid: string,
	levels: PipelineLogLevels,
	limit = MAX_PIPELINE_LOGS
): Promise<IControlRoomLogs> => {
	const max = Math.max(1, Math.min(MAX_PIPELINE_LOGS, Math.floor(limit) || MAX_PIPELINE_LOGS));
	const [twins, rows] = await Promise.all([
		pool.query<TwinLogTopicRow>(
			`SELECT dt.id, dt.description, a.description AS asset, t.topic_uid AS "topicUid"
			 FROM grafanadb.digital_twin dt
			 INNER JOIN grafanadb.asset a ON a.id = dt.asset_id
			 INNER JOIN grafanadb.digital_twin_topic dtt ON dtt.digital_twin_id = dt.id AND dtt.topic_ref = 'dtmlog'
			 INNER JOIN grafanadb.topic t ON t.id = dtt.topic_id
			 WHERE a.group_id = $1 AND a.context = 'asset'`,
			[groupId]
		),
		timescaledbReadQuery<LogRow>(PIPELINE_LOGS_SQL, [PIPELINE_LOG_EVENT, PIPELINE_LOG_DAYS, groupUid, levels, max]),
	]);
	const twinOf = new Map(twins.rows.map((t) => [t.topicUid, t]));
	return {
		days: PIPELINE_LOG_DAYS,
		levels,
		logs: rows.rows.map((r) => {
			// a digital twin deleted since (or moved to another group): its logs stay, without it
			const twin = r.topicUid ? twinOf.get(r.topicUid) : undefined;
			return {
				at: new Date(r.time).toISOString(),
				level: panelLevel(r.level),
				component: r.component ?? "",
				name: r.name ?? "",
				message: r.message ?? "",
				digitalTwinId: twin ? Number(twin.id) : 0,
				digitalTwin: twin?.description ?? "(digital twin no longer in the group)",
				asset: twin?.asset ?? "",
			};
		}),
	};
};

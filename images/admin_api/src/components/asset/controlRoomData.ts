// What the panels of a group's control room show (controlRoom.ts): every real asset of the group with its current
// state, its digital twins (with the NATS subjects where their pipelines publish their status, state2sim, and their
// log, dtmlog, only for the editors and administrators), its device topics with when each one last stored a message,
// and its S3 archives. Read by any member of the group (GET /control_room/:groupId/:digitalTwinId); the live parts
// (pipeline status, logs, changes of the states) come by NATS to the panels; the logs of the last days,
// controlRoomLogs.ts.
import pool from "../../config/dbconfig";
import timescaledb_pool from "../../config/timescaledb_config";

// how far back the last message of a topic is looked for (older: "no data in that time")
export const LAST_DATA_DAYS = 7;
// the last messages of a group's topics (the only heavy part) are kept this long: several panels and viewers ask at
// once; the states are always read fresh (the panels read again when pipelines says one changed)
const LAST_DATA_CACHE_MS = 15_000;

export interface IControlRoomDevice {
	topicRef: string;
	topicType: string;
	lastMessage: string | null;
}

export interface IControlRoomDigitalTwin {
	id: number;
	digitalTwinUid: string;
	description: string;
	type: string;
	hasPipeline: boolean;
	statusSubject: string;
	logSubject: string;
}

export interface IControlRoomAsset {
	id: number;
	assetUid: string;
	description: string;
	assetType: string;
	state: Record<string, unknown>;
	lastUpdated: string | null;
	lastData: string | null;
	devices: IControlRoomDevice[];
	digitalTwins: IControlRoomDigitalTwin[];
	s3: { folders: number; bytes: number; lastStorage: string | null };
}

export interface IControlRoomData {
	context: "group";
	groupId: number;
	groupUid: string;
	lastDataDays: number;
	// the user may see the pipeline logs (an editor or administrator of the group): else no logSubject
	canSeeLogs: boolean;
	assets: IControlRoomAsset[];
}

interface AssetRow {
	id: number;
	assetUid: string;
	description: string;
	assetType: string;
}

interface TopicRow {
	assetId: number;
	topicRef: string;
	topicType: string;
	topicUid: string;
}

interface TwinRow {
	id: number;
	assetId: number;
	digitalTwinUid: string;
	description: string;
	type: string;
	hasPipeline: boolean;
	topicRef: string | null;
	topicType: string | null;
	topicUid: string | null;
}

interface S3Row {
	assetId: number;
	folders: string;
	bytes: string | null;
	lastStorage: Date | null;
}

interface StateRow {
	assetUid: string;
	state: Record<string, unknown> | null;
	lastUpdated: Date | null;
}

interface LastRow {
	topicUid: string;
	last: Date | null;
}

const iso = (d: Date | string | null | undefined): string | null => (d ? new Date(d).toISOString() : null);

// the NATS subject of a topic, as pipelines names it
export const natsSubject = (topicType: string, groupUid: string, topicUid: string): string =>
	`${topicType}.Group_${groupUid}.Topic_${topicUid}`;

// device topics: what devices send (their last message says whether they are connected)
const DEVICE_TOPIC_TYPES = ["dev2pdb", "dev2pdb_wt", "dev2pdb_ma", "dev2dtm"];

const lastDataCache = new Map<string, { at: number; last: Map<string, string | null> }>();

// the last message of each topic in the last days (one index lookup per topic)
const lastMessages = async (groupUid: string, topicUids: string[]): Promise<Map<string, string | null>> => {
	const key = `${groupUid}|${topicUids.join(",")}`;
	const cached = lastDataCache.get(key);
	if (cached && Date.now() - cached.at < LAST_DATA_CACHE_MS) return cached.last;
	const result = topicUids.length
		? await timescaledb_pool.query<LastRow>(
				`SELECT u.topic_uid AS "topicUid",
				        (SELECT d.timestamp FROM iot_data.thingData d
				         WHERE d.group_uid = $1 AND d.topic_uid = u.topic_uid
				           AND d.timestamp > NOW() - make_interval(days => $3)
				         ORDER BY d.timestamp DESC LIMIT 1) AS last
				 FROM unnest($2::text[]) AS u(topic_uid)`,
				[groupUid, topicUids, LAST_DATA_DAYS]
		  )
		: { rows: [] as LastRow[] };
	const last = new Map(result.rows.map((r) => [r.topicUid, iso(r.last)]));
	if (lastDataCache.size > 500) lastDataCache.clear();
	lastDataCache.set(key, { at: Date.now(), last });
	return last;
};

export const getControlRoomData = async (groupId: number, groupUid: string, canSeeLogs = false): Promise<IControlRoomData> => {
	const assets = await pool.query<AssetRow>(
		`SELECT a.id, a.asset_uid AS "assetUid", a.description, t.type AS "assetType"
		 FROM grafanadb.asset a INNER JOIN grafanadb.asset_type t ON t.id = a.asset_type_id
		 WHERE a.group_id = $1 AND a.context = 'asset'
		 ORDER BY a.description`,
		[groupId]
	);
	const assetIds = assets.rows.map((a) => a.id);
	const [topics, twins, s3, states] = await Promise.all([
		pool.query<TopicRow>(
			`SELECT at.asset_id AS "assetId", at.topic_ref AS "topicRef", t.topic_type AS "topicType", t.topic_uid AS "topicUid"
			 FROM grafanadb.asset_topic at INNER JOIN grafanadb.topic t ON t.id = at.topic_id
			 WHERE at.asset_id = ANY($1::bigint[]) AND t.topic_type = ANY($2::text[])
			 ORDER BY at.topic_ref`,
			[assetIds, DEVICE_TOPIC_TYPES]
		),
		pool.query<TwinRow>(
			`SELECT dt.id, dt.asset_id AS "assetId", dt.digital_twin_uid AS "digitalTwinUid", dt.description, dt.type,
			        (dt.pipeline_file_data <> '') AS "hasPipeline",
			        dtt.topic_ref AS "topicRef", t.topic_type AS "topicType", t.topic_uid AS "topicUid"
			 FROM grafanadb.digital_twin dt
			 LEFT JOIN grafanadb.digital_twin_topic dtt ON dtt.digital_twin_id = dt.id AND dtt.topic_ref IN ('state2sim', 'dtmlog')
			 LEFT JOIN grafanadb.topic t ON t.id = dtt.topic_id
			 WHERE dt.asset_id = ANY($1::bigint[])
			 ORDER BY dt.description`,
			[assetIds]
		),
		pool.query<S3Row>(
			`SELECT asset_id AS "assetId", count(*) AS folders, sum(parquet_total_bytes) AS bytes, max(last_s3_storage) AS "lastStorage"
			 FROM grafanadb.s3_folder WHERE asset_id = ANY($1::bigint[]) AND is_current GROUP BY asset_id`,
			[assetIds]
		),
		timescaledb_pool.query<StateRow>(
			`SELECT asset_uid AS "assetUid", state, last_updated AS "lastUpdated" FROM iot_data.assetState WHERE group_uid = $1`,
			[groupUid]
		),
	]);

	const lastOf = await lastMessages(
		groupUid,
		topics.rows.map((t) => t.topicUid)
	);
	const stateOf = new Map(states.rows.map((r) => [r.assetUid, r]));
	const s3Of = new Map(s3.rows.map((r) => [Number(r.assetId), r]));

	const data: IControlRoomData = {
		context: "group",
		groupId,
		groupUid,
		lastDataDays: LAST_DATA_DAYS,
		canSeeLogs,
		assets: assets.rows.map((a) => {
			const devices = topics.rows
				.filter((t) => Number(t.assetId) === Number(a.id))
				.map((t) => ({ topicRef: t.topicRef, topicType: t.topicType, lastMessage: lastOf.get(t.topicUid) ?? null }));
			const lastData = devices.reduce<string | null>((m, d) => (d.lastMessage && (!m || d.lastMessage > m) ? d.lastMessage : m), null);
			const twinsOfAsset = new Map<number, IControlRoomDigitalTwin>();
			for (const t of twins.rows.filter((row) => Number(row.assetId) === Number(a.id))) {
				const twin = twinsOfAsset.get(t.id) ?? {
					id: Number(t.id),
					digitalTwinUid: t.digitalTwinUid,
					description: t.description,
					type: t.type,
					hasPipeline: !!t.hasPipeline,
					statusSubject: "",
					logSubject: "",
				};
				if (t.topicRef && t.topicType && t.topicUid) {
					const subject = natsSubject(t.topicType, groupUid, t.topicUid);
					if (t.topicRef === "state2sim") twin.statusSubject = subject;
					if (t.topicRef === "dtmlog" && canSeeLogs) twin.logSubject = subject;
				}
				twinsOfAsset.set(t.id, twin);
			}
			const state = stateOf.get(a.assetUid);
			const archives = s3Of.get(Number(a.id));
			return {
				id: Number(a.id),
				assetUid: a.assetUid,
				description: a.description,
				assetType: a.assetType,
				state: state?.state && typeof state.state === "object" ? state.state : {},
				lastUpdated: iso(state?.lastUpdated),
				lastData,
				devices,
				digitalTwins: [...twinsOfAsset.values()],
				s3: {
					folders: Number(archives?.folders ?? 0),
					bytes: Number(archives?.bytes ?? 0),
					lastStorage: iso(archives?.lastStorage),
				},
			};
		}),
	};
	return data;
};

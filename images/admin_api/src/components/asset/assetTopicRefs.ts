// Topic references of an asset (assetTopicsRef.json): their name says their type, because pipelines and the
// pipeline editor find them by it:
//   dev2pdb, dev2pdb_wt, dev2pdb_ma  ->  dev2pdb_1, dev2pdb_2, ...   (measurements stored in the IoT database)
//   dev2dtm                          ->  dev2dtm_1, dev2dtm_2, ...   (device -> digital twin: photos, video, audio...)
//   dtm2dev                          ->  dtm2dev_1, dtm2dev_2, ...   (digital twin -> device: commands)
// The digital twin keeps its own "dev2dtm" and "dtm2dev" (without number): a general channel (the chat's voice, tests).
import pool, { readQuery } from "../../config/dbconfig";
import natsClient from "../../config/natsConfig";
import { logger } from "../../config/winston";

// Prefix of the reference of each topic type; types without one (system...) are free
export const assetTopicRefPrefix = (topicType: string): string | null => {
	if (topicType === "dev2pdb" || topicType === "dev2pdb_wt" || topicType === "dev2pdb_ma") return "dev2pdb";
	if (topicType === "dev2dtm") return "dev2dtm";
	if (topicType === "dtm2dev") return "dtm2dev";
	return null;
};

export const DEVICE_TOPIC_TYPES = ["dev2dtm", "dtm2dev"];

interface TopicRefInput {
	topicRef: string;
	topicType: string;
}

interface SensorRefInput {
	sensorRef?: string;
	topicRef: string;
}

// What is wrong in the topics and sensors of a new asset (empty: nothing)
export const assetTopicsRefProblems = (topicsRef: TopicRefInput[], sensorsRef: SensorRefInput[] = []): string[] => {
	const problems: string[] = [];
	const seen = new Set<string>();
	for (const t of topicsRef ?? []) {
		const ref = t.topicRef;
		if (seen.has(ref)) problems.push(`Topic reference ${ref} is repeated`);
		seen.add(ref);
		const prefix = assetTopicRefPrefix(t.topicType);
		if (prefix && !new RegExp(`^${prefix}_\\d+$`).test(ref)) {
			problems.push(`Topic reference ${ref} of type ${t.topicType} must be named ${prefix}_<number> (e.g. ${prefix}_1)`);
		}
	}
	for (const s of sensorsRef ?? []) {
		if (!seen.has(s.topicRef)) {
			problems.push(`Sensor ${s.sensorRef ?? ""} uses topic reference ${s.topicRef}, which is not in the topics`.replace("  ", " "));
		}
	}
	return problems;
};

const TRACE = / · (dev2dtm|dtm2dev)_\d+ for Asset_\S+$/;

// Description of a device topic of an asset, to trace it in the topic lists: "Mobile video · dev2dtm_2 for Asset_<uid>"
export const assetTopicDescription = (topicType: string, topicRef: string, description: string, assetUid: string): string => {
	if (!DEVICE_TOPIC_TYPES.includes(topicType)) return description;
	const own = (description ?? "").replace(TRACE, "").trim();
	const trace = `${topicRef} for Asset_${assetUid}`;
	return own && own !== trace ? `${own} · ${trace}` : trace;
};

// The device topics of the existing assets named otherwise (the mobile asset had dev2pdb_5..7 for photo, video and
// audio) get the name of their type, the next free number of the asset, and the traceable description. Pipelines learn
// it through the admin events (asset_topic delete + create).
export const migrateAssetDeviceTopicRefs = async (): Promise<void> => {
	const result = await readQuery(
		`SELECT grafanadb.asset_topic.asset_id AS "assetId", grafanadb.asset_topic.topic_id AS "topicId",
			grafanadb.asset_topic.topic_ref AS "topicRef", grafanadb.topic.topic_type AS "topicType",
			grafanadb.topic.description, grafanadb.asset.asset_uid AS "assetUid", grafanadb.asset.group_id AS "groupId"
		FROM grafanadb.asset_topic
		INNER JOIN grafanadb.topic ON grafanadb.topic.id = grafanadb.asset_topic.topic_id
		INNER JOIN grafanadb.asset ON grafanadb.asset.id = grafanadb.asset_topic.asset_id
		ORDER BY grafanadb.asset_topic.asset_id, grafanadb.asset_topic.topic_id`,
		[]
	);
	const rows = result.rows as {
		assetId: number;
		topicId: number;
		topicRef: string;
		topicType: string;
		description: string;
		assetUid: string;
		groupId: number;
	}[];
	const refsOfAsset = new Map<number, Set<string>>();
	for (const r of rows) {
		if (!refsOfAsset.has(r.assetId)) refsOfAsset.set(r.assetId, new Set());
		refsOfAsset.get(r.assetId).add(r.topicRef);
	}
	let renamed = 0;
	for (const r of rows) {
		if (!DEVICE_TOPIC_TYPES.includes(r.topicType)) continue;
		const prefix = assetTopicRefPrefix(r.topicType);
		let ref = r.topicRef;
		if (!new RegExp(`^${prefix}_\\d+$`).test(ref)) {
			const refs = refsOfAsset.get(r.assetId);
			let i = 1;
			while (refs.has(`${prefix}_${i}`)) i++;
			ref = `${prefix}_${i}`;
			refs.delete(r.topicRef);
			refs.add(ref);
			await pool.query(
				"UPDATE grafanadb.asset_topic SET topic_ref = $1 WHERE asset_id = $2 AND topic_id = $3",
				[ref, r.assetId, r.topicId]
			);
			await natsClient.jsPublish("asset_topic", "delete", r.assetId, { topicRef: r.topicRef, topicId: r.topicId });
			await natsClient.jsPublish("asset_topic", "create", r.assetId, { topicRef: ref, topicId: r.topicId });
			renamed++;
		}
		const description = assetTopicDescription(r.topicType, ref, r.description, r.assetUid);
		if (description !== r.description) {
			await pool.query("UPDATE grafanadb.topic SET description = $1, updated = NOW() WHERE id = $2", [
				description,
				r.topicId,
			]);
			await natsClient.jsPublish("topic", "update", r.topicId, { groupId: r.groupId });
		}
	}
	if (renamed > 0) logger.log("info", `Asset device topics renamed to their type (dev2dtm_n, dtm2dev_n): ${renamed}`);
};

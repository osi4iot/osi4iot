import { PoolClient } from "pg";
import { nanoid } from "nanoid";
import { logger } from "../config/winston";
import { predefinedSensorTypes } from "./predefinedSensorTypes";
import { createNewSensorType, createNewSensor } from "../components/sensor/sensorDAL";
import { createTopic } from "../components/topic/topicDAL";
import { createAssetTopic } from "../components/asset/assetDAL";
import natsClient from "../config/natsConfig";

// "Mobile audio" sensor of the "Mobile sensors" page
//
// The phone records a clip and publishes it, as bytes, on the asset's
// "Mobile audio topic" (type dev2dtm, like the photo and video ones):
// subject dev2dtm.Group_<groupUid>.Topic_<topicUid>.
//
// New organizations and groups get the sensor type, the topic and the
// sensor when they are created (predefinedSensorTypes, group and
// organization controllers, migration). This adds them to the platforms
// created before: the sensor type to every organization that lacks it, and
// the topic and the sensor to every "Mobile" asset that has no "Mobile
// audio" sensor yet. The topic and sensor references are the next free
// numbers of the asset (dev2pdb_7 and sensor_7 on an asset that kept the
// defaults).
//
// Run on every start of replica 1: once everything exists it does nothing.
//
// The database is initialized before admin_api connects to NATS, so the
// topics are created without telling pipelines (isDefault). Without that
// message, a pipelines instance that was already running does not know the
// new topic references, and a Listen node on "dev2pdb_7" fails with "topic
// reference not found" until pipelines restarts. notifyMobileAudioSensors()
// sends those messages once NATS is connected (index.ts).

interface PendingNotification {
	groupId: number;
	topicId: number;
	assetId: number;
	topicRef: string;
}

const pendingNotifications: PendingNotification[] = [];

const MOBILE_AUDIO = "Mobile audio";

const mobileAudioType = predefinedSensorTypes.find((sensorType) => sensorType.type === MOBILE_AUDIO);

const nextRef = (prefix: string, refs: string[]) => {
	const numbers = refs
		.map((ref) => (ref.startsWith(prefix) ? parseInt(ref.slice(prefix.length), 10) : NaN))
		.filter((n) => !Number.isNaN(n));
	return `${prefix}${numbers.length ? Math.max(...numbers) + 1 : 1}`;
};

export const ensureMobileAudioSensors = async (client: PoolClient): Promise<void> => {
	if (!mobileAudioType) return;
	try {
		// 1. sensor type in every organization
		const orgsWithout = await client.query<{ id: number }>(
			`SELECT grafanadb.org.id FROM grafanadb.org
			WHERE NOT EXISTS (
				SELECT 1 FROM grafanadb.sensor_type
				WHERE grafanadb.sensor_type.org_id = grafanadb.org.id AND grafanadb.sensor_type.type = $1
			)
			AND EXISTS (
				SELECT 1 FROM grafanadb.sensor_type
				WHERE grafanadb.sensor_type.org_id = grafanadb.org.id AND grafanadb.sensor_type.type = 'Mobile video'
			);`,
			[MOBILE_AUDIO]
		);
		for (const org of orgsWithout.rows) {
			await createNewSensorType({
				orgId: org.id,
				type: mobileAudioType.type,
				iconSvgFileName: mobileAudioType.iconSvgFileName,
				iconSvgString: mobileAudioType.iconSvgString,
				defaultMeasurements: JSON.stringify(mobileAudioType.defaultMeasurements),
				isPredefined: true,
				dashboardRefreshString: mobileAudioType.dashboardRefreshString,
				dashboardTimeWindow: mobileAudioType.dashboardTimeWindow,
			});
		}
		if (orgsWithout.rows.length) {
			logger.log("info", `Sensor type "${MOBILE_AUDIO}" added to ${orgsWithout.rows.length} organization(s)`);
		}

		// 2. topic and sensor in every mobile asset
		const assets = await client.query<{ assetId: number; groupId: number; orgId: number }>(
			`SELECT grafanadb.asset.id AS "assetId", grafanadb.asset.group_id AS "groupId",
				grafanadb.group.org_id AS "orgId"
			FROM grafanadb.asset
			INNER JOIN grafanadb.asset_type ON grafanadb.asset.asset_type_id = grafanadb.asset_type.id
			INNER JOIN grafanadb.group ON grafanadb.asset.group_id = grafanadb.group.id
			WHERE grafanadb.asset_type.type = 'Mobile'
			AND NOT EXISTS (
				SELECT 1 FROM grafanadb.sensor
				INNER JOIN grafanadb.sensor_type ON grafanadb.sensor.sensor_type_id = grafanadb.sensor_type.id
				WHERE grafanadb.sensor.asset_id = grafanadb.asset.id AND grafanadb.sensor_type.type = $1
			);`,
			[MOBILE_AUDIO]
		);
		for (const asset of assets.rows) {
			const sensorType = await client.query<{ id: number }>(
				`SELECT id FROM grafanadb.sensor_type WHERE org_id = $1 AND type = $2 LIMIT 1;`,
				[asset.orgId, MOBILE_AUDIO]
			);
			if (sensorType.rows.length === 0) continue;
			const topicRefs = await client.query<{ topicRef: string }>(
				`SELECT topic_ref AS "topicRef" FROM grafanadb.asset_topic WHERE asset_id = $1;`,
				[asset.assetId]
			);
			const sensorRefs = await client.query<{ sensorRef: string }>(
				`SELECT sensor_ref AS "sensorRef" FROM grafanadb.sensor WHERE asset_id = $1;`,
				[asset.assetId]
			);
			const topicRef = nextRef(
				"dev2pdb_",
				topicRefs.rows.map((row) => row.topicRef)
			);
			const sensorRef = nextRef(
				"sensor_",
				sensorRefs.rows.map((row) => row.sensorRef)
			);
			// isDefault = true: NATS is not connected yet while the database is initialized
			const topic = await createTopic(
				asset.groupId,
				{
					topicType: "dev2dtm",
					description: `Mobile audio topic`,
					mqttAccessControl: "Pub & Sub",
					messageSchema: "{}",
				} as any,
				true
			);
			await createAssetTopic(asset.assetId, topic.id, topicRef, true);
			pendingNotifications.push({ groupId: asset.groupId, topicId: topic.id, assetId: asset.assetId, topicRef });
			const sensorUid = nanoid(20).replace(/-/g, "x").replace(/_/g, "X");
			await createNewSensor(
				asset.assetId,
				{
					sensorRef,
					sensorTypeId: sensorType.rows[0].id,
					topicId: topic.id,
					description: MOBILE_AUDIO,
					measurements: "{}",
				},
				null,
				"",
				sensorUid
			);
		}
		if (assets.rows.length) {
			logger.log("info", `"${MOBILE_AUDIO}" topic and sensor added to ${assets.rows.length} mobile asset(s)`);
		}
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		logger.log("error", `The "${MOBILE_AUDIO}" sensors could not be added to the mobile assets: %s`, message);
	}
};

// Tells pipelines about the topics added by ensureMobileAudioSensors: the
// same messages createTopic and createAssetTopic send when NATS is connected
// (the topic first: the asset topic reference points to it).
export const notifyMobileAudioSensors = async (): Promise<void> => {
	while (pendingNotifications.length) {
		const { groupId, topicId, assetId, topicRef } = pendingNotifications[0];
		try {
			await natsClient.jsPublish("topic", "create", topicId, { groupId });
			await natsClient.jsPublish("asset_topic", "create", assetId, { topicRef, topicId });
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			logger.log("error", `pipelines could not be told about the "${MOBILE_AUDIO}" topic ${topicId}: %s`, message);
		}
		pendingNotifications.shift();
	}
};

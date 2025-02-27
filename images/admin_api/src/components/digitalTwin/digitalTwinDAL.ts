import { nanoid } from "nanoid";
import pool from "../../config/dbconfig";
import IGroup from "../group/interfaces/Group.interface";
import CreateDigitalTwinDto from "./digitalTwin.dto";
import IDigitalTwin from "./digitalTwin.interface";
import IDigitalTwinState from "./digitalTwinState.interface";
import {
	getDashboardsInfoFromIdArray,
	markInexistentDashboards
} from "../dashboard/dashboardDAL";
import {
	createTopic,
	getMqttTopicsInfoFromIdArray,
	getTopicByProp,
	markInexistentTopics
} from "../topic/topicDAL";
import IMqttTopicInfo from "../topic/mqttTopicInfo.interface";
import getDomainUrl from "../../utils/helpers/getDomainUrl";
import IDashboardInfo from "../dashboard/dashboardInfo.interfase";
import { IDigitalTwinData, IMqttTopicData, IMqttTopicDataShort } from "./digitalTwinGltfData.interface";
// import {  getLastMeasurementInChunk } from "../mesurement/measurementDAL";
// import IMeasurement from "../mesurement/measurement.interface";
import IDigitalTwinSimulator from "./digitalTwinSimulator.interface";
import IDigitalTwinTopic from "./digitalTwinTopic.interface";
import { createDashboard, deleteDashboard } from "../group/dashboardDAL";
import IMqttDigitalTwinTopicInfo from "./mqttDigitalTwinTopicInfo.interface";
import process_env from "../../config/api_config";
import s3Client from "../../config/s3Config";
import {
	DeleteObjectCommand,
	DeleteObjectsCommand,
	GetObjectCommand,
	GetObjectCommandOutput,
	ListObjectsV2Command,
	PutObjectCommand
} from "@aws-sdk/client-s3";
import IAsset from "../asset/asset.interface";
import UpdateDigitalTwinDto from "./digitalTwinUpdate.dto";
import { mobilePhoneGltfFileData } from "./mobilePhoneGltfFileData";
import { getAssetTopicByAssetIdAndTopicRef, getAssetTopicsByDigitalTwinId } from "../asset/assetDAL";
import { getSensorDashboardByAssetId, getSensorsByAssetId } from "../sensor/sensorDAL";

export const insertDigitalTwin = async (
	digitalTwinData: Partial<IDigitalTwin>
): Promise<IDigitalTwin> => {
	const queryString = `INSERT INTO grafanadb.digital_twin (group_id, asset_id,
		digital_twin_uid, description, type, dashboard_id, max_num_resfem_files,
		chat_assistant_enabled, chat_assistant_language, 
		digital_twin_simulation_format, created, updated)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
		RETURNING  id, group_id AS "groupId", asset_id AS "assetId",
		scope, digital_twin_uid AS "digitalTwinUid", description,
		type, dashboard_id AS "dashboardId",
		chat_assistant_enabled AS "chatAssistantEnabled",
		chat_assistant_language AS "chatAssistantLanguage",
		digital_twin_simulation_format AS "digitalTwinSimulationFormat",
		created, updated`;

	const result = await pool.query(
		queryString,
		[
			digitalTwinData.groupId,
			digitalTwinData.assetId,
			digitalTwinData.digitalTwinUid,
			digitalTwinData.description,
			digitalTwinData.type,
			digitalTwinData.dashboardId,
			digitalTwinData.maxNumResFemFiles,
			digitalTwinData.chatAssistantEnabled,
			digitalTwinData.chatAssistantLanguage,
			digitalTwinData.digitalTwinSimulationFormat,
		]);
	return result.rows[0] as IDigitalTwin;
};

export const getAllDigitalTwins = async (): Promise<IDigitalTwin[]> => {
	const response = await pool.query(`SELECT grafanadb.digital_twin.id, grafanadb.group.org_id AS "orgId",
										grafanadb.digital_twin.group_id AS "groupId", grafanadb.digital_twin.asset_id AS "assetId",
										grafanadb.digital_twin.digital_twin_uid AS "digitalTwinUid",
										grafanadb.digital_twin.scope, grafanadb.digital_twin.description,
										grafanadb.digital_twin.type, grafanadb.digital_twin.max_num_resfem_files AS "maxNumResFemFiles",
										grafanadb.digital_twin.dashboard_id AS "dashboardId",
										grafanadb.digital_twin.chat_assistant_enabled AS "chatAssistantEnabled",
										grafanadb.digital_twin.chat_assistant_language AS "chatAssistantLanguage",
										grafanadb.digital_twin.digital_twin_simulation_format AS "digitalTwinSimulationFormat",
										grafanadb.digital_twin.created, grafanadb.digital_twin.updated
										FROM grafanadb.digital_twin
										INNER JOIN grafanadb.group ON grafanadb.digital_twin.group_id = grafanadb.group.id
										ORDER BY grafanadb.digital_twin.id ASC,
											grafanadb.group.org_id ASC,
											grafanadb.digital_twin.group_id ASC,
											grafanadb.digital_twin.asset_id ASC;`);
	return response.rows as IDigitalTwin[];
}

export const getNumDigitalTwins = async (): Promise<number> => {
	const result = await pool.query(`SELECT COUNT(*) FROM grafanadb.digital_twin;`);
	return parseInt(result.rows[0].count, 10);
}

export const getNumDigitalTwinsByGroupsIdArray = async (groupsIdArray: number[]): Promise<number> => {
	const result = await pool.query(`SELECT COUNT(*) FROM grafanadb.digital_twin
									WHERE grafanadb.digital_twin.group_id = ANY($1::bigint[])`, [groupsIdArray]);
	return parseInt(result.rows[0].count, 10);
}

export const getNumDigitalTwinsByAssetId = async (assetId: number): Promise<number> => {
	const result = await pool.query(`SELECT COUNT(*) FROM grafanadb.digital_twin
									WHERE grafanadb.digital_twin.assetId = $1`, [assetId]);
	return parseInt(result.rows[0].count, 10);
}

export const getDigitalTwinsByOrgId = async (orgId: number): Promise<IDigitalTwin[]> => {
	const response = await pool.query(`SELECT grafanadb.digital_twin.id, grafanadb.group.org_id AS "orgId",
									grafanadb.digital_twin.group_id AS "groupId", grafanadb.digital_twin.asset_id AS "assetId",
									grafanadb.digital_twin.digital_twin_uid AS "digitalTwinUid",
									grafanadb.digital_twin.scope, grafanadb.digital_twin.description,
									grafanadb.digital_twin.type, grafanadb.digital_twin.max_num_resfem_files AS "maxNumResFemFiles",
									grafanadb.digital_twin.dashboard_id AS "dashboardId",
									grafanadb.digital_twin.chat_assistant_enabled AS "chatAssistantEnabled",
									grafanadb.digital_twin.chat_assistant_language AS "chatAssistantLanguage",
									grafanadb.digital_twin.digital_twin_simulation_format AS "digitalTwinSimulationFormat",
									grafanadb.digital_twin.created, grafanadb.digital_twin.updated
									FROM grafanadb.digital_twin
									INNER JOIN grafanadb.group ON grafanadb.digital_twin.group_id = grafanadb.group.id
									WHERE grafanadb.group.org_id = $1
									ORDER BY grafanadb.digital_twin.id ASC,
										grafanadb.group.org_id ASC,
										grafanadb.digital_twin.group_id ASC,
										grafanadb.digital_twin.asset_id ASC;`, [orgId]);
	return response.rows as IDigitalTwin[];
};

export const getDigitalTwinsByGroupId = async (groupId: number): Promise<IDigitalTwin[]> => {
	const response = await pool.query(`SELECT grafanadb.digital_twin.id, grafanadb.group.org_id AS "orgId",
										grafanadb.digital_twin.group_id AS "groupId", grafanadb.digital_twin.asset_id AS "assetId",
										grafanadb.digital_twin.digital_twin_uid AS "digitalTwinUid",
										grafanadb.digital_twin.scope, grafanadb.digital_twin.description,
										grafanadb.digital_twin.type, grafanadb.digital_twin.max_num_resfem_files AS "maxNumResFemFiles",
										grafanadb.digital_twin.dashboard_id AS "dashboardId",
										grafanadb.digital_twin.chat_assistant_enabled AS "chatAssistantEnabled",
										grafanadb.digital_twin.chat_assistant_language AS "chatAssistantLanguage",
										grafanadb.digital_twin.digital_twin_simulation_format AS "digitalTwinSimulationFormat",
										grafanadb.digital_twin.created, grafanadb.digital_twin.updated
										FROM grafanadb.digital_twin
										INNER JOIN grafanadb.group ON grafanadb.digital_twin.group_id = grafanadb.group.id
										WHERE grafanadb.digital_twin.group_id = $1
										ORDER BY grafanadb.digital_twin.id ASC,
										grafanadb.group.org_id ASC,
										grafanadb.digital_twin.group_id ASC,
										grafanadb.digital_twin.asset_id ASC;`, [groupId]);
	return response.rows as IDigitalTwin[];
};

export const getDigitalTwinsByGroupsIdArray = async (groupsIdArray: number[]): Promise<IDigitalTwin[]> => {
	const response = await pool.query(`SELECT grafanadb.digital_twin.id, grafanadb.group.org_id AS "orgId",
									grafanadb.digital_twin.group_id AS "groupId", grafanadb.digital_twin.asset_id AS "assetId",
									grafanadb.digital_twin.digital_twin_uid AS "digitalTwinUid",
									grafanadb.digital_twin.scope, grafanadb.digital_twin.description,
									grafanadb.digital_twin.type, grafanadb.digital_twin.max_num_resfem_files AS "maxNumResFemFiles",
									grafanadb.digital_twin.dashboard_id AS "dashboardId",
									grafanadb.digital_twin.chat_assistant_enabled AS "chatAssistantEnabled",
									grafanadb.digital_twin.chat_assistant_language AS "chatAssistantLanguage",
									grafanadb.digital_twin.digital_twin_simulation_format AS "digitalTwinSimulationFormat",
									grafanadb.digital_twin.created, grafanadb.digital_twin.updated
									FROM grafanadb.digital_twin
									INNER JOIN grafanadb.group ON grafanadb.digital_twin.group_id = grafanadb.group.id
									WHERE grafanadb.digital_twin.group_id = ANY($1::bigint[])
									ORDER BY grafanadb.digital_twin.id ASC,
										grafanadb.group.org_id ASC,
										grafanadb.digital_twin.group_id ASC,
										grafanadb.digital_twin.asset_id ASC;`, [groupsIdArray]);
	return response.rows as IDigitalTwin[];
};

export const getDigitalTwinByProp = async (propName: string, propValue: (string | number)): Promise<IDigitalTwin> => {
	const response = await pool.query(`SELECT grafanadb.digital_twin.id, grafanadb.group.org_id AS "orgId",
									grafanadb.digital_twin.group_id AS "groupId", 
									grafanadb.digital_twin.asset_id AS "assetId",
									grafanadb.digital_twin.digital_twin_uid AS "digitalTwinUid",
									grafanadb.digital_twin.scope, grafanadb.digital_twin.description,
									grafanadb.digital_twin.type, 
									grafanadb.digital_twin.max_num_resfem_files AS "maxNumResFemFiles",
									grafanadb.digital_twin.dashboard_id AS "dashboardId",
									grafanadb.digital_twin.chat_assistant_enabled AS "chatAssistantEnabled",
									grafanadb.digital_twin.chat_assistant_language AS "chatAssistantLanguage",
									grafanadb.digital_twin.digital_twin_simulation_format AS "digitalTwinSimulationFormat",
									grafanadb.digital_twin.created, grafanadb.digital_twin.updated
									FROM grafanadb.digital_twin
									INNER JOIN grafanadb.group ON grafanadb.digital_twin.group_id = grafanadb.group.id
									WHERE grafanadb.digital_twin.${propName} = $1`, [propValue]);
	return response.rows[0] as IDigitalTwin;
}

export const checkDigitalTwinConstraint = async (groupId: number, assetId: number, scope: string): Promise<boolean> => {
	const response = await pool.query(`SELECT grafanadb.digital_twin.id FROM grafanadb.digital_twin
									WHERE grafanadb.digital_twin.group_id = $1 AND
									grafanadb.digital_twin.asset_id = $2 AND
									grafanadb.digital_twin.scope = $3;`, [groupId, assetId, scope]);
	return response.rows[0] === undefined;
}

export const updateDigitalTwinById = async (digitalTwinId: number, digitalTwinData: Partial<IDigitalTwin>): Promise<void> => {
	const query = `UPDATE grafanadb.digital_twin SET digital_twin_uid = $1,
	                description = $2, type = $3, max_num_resfem_files = $4,
					chat_assistant_enabled = $5,
					chat_assistant_language = $6,
					digital_twin_simulation_format = $7, updated = NOW()
					WHERE grafanadb.digital_twin.id = $8;`;
	await pool.query(query, [
		digitalTwinData.digitalTwinUid,
		digitalTwinData.description,
		digitalTwinData.type,
		digitalTwinData.maxNumResFemFiles,
		digitalTwinData.chatAssistantEnabled,
		digitalTwinData.chatAssistantLanguage,
		digitalTwinData.digitalTwinSimulationFormat,
		digitalTwinId
	]);
};

export const deleteDigitalTwin = async (digitalTwinId: number): Promise<void> => {
	await pool.query(`DELETE FROM grafanadb.digital_twin WHERE grafanadb.digital_twin.id = $1`, [digitalTwinId]);
};

export const deleteDigitalTwinById = async (digitalTwin: IDigitalTwin): Promise<void> => {
	await deleteTopicsOfDT(digitalTwin.id);
	await deleteDigitalTwin(digitalTwin.id);
	await deleteDashboard(digitalTwin.dashboardId);
};

export const deleteTopicsOfDT = async (digitalTwinId: number): Promise<void> => {
	const queryString = `DELETE FROM grafanadb.topic USING grafanadb.digital_twin_topic
						WHERE grafanadb.topic.id = grafanadb.digital_twin_topic.topic_id AND
						grafanadb.digital_twin_topic.digital_twin_id = $1;`;
	await pool.query(queryString, [digitalTwinId]);
};

export const getAllDigitalTwinSimulators = async (): Promise<IDigitalTwinSimulator[]> => {
	const response = await pool.query(`SELECT grafanadb.digital_twin.id, grafanadb.org.acronym AS "orgAcronym",
						grafanadb.group.acronym AS "groupAcronym",
						grafanadb.group.id AS "groupId",
						grafanadb.asset.asset_uid AS "assetUid",
						grafanadb.asset.description AS "assetDescription",
						grafanadb.digital_twin.digital_twin_uid AS "digitalTwinUid", 
						grafanadb.digital_twin.description AS "digitalTwinDescription", 
						grafanadb.digital_twin.digital_twin_simulation_format AS "digitalTwinSimulationFormat",
						grafanadb.digital_twin_topic.topic_id AS "sensorSimulationTopicId"
						FROM grafanadb.digital_twin
						INNER JOIN grafanadb.group ON grafanadb.digital_twin.group_id = grafanadb.group.id
						INNER JOIN grafanadb.org ON grafanadb.group.org_id = grafanadb.org.id
						INNER JOIN grafanadb.asset ON grafanadb.digital_twin.asset_id = grafanadb.asset.id
						INNER JOIN grafanadb.digital_twin_topic ON
							grafanadb.digital_twin_topic.digital_twin_id = grafanadb.digital_twin.id
						WHERE  (grafanadb.digital_twin.type = $1 OR grafanadb.digital_twin.type = $2) AND
						grafanadb.digital_twin.digital_twin_simulation_format != '{}'::jsonb AND
						grafanadb.digital_twin_topic.topic_ref = $3
						ORDER BY grafanadb.group.org_id ASC,
							grafanadb.digital_twin.group_id ASC,
							grafanadb.digital_twin.asset_id ASC,
							grafanadb.digital_twin.id ASC;`, ["Gltf 3D model", "Glb 3D model", "sim2dtm"]);
	return response.rows as IDigitalTwinSimulator[];
}

export const getDigitalTwinSimulatorsByGroupsIdArray = async (groupsIdArray: number[]): Promise<IDigitalTwinSimulator[]> => {
	const response = await pool.query(`SELECT grafanadb.digital_twin.id, grafanadb.org.acronym AS "orgAcronym",
						grafanadb.group.acronym AS "groupAcronym",
						grafanadb.group.id AS "groupId",
						grafanadb.asset.asset_uid AS "assetUid",
						grafanadb.asset.description AS "assetDescription",
						grafanadb.digital_twin.digital_twin_uid AS "digitalTwinUid", 
						grafanadb.digital_twin.description AS "digitalTwinDescription", 
						grafanadb.digital_twin.digital_twin_simulation_format AS "digitalTwinSimulationFormat",
						grafanadb.digital_twin_topic.topic_id AS "sensorSimulationTopicId"
						FROM grafanadb.digital_twin
						INNER JOIN grafanadb.group ON grafanadb.digital_twin.group_id = grafanadb.group.id
						INNER JOIN grafanadb.org ON grafanadb.group.org_id = grafanadb.org.id
						INNER JOIN grafanadb.asset ON grafanadb.digital_twin.asset_id = grafanadb.asset.id
						INNER JOIN grafanadb.digital_twin_topic ON
							grafanadb.digital_twin_topic.digital_twin_id = grafanadb.digital_twin.id
						WHERE grafanadb.digital_twin.group_id = ANY($1::bigint[]) AND
						(grafanadb.digital_twin.type = $2 OR grafanadb.digital_twin.type = $3) AND
						grafanadb.digital_twin.digital_twin_simulation_format != '{}'::jsonb AND
						grafanadb.digital_twin_topic.topic_ref = $4
						ORDER BY grafanadb.group.org_id ASC,
							grafanadb.group.id ASC,
							grafanadb.digital_twin.id ASC;`, [groupsIdArray, "Gltf 3D model", "Glb 3D model", "sim2dtm"]);
	return response.rows as IDigitalTwinSimulator[];
}

export const getStateOfAllDigitalTwins = async (): Promise<IDigitalTwinState[]> => {
	const response = await pool.query(`SELECT grafanadb.digital_twin.id AS "digitalTwinId", grafanadb.group.org_id AS "orgId",
									grafanadb.digital_twin.group_id AS "groupId", grafanadb.digital_twin.asset_id AS "assetId",
									grafanadb.alert.state
									FROM grafanadb.digital_twin
									INNER JOIN grafanadb.group ON grafanadb.digital_twin.group_id = grafanadb.group.id
									LEFT JOIN grafanadb.alert ON grafanadb.digital_twin.dashboard_id = grafanadb.alert.dashboard_id
									ORDER BY grafanadb.group.org_id ASC,
											grafanadb.digital_twin.group_id ASC,
											grafanadb.digital_twin.id ASC;`);
	return response.rows as IDigitalTwinState[];
}

export const getStateOfDigitalTwinsByGroupsIdArray = async (groupsIdArray: number[]): Promise<IDigitalTwinState[]> => {
	const response = await pool.query(`SELECT grafanadb.digital_twin.id AS "digitalTwinId", grafanadb.group.org_id AS "orgId",
									grafanadb.digital_twin.group_id AS "groupId", grafanadb.digital_twin.asset_id AS "assetId",
									grafanadb.alert.state
									FROM grafanadb.digital_twin
									INNER JOIN grafanadb.group ON grafanadb.digital_twin.group_id = grafanadb.group.id
									LEFT JOIN grafanadb.alert ON grafanadb.digital_twin.dashboard_id = grafanadb.alert.dashboard_id
									WHERE grafanadb.digital_twin.group_id = ANY($1::bigint[])
									ORDER BY grafanadb.group.org_id ASC,
											grafanadb.digital_twin.group_id ASC,
											grafanadb.digital_twin.id ASC;`, [groupsIdArray]);
	return response.rows as IDigitalTwinState[];
};

// NOTE: In digital Twin topics topic_ref === topic_type
export const createDigitalTwinTopic = async (
	digitalTwinId: number,
	topicId: number,
	topicRef: string
): Promise<IDigitalTwinTopic> => {
	const queryString = `INSERT INTO grafanadb.digital_twin_topic (
		digital_twin_id, topic_id, topic_ref)
		VALUES ($1, $2, $3)
	    RETURNING  digital_twin_id AS "digitalTwinId", topic_id AS "topicId", 
		topic_ref AS "topicRef"`
	const result = await pool.query(queryString, [digitalTwinId, topicId, topicRef]);
	return result.rows[0] as IDigitalTwinTopic;
};

export const getDTTopicsByDigitalTwinId = async (digitalTwinId: number): Promise<IDigitalTwinTopic[]> => {
	const queryString = `SELECT digital_twin_id AS "digitalTwinId",
						topic_id AS "topicId", topic_ref AS "topicRef"
						FROM grafanadb.digital_twin_topic
						WHERE grafanadb.digital_twin_topic.digital_twin_id = $1
						ORDER BY grafanadb.digital_twin_topic.digital_twin_id ASC,
						         grafanadb.digital_twin_topic.topic_id ASC;`;
	const response = await pool.query(queryString, [digitalTwinId]);
	return response.rows as IDigitalTwinTopic[];
};

export const deleteDigitalTwinTopics = async (
	digitalTwinId: number,
	topicsId: number[]
): Promise<void> => {
	const queryString = `DELETE FROM grafanadb.digital_twin_topic
						WHERE grafanadb.digital_twin_topic.digital_twin_id = $1
						AND grafanadb.digital_twin_topic.topic_id = ANY($2::bigint[]);`;
	await pool.query(queryString, [digitalTwinId, topicsId]);
};

export const getDigitalTwinMqttTopicsInfoFromByDTIdsArray = async (digitalTwinIdsArray: number[]): Promise<IMqttDigitalTwinTopicInfo[]> => {
	const response = await pool.query(`SELECT grafanadb.digital_twin.digital_twin_uid AS "digitalTwinUid",
	                                grafanadb.topic.id AS "topicId", 
									grafanadb.digital_twin_topic.topic_ref AS "topicRef",
									grafanadb.topic.topic_type AS "topicType",
									grafanadb.group.group_uid AS "groupHash",
									grafanadb.topic.topic_uid AS "topicHash"
									FROM grafanadb.topic
									INNER JOIN grafanadb.group ON grafanadb.topic.group_id = grafanadb.group.id
									INNER JOIN grafanadb.digital_twin_topic ON grafanadb.digital_twin_topic.topic_id = grafanadb.topic.id
									INNER JOIN grafanadb.digital_twin ON
										grafanadb.digital_twin.id = grafanadb.digital_twin_topic.digital_twin_id
									WHERE grafanadb.digital_twin_topic.digital_twin_id = ANY($1::bigint[])
									ORDER BY grafanadb.topic.id ASC;`, [digitalTwinIdsArray]);

	return response.rows as IMqttDigitalTwinTopicInfo[];
}

export const uploadMobilePhoneGltfFile = async (
	gltfFileName: string,
) => {
	const gltfFileData = JSON.parse(mobilePhoneGltfFileData);
	if (Object.keys(gltfFileData).length && gltfFileData.nodes?.length !== 0) {
		const bucketParams = {
			Bucket: process_env.S3_BUCKET_NAME,
			Key: gltfFileName,
			Body: JSON.stringify(gltfFileData)
		};
		await s3Client.send(new PutObjectCommand(bucketParams));
	}
}

interface IGltfFileData {
	gltfFileName: string;
	gltfFileData: string;
}


export const checkExistentSensorsRef = async (
	assetId: number,
	sensorsRef: string[]
): Promise<boolean> => {
	let isSensorsRefOK = true;
	if (sensorsRef.length !== 0) {
		const storedSensors = await getSensorsByAssetId(assetId);
		const missingSensorsRef: string[] = [];
		sensorsRef.forEach(sensorRef => {
			const existentSensor = storedSensors.filter(sensor =>
				sensor.sensorRef === sensorRef
			)[0];
			if (!existentSensor) missingSensorsRef.push(sensorRef);
		});
		if (missingSensorsRef.length !== 0) {
			isSensorsRefOK = false;
		}
	}
	return isSensorsRefOK;
}

// Corregir
export const verifyAndCorrectDigitalTwinReferences = async (
	group: IGroup,
	digitalTwinUpdate: IDigitalTwin & UpdateDigitalTwinDto
): Promise<void> => {
	const groupId = group.id;
	const digitalTwinId = digitalTwinUpdate.id;
	const storedDTTopics = await getDTTopicsByDigitalTwinId(digitalTwinId);
	const digitalTwinTopicList = ["dtm2sim", "sim2dtm", "dtm2pdb", "dev2dtm", "dtm2dev", "dev2sim", "sim2llm", "llm2sim"];
	const topicTypesToAdd: string[] = [];
	digitalTwinTopicList.forEach(topicType => {
		const existentTopic = storedDTTopics.filter(dtTopic => dtTopic.topicRef === topicType)[0];
		if (!existentTopic) topicTypesToAdd.push(topicType);
	});

	if (topicTypesToAdd.length !== 0) {
		const digitalTwinUid = digitalTwinUpdate.digitalTwinUid;
		if (topicTypesToAdd.indexOf("dev2dtm") !== -1) {
			const dev2dtmTopicData =
			{
				topicType: "dev2dtm",
				description: `dev2dtm for DT_${digitalTwinUid}`,
				mqttAccessControl: "Pub & Sub",
				payloadJsonSchema: "{}",
				requireS3Storage: false,
				s3Folder: "",
				parquetSchema: "{}",
			};
			const dev2dtmTopic = await createTopic(groupId, dev2dtmTopicData);
			await createDigitalTwinTopic(digitalTwinId, dev2dtmTopic.id, "dev2dtm");
		}

		if (topicTypesToAdd.indexOf("dtm2dev") !== -1) {
			const dtm2devTopicData =
			{
				topicType: "dtm2dev",
				description: `dtm2dev for DT_${digitalTwinUid}`,
				mqttAccessControl: "Pub & Sub",
				payloadJsonSchema: "{}",
				requireS3Storage: false,
				s3Folder: "",
				parquetSchema: "{}",
			};
			const dtm2devTopic = await createTopic(groupId, dtm2devTopicData);
			await createDigitalTwinTopic(digitalTwinId, dtm2devTopic.id, "dtm2dev");
		}

		if (topicTypesToAdd.indexOf("dev2sim") !== -1) {
			const dev2simTopicData =
			{
				topicType: "dev2sim",
				description: `dev2sim for DT_${digitalTwinUid}`,
				mqttAccessControl: "Pub & Sub",
				payloadJsonSchema: "{}",
				requireS3Storage: false,
				s3Folder: "",
				parquetSchema: "{}",
			};
			const dev2simTopic = await createTopic(groupId, dev2simTopicData);
			await createDigitalTwinTopic(digitalTwinId, dev2simTopic.id, "dev2sim");
		}

		if (topicTypesToAdd.indexOf("dtm2sim") !== -1) {
			const dtm2simTopicData =
			{
				topicType: "dtm2sim",
				description: `dtm2sim for DT_${digitalTwinUid}`,
				mqttAccessControl: "Pub & Sub",
				payloadJsonSchema: "{}",
				requireS3Storage: false,
				s3Folder: "",
				parquetSchema: "{}",
			};
			const dtm2simTopic = await createTopic(0, dtm2simTopicData);
			await createDigitalTwinTopic(digitalTwinId, dtm2simTopic.id, "dtm2sim");
		}

		if (topicTypesToAdd.indexOf("sim2dtm") !== -1) {
			const sim2dtmTopicData =
			{
				topicType: "sim2dtm",
				description: `sim2dtm for DT_${digitalTwinUid}`,
				mqttAccessControl: "Pub & Sub",
				payloadJsonSchema: "{}",
				requireS3Storage: false,
				s3Folder: "",
				parquetSchema: "{}",
			};
			const sim2dtmTopic = await createTopic(0, sim2dtmTopicData);
			await createDigitalTwinTopic(digitalTwinId, sim2dtmTopic.id, "sim2dtm");
		}

		if (topicTypesToAdd.indexOf("dtm2pdb") !== -1) {
			const dtm2pdbTopicData =
			{
				topicType: "dtm2pdb",
				topicName: `${digitalTwinUid}_dtm2pdb`,
				description: `dtm2pdb for DT_${digitalTwinUid}`,
				mqttAccessControl: "Pub & Sub",
				payloadJsonSchema: "{}",
				requireS3Storage: false,
				s3Folder: "",
				parquetSchema: "{}",
			};
			const dtm2pdbTopic = await createTopic(0, dtm2pdbTopicData);
			await createDigitalTwinTopic(digitalTwinId, dtm2pdbTopic.id, "dtm2pdb");
		}

		if (topicTypesToAdd.indexOf("sim2llm") !== -1) {
			const sim2llmTopicData =
			{
				topicType: "sim2llm",
				topicName: `${digitalTwinUid}_sim2llm`,
				description: `sim2llm for DT_${digitalTwinUid}`,
				mqttAccessControl: "Pub & Sub",
				payloadJsonSchema: "{}",
				requireS3Storage: false,
				s3Folder: "",
				parquetSchema: "{}",
			};
			const sim2llmTopic = await createTopic(0, sim2llmTopicData);
			await createDigitalTwinTopic(digitalTwinId, sim2llmTopic.id, "sim2llm");
		}

		if (topicTypesToAdd.indexOf("llm2sim") !== -1) {
			const llm2simTopicData =
			{
				topicType: "llm2sim",
				topicName: `${digitalTwinUid}_llm2sim`,
				description: `llm2sim for DT_${digitalTwinUid}`,
				mqttAccessControl: "Pub & Sub",
				payloadJsonSchema: "{}",
				requireS3Storage: false,
				s3Folder: "",
				parquetSchema: "{}",
			};
			const llm2simTopic = await createTopic(0, llm2simTopicData);
			await createDigitalTwinTopic(digitalTwinId, llm2simTopic.id, "llm2sim");
		}
	}
}


export const getMqttTopicsDataFromDigitalTwinData = async (digitalTwinId: number): Promise<IMqttTopicData[]> => {
	const mqttTopicsData: IMqttTopicData[] = [];
	const digitalTwinTopics = await getDTTopicsByDigitalTwinId(digitalTwinId);
	const assetTopics = await getAssetTopicsByDigitalTwinId(digitalTwinId);
	const digitalTwinTopicsList = [...digitalTwinTopics, ...assetTopics];
	if (digitalTwinTopicsList.length !== 0) {
		for (const digitalTwinTopic of digitalTwinTopicsList) {
			const mqttTopicData: IMqttTopicData = {
				topicId: digitalTwinTopic.topicId,
				topicRef: digitalTwinTopic.topicRef,
				mqttTopic: "",
				groupUid: null,
				sqlTopic: null,
				lastMeasurement: null
			};
			mqttTopicsData.push(mqttTopicData);
		}
	}

	if (mqttTopicsData.length !== 0) {
		const topicsId = mqttTopicsData.map(topicData => topicData.topicId);
		const markedTopicsId = await markInexistentTopics(topicsId);
		markedTopicsId.forEach((topicId, index) => {
			if (topicId < 0) {
				mqttTopicsData[index].mqttTopic = `Warning: Topic with id: ${mqttTopicsData[index].topicId} not exists any more`
			}
		});
		const topicsInfo = await getMqttTopicsInfoFromIdArray(markedTopicsId);
		topicsInfo.forEach(topicInfo => {
			const topicDataIndex = mqttTopicsData.findIndex(topicData => topicData.topicId === topicInfo.topicId);
			if (topicDataIndex !== -1) {
				mqttTopicsData[topicDataIndex].mqttTopic = generateMqttTopic(topicInfo);
				mqttTopicsData[topicDataIndex].groupUid = topicInfo.groupHash;
				mqttTopicsData[topicDataIndex].sqlTopic = generateSqlTopic(topicInfo);
			}
		});

		// const mesurementsQueries: any[] = [];
		// mqttTopicsData.forEach(mqttTopicData => {
		// 	if (
		// 		mqttTopicData.sqlTopic &&
		// 		(mqttTopicData.topicRef.slice(0, 7) === "dev2pdb" || mqttTopicData.topicRef.slice(0, 7) === "dtm2pdb")
		// 	) {
		// 		const query = getLastMeasurementInChunk(mqttTopicData.groupUid, mqttTopicData.sqlTopic);
		// 		mesurementsQueries.push(query);
		// 	}
		// });
		// const mesurements: IMeasurement[] = await Promise.all(mesurementsQueries).then(responses => responses as IMeasurement[]);

		// mesurements.forEach(mesurement => {
		// 	if (mesurement !== undefined) {
		// 		const topicDataIndex = mqttTopicsData.findIndex(topicData => topicData.sqlTopic === mesurement.topic);
		// 		if (topicDataIndex !== -1) {
		// 			mqttTopicsData[topicDataIndex].lastMeasurement = mesurement;
		// 		}
		// 	}
		// })

		mqttTopicsData.sort((topicData1, topicData2) => {
			if (topicData1.topicId > topicData2.topicId) {
				return 1;
			}
			if (topicData1.topicId < topicData2.topicId) {
				return -1;
			}
			return 0;
		});
	}

	return mqttTopicsData;
}

export const demoDigitalTwinDescription = (group: IGroup, dashboardType: string): string => {
	const digitalTwinDescription = `${dashboardType} dashboard for ${group.acronym.replace(/ /g, "_")} group`;
	return digitalTwinDescription;
}

export const generateDigitalTwinUid = (): string => {
	const digitalTwinUid = `DT_${nanoid(20).replace(/-/g, "x").replace(/_/g, "X")}`
	return digitalTwinUid;
}

export const generateDigitalTwinMqttTopics = (digitalTwinMqttTopicsInfo: IMqttDigitalTwinTopicInfo[]): Record<string, Record<string, string>> => {
	const digitalTwinMqttTopics: Record<string, Record<string, string>> = {};
	for (const topicInfo of digitalTwinMqttTopicsInfo) {
		const digitalTwinRef = `DT_${topicInfo.digitalTwinUid}`;
		if (digitalTwinMqttTopics[digitalTwinRef] === undefined) {
			digitalTwinMqttTopics[digitalTwinRef] = {};
		}
		const topicType = topicInfo.topicRef;
		digitalTwinMqttTopics[digitalTwinRef][topicType] = generateMqttTopic(topicInfo);
	}

	const digitalTwinMqttTopicsSorted: Record<string, Record<string, string>> = {};
	for (const digitalTwinRef of Object.keys(digitalTwinMqttTopics)) {
		const sorted = Object.keys(digitalTwinMqttTopics[digitalTwinRef])
			.sort()
			.reduce((accumulator: Record<string, string>, key: string) => {
				accumulator[key] = digitalTwinMqttTopics[digitalTwinRef][key];
				return accumulator;
			}, {});
		digitalTwinMqttTopicsSorted[digitalTwinRef] = sorted;
	}
	return digitalTwinMqttTopicsSorted;
}

export interface ITopicRef {
	topicRef: string;
	topicId: number;
}

export interface ISensorRef {
	sensorId: number;
	sensorRef: string;
	topicId: number
}

export const createDigitalTwin = async (
	group: IGroup,
	asset: IAsset,
	digitalTwinInput: CreateDigitalTwinDto,
	dashboardId: number | null = null,
): Promise<IDigitalTwin | null> => {
	const groupId = group.id;
	const assetId = asset.id;
	const digitalTwinUid = digitalTwinInput.digitalTwinUid;

	let digitalTwinDashboardId = dashboardId;
	if (!dashboardId) {
		const dashboardTitle = `DT_${digitalTwinUid}`;
		const assetTopic = await getAssetTopicByAssetIdAndTopicRef(assetId, "dev2pdb_1");
		const topic = await getTopicByProp("id", assetTopic.topicId);
		const topicUid = topic.topicUid;
		digitalTwinDashboardId = await createDashboard(group, topicUid, dashboardTitle);
	}

	const digitalTwinUpdated: Partial<IDigitalTwin> = {
		groupId,
		assetId,
		digitalTwinUid: digitalTwinInput.digitalTwinUid,
		description: digitalTwinInput.description,
		type: digitalTwinInput.type,
		dashboardId: digitalTwinDashboardId,
		maxNumResFemFiles: digitalTwinInput.maxNumResFemFiles,
		chatAssistantEnabled: digitalTwinInput.chatAssistantEnabled,
		chatAssistantLanguage: digitalTwinInput.chatAssistantLanguage,
		digitalTwinSimulationFormat: digitalTwinInput.digitalTwinSimulationFormat,
	};
	const digitalTwin = await insertDigitalTwin(digitalTwinUpdated);

	if (digitalTwinInput.type === "Gltf 3D model" || digitalTwinInput.type === "Glb 3D model") {
		const sim2dtmTopicData =
		{
			topicType: "sim2dtm",
			description: `sim2dtm for DT_${digitalTwinUid}`,
			mqttAccessControl: "Pub & Sub",
			payloadJsonSchema: "{}",
			requireS3Storage: false,
			s3Folder: "",
			parquetSchema: "{}",
		};
		const sim2dtmTopic = await createTopic(groupId, sim2dtmTopicData);
		await createDigitalTwinTopic(digitalTwin.id, sim2dtmTopic.id, "sim2dtm");

		const dtm2simTopicData =
		{
			topicType: "dtm2sim",
			topicName: `${digitalTwinUid}_dtm2sim`,
			description: `dtm2sim for DT_${digitalTwinUid}`,
			mqttAccessControl: "Pub & Sub",
			payloadJsonSchema: "{}",
			requireS3Storage: false,
			s3Folder: "",
			parquetSchema: "{}",
		};
		const dtm2simTopic = await createTopic(groupId, dtm2simTopicData);
		await createDigitalTwinTopic(digitalTwin.id, dtm2simTopic.id, "dtm2sim");

		const dtm2pdbTopicData =
		{
			topicType: "dtm2pdb",
			topicName: `${digitalTwinUid}_dtm2pdb`,
			description: `dtm2pdb for DT_${digitalTwinUid}`,
			mqttAccessControl: "Pub & Sub",
			payloadJsonSchema: "{}",
			requireS3Storage: false,
			s3Folder: "",
			parquetSchema: "{}",
		};
		const dtm2pdbTopic = await createTopic(groupId, dtm2pdbTopicData);
		await createDigitalTwinTopic(digitalTwin.id, dtm2pdbTopic.id, "dtm2pdb");

		const dev2dtmTopicData =
		{
			topicType: "dev2dtm",
			description: `dev2dtm for DT_${digitalTwinUid}`,
			mqttAccessControl: "Pub & Sub",
			payloadJsonSchema: "{}",
			requireS3Storage: false,
			s3Folder: "",
			parquetSchema: "{}",
		};
		const dev2dtmTopic = await createTopic(groupId, dev2dtmTopicData);
		await createDigitalTwinTopic(digitalTwin.id, dev2dtmTopic.id, "dev2dtm");

		const dtm2devTopicData =
		{
			topicType: "dtm2dev",
			description: `dtm2dev for DT_${digitalTwinUid}`,
			mqttAccessControl: "Pub & Sub",
			payloadJsonSchema: "{}",
			requireS3Storage: false,
			s3Folder: "",
			parquetSchema: "{}",
		};
		const dtm2devTopic = await createTopic(groupId, dtm2devTopicData);
		await createDigitalTwinTopic(digitalTwin.id, dtm2devTopic.id, "dtm2dev");

		const dev2simTopicData =
		{
			topicType: "dev2sim",
			description: `dev2sim for DT_${digitalTwinUid}`,
			mqttAccessControl: "Pub & Sub",
			payloadJsonSchema: "{}",
			requireS3Storage: false,
			s3Folder: "",
			parquetSchema: "{}",
		};
		const dev2simTopic = await createTopic(groupId, dev2simTopicData);
		await createDigitalTwinTopic(digitalTwin.id, dev2simTopic.id, "dev2sim");

		const sim2llmTopicData =
		{
			topicType: "sim2llm",
			description: `sim2llm for DT_${digitalTwinUid}`,
			mqttAccessControl: "Pub & Sub",
			payloadJsonSchema: "{}",
			requireS3Storage: false,
			s3Folder: "",
			parquetSchema: "{}",
		};
		const sim2llmTopic = await createTopic(groupId, sim2llmTopicData);
		await createDigitalTwinTopic(digitalTwin.id, sim2llmTopic.id, "sim2llm");

		const llm2simTopicData =
		{
			topicType: "llm2sim",
			description: `llm2sim for DT_${digitalTwinUid}`,
			mqttAccessControl: "Pub & Sub",
			payloadJsonSchema: "{}",
			requireS3Storage: false,
			s3Folder: "",
			parquetSchema: "{}",
		};
		const llm2simTopic = await createTopic(groupId, llm2simTopicData);
		await createDigitalTwinTopic(digitalTwin.id, llm2simTopic.id, "llm2sim");
	}

	const sensorsRef = digitalTwinInput.sensorsRef;
	const sensorsInAsset = await getSensorsByAssetId(assetId);
	for (const sensorRef of sensorsRef) {
		const sensor = sensorsInAsset.filter(sensorInAsset => sensorInAsset.sensorRef === sensorRef)[0];
		await createSensorInDigitalTwin(digitalTwin.id, sensor.id);
	}

	return digitalTwin;
};

export const getGltfFileData = async (digitalTwin: IDigitalTwin): Promise<IGltfFileData> => {
	const orgId = digitalTwin.orgId;
	const groupId = digitalTwin.groupId;
	const digitalTwinId = digitalTwin.id;
	const keyBase = `org_${orgId}/group_${groupId}/digitalTwin_${digitalTwinId}`;
	const gltfFileFolder = `${keyBase}/gltfFile`;
	const gltfFileList = await getBucketFolderFileList(gltfFileFolder);
	let gltfFileName = "";

	let gltfFileData = '{}';
	if (gltfFileList.length !== 0) {
		gltfFileName = gltfFileList[0];
		const bucketParamsGltfFile = {
			Bucket: process_env.S3_BUCKET_NAME,
			Key: gltfFileName
		};
		const data = await s3Client.send(new GetObjectCommand(bucketParamsGltfFile));
		gltfFileData = await data.Body.transformToString();
	}

	return { gltfFileName, gltfFileData };
}

export const getDigitalTwinData = async (digitalTwin: IDigitalTwin): Promise<IDigitalTwinData> => {

	const digitalTwinId = digitalTwin.id;
	const mqttTopicsData = await getMqttTopicsData(digitalTwinId);
	const sensorsDashboards = await getSensorDashboardByAssetId(digitalTwin.assetId);
	const topicIdBySensorRef = await getTopicIdBySensorRef(digitalTwinId);

	const { gltfFileName, gltfFileDate, gltfFileSize } = await getGltfFileInfo(digitalTwin);

	const gltfData = {
		id: digitalTwinId,
		digitalTwinUid: digitalTwin.digitalTwinUid,
		digitalTwinType: digitalTwin.type,
		gltfFileName,
		gltfFileDate,
		gltfFileSize,
		digitalTwinSimulationFormat: digitalTwin.digitalTwinSimulationFormat,
		mqttTopicsData,
		topicIdBySensorRef,
		sensorsDashboards
	}

	return gltfData;
}


export const getDigitalTwinGltfFile = async (digitalTwin: IDigitalTwin): Promise<string> => {
	const orgId = digitalTwin.orgId;
	const groupId = digitalTwin.groupId;
	const digitalTwinId = digitalTwin.id;
	const keyBase = `org_${orgId}/group_${groupId}/digitalTwin_${digitalTwinId}`;
	const gltfFileFolder = `${keyBase}/gltfFile`;
	const gltfFileList = await getBucketFolderFileList(gltfFileFolder);

	let gltfFile = '{}';
	if (gltfFileList.length !== 0) {
		const bucketParamsGltfFile = {
			Bucket: process_env.S3_BUCKET_NAME,
			Key: gltfFileList[0]
		};
		const data = await s3Client.send(new GetObjectCommand(bucketParamsGltfFile));
		gltfFile = await data.Body.transformToString();
	}

	return gltfFile;
}

export const getDigitalTwinGlbFile = async (digitalTwin: IDigitalTwin): Promise<GetObjectCommandOutput | null> => {
	const orgId = digitalTwin.orgId;
	const groupId = digitalTwin.groupId;
	const digitalTwinId = digitalTwin.id;
	const keyBase = `org_${orgId}/group_${groupId}/digitalTwin_${digitalTwinId}`;
	const gltfFileFolder = `${keyBase}/gltfFile`;
	const gltfFileList = await getBucketFolderFileList(gltfFileFolder);

	let response: GetObjectCommandOutput | null = null;
	if (gltfFileList.length !== 0) {
		const bucketParamsGltfFile = {
			Bucket: process_env.S3_BUCKET_NAME,
			Key: gltfFileList[0]
		};
		response = await s3Client.send(new GetObjectCommand(bucketParamsGltfFile));
	}
	return response;
}

export const getMqttTopicsData = async (digitalTwinId: number): Promise<IMqttTopicDataShort[]> => {
	const topicsData = await getMqttTopicsDataFromDigitalTwinData(digitalTwinId);
	const mqttTopicsData = topicsData.map(topicData => {
		const topicRef = topicData.topicRef;
		return {
			topicId: topicData.topicId,
			mqttTopic: topicData.mqttTopic,
			topicRef,
			lastMeasurement: topicData.lastMeasurement
		}
	});
	return mqttTopicsData;
}

export const addMqttTopicsToDigitalTwinSimulators = async (
	digitalTwinSimulators: IDigitalTwinSimulator[]
): Promise<IDigitalTwinSimulator[]> => {
	const topicsId = digitalTwinSimulators.map(digitalTwinSimulator => digitalTwinSimulator.sensorSimulationTopicId);
	const markedTopicsId = await markInexistentTopics(topicsId);
	const topicsInfo = await getMqttTopicsInfoFromIdArray(markedTopicsId);
	const digitalTwinSimulatorsExtended: IDigitalTwinSimulator[] = [];
	topicsInfo.forEach(topicInfo => {
		const digitalTwinSimulatorIndex = digitalTwinSimulators.findIndex(elem => elem.sensorSimulationTopicId === topicInfo.topicId);
		if (digitalTwinSimulatorIndex !== -1) {
			const dtsExtended = digitalTwinSimulators[digitalTwinSimulatorIndex];
			dtsExtended.mqttTopic = generateMqttTopic(topicInfo);
			digitalTwinSimulatorsExtended.push(dtsExtended);
		}
	});

	return digitalTwinSimulatorsExtended;
}

export const addDashboardUrls = async (digitalTwins: IDigitalTwin[]): Promise<IDigitalTwin[]> => {
	const dashboardIdArray: number[] = [];
	digitalTwins.forEach(digitalTwin => {
		if (digitalTwin.dashboardId && dashboardIdArray.findIndex(id => id === digitalTwin.dashboardId) === -1) {
			dashboardIdArray.push(digitalTwin.dashboardId)
		}
	})

	const markedDashboards = await markInexistentDashboards(dashboardIdArray);
	const dashboardsInfo = await getDashboardsInfoFromIdArray(markedDashboards);
	const digitalTwinsExtended = [...digitalTwins];
	digitalTwinsExtended.forEach(digitalTwin => {
		const dashboardInformation = dashboardsInfo.filter(dashboardInfo => dashboardInfo.dashboardId === digitalTwin.dashboardId)[0];
		const dashboardsUrl = generateDashboardsUrl([dashboardInformation])
		digitalTwin.dashboardUrl = dashboardsUrl[0];
	});
	return digitalTwinsExtended;
}

const generateMqttTopic = (mqttTopicInfo: IMqttTopicInfo | IMqttDigitalTwinTopicInfo): string => {
	const topicType = mqttTopicInfo.topicType;
	const groupHash = mqttTopicInfo.groupHash;
	const topicHash = mqttTopicInfo.topicHash;
	const mqttTopic = `${topicType}/Group_${groupHash}/Topic_${topicHash}`;
	return mqttTopic;
}

export const generateSqlTopic = (mqttTopicInfo: IMqttTopicInfo): string => {
	const sqlTopic = `Topic_${mqttTopicInfo.topicHash}`;
	return sqlTopic;
}

export const getSensorsRefInDigitalTwin = async (digitalTwinId: number): Promise<ISensorRef[]> => {
	const response = await pool.query(`SELECT grafanadb.sensor.id AS "sensorId", 
									grafanadb.sensor.sensor_ref AS "sensorRef",
									grafanadb.sensor.topic_id AS "topicId"
									FROM grafanadb.sensor
									INNER JOIN grafanadb.digital_twin_sensor ON grafanadb.digital_twin_sensor.sensor_id = grafanadb.sensor.id
									WHERE grafanadb.digital_twin_sensor.digital_twin_id = $1
									ORDER BY grafanadb.sensor.id ASC`, [digitalTwinId]);
	return response.rows as ISensorRef[];
}

export const getTopicIdBySensorRef = async (digitalTwinId: number): Promise<Record<string, number>> => {
	const sensorsRef = await getSensorsRefInDigitalTwin(digitalTwinId);
	const topicIdBySensorRef: Record<string, number> = {}
	for (const sensorRef of sensorsRef) {
		topicIdBySensorRef[sensorRef.sensorRef] = sensorRef.topicId;
	}
	return topicIdBySensorRef;
}

export const createSensorInDigitalTwin = async (digitalTwinId: number, sensorId: number) => {
	const queryString = `INSERT INTO grafanadb.digital_twin_sensor(digital_twin_id, sensor_id)
						VALUES ($1, $2)
	                    RETURNING  digital_twin_id AS "digitalTwinId", sensor_id AS "sensorId"`
	const result = await pool.query(queryString, [digitalTwinId, sensorId]);
	return result.rows[0] as IDigitalTwinTopic;
}

export const generateDashboardsUrl = (dashboardsInfo: IDashboardInfo[]): string[] => {
	const domainNameUrl = getDomainUrl();
	const dashboarsdUrl: string[] = [];
	for (const dashboardInfo of dashboardsInfo) {
		if (dashboardInfo.slug === "Inexistent") {
			const dashboardUrl = `Warning: Dashboard with id: ${dashboardInfo.dashboardId} not exists any more`;
			dashboarsdUrl.push(dashboardUrl);
		} else {
			const dashboardUrl = `${domainNameUrl}/grafana/d/${dashboardInfo.uid}/${dashboardInfo.slug}`;
			dashboarsdUrl.push(dashboardUrl);
		}
	}
	return dashboarsdUrl;
}

const getBucketFolderFileList = async (folderPath: string): Promise<string[]> => {
	const bucketParams = {
		Bucket: process_env.S3_BUCKET_NAME,
		Prefix: folderPath,
	};

	let fileList: string[] = [];
	const data = await s3Client.send(new ListObjectsV2Command(bucketParams));
	if (data.KeyCount !== 0) {
		fileList = data.Contents.map(fileData => fileData.Key);
	}
	return fileList;
}

export interface IBucketFileInfoList {
	fileName: string;
	lastModified: string
	size: number;
}

export const getBucketFolderInfoFileList = async (folderPath: string): Promise<IBucketFileInfoList[]> => {
	const bucketParams = {
		Bucket: process_env.S3_BUCKET_NAME,
		Prefix: folderPath,
	};
	const data = await s3Client.send(new ListObjectsV2Command(bucketParams));
	let fileInfoList: IBucketFileInfoList[] = [];
	if (data.KeyCount !== 0 && data.Contents.length !== 0) {
		fileInfoList = data.Contents.map(fileinfo => {
			const fileData = {
				fileName: fileinfo.Key,
				lastModified: fileinfo.LastModified.toString(),
				size: fileinfo.Size
			}
			return fileData;
		});

		fileInfoList.sort((a, b) => {
			const c = new Date(a.lastModified).getTime();
			const d = new Date(b.lastModified).getTime();
			return d - c;
		});
	}
	return fileInfoList;
}

export const checkMaxNumberOfFemResFiles = async (digitalTwin: IDigitalTwin) => {
	const orgId = digitalTwin.orgId;
	const groupId = digitalTwin.groupId;
	const digitalTwinId = digitalTwin.id;
	const maxNumResFemFiles = digitalTwin.maxNumResFemFiles;
	const keyBase = `org_${orgId}/group_${groupId}/digitalTwin_${digitalTwinId}`;
	const folderPath = `${keyBase}/femResFiles`

	const femResFileInfoList = await getBucketFolderInfoFileList(folderPath);
	if (femResFileInfoList.length > maxNumResFemFiles) {
		const femResFileInfoListFiltered = femResFileInfoList.slice(maxNumResFemFiles);
		const femResFileKeysToRemove = femResFileInfoListFiltered.map(file => file.fileName);
		await deleteBucketFiles(femResFileKeysToRemove);
	}
}

export const checkNumberOfGltfFiles = async (digitalTwin: IDigitalTwin) => {
	const orgId = digitalTwin.orgId;
	const groupId = digitalTwin.groupId;
	const digitalTwinId = digitalTwin.id;
	const keyBase = `org_${orgId}/group_${groupId}/digitalTwin_${digitalTwinId}`;
	const folderPath = `${keyBase}/gltfFile`

	const gltfFileInfoList = await getBucketFolderInfoFileList(folderPath);
	if (gltfFileInfoList.length > 1) {
		const gltfFileInfoListFiltered = gltfFileInfoList.slice(1);
		const gltfFileKeysToRemove = gltfFileInfoListFiltered.map(file => file.fileName);
		await deleteBucketFiles(gltfFileKeysToRemove);
	}
}

export const getGltfFileInfo = async (digitalTwin: IDigitalTwin): Promise<{ gltfFileName: string, gltfFileDate: string, gltfFileSize: number }> => {
	const orgId = digitalTwin.orgId;
	const groupId = digitalTwin.groupId;
	const digitalTwinId = digitalTwin.id;
	const keyBase = `org_${orgId}/group_${groupId}/digitalTwin_${digitalTwinId}`;
	const folderPath = `${keyBase}/gltfFile`

	const gltfFileInfoList = await getBucketFolderInfoFileList(folderPath);
	let gltfFileName = "";
	let gltfFileDate = "";
	let gltfFileSize = 0;
	if (gltfFileInfoList.length !== 0) {
		gltfFileName = gltfFileInfoList[0].fileName;
		gltfFileDate = gltfFileInfoList[0].lastModified;
		gltfFileSize = gltfFileInfoList[0].size;
	}
	return { gltfFileName, gltfFileDate, gltfFileSize };
}



export const deleteBucketFile = async (fileKey: string) => {
	const bucketParams = {
		Bucket: process_env.S3_BUCKET_NAME,
		Key: fileKey,
	};
	await s3Client.send(new DeleteObjectCommand(bucketParams));
}

export const deleteBucketFiles = async (filesToRemove: string[]) => {
	const fileKeys = filesToRemove.map(file => {
		const key = file;
		return { Key: key }
	});
	const bucketParams = {
		Bucket: process_env.S3_BUCKET_NAME,
		Delete: {
			Objects: fileKeys
		}
	};
	await s3Client.send(new DeleteObjectsCommand(bucketParams));
}

export const removeFilesFromBucketFolder = async (folderPath: string) => {
	const filesToRemove = await getBucketFolderFileList(folderPath);
	if (filesToRemove.length !== 0) {
		await deleteBucketFiles(filesToRemove);
	}
}




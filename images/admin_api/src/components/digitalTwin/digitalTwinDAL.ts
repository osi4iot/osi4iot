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
	deleteTopicByIdsArray,
	getMqttTopicsInfoFromIdArray,
	getTopicByProp,
	markInexistentTopics
} from "../topic/topicDAL";
import IMqttTopicInfo from "../topic/mqttTopicInfo.interface";
import getDomainUrl from "../../utils/helpers/getDomainUrl";
import IDashboardInfo from "../dashboard/dashboardInfo.interfase";
import IDigitalTwinGltfData, { IMqttTopicData, IMqttTopicDataShort } from "./digitalTwinGltfData.interface";
import { getLastMeasurement } from "../mesurement/measurementDAL";
import IMeasurement from "../mesurement/measurement.interface";
import IDigitalTwinSimulator from "./digitalTwinSimulator.interface";
import IDigitalTwinTopic from "./digitalTwinTopic.interface";
import { createDashboard, createSensorDashboard, deleteDashboard, deleteDashboardsByIdArray } from "../group/dashboardDAL";
import IMqttDigitalTwinTopicInfo from "./mqttDigitalTwinTopicInfo.interface";
import ITopic from "../topic/topic.interface";
import process_env from "../../config/api_config";
import s3Client from "../../config/s3Config";
import {
	DeleteObjectCommand,
	DeleteObjectsCommand,
	GetObjectCommand,
	ListObjectsV2Command,
	PutObjectCommand
} from "@aws-sdk/client-s3";
import IAsset from "../asset/asset.interface";
import ISensor from "../sensor/sensor.interface";
import { createNewSensor, deleteSensorsByIdArray, getSensorByPropName } from "../sensor/sensorDAL";
import IDigitalTwinSensor from "./digitalTwinSensor.interface";
import IDigitalTwinSensorDashboard from "./digitalTwinSensorDashboard.interface";
import UpdateDigitalTwinDto from "./digitalTwinUpdate.dto";
import { mobilePhoneGltfFileData } from "./mobilePhoneGltfFileData";
import CreateSensorRefDto from "./createSensorRef.dto";

export const insertDigitalTwin = async (
	digitalTwinData: Partial<IDigitalTwin>
): Promise<IDigitalTwin> => {
	const queryString = `INSERT INTO grafanadb.digital_twin (group_id, asset_id,
		digital_twin_uid, description, type, dashboard_id, max_num_resfem_files,
		digital_twin_simulation_format, dt_references_file_name,
		dt_references_file_last_modif_date, created, updated)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
		RETURNING  id, group_id AS "groupId", asset_id AS "assetId",
		scope, digital_twin_uid AS "digitalTwinUid", description,
		type, dashboard_id AS "dashboardId",
		digital_twin_simulation_format AS "digitalTwinSimulationFormat",
		dt_references_file_name AS "dtRefFileName",
		dt_references_file_last_modif_date AS "dtRefFileLastModifDate", 
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
			digitalTwinData.digitalTwinSimulationFormat,
			digitalTwinData.dtRefFileName,
			digitalTwinData.dtRefFileLastModifDate
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
										grafanadb.digital_twin.digital_twin_simulation_format AS "digitalTwinSimulationFormat",
										grafanadb.digital_twin.dt_references_file_name AS "dtRefFileName",
										grafanadb.digital_twin.dt_references_file_last_modif_date AS "dtRefFileLastModifDate",
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
									grafanadb.digital_twin.digital_twin_simulation_format AS "digitalTwinSimulationFormat",
									grafanadb.digital_twin.dt_references_file_name AS "dtRefFileName",
									grafanadb.digital_twin.dt_references_file_last_modif_date AS "dtRefFileLastModifDate",
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
										grafanadb.digital_twin.digital_twin_simulation_format AS "digitalTwinSimulationFormat",
										grafanadb.digital_twin.dt_references_file_name AS "dtRefFileName",
										grafanadb.digital_twin.dt_references_file_last_modif_date AS "dtRefFileLastModifDate",
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
									grafanadb.digital_twin.digital_twin_simulation_format AS "digitalTwinSimulationFormat",
									grafanadb.digital_twin.dt_references_file_name AS "dtRefFileName",
									grafanadb.digital_twin.dt_references_file_last_modif_date AS "dtRefFileLastModifDate",
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
									grafanadb.digital_twin.digital_twin_simulation_format AS "digitalTwinSimulationFormat",
									grafanadb.digital_twin.dt_references_file_name AS "dtRefFileName",
									grafanadb.digital_twin.dt_references_file_last_modif_date AS "dtRefFileLastModifDate",
									grafanadb.digital_twin.created, grafanadb.digital_twin.updated
									FROM grafanadb.digital_twin
									INNER JOIN grafanadb.group ON grafanadb.digital_twin.group_id = grafanadb.group.id
									WHERE grafanadb.digital_twin.${propName} = $1`, [propValue]);
	return response.rows[0] as IDigitalTwin;
}

export const updateDigitalTwinById = async (digitalTwinId: number, digitalTwinData: Partial<IDigitalTwin>): Promise<void> => {
	const query = `UPDATE grafanadb.digital_twin SET digital_twin_uid = $1,
	                description = $2, type = $3, max_num_resfem_files = $4,
					digital_twin_simulation_format = $5, dt_references_file_name = $6,
					dt_references_file_last_modif_date = $7,
					updated = NOW() WHERE grafanadb.digital_twin.id = $8;`;
	await pool.query(query, [
		digitalTwinData.digitalTwinUid,
		digitalTwinData.description,
		digitalTwinData.type,
		digitalTwinData.maxNumResFemFiles,
		digitalTwinData.digitalTwinSimulationFormat,
		digitalTwinData.dtRefFileName,
		digitalTwinData.dtRefFileLastModifDate,
		digitalTwinId
	]);
};

export const deleteDigitalTwin = async (digitalTwinId: number): Promise<void> => {
	await pool.query(`DELETE FROM grafanadb.digital_twin WHERE grafanadb.digital_twin.id = $1`, [digitalTwinId]);
};

export const deleteDigitalTwinById = async (digitalTwin: IDigitalTwin): Promise<void> => {
	const sensorDashboards = await getSensorDashboardByDigitalTwinId(digitalTwin.id);
	const dashboardIdAarray = sensorDashboards.map(dashboard => dashboard.dashboardId);

	await deleteSensorsOfDT(digitalTwin.id);
	await deleteTopicsOfDT(digitalTwin.id);
	await deleteDigitalTwin(digitalTwin.id);

	await deleteDashboardsByIdArray(dashboardIdAarray);
	await deleteDashboard(digitalTwin.dashboardId);
};

export const deleteTopicsOfDT = async (digitalTwinId: number): Promise<void> => {
	const queryString = `DELETE FROM grafanadb.topic USING grafanadb.digital_twin_topic
						WHERE grafanadb.topic.id = grafanadb.digital_twin_topic.topic_id AND
						grafanadb.digital_twin_topic.already_created = $1 AND
						grafanadb.digital_twin_topic.digital_twin_id = $2;`;
	await pool.query(queryString, [false, digitalTwinId]);
};


export const deleteSensorsOfDT = async (digitalTwinId: number): Promise<void> => {
	const queryString = `DELETE FROM grafanadb.sensor USING grafanadb.digital_twin_sensor
						WHERE grafanadb.sensor.id = grafanadb.digital_twin_sensor.sensor_id AND
						grafanadb.digital_twin_sensor.already_created =$1 AND
						grafanadb.digital_twin_sensor.digital_twin_id = $2;`;
	await pool.query(queryString, [false, digitalTwinId]);
};

export const deleteSensorDashboardsOfDT = async (digitalTwinId: number): Promise<void> => {
	const queryString = `DELETE FROM grafanadb.dashboard USING grafanadb.digital_twin_sensor_dashboard
						WHERE grafanadb.dashboard.id = grafanadb.digital_twin_sensor_dashboard.dashboard_id AND
						grafanadb.digital_twin_sensor_dashboard.digital_twin_id = $1;`;
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
						WHERE  grafanadb.digital_twin.type = $1 AND
						grafanadb.digital_twin.digital_twin_simulation_format != '{}'::jsonb AND
						grafanadb.digital_twin_topic.topic_ref = $2
						ORDER BY grafanadb.group.org_id ASC,
							grafanadb.digital_twin.group_id ASC,
							grafanadb.digital_twin.asset_id ASC,
							grafanadb.digital_twin.id ASC;`, ["Gltf 3D model", "sim2dtm"]);
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
						grafanadb.digital_twin.type = $2 AND
						grafanadb.digital_twin.digital_twin_simulation_format != '{}'::jsonb AND
						grafanadb.digital_twin_topic.topic_ref = $3
						ORDER BY grafanadb.group.org_id ASC,
							grafanadb.group.id ASC,
							grafanadb.digital_twin.id ASC;`, [groupsIdArray, "Gltf 3D model", "sim2dtm"]);
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

export const createDigitalTwinTopic = async (
	digitalTwinId: number,
	topicId: number,
	topicRef: string,
	alreadyCreated = false
): Promise<IDigitalTwinTopic> => {
	const queryString = `INSERT INTO grafanadb.digital_twin_topic (
		digital_twin_id, topic_id, topic_ref, already_created)
		VALUES ($1, $2, $3, $4)
	    RETURNING  digital_twin_id AS "digitalTwinId", topic_id AS "topicId", 
		topic_ref AS "topicRef", already_created AS "alreadyCreated"`
	const result = await pool.query(
		queryString,
		[digitalTwinId, topicId, topicRef, alreadyCreated]);
	return result.rows[0] as IDigitalTwinTopic;
};

export const getDTTopicsByDigitalTwinId = async (digitalTwinId: number): Promise<IDigitalTwinTopic[]> => {
	const queryString = `SELECT digital_twin_id AS "digitalTwinId",
						topic_id AS "topicId", topic_ref AS "topicRef",
						already_created AS "alreadyCreated"
						FROM grafanadb.digital_twin_topic
						WHERE grafanadb.digital_twin_topic.digital_twin_id = $1
						ORDER BY grafanadb.digital_twin_topic.digital_twin_id ASC,
						         grafanadb.digital_twin_topic.topic_id ASC;`;
	const response = await pool.query(queryString, [digitalTwinId]);
	return response.rows as IDigitalTwinTopic[];
};

export const getDTTopicsRefByDigitalTwinId = async (digitalTwinId: number): Promise<ITopicRef[]> => {
	const queryString = `SELECT grafanadb.digital_twin_topic.topic_id AS "topicId", 
	                    grafanadb.digital_twin_topic.topic_ref AS "topicRef"
						FROM grafanadb.digital_twin_topic
						INNER JOIN grafanadb.topic ON grafanadb.topic.id = grafanadb.digital_twin_topic.topic_id
						WHERE grafanadb.digital_twin_topic.digital_twin_id = $1 AND
						grafanadb.topic.topic_type = ANY($2::varchar(40)[]);`;
	const response = await pool.query(queryString, [digitalTwinId, ["dev2pdb", "dev2pdb_wt"]]);
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


export const createDigitalTwinSensor = async (
	digitalTwinId: number,
	sensorId: number,
	sensorRef: string,
	topicId: number,
	alreadyCreated: boolean
): Promise<IDigitalTwinSensor> => {
	const queryString = `INSERT INTO grafanadb.digital_twin_sensor (
		digital_twin_id, sensor_id, sensor_ref, topic_id, already_created)
		VALUES ($1, $2, $3, $4, $5)
	    RETURNING  digital_twin_id AS "digitalTwinId", sensor_id AS "sensorId",
		sensor_ref AS "sensorRef", topic_id AS "topicId"`
	const result = await pool.query(
		queryString,
		[digitalTwinId, sensorId, sensorRef, topicId, alreadyCreated]);
	return result.rows[0] as IDigitalTwinSensor;
};

export const getDigitalTwinSensors = async (digitalTwinId: number): Promise<IDigitalTwinSensor[]> => {
	const queryString = `SELECT digital_twin_id AS "digitalTwinId",
						sensor_id AS "sensorId", sensor_ref AS "sensorRef",
						topic_id AS "topicId", already_created AS "alreadyCreated"
						FROM grafanadb.digital_twin_sensor
						WHERE grafanadb.digital_twin_sensor.digital_twin_id = $1
						ORDER BY grafanadb.digital_twin_sensor.digital_twin_id ASC,
						         grafanadb.digital_twin_sensor.sensor_id ASC;`;
	const response = await pool.query(queryString, [digitalTwinId]);
	return response.rows as IDigitalTwinSensor[];
};

export const getDTSensorsRef = async (digitalTwinId: number): Promise<ISensorRef[]> => {
	const queryString = `SELECT sensor_id AS "sensorId", sensor_ref AS "sensorRef",
	                    topic_id AS "topicId"
						FROM grafanadb.digital_twin_sensor
						WHERE grafanadb.digital_twin_sensor.digital_twin_id = $1;`;
	const response = await pool.query(queryString, [digitalTwinId]);
	return response.rows as IDigitalTwinSensor[];
};

export const createDigitalTwinSensorDashboard = async (
	digitalTwinId: number,
	sensorId: number,
	dashboardId: number
): Promise<IDigitalTwinSensorDashboard> => {
	const queryString = `INSERT INTO grafanadb.digital_twin_sensor_dashboard (
		digital_twin_id, sensor_id, dashboard_id)
		VALUES ($1, $2, $3)
	    RETURNING  digital_twin_id AS "digitalTwinId", sensor_id AS "sensorId",
		dashboard_id AS "dashboardId"`
	const result = await pool.query(
		queryString,
		[digitalTwinId, sensorId, dashboardId]);
	return result.rows[0] as IDigitalTwinSensorDashboard;
};

export const getSensorDashboardByDigitalTwinId = async (
	digitalTwinId: number
): Promise<IDigitalTwinSensorDashboard[]> => {
	const queryString = `SELECT grafanadb.digital_twin_sensor.sensor_ref AS "sensorRef",
						digital_twin_sensor_dashboard.sensor_id AS "sensorId", 
						digital_twin_sensor_dashboard.dashboard_id AS "dashboardId",
						grafanadb.sensor.dashboard_url AS "dashboardUrl"
						FROM grafanadb.digital_twin_sensor_dashboard
						INNER JOIN grafanadb.digital_twin_sensor ON grafanadb.digital_twin_sensor.sensor_id = grafanadb.digital_twin_sensor_dashboard.sensor_id
						INNER JOIN grafanadb.sensor ON grafanadb.digital_twin_sensor_dashboard.sensor_id = grafanadb.sensor.id
						WHERE grafanadb.digital_twin_sensor_dashboard.digital_twin_id = $1;`
	const result = await pool.query(
		queryString,
		[digitalTwinId]);
	return result.rows as IDigitalTwinSensorDashboard[];
}

export const getDigitalTwinMqttTopicsInfoFromByDTIdsArray = async (digitalTwinIdsArray: number[]): Promise<IMqttDigitalTwinTopicInfo[]> => {
	const response = await pool.query(`SELECT grafanadb.digital_twin.digital_twin_uid AS "digitalTwinUid",
	                                grafanadb.topic.id AS "topicId", grafanadb.digital_twin_topic.topic_ref AS "topicRef",
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

export interface IMeshNode {
	name?: string;
	mesh?: number;
	extras: {
		animationType: string;
		topicType: string;
		type: string;
		clipTopicType: string;
		sensorRef: string;
		topicRef: string;
		description: string;
		payloadKey: string;
		paramLabel: string;
		valueType: string;
		units: string;
		dashboardRefresh: string;
		dashboardTimeWindow: string;
	};
}

/// Luego revisar
const findTopicIdForSensor = (topicName: string, topicSensors: ITopic[]) => {
	let sensorTopicId = -1;
	for (const topicSensor of topicSensors) {
		const topicSensorIndex = parseInt(topicSensor.topicName.split("_").slice(-1)[0], 10);
		if (topicName === `dev2pdb_${topicSensorIndex}`) {
			sensorTopicId = topicSensor.id;
		}
	}
	return sensorTopicId;
}

/// Luego revisar
export const updatedTopicSensorIdsFromDigitalTwinGltfData = async (
	gltfFileName: string,
	gltfFileData: any,
	topicSensors: ITopic[]
) => {
	if (typeof gltfFileData === "string") gltfFileData = JSON.parse(gltfFileData);
	if (Object.keys(gltfFileData).length && gltfFileData.nodes?.length !== 0) {
		gltfFileData.nodes.forEach(
			(
				node: {
					name?: string; mesh?: number;
					extras: {
						animationType: string;
						topicType: string;
						objectOnOff: string;
						sensorTopicId: number;
						type: string;
						clipTopicType: string;
						clipTopicId: number;
					};
				}
			) => {
				// if (node.mesh !== undefined && node.extras !== undefined) {
				if (node.extras !== undefined) {
					if (node.extras.type !== undefined && node.extras.type === "sensor") {
						const topicType = node.extras?.topicType;
						if (topicType) {
							const topicId = findTopicIdForSensor(topicType, topicSensors);
							node.extras.sensorTopicId = topicId;
						}
					}
					if (node.extras.clipTopicType !== undefined) {
						const topicType = node.extras.clipTopicType
						node.extras.clipTopicId = findTopicIdForSensor(topicType, topicSensors);
					}
				}

			})

		const bucketParams = {
			Bucket: process_env.S3_BUCKET_NAME,
			Key: gltfFileName,
			Body: JSON.stringify(gltfFileData)
		};
		await s3Client.send(new PutObjectCommand(bucketParams));
	}
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

export const verifyAndCorrectDigitalTwinReferences = async (
	group: IGroup,
	digitalTwinUpdate: IDigitalTwin & UpdateDigitalTwinDto
): Promise<void> => {
	const groupId = group.id;
	const digitalTwinId = digitalTwinUpdate.id;
	const { topicsRef, sensorsRef } = digitalTwinUpdate;

	if (topicsRef.length !== 0 && sensorsRef.length !== 0) {
		const storedTopicsRef = await getDTTopicsByDigitalTwinId(digitalTwinId);
		const storedSensorsRef = await getDigitalTwinSensors(digitalTwinId);
		const newSensorTopicsRef = [...topicsRef];
		const newTopicsRef = topicsRef.map(topic => topic.topicRef);
		newTopicsRef.push("dtm2sim", "sim2dtm", "dtm2pdb", "dev2dtm", "dtm2dev", "dev2sim");
		const topicTypesToAdd: string[] = [];
		const topicIdsToRemove: number[] = [];
		newTopicsRef.forEach(topicType => {
			const existentTopic = storedTopicsRef.filter(topic => topic.topicRef === topicType)[0];
			if (!existentTopic) topicTypesToAdd.push(topicType);
		});
		storedTopicsRef.forEach(topic => {
			const necessaryTopicTypeIndex = newTopicsRef.indexOf(topic.topicRef);
			if (necessaryTopicTypeIndex === -1) topicIdsToRemove.push(topic.topicId);
		})
		if (topicIdsToRemove.length !== 0) {
			await deleteTopicByIdsArray(topicIdsToRemove)
		}
		if (topicTypesToAdd.length !== 0) {
			const digitalTwinUid = digitalTwinUpdate.digitalTwinUid;
			const topicSensorTypesToAdd = topicTypesToAdd.filter(topicType => topicType.slice(0, 7) === "dev2pdb");
			if (topicSensorTypesToAdd.length !== 0) {
				for (let i = 1; i <= topicSensorTypesToAdd.length; i++) {
					const topicType = topicSensorTypesToAdd[i];
					const topicData = {
						topicType,
						description: `${topicType} for DT_${digitalTwinUid}`,
						mqttAccessControl: "Pub & Sub"
					}
					const topic = await createTopic(groupId, topicData);
					await createDigitalTwinTopic(digitalTwinId, topic.id, topicType);
					newSensorTopicsRef.push({ topicRef: topicType, topicId: topic.id })
				}
			}

			if (topicTypesToAdd.indexOf("dev2dtm") !== -1) {
				const dev2dtmTopicData =
				{
					topicType: "dev2dtm",
					description: `dev2dtm for DT_${digitalTwinUid}`,
					mqttAccessControl: "Pub & Sub"
				};
				const dev2dtmTopic = await createTopic(groupId, dev2dtmTopicData);
				await createDigitalTwinTopic(digitalTwinId, dev2dtmTopic.id, "dev2dtm");
			}

			if (topicTypesToAdd.indexOf("dtm2dev") !== -1) {
				const dtm2devTopicData =
				{
					topicType: "dtm2dev",
					description: `dtm2dev for DT_${digitalTwinUid}`,
					mqttAccessControl: "Pub & Sub"
				};
				const dtm2devTopic = await createTopic(groupId, dtm2devTopicData);
				await createDigitalTwinTopic(digitalTwinId, dtm2devTopic.id, "dtm2dev");
			}

			if (topicTypesToAdd.indexOf("dev2sim") !== -1) {
				const dev2simTopicData =
				{
					topicType: "dev2sim",
					description: `dev2sim for DT_${digitalTwinUid}`,
					mqttAccessControl: "Pub & Sub"
				};
				const dev2simTopic = await createTopic(groupId, dev2simTopicData);
				await createDigitalTwinTopic(digitalTwinId, dev2simTopic.id, "dev2sim");
			}

			if (topicTypesToAdd.indexOf("dtm2sim") !== -1) {
				const dtm2simTopicData =
				{
					topicType: "dtm2sim",
					description: `dtm2sim for DT_${digitalTwinUid}`,
					mqttAccessControl: "Pub & Sub"
				};
				const dtm2simTopic = await createTopic(0, dtm2simTopicData);
				await createDigitalTwinTopic(digitalTwinId, dtm2simTopic.id, "dtm2sim");
			}

			if (topicTypesToAdd.indexOf("sim2dtm") !== -1) {
				const sim2dtmTopicData =
				{
					topicType: "sim2dtm",
					description: `sim2dtm for DT_${digitalTwinUid}`,
					mqttAccessControl: "Pub & Sub"
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
					mqttAccessControl: "Pub & Sub"
				};
				const dtm2pdbTopic = await createTopic(0, dtm2pdbTopicData);
				await createDigitalTwinTopic(digitalTwinId, dtm2pdbTopic.id, "dtm2pdb");
			}
		}

		const sensorsIdToRemove: number[] = [];
		const sensorsRefToAdd: CreateSensorRefDto[] = [];
		sensorsRef.forEach(sensorRef => {
			const sensorMap = storedSensorsRef.filter(sensor => sensor.sensorRef === sensorRef.sensorRef)[0];
			if (!sensorMap) sensorsRefToAdd.push(sensorRef);
		});
		storedSensorsRef.forEach(sensorRef => {
			const sensorMap = sensorsRef.filter(sensor => {
				return sensor.sensorRef === sensorRef.sensorRef && !sensorRef.alreadyCreated
			})[0];
			if (!sensorMap) sensorsIdToRemove.push(sensorRef.sensorId);
		});
		if (sensorsIdToRemove.length !== 0) {
			await deleteSensorsByIdArray(sensorsIdToRemove);
		}
		for (const sensorRef of sensorsRefToAdd) {
			const topicRef = topicsRef.filter(topicMap => topicMap.topicRef === sensorRef.topicRef)[0].topicRef;
			const topicId = newSensorTopicsRef.filter(topic => topic.topicRef === topicRef)[0].topicId;
			const assetId = digitalTwinUpdate.assetId;
			const sensorData = {
				type: sensorRef.valueType,
				description: sensorRef.description,
				topicId,
				payloadKey: sensorRef.payloadKey,
				paramLabel: sensorRef.paramLabel,
				valueType: sensorRef.valueType,
				units: sensorRef.units,
				dashboardRefresh: sensorRef.dashboardRefresh,
				dashboardTimeWindow: sensorRef.dashboardTimeWindow
			}
			const sensorsUid = nanoid(20).replace(/-/g, "x").replace(/_/g, "X");
			const sensorDashboarId = await createSensorDashboard(group, sensorData, sensorsUid);
			const dashboardsInfo = await getDashboardsInfoFromIdArray([sensorDashboarId]);
			const dashboardsUrl = generateDashboardsUrl(dashboardsInfo);
			const sensor = await createNewSensor(assetId, sensorData, sensorDashboarId, dashboardsUrl[0], sensorsUid);
			await createDigitalTwinSensor(digitalTwinId, sensor.id, sensorRef.sensorRef, topicId, true)
		}
	}
}


export const getMqttTopicsDataFromDigitalTwinData = async (digitalTwinId: number): Promise<IMqttTopicData[]> => {
	const mqttTopicsData: IMqttTopicData[] = [];
	const digitalTwinTopicsList = await getDTTopicsByDigitalTwinId(digitalTwinId);
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

	if (mqttTopicsData.length) {
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

		const mesurementsQueries: any[] = [];
		mqttTopicsData.forEach(mqttTopicData => {
			if (
				mqttTopicData.sqlTopic &&
				(mqttTopicData.topicRef.slice(0, 7) === "dev2pdb" || mqttTopicData.topicRef === "dtm2pdb")
			) {
				const query = getLastMeasurement(mqttTopicData.groupUid, mqttTopicData.sqlTopic);
				mesurementsQueries.push(query);
			}
		});
		const mesurements: IMeasurement[] = await Promise.all(mesurementsQueries).then(responses => responses as IMeasurement[]);

		mesurements.forEach(mesurement => {
			if (mesurement !== undefined) {
				const topicDataIndex = mqttTopicsData.findIndex(topicData => topicData.sqlTopic === mesurement.topic);
				if (topicDataIndex !== -1) {
					mqttTopicsData[topicDataIndex].lastMeasurement = mesurement;
				}
			}
		})

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
		digitalTwinMqttTopics[digitalTwinRef][topicType] = generateMqttDigitalTwinTopic(topicInfo);
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


interface ICreateDigitalTwin {
	digitalTwin: IDigitalTwin | null;
	topicsRef: ITopicRef[];
}

export const createDigitalTwin = async (
	group: IGroup,
	asset: IAsset,
	digitalTwinInput: CreateDigitalTwinDto,
	dashboardId: number | null = null,
): Promise<ICreateDigitalTwin> => {
	const groupId = group.id;
	const assetId = asset.id;
	const digitalTwinUid = digitalTwinInput.digitalTwinUid;

	const topicSensors: ITopic[] = [];
	const topicsRef: ITopicRef[] = [];
	if (digitalTwinInput.topicsRef?.length !== 0) {
		for (const topicMap of digitalTwinInput.topicsRef) {
			const newTopicRef = {
				topicRef: topicMap.topicRef,
				topicId: topicMap.topicId
			}
			if (topicMap.topicId !== 0) {
				const topic = await getTopicByProp("id", topicMap.topicId)
				if (!topic) throw new Error(`The topic with id: ${topicMap.topicId} not exists`);
				topicSensors.push(topic);
			} else {
				let topicSensorType = "dev2pdb";
				/// Format dev2pdb_i, dev2pdb_wt_i or dev2pdb_ma_i
				if (topicMap.topicRef.slice(0, 10) === "dev2pdb_wt") topicSensorType = "dev2pdb_wt";
				if (topicMap.topicRef.slice(0, 10) === "dev2pdb_ma") topicSensorType = "dev2pdb_ma";
				const topicData = {
					topicType: topicSensorType,
					description: `${topicMap.topicRef} for DT_${digitalTwinUid}`,
					mqttAccessControl: "Pub & Sub"
				}
				const topic = await createTopic(groupId, topicData);
				topicSensors.push(topic);
				newTopicRef.topicId = topic.id;
			}
			topicsRef.push(newTopicRef);
		}
	}

	const sensors: ISensor[] = [];
	const sensorDashboardsRef: { sensorId: number, dashboardId: number }[] = [];
	if (digitalTwinInput.sensorsRef?.length !== 0) {
		for (const sensorMap of digitalTwinInput.sensorsRef) {
			if (sensorMap.sensorId !== 0) {
				const sensor = await getSensorByPropName("id", sensorMap.sensorId);
				if (!sensor) throw new Error(`The sensor with id: ${sensorMap.sensorId} not exists`);
				sensors.push(sensor);
			} else {
				const topicIndex = digitalTwinInput.topicsRef.findIndex(topicMap => topicMap.topicRef === sensorMap.topicRef);
				const sensorData = {
					assetId,
					type: sensorMap.type,
					description: sensorMap.description,
					topicId: topicSensors[topicIndex].id,
					payloadKey: sensorMap.payloadKey,
					paramLabel: sensorMap.paramLabel,
					valueType: sensorMap.valueType,
					units: sensorMap.units,
					dashboardRefresh: sensorMap.dashboardRefresh,
					dashboardTimeWindow: sensorMap.dashboardTimeWindow
				}
				const sensorsUid = nanoid(20).replace(/-/g, "x").replace(/_/g, "X");
				const sensorDashboarId = await createSensorDashboard(group, sensorData, sensorsUid);
				const dashboardsInfo = await getDashboardsInfoFromIdArray([sensorDashboarId]);
				const dashboardsUrl = generateDashboardsUrl(dashboardsInfo);
				const sensor = await createNewSensor(assetId, sensorData, sensorDashboarId, dashboardsUrl[0], sensorsUid);
				sensors.push(sensor);
				const newSensorDashbardRef = {
					sensorId: sensor.id,
					dashboardId: sensorDashboarId
				}
				sensorDashboardsRef.push(newSensorDashbardRef);
			}
		}
	}

	let digitalTwinDashboardId = dashboardId;
	if (!dashboardId) {
		const dashboardTitle = `DT_${digitalTwinUid}`;
		const topicIndex = digitalTwinInput.topicsRef.findIndex(topicMap =>
			topicMap.topicRef === "dev2pdb_1" ||
			topicMap.topicRef === "dev2pdb_wt_1" ||
			topicMap.topicRef === "dev2pdb_ma_1"
		);
		const topicUid = topicSensors[topicIndex].topicUid;
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
		digitalTwinSimulationFormat: digitalTwinInput.digitalTwinSimulationFormat,
		dtRefFileName: digitalTwinInput.dtRefFileName,
		dtRefFileLastModifDate: digitalTwinInput.dtRefFileLastModifDate,
	};
	const digitalTwin = await insertDigitalTwin(digitalTwinUpdated);

	const digitalTwinTopicSensorQueries: any[] = [];
	for (let topicSensorIndex = 0; topicSensorIndex < topicSensors.length; topicSensorIndex++) {
		const topicRef = topicsRef[topicSensorIndex].topicRef;
		const topicSensorId = topicSensors[topicSensorIndex].id;
		const alreadyCreated = digitalTwinInput.topicsRef[topicSensorIndex].topicId !== 0;
		const digitalTwinTopicSensorQuery = createDigitalTwinTopic(digitalTwin.id, topicSensorId, topicRef, alreadyCreated)
		digitalTwinTopicSensorQueries.push(digitalTwinTopicSensorQuery);
	}
	await Promise.all(digitalTwinTopicSensorQueries);

	const digitalTwinSensorQueries: any[] = [];
	for (let sensorIndex = 0; sensorIndex < sensors.length; sensorIndex++) {
		const sensorId = sensors[sensorIndex].id;
		const topicId = sensors[sensorIndex].topicId;
		const sensorRef = digitalTwinInput.sensorsRef[sensorIndex].sensorRef;
		const alreadyCreated = digitalTwinInput.sensorsRef[sensorIndex].sensorId !== 0;
		const digitalTwinSensorQuery = createDigitalTwinSensor(digitalTwin.id, sensorId, sensorRef, topicId, alreadyCreated)
		digitalTwinSensorQueries.push(digitalTwinSensorQuery);
	}
	await Promise.all(digitalTwinSensorQueries);

	const digitalTwinSensorDashboardQueries: any[] = [];
	for (const sensor of sensors) {
		const sensorId = sensor.id;
		const sensorDashboardId = sensorDashboardsRef.filter(dashboard => dashboard.sensorId === sensorId)[0].dashboardId;
		if (sensorDashboardId) {
			const digitalTwinSensorDashboardQuery = createDigitalTwinSensorDashboard(
				digitalTwin.id,
				sensorId,
				sensorDashboardId
			)
			digitalTwinSensorDashboardQueries.push(digitalTwinSensorDashboardQuery);
		}
	}
	await Promise.all(digitalTwinSensorDashboardQueries);

	if (digitalTwinInput.type === "Gltf 3D model") {
		const sim2dtmTopicData =
		{
			topicType: "sim2dtm",
			description: `sim2dtm for DT_${digitalTwinUid}`,
			mqttAccessControl: "Pub & Sub"
		};
		const sim2dtmTopic = await createTopic(groupId, sim2dtmTopicData);
		await createDigitalTwinTopic(digitalTwin.id, sim2dtmTopic.id, "sim2dtm");

		const dtm2simTopicData =
		{
			topicType: "dtm2sim",
			topicName: `${digitalTwinUid}_dtm2sim`,
			description: `dtm2sim for DT_${digitalTwinUid}`,
			mqttAccessControl: "Pub & Sub"
		};
		const dtm2simTopic = await createTopic(groupId, dtm2simTopicData);
		await createDigitalTwinTopic(digitalTwin.id, dtm2simTopic.id, "dtm2sim");

		const dtm2pdbTopicData =
		{
			topicType: "dtm2pdb",
			topicName: `${digitalTwinUid}_dtm2pdb`,
			description: `dtm2pdb for DT_${digitalTwinUid}`,
			mqttAccessControl: "Pub & Sub"
		};
		const dtm2pdbTopic = await createTopic(groupId, dtm2pdbTopicData);
		await createDigitalTwinTopic(digitalTwin.id, dtm2pdbTopic.id, "dtm2pdb");

		const dev2dtmTopicData =
		{
			topicType: "dev2dtm",
			description: `dev2dtm for DT_${digitalTwinUid}`,
			mqttAccessControl: "Pub & Sub"
		};
		const dev2dtmTopic = await createTopic(groupId, dev2dtmTopicData);
		await createDigitalTwinTopic(digitalTwin.id, dev2dtmTopic.id, "dev2dtm");

		const dtm2devTopicData =
		{
			topicType: "dtm2dev",
			description: `dtm2dev for DT_${digitalTwinUid}`,
			mqttAccessControl: "Pub & Sub"
		};
		const dtm2devTopic = await createTopic(groupId, dtm2devTopicData);
		await createDigitalTwinTopic(digitalTwin.id, dtm2devTopic.id, "dtm2dev");

		const dev2simTopicData =
		{
			topicType: "dev2sim",
			description: `dev2sim for DT_${digitalTwinUid}`,
			mqttAccessControl: "Pub & Sub"
		};
		const dev2simTopic = await createTopic(groupId, dev2simTopicData);
		await createDigitalTwinTopic(digitalTwin.id, dev2simTopic.id, "dev2sim");
	}

	return { digitalTwin, topicsRef };
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

export const getDigitalTwinGltfData = async (digitalTwin: IDigitalTwin): Promise<IDigitalTwinGltfData> => {
	const orgId = digitalTwin.orgId;
	const groupId = digitalTwin.groupId;
	const digitalTwinId = digitalTwin.id;
	const keyBase = `org_${orgId}/group_${groupId}/digitalTwin_${digitalTwinId}`;
	const gltfFileFolder = `${keyBase}/gltfFile`;
	const gltfFileList = await getBucketFolderFileList(gltfFileFolder);

	let gltfFileData = '{}';
	if (gltfFileList.length !== 0) {
		const bucketParamsGltfFile = {
			Bucket: process_env.S3_BUCKET_NAME,
			Key: gltfFileList[0]
		};
		const data = await s3Client.send(new GetObjectCommand(bucketParamsGltfFile));
		gltfFileData = await data.Body.transformToString();
	}

	const mqttTopicsData = await getMqttTopicsData(digitalTwinId);
	const sensorsDashboards = await getSensorDashboardByDigitalTwinId(digitalTwinId);

	const gltfData = {
		id: digitalTwinId,
		gltfData: gltfFileData,
		digitalTwinSimulationFormat: digitalTwin.digitalTwinSimulationFormat,
		mqttTopicsData,
		sensorsDashboards
	}

	return gltfData;
}

export const getMqttTopicsData = async (digitalTwinId: number): Promise<IMqttTopicDataShort[]> => {
	const topicsData = await getMqttTopicsDataFromDigitalTwinData(digitalTwinId);
	const mqttTopicsData = topicsData.map(topicData => {
		let topicRef = topicData.topicRef;
		if (topicData.topicRef.slice(0, 7) === "dev2pdb") {
			topicRef = "dev2pdb";
		}
		if (topicData.topicRef.slice(0, 10) === "dev2pdb_wt") {
			topicRef = "dev2pdb_wt";
		}
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

const generateMqttTopic = (mqttTopicInfo: IMqttTopicInfo): string => {
	let topicType = mqttTopicInfo.topicType;
	if (mqttTopicInfo.topicType.slice(0, 7) === "dev2pdb") {
		topicType = "dev2pdb";
	}
	if (mqttTopicInfo.topicType.slice(0, 10) === "dev2pdb_wt") {
		topicType = "dev2pdb_wt";
	}
	const mqttTopic = `${topicType}/Group_${mqttTopicInfo.groupHash}/Topic_${mqttTopicInfo.topicHash}`;
	return mqttTopic;
}

const generateMqttDigitalTwinTopic = (mqttTopicInfo: IMqttDigitalTwinTopicInfo): string => {
	let topicRef = mqttTopicInfo.topicRef;
	if (mqttTopicInfo.topicRef.slice(0, 7) === "dev2pdb") {
		topicRef = "dev2pdb";
	}
	const mqttTopic = `${topicRef}/Group_${mqttTopicInfo.groupHash}/Topic_${mqttTopicInfo.topicHash}`;
	return mqttTopic;
}

export const generateSqlTopic = (mqttTopicInfo: IMqttTopicInfo): string => {
	const sqlTopic = `Topic_${mqttTopicInfo.topicHash}`;
	return sqlTopic;
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
				lastModified: fileinfo.LastModified.toString()
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

export const addTopicAndSensorReferences = async (
	digitalTwins: IDigitalTwin[]
) => {
	for (const digitalTwin of digitalTwins) {
		if (digitalTwin.dtRefFileName !== "-" && digitalTwin.dtRefFileLastModifDate !== "-") {
			const topicsRef = await getDTTopicsRefByDigitalTwinId(digitalTwin.id);
			digitalTwin.topicsRef = topicsRef;
			const sensorsRef = await getDTSensorsRef(digitalTwin.id);
			digitalTwin.sensorsRef = sensorsRef;
		} else {
			digitalTwin.topicsRef = [];
			digitalTwin.sensorsRef = [];
		}
	}
	return digitalTwins;
}





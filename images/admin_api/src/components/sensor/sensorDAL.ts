import { nanoid } from "nanoid";
import pool, { readQuery } from "../../config/dbconfig";
import CreateSensorDto from "./sensor.dto";
import ISensor from "./sensor.interface";
import ISensorState from "./sensorState.interface";
import ISensorType from "./sensorType.interface";
import CreateSensorTypeDto from "./sensorType.dto";
import ISensorDashboard from "./sensorDashboard.interface";
import natsClient from "../../config/natsConfig";
import { sensorMeasurementsString, sensorTypeMeasurementsString } from "../../utils/measurements/measurements";
import { refreshTopicsMessageSchema, topicIdsOfSensors } from "../topic/messageSchema";

export const insertSensorType = async (sensorTypeData: ISensorType): Promise<ISensorType> => {
	const queryString = `INSERT INTO grafanadb.sensor_type (org_id, sensor_type_uid,
		type, icon_svg_file_name, icon_svg_string, default_measurements, is_predefined,
		dashboard_refresh_string, dashboard_time_window, created, updated)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
		RETURNING id, org_id AS "orgId",
		sensor_type_uid AS "assetTypeUid", type,
		icon_svg_file_name AS "iconSvgFileName",
		icon_svg_string AS "iconSvgString", 
		default_measurements AS "defaultMeasurements",
        is_predefined AS "isPredefined",
		dashboard_refresh_string AS "dashboardRefreshString",
		dashboard_time_window AS "dashboardRefreshString",
		created, updated`;

	const result = await pool.query(queryString, [
		sensorTypeData.orgId,
		sensorTypeData.sensorTypeUid,
		sensorTypeData.type,
		sensorTypeData.iconSvgFileName,
		sensorTypeData.iconSvgString,
		sensorTypeMeasurementsString(sensorTypeData),
		sensorTypeData.isPredefined || false,
		sensorTypeData.dashboardRefreshString,
		sensorTypeData.dashboardTimeWindow,
	]);
	return result.rows[0] as ISensorType;
};

export const updateSensorTypeByPropName = async (
	propName: string,
	propValue: string | number,
	sensorType: ISensorType
): Promise<void> => {
	const query = `UPDATE grafanadb.sensor_type SET type = $1,
	            icon_svg_file_name = $2, icon_svg_string = $3,
				dashboard_refresh_string = $4, dashboard_time_window = $5,
				default_measurements = $6,
				updated = NOW()
				WHERE grafanadb.sensor_type.${propName} = $7;`;
	await pool.query(query, [
		sensorType.type,
		sensorType.iconSvgFileName,
		sensorType.iconSvgString,
		sensorType.dashboardRefreshString,
		sensorType.dashboardTimeWindow,
		sensorTypeMeasurementsString(sensorType),
		propValue,
	]);
	// el esquema de los tópicos de sus sensores usa las medidas del tipo cuando el sensor no tiene
	await refreshTopicsMessageSchema(
		await topicIdsOfSensors(
			`sensor_type_id IN (SELECT id FROM grafanadb.sensor_type WHERE grafanadb.sensor_type.${propName} = $1)`,
			[propValue]
		)
	);
};

export const createNewSensorType = async (sensorTypeData: CreateSensorTypeDto): Promise<ISensorType> => {
	const sensorTypeUid = nanoid(20).replace(/-/g, "x").replace(/_/g, "X");
	const sensorTypeInput: ISensorType = {
		...sensorTypeData,
		sensorTypeUid,
		defaultMeasurements: sensorTypeMeasurementsString(sensorTypeData),
	};
	const newSensorType = await insertSensorType(sensorTypeInput);
	return newSensorType;
};

export const deleteSensorTypeByPropName = async (propName: string, propValue: string | number): Promise<void> => {
	await pool.query(`DELETE FROM grafanadb.sensor_type WHERE ${propName} = $1`, [propValue]);
};

export const getAllSensorTypes = async (): Promise<ISensorType[]> => {
	const response = await readQuery(
		`SELECT grafanadb.sensor_type.id, 
		grafanadb.sensor_type.org_id AS "orgId",
		grafanadb.sensor_type.sensor_type_uid AS "sensorTypeUid",
		grafanadb.sensor_type.type,
		grafanadb.sensor_type.icon_svg_file_name AS "iconSvgFileName",
		grafanadb.sensor_type.icon_svg_string AS "iconSvgString",
		grafanadb.sensor_type.default_measurements AS "defaultMeasurements",
		grafanadb.sensor_type.dashboard_refresh_string AS "dashboardRefreshString",
		grafanadb.sensor_type.dashboard_time_window AS "dashboardTimeWindow",
		grafanadb.sensor_type.is_predefined AS "isPredefined",
		grafanadb.sensor_type.created, grafanadb.sensor_type.updated
		FROM grafanadb.sensor_type
		ORDER BY grafanadb.sensor_type.id  ASC;`
	);
	return response.rows as ISensorType[];
};

export const getSensorTypesByOrgsIdArray = async (orgsIdArray: number[]): Promise<ISensorType[]> => {
	const response = await readQuery(
		`SELECT grafanadb.sensor_type.id, 
		grafanadb.sensor_type.org_id AS "orgId",
		grafanadb.sensor_type.sensor_type_uid AS "sensorTypeUid",
		grafanadb.sensor_type.type,
		grafanadb.sensor_type.icon_svg_file_name AS "iconSvgFileName",
		grafanadb.sensor_type.icon_svg_string AS "iconSvgString",
		grafanadb.sensor_type.default_measurements AS "defaultMeasurements",
		grafanadb.sensor_type.dashboard_refresh_string AS "dashboardRefreshString",
		grafanadb.sensor_type.dashboard_time_window AS "dashboardTimeWindow",
		grafanadb.sensor_type.is_predefined AS "isPredefined",
		grafanadb.sensor_type.created, grafanadb.sensor_type.updated
		FROM grafanadb.sensor_type
		WHERE grafanadb.sensor_type.org_id = ANY($1::bigint[])
		ORDER BY grafanadb.sensor_type.id  ASC;`,
		[orgsIdArray]
	);
	return response.rows as ISensorType[];
};

export const getSensorTypesByOrgId = async (orgId: number): Promise<ISensorType[]> => {
	const response = await readQuery(
		`SELECT grafanadb.sensor_type.id, 
		grafanadb.sensor_type.org_id AS "orgId",
		grafanadb.sensor_type.sensor_type_uid AS "sensorTypeUid",
		grafanadb.sensor_type.type,
		grafanadb.sensor_type.icon_svg_file_name AS "iconSvgFileName",
		grafanadb.sensor_type.icon_svg_string AS "iconSvgString",
		grafanadb.sensor_type.default_measurements AS "defaultMeasurements",
		grafanadb.sensor_type.dashboard_refresh_string AS "dashboardRefreshString",
		grafanadb.sensor_type.dashboard_time_window AS "dashboardTimeWindow",
		grafanadb.sensor_type.is_predefined AS "isPredefined",
		grafanadb.sensor_type.created, grafanadb.sensor_type.updated
		FROM grafanadb.sensor_type
		WHERE grafanadb.sensor_type.org_id = $1
		ORDER BY grafanadb.sensor_type.id  ASC;`,
		[orgId]
	);
	return response.rows as ISensorType[];
};

export const getSensorTypeByPropName = async (
	orgId: number,
	propName: string,
	propValue: string | number
): Promise<ISensorType> => {
	const response = await readQuery(
		`SELECT grafanadb.sensor_type.id, 
		grafanadb.sensor_type.org_id AS "orgId",
		grafanadb.sensor_type.sensor_type_uid AS "sensorTypeUid",
		grafanadb.sensor_type.type,
		grafanadb.sensor_type.icon_svg_file_name AS "iconSvgFileName",
		grafanadb.sensor_type.icon_svg_string AS "iconSvgString",
		grafanadb.sensor_type.default_measurements AS "defaultMeasurements",
		grafanadb.sensor_type.dashboard_refresh_string AS "dashboardRefreshString",
		grafanadb.sensor_type.dashboard_time_window AS "dashboardTimeWindow",
		grafanadb.sensor_type.is_predefined AS "isPredefined",
		grafanadb.sensor_type.created, grafanadb.sensor_type.updated
		FROM grafanadb.sensor_type
		WHERE grafanadb.sensor_type.${propName} = $1 AND
		grafanadb.sensor_type.org_id = $2`,
		[propValue, orgId]
	);
	return response.rows[0] as ISensorType;
};

export const getSensorTypeByTypeAndOrgId = async (orgId: number, type: string): Promise<ISensorType> => {
	const response = await readQuery(
		`SELECT grafanadb.sensor_type.id, 
		grafanadb.sensor_type.org_id AS "orgId",
		grafanadb.sensor_type.sensor_type_uid AS "sensorTypeUid",
		grafanadb.sensor_type.type,
		grafanadb.sensor_type.icon_svg_file_name AS "iconSvgFileName",
		grafanadb.sensor_type.icon_svg_string AS "iconSvgString",
		grafanadb.sensor_type.default_measurements AS "defaultMeasurements",
		grafanadb.sensor_type.dashboard_refresh_string AS "dashboardRefreshString",
		grafanadb.sensor_type.dashboard_time_window AS "dashboardTimeWindow",
		grafanadb.sensor_type.is_predefined AS "isPredefined",
		grafanadb.sensor_type.created, grafanadb.sensor_type.updated
		FROM grafanadb.sensor_type
		WHERE grafanadb.sensor_type.type = $1 AND
		grafanadb.sensor_type.org_id = $2`,
		[type, orgId]
	);
	return response.rows[0] as ISensorType;
};

export const getNumASensorTypes = async (): Promise<number> => {
	const result = await readQuery(`SELECT COUNT(*) FROM grafanadb.sensor_type;`);
	return parseInt(result.rows[0].count, 10);
};

export const getNumSensorTypesByOrgsIdArray = async (orgsIdArray: number[]): Promise<number> => {
	const result = await readQuery(
		`SELECT COUNT(*) FROM grafanadb.sensor_type
		WHERE grafanadb.sensor_type.org_id = ANY($1::bigint[])`,
		[orgsIdArray]
	);
	return parseInt(result.rows[0].count, 10);
};

export const sensorName = (assetName: string, sensorType: string): string => {
	return `${assetName.replace(/ /g, "_")}_${sensorType.replace(/ /g, "_")}`;
};

export const insertSensor = async (sensorData: Partial<ISensor>): Promise<ISensor> => {
	const queryString = `INSERT INTO grafanadb.sensor (asset_id,
		sensor_uid, sensor_type_id, sensor_ref, topic_id, description,
		dashboard_id, dashboard_url, measurements, created, updated)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
		RETURNING  id, asset_id AS "assetId", sensor_uid AS "sensorUid",
		sensor_type_id AS "sensorTypeId", sensor_ref AS "sensorRef", 
		topic_id AS "topicId", description,
		dashboard_id AS "dashboardId",
		dashboard_url AS "dashboardUrl",
		measurements,
		created, updated`;

	const result = await pool.query(queryString, [
		sensorData.assetId,
		sensorData.sensorUid,
		sensorData.sensorTypeId,
		sensorData.sensorRef,
		sensorData.topicId,
		sensorData.description,
		sensorData.dashboardId,
		sensorData.dashboardUrl,
		sensorMeasurementsString(sensorData),
	]);
	await refreshTopicsMessageSchema([sensorData.topicId]);
	return result.rows[0] as ISensor;
};

export const updateSensorByPropName = async (
	propName: string,
	propValue: string | number,
	sensor: ISensor
): Promise<void> => {
	const previousTopicIds = await topicIdsOfSensors(`grafanadb.sensor.${propName} = $1`, [propValue]);
	const query = `UPDATE grafanadb.sensor SET description = $1,
				sensor_type_id = $2, topic_id = $3,
				measurements = $4, updated = NOW()
				WHERE grafanadb.sensor.${propName} = $5;`;
	await pool.query(query, [
		sensor.description,
		sensor.sensorTypeId,
		sensor.topicId,
		sensorMeasurementsString(sensor),
		propValue,
	]);
	await refreshTopicsMessageSchema([...previousTopicIds, sensor.topicId]);
};

export const deleteSensorByPropName = async (propName: string, propValue: string | number): Promise<void> => {
	const result = await pool.query<{ id: number; topicId: number; groupId: number }>(
		`DELETE FROM grafanadb.sensor WHERE ${propName} = $1
		RETURNING id, topic_id AS "topicId",
		(SELECT grafanadb.asset.group_id FROM grafanadb.asset WHERE grafanadb.asset.id = grafanadb.sensor.asset_id) AS "groupId"`,
		[propValue]
	);
	await refreshTopicsMessageSchema(result.rows.map((row) => row.topicId));
	for (const row of result.rows) {
		const context = {
			groupId: row.groupId,
		};
		await natsClient.jsPublish("sensor", "delete", row.id, context);
	}
};

export const createNewSensor = async (
	assetId: number,
	sensorData: Partial<CreateSensorDto>,
	dashboardId: number,
	dashboardUrl: string,
	sensorUid: string
): Promise<ISensor> => {
	const sensorInput: Partial<ISensor> = { ...sensorData, assetId, sensorUid, dashboardId, dashboardUrl };
	const newSensor = await insertSensor(sensorInput);
	return newSensor;
};

export const getSensorByPropName = async (propName: string, propValue: string | number): Promise<ISensor> => {
	const response = await readQuery(
		`SELECT grafanadb.sensor.id, 
		grafanadb.group.org_id AS "orgId",
		grafanadb.group.id AS "groupId", 
		grafanadb.group.group_uid AS "groupUid", 
		grafanadb.sensor.asset_id AS "assetId",
		grafanadb.asset.asset_uid AS "assetUid",
		grafanadb.sensor.sensor_uid AS "sensorUid",
		grafanadb.sensor.sensor_ref AS "sensorRef",
		grafanadb.sensor_type.type AS "sensorType",
		grafanadb.sensor.sensor_type_id AS "sensorTypeId",
		grafanadb.sensor.topic_id AS "topicId",
		grafanadb.topic.topic_uid AS "topicUid",
		grafanadb.asset_topic.topic_ref AS "topicRef",
		grafanadb.sensor.description,
		grafanadb.sensor.dashboard_id AS "dashboardId",
		grafanadb.sensor.dashboard_url AS "dashboardUrl",
		grafanadb.sensor.measurements,
		grafanadb.sensor.created, grafanadb.sensor.updated
		FROM grafanadb.sensor
		INNER JOIN grafanadb.asset ON grafanadb.sensor.asset_id = grafanadb.asset.id
		INNER JOIN grafanadb.group ON grafanadb.asset.group_id = grafanadb.group.id
		INNER JOIN grafanadb.topic ON grafanadb.topic.id = grafanadb.sensor.topic_id
		INNER JOIN grafanadb.asset_topic ON grafanadb.topic.id = grafanadb.asset_topic.topic_id
		INNER JOIN grafanadb.sensor_type ON grafanadb.sensor_type.id = grafanadb.sensor.sensor_type_id
		WHERE grafanadb.sensor.${propName} = $1`,
		[propValue]
	);
	return response.rows[0] as ISensor;
};

export const getAllSensors = async (): Promise<ISensor[]> => {
	const response = await readQuery(
		`SELECT grafanadb.sensor.id, 
		grafanadb.group.org_id AS "orgId",
		grafanadb.group.id AS "groupId", 
		grafanadb.group.group_uid AS "groupUid",
		grafanadb.sensor.asset_id AS "assetId",
		grafanadb.asset.asset_uid AS "assetUid",
		grafanadb.sensor.sensor_uid AS "sensorUid",
		grafanadb.sensor.sensor_ref AS "sensorRef",
		grafanadb.sensor_type.type AS "sensorType",
		grafanadb.sensor.sensor_type_id AS "sensorTypeId",
		grafanadb.sensor.topic_id AS "topicId",
		grafanadb.topic.topic_uid AS "topicUid",
		grafanadb.asset_topic.topic_ref AS "topicRef",
		grafanadb.sensor.description,
		grafanadb.sensor.dashboard_id AS "dashboardId",
		grafanadb.sensor.dashboard_url AS "dashboardUrl",
		grafanadb.sensor.measurements,
		grafanadb.sensor.created, grafanadb.sensor.updated
		FROM grafanadb.sensor
		INNER JOIN grafanadb.asset ON grafanadb.sensor.asset_id = grafanadb.asset.id
		INNER JOIN grafanadb.group ON grafanadb.asset.group_id = grafanadb.group.id
		INNER JOIN grafanadb.topic ON grafanadb.topic.id = grafanadb.sensor.topic_id
		INNER JOIN grafanadb.asset_topic ON grafanadb.topic.id = grafanadb.asset_topic.topic_id
		INNER JOIN grafanadb.sensor_type ON grafanadb.sensor_type.id = grafanadb.sensor.sensor_type_id
		ORDER BY grafanadb.sensor.asset_id ASC,
		grafanadb.sensor.sensor_ref ASC;`
	);
	return response.rows as ISensor[];
};

export const getNumSensors = async (): Promise<number> => {
	const result = await readQuery(`SELECT COUNT(*) FROM grafanadb.sensor;`);
	return parseInt(result.rows[0].count, 10);
};

export const getSensorsByGroupId = async (groupId: number): Promise<ISensor[]> => {
	const response = await readQuery(
		`SELECT grafanadb.sensor.id, 
		grafanadb.group.org_id AS "orgId",
		grafanadb.group.id AS "groupId",
		grafanadb.group.group_uid AS "groupUid",
		grafanadb.sensor.asset_id AS "assetId",
		grafanadb.asset.asset_uid AS "assetUid",
		grafanadb.sensor.sensor_uid AS "sensorUid",
		grafanadb.sensor.sensor_ref AS "sensorRef",
		grafanadb.sensor_type.type AS "sensorType",
		grafanadb.sensor.sensor_type_id AS "sensorTypeId",
		grafanadb.sensor.topic_id AS "topicId",
		grafanadb.topic.topic_uid AS "topicUid",
		grafanadb.asset_topic.topic_ref AS "topicRef",
		grafanadb.sensor.description,
		grafanadb.sensor.dashboard_id AS "dashboardId",
		grafanadb.sensor.dashboard_url AS "dashboardUrl",
		grafanadb.sensor.measurements,
		grafanadb.sensor.created, grafanadb.sensor.updated
		FROM grafanadb.sensor
		INNER JOIN grafanadb.asset ON grafanadb.sensor.asset_id = grafanadb.asset.id
		INNER JOIN grafanadb.group ON grafanadb.asset.group_id = grafanadb.group.id
		INNER JOIN grafanadb.topic ON grafanadb.topic.id = grafanadb.sensor.topic_id
		INNER JOIN grafanadb.asset_topic ON grafanadb.topic.id = grafanadb.asset_topic.topic_id
		INNER JOIN grafanadb.sensor_type ON grafanadb.sensor_type.id = grafanadb.sensor.sensor_type_id
		WHERE grafanadb.asset.group_id = $1
		ORDER BY grafanadb.sensor.asset_id ASC,
		grafanadb.sensor.sensor_ref ASC;`,
		[groupId]
	);
	return response.rows as ISensor[];
};

export const getSensorsByAssetId = async (assetId: number): Promise<ISensor[]> => {
	const response = await readQuery(
		`SELECT grafanadb.sensor.id, 
		grafanadb.group.org_id AS "orgId",
		grafanadb.group.id AS "groupId",
		grafanadb.group.group_uid AS "groupUid",
		grafanadb.sensor.asset_id AS "assetId",
		grafanadb.asset.asset_uid AS "assetUid",
		grafanadb.sensor.sensor_uid AS "sensorUid",
		grafanadb.sensor.sensor_ref AS "sensorRef",
		grafanadb.sensor_type.type AS "sensorType",
		grafanadb.sensor.sensor_type_id AS "sensorTypeId",
		grafanadb.sensor.topic_id AS "topicId",
		grafanadb.topic.topic_uid AS "topicUid",
		grafanadb.asset_topic.topic_ref AS "topicRef",
		grafanadb.sensor.description,
		grafanadb.sensor.dashboard_id AS "dashboardId",
		grafanadb.sensor.dashboard_url AS "dashboardUrl",
		grafanadb.sensor.measurements,
		grafanadb.sensor.created, grafanadb.sensor.updated
		FROM grafanadb.sensor
		INNER JOIN grafanadb.asset ON grafanadb.sensor.asset_id = grafanadb.asset.id
		INNER JOIN grafanadb.group ON grafanadb.asset.group_id = grafanadb.group.id
		INNER JOIN grafanadb.topic ON grafanadb.topic.id = grafanadb.sensor.topic_id
		INNER JOIN grafanadb.asset_topic ON grafanadb.topic.id = grafanadb.asset_topic.topic_id
		INNER JOIN grafanadb.sensor_type ON grafanadb.sensor_type.id = grafanadb.sensor.sensor_type_id
		WHERE grafanadb.asset.id = $1
		ORDER BY grafanadb.sensor.asset_id ASC,
		grafanadb.sensor.sensor_ref ASC;`,
		[assetId]
	);
	return response.rows as ISensor[];
};

export const getSensorDashboardByAssetId = async (assetId: number): Promise<ISensorDashboard[]> => {
	const queryString = `SELECT grafanadb.sensor.sensor_ref AS "sensorRef",
	                    grafanadb.sensor.id AS "sensorId", 
						grafanadb.sensor.dashboard_id AS "dashboardId",
						grafanadb.sensor.dashboard_url AS "dashboardUrl"
						FROM grafanadb.sensor
						WHERE grafanadb.sensor.asset_id = $1;`;
	const result = await pool.query(queryString, [assetId]);
	return result.rows as ISensorDashboard[];
};

export const getSensorsByGroupsIdArray = async (groupsIdArray: number[]): Promise<ISensor[]> => {
	const response = await readQuery(
		`SELECT grafanadb.sensor.id, 
		grafanadb.group.org_id AS "orgId",
		grafanadb.group.id AS "groupId",
		grafanadb.group.group_uid AS "groupUid", 
		grafanadb.sensor.asset_id AS "assetId",
		grafanadb.asset.asset_uid AS "assetUid",
		grafanadb.sensor.sensor_uid AS "sensorUid",
		grafanadb.sensor.sensor_ref AS "sensorRef",
		grafanadb.sensor_type.type AS "sensorType",
		grafanadb.sensor.sensor_type_id AS "sensorTypeId",
		grafanadb.sensor.topic_id AS "topicId",
		grafanadb.topic.topic_uid AS "topicUid",
		grafanadb.asset_topic.topic_ref AS "topicRef",
		grafanadb.sensor.description,
		grafanadb.sensor.dashboard_id AS "dashboardId",
		grafanadb.sensor.dashboard_url AS "dashboardUrl",
		grafanadb.sensor.measurements,
		grafanadb.sensor.created, grafanadb.sensor.updated
		FROM grafanadb.sensor
		INNER JOIN grafanadb.asset ON grafanadb.sensor.asset_id = grafanadb.asset.id
		INNER JOIN grafanadb.group ON grafanadb.asset.group_id = grafanadb.group.id
		INNER JOIN grafanadb.topic ON grafanadb.topic.id = grafanadb.sensor.topic_id
		INNER JOIN grafanadb.asset_topic ON grafanadb.topic.id = grafanadb.asset_topic.topic_id
		INNER JOIN grafanadb.sensor_type ON grafanadb.sensor_type.id = grafanadb.sensor.sensor_type_id
		WHERE grafanadb.asset.group_id = ANY($1::bigint[])
		ORDER BY grafanadb.sensor.asset_id ASC,
		grafanadb.sensor.sensor_ref ASC;`,
		[groupsIdArray]
	);
	return response.rows as ISensor[];
};

export const getSensorsByOrgId = async (orgId: number): Promise<ISensor[]> => {
	const response = await readQuery(
		`SELECT grafanadb.sensor.id, 
		grafanadb.group.org_id AS "orgId",
		grafanadb.group.id AS "groupId",
		grafanadb.group.group_uid AS "groupUid",
		grafanadb.sensor.asset_id AS "assetId",
		grafanadb.asset.asset_uid AS "assetUid",
		grafanadb.sensor.sensor_uid AS "sensorUid",
		grafanadb.sensor.sensor_ref AS "sensorRef",
		grafanadb.sensor_type.type AS "sensorType",
		grafanadb.sensor.sensor_type_id AS "sensorTypeId",
		grafanadb.sensor.topic_id AS "topicId",
		grafanadb.topic.topic_uid AS "topicUid",
		grafanadb.asset_topic.topic_ref AS "topicRef",
		grafanadb.sensor.description,
		grafanadb.sensor.dashboard_id AS "dashboardId",
		grafanadb.sensor.dashboard_url AS "dashboardUrl",
		grafanadb.sensor.measurements,
		grafanadb.sensor.created, grafanadb.sensor.updated
		FROM grafanadb.sensor
		INNER JOIN grafanadb.asset ON grafanadb.sensor.asset_id = grafanadb.asset.id
		INNER JOIN grafanadb.group ON grafanadb.asset.group_id = grafanadb.group.id
		INNER JOIN grafanadb.topic ON grafanadb.topic.id = grafanadb.sensor.topic_id
		INNER JOIN grafanadb.asset_topic ON grafanadb.topic.id = grafanadb.asset_topic.topic_id
		INNER JOIN grafanadb.sensor_type ON grafanadb.sensor_type.id = grafanadb.sensor.sensor_type_id
		WHERE grafanadb.group.org_id = $1
		ORDER BY grafanadb.sensor.asset_id ASC,
		grafanadb.sensor.sensor_ref ASC;`,
		[orgId]
	);
	return response.rows as ISensor[];
};

export const getAllGeolocationSensors = async (): Promise<ISensor[]> => {
	const response = await readQuery(
		`SELECT grafanadb.sensor.id, 
		grafanadb.group.org_id AS "orgId",
		grafanadb.group.id AS "groupId",
		grafanadb.group.group_uid AS "groupUid",
		grafanadb.sensor.asset_id AS "assetId",
		grafanadb.asset.asset_uid AS "assetUid",
		grafanadb.sensor.sensor_uid AS "sensorUid",
		grafanadb.sensor.sensor_ref AS "sensorRef",
		grafanadb.sensor_type.type AS "sensorType",
		grafanadb.sensor.sensor_type_id AS "sensorTypeId",
		grafanadb.sensor.topic_id AS "topicId",
		grafanadb.topic.topic_uid AS "topicUid",
		grafanadb.asset_topic.topic_ref AS "topicRef",
		grafanadb.sensor.description,
		grafanadb.sensor.dashboard_id AS "dashboardId",
		grafanadb.sensor.dashboard_url AS "dashboardUrl",
		grafanadb.sensor.measurements,
		grafanadb.sensor.created, grafanadb.sensor.updated
		FROM grafanadb.sensor
		INNER JOIN grafanadb.asset ON grafanadb.sensor.asset_id = grafanadb.asset.id
		INNER JOIN grafanadb.asset_type ON grafanadb.asset.asset_type_id = grafanadb.asset_type.id
		INNER JOIN grafanadb.group ON grafanadb.asset.group_id = grafanadb.group.id
		INNER JOIN grafanadb.topic ON grafanadb.topic.id = grafanadb.sensor.topic_id
		INNER JOIN grafanadb.asset_topic ON grafanadb.topic.id = grafanadb.asset_topic.topic_id
		INNER JOIN grafanadb.sensor_type ON grafanadb.sensor_type.id = grafanadb.sensor.sensor_type_id
		WHERE grafanadb.asset_type.geolocation_mode = $1 AND 
		(grafanadb.sensor_type.type = $2 OR grafanadb.sensor_type.type = $3)
		ORDER BY grafanadb.sensor.asset_id ASC,
		grafanadb.sensor.sensor_ref ASC;`,
		["dynamic", "Mobile geolocation", "Geolocation"]
	);
	return response.rows as ISensor[];
};

export const getGeolocationSensorsByGroupsIdArray = async (groupsIdArray: number[]): Promise<ISensor[]> => {
	const response = await readQuery(
		`SELECT grafanadb.sensor.id, 
		grafanadb.group.org_id AS "orgId",
		grafanadb.group.id AS "groupId",
		grafanadb.group.group_uid AS "groupUid",
		grafanadb.sensor.asset_id AS "assetId",
		grafanadb.asset.asset_uid AS "assetUid",
		grafanadb.sensor.sensor_uid AS "sensorUid",
		grafanadb.sensor.sensor_ref AS "sensorRef",
		grafanadb.sensor_type.type AS "sensorType",
		grafanadb.sensor.sensor_type_id AS "sensorTypeId",
		grafanadb.sensor.topic_id AS "topicId",
		grafanadb.topic.topic_uid AS "topicUid",
		grafanadb.asset_topic.topic_ref AS "topicRef",
		grafanadb.sensor.description,
		grafanadb.sensor.dashboard_id AS "dashboardId",
		grafanadb.sensor.dashboard_url AS "dashboardUrl",
		grafanadb.sensor.measurements,
		grafanadb.sensor.created, grafanadb.sensor.updated
		FROM grafanadb.sensor
		INNER JOIN grafanadb.asset ON grafanadb.sensor.asset_id = grafanadb.asset.id
		INNER JOIN grafanadb.asset_type ON grafanadb.asset.asset_type_id = grafanadb.asset_type.id
		INNER JOIN grafanadb.group ON grafanadb.asset.group_id = grafanadb.group.id
		INNER JOIN grafanadb.topic ON grafanadb.topic.id = grafanadb.sensor.topic_id
		INNER JOIN grafanadb.asset_topic ON grafanadb.topic.id = grafanadb.asset_topic.topic_id
		INNER JOIN grafanadb.sensor_type ON grafanadb.sensor_type.id = grafanadb.sensor.sensor_type_id
		WHERE grafanadb.asset.group_id = ANY($1::bigint[]) AND
		grafanadb.asset_type.geolocation_mode = $2 AND 
		(grafanadb.sensor_type.type = $3 OR grafanadb.sensor_type.type = $4)
		ORDER BY grafanadb.sensor.asset_id ASC,
		grafanadb.sensor.sensor_ref ASC;`,
		[groupsIdArray, "dynamic", "Mobile geolocation", "Geolocation"]
	);
	return response.rows as ISensor[];
};

export const getNumSensorsByGroupsIdArray = async (groupsIdArray: number[]): Promise<number> => {
	const result = await readQuery(
		`SELECT COUNT(*) FROM grafanadb.sensor
		INNER JOIN grafanadb.asset ON grafanadb.sensor.asset_id = grafanadb.asset.id
		WHERE grafanadb.asset.group_id = ANY($1::bigint[])`,
		[groupsIdArray]
	);
	return parseInt(result.rows[0].count, 10);
};

export const getStateOfAllSensors = async (): Promise<ISensorState[]> => {
	const response = await readQuery(
		`SELECT grafanadb.sensor.id AS "sensorId", grafanadb.group.org_id AS "orgId",
		grafanadb.group.id AS "groupId", grafanadb.sensor.asset_id AS "assetId",
		grafanadb.alert.state
		FROM grafanadb.sensor
		INNER JOIN grafanadb.asset ON grafanadb.sensor.asset_id = grafanadb.asset.id
		INNER JOIN grafanadb.group ON grafanadb.asset.group_id = grafanadb.group.id
		LEFT JOIN grafanadb.alert ON grafanadb.sensor.dashboard_id = grafanadb.alert.dashboard_id
		ORDER BY grafanadb.group.org_id ASC,
				grafanadb.asset.group_id ASC,
				grafanadb.sensor.id ASC;`
	);
	return response.rows as ISensorState[];
};

export const getStateOfSensorsByGroupsIdArray = async (groupsIdArray: number[]): Promise<ISensorState[]> => {
	const response = await readQuery(
		`SELECT grafanadb.sensor.id AS "sensorId", grafanadb.group.org_id AS "orgId",
		grafanadb.group.id AS "groupId", grafanadb.sensor.asset_id AS "assetId",
		grafanadb.alert.state
		FROM grafanadb.sensor
		INNER JOIN grafanadb.asset ON grafanadb.sensor.asset_id = grafanadb.asset.id
		INNER JOIN grafanadb.group ON grafanadb.asset.group_id = grafanadb.group.id
		LEFT JOIN grafanadb.alert ON grafanadb.sensor.dashboard_id = grafanadb.alert.dashboard_id
		WHERE grafanadb.asset.group_id = ANY($1::bigint[])
		ORDER BY grafanadb.group.org_id ASC,
		grafanadb.asset.group_id ASC,
		grafanadb.sensor.id ASC;`,
		[groupsIdArray]
	);
	return response.rows as ISensorState[];
};
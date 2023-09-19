import { nanoid } from "nanoid";
import pool from "../../config/dbconfig";
import IGroup from "../group/interfaces/Group.interface";
import CreateSensorDto from "./sensor.dto";
import ISensor from "./sensor.interface";
import { createSensorDashboard } from "../group/dashboardDAL";

export const insertSensor = async (sensorData: ISensor): Promise<ISensor> => {
	const queryString = `INSERT INTO grafanadb.sensor (asset_id,
		sensor_uid, name, description, topic_id, payload_key, 
		param_label, value_type, units, dashboard_id, created, updated)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
		RETURNING  id, group_id AS "groupId", asset_uid AS "assetUid",
		name, description, icon_radio AS "iconRadio",
		geolocation[0] AS longitude, geolocation[1] AS latitude, 
		created, updated`;

	const result = await pool.query(queryString,
		[
			sensorData.assetId,
			sensorData.sensorUid,
			sensorData.name,
			sensorData.description,
			sensorData.topicId,
			sensorData.payloadKey,
			sensorData.paramLabel,
			sensorData.valueType,
			sensorData.units,
			sensorData.dashboardId,
		]);
	return result.rows[0] as ISensor;
};

export const updateSensorByPropName = async (propName: string, propValue: (string | number), sensor: ISensor): Promise<void> => {
	const query = `UPDATE grafanadb.sensor SET name = $1, description = $2,
				topic_id = $3, payload_key = $4, param_label = $5, value_type = $6,
				units = $7, updated = NOW()
				WHERE grafanadb.asset.${propName} = $8;`;
	await pool.query(query, [
		sensor.name,
		sensor.description,
		sensor.topicId,
		sensor.payloadKey,
		sensor.paramLabel,
		sensor.valueType,
		sensor.units,
		propValue
	]);
};

export const deleteSensorByPropName = async (propName: string, propValue: (string | number)): Promise<void> => {
	await pool.query(`DELETE FROM grafanadb.sensor WHERE ${propName} = $1`, [propValue]);
};

export const createNewSensor = async (group: IGroup, sensorData: CreateSensorDto): Promise<ISensor> => {
	const sensorUid = nanoid(20).replace(/-/g, "x").replace(/_/g, "X");
	const dashboardId = await createSensorDashboard(group, sensorData);

	const sensorInput: ISensor = { ...sensorData, dashboardId, sensorUid };
	const newSensor = await insertSensor(sensorInput);
	return newSensor;
};

export const getSensorByPropName = async (propName: string, propValue: (string | number)): Promise<ISensor> => {
	const response = await pool.query(`SELECT grafanadb.sensor.id, grafanadb.group.org_id AS "orgId",
	                                grafanadb.group.id AS "groupId", grafanadb.sensor.asset_id AS "assetId",
									grafanadb.sensor.sensor_uid AS "sensorUid",
									grafanadb.sensor.name, grafanadb.sensor.description, 
									grafanadb.sensor.topic_id AS "topicId",
									grafanadb.sensor.payload_key AS "payloadKey",
									grafanadb.sensor.param_label AS "paramLabel",
									grafanadb.sensor.value_type AS "valueType",
									grafanadb.sensor.units,
									grafanadb.sensor.created, grafanadb.sensor.updated
									FROM grafanadb.sensor
									INNER JOIN grafanadb.asset ON grafanadb.sensor.asset_id = grafanadb.asset.id
									INNER JOIN grafanadb.group ON grafanadb.asset.group_id = grafanadb.group.id
									WHERE grafanadb.sensor.${propName} = $1`, [propValue]);
	return response.rows[0] as ISensor;
}

export const getAllSensors = async (): Promise<ISensor[]> => {
	const response = await pool.query(`SELECT grafanadb.sensor.id, grafanadb.group.org_id AS "orgId",
									grafanadb.group.id AS "groupId", grafanadb.sensor.asset_id AS "assetId",
									grafanadb.sensor.sensor_uid AS "sensorUid",
									grafanadb.sensor.name, grafanadb.sensor.description, 
									grafanadb.sensor.topic_id AS "topicId",
									grafanadb.sensor.payload_key AS "payloadKey",
									grafanadb.sensor.param_label AS "paramLabel",
									grafanadb.sensor.value_type AS "valueType",
									grafanadb.sensor.units,
									grafanadb.sensor.created, grafanadb.sensor.updated
									FROM grafanadb.sensor
									INNER JOIN grafanadb.asset ON grafanadb.sensor.asset_id = grafanadb.asset.id
									INNER JOIN grafanadb.group ON grafanadb.asset.group_id = grafanadb.group.id
									ORDER BY grafanadb.sensor.id  ASC;`);
	return response.rows as ISensor[];
}

export const getNumSensors = async (): Promise<number> => {
	const result = await pool.query(`SELECT COUNT(*) FROM grafanadb.sensor;`);
	return parseInt(result.rows[0].count, 10);
}

export const getSensorsByGroupId = async (groupId: number): Promise<ISensor[]> => {
	const response = await pool.query(`SELECT grafanadb.sensor.id, grafanadb.group.org_id AS "orgId",
									grafanadb.group.id AS "groupId", grafanadb.sensor.asset_id AS "assetId",
									grafanadb.sensor.sensor_uid AS "sensorUid",
									grafanadb.sensor.name, grafanadb.sensor.description, 
									grafanadb.sensor.topic_id AS "topicId",
									grafanadb.sensor.payload_key AS "payloadKey",
									grafanadb.sensor.param_label AS "paramLabel",
									grafanadb.sensor.value_type AS "valueType",
									grafanadb.sensor.units,
									grafanadb.sensor.created, grafanadb.sensor.updated
									FROM grafanadb.sensor
									INNER JOIN grafanadb.asset ON grafanadb.sensor.asset_id = grafanadb.asset.id
									INNER JOIN grafanadb.group ON grafanadb.asset.group_id = grafanadb.group.id
									WHERE grafanadb.asset.group_id = $1
									ORDER BY grafanadb.sensor.id  ASC`, [groupId]);
	return response.rows as ISensor[];
};

export const getSensorsByAssetId = async (assetId: number): Promise<ISensor[]> => {
	const response = await pool.query(`SELECT grafanadb.sensor.id, grafanadb.group.org_id AS "orgId",
									grafanadb.group.id AS "groupId", grafanadb.sensor.asset_id AS "assetId",
									grafanadb.sensor.sensor_uid AS "sensorUid",
									grafanadb.sensor.name, grafanadb.sensor.description, 
									grafanadb.sensor.topic_id AS "topicId",
									grafanadb.sensor.payload_key AS "payloadKey",
									grafanadb.sensor.param_label AS "paramLabel",
									grafanadb.sensor.value_type AS "valueType",
									grafanadb.sensor.units,
									grafanadb.sensor.created, grafanadb.sensor.updated
									FROM grafanadb.sensor
									INNER JOIN grafanadb.asset ON grafanadb.sensor.asset_id = grafanadb.asset.id
									INNER JOIN grafanadb.group ON grafanadb.asset.group_id = grafanadb.group.id
									WHERE grafanadb.asset.id = $1
									ORDER BY grafanadb.sensor.id  ASC`, [assetId]);
	return response.rows as ISensor[];
}

export const getSensorsByGroupsIdArray = async (groupsIdArray: number[]): Promise<ISensor[]> => {
	const response = await pool.query(`SELECT grafanadb.sensor.id, grafanadb.group.org_id AS "orgId",
									grafanadb.group.id AS "groupId", grafanadb.sensor.asset_id AS "assetId",
									grafanadb.sensor.sensor_uid AS "sensorUid",
									grafanadb.sensor.name, grafanadb.sensor.description, 
									grafanadb.sensor.topic_id AS "topicId",
									grafanadb.sensor.payload_key AS "payloadKey",
									grafanadb.sensor.param_label AS "paramLabel",
									grafanadb.sensor.value_type AS "valueType",
									grafanadb.sensor.units,
									grafanadb.sensor.created, grafanadb.sensor.updated
									FROM grafanadb.sensor
									INNER JOIN grafanadb.asset ON grafanadb.sensor.asset_id = grafanadb.asset.id
									INNER JOIN grafanadb.group ON grafanadb.asset.group_id = grafanadb.group.id
									WHERE grafanadb.asset.group_id = ANY($1::bigint[])
									ORDER BY grafanadb.sensor.id  ASC`, [groupsIdArray]);
	return response.rows as ISensor[];
};


export const getNumSensorsByGroupsIdArray = async (groupsIdArray: number[]): Promise<number> => {
	const result = await pool.query(`SELECT COUNT(*) FROM grafanadb.sensor
									INNER JOIN grafanadb.asset ON grafanadb.sensor.asset_id = grafanadb.asset.id
									WHERE grafanadb.asset.group_id = ANY($1::bigint[])`, [groupsIdArray]);
	return parseInt(result.rows[0].count, 10);
}

export const getSensorsByOrgId = async (orgId: number): Promise<ISensor[]> => {
	const response = await pool.query(`SELECT grafanadb.sensor.id, grafanadb.group.org_id AS "orgId",
									grafanadb.group.id AS "groupId", grafanadb.sensor.asset_id AS "assetId",
									grafanadb.sensor.sensor_uid AS "sensorUid",
									grafanadb.sensor.name, grafanadb.sensor.description, 
									grafanadb.sensor.topic_id AS "topicId",
									grafanadb.sensor.payload_key AS "payloadKey",
									grafanadb.sensor.param_label AS "paramLabel",
									grafanadb.sensor.value_type AS "valueType",
									grafanadb.sensor.units,
									grafanadb.sensor.created, grafanadb.sensor.updated
									FROM grafanadb.sensor
									INNER JOIN grafanadb.asset ON grafanadb.sensor.asset_id = grafanadb.asset.id
									INNER JOIN grafanadb.group ON grafanadb.asset.group_id = grafanadb.group.id
									WHERE grafanadb.group.org_id = $1
									ORDER BY grafanadb.sensor.id  ASC`, [orgId]);
	return response.rows as ISensor[];
};

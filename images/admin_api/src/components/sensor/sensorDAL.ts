import pool from "../../config/dbconfig";
import CreateSensorDto from "./sensor.dto";
import ISensor from "./sensor.interface";

export const sensorName = (assetName: string, sensorType: string): string => {
	return  `${assetName.replace(/ /g, "_")}_${sensorType.replace(/ /g, "_")}`;
}

export const insertSensor = async (sensorData: ISensor): Promise<ISensor> => {
	const queryString = `INSERT INTO grafanadb.sensor (asset_id,
		sensor_uid, description, topic_id, payload_key, 
		param_label, value_type, units, dashboard_id, created, updated)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
		RETURNING  id, sensor_uid AS "sensorUid",
		description, topic_id AS "topicId", payload_key AS "payloadKey",
		param_label AS "paramLabel", value_type AS "valueType", units,
		dashboard_id AS "dashboardId",
		created, updated`;

	const result = await pool.query(queryString,
		[
			sensorData.assetId,
			sensorData.sensorUid,
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
	const query = `UPDATE grafanadb.sensor SET description = $1,
				topic_id = $2, payload_key = $3,
				param_label = $4, value_type = $5,
				units = $6, updated = NOW()
				WHERE grafanadb.asset.${propName} = $7;`;
	await pool.query(query, [
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

export const createNewSensor = async (
	sensorData: CreateSensorDto,
	dashboardId: number,
	sensorUid: string
): Promise<ISensor> => {
	const sensorInput: ISensor = { ...sensorData, sensorUid, dashboardId };
	const newSensor = await insertSensor(sensorInput);
	return newSensor;
};

export const getSensorByPropName = async (propName: string, propValue: (string | number)): Promise<ISensor> => {
	const response = await pool.query(`SELECT grafanadb.sensor.id, grafanadb.group.org_id AS "orgId",
	                                grafanadb.group.id AS "groupId", grafanadb.sensor.asset_id AS "assetId",
									grafanadb.sensor.sensor_uid AS "sensorUid",
									grafanadb.sensor.description, 
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
									grafanadb.sensor.description, 
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
									grafanadb.sensor.description, 
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
									grafanadb.sensor.description, 
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
									grafanadb.sensor.description, 
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
									grafanadb.sensor.description, 
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

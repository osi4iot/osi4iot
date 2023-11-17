import { nanoid } from "nanoid";
import pool from "../../config/dbconfig";
import CreateSensorDto from "./sensor.dto";
import ISensor from "./sensor.interface";
import ISensorState from "./sensorState.interface";
import ISensorType from "./sensorType.interface";
import CreateSensorTypeDto from "./sensorType.dto";
import ISensorDashboard from "./sensorDashboard.interface";

export const insertSensorType = async (sensorTypeData: ISensorType): Promise<ISensorType> => {
	const queryString = `INSERT INTO grafanadb.sensor_type (org_id, sensor_type_uid,
		type, icon_svg_file_name, icon_svg_string, marker_svg_file_name,
		marker_svg_string,  default_payload_json_schema, is_predefined,
		dashboard_refresh_string, dashboard_time_window, created, updated)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
		RETURNING id, org_id AS "orgId",
		sensor_type_uid AS "assetTypeUid", type,
		icon_svg_file_name AS "iconSvgFileName",
		icon_svg_string AS "iconSvgString", 
		marker_svg_file_name AS "markerSvgFileName",
		marker_svg_string  AS "markerSvgString",
		default_payload_json_schema AS "defaultPayloadJsonSchema",
        is_predefined AS "isPredefined",
		dashboard_refresh_string AS "dashboardRefreshString",
		dashboard_time_window AS "dashboardRefreshString",
		created, updated`;

	const result = await pool.query(queryString,
		[
			sensorTypeData.orgId,
			sensorTypeData.sensorTypeUid,
			sensorTypeData.type,
			sensorTypeData.iconSvgFileName,
			sensorTypeData.iconSvgString,
			sensorTypeData.markerSvgFileName,
			sensorTypeData.markerSvgString,
			sensorTypeData.defaultPayloadJsonSchema,
			sensorTypeData.isPredefined || false,
			sensorTypeData.dashboardRefreshString,
			sensorTypeData.dashboardTimeWindow
		]);
	return result.rows[0] as ISensorType;
};

export const updateSensorTypeByPropName = async (
	propName: string,
	propValue: (string | number),
	sensorType: ISensorType
): Promise<void> => {
	const query = `UPDATE grafanadb.sensor_type SET type = $1,
	            icon_svg_file_name = $2, icon_svg_string = $3,
				marker_svg_file_name = $4, marker_svg_string = $5,
				default_payload_json_schema = $6,
				updated = NOW()
				WHERE grafanadb.sensor_type.${propName} = $7;`;
	await pool.query(query, [
		sensorType.type,
		sensorType.iconSvgFileName,
		sensorType.iconSvgString,
		sensorType.markerSvgFileName,
		sensorType.markerSvgString,
		sensorType.defaultPayloadJsonSchema,
		propValue
	]);
};

export const createNewSensorType = async (sensorTypeData: CreateSensorTypeDto): Promise<ISensorType> => {
	const sensorTypeUid = nanoid(20).replace(/-/g, "x").replace(/_/g, "X");
	const sensorTypeInput: ISensorType = { ...sensorTypeData, sensorTypeUid };
	const newSensorType = await insertSensorType(sensorTypeInput);
	return newSensorType;
};

export const deleteSensorTypeByPropName = async (propName: string, propValue: (string | number)): Promise<void> => {
	await pool.query(`DELETE FROM grafanadb.sensor_type WHERE ${propName} = $1`, [propValue]);
};

export const getAllSensorTypes = async (): Promise<ISensorType[]> => {
	const response = await pool.query(`SELECT grafanadb.sensor_type.id, 
	                                grafanadb.sensor_type.org_id AS "orgId",
									grafanadb.sensor_type.sensor_type_uid AS "sensorTypeUid",
									grafanadb.sensor_type.type,
									grafanadb.sensor_type.icon_svg_file_name AS "iconSvgFileName",
									grafanadb.sensor_type.icon_svg_string AS "iconSvgString",
									grafanadb.sensor_type.marker_svg_file_name AS "markerSvgFileName",
									grafanadb.sensor_type.marker_svg_string AS "markerSvgString",
									grafanadb.sensor_type.default_payload_json_schema AS "defaultPayloadJsonSchema",
									grafanadb.sensor_type.dashboard_refresh_string AS "dashboardRefreshString",
									grafanadb.sensor_type.dashboard_time_window AS "dashboardTimeWindow",
									grafanadb.sensor_type.is_predefined AS "isPredefined",
									grafanadb.sensor_type.created, grafanadb.sensor_type.updated
									FROM grafanadb.sensor_type
									ORDER BY grafanadb.sensor_type.id  ASC;`);
	return response.rows as ISensorType[];
};

export const getSensorTypesByOrgsIdArray = async (orgsIdArray: number[]): Promise<ISensorType[]> => {
	const response = await pool.query(`SELECT grafanadb.sensor_type.id, 
									grafanadb.sensor_type.org_id AS "orgId",
									grafanadb.sensor_type.sensor_type_uid AS "sensorTypeUid",
									grafanadb.sensor_type.type,
									grafanadb.sensor_type.icon_svg_file_name AS "iconSvgFileName",
									grafanadb.sensor_type.icon_svg_string AS "iconSvgString",
									grafanadb.sensor_type.marker_svg_file_name AS "markerSvgFileName",
									grafanadb.sensor_type.marker_svg_string AS "markerSvgString",
									grafanadb.sensor_type.default_payload_json_schema AS "defaultPayloadJsonSchema",
									grafanadb.sensor_type.dashboard_refresh_string AS "dashboardRefreshString",
									grafanadb.sensor_type.dashboard_time_window AS "dashboardTimeWindow",
									grafanadb.sensor_type.is_predefined AS "isPredefined",
									grafanadb.sensor_type.created, grafanadb.sensor_type.updated
									FROM grafanadb.sensor_type
									WHERE grafanadb.sensor_type.org_id = ANY($1::bigint[])
									ORDER BY grafanadb.sensor_type.id  ASC;`, [orgsIdArray]);
	return response.rows as ISensorType[];
};

export const getSensorTypesByOrgId = async (orgId: number): Promise<ISensorType[]> => {
	const response = await pool.query(`SELECT grafanadb.sensor_type.id, 
									grafanadb.sensor_type.org_id AS "orgId",
									grafanadb.sensor_type.sensor_type_uid AS "sensorTypeUid",
									grafanadb.sensor_type.type,
									grafanadb.sensor_type.icon_svg_file_name AS "iconSvgFileName",
									grafanadb.sensor_type.icon_svg_string AS "iconSvgString",
									grafanadb.sensor_type.marker_svg_file_name AS "markerSvgFileName",
									grafanadb.sensor_type.marker_svg_string AS "markerSvgString",
									grafanadb.sensor_type.default_payload_json_schema AS "defaultPayloadJsonSchema",
									grafanadb.sensor_type.dashboard_refresh_string AS "dashboardRefreshString",
									grafanadb.sensor_type.dashboard_time_window AS "dashboardTimeWindow",
									grafanadb.sensor_type.is_predefined AS "isPredefined",
									grafanadb.sensor_type.created, grafanadb.sensor_type.updated
									WHERE grafanadb.sensor_type.org_id = $1
									ORDER BY grafanadb.sensor_type.id  ASC;`, [orgId]);
	return response.rows as ISensorType[];
};

export const getSensorTypeByPropName = async (
	orgId: number,
	propName: string,
	propValue: (string | number)
): Promise<ISensorType> => {
	const response = await pool.query(`SELECT grafanadb.sensor_type.id, 
									grafanadb.sensor_type.org_id AS "orgId",
									grafanadb.sensor_type.sensor_type_uid AS "sensorTypeUid",
									grafanadb.sensor_type.type,
									grafanadb.sensor_type.icon_svg_file_name AS "iconSvgFileName",
									grafanadb.sensor_type.icon_svg_string AS "iconSvgString",
									grafanadb.sensor_type.marker_svg_file_name AS "markerSvgFileName",
									grafanadb.sensor_type.marker_svg_string AS "markerSvgString",
									grafanadb.sensor_type.default_payload_json_schema AS "defaultPayloadJsonSchema",
									grafanadb.sensor_type.dashboard_refresh_string AS "dashboardRefreshString",
									grafanadb.sensor_type.dashboard_time_window AS "dashboardTimeWindow",
									grafanadb.sensor_type.is_predefined AS "isPredefined",
									grafanadb.sensor_type.created, grafanadb.sensor_type.updated
									WHERE grafanadb.sensor_type.${propName} = $1 AND
									grafanadb.sensor_type.org_id = $2`, [propValue, orgId]);
	return response.rows[0] as ISensorType;
}

export const getSensorTypeByTypeAndOrgId = async (
	orgId: number,
	type: string,
): Promise<ISensorType> => {
	const response = await pool.query(`SELECT grafanadb.sensor_type.id, 
									grafanadb.sensor_type.org_id AS "orgId",
									grafanadb.sensor_type.sensor_type_uid AS "sensorTypeUid",
									grafanadb.sensor_type.type,
									grafanadb.sensor_type.icon_svg_file_name AS "iconSvgFileName",
									grafanadb.sensor_type.icon_svg_string AS "iconSvgString",
									grafanadb.sensor_type.marker_svg_file_name AS "markerSvgFileName",
									grafanadb.sensor_type.marker_svg_string AS "markerSvgString",
									grafanadb.sensor_type.default_payload_json_schema AS "defaultPayloadJsonSchema",
									grafanadb.sensor_type.dashboard_refresh_string AS "dashboardRefreshString",
									grafanadb.sensor_type.dashboard_time_window AS "dashboardTimeWindow",
									grafanadb.sensor_type.is_predefined AS "isPredefined",
									grafanadb.sensor_type.created, grafanadb.sensor_type.updated
									WHERE grafanadb.sensor_type.type = $1 AND
									grafanadb.sensor_type.org_id = $2`, [type, orgId]);
	return response.rows[0] as ISensorType;
}

export const getNumASensorTypes = async (): Promise<number> => {
	const result = await pool.query(`SELECT COUNT(*) FROM grafanadb.sensor_type;`);
	return parseInt(result.rows[0].count, 10);
}

export const getNumSensorTypesByOrgsIdArray = async (orgsIdArray: number[]): Promise<number> => {
	const result = await pool.query(`SELECT COUNT(*) FROM grafanadb.sensor_type
									WHERE grafanadb.sensor_type.org_id = ANY($1::bigint[])`, [orgsIdArray]);
	return parseInt(result.rows[0].count, 10);
}

export const sensorName = (assetName: string, sensorType: string): string => {
	return `${assetName.replace(/ /g, "_")}_${sensorType.replace(/ /g, "_")}`;
}

export const insertSensor = async (sensorData: Partial<ISensor>): Promise<ISensor> => {
	const queryString = `INSERT INTO grafanadb.sensor (asset_id,
		sensor_uid, description, sensor_type_id, sensor_ref,
		topic_id, dashboard_id, dashboard_url, created, updated)
		VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
		RETURNING  id, sensor_uid AS "sensorUid",
		description, topic_id AS "topicId", sensor_type_id AS "sensorTypeId",
		dashboard_id AS "dashboardId", dashboard_url AS "dashboardUrl",
		created, updated`;

	const result = await pool.query(queryString,
		[
			sensorData.assetId,
			sensorData.sensorUid,
			sensorData.description,
			sensorData.sensorTypeId,
			sensorData.sensorRef,
			sensorData.topicId,
			sensorData.dashboardId,
			sensorData.dashboardUrl,
		]);
	return result.rows[0] as ISensor;
};

export const updateSensorByPropName = async (propName: string, propValue: (string | number), sensor: ISensor): Promise<void> => {
	const query = `UPDATE grafanadb.sensor SET description = $1,
				sensor_type_id = $2, topic_id = $3, sensor_ref = $4,
				updated = NOW()
				WHERE grafanadb.sensor.${propName} = $5;`;
	await pool.query(query, [
		sensor.description,
		sensor.sensorTypeId,
		sensor.topicId,
		sensor.sensorRef,
		propValue
	]);
};

export const deleteSensorByPropName = async (propName: string, propValue: (string | number)): Promise<void> => {
	await pool.query(`DELETE FROM grafanadb.sensor WHERE ${propName} = $1`, [propValue]);
};

export const deleteSensorsByIdArray = async (sensorsId: number[]): Promise<void> => {
	await pool.query(`DELETE FROM grafanadb.sensor WHERE id = ANY($1::bigint[]);`, [sensorsId]);
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

export const getSensorByPropName = async (propName: string, propValue: (string | number)): Promise<ISensor> => {
	const response = await pool.query(`SELECT grafanadb.sensor.id, grafanadb.group.org_id AS "orgId",
	                                grafanadb.group.id AS "groupId", grafanadb.sensor.asset_id AS "assetId",
									grafanadb.sensor.sensor_uid AS "sensorUid",
									grafanadb.sensor.type,
									grafanadb.sensor.description, 
									grafanadb.sensor.topic_id AS "topicId",
									grafanadb.topic.topic_uid AS "topicUid",
									grafanadb.sensor.sensor_ref AS "sensorRef",
									grafanadb.sensor.payload_key AS "payloadKey",
									grafanadb.sensor.param_label AS "paramLabel",
									grafanadb.sensor.value_type AS "valueType",
									grafanadb.sensor.units,
									grafanadb.sensor.dashboard_id AS "dashboardId",
									grafanadb.sensor.dashboard_url AS "dashboardUrl",
									grafanadb.sensor.created, grafanadb.sensor.updated
									FROM grafanadb.sensor
									INNER JOIN grafanadb.asset ON grafanadb.sensor.asset_id = grafanadb.asset.id
									INNER JOIN grafanadb.group ON grafanadb.asset.group_id = grafanadb.group.id
									INNER JOIN grafanadb.topic ON grafanadb.topic.id = grafanadb.sensor.topic_id
									WHERE grafanadb.sensor.${propName} = $1`, [propValue]);
	return response.rows[0] as ISensor;
}


export const getAllSensors = async (): Promise<ISensor[]> => {
	const response = await pool.query(`SELECT grafanadb.sensor.id, grafanadb.group.org_id AS "orgId",
									grafanadb.group.id AS "groupId", grafanadb.sensor.asset_id AS "assetId",
									grafanadb.sensor.sensor_uid AS "sensorUid",
									grafanadb.sensor.type,
									grafanadb.sensor.description, 
									grafanadb.sensor.topic_id AS "topicId",
									grafanadb.topic.topic_uid AS "topicUid",
									grafanadb.sensor.sensor_ref AS "sensorRef",							
									grafanadb.sensor.payload_key AS "payloadKey",
									grafanadb.sensor.param_label AS "paramLabel",
									grafanadb.sensor.value_type AS "valueType",
									grafanadb.sensor.units,
									grafanadb.sensor.dashboard_id AS "dashboardId",
									grafanadb.sensor.dashboard_url AS "dashboardUrl",
									grafanadb.sensor.created, grafanadb.sensor.updated
									FROM grafanadb.sensor
									INNER JOIN grafanadb.asset ON grafanadb.sensor.asset_id = grafanadb.asset.id
									INNER JOIN grafanadb.group ON grafanadb.asset.group_id = grafanadb.group.id
									INNER JOIN grafanadb.topic ON grafanadb.topic.id = grafanadb.sensor.topic_id
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
									grafanadb.sensor.type,
									grafanadb.sensor.description, 
									grafanadb.sensor.topic_id AS "topicId",
									grafanadb.topic.topic_uid AS "topicUid",
									grafanadb.sensor.sensor_ref AS "sensorRef",
									grafanadb.sensor.payload_key AS "payloadKey",
									grafanadb.sensor.param_label AS "paramLabel",
									grafanadb.sensor.value_type AS "valueType",
									grafanadb.sensor.units,
									grafanadb.sensor.dashboard_id AS "dashboardId",
									grafanadb.sensor.dashboard_url AS "dashboardUrl",
									grafanadb.sensor.created, grafanadb.sensor.updated
									FROM grafanadb.sensor
									INNER JOIN grafanadb.asset ON grafanadb.sensor.asset_id = grafanadb.asset.id
									INNER JOIN grafanadb.group ON grafanadb.asset.group_id = grafanadb.group.id
									INNER JOIN grafanadb.topic ON grafanadb.topic.id = grafanadb.sensor.topic_id
									WHERE grafanadb.asset.group_id = $1
									ORDER BY grafanadb.sensor.id  ASC`, [groupId]);
	return response.rows as ISensor[];
};

export const getSensorsByAssetId = async (assetId: number): Promise<ISensor[]> => {
	const response = await pool.query(`SELECT grafanadb.sensor.id, grafanadb.group.org_id AS "orgId",
									grafanadb.group.id AS "groupId", grafanadb.sensor.asset_id AS "assetId",
									grafanadb.sensor.sensor_uid AS "sensorUid",
									grafanadb.sensor.type,
									grafanadb.sensor.description, 
									grafanadb.sensor.topic_id AS "topicId",
									grafanadb.topic.topic_uid AS "topicUid",
									grafanadb.sensor.sensor_ref AS "sensorRef",
									grafanadb.sensor.payload_key AS "payloadKey",
									grafanadb.sensor.param_label AS "paramLabel",
									grafanadb.sensor.value_type AS "valueType",
									grafanadb.sensor.units,
									grafanadb.sensor.dashboard_id AS "dashboardId",
									grafanadb.sensor.dashboard_url AS "dashboardUrl",
									grafanadb.sensor.created, grafanadb.sensor.updated
									FROM grafanadb.sensor
									INNER JOIN grafanadb.asset ON grafanadb.sensor.asset_id = grafanadb.asset.id
									INNER JOIN grafanadb.group ON grafanadb.asset.group_id = grafanadb.group.id
									INNER JOIN grafanadb.topic ON grafanadb.topic.id = grafanadb.sensor.topic_id
									WHERE grafanadb.asset.id = $1
									ORDER BY grafanadb.sensor.id  ASC`, [assetId]);
	return response.rows as ISensor[];
}


export const getSensorDashboardByAssetId = async (
	assetId: number
): Promise<ISensorDashboard[]> => {
	const queryString = `SELECT grafanadb.sensor.sensor_ref AS "sensorRef",
	                    grafanadb.sensor.id AS "sensorId", 
						grafanadb.sensor.dashboard_id AS "dashboardId",
						grafanadb.sensor.dashboard_url AS "dashboardUrl"
						FROM grafanadb.sensor
						WHERE grafanadb.sensor.asset_id = $1;`
	const result = await pool.query(
		queryString,
		[assetId]);
	return result.rows as ISensorDashboard[];
}

export const getSensorsByGroupsIdArray = async (groupsIdArray: number[]): Promise<ISensor[]> => {
	const response = await pool.query(`SELECT grafanadb.sensor.id, grafanadb.group.org_id AS "orgId",
									grafanadb.group.id AS "groupId", grafanadb.sensor.asset_id AS "assetId",
									grafanadb.sensor.sensor_uid AS "sensorUid",
									grafanadb.sensor.type,
									grafanadb.sensor.description, 
									grafanadb.sensor.topic_id AS "topicId",
									grafanadb.topic.topic_uid AS "topicUid",
									grafanadb.sensor.sensor_ref AS "sensorRef",
									grafanadb.sensor.payload_key AS "payloadKey",
									grafanadb.sensor.param_label AS "paramLabel",
									grafanadb.sensor.value_type AS "valueType",
									grafanadb.sensor.units,
									grafanadb.sensor.dashboard_id AS "dashboardId",
									grafanadb.sensor.dashboard_url AS "dashboardUrl",
									grafanadb.sensor.created, grafanadb.sensor.updated
									FROM grafanadb.sensor
									INNER JOIN grafanadb.asset ON grafanadb.sensor.asset_id = grafanadb.asset.id
									INNER JOIN grafanadb.group ON grafanadb.asset.group_id = grafanadb.group.id
									INNER JOIN grafanadb.topic ON grafanadb.topic.id = grafanadb.sensor.topic_id
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
									grafanadb.sensor.type,
									grafanadb.sensor.description, 
									grafanadb.sensor.topic_id AS "topicId",
									grafanadb.topic.topic_uid AS "topicUid",
									grafanadb.sensor.sensor_ref AS "sensorRef",
									grafanadb.sensor.payload_key AS "payloadKey",
									grafanadb.sensor.param_label AS "paramLabel",
									grafanadb.sensor.value_type AS "valueType",
									grafanadb.sensor.units,
									grafanadb.sensor.dashboard_id AS "dashboardId",
									grafanadb.sensor.dashboard_url AS "dashboardUrl",
									grafanadb.sensor.created, grafanadb.sensor.updated
									FROM grafanadb.sensor
									INNER JOIN grafanadb.asset ON grafanadb.sensor.asset_id = grafanadb.asset.id
									INNER JOIN grafanadb.group ON grafanadb.asset.group_id = grafanadb.group.id
									INNER JOIN grafanadb.topic ON grafanadb.topic.id = grafanadb.sensor.topic_id
									WHERE grafanadb.group.org_id = $1
									ORDER BY grafanadb.sensor.id  ASC`, [orgId]);
	return response.rows as ISensor[];
};

export const getStateOfAllSensors = async (): Promise<ISensorState[]> => {
	const response = await pool.query(`SELECT grafanadb.sensor.id AS "sensorId", grafanadb.group.org_id AS "orgId",
									grafanadb.group.id AS "groupId", grafanadb.sensor.asset_id AS "assetId",
									grafanadb.alert.state
									FROM grafanadb.sensor
									INNER JOIN grafanadb.asset ON grafanadb.sensor.asset_id = grafanadb.asset.id
									INNER JOIN grafanadb.group ON grafanadb.asset.group_id = grafanadb.group.id
									LEFT JOIN grafanadb.alert ON grafanadb.sensor.dashboard_id = grafanadb.alert.dashboard_id
									ORDER BY grafanadb.group.org_id ASC,
											grafanadb.asset.group_id ASC,
											grafanadb.sensor.id ASC;`);
	return response.rows as ISensorState[];
}

export const getStateOfSensorsByGroupsIdArray = async (groupsIdArray: number[]): Promise<ISensorState[]> => {
	const response = await pool.query(`SELECT grafanadb.sensor.id AS "sensorId", grafanadb.group.org_id AS "orgId",
									grafanadb.group.id AS "groupId", grafanadb.sensor.asset_id AS "assetId",
									grafanadb.alert.state
									FROM grafanadb.sensor
									INNER JOIN grafanadb.asset ON grafanadb.sensor.asset_id = grafanadb.asset.id
									INNER JOIN grafanadb.group ON grafanadb.asset.group_id = grafanadb.group.id
									LEFT JOIN grafanadb.alert ON grafanadb.sensor.dashboard_id = grafanadb.alert.dashboard_id
									WHERE grafanadb.asset.group_id = ANY($1::bigint[])
									ORDER BY grafanadb.group.org_id ASC,
									grafanadb.asset.group_id ASC,
									grafanadb.sensor.id ASC;`, [groupsIdArray]);
	return response.rows as ISensorState[];
};

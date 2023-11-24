import { nanoid } from "nanoid";
import pointOnFeature from '@turf/point-on-feature';
import rhumbDestination from '@turf/rhumb-destination';
import { point, polygon } from '@turf/helpers';
import pool from "../../config/dbconfig";
import archiver from 'archiver';
import s3Files from 's3-files';
import s3Client from "../../config/s3Config";
import IGroup from "../group/interfaces/Group.interface";
import CreateAssetDto from "./asset.dto";
import IAsset from "./asset.interface";
import IAssetType from "./assetType.interface";
import CreateAssetTypeDto from "./assetType.dto";
import { findGroupGeojsonData } from "../../utils/geolocation.ts/geolocation";
import { getFloorByOrgIdAndFloorNumber } from "../building/buildingDAL";
import process_env from "../../config/api_config";
import { ListObjectsV2Command } from "@aws-sdk/client-s3";
import { logger } from "../../config/winston";
import IAssetS3Folder from "./assetS3Folder.interface";
import { createTopic } from "../topic/topicDAL";
import ITopic from "../topic/topic.interface";
import { createSensorDashboard } from "../group/dashboardDAL";
import { getDashboardsInfoFromIdArray } from "../dashboard/dashboardDAL";
import { generateDashboardsUrl } from "../digitalTwin/digitalTwinDAL";
import { createNewSensor, getSensorTypeByPropName } from "../sensor/sensorDAL";
import ISensor from "../sensor/sensor.interface";
import IAssetTopic from "./assetTopic.interface";
import IMqttDigitalTwinTopicInfo from "../digitalTwin/mqttDigitalTwinTopicInfo.interface";
import IDigitalTwinTopic from "../digitalTwin/digitalTwinTopic.interface";

export const insertAssetType = async (assetTypeData: IAssetType): Promise<IAssetType> => {
	const queryString = `INSERT INTO grafanadb.asset_type (org_id, asset_type_uid,
		type, icon_svg_file_name, icon_svg_string, geolocation_mode, marker_svg_file_name,
		marker_svg_string, is_predefined, asset_state_format, created, updated)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
		RETURNING id, org_id AS "orgId",
		asset_type_uid AS "assetTypeUid", type,
		icon_svg_file_name AS "iconSvgFileName",
		icon_svg_string AS "iconSvgString", 
		geolocation_mode AS "geolocationMode",
		marker_svg_file_name AS "markerSvgFileName",
		marker_svg_string  AS "markerSvgString",
        is_predefined AS "isPredefined",
		asset_state_format AS "assetStateFormat",
		created, updated`;

	const result = await pool.query(queryString,
		[
			assetTypeData.orgId,
			assetTypeData.assetTypeUid,
			assetTypeData.type,
			assetTypeData.iconSvgFileName,
			assetTypeData.iconSvgString,
			assetTypeData.geolocationMode,
			assetTypeData.markerSvgFileName,
			assetTypeData.markerSvgString,
			assetTypeData.isPredefined || false,
			assetTypeData.assetStateFormat,
		]);
	return result.rows[0] as IAssetType;
};

export const updateAssetTypeByPropName = async (
	propName: string,
	propValue: (string | number),
	assetType: IAssetType
): Promise<void> => {
	const query = `UPDATE grafanadb.asset_type SET type = $1,
	            icon_svg_file_name = $2, icon_svg_string = $3,
				marker_svg_file_name = $4, marker_svg_string = $5,
				geolocation_mode = $6, asset_state_format = $7,
				updated = NOW()
				WHERE grafanadb.asset_type.${propName} = $8;`;
	await pool.query(query, [
		assetType.type,
		assetType.iconSvgFileName,
		assetType.iconSvgString,
		assetType.markerSvgFileName,
		assetType.markerSvgString,
		assetType.geolocationMode,
		assetType.assetStateFormat,
		propValue
	]);
};

export const deleteAssetTypeByPropName = async (propName: string, propValue: (string | number)): Promise<void> => {
	await pool.query(`DELETE FROM grafanadb.asset_type WHERE ${propName} = $1`, [propValue]);
};

export const createNewAssetType = async (assetTypeData: CreateAssetTypeDto): Promise<IAssetType> => {
	const assetTypeUid = nanoid(20).replace(/-/g, "x").replace(/_/g, "X");
	const assetTypeInput: IAssetType = { ...assetTypeData, assetTypeUid };
	const newAssetType = await insertAssetType(assetTypeInput);
	return newAssetType;
};

export const getAllAssetTypes = async (): Promise<IAssetType[]> => {
	const response = await pool.query(`SELECT grafanadb.asset_type.id, 
	                                grafanadb.asset_type.org_id AS "orgId",
									grafanadb.asset_type.asset_type_uid AS "assetTypeUid",
									grafanadb.asset_type.type,
									grafanadb.asset_type.icon_svg_file_name AS "iconSvgFileName",
									grafanadb.asset_type.icon_svg_string AS "iconSvgString",
									grafanadb.asset_type.geolocation_mode AS "geolocationMode",
									grafanadb.asset_type.marker_svg_file_name AS "markerSvgFileName",
									grafanadb.asset_type.marker_svg_string AS "markerSvgString",
									grafanadb.asset_type.asset_state_format AS "assetStateFormat",
									grafanadb.asset_type.is_predefined AS "isPredefined",
									grafanadb.asset_type.created, grafanadb.asset_type.updated
									FROM grafanadb.asset_type
									ORDER BY grafanadb.asset_type.id  ASC;`);
	return response.rows as IAssetType[];
};

export const getAssetTypesByOrgsIdArray = async (orgsIdArray: number[]): Promise<IAssetType[]> => {
	const response = await pool.query(`SELECT grafanadb.asset_type.id, 
									grafanadb.asset_type.org_id AS "orgId",
									grafanadb.asset_type.asset_type_uid AS "assetTypeUid",
									grafanadb.asset_type.type,
									grafanadb.asset_type.icon_svg_file_name AS "iconSvgFileName",
									grafanadb.asset_type.icon_svg_string AS "iconSvgString",
									grafanadb.asset_type.geolocation_mode AS "geolocationMode",
									grafanadb.asset_type.marker_svg_file_name AS "markerSvgFileName",
									grafanadb.asset_type.marker_svg_string AS "markerSvgString",
									grafanadb.asset_type.asset_state_format AS "assetStateFormat",
									grafanadb.asset_type.is_predefined AS "isPredefined",
									grafanadb.asset_type.created, grafanadb.asset_type.updated
									FROM grafanadb.asset_type
									WHERE grafanadb.asset_type.org_id = ANY($1::bigint[])
									ORDER BY grafanadb.asset_type.id  ASC;`, [orgsIdArray]);
	return response.rows as IAssetType[];
};

export const getAssetTypesByOrgId = async (orgId: number): Promise<IAssetType[]> => {
	const response = await pool.query(`SELECT grafanadb.asset_type.id, 
									grafanadb.asset_type.org_id AS "orgId",
									grafanadb.asset_type.asset_type_uid AS "assetTypeUid",
									grafanadb.asset_type.type,
									grafanadb.asset_type.icon_svg_file_name AS "iconSvgFileName",
									grafanadb.asset_type.icon_svg_string AS "iconSvgString",
									grafanadb.asset_type.geolocation_mode AS "geolocationMode",
									grafanadb.asset_type.marker_svg_file_name AS "markerSvgFileName",
									grafanadb.asset_type.marker_svg_string AS "markerSvgString",
									grafanadb.asset_type.asset_state_format AS "assetStateFormat",
									grafanadb.asset_type.is_predefined AS "isPredefined",
									grafanadb.asset_type.created, grafanadb.asset_type.updated
									FROM grafanadb.asset_type
									WHERE grafanadb.asset_type.org_id = $1
									ORDER BY grafanadb.asset_type.id  ASC;`, [orgId]);
	return response.rows as IAssetType[];
};

export const getAssetTypeByPropName = async (
	orgId: number,
	propName: string,
	propValue: (string | number)
): Promise<IAssetType> => {
	const response = await pool.query(`SELECT grafanadb.asset_type.id, 
									grafanadb.asset_type.org_id AS "orgId",
									grafanadb.asset_type.asset_type_uid AS "assetTypeUid",
									grafanadb.asset_type.type,
									grafanadb.asset_type.icon_svg_file_name AS "iconSvgFileName",
									grafanadb.asset_type.icon_svg_string AS "iconSvgString",
									grafanadb.asset_type.geolocation_mode AS "geolocationMode",
									grafanadb.asset_type.marker_svg_file_name AS "markerSvgFileName",
									grafanadb.asset_type.marker_svg_string AS "markerSvgString",
									grafanadb.asset_type.asset_state_format AS "assetStateFormat",
									grafanadb.asset_type.is_predefined AS "isPredefined",
									grafanadb.asset_type.created, grafanadb.asset_type.updated
									FROM grafanadb.asset_type
									WHERE grafanadb.asset_type.${propName} = $1 AND
									grafanadb.asset_type.org_id = $2`, [propValue, orgId]);
	return response.rows[0] as IAssetType;
}

export const getAssetTypeByTypeAndOrgId = async (
	orgId: number,
	type: string,
): Promise<IAssetType> => {
	const response = await pool.query(`SELECT grafanadb.asset_type.id, 
									grafanadb.asset_type.org_id AS "orgId",
									grafanadb.asset_type.asset_type_uid AS "assetTypeUid",
									grafanadb.asset_type.type,
									grafanadb.asset_type.icon_svg_file_name AS "iconSvgFileName",
									grafanadb.asset_type.icon_svg_string AS "iconSvgString",
									grafanadb.asset_type.geolocation_mode AS "geolocationMode",
									grafanadb.asset_type.marker_svg_file_name AS "markerSvgFileName",
									grafanadb.asset_type.marker_svg_string AS "markerSvgString",
									grafanadb.asset_type.asset_state_format AS "assetStateFormat",
									grafanadb.asset_type.is_predefined AS "isPredefined",
									grafanadb.asset_type.created, grafanadb.asset_type.updated
									FROM grafanadb.asset_type
									WHERE grafanadb.asset_type.type = $1 AND
									grafanadb.asset_type.org_id = $2`, [type, orgId]);
	return response.rows[0] as IAssetType;
}

export const getNumAssetTypes = async (): Promise<number> => {
	const result = await pool.query(`SELECT COUNT(*) FROM grafanadb.asset_type;`);
	return parseInt(result.rows[0].count, 10);
}

export const getNumAssetTypesByOrgsIdArray = async (orgsIdArray: number[]): Promise<number> => {
	const result = await pool.query(`SELECT COUNT(*) FROM grafanadb.asset_type
									WHERE grafanadb.asset_type.org_id = ANY($1::bigint[])`, [orgsIdArray]);
	return parseInt(result.rows[0].count, 10);
}

export const insertAsset = async (assetData: IAsset): Promise<IAsset> => {
	const queryString = `INSERT INTO grafanadb.asset (group_id, asset_uid,
		asset_type_id, description, geolocation, icon_radio, icon_size_factor,
		created, updated)
		VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
		RETURNING id, group_id AS "groupId",
		asset_uid AS "assetUid",
		asset_type_id AS "assetTypeId",
		description, icon_radio AS "iconRadio",
		icon_size_factor AS "iconSizeFactor",
		geolocation[0] AS longitude,
		geolocation[1] AS latitude,
		created, updated`;

	const result = await pool.query(queryString,
		[
			assetData.groupId,
			assetData.assetUid,
			assetData.assetTypeId,
			assetData.description,
			`(${assetData.longitude},${assetData.latitude})`,
			assetData.iconRadio,
			assetData.iconSizeFactor,
		]);
	return result.rows[0] as IAsset;
};

export const checkSensorReferences = async (group: IGroup, assetData: CreateAssetDto) => {
	let areSensorTypesOk = true;
	const sensorsRef = assetData.sensorsRef;
	for (const sensorRef of sensorsRef) {
		const sensorType = await getSensorTypeByPropName(group.orgId, "type", sensorRef.sensorType);
		if (!sensorType) {
			areSensorTypesOk = false;
			break;
		}
	}
	return areSensorTypesOk;
}

export const createNewAsset = async (group: IGroup, assetData: CreateAssetDto): Promise<IAsset> => {
	const assetUid = nanoid(20).replace(/-/g, "x").replace(/_/g, "X");
	const groupId = group.id;

	const assetInput: IAsset = { ...assetData, groupId, assetUid };
	const newAsset = await insertAsset(assetInput);

	const topicsRef = assetData.topicsRef;
	const topics: ITopic[] = [];
	const assetTopics: IAssetTopic[] = [];
	for (let i = 0; i < topicsRef.length; i++) {
		topics[i] = await createTopic(group.id, topicsRef[i]);
		const assetTopic = await createAssetTopic(newAsset.id, topics[i].id, topicsRef[i].topicRef);
		assetTopics.push(assetTopic);
	}

	const sensorsRef = assetData.sensorsRef;
	const sensors: ISensor[] = [];
	const dashboarsId: number[] = [];
	const sensorsUid: string[] = [];
	for (let i = 0; i < sensorsRef.length; i++) {
		sensorsUid[i] = nanoid(20).replace(/-/g, "x").replace(/_/g, "X");
		const topicId = assetTopics.filter(assetTopic => assetTopic.topicRef === sensorsRef[i].topicRef)[0].topicId;
		sensorsRef[i].topicId = topicId;
		const sensorType = await getSensorTypeByPropName(group.orgId, "type", sensorsRef[i].sensorType);
		sensorsRef[i].sensorTypeId = sensorType.id;
		dashboarsId[i] = await createSensorDashboard(group, sensorsRef[i], sensorsUid[i]);
	}

	const dashboardsInfo = await getDashboardsInfoFromIdArray(dashboarsId);
	const dashboardsUrl = generateDashboardsUrl(dashboardsInfo);
	for (let i = 0; i < sensorsRef.length; i++) {
		sensors[i] = await createNewSensor(newAsset.id, sensorsRef[i], dashboarsId[i], dashboardsUrl[i], sensorsUid[i]);
	}

	return newAsset;
};

export const updateAssetByPropName = async (propName: string, propValue: (string | number), asset: IAsset): Promise<void> => {
	const query = `UPDATE grafanadb.asset SET description = $1,
				geolocation = $2, icon_radio = $3,
				icon_size_factor = $4,
				asset_type_id = $5, updated = NOW()
				WHERE grafanadb.asset.${propName} = $6;`;
	await pool.query(query, [
		asset.description,
		`(${asset.longitude},${asset.latitude})`,
		asset.iconRadio,
		asset.iconSizeFactor,
		asset.assetTypeId,
		propValue
	]);
};

export const deleteAssetByPropName = async (propName: string, propValue: (string | number)): Promise<void> => {
	await pool.query(`DELETE FROM grafanadb.asset WHERE ${propName} = $1`, [propValue]);
};

export const checkInitialAssetGeolocation = async (group: IGroup, assetData: CreateAssetDto) => {
	if (assetData.longitude === 0 && assetData.latitude === 0) {
		const featureIndex = group.featureIndex;
		const floorData = await getFloorByOrgIdAndFloorNumber(group.orgId, group.floorNumber);
		const geoJsonDataString = findGroupGeojsonData(floorData, featureIndex);
		if (geoJsonDataString !== "{}") {
			const geojsonObj = JSON.parse(geoJsonDataString);
			const geoPolygon = polygon(geojsonObj.features[0].geometry.coordinates);
			const center = pointOnFeature(geoPolygon);
			assetData.longitude = center.geometry.coordinates[0];
			assetData.latitude = center.geometry.coordinates[1];
		}
	}
}

export const getAssetByPropName = async (propName: string, propValue: (string | number)): Promise<IAsset> => {
	const response = await pool.query(`SELECT grafanadb.asset.id, grafanadb.group.org_id AS "orgId",
	                                grafanadb.asset.group_id AS "groupId", grafanadb.asset.asset_uid AS "assetUid",
									grafanadb.asset.description,
									grafanadb.asset_type.type AS "assetType",
									grafanadb.asset.asset_type_id AS "assetTypeId",
									grafanadb.asset.icon_radio AS "iconRadio",
									grafanadb.asset.icon_size_factor AS "iconSizeFactor",
									grafanadb.asset.geolocation[0] AS longitude,
									grafanadb.asset.geolocation[1] AS latitude, 
									grafanadb.asset.created, grafanadb.asset.updated
									FROM grafanadb.asset
									INNER JOIN grafanadb.group ON grafanadb.asset.group_id = grafanadb.group.id
									INNER JOIN grafanadb.asset_type ON grafanadb.asset.asset_type_id = grafanadb.asset_type.id
									WHERE grafanadb.asset.${propName} = $1`, [propValue]);
	return response.rows[0] as IAsset;
}

export const getAllAssets = async (): Promise<IAsset[]> => {
	const response = await pool.query(`SELECT grafanadb.asset.id, grafanadb.group.org_id AS "orgId",
									grafanadb.asset.group_id AS "groupId", grafanadb.asset.asset_uid AS "assetUid",
									grafanadb.asset.description,
									grafanadb.asset_type.type AS "assetType",
									grafanadb.asset.asset_type_id AS "assetTypeId",
									grafanadb.asset.icon_radio AS "iconRadio",
									grafanadb.asset.icon_size_factor AS "iconSizeFactor",
									grafanadb.asset.geolocation[0] AS longitude,
									grafanadb.asset.geolocation[1] AS latitude, 
									grafanadb.asset.created, grafanadb.asset.updated
									FROM grafanadb.asset
									INNER JOIN grafanadb.group ON grafanadb.asset.group_id = grafanadb.group.id
									INNER JOIN grafanadb.asset_type ON grafanadb.asset.asset_type_id = grafanadb.asset_type.id
									ORDER BY grafanadb.asset.id  ASC;`);
	return response.rows as IAsset[];
}

export const getNumAssets = async (): Promise<number> => {
	const result = await pool.query(`SELECT COUNT(*) FROM grafanadb.asset;`);
	return parseInt(result.rows[0].count, 10);
}


export const getAssetsByGroupId = async (groupId: number): Promise<IAsset[]> => {
	const response = await pool.query(`SELECT grafanadb.asset.id, grafanadb.group.org_id AS "orgId",
									grafanadb.asset.group_id AS "groupId", grafanadb.asset.asset_uid AS "assetUid",
									grafanadb.asset.description,
									grafanadb.asset_type.type AS "assetType",
									grafanadb.asset.asset_type_id AS "assetTypeId",
									grafanadb.asset.icon_radio AS "iconRadio",
									grafanadb.asset.icon_size_factor AS "iconSizeFactor",
									grafanadb.asset.geolocation[0] AS longitude,
									grafanadb.asset.geolocation[1] AS latitude, 
									grafanadb.asset.created, grafanadb.asset.updated
									FROM grafanadb.asset
									INNER JOIN grafanadb.group ON grafanadb.asset.group_id = grafanadb.group.id
									INNER JOIN grafanadb.asset_type ON grafanadb.asset.asset_type_id = grafanadb.asset_type.id
									WHERE grafanadb.asset.group_id = $1
									ORDER BY grafanadb.asset.id  ASC;`, [groupId]);
	return response.rows as IAsset[];
};

export const getAssetsByGroupsIdArray = async (groupsIdArray: number[]): Promise<IAsset[]> => {
	const response = await pool.query(`SELECT grafanadb.asset.id, grafanadb.group.org_id AS "orgId",
									grafanadb.asset.group_id AS "groupId", grafanadb.asset.asset_uid AS "assetUid",
									grafanadb.asset.description,
									grafanadb.asset_type.type AS "assetType",
									grafanadb.asset.asset_type_id AS "assetTypeId",
									grafanadb.asset.icon_radio AS "iconRadio",
									grafanadb.asset.icon_size_factor AS "iconSizeFactor",
									grafanadb.asset.geolocation[0] AS longitude,
									grafanadb.asset.geolocation[1] AS latitude, 
									grafanadb.asset.created, grafanadb.asset.updated
									FROM grafanadb.asset
									INNER JOIN grafanadb.group ON grafanadb.asset.group_id = grafanadb.group.id
									INNER JOIN grafanadb.asset_type ON grafanadb.asset.asset_type_id = grafanadb.asset_type.id
									WHERE grafanadb.asset.group_id = ANY($1::bigint[])
									ORDER BY grafanadb.asset.id  ASC`, [groupsIdArray]);
	return response.rows as IAsset[];
};


export const getNumAssetsByGroupsIdArray = async (groupsIdArray: number[]): Promise<number> => {
	const result = await pool.query(`SELECT COUNT(*) FROM grafanadb.asset
									WHERE grafanadb.asset.group_id = ANY($1::bigint[])`, [groupsIdArray]);
	return parseInt(result.rows[0].count, 10);
}

export const getAssetsByOrgId = async (orgId: number): Promise<IAsset[]> => {
	const response = await pool.query(`SELECT grafanadb.asset.id, grafanadb.group.org_id AS "orgId",
									grafanadb.asset.group_id AS "groupId", grafanadb.asset.asset_uid AS "assetUid",
									grafanadb.asset.description,
									grafanadb.asset_type.type AS "assetType",
									grafanadb.asset.asset_type_id AS "assetTypeId",
									grafanadb.asset.icon_radio AS "iconRadio",
									grafanadb.asset.icon_size_factor AS "iconSizeFactor",
									grafanadb.asset.geolocation[0] AS longitude,
									grafanadb.asset.geolocation[1] AS latitude, 
									grafanadb.asset.created, grafanadb.asset.updated
									FROM grafanadb.asset
									INNER JOIN grafanadb.group ON grafanadb.asset.group_id = grafanadb.group.id
									INNER JOIN grafanadb.asset_type ON grafanadb.asset.asset_type_id = grafanadb.asset_type.id
									WHERE grafanadb.group.org_id = $1
									ORDER BY grafanadb.asset.id  ASC`, [orgId]);
	return response.rows as IAsset[];
};

export const createAssetTopic = async (
	assetId: number,
	topicId: number,
	topicRef: string,
): Promise<IAssetTopic> => {
	const queryString = `INSERT INTO grafanadb.asset_topic (
		asset_id, topic_id, topic_ref)
		VALUES ($1, $2, $3)
	    RETURNING  asset_id AS "assetId", topic_id AS "topicId", 
		topic_ref AS "topicRef"`
	const result = await pool.query(
		queryString,
		[assetId, topicId, topicRef]);
	return result.rows[0] as IAssetTopic;
};

export const getAssetTopicsByAssetId = async (assetId: number): Promise<IAssetTopic[]> => {
	const queryString = `SELECT asset_id AS "asseId",
						topic_id AS "topicId", topic_ref AS "topicRef"
						FROM grafanadb.asset_topic
						WHERE grafanadb.asset_topic.asset_id = $1
						ORDER BY grafanadb.asset_topic.asset_id ASC,
						         grafanadb.asset_topic.topic_id ASC;`;
	const response = await pool.query(queryString, [assetId]);
	return response.rows as IAssetTopic[];
};

export const getAssetTopicByAssetIdAndTopicRef = async (assetId: number, topicRef: string): Promise<IAssetTopic> => {
	const queryString = `SELECT asset_id AS "asseId",
						topic_id AS "topicId", topic_ref AS "topicRef"
						FROM grafanadb.asset_topic
						WHERE grafanadb.asset_topic.asset_id = $1 AND
						grafanadb.asset_topic.topic_ref =$2
						ORDER BY grafanadb.asset_topic.asset_id ASC,
						         grafanadb.asset_topic.topic_id ASC;`;
	const response = await pool.query(queryString, [assetId, topicRef]);
	return response.rows[0] as IAssetTopic;
};

export const deleteAssetTopics = async (
	assetId: number,
): Promise<void> => {
	const queryString = `DELETE FROM grafanadb.topic USING grafanadb.asset_topic
						WHERE grafanadb.asset_topic.topic_id = grafanadb.topic.id AND
						grafanadb.asset_topic.asset_id = $1;`;
	await pool.query(queryString, [assetId]);
};

export const getAssetTopicsInfoFromByDTIdsArray = async (digitalTwinIdsArray: number[]): Promise<IMqttDigitalTwinTopicInfo[]> => {
	const response = await pool.query(`SELECT grafanadb.digital_twin.digital_twin_uid AS "digitalTwinUid",
									grafanadb.asset_topic.topic_id AS "topicId", 
									grafanadb.topic.topic_type AS "topicType",
									grafanadb.asset_topic.topic_ref AS "topicRef",
									grafanadb.group.group_uid AS "groupHash",
									grafanadb.topic.topic_uid AS "topicHash"
									FROM grafanadb.asset_topic
									INNER JOIN grafanadb.digital_twin ON grafanadb.digital_twin.asset_id = grafanadb.asset_topic.asset_id
									INNER JOIN grafanadb.topic ON grafanadb.topic.id = grafanadb.asset_topic.topic_id
									INNER JOIN grafanadb.group ON grafanadb.topic.group_id = grafanadb.group.id
									WHERE grafanadb.digital_twin.id = ANY($1::bigint[])
									ORDER BY grafanadb.asset_topic.topic_id ASC;`, [digitalTwinIdsArray]);

	return response.rows as IMqttDigitalTwinTopicInfo[];
}

export const getAssetTopicsByDigitalTwinId = async (digitalTwinId: number): Promise<IDigitalTwinTopic[]> => {
	const queryString = `SELECT grafanadb.digital_twin.id AS "digitalTwinId",
						grafanadb.asset_topic.topic_id AS "topicId", 
						grafanadb.asset_topic.topic_ref AS "topicRef"
						FROM grafanadb.asset_topic
						INNER JOIN grafanadb.digital_twin ON grafanadb.digital_twin.asset_id = grafanadb.asset_topic.asset_id
						WHERE grafanadb.digital_twin.id = $1
						ORDER BY grafanadb.digital_twin.id ASC,
						grafanadb.asset_topic.topic_id ASC;`;
	const response = await pool.query(queryString, [digitalTwinId]);
	return response.rows as IDigitalTwinTopic[];
};

export const updateGroupAssetsLocation = async (geoJsonDataString: string, group: IGroup): Promise<void> => {
	const groupAssets = await getAssetsByGroupId(group.id);
	if (groupAssets.length !== 0) {
		const geojsonObj = JSON.parse(geoJsonDataString);
		const geoPolygon = polygon(geojsonObj.features[0].geometry.coordinates);
		const center = pointOnFeature(geoPolygon);
		const centerGroupAreaLongitude = center.geometry.coordinates[0];
		const centerGroupAreaLatitude = center.geometry.coordinates[1];
		const ptCenterGroupArea = point([centerGroupAreaLongitude, centerGroupAreaLatitude]);
		let interAssetDistance = 0.0;
		for (const asset of groupAssets) {
			if (0.002 * asset.iconRadio > interAssetDistance) {
				interAssetDistance = 0.002 * asset.iconRadio;
			}
		}
		const pt = rhumbDestination(ptCenterGroupArea, 0.5 * interAssetDistance, 180);
		const totalLongitude = (groupAssets.length - 1) * interAssetDistance;
		const assetsLocationQueries = [];

		for (let i = 0; i < groupAssets.length; i++) {
			let bearing: number;
			const distance = - totalLongitude * 0.5 + i * interAssetDistance;
			if (distance > 0) bearing = -90;
			else bearing = 90;
			const positionCoords = rhumbDestination(pt, Math.abs(distance), bearing);
			const assetLongitude = positionCoords.geometry.coordinates[0];
			const assetLatitude = positionCoords.geometry.coordinates[1];
			const assetId = groupAssets[i].id;
			const query = pool.query(`UPDATE grafanadb.asset SET geolocation = $1, updated = NOW() WHERE id = $2;`,
				[`(${assetLongitude},${assetLatitude})`, assetId]);
			assetsLocationQueries.push(query);
		}
		await Promise.all(assetsLocationQueries)
	}
}

export const generateZipFileStream = (folderPath: string, fileNames: string[]) => {
	const keyStream = s3Files
		.connect({ s3: s3Client, bucket: process_env.S3_BUCKET_NAME })
		.createKeyStream(folderPath, fileNames)

	const fileSream = s3Files.createFileStream(keyStream, false);
	const archive = archiver('zip', { zlib: { level: 5 } });
	fileSream
		.on('data', (file: any) => {
			if (file.data.length !== 0) {
				archive.append(file.data, { name: file.path })
			}
		})
		.on('end', () => {
			void archive.finalize();
		})
		.on('error', (err: any) => {
			archive.emit('error', err)
		})
	return archive;
}

export const getBucketFolderFileNames = async (folderPath: string) => {
	const bucketName = process_env.S3_BUCKET_NAME;
	const bucketParams = {
		Bucket: bucketName,
		Prefix: folderPath,
		MaxKeys: 1,
	};

	const command = new ListObjectsV2Command(bucketParams);
	const fileNames = [];
	try {
		let isTruncated = true;
		while (isTruncated) {
			const data = await s3Client.send(command);
			fileNames.push(...data.Contents.map(fileData => fileData.Key.split("/")[5]))
			isTruncated = data.IsTruncated;
			command.input.ContinuationToken = data.NextContinuationToken;
		}
	} catch (err) {
		logger.log("error", `Files info list for bucket ${bucketName} could not be obtained: %s`, err.message)
	}
	return fileNames;
}

export const getAllAssetS3Folder = async (): Promise<IAssetS3Folder[]> => {
	const response = await pool.query(`SELECT grafanadb.org.id AS "orgId",
	                                    grafanadb.org.acronym AS "orgAcronym",
	                                    grafanadb.group.id AS "groupId",
										grafanadb.group.acronym AS "groupAcronym",
										grafanadb.asset.id AS "assetId",
                                        grafanadb.asset.asset_uid AS "assetUid",
                                        grafanadb.asset.description AS "assetDescription",
                                        grafanadb.topic.s3_folder AS "s3Folder"
                                        FROM grafanadb.topic
                                        INNER JOIN grafanadb.group ON grafanadb.topic.group_id = grafanadb.group.id
										INNER JOIN grafanadb.org ON grafanadb.group.org_id = grafanadb.org.id
                                        INNER JOIN grafanadb.sensor ON grafanadb.sensor.topic_id = grafanadb.topic.id
                                        INNER JOIN grafanadb.asset ON grafanadb.asset.id = grafanadb.sensor.asset_id
                                        WHERE grafanadb.topic.require_s3_storage = $1
                                        ORDER BY grafanadb.group.org_id ASC,
                                        grafanadb.topic.group_id ASC,
                                        grafanadb.asset.id ASC,
                                        grafanadb.topic.id  ASC;`, [true]);
	return response.rows as IAssetS3Folder[];
}

export const getAssetS3FolderByGroupsIdArray = async (groupsIdArray: number[]): Promise<IAssetS3Folder[]> => {
	const response = await pool.query(`SELECT grafanadb.org.id AS "orgId",
										grafanadb.org.acronym AS "orgAcronym",
										grafanadb.group.id AS "groupId",
										grafanadb.group.acronym AS "groupAcronym",
										grafanadb.asset.id AS "assetId",
										grafanadb.asset.asset_uid AS "assetUid",
										grafanadb.asset.description AS "assetDescription",
										grafanadb.topic.s3_folder AS "s3Folder"
										FROM grafanadb.topic
                                        INNER JOIN grafanadb.group ON grafanadb.topic.group_id = grafanadb.group.id
										INNER JOIN grafanadb.org ON grafanadb.group.org_id = grafanadb.org.id
                                        INNER JOIN grafanadb.sensor ON grafanadb.sensor.topic_id = grafanadb.topic.id
                                        INNER JOIN grafanadb.asset ON grafanadb.asset.id = grafanadb.sensor.asset_id
                                        WHERE grafanadb.topic.require_s3_storage = $1
										AND grafanadb.asset.group_id = ANY($2::bigint[])
                                        ORDER BY grafanadb.group.org_id ASC,
                                        grafanadb.topic.group_id ASC,
                                        grafanadb.asset.id ASC,
                                        grafanadb.topic.id  ASC;`, [true, groupsIdArray]);
	return response.rows as IAssetS3Folder[];
}

export const getAssetS3StorageYears = async (assetFolderPath: string) => {
	const bucketParams = {
		Bucket: process_env.S3_BUCKET_NAME,
		Prefix: assetFolderPath,
		Delimiter: "/",
		MaxKeys: 20,
	};

	const command = new ListObjectsV2Command(bucketParams);
	const years = [];
	try {
		const data = await s3Client.send(command);
		if (data.CommonPrefixes) {
			for (const item of data.CommonPrefixes) {
				const prefixArray = item.Prefix.split("/");
				if (prefixArray.length >= 5) {
					years.push(prefixArray[4]);
				}
			}
			years.sort();
		}
	} catch (err) {
		logger.log("error", `S3 bucket subfolders of ${assetFolderPath} could not be obtained: %s`, err.message)
	}
	return years;
}




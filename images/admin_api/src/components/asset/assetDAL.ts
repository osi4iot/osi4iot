import { nanoid } from "nanoid";
import pointOnFeature from '@turf/point-on-feature';
import rhumbDestination from '@turf/rhumb-destination';
import { point, polygon } from '@turf/helpers';
import pool from "../../config/dbconfig";
import IGroup from "../group/interfaces/Group.interface";
import CreateAssetDto from "./asset.dto";
import IAsset from "./asset.interface";


export const insertAsset = async (assetData: IAsset): Promise<IAsset> => {
	const queryString = `INSERT INTO grafanadb.asset (group_id, asset_uid,
		description, geolocation, type, icon_radio,
		created, updated)
		VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
		RETURNING  id, group_id AS "groupId",
		asset_uid AS "assetUid",
		description, icon_radio AS "iconRadio",
		geolocation[0] AS longitude,
		geolocation[1] AS latitude,
		created, updated`;

	const result = await pool.query(queryString,
		[
			assetData.groupId,
			assetData.assetUid,
			assetData.description,
			`(${assetData.longitude},${assetData.latitude})`,
			assetData.type,
			assetData.iconRadio,
		]);
	return result.rows[0] as IAsset;
};

export const updateAssetByPropName = async (propName: string, propValue: (string | number), asset: IAsset): Promise<void> => {
	const query = `UPDATE grafanadb.asset SET description = $1,
				geolocation = $2, type = $3, icon_radio = $4,
				updated = NOW()
				WHERE grafanadb.asset.${propName} = $5;`;
	await pool.query(query, [
		asset.description,
		`(${asset.longitude},${asset.latitude})`,
		asset.type,
		asset.iconRadio,
		propValue
	]);
};

export const deleteAssetByPropName = async (propName: string, propValue: (string | number)): Promise<void> => {
	await pool.query(`DELETE FROM grafanadb.asset WHERE ${propName} = $1`, [propValue]);
};

export const createNewAsset = async (group: IGroup, assetData: CreateAssetDto): Promise<IAsset> => {
	const assetUid = nanoid(20).replace(/-/g, "x").replace(/_/g, "X");
	const groupId = group.id;

	const assetInput: IAsset = { ...assetData, groupId, assetUid };
	const newAsset = await insertAsset(assetInput);
	return newAsset;
};

export const getAssetByPropName = async (propName: string, propValue: (string | number)): Promise<IAsset> => {
	const response = await pool.query(`SELECT grafanadb.asset.id, grafanadb.group.org_id AS "orgId",
	                                grafanadb.asset.group_id AS "groupId", grafanadb.asset.asset_uid AS "assetUid",
									grafanadb.asset.description, grafanadb.asset.type,
									grafanadb.asset.icon_radio AS "iconRadio",
									grafanadb.asset.geolocation[0] AS longitude,
									grafanadb.asset.geolocation[1] AS latitude, 
									grafanadb.asset.created, grafanadb.asset.updated
									FROM grafanadb.asset
									INNER JOIN grafanadb.group ON grafanadb.asset.group_id = grafanadb.group.id
									WHERE grafanadb.asset.${propName} = $1`, [propValue]);
	return response.rows[0] as IAsset;
}

export const getAllAssets = async (): Promise<IAsset[]> => {
	const response = await pool.query(`SELECT grafanadb.asset.id, grafanadb.group.org_id AS "orgId",
									grafanadb.asset.group_id AS "groupId", grafanadb.asset.asset_uid AS "assetUid",
									grafanadb.asset.description, grafanadb.asset.type,
									grafanadb.asset.icon_radio AS "iconRadio",
									grafanadb.asset.geolocation[0] AS longitude,
									grafanadb.asset.geolocation[1] AS latitude, 
									grafanadb.asset.created, grafanadb.asset.updated
									FROM grafanadb.asset
									INNER JOIN grafanadb.group ON grafanadb.asset.group_id = grafanadb.group.id
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
									grafanadb.asset.description, grafanadb.asset.type,
									grafanadb.asset.icon_radio AS "iconRadio",
									grafanadb.asset.geolocation[0] AS longitude,
									grafanadb.asset.geolocation[1] AS latitude, 
									grafanadb.asset.created, grafanadb.asset.updated
									FROM grafanadb.asset
									INNER JOIN grafanadb.group ON grafanadb.asset.group_id = grafanadb.group.id
									WHERE grafanadb.asset.group_id = $1
									ORDER BY grafanadb.asset.id  ASC`, [groupId]);
	return response.rows as IAsset[];
};

export const getAssetsByGroupsIdArray = async (groupsIdArray: number[]): Promise<IAsset[]> => {
	const response = await pool.query(`SELECT grafanadb.asset.id, grafanadb.group.org_id AS "orgId",
									grafanadb.asset.group_id AS "groupId", grafanadb.asset.asset_uid AS "assetUid",
									grafanadb.asset.description, grafanadb.asset.type,
									grafanadb.asset.icon_radio AS "iconRadio",
									grafanadb.asset.geolocation[0] AS longitude,
									grafanadb.asset.geolocation[1] AS latitude, 
									grafanadb.asset.created, grafanadb.asset.updated
									FROM grafanadb.asset
									INNER JOIN grafanadb.group ON grafanadb.asset.group_id = grafanadb.group.id
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
									grafanadb.asset.description, grafanadb.asset.type,
									grafanadb.asset.icon_radio AS "iconRadio",
									grafanadb.asset.geolocation[0] AS longitude,
									grafanadb.asset.geolocation[1] AS latitude, 
									grafanadb.asset.created, grafanadb.asset.updated
									FROM grafanadb.asset
									INNER JOIN grafanadb.group ON grafanadb.asset.group_id = grafanadb.group.id
									WHERE grafanadb.group.org_id = $1
									ORDER BY grafanadb.asset.id  ASC`, [orgId]);
	return response.rows as IAsset[];
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
		const assetsLocationQueries = []

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

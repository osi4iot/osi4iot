import pool from "../../config/dbconfig";
import INodeRedInstance from "./nodeRedInstance.interface";
import CreateNodeRedInstanceDto from "./nodeRedInstance.dto";
import IGroup from "../group/interfaces/Group.interface";
import { point, polygon } from '@turf/helpers';
import pointOnFeature from '@turf/point-on-feature';
import rhumbDestination from '@turf/rhumb-destination';

export const getAllNodeRedInstances = async (): Promise<INodeRedInstance[]> => {
	const response = await pool.query(`SELECT grafanadb.nodered_instance.id,
									grafanadb.nodered_instance.nri_hash AS "nriHash",
									grafanadb.nodered_instance.org_id AS "orgId",
									grafanadb.nodered_instance.group_id AS "groupId",
									grafanadb.nodered_instance.geolocation[0] AS longitude,
									grafanadb.nodered_instance.geolocation[1] AS latitude,
									grafanadb.nodered_instance.icon_radio AS "iconRadio",
									grafanadb.nodered_instance.deleted
									FROM grafanadb.nodered_instance
									ORDER BY grafanadb.nodered_instance.id ASC,
											grafanadb.nodered_instance.org_id ASC,
											grafanadb.nodered_instance.group_id ASC;`);
	return response.rows;
}

export const getNodeRedInstancesByOrgsIdArray = async (orgsIdArray: number[]): Promise<INodeRedInstance[]> => {
	const response = await pool.query(`SELECT grafanadb.nodered_instance.id,
									grafanadb.nodered_instance.nri_hash AS "nriHash",
									grafanadb.nodered_instance.org_id AS "orgId",
									grafanadb.nodered_instance.group_id AS "groupId",
									grafanadb.nodered_instance.geolocation[0] AS longitude,
									grafanadb.nodered_instance.geolocation[1] AS latitude,
									grafanadb.nodered_instance.icon_radio AS "iconRadio",
									grafanadb.nodered_instance.deleted
									FROM grafanadb.nodered_instance
									WHERE grafanadb.nodered_instance.org_id = ANY($1::bigint[])
									ORDER BY grafanadb.nodered_instance.id ASC,
											grafanadb.nodered_instance.org_id ASC,
											grafanadb.nodered_instance.group_id ASC;`, [orgsIdArray]);
	return response.rows;
};

export const getNodeRedInstancesByGroupsIdArray = async (groupsIdArray: number[]): Promise<INodeRedInstance[]> => {
	const response = await pool.query(`SELECT grafanadb.nodered_instance.id,
									grafanadb.nodered_instance.nri_hash AS "nriHash",
									grafanadb.nodered_instance.org_id AS "orgId",
									grafanadb.nodered_instance.group_id AS "groupId",
									grafanadb.nodered_instance.geolocation[0] AS longitude,
									grafanadb.nodered_instance.geolocation[1] AS latitude,
									grafanadb.nodered_instance.icon_radio AS "iconRadio",
									grafanadb.nodered_instance.deleted
									FROM grafanadb.nodered_instance
									WHERE grafanadb.nodered_instance.groupId = ANY($1::bigint[])
									ORDER BY grafanadb.nodered_instance.id ASC,
											grafanadb.nodered_instance.org_id ASC,
											grafanadb.nodered_instance.group_id ASC;`, [groupsIdArray]);
	return response.rows;
};

export const getNodeRedInstanceByProp = async (propName: string, propValue: (string | number)): Promise<INodeRedInstance> => {
	const response = await pool.query(`SELECT grafanadb.nodered_instance.id,
									grafanadb.nodered_instance.nri_hash AS "nriHash",
									grafanadb.nodered_instance.org_id AS "orgId",
									grafanadb.nodered_instance.group_id AS "groupId",
									grafanadb.nodered_instance.geolocation[0] AS longitude,
									grafanadb.nodered_instance.geolocation[1] AS latitude,
									grafanadb.nodered_instance.icon_radio AS "iconRadio",
									grafanadb.nodered_instance.deleted
									FROM grafanadb.nodered_instance
									WHERE grafanadb.nodered_instance.${propName} = $1`, [propValue]);
	return response.rows[0];
}

export const getNodeRedInstancesInGroup = async (groupId: number): Promise<INodeRedInstance> => {
	const response = await pool.query(`SELECT grafanadb.nodered_instance.id,
									grafanadb.nodered_instance.nri_hash AS "nriHash",
									grafanadb.nodered_instance.org_id AS "orgId",
									grafanadb.nodered_instance.group_id AS "groupId",
									grafanadb.nodered_instance.geolocation[0] AS longitude,
									grafanadb.nodered_instance.geolocation[1] AS latitude,
									grafanadb.nodered_instance.icon_radio AS "iconRadio",
									grafanadb.nodered_instance.deleted
									FROM grafanadb.nodered_instance
									WHERE grafanadb.nodered_instance.group_id = $1`, [groupId]);
	return response.rows[0];
}

export const markAsDeleteNodeRedInstancesInGroup = async (groupId: number): Promise<void> => {
	await pool.query(`UPDATE grafanadb.nodered_instance SET deleted = $1, group_id = $2, updated = NOW() WHERE grafanadb.nodered_instance.group_id = $3`,
		[true, 0, groupId]);
}

export const recoverNodeRedInstancesMarkedAsDeleted = async (nriIdArray: number[]): Promise<void> => {
	await pool.query(`UPDATE grafanadb.nodered_instance SET deleted = $1, group_id = $2, updated = NOW() WHERE grafanadb.nodered_instance.id= ANY($3::bigint[])`,
		[false, 0, nriIdArray]);
}

export const deleteNodeRedInstanceById = async (nodeRedInstanceId: number): Promise<void> => {
	await pool.query(`DELETE FROM grafanadb.nodered_instance WHERE id = $1`, [nodeRedInstanceId]);
};

export const updateNodeRedInstanceIconById = async (nriId: number, longitude: number, latitude: number, iconRadio: number): Promise<void> => {
	const query = `UPDATE grafanadb.nodered_instance SET geolocation = $1, icon_radio = $2, updated = NOW()
				WHERE grafanadb.nodered_instance.id = $3;`;
	await pool.query(query, [
		`(${longitude},${latitude})`,
		iconRadio,
		nriId
	]);
};

export const updateNodeRedInstanceHashById = async (nriId: number, newNriHash: string): Promise<void> => {
	const query = `UPDATE grafanadb.nodered_instance SET nri_hash = $1, updated = NOW()
	WHERE grafanadb.nodered_instance.id = $2;`;
	await pool.query(query, [
		newNriHash,
		nriId
	]);
};

export const createNodeRedInstancesInOrg = async (nriHashes: string[], orgId: number): Promise<INodeRedInstance[]> => {
	const nodeRedInstancesQueries = [];
	for (const nriHash of nriHashes) {
		const nriInput: CreateNodeRedInstanceDto = {
			nriHash,
			orgId,
			longitude: 0,
			latitude: 0,
			iconRadio: 1
		}
		const nodeRedInstanceQuery = createNodeRedInstance(nriInput);
		nodeRedInstancesQueries.push(nodeRedInstanceQuery);
	}

	const nodeRedInstances = await Promise.all(nodeRedInstancesQueries).then(nri => nri);
	return nodeRedInstances.sort((a, b) => a.id - b.id);
};

export const createNodeRedInstance = async (nriInput: CreateNodeRedInstanceDto): Promise<INodeRedInstance> => {
	const result = await pool.query(`INSERT INTO grafanadb.nodered_instance (nri_hash, org_id,
		group_id, geolocation, icon_radio, created, updated) VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
		RETURNING id, nri_hash AS "nriHash", org_id AS "orgId", group_id AS "groupId",geolocation[0] AS longitude,
		geolocation[1] AS latitude, icon_radio AS "iconRadio", deleted`,
		[nriInput.nriHash, nriInput.orgId, 0, `(${nriInput.longitude},${nriInput.latitude})`, nriInput.iconRadio]);
	return result.rows[0];
};

export const assignNodeRedInstanceToGroup = async (nriInput: INodeRedInstance, groupId: number): Promise<void> => {
	const query = `UPDATE grafanadb.nodered_instance SET group_id = $1, geolocation = $2, updated = NOW()
	WHERE grafanadb.nodered_instance.id = $3;`;
	await pool.query(query, [
		groupId,
		`(${nriInput.longitude},${nriInput.latitude})`,
		nriInput.id
	]);
};

export const getNodeRedInstancesUnassignedInOrg = async (orgId: number): Promise<INodeRedInstance[]> => {
	const response = await pool.query(`SELECT grafanadb.nodered_instance.id,
									grafanadb.nodered_instance.nri_hash AS "nriHash",
									grafanadb.nodered_instance.org_id AS "orgId",
									grafanadb.nodered_instance.group_id AS "groupId",
									grafanadb.nodered_instance.geolocation[0] AS longitude,
									grafanadb.nodered_instance.geolocation[1] AS latitude,
									grafanadb.nodered_instance.icon_radio AS "iconRadio",
									grafanadb.nodered_instance.deleted
									FROM grafanadb.nodered_instance
									WHERE grafanadb.nodered_instance.org_Id = $1 AND
									grafanadb.nodered_instance.deleted = FALSE AND
									grafanadb.nodered_instance.group_id = $2`, [orgId, 0]);
	return response.rows;
}

export const updateGroupNodeRedInstanceLocation = async (geoJsonDataString: string, group: IGroup): Promise<void> => {
	const nodeRedInstance = await getNodeRedInstancesInGroup(group.id);
	const geojsonObj = JSON.parse(geoJsonDataString);
	const geoPolygon = polygon(geojsonObj.features[0].geometry.coordinates);
	const center = pointOnFeature(geoPolygon);
	const centerGroupAreaLongitude = center.geometry.coordinates[0];
	const centerGroupAreaLatitude = center.geometry.coordinates[1];
	const ptCenterGroupArea = point([centerGroupAreaLongitude, centerGroupAreaLatitude]);
	const separation = 0.002 * nodeRedInstance.iconRadio;
	const pt = rhumbDestination(ptCenterGroupArea, separation, 0.0);
	const longitude = pt.geometry.coordinates[0];
	const latitude = pt.geometry.coordinates[1];
	await updateNodeRedInstanceIconById(nodeRedInstance.id, longitude, latitude, nodeRedInstance.iconRadio)
}


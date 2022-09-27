import pool from "../../config/dbconfig";
import INodeRedInstance from "./nodeRedInstance.interface";
import CreateNodeRedInstanceDto from "./nodeRedInstance.dto";

export const getAllNodeRedInstances = async (): Promise<INodeRedInstance[]> => {
	const response = await pool.query(`SELECT grafanadb.nodered_instance.id,
									grafanadb.nodered_instance.nri_hash AS "nriHash",
									grafanadb.nodered_instance.org_id AS "orgId",
									grafanadb.nodered_instance.group_id AS "groupId",
									grafanadb.nodered_instance.geolocation[0] AS longitude,
									grafanadb.nodered_instance.geolocation[1] AS latitude
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
									grafanadb.nodered_instance.geolocation[1] AS latitude
									FROM grafanadb.nodered_instance
									WHERE grafanadb.odered_instance.org_id = ANY($1::bigint[])
									ORDER BY grafanadb.nodered_instance.id ASC,
											grafanadb.nodered_instance.org_id ASC,
											grafanadb.nodered_instance.group_id ASC;`, [orgsIdArray]);
	return response.rows;
};

export const getNodeRedInstanceByProp = async (propName: string, propValue: (string | number)): Promise<INodeRedInstance> => {
	const response = await pool.query(`SELECT grafanadb.nodered_instance.id,
									grafanadb.nodered_instance.nri_hash AS "nriHash",
									grafanadb.nodered_instance.org_id AS "orgId",
									grafanadb.nodered_instance.group_id AS "groupId",
									grafanadb.nodered_instance.geolocation[0] AS longitude,
									grafanadb.nodered_instance.geolocation[1] AS latitude
									FROM grafanadb.nodered_instance
									WHERE grafanadb.nodered_instance.${propName} = $1`, [propValue]);
	return response.rows[0];
}

export const deleteNodeRedInstanceById = async (nodeRedInstanceId: number): Promise<void> => {
	await pool.query(`DELETE FROM grafanadb.nodered_instance WHERE id = $1`, [nodeRedInstanceId]);
};

export const updateNodeRedInstanceByProp = async (propName: string, propValue: (string | number), nriData: CreateNodeRedInstanceDto): Promise<void> => {
	const query = `UPDATE grafanadb.nodered_instance SET geolocation = $1, updated = NOW()
				WHERE grafanadb.nodered_instance.${propName} = $2;`;
	await pool.query(query, [
		`(${nriData.longitude},${nriData.latitude})`,
		propValue
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
		}
		const nodeRedInstanceQuery = createNodeRedInstance(nriInput);
		nodeRedInstancesQueries.push(nodeRedInstanceQuery);
	}

	const nodeRedInstances = await Promise.all(nodeRedInstancesQueries).then(nri => nri);
	return  nodeRedInstances.sort((a, b) => a.id - b.id);
};

export const createNodeRedInstance = async (nriInput: CreateNodeRedInstanceDto): Promise<INodeRedInstance> => {
	const result = await pool.query(`INSERT INTO grafanadb.nodered_instance (nri_hash, org_id, group_id, created, updated)
		VALUES ($1, $2, $3, NOW(), NOW())
		RETURNING  *`,
		[nriInput.nriHash, nriInput.orgId, 0]);
	return result.rows[0];
};

export const assignNodeRedInstanceToGroup = async (nriInput: INodeRedInstance, groupId: number): Promise<void> => {
	const query = `UPDATE grafanadb.nodered_instance SET group_id = $1, updated = NOW()
	WHERE grafanadb.nodered_instance.id = $2;`;
	await pool.query(query, [
		groupId,
		nriInput.id
	]);
};

export const getNodeRedInstancesUnassignedInOrg = async (orgId: number): Promise<INodeRedInstance[]> => {
	const response = await pool.query(`SELECT grafanadb.nodered_instance.id,
									grafanadb.nodered_instance.nri_hash AS "nriHash",
									grafanadb.nodered_instance.org_id AS "orgId",
									grafanadb.nodered_instance.group_id AS "groupId",
									grafanadb.nodered_instance.geolocation[0] AS longitude,
									grafanadb.nodered_instance.geolocation[1] AS latitude
									FROM grafanadb.nodered_instance
									WHERE grafanadb.nodered_instance.orgId = $1 AND grafanadb.nodered_instance.groupId = $2`,[orgId, 0]);
	return response.rows;
}

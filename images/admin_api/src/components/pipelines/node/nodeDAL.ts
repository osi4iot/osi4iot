import { nanoid } from "nanoid";
import pool from "../../../config/dbconfig";
import INode from "./node.interface";
import CreateNodeDto from "./node.dto";
import natsClient from "../../../config/natsConfig";

export const insertNode = async (nodeData: INode, groupId: number): Promise<INode> => {
	const queryString = `INSERT INTO grafanadb.node (node_uid,
        digital_twin_id, name, type, x, y, num_outputs, settings, debug, created, updated)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
		RETURNING id,node_uid AS "nodeUid",
		name, type, x, y, num_outputs AS "numOutputs", 
		settings, created, updated`;
	const result = await pool.query(queryString, [
		nodeData.nodeUid,
		nodeData.digitalTwinId,
		nodeData.name,
		nodeData.type,
		nodeData.x,
		nodeData.y,
		nodeData.numOutputs,
		nodeData.settings,
		nodeData.debug !== undefined ? nodeData.debug : "off",
	]);
	if (result.rows.length === 1) {
		const context = {
			groupId,
			digitalTwinId: nodeData.digitalTwinId,
		};
		await natsClient.jsPublish("node", "create", result.rows[0].id, context);
	}
	return result.rows[0] as INode;
};

export const createNewNode = async (
	nodeData: CreateNodeDto,
	groupId: number
): Promise<INode> => {
	if (nodeData.nodeUid === undefined || nodeData.nodeUid === "") {
		nodeData.nodeUid = nanoid(20).replace(/-/g, "x").replace(/_/g, "X");
	}

	if (nodeData.x === undefined) {
		nodeData.x = 0.0;
	}

	if (nodeData.y === undefined) {
		nodeData.y = 0.0;
	}

	const nodeInput: INode = { ...nodeData };
	const newNode = await insertNode(nodeInput, groupId);

	return newNode;
};

export const updateNodeByPropName = async (
	propName: string,
	propValue: string | number,
	node: INode
): Promise<INode> => {
	const query = `UPDATE grafanadb.node SET name = $1, type = $2, x = $3, y = $4, 
				num_outputs = $5, settings = $6, debug = $7, updated = NOW()
				WHERE grafanadb.node.${propName} = $8 RETURNING *;`;
	const result = await pool.query(query, [
		node.name,
		node.type,
		node.x,
		node.y,
		node.numOutputs,
		node.settings,
		node.debug,
		propValue,
	]);

	if (result.rows.length === 1) {
		const context = {
			groupId: node.groupId,
			digitalTwinId: node.digitalTwinId,
		};
		await natsClient.jsPublish("node", "update", result.rows[0].id, context);
	}

	return result.rows[0] as INode;

};

export const deleteNodeByPropName = async (
	propName: string,
	propValue: string | number
): Promise<void> => {
	const result = await pool.query(`DELETE FROM grafanadb.node WHERE ${propName} = $1 RETURNING *`, [
		propValue,
	]);
	if (result.rows.length === 1) {
		const context = {
			groupId: result.rows[0].groupId,
			digitalTwinId: result.rows[0].digitalTwinId,
		};
		await natsClient.jsPublish("node", "delete", result.rows[0].id, context);
	}
};

export const getNodeByPropName = async (
	propName: string,
	propValue: string | number
): Promise<INode> => {
	const response = await pool.query(
		`SELECT grafanadb.node.id,
            grafanadb.node.node_uid AS "nodeUid",
			grafanadb.node.digital_twin_id AS "digitalTwinId",
            grafanadb.group.org_id AS "orgId",
            grafanadb.asset.group_id AS "groupId",
            grafanadb.asset.id AS "assetId",
            grafanadb.node.name,
			grafanadb.node.type,
			grafanadb.node.x,
            grafanadb.node.y,
			grafanadb.node.num_outputs AS "numOutputs",
			grafanadb.node.settings,
			grafanadb.node.debug,
            grafanadb.node.created, 
            grafanadb.node.updated
            FROM grafanadb.node
            INNER JOIN grafanadb.digital_twin ON grafanadb.node.digital_twin_id = grafanadb.digital_twin.id
            INNER JOIN grafanadb.asset ON grafanadb.digital_twin.asset_id = grafanadb.asset.id
            INNER JOIN grafanadb.group ON grafanadb.asset.group_id = grafanadb.group.id
            WHERE grafanadb.node.${propName} = $1;`,
		[propValue]
	);
	return response.rows[0] as INode;
};

export const getAllNodes = async (): Promise<INode[]> => {
	const response = await pool.query(
		`SELECT grafanadb.node.id,
            grafanadb.node.node_uid AS "nodeUid",
			grafanadb.node.digital_twin_id AS "digitalTwinId",
            grafanadb.group.org_id AS "orgId",
            grafanadb.asset.group_id AS "groupId",
            grafanadb.asset.id AS "assetId",
            grafanadb.node.name,
			grafanadb.node.type,
			grafanadb.node.x,
            grafanadb.node.y,
			grafanadb.node.num_outputs AS "numOutputs",
			grafanadb.node.settings,
			grafanadb.node.debug,
            grafanadb.node.created, 
            grafanadb.node.updated
            FROM grafanadb.node
            INNER JOIN grafanadb.digital_twin ON grafanadb.node.digital_twin_id = grafanadb.digital_twin.id
            INNER JOIN grafanadb.asset ON grafanadb.digital_twin.asset_id = grafanadb.asset.id
            INNER JOIN grafanadb.group ON grafanadb.asset.group_id = grafanadb.group.id
            ORDER BY grafanadb.node.id ASC;`
	);
	return response.rows as INode[];
};

export const getNumNodes = async (): Promise<number> => {
	const result = await pool.query(`SELECT COUNT(*) FROM grafanadb.node;`);
	return parseInt(result.rows[0].count, 10);
};

export const getNodesByGroupId = async (groupId: number): Promise<INode[]> => {
	const response = await pool.query(
		`SELECT grafanadb.node.id,
            grafanadb.node.node_uid AS "nodeUid",
			grafanadb.node.digital_twin_id AS "digitalTwinId",
            grafanadb.group.org_id AS "orgId",
            grafanadb.asset.group_id AS "groupId",
            grafanadb.asset.id AS "assetId",
            grafanadb.node.name,
			grafanadb.node.type,
			grafanadb.node.x,
            grafanadb.node.y,
			grafanadb.node.num_outputs AS "numOutputs",
			grafanadb.node.settings,
			grafanadb.node.debug,
            grafanadb.node.created, 
            grafanadb.node.updated
            FROM grafanadb.node
            INNER JOIN grafanadb.digital_twin ON grafanadb.node.digital_twin_id = grafanadb.digital_twin.id
            INNER JOIN grafanadb.asset ON grafanadb.digital_twin.asset_id = grafanadb.asset.id
            INNER JOIN grafanadb.group ON grafanadb.asset.group_id = grafanadb.group.id
            WHERE grafanadb.asset.group_id = $1
            ORDER BY grafanadb.node.id ASC;`,
		[groupId]
	);
	return response.rows as INode[];
};

export const getNodesByGroupsIdArray = async (
	groupsIdArray: number[]
): Promise<INode[]> => {
	const response = await pool.query(
		`SELECT grafanadb.node.id,
            grafanadb.node.node_uid AS "nodeUid",
			grafanadb.node.digital_twin_id AS "digitalTwinId",
            grafanadb.group.org_id AS "orgId",
            grafanadb.asset.group_id AS "groupId",
            grafanadb.asset.id AS "assetId",
            grafanadb.node.name,
			grafanadb.node.type,
			grafanadb.node.x,
            grafanadb.node.y,
			grafanadb.node.num_outputs AS "numOutputs",
			grafanadb.node.settings,
			grafanadb.node.debug,
            grafanadb.node.created, 
            grafanadb.node.updated
            FROM grafanadb.node
            INNER JOIN grafanadb.digital_twin ON grafanadb.node.digital_twin_id = grafanadb.digital_twin.id
            INNER JOIN grafanadb.asset ON grafanadb.digital_twin.asset_id = grafanadb.asset.id
            INNER JOIN grafanadb.group ON grafanadb.asset.group_id = grafanadb.group.id
            WHERE grafanadb.asset.group_id = ANY($1::bigint[])
            ORDER BY grafanadb.node.id ASC;`,
		[groupsIdArray]
	);
	return response.rows as INode[];
};

export const getNumNodesByGroupsIdArray = async (
	groupsIdArray: number[]
): Promise<number> => {
	const result = await pool.query(
		`SELECT COUNT(*) FROM grafanadb.node
            INNER JOIN grafanadb.digital_twin ON grafanadb.node.digital_twin_id = grafanadb.digital_twin.id
            INNER JOIN grafanadb.asset ON grafanadb.digital_twin.asset_id = grafanadb.asset.id
            WHERE grafanadb.asset.group_id = ANY($1::bigint[])`,
		[groupsIdArray]
	);
	return parseInt(result.rows[0].count, 10);
};

export const getNodesByOrgId = async (orgId: number): Promise<INode[]> => {
	const response = await pool.query(
		`SELECT grafanadb.node.id,
            grafanadb.node.node_uid AS "nodeUid",
			grafanadb.node.digital_twin_id AS "digitalTwinId",
            grafanadb.group.org_id AS "orgId",
            grafanadb.asset.group_id AS "groupId",
            grafanadb.asset.id AS "assetId",
            grafanadb.node.name,
			grafanadb.node.type,
			grafanadb.node.x,
            grafanadb.node.y,
			grafanadb.node.num_outputs AS "numOutputs",
			grafanadb.node.settings,
			grafanadb.node.debug,
            grafanadb.node.created, 
            grafanadb.node.updated
            FROM grafanadb.node
            INNER JOIN grafanadb.digital_twin ON grafanadb.node.digital_twin_id = grafanadb.digital_twin.id
            INNER JOIN grafanadb.asset ON grafanadb.digital_twin.asset_id = grafanadb.asset.id
            INNER JOIN grafanadb.group ON grafanadb.asset.group_id = grafanadb.group.id
            WHERE grafanadb.group.org_id = $1
            ORDER BY grafanadb.node.id ASC;`,
		[orgId]
	);
	return response.rows as INode[];
};

export const getNodesByDigitalTwinId = async (
	digitalTwinId: number
): Promise<INode[]> => {
	const response = await pool.query(
		`SELECT grafanadb.node.id,
            grafanadb.node.node_uid AS "nodeUid",
			grafanadb.node.digital_twin_id AS "digitalTwinId",
            grafanadb.group.org_id AS "orgId",
            grafanadb.asset.group_id AS "groupId",
            grafanadb.asset.id AS "assetId",
            grafanadb.node.name,
			grafanadb.node.type,
			grafanadb.node.x,
            grafanadb.node.y,
			grafanadb.node.num_outputs AS "numOutputs",
			grafanadb.node.settings,
			grafanadb.node.debug,
            grafanadb.node.created, 
            grafanadb.node.updated
            FROM grafanadb.node
            INNER JOIN grafanadb.digital_twin ON grafanadb.node.digital_twin_id = grafanadb.digital_twin.id
            INNER JOIN grafanadb.asset ON grafanadb.digital_twin.asset_id = grafanadb.asset.id
            INNER JOIN grafanadb.group ON grafanadb.asset.group_id = grafanadb.group.id
            WHERE grafanadb.node.digital_twin_id = $1
            ORDER BY grafanadb.node.id ASC;`,
		[digitalTwinId]
	);
	return response.rows as INode[];
};

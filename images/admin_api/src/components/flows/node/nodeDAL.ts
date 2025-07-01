import { nanoid } from "nanoid";
import pool from "../../../config/dbconfig";
import INode from "./node.interface";
import CreateNodeDto from "./node.dto";

export const insertNode = async (nodeData: INode): Promise<INode> => {
	const queryString = `INSERT INTO grafanadb.node (node_uid,
        flow_id, name, type, x, y, num_outputs, metadata, created, updated)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
		RETURNING id,node_uid AS "nodeUid",
		name, created, updated`;
	const result = await pool.query(queryString, [
		nodeData.nodeUid,
		nodeData.flowId,
		nodeData.name,
		nodeData.type,
		nodeData.x,
		nodeData.y,
		nodeData.numOutputs,
		nodeData.metadata,
	]);
	return result.rows[0] as INode;
};

export const createNewNode = async (
	nodeData: CreateNodeDto
): Promise<INode> => {
	const nodeUid = nanoid(20).replace(/-/g, "x").replace(/_/g, "X");
	if (nodeData.x === undefined) {
		nodeData.x = 0.0;
	}

	if (nodeData.y === undefined) {
		nodeData.y = 0.0;
	}

	const nodeInput: INode = { ...nodeData, nodeUid };
	const newNode = await insertNode(nodeInput);

	return newNode;
};

export const updateNodeByPropName = async (
	propName: string,
	propValue: string | number,
	node: INode
): Promise<void> => {
	const query = `UPDATE grafanadb.node SET name = $1, type = $2, x = $3, y = $4, 
				num_outputs = $5, metadata = $6, updated = NOW()
				WHERE grafanadb.node.${propName} = $7;`;
	await pool.query(query, [node.name, node.type, node.x, node.y, node.numOutputs, node.metadata, propValue]);
};

export const deleteNodeByPropName = async (
	propName: string,
	propValue: string | number
): Promise<void> => {
	await pool.query(`DELETE FROM grafanadb.node WHERE ${propName} = $1`, [
		propValue,
	]);
};

export const getNodeByPropName = async (
	propName: string,
	propValue: string | number
): Promise<INode> => {
	const response = await pool.query(
		`SELECT grafanadb.node.id,
            grafanadb.node.node_uid AS "nodeUid",
			grafanadb.node.flow_id AS "flowId",
            grafanadb.group.org_id AS "orgId",
            grafanadb.asset.group_id AS "groupId",
            grafanadb.asset.id AS "assetId",
            grafanadb.flow.digital_twin_id AS "digitalTwinId",
            grafanadb.node.name,
			grafanadb.node.type,
			grafanadb.node.x,
            grafanadb.node.y,
			grafanadb.node.num_outputs AS "numOutputs",
			grafanadb.node.metadata,
            grafanadb.node.created, 
            grafanadb.node.updated
            FROM grafanadb.node
			INNER JOIN grafanadb.flow ON grafanadb.node.flow_id = grafanadb.flow.id
            INNER JOIN grafanadb.digital_twin ON grafanadb.flow.digital_twin_id = grafanadb.digital_twin.id
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
			grafanadb.node.flow_id AS "flowId",
            grafanadb.group.org_id AS "orgId",
            grafanadb.asset.group_id AS "groupId",
            grafanadb.asset.id AS "assetId",
            grafanadb.flow.digital_twin_id AS "digitalTwinId",
            grafanadb.node.name,
			grafanadb.node.type,
			grafanadb.node.x,
            grafanadb.node.y,
			grafanadb.node.num_outputs AS "numOutputs",
			grafanadb.node.metadata,
            grafanadb.node.created, 
            grafanadb.node.updated
            FROM grafanadb.node
			INNER JOIN grafanadb.flow ON grafanadb.node.flow_id = grafanadb.flow.id
            INNER JOIN grafanadb.digital_twin ON grafanadb.flow.digital_twin_id = grafanadb.digital_twin.id
            INNER JOIN grafanadb.asset ON grafanadb.digital_twin.asset_id = grafanadb.asset.id
            INNER JOIN grafanadb.group ON grafanadb.asset.group_id = grafanadb.group.id
            ORDER BY grafanadb.node.id ASC;`);
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
			grafanadb.node.flow_id AS "flowId",
            grafanadb.group.org_id AS "orgId",
            grafanadb.asset.group_id AS "groupId",
            grafanadb.asset.id AS "assetId",
            grafanadb.flow.digital_twin_id AS "digitalTwinId",
            grafanadb.node.name,
			grafanadb.node.type,
			grafanadb.node.x,
            grafanadb.node.y,
			grafanadb.node.num_outputs AS "numOutputs",
			grafanadb.node.metadata,
            grafanadb.node.created, 
            grafanadb.node.updated
            FROM grafanadb.node
			INNER JOIN grafanadb.flow ON grafanadb.node.flow_id = grafanadb.flow.id
            INNER JOIN grafanadb.digital_twin ON grafanadb.flow.digital_twin_id = grafanadb.digital_twin.id
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
			grafanadb.node.flow_id AS "flowId",
            grafanadb.group.org_id AS "orgId",
            grafanadb.asset.group_id AS "groupId",
            grafanadb.asset.id AS "assetId",
            grafanadb.flow.digital_twin_id AS "digitalTwinId",
            grafanadb.node.name,
			grafanadb.node.type,
			grafanadb.node.x,
            grafanadb.node.y,
			grafanadb.node.num_outputs AS "numOutputs",
			grafanadb.node.metadata,
            grafanadb.node.created, 
            grafanadb.node.updated
            FROM grafanadb.node
			INNER JOIN grafanadb.flow ON grafanadb.node.flow_id = grafanadb.flow.id
            INNER JOIN grafanadb.digital_twin ON grafanadb.flow.digital_twin_id = grafanadb.digital_twin.id
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
			INNER JOIN grafanadb.flow ON grafanadb.node.flow_id = grafanadb.flow.id
            INNER JOIN grafanadb.digital_twin ON grafanadb.flow.digital_twin_id = grafanadb.digital_twin.id
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
			grafanadb.node.flow_id AS "flowId",
            grafanadb.group.org_id AS "orgId",
            grafanadb.asset.group_id AS "groupId",
            grafanadb.asset.id AS "assetId",
            grafanadb.flow.digital_twin_id AS "digitalTwinId",
            grafanadb.node.name,
			grafanadb.node.type,
			grafanadb.node.x,
            grafanadb.node.y,
			grafanadb.node.num_outputs AS "numOutputs",
			grafanadb.node.metadata,
            grafanadb.node.created, 
            grafanadb.node.updated
            FROM grafanadb.node
			INNER JOIN grafanadb.flow ON grafanadb.node.flow_id = grafanadb.flow.id
            INNER JOIN grafanadb.digital_twin ON grafanadb.flow.digital_twin_id = grafanadb.digital_twin.id
            INNER JOIN grafanadb.asset ON grafanadb.digital_twin.asset_id = grafanadb.asset.id
            INNER JOIN grafanadb.group ON grafanadb.asset.group_id = grafanadb.group.id
            WHERE grafanadb.group.org_id = $1
            ORDER BY grafanadb.node.id ASC;`,
		[orgId]
	);
	return response.rows as INode[];
};

export const getNodesByFlowId = async (flowId: number): Promise<INode[]> => {
	const response = await pool.query(
		`SELECT grafanadb.node.id,
            grafanadb.node.node_uid AS "nodeUid",
			grafanadb.node.flow_id AS "flowId",
            grafanadb.group.org_id AS "orgId",
            grafanadb.asset.group_id AS "groupId",
            grafanadb.asset.id AS "assetId",
            grafanadb.flow.digital_twin_id AS "digitalTwinId",
            grafanadb.node.name,
			grafanadb.node.type,
			grafanadb.node.x,
            grafanadb.node.y,
			grafanadb.node.num_outputs AS "numOutputs",
			grafanadb.node.metadata,
            grafanadb.node.created, 
            grafanadb.node.updated
            FROM grafanadb.node
			INNER JOIN grafanadb.flow ON grafanadb.node.flow_id = grafanadb.flow.id
            INNER JOIN grafanadb.digital_twin ON grafanadb.flow.digital_twin_id = grafanadb.digital_twin.id
            INNER JOIN grafanadb.asset ON grafanadb.digital_twin.asset_id = grafanadb.asset.id
            INNER JOIN grafanadb.group ON grafanadb.asset.group_id = grafanadb.group.id
            WHERE grafanadb.node.flow_id = $1
            ORDER BY grafanadb.node.id ASC;`,
		[flowId]
	);
	return response.rows as INode[];
};




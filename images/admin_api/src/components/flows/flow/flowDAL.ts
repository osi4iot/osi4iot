import { nanoid } from "nanoid";
import IFlow from "./flow.inteface";
import CreateFlowDto from "./flow.dto";
import pool from "../../../config/dbconfig";

export const insertFlow = async (flowData: IFlow): Promise<IFlow> => {
	const queryString = `INSERT INTO grafanadb.flow (flow_uid,
		digital_twin_id, name, created, updated)
		VALUES ($1, $2, $3, NOW(), NOW())
		RETURNING id, flow_uid AS "flowUid",
		digital_twin_id AS "digitalTwinId", name, created, updated`;
	const result = await pool.query(queryString, [
		flowData.flowUid,
		flowData.digitalTwinId,
		flowData.name,
	]);
	return result.rows[0] as IFlow;
};

export const createNewFlow = async (
	flowData: CreateFlowDto
): Promise<IFlow> => {
	const flowUid = nanoid(20).replace(/-/g, "x").replace(/_/g, "X");

	const flowInput: IFlow = { ...flowData, flowUid };
	const newFlow = await insertFlow(flowInput);

	return newFlow;
};

export const updateFlowByPropName = async (
	propName: string,
	propValue: string | number,
	flow: IFlow
): Promise<void> => {
	const query = `UPDATE grafanadb.flow SET name = $1, updated = NOW()
				WHERE grafanadb.flow.${propName} = $2;`;
	await pool.query(query, [flow.name, propValue]);
};

export const deleteFlowByPropName = async (
	propName: string,
	propValue: string | number
): Promise<void> => {
	await pool.query(`DELETE FROM grafanadb.flow WHERE ${propName} = $1`, [
		propValue,
	]);
};

export const getFlowByPropName = async (
	propName: string,
	propValue: string | number
): Promise<IFlow> => {
	const response = await pool.query(
		`SELECT grafanadb.flow.id,
            grafanadb.flow.flow_uid AS "flowUid",
            grafanadb.group.org_id AS "orgId",
            grafanadb.asset.group_id AS "groupId",
            grafanadb.asset.id AS "assetId",
            grafanadb.flow.digital_twin_id AS "digitalTwinId",
            grafanadb.flow.name,
            grafanadb.flow.created, 
            grafanadb.flow.updated
            FROM grafanadb.flow
            INNER JOIN grafanadb.digital_twin ON grafanadb.flow.digital_twin_id = grafanadb.digital_twin.id
            INNER JOIN grafanadb.asset ON grafanadb.digital_twin.asset_id = grafanadb.asset.id
            INNER JOIN grafanadb.group ON grafanadb.asset.group_id = grafanadb.group.id
            WHERE grafanadb.flow.${propName} = $1`,
		[propValue]
	);
	return response.rows[0] as IFlow;
};

export const getAllFlows = async (): Promise<IFlow[]> => {
	const response = await pool.query(`SELECT grafanadb.flow.id,
            grafanadb.group.org_id AS "orgId",
            grafanadb.asset.group_id AS "groupId",
            grafanadb.flow.digital_twin_id AS "digitalTwinId",
            grafanadb.flow.name,
            grafanadb.flow.created,
            grafanadb.flow.updated
            FROM grafanadb.flow
            INNER JOIN grafanadb.digital_twin ON grafanadb.flow.digital_twin_id = grafanadb.digital_twin.id
            INNER JOIN grafanadb.asset ON grafanadb.digital_twin.asset_id = grafanadb.asset.id
            INNER JOIN grafanadb.group ON grafanadb.asset.group_id = grafanadb.group.id
            ORDER BY grafanadb.flow.id ASC;`);
	return response.rows as IFlow[];
};

export const getNumFlows = async (): Promise<number> => {
	const result = await pool.query(`SELECT COUNT(*) FROM grafanadb.flow;`);
	return parseInt(result.rows[0].count, 10);
};

export const getFlowsByGroupId = async (groupId: number): Promise<IFlow[]> => {
	const response = await pool.query(
		`SELECT grafanadb.flow.id,
            grafanadb.group.org_id AS "orgId",
            grafanadb.asset.group_id AS "groupId",
            grafanadb.flow.digital_twin_id AS "digitalTwinId",
            grafanadb.flow.name,
            grafanadb.flow.created,
            grafanadb.flow.updated
            FROM grafanadb.flow
            INNER JOIN grafanadb.digital_twin ON grafanadb.flow.digital_twin_id = grafanadb.digital_twin.id
            INNER JOIN grafanadb.asset ON grafanadb.digital_twin.asset_id = grafanadb.asset.id
            INNER JOIN grafanadb.group ON grafanadb.asset.group_id = grafanadb.group.id
            WHERE grafanadb.asset.group_id = $1
            ORDER BY grafanadb.flow.id ASC;`,
		[groupId]
	);
	return response.rows as IFlow[];
};

export const getFlowsByGroupsIdArray = async (
	groupsIdArray: number[]
): Promise<IFlow[]> => {
	const response = await pool.query(
		`SELECT grafanadb.flow.id,
            grafanadb.group.org_id AS "orgId",
            grafanadb.asset.group_id AS "groupId",
            grafanadb.flow.digital_twin_id AS "digitalTwinId",
            grafanadb.flow.name,
            grafanadb.flow.created,
            grafanadb.flow.updated
            FROM grafanadb.flow
            INNER JOIN grafanadb.digital_twin ON grafanadb.flow.digital_twin_id = grafanadb.digital_twin.id
            INNER JOIN grafanadb.asset ON grafanadb.digital_twin.asset_id = grafanadb.asset.id
            INNER JOIN grafanadb.group ON grafanadb.asset.group_id = grafanadb.group.id
            WHERE grafanadb.asset.group_id = ANY($1::bigint[])
            ORDER BY grafanadb.asset.id  ASC`,
		[groupsIdArray]
	);
	return response.rows as IFlow[];
};

export const getNumFlowsByGroupsIdArray = async (
	groupsIdArray: number[]
): Promise<number> => {
	const result = await pool.query(
		`SELECT COUNT(*) FROM grafanadb.flow
            INNER JOIN grafanadb.digital_twin ON grafanadb.flow.digital_twin_id = grafanadb.digital_twin.id
            INNER JOIN grafanadb.asset ON grafanadb.digital_twin.asset_id = grafanadb.asset.id       
            WHERE grafanadb.asset.group_id = ANY($1::bigint[])`,
		[groupsIdArray]
	);
	return parseInt(result.rows[0].count, 10);
};

export const getFlowsByOrgId = async (orgId: number): Promise<IFlow[]> => {
	const response = await pool.query(
		`SELECT grafanadb.flow.id,
            grafanadb.group.org_id AS "orgId",
            grafanadb.asset.group_id AS "groupId",
            grafanadb.flow.digital_twin_id AS "digitalTwinId",
            grafanadb.flow.name,
            grafanadb.flow.created,
            grafanadb.flow.updated
            FROM grafanadb.flow
            INNER JOIN grafanadb.digital_twin ON grafanadb.flow.digital_twin_id = grafanadb.digital_twin.id
            INNER JOIN grafanadb.asset ON grafanadb.digital_twin.asset_id = grafanadb.asset.id
            INNER JOIN grafanadb.group ON grafanadb.asset.group_id = grafanadb.group.id
            WHERE grafanadb.group.org_id = $1
            ORDER BY grafanadb.asset.id  ASC`,
		[orgId]
	);
	return response.rows as IFlow[];
};

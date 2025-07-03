import { nanoid } from "nanoid";
import pool from "../../../config/dbconfig";
import IWire from "./wire.interface";
import CreateWireDto from "./wire.dto";
import natsClient from "../../../config/natsConfig";

export const insertWire = async (wireData: IWire): Promise<IWire> => {
	const queryString = `INSERT INTO grafanadb.wire (wire_uid,
        node_ini_id, nini_output_index, node_end_id, created, updated)
		VALUES ($1, $2, $3, $4, NOW(), NOW())
		RETURNING id, wire_uid AS "wireUid", node_ini_id AS "nodeIniId",
		nini_output_index AS "niniOutputIndex", node_end_id AS "nodeEndId",
		created, updated`;
	const result = await pool.query(queryString, [
		wireData.wireUid,
		wireData.nodeIniId,
		wireData.niniOutputIndex,
		wireData.nodeEndId,
	]);

	if (result.rows.length === 1) {
		await natsClient.jsPublish("wire", "create", result.rows[0].id);
	}

	return result.rows[0] as IWire;
};

export const createNewWire = async (wireData: CreateWireDto): Promise<IWire> => {
	let wireUid = wireData.wireUid;
	if (wireUid === undefined || wireUid === "") {
		wireUid = nanoid(20).replace(/-/g, "x").replace(/_/g, "X");
	}
	const wireInput: IWire = { ...wireData, wireUid };
	const newWire = await insertWire(wireInput);

	return newWire;
};

export const deleteWireByPropName = async (propName: string, propValue: string | number): Promise<void> => {
	const result = await pool.query(`DELETE FROM grafanadb.wire WHERE ${propName} = $1`, [propValue]);
	if (result.rows.length === 1) {
		await natsClient.jsPublish("wire", "delete", result.rows[0].id);
	}
};

export const updateWireById = async (wireId: number, wire: IWire): Promise<void> => {
	const query = `UPDATE grafanadb.wire SET node_ini_id = $1, nini_output_index = $2,
            node_end_id = $3, updated = NOW()
            WHERE grafanadb.wire.id = $4;`;
	const result = await pool.query(query, [wire.nodeIniId, wire.niniOutputIndex, wire.nodeEndId, wireId]);
	if (result.rows.length === 1) {
		await natsClient.jsPublish("wire", "update", wire.id);
	}
};

export const getWireByPropName = async (propName: string, propValue: string | number): Promise<IWire> => {
	const response = await pool.query(
		`SELECT grafanadb.wire.id,
            grafanadb.wire.wire_uid AS "wireUid",
            grafanadb.group.org_id AS "orgId",
            grafanadb.asset.group_id AS "groupId",
            grafanadb.asset.id AS "assetId",
            grafanadb.node.digital_twin_id AS "digitalTwinId",
            grafanadb.wire.node_ini_id AS "nodeIniId",
            grafanadb.wire.nini_output_index AS "niniOutputIndex",
            grafanadb.wire.node_end_id AS "nodeEndId",
            grafanadb.wire.created, 
            grafanadb.wire.updated
            FROM grafanadb.wire
            INNER JOIN grafanadb.node ON grafanadb.wire.node_ini_id = grafanadb.node.id
            INNER JOIN grafanadb.digital_twin ON grafanadb.node.digital_twin_id = grafanadb.digital_twin.id
            INNER JOIN grafanadb.asset ON grafanadb.digital_twin.asset_id = grafanadb.asset.id
            INNER JOIN grafanadb.group ON grafanadb.asset.group_id = grafanadb.group.id
            WHERE grafanadb.wire.${propName} = $1;`,
		[propValue]
	);
	return response.rows[0] as IWire;
};

export const getAllWires = async (): Promise<IWire[]> => {
	const response = await pool.query(
		`SELECT grafanadb.wire.id,
            grafanadb.wire.wire_uid AS "wireUid",
            grafanadb.group.org_id AS "orgId",
            grafanadb.asset.group_id AS "groupId",
            grafanadb.asset.id AS "assetId",
            grafanadb.node.digital_twin_id AS "digitalTwinId",
            grafanadb.wire.node_ini_id AS "nodeIniId",
            grafanadb.wire.nini_output_index AS "niniOutputIndex",
            grafanadb.wire.node_end_id AS "nodeEndId",
            grafanadb.wire.created, 
            grafanadb.wire.updated
            FROM grafanadb.wire
            INNER JOIN grafanadb.node ON grafanadb.wire.node_ini_id = grafanadb.node.id
            INNER JOIN grafanadb.digital_twin ON grafanadb.node.digital_twin_id = grafanadb.digital_twin.id
            INNER JOIN grafanadb.asset ON grafanadb.digital_twin.asset_id = grafanadb.asset.id
            INNER JOIN grafanadb.group ON grafanadb.asset.group_id = grafanadb.group.id
            ORDER BY grafanadb.wire.id ASC;`
	);
	return response.rows as IWire[];
};

export const getNumWires = async (): Promise<number> => {
	const result = await pool.query(`SELECT COUNT(*) FROM grafanadb.wire;`);
	return parseInt(result.rows[0].count, 10);
};

export const getWiresByGroupId = async (groupId: number): Promise<IWire[]> => {
	const response = await pool.query(
		`SELECT grafanadb.wire.id,
            grafanadb.wire.wire_uid AS "wireUid",
            grafanadb.group.org_id AS "orgId",
            grafanadb.asset.group_id AS "groupId",
            grafanadb.asset.id AS "assetId",
            grafanadb.node.digital_twin_id AS "digitalTwinId",
            grafanadb.wire.node_ini_id AS "nodeIniId",
            grafanadb.wire.nini_output_index AS "niniOutputIndex",
            grafanadb.wire.node_end_id AS "nodeEndId",
            grafanadb.wire.created, 
            grafanadb.wire.updated
            FROM grafanadb.wire
            INNER JOIN grafanadb.node ON grafanadb.wire.node_ini_id = grafanadb.node.id
            INNER JOIN grafanadb.digital_twin ON grafanadb.node.digital_twin_id = grafanadb.digital_twin.id
            INNER JOIN grafanadb.asset ON grafanadb.digital_twin.asset_id = grafanadb.asset.id
            INNER JOIN grafanadb.group ON grafanadb.asset.group_id = grafanadb.group.id
            WHERE grafanadb.asset.group_id = $1
            ORDER BY grafanadb.wire.id ASC;`,
		[groupId]
	);
	return response.rows as IWire[];
};

export const getWiresByGroupsIdArray = async (groupsIdArray: number[]): Promise<IWire[]> => {
	const response = await pool.query(
		`SELECT grafanadb.wire.id,
            grafanadb.wire.wire_uid AS "wireUid",
            grafanadb.group.org_id AS "orgId",
            grafanadb.asset.group_id AS "groupId",
            grafanadb.asset.id AS "assetId",
            grafanadb.node.digital_twin_id AS "digitalTwinId",
            grafanadb.wire.node_ini_id AS "nodeIniId",
            grafanadb.wire.nini_output_index AS "niniOutputIndex",
            grafanadb.wire.node_end_id AS "nodeEndId",
            grafanadb.wire.created, 
            grafanadb.wire.updated
            FROM grafanadb.wire
            INNER JOIN grafanadb.node ON grafanadb.wire.node_ini_id = grafanadb.node.id
            INNER JOIN grafanadb.digital_twin ON grafanadb.node.digital_twin_id = grafanadb.digital_twin.id
            INNER JOIN grafanadb.asset ON grafanadb.digital_twin.asset_id = grafanadb.asset.id
            INNER JOIN grafanadb.group ON grafanadb.asset.group_id = grafanadb.group.id
            WHERE grafanadb.asset.group_id = ANY($1::bigint[])
            ORDER BY grafanadb.wire.id ASC;`,
		[groupsIdArray]
	);
	return response.rows as IWire[];
};

export const getNumWiresByGroupsIdArray = async (groupsIdArray: number[]): Promise<number> => {
	const result = await pool.query(
		`SELECT COUNT(*) FROM grafanadb.wire
            INNER JOIN grafanadb.node ON grafanadb.wire.node_ini_id = grafanadb.node.id
            INNER JOIN grafanadb.digital_twin ON grafanadb.node.digital_twin_id = grafanadb.digital_twin.id
            INNER JOIN grafanadb.asset ON grafanadb.digital_twin.asset_id = grafanadb.asset.id
            WHERE grafanadb.asset.group_id = ANY($1::bigint[])`,
		[groupsIdArray]
	);
	return parseInt(result.rows[0].count, 10);
};

export const getNumWiresByDigitalTwinId = async (digitalTwinId: number): Promise<number> => {
	const result = await pool.query(
		`SELECT COUNT(*) FROM grafanadb.wire
            INNER JOIN grafanadb.node ON grafanadb.wire.node_ini_id = grafanadb.node.id
            INNER JOIN grafanadb.digital_twin ON grafanadb.node.digital_twin_id = grafanadb.digital_twin.id
            INNER JOIN grafanadb.asset ON grafanadb.digital_twin.asset_id = grafanadb.asset.id
            WHERE grafanadb.digital_twin.id = $1`,
		[digitalTwinId]
	);
	return parseInt(result.rows[0].count, 10);
};

export const getWiresByOrgId = async (orgId: number): Promise<IWire[]> => {
	const response = await pool.query(
		`SELECT grafanadb.wire.id,
            grafanadb.wire.wire_uid AS "wireUid",
            grafanadb.group.org_id AS "orgId",
            grafanadb.asset.group_id AS "groupId",
            grafanadb.asset.id AS "assetId",
            grafanadb.node.digital_twin_id AS "digitalTwinId",
            grafanadb.wire.node_ini_id AS "nodeIniId",
            grafanadb.wire.nini_output_index AS "niniOutputIndex",
            grafanadb.wire.node_end_id AS "nodeEndId",
            grafanadb.wire.created, 
            grafanadb.wire.updated
            FROM grafanadb.wire
            INNER JOIN grafanadb.node ON grafanadb.wire.node_ini_id = grafanadb.node.id
            INNER JOIN grafanadb.digital_twin ON grafanadb.node.digital_twin_id = grafanadb.digital_twin.id
            INNER JOIN grafanadb.asset ON grafanadb.digital_twin.asset_id = grafanadb.asset.id
            INNER JOIN grafanadb.group ON grafanadb.asset.group_id = grafanadb.group.id
            WHERE grafanadb.group.org_id = $1
            ORDER BY grafanadb.wire.id ASC;`,
		[orgId]
	);
	return response.rows as IWire[];
};

export const getWiresByDigitalTwinId = async (digitalTwinId: number): Promise<IWire[]> => {
	const response = await pool.query(
		`SELECT grafanadb.wire.id,
            grafanadb.wire.wire_uid AS "wireUid",
            grafanadb.group.org_id AS "orgId",
            grafanadb.asset.group_id AS "groupId",
            grafanadb.asset.id AS "assetId",
            grafanadb.node.digital_twin_id AS "digitalTwinId",
            grafanadb.wire.node_ini_id AS "nodeIniId",
            grafanadb.wire.nini_output_index AS "niniOutputIndex",
            grafanadb.wire.node_end_id AS "nodeEndId",
            grafanadb.wire.created, 
            grafanadb.wire.updated
            FROM grafanadb.wire
            INNER JOIN grafanadb.node ON grafanadb.wire.node_ini_id = grafanadb.node.id
            INNER JOIN grafanadb.digital_twin ON grafanadb.node.digital_twin_id = grafanadb.digital_twin.id
            INNER JOIN grafanadb.asset ON grafanadb.digital_twin.asset_id = grafanadb.asset.id
            INNER JOIN grafanadb.group ON grafanadb.asset.group_id = grafanadb.group.id
            WHERE grafanadb.digital_twin.id = $1
            ORDER BY grafanadb.wire.id ASC;`,
		[digitalTwinId]
	);
	return response.rows as IWire[];
};

export const getWiresByNodeIniId = async (nodeIniId: number): Promise<IWire[]> => {
	const response = await pool.query(
		`SELECT grafanadb.wire.id,
            grafanadb.wire.wire_uid AS "wireUid",
            grafanadb.group.org_id AS "orgId",
            grafanadb.asset.group_id AS "groupId",
            grafanadb.asset.id AS "assetId",
            grafanadb.node.digital_twin_id AS "digitalTwinId",
            grafanadb.wire.node_ini_id AS "nodeIniId",
            grafanadb.wire.nini_output_index AS "niniOutputIndex",
            grafanadb.wire.node_end_id AS "nodeEndId",
            grafanadb.wire.created, 
            grafanadb.wire.updated
            FROM grafanadb.wire
            INNER JOIN grafanadb.node ON grafanadb.wire.node_ini_id = grafanadb.node.id
            INNER JOIN grafanadb.digital_twin ON grafanadb.node.digital_twin_id = grafanadb.digital_twin.id
            INNER JOIN grafanadb.asset ON grafanadb.digital_twin.asset_id = grafanadb.asset.id
            INNER JOIN grafanadb.group ON grafanadb.asset.group_id = grafanadb.group.id
            WHERE grafanadb.wire.node_ini_id = $1
            ORDER BY grafanadb.wire.id ASC;`,
		[nodeIniId]
	);
	return response.rows as IWire[];
};

export const getWiresByNodeEndId = async (nodeEndId: number): Promise<IWire[]> => {
	const response = await pool.query(
		`SELECT grafanadb.wire.id,
            grafanadb.wire.wire_uid AS "wireUid",
            grafanadb.group.org_id AS "orgId",
            grafanadb.asset.group_id AS "groupId",
            grafanadb.asset.id AS "assetId",
            grafanadb.node.digital_twin_id AS "digitalTwinId",
            grafanadb.wire.node_ini_id AS "nodeIniId",
            grafanadb.wire.nini_output_index AS "niniOutputIndex",
            grafanadb.wire.node_end_id AS "nodeEndId",
            grafanadb.wire.created, 
            grafanadb.wire.updated
            FROM grafanadb.wire
            INNER JOIN grafanadb.node ON grafanadb.wire.node_ini_id = grafanadb.node.id
            INNER JOIN grafanadb.digital_twin ON grafanadb.node.digital_twin_id = grafanadb.digital_twin.id
            INNER JOIN grafanadb.asset ON grafanadb.digital_twin.asset_id = grafanadb.asset.id
            INNER JOIN grafanadb.group ON grafanadb.asset.group_id = grafanadb.group.id
            WHERE grafanadb.wire.node_end_id = $1
            ORDER BY grafanadb.wire.id ASC;`,
		[nodeEndId]
	);
	return response.rows as IWire[];
};

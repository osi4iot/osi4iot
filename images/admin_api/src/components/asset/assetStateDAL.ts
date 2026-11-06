// The row of each asset in the IoT DB's iot_data.assetState (patroni_metrics): created with the asset, with the
// default state, and removed with it. The nodes of pipelines (Alarm, Machine state, Asset state) and the AI
// agents read and update it; Grafana and SQL queries can rely on every asset having its row.
import timescaledb_pool from "../../config/timescaledb_config";
import pool from "../../config/dbconfig";
import { logger } from "../../config/winston";

export const DEFAULT_ASSET_STATE = {
	alarms: {},
	status: "OK",
	state_description: "No active alarms",
};

const describe = (error: unknown): string => (error instanceof Error ? error.message : String(error));

// The row of an asset with the default state; an existing row is kept
export const createAssetStateRow = async (groupUid: string, assetUid: string): Promise<void> => {
	await timescaledb_pool.query(
		`INSERT INTO iot_data.assetState (group_uid, asset_uid, state, last_updated)
		 VALUES ($1, $2, $3::jsonb, NOW())
		 ON CONFLICT (group_uid, asset_uid) DO NOTHING`,
		[groupUid, assetUid, JSON.stringify(DEFAULT_ASSET_STATE)]
	);
};

interface GroupUidRow {
	groupUid: string;
}

interface AssetOfGroupRow {
	groupUid: string;
	assetUid: string;
}

const groupUidOf = async (groupId: number): Promise<string | null> => {
	const result = await pool.query<GroupUidRow>(`SELECT group_uid AS "groupUid" FROM grafanadb.group WHERE id = $1`, [
		groupId,
	]);
	return result.rows[0]?.groupUid ?? null;
};

// For a new asset: a failure is logged and does not undo the asset (pipelines also creates the row the first
// time it writes it, and admin_api creates the missing rows when it starts)
export const createAssetStateRowOfAsset = async (groupId: number, assetUid: string): Promise<void> => {
	try {
		const groupUid = await groupUidOf(groupId);
		if (!groupUid) throw new Error(`group ${groupId} not found`);
		await createAssetStateRow(groupUid, assetUid);
	} catch (error) {
		logger.log("error", `The asset state of asset ${assetUid} could not be created: ${describe(error)}`);
	}
};

export const deleteAssetStateRowOfAsset = async (groupId: number, assetUid: string): Promise<void> => {
	try {
		const groupUid = await groupUidOf(groupId);
		if (!groupUid) return;
		await timescaledb_pool.query("DELETE FROM iot_data.assetState WHERE group_uid = $1 AND asset_uid = $2", [
			groupUid,
			assetUid,
		]);
	} catch (error) {
		logger.log("error", `The asset state of asset ${assetUid} could not be deleted: ${describe(error)}`);
	}
};

export const deleteAssetStatesOfGroup = async (groupUid: string): Promise<void> => {
	try {
		await timescaledb_pool.query("DELETE FROM iot_data.assetState WHERE group_uid = $1", [groupUid]);
	} catch (error) {
		logger.log("error", `The asset states of group ${groupUid} could not be deleted: ${describe(error)}`);
	}
};

// When a group gets a new uid, its assets' rows follow it
export const moveAssetStatesOfGroup = async (oldGroupUid: string, newGroupUid: string): Promise<void> => {
	try {
		await timescaledb_pool.query("UPDATE iot_data.assetState SET group_uid = $2 WHERE group_uid = $1", [
			oldGroupUid,
			newGroupUid,
		]);
	} catch (error) {
		logger.log("error", `The asset states of group ${oldGroupUid} could not be moved: ${describe(error)}`);
	}
};

// At start: the row of every asset that has none (assets created before this version, or whose row failed)
export const createMissingAssetStateRows = async (): Promise<number> => {
	const assets = await pool.query<AssetOfGroupRow>(
		`SELECT grafanadb.group.group_uid AS "groupUid", grafanadb.asset.asset_uid AS "assetUid"
	 FROM grafanadb.asset INNER JOIN grafanadb.group ON grafanadb.asset.group_id = grafanadb.group.id`
	);
	if (assets.rows.length === 0) return 0;
	const result = await timescaledb_pool.query(
		`INSERT INTO iot_data.assetState (group_uid, asset_uid, state, last_updated)
		 SELECT g, a, $3::jsonb, NOW() FROM unnest($1::text[], $2::text[]) AS t(g, a)
		 ON CONFLICT (group_uid, asset_uid) DO NOTHING`,
		[assets.rows.map((r) => r.groupUid), assets.rows.map((r) => r.assetUid), JSON.stringify(DEFAULT_ASSET_STATE)]
	);
	return result.rowCount ?? 0;
};

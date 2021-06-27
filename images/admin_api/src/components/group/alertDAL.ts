import pool from "../../config/dbconfig";
import IAlert from "./interfaces/Alert.interface";
import IGroup from "./interfaces/Group.interface";

export const createAlert = async (alertData: Partial<IAlert>): Promise<void> => {
	const response = await pool.query(`INSERT INTO grafanadb.alert (version, dashboard_id, panel_id,
					org_id, name, message, state, settings, frequency, handler, severity, silenced,
					execution_error, eval_data, new_state_date, state_changes, created, updated, "for")
					VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), $15,
					NOW(), NOW(), $16)`,
		[
			alertData.version,
			alertData.dashboardId,
			alertData.panelId,
			alertData.orgId,
			alertData.name,
			alertData.message,
			alertData.state,
			alertData.settings,
			alertData.frequency,
			alertData.handler,
			'',
			false,
			'',
			'',
			0,
			alertData.for]
	);
};

export const upatedAlertSettings = async (id: number, settings: any): Promise<void> => {
	const result = await pool.query(`UPDATE grafanadb.alert SET settings = $1, updated = NOW() WHERE id = $2`,
		[settings, id]);
};

export const getAlertsByFolderId = async (folderId: number): Promise<IAlert[]> => {
	const result = await pool.query(
		`SELECT grafanadb.alert.id, grafanadb.alert.version, grafanadb.alert.dashboard_id AS "dashboardId",
		grafanadb.alert.panel_id AS "panelId", grafanadb.alert.org_id AS "orgId", grafanadb.alert.name,
		grafanadb.alert.message, grafanadb.alert.state, grafanadb.alert.settings, grafanadb.alert.frequency,
		grafanadb.alert.handler, grafanadb.alert.severity, grafanadb.alert.silenced,
		grafanadb.alert.execution_error AS "executionError", grafanadb.alert.eval_data AS "evalData",
		grafanadb.alert.new_state_date AS "newStateDate", grafanadb.alert.state_changes "stateChanges",
		grafanadb.alert.created, grafanadb.alert.updated, "for"
	  	FROM grafanadb.alert
		INNER JOIN grafanadb.dashboard ON grafanadb.alert.dashboard_id = grafanadb.dashboard.id
		WHERE grafanadb.dashboard.folder_id = $1`, [folderId]);
	return result.rows;
};

export const updateGroupUidOfRawSqlAlertSettingOfGroup = async (group: IGroup, newGroupUid: string): Promise<void> => {
	const alerts = await getAlertsByFolderId(group.folderId);
	const updateRawSqlQueries: any[] = [];
	alerts.forEach( alert => {
		const settings = JSON.parse(alert.settings);
		for (const condition of settings.conditions) {
			condition.query.model.rawSql = condition.query.model.rawSql.replace(group.groupUid, newGroupUid);
		}
		const query = pool.query(`UPDATE grafanadb.alert SET settings = $1, updated = NOW() WHERE id = $2`, [settings, alert.id]);
		updateRawSqlQueries.push(query);
	});
	await Promise.all(updateRawSqlQueries);
};

export const updateDeviceUidRawSqlAlertSettingOfGroup = async (group: IGroup, oldDeviceUid: string, newDeviceUid: string): Promise<void> => {
	const alerts = await getAlertsByFolderId(group.folderId);
	const updateRawSqlQueries: any[] = [];
	alerts.forEach( alert => {
		const settings = JSON.parse(alert.settings);
		for (const condition of settings.conditions) {
			condition.query.model.rawSql = condition.query.model.rawSql.replace(oldDeviceUid, newDeviceUid);
		}
		const query = pool.query(`UPDATE grafanadb.alert SET settings = $1, updated = NOW() WHERE id = $2`, [settings, alert.id]);
		updateRawSqlQueries.push(query);
	});
	await Promise.all(updateRawSqlQueries);
};

export const updateTopicUidRawSqlAlertSettingOfGroup = async (group: IGroup, oldTopicUid: string, newTopicUid: string): Promise<void> => {
	const alerts = await getAlertsByFolderId(group.folderId);
	const updateRawSqlQueries: any[] = [];
	alerts.forEach( alert => {
		const settings = JSON.parse(alert.settings);
		for (const condition of settings.conditions) {
			condition.query.model.rawSql = condition.query.model.rawSql.replace(oldTopicUid, newTopicUid);
		}
		const query = pool.query(`UPDATE grafanadb.alert SET settings = $1, updated = NOW() WHERE id = $2`, [settings, alert.id]);
		updateRawSqlQueries.push(query);
	});
	await Promise.all(updateRawSqlQueries);
};

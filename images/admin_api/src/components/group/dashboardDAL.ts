import { v4 as uuidv4 } from "uuid";
import pool from "../../config/dbconfig";
import IDevice from "../device/device.interface";
import ITopic from "../topic/topic.interface";
import { createAlert } from "./alertDAL";
import { getDataSourceByProp } from "./datasourceDAL";
import { accelDashboardJson } from "./defaultDashboards/accelDashboardJson";
import { homeDashboardJson } from "./defaultDashboards/homeDashboardJson";
import { tempAlertJson } from "./defaultDashboards/tempAlertJson";
import { accelAlertJson } from "./defaultDashboards/accelAlertJson";
import { tempDashboardJson } from "./defaultDashboards/tempDashboardJson";
import { getNotificationChannelUid } from "./groupDAL";
import IAlert from "./interfaces/Alert.interface";
import IDashboardData from "./interfaces/DashboardData.interface";
import IGroup from "./interfaces/Group.interface";
import process_env from "../../config/api_config";
import { getOrganizationByProp } from "../organization/organizationDAL";
import { defaultDashboard } from "./defaultDashboards/defaultDashboard";

export const insertDashboard = async (orgId: number, folderId: number, title: string, data: any): Promise<any> => {
	const now = new Date();
	const slug = title.replace(/ /g, "_").toLocaleLowerCase();
	const uuid = uuidv4();
	const response = await pool.query(`INSERT INTO grafanadb.dashboard (version, slug, title,
					data, org_id, created, updated,created_by, updated_by, gnet_id,
					plugin_id, folder_id, is_folder, has_acl, uid)
					VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
					RETURNING *`,
	[1, slug, title, data, orgId, now, now, -1, -1, 0, '', folderId, false, false, uuid]
	);
	// eslint-disable-next-line @typescript-eslint/no-unsafe-return
	return response.rows[0];
};


export const deleteDashboard = async (dashboardId: number): Promise<void> => {
	await pool.query(`DELETE FROM grafanadb.dashboard WHERE grafanadb.dashboard.id = $1`, [dashboardId]);
};

export const getDashboardsDataOfGroup = async (group: IGroup): Promise<IDashboardData[]> => {
	const folderId = group.folderId;
	const response = await pool.query(`SELECT id, data FROM grafanadb.dashboard WHERE folder_id = $1 AND is_folder = $2`, [folderId, false]);
	return response.rows as IDashboardData[];
};

export const getDashboardDataByUid = async (orgId: number, uid: string): Promise<IDashboardData> => {
	const response = await pool.query(`SELECT id, data FROM grafanadb.dashboard WHERE org_id=$1 AND uid= $2`, [orgId, uid]);
	return response.rows[0] as IDashboardData;
};

export const getDashboardsDataWithRawSqlOfGroup = async (group: IGroup): Promise<IDashboardData[]> => {
	const dashboards = await getDashboardsDataOfGroup(group);
	const dashboardsWithRawSql: IDashboardData[] = [];
	dashboards.forEach(dashboard => {
		const data = JSON.parse(dashboard.data);
		for (const panel of data.panels) {
			if (panel.datasource) {
				dashboardsWithRawSql.push(dashboard);
				break;
			}
		}
	});
	return dashboardsWithRawSql;
};

export const updateDashboardsDataRawSqlOfGroup = async (group: IGroup, newGroupUid: string, dashboardsWithRawSql: IDashboardData[]): Promise<void> => {
	const updateRawSqlQueries: any[] = [];
	dashboardsWithRawSql.forEach(dashboard => {
		const data = JSON.parse(dashboard.data);
		for (const panel of data.panels) {
			if (panel.datasource) {
				const targets = panel.targets;
				for (const target of targets) {
					if (target.rawSql !== "") {
						target.rawSql = target.rawSql.replace(group.groupUid, newGroupUid);
					}
				}
			}
		}
		const now = new Date();
		const query = pool.query('UPDATE grafanadb.dashboard SET updated = $1, data = $2 WHERE id = $3', [now, data, dashboard.id]);
		updateRawSqlQueries.push(query);
	});
	await Promise.all(updateRawSqlQueries);
};

export const updateDashboardsDataRawSqlOfDevice = async (device: IDevice, newDeviceUid: string, dashboardsWithRawSql: IDashboardData[]): Promise<void> => {
	const updateRawSqlQueries: any[] = [];
	dashboardsWithRawSql.forEach(dashboard => {
		const data = JSON.parse(dashboard.data);
		for (const panel of data.panels) {
			if (panel.datasource) {
				const targets = panel.targets;
				for (const target of targets) {
					if (target.rawSql !== "" && target.rawSql.search(device.deviceUid) !== -1) {
						target.rawSql = target.rawSql.replace(device.deviceUid, newDeviceUid);
					}
				}
			}
		}
		const now = new Date();
		const query = pool.query('UPDATE grafanadb.dashboard SET updated = $1, data = $2 WHERE id = $3', [now, data, dashboard.id]);
		updateRawSqlQueries.push(query);
	});
	await Promise.all(updateRawSqlQueries);
};

export const updateDashboardsDataRawSqlOfTopic = async (topic: ITopic, newTopicUid: string, dashboardsWithRawSql: IDashboardData[]): Promise<void> => {
	const updateRawSqlQueries: any[] = [];
	dashboardsWithRawSql.forEach(dashboard => {
		const data = JSON.parse(dashboard.data);
		for (const panel of data.panels) {
			if (panel.datasource) {
				const targets = panel.targets;
				for (const target of targets) {
					if (target.rawSql !== "" && target.rawSql.search(topic.topicUid) !== -1) {
						target.rawSql = target.rawSql.replace(topic.topicUid, newTopicUid);
					}
				}
			}
		}
		const now = new Date();
		const query = pool.query('UPDATE grafanadb.dashboard SET updated = $1, data = $2 WHERE id = $3', [now, data, dashboard.id]);
		updateRawSqlQueries.push(query);
	});
	await Promise.all(updateRawSqlQueries);
};

export const updateDashboardData = async (dashboardId: number, data: any): Promise<void> => {
	const now = new Date();
	await pool.query('UPDATE grafanadb.dashboard SET updated = $1, data = $2 WHERE id = $3', [now, data, dashboardId]);
};

export const insertPreference = async (orgId: number, homeDashboardId: number): Promise<void> => {
	const now = new Date();
	await pool.query(`INSERT INTO grafanadb.preferences (org_id, user_id, version,
					home_dashboard_id, timezone, theme, created, updated, team_id)
					VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
	[orgId, 0, 0, homeDashboardId, '', '', now, now, 0]
	);
};

export const createHomeDashboard = async (orgId: number, orgAcronym: string, orgName: string, folderId: number): Promise<void> => {
	const homeDashboard = JSON.parse(homeDashboardJson);
	const title = `Home ${orgAcronym.replace(/ /g, "_").replace(/"/g, "").toUpperCase()}`;
	const platformName = `${process_env.PLATFORM_NAME.replace(/_/g, " ").toUpperCase()} PLATFORM`;
	const html_content = `<br/>\n<h1>${platformName}</h1>\n<h2>${orgName}</h2>\n`
	homeDashboard.panels[0].options.content = html_content;
	homeDashboard.panels[0].gridPos = {
		h: 4,
		w: 24,
		x: 0,
		y: 0
	};
	homeDashboard.panels[1].gridPos = {
		h: 18,
		w: 24,
		x: 0,
		y: 4
	};
	homeDashboard.uid = uuidv4();
	const response = await insertDashboard(orgId, folderId, title, homeDashboard);
	await insertPreference(orgId, response.id);
};

export const createDemoDashboards = async (orgAcronym: string, group: IGroup, device: IDevice, topics: Partial<ITopic>[]): Promise<number[]> => {
	const dataSourceName = `iot_${orgAcronym.replace(/ /g, "_").replace(/"/g, "").toLowerCase()}_db`;
	const dataSource = await getDataSourceByProp("name", dataSourceName);
	const grouAcronym = group.acronym;
	const tempDashboard = JSON.parse(tempDashboardJson);
	const titleTempDashboard = `${grouAcronym.replace(/ /g, "_")}_Temp_demo`;
	tempDashboard.uid = uuidv4();
	tempDashboard.title = titleTempDashboard;
	const tableHash = `Table_${group.groupUid}`;
	const deviceHash = `Device_${device.deviceUid}`;
	const topic1Hash = `Topic_${topics[0].topicUid}`;
	const rawSqlTemp = `SELECT timestamp AS \"time\", CAST(payload->>'temperature' AS DOUBLE PRECISION) AS \"Temperature\" FROM  iot_datasource.${tableHash} WHERE topic = '${deviceHash}/${topic1Hash}' AND $__timeFilter(timestamp) ORDER BY time DESC;`;
	for (let i = 0; i < 3; i++) {
		tempDashboard.panels[i].targets[0].rawSql = rawSqlTemp;
		tempDashboard.panels[i].datasource = dataSourceName;
	}
	const emailNotificationChannelUid = await getNotificationChannelUid(group.emailNotificationChannelId);
	tempDashboard.panels[0].alert.notifications[0].uid = emailNotificationChannelUid;
	const telegramNotificationChannelUid = await getNotificationChannelUid(group.telegramNotificationChannelId);
	tempDashboard.panels[0].alert.notifications[1].uid = telegramNotificationChannelUid;
	const tempDashboardCreated = await insertDashboard(group.orgId, group.folderId, titleTempDashboard, tempDashboard);

	const tempAlertData = JSON.parse(tempAlertJson);
	tempAlertData.conditions[0].query.datasourceId = dataSource.id;
	tempAlertData.conditions[0].query.model.rawSql = rawSqlTemp;
	tempAlertData.notifications[0].uid = emailNotificationChannelUid;
	tempAlertData.notifications[1].uid = telegramNotificationChannelUid;
	const tempAlert = createTempDemoAlert(group.orgId, tempDashboardCreated.id, 2, tempAlertData);
	await createAlert(tempAlert);

	const accelDashboard = JSON.parse(accelDashboardJson);
	const titleAccelDashboard = `${grouAcronym.replace(/ /g, "_")}_Accel_demo`;
	accelDashboard.uid = uuidv4();
	accelDashboard.title = titleAccelDashboard;
	accelDashboard.panels[0].datasource = dataSourceName;
	accelDashboard.panels[0].alert.notifications[0].uid = emailNotificationChannelUid;
	accelDashboard.panels[0].alert.notifications[1].uid = telegramNotificationChannelUid;;
	const topic2Hash = `Topic_${topics[1].topicUid}`;
	const rawSqlAccel = `SELECT timestamp AS \"time\", CAST(payload->'accelerations'->>0 AS DOUBLE PRECISION) AS \"Ax\", CAST(payload->'accelerations'->>1 AS DOUBLE PRECISION) AS \"Ay\", CAST(payload->'accelerations'->>2 AS DOUBLE PRECISION) AS \"Az\" FROM  iot_datasource.${tableHash} WHERE topic = '${deviceHash}/${topic2Hash}' AND $__timeFilter(timestamp) ORDER BY time DESC;`;
	accelDashboard.panels[0].targets[0].rawSql = rawSqlAccel;
	const accelDashboardCreated = await insertDashboard(group.orgId, group.folderId, titleAccelDashboard, accelDashboard);

	const accelAlertData = JSON.parse(accelAlertJson);
	accelAlertData.conditions[0].query.datasourceId = dataSource.id;
	accelAlertData.conditions[0].query.model.rawSql = rawSqlAccel;
	accelAlertData.notifications[0].uid = emailNotificationChannelUid;
	accelAlertData.notifications[1].uid = telegramNotificationChannelUid;
	const accelAlert = createAccelDemoAlert(group.orgId, accelDashboardCreated.id, 2, accelAlertData);
	await createAlert(accelAlert);

	return [tempDashboardCreated.id as number, accelDashboardCreated.id  as number];
};

export const createDashboard = async (group: IGroup, device: IDevice, topic: Partial<ITopic>, digitalTwinUid: string): Promise<number> => {
	const org = await getOrganizationByProp("id", group.orgId);
	const dataSourceName = `iot_${org.acronym.replace(/ /g, "_").replace(/"/g, "").toLowerCase()}_db`;
	const dataSource = await getDataSourceByProp("name", dataSourceName);
	const dashboard = JSON.parse(defaultDashboard);
	const dashboardTitle = `${digitalTwinUid} dashboard`;
	dashboard.uid = uuidv4();
	dashboard.title = dashboardTitle;
	const tableHash = `Table_${group.groupUid}`;
	const deviceHash = `Device_${device.deviceUid}`;
	let rawSql = "";
	if (topic !== undefined) {
		const topicHash = `Topic_${topic.topicUid}`;
		rawSql = `SELECT timestamp AS \"time\", CAST(payload->>'parameter' AS DOUBLE PRECISION) AS \"Parameter\" FROM  iot_datasource.${tableHash} WHERE topic = '${deviceHash}/${topicHash}' AND $__timeFilter(timestamp) ORDER BY time DESC;`;
	}
	dashboard.panels[0].targets[0].rawSql = rawSql;
	dashboard.panels[0].targets[0].datasource.uid = dataSource.uid;
	const dashboardCreated = await insertDashboard(group.orgId, group.folderId, dashboardTitle, dashboard);

	return dashboardCreated.id as number;
};



const createTempDemoAlert = (orgId: number, dashboardId: number, panelId: number, settings: any): Partial<IAlert> => {
	const alert: Partial<IAlert> = {
		version: 0,
		dashboardId,
		panelId,
		orgId,
		name: "Temperature evolution alert",
		message: "Device temperature has exceeded 50°C, please try to fix it as soon as possible",
		state: 'unknown',
		settings,
		frequency: 60,
		handler: 1,
		severity: "",
		silenced: false,
		executionError: "",
		evalData: "",
		stateChanges: 0,
		for: 180000000000
	}
	return alert;
}

const createAccelDemoAlert = (orgId: number, dashboardId: number, panelId: number, settings: any): Partial<IAlert> => {
	const alert: Partial<IAlert> = {
		version: 0,
		dashboardId,
		panelId,
		orgId,
		name: "Acceleration evolution alert",
		message: "Acceleration of some axis of the mobile device has exceeded 40 m/s^2.",
		state: 'unknown',
		settings,
		frequency: 20,
		handler: 1,
		severity: "",
		silenced: false,
		executionError: "",
		evalData: "",
		stateChanges: 0,
		for: 180000000000
	}
	return alert;
}






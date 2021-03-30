import { v4 as uuidv4 } from "uuid";
import pool from "../../config/dbconfig";
import IDevice from "../device/device.interface";
import { accelDashboardJson } from "./defaultDashboards/accelDashboardJson";
import { homeDashboardJson } from "./defaultDashboards/homeDashboardJson";
import { tempDashboardJson } from "./defaultDashboards/tempDashboardJson";
import { getNotificationChannelUid } from "./groupDAL";
import IDashboardData from "./interfaces/DashboardData.interface";
import IGroup from "./interfaces/Group.interface";

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
	return response.rows[0];
};

export const getDashboardsDataOfGroup = async (group: IGroup): Promise<IDashboardData[]> => {
	const folderId = group.folderId;
	const response = await pool.query(`SELECT id, data FROM grafanadb.dashboard WHERE folder_id = $1 AND is_folder = $2`, [folderId, false]);
	return response.rows;
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
}

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
}

export const updateDashboardData = async (dashboardId: number, data: any): Promise<void> => {
	const now = new Date();
	await pool.query('UPDATE grafanadb.dashboard SET updated = $1, data = $2 WHERE id = $3', [now, data, dashboardId]);
};

export const insertPreference = async (orgId: number, homeDashboardId: number): Promise<void> => {
	const now = new Date();
	const response = await pool.query(`INSERT INTO grafanadb.preferences (org_id, user_id, version,
					home_dashboard_id, timezone, theme, created, updated, team_id)
					VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
		[orgId, 0, 0, homeDashboardId, '', '', now, now, 0]
	);
};

export const createHomeDashboard = async (orgId: number, orgAcronym: string, orgName: string, folderId: number): Promise<void> => {
	const homeDashboard = JSON.parse(homeDashboardJson);
	const title = `Home ${orgAcronym.replace(/_/g, " ").toUpperCase()}`;
	const platformName = `${process.env.PLATFORM_NAME.replace(/_/g, " ").toUpperCase()} PLATFORM`;
	const html_content = `<br/>\n<h1>${platformName}</h1>\n<h2>${orgName}</h2>\n`
	homeDashboard.panels[0].options.content = html_content;
	homeDashboard.uid = uuidv4();
	const response = await insertDashboard(orgId, folderId, title, homeDashboard);
	await insertPreference(orgId, response.id);
};

export const createDemoDashboards = async (orgAcronym: string, group: IGroup, device: IDevice): Promise<void> => {
	const dataSourceName = `iot_${orgAcronym.replace(/ /g, "_").toLowerCase()}_db`;
	const grouAcronym = group.acronym;
	const tempDashboard = JSON.parse(tempDashboardJson);
	const titleTempDashboard = `${grouAcronym.replace(/ /g, "_")}_Temp_demo`;
	tempDashboard.uid = uuidv4();
	tempDashboard.title = titleTempDashboard;
	const tableHash = `Table_${group.groupUid}`;
	const deviceHash = `Device_${device.deviceUid}`;
	const rawSqlTemp = `SELECT timestamp AS \"time\", CAST(payload->>'temperature' AS DOUBLE PRECISION) AS \"Temperature\" FROM  iot_datasource.${tableHash} WHERE topic = '${deviceHash}/temperature' AND $__timeFilter(timestamp) ORDER BY time DESC;`;
	for (let i = 0; i < 3; i++) {
		tempDashboard.panels[i].targets[0].rawSql = rawSqlTemp;
		tempDashboard.panels[i].datasource = dataSourceName;
	}
	const emailNotificationChannelUid = await getNotificationChannelUid(group.emailNotificationChannelId);
	tempDashboard.panels[0].alert.notifications[0].uid = emailNotificationChannelUid;
	const telegramNotificationChannelUid = await getNotificationChannelUid(group.telegramNotificationChannelId);
	tempDashboard.panels[0].alert.notifications[1].uid = telegramNotificationChannelUid;
	await insertDashboard(group.orgId, group.folderId, titleTempDashboard, tempDashboard);

	const accelDashboard = JSON.parse(accelDashboardJson);
	const titleTempAccelDashboard = `${grouAcronym.replace(/ /g, "_")}_Accel_demo`;
	accelDashboard.uid = uuidv4();
	accelDashboard.title = titleTempAccelDashboard;
	accelDashboard.panels[0].datasource = dataSourceName;
	const rawSqlAccel = `SELECT timestamp AS \"time\", CAST(payload->>'ax' AS DOUBLE PRECISION) AS \"Ax\", CAST(payload->>'ay' AS DOUBLE PRECISION) AS \"Ay\", CAST(payload->>'az' AS DOUBLE PRECISION) AS \"Az\" FROM  iot_datasource.${tableHash} WHERE topic = '${deviceHash}/accelerations' AND $__timeFilter(timestamp) ORDER BY time DESC;`;
	accelDashboard.panels[0].targets[0].rawSql = rawSqlAccel;
	await insertDashboard(group.orgId, group.folderId, titleTempAccelDashboard, accelDashboard);
};




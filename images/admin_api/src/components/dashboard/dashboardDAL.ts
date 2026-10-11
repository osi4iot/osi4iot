import pool, { readQuery, dbQuery, DbAccess } from "../../config/dbconfig";
import IDashboard from "./dashboard.interface";
import IDashboardInfo from "./dashboardInfo.interfase";

const extendDashboards = (dashboards: IDashboard[]) => {
	const dashboardsExtended: IDashboard[] = []
	for (const dashboard of dashboards) {
		const data = JSON.parse(dashboard.data);
		const newDashboard = {
			id: dashboard.id,
			orgId: dashboard.orgId,
			groupId: dashboard.groupId,
			uid: dashboard.uid,
			title: dashboard.title,
			slug: dashboard.slug,
			refresh: data.refresh,
			timeRangeFrom: data.time.from,
			timeRangeTo: data.time.to,
			created: dashboard.created,
			updated: dashboard.updated
		}
		dashboardsExtended.push(newDashboard);
	}
	return dashboardsExtended;
}

export const getDashboardById = async (dashboardId: number): Promise<IDashboard> => {
	const response = await readQuery(`SELECT grafanadb.dashboard.id, grafanadb.group.org_id as "orgId",
									grafanadb.group.id as "groupId", grafanadb.dashboard.slug,
									grafanadb.dashboard.title,  grafanadb.dashboard.uid,
									grafanadb.dashboard.data,
									grafanadb.dashboard.created, grafanadb.dashboard.updated
									FROM grafanadb.dashboard
									INNER JOIN grafanadb.dashboard_acl ON grafanadb.dashboard.folder_id = grafanadb.dashboard_acl.dashboard_id
									INNER JOIN grafanadb.group ON grafanadb.dashboard_acl.team_id = grafanadb.group.team_id
									WHERE grafanadb.dashboard.id = $1 AND
									grafanadb.dashboard.is_folder = $2`, [dashboardId, false]);
	const dashboard = response.rows[0] as IDashboard;
	return extendDashboards([dashboard])[0];
}

export const getAllDashboards = async (): Promise<IDashboard[]> => {
	const response = await readQuery(`
		SELECT grafanadb.dashboard.id, grafanadb.group.org_id as "orgId",
		grafanadb.group.id as "groupId", grafanadb.dashboard.slug,
		grafanadb.dashboard.title,  grafanadb.dashboard.uid,
		grafanadb.dashboard.data,
		grafanadb.dashboard.created, grafanadb.dashboard.updated
		FROM grafanadb.dashboard
		INNER JOIN grafanadb.dashboard_acl ON grafanadb.dashboard.folder_id = grafanadb.dashboard_acl.dashboard_id
		INNER JOIN grafanadb.group ON grafanadb.dashboard_acl.team_id = grafanadb.group.team_id
		WHERE grafanadb.dashboard.is_folder = $1
		ORDER BY grafanadb.dashboard.id ASC;`, [false]);
	const dashboards = response.rows as IDashboard[];
	return extendDashboards(dashboards);
}

export const getDashboardsByGroupsIdArray = async (groupsIdArray: number[]): Promise<IDashboard[]> => {
	const response = await pool.query(`
		SELECT grafanadb.dashboard.id, grafanadb.group.org_id as "orgId",
		grafanadb.group.id as "groupId", grafanadb.dashboard.slug,
		grafanadb.dashboard.title,  grafanadb.dashboard.uid,
		grafanadb.dashboard.data,
		grafanadb.dashboard.created, grafanadb.dashboard.updated
		FROM grafanadb.dashboard
		INNER JOIN grafanadb.dashboard_acl ON grafanadb.dashboard.folder_id = grafanadb.dashboard_acl.dashboard_id
		INNER JOIN grafanadb.group ON grafanadb.dashboard_acl.team_id = grafanadb.group.team_id
		WHERE grafanadb.group.id = ANY($1::bigint[]) AND grafanadb.dashboard.is_folder = $2
		ORDER BY grafanadb.dashboard.id ASC,
		grafanadb.group.id ASC;`, [groupsIdArray, false]);
	const dashboards = response.rows as IDashboard[];
	return extendDashboards(dashboards);
};

export const checkIfExistDashboards = async (dashboardsIdArray: number[]): Promise<string> => {
	let message = "OK"
	const response = await readQuery(`
		SELECT grafanadb.dashboard.id FROM grafanadb.dashboard
		WHERE grafanadb.dashboard.id = ANY($1::bigint[]) AND grafanadb.dashboard.is_folder = $2
		ORDER BY grafanadb.dashboard.id ASC;`, [dashboardsIdArray, false]);

	const existentDashboardsId = response.rows.map(elem => elem.id as number);
	const nonExistentDashboardsId = dashboardsIdArray.filter(dashboardId => !existentDashboardsId.includes(dashboardId));
	if (nonExistentDashboardsId.length !== 0) {
		message = `Dashboards with id=[${nonExistentDashboardsId.toString()}] no longer exist`
	}
	return message;
};

export const markInexistentDashboards = async (dashboardsIdArray: number[]): Promise<number[]> => {
	const response = await readQuery(`
		SELECT grafanadb.dashboard.id FROM grafanadb.dashboard
		WHERE grafanadb.dashboard.id = ANY($1::bigint[]) AND grafanadb.dashboard.is_folder = $2
		ORDER BY grafanadb.dashboard.id ASC;`, [dashboardsIdArray, false]);

	const existentDashboardsId = response.rows.map(elem => elem.id as number);
	const markedDashboards = dashboardsIdArray.map(dashboardId => {
		if (!existentDashboardsId.includes(dashboardId)) return -dashboardId;
		else return dashboardId;
	})
	return markedDashboards;
};

export const getDashboardsInfoFromIdArray = async (
	idArray: number[],
	access: DbAccess = "write"
): Promise<IDashboardInfo[]> => {
	if (idArray.length === 0) return [];

	// Negative ids are a sentinel for "this dashboard no longer exists";
	// they are synthesised below rather than queried. Splitting them out
	// first means an array of only sentinels skips the round trip
	// entirely instead of sending `= ANY('{}')`, which can never match.
	const existingIds = idArray.filter(id => id > 0);
	const missingIds = idArray.filter(id => id < 0);

	const nonExistentDashboardsInfo = missingIds.map(id => ({
		dashboardId: -id,
		slug: "Inexistent",
		uid: "",
	}));

	if (existingIds.length === 0) return nonExistentDashboardsInfo as IDashboardInfo[];

	const response = await dbQuery<IDashboardInfo>(access, `
		SELECT grafanadb.dashboard.id AS "dashboardId",
		grafanadb.dashboard.slug, grafanadb.dashboard.uid
		FROM grafanadb.dashboard
		WHERE grafanadb.dashboard.id = ANY($1::bigint[]) AND grafanadb.dashboard.is_folder = $2
		ORDER BY grafanadb.dashboard.id ASC;`, [existingIds, false]);

	return response.rows.concat(nonExistentDashboardsInfo as IDashboardInfo[]);
};


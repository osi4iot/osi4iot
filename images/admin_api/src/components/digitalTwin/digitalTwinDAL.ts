import pool from "../../config/dbconfig";
import format from "pg-format";
import IGroup from "../group/interfaces/Group.interface";
import CreateDigitalTwinDto from "./digitalTwin.dto";
import IDigitalTwin from "./digitalTwin.interface";
import IDigitalTwinState from "./digitalTwinState.interface";
import IDigitalTwinUpdate from "./digitalTwinUpdate.interface";
import IUser from "../user/interfaces/User.interface";
import ITopic from "../topic/topic.interface";
import IDashboard from "../dashboard/dashboard.interface";
import { checkIfExistDashboards, getAllDashboards, getDashboardsByGroupsIdArray, getDashboardsInfoFromIdArray } from "../dashboard/dashboardDAL";
import { checkIfExistTopics, getAllTopics, getMqttTopicsInfoFromIdArray, getTopicsByGroupsIdArray } from "../topic/topicDAL";
import { getGroupsThatCanBeEditatedAndAdministratedByUserId, getAllGroupsInOrgArray } from "../group/groupDAL";
import { getOrganizationsManagedByUserId } from "../organization/organizationDAL";
import IMqttTopicInfo from "../topic/mqttTopicInfo.interface";
import getDomainUrl from "../../utils/helpers/getDomainUrl";
import IDashboardInfo from "../dashboard/dashboardInfo.interfase";
import HttpException from "../../exceptions/HttpException";

export const getTopicsIdAndDashboardsIdFromDigitalTwin = (digitalTwin: CreateDigitalTwinDto | IDigitalTwin): [number[], number[]] => {
	const topicsId: number[] = [];
	const dashboardsId: number[] = [];
	if (digitalTwin.type === "Grafana dashboard") {
		dashboardsId.push(digitalTwin.dashboardId)
	} else {
		let gltfData: any = digitalTwin.gltfData;
		if (typeof gltfData === "string") gltfData = JSON.parse(gltfData);
		if (gltfData && gltfData.nodes?.length !== 0) {
			gltfData.nodes.forEach((node: { extras: { topicId: any; dashboardId: any; }; }) => {
				const topicId = node.extras?.topicId;
				if (topicId && topicsId.findIndex(id => id === topicId) === -1) {
					topicsId.push(topicId)
				}
				const dashboardId = node.extras?.dashboardId;
				if (dashboardsId && dashboardsId.findIndex(id => id === dashboardId) === -1) {
					dashboardsId.push(dashboardId)
				}
			})
		}
	}
	return [topicsId, dashboardsId];
}

const arrayContainedChecker = (arr: number[], target: number[]) => target.every(v => arr.includes(v));

export const checkIfLoggedUserManageTopicsAndDashboards = async (
	user: IUser,
	digitalTwinType: string,
	topicsId: number[],
	dashboardsId: number[]
): Promise<string> => {
	let message = "OK";
	let topicsManagedByUser: ITopic[] = [];
	let dashboardsManagedByUser: IDashboard[] = [];
	if (user.isGrafanaAdmin) {
		dashboardsManagedByUser = await getAllDashboards();
		if (digitalTwinType === "Gltf 3D model") {
			topicsManagedByUser = await getAllTopics();
		}
	} else {
		const groups = await getGroupsThatCanBeEditatedAndAdministratedByUserId(user.id);
		const organizations = await getOrganizationsManagedByUserId(user.id);
		if (organizations.length !== 0) {
			const orgIdsArray = organizations.map(org => org.id);
			const groupsInOrgs = await getAllGroupsInOrgArray(orgIdsArray)
			const groupsIdArray = groups.map(group => group.id);
			groupsInOrgs.forEach(groupInOrg => {
				if (groupsIdArray.indexOf(groupInOrg.id) === -1) groups.push(groupInOrg);
			})
		}
		if (groups.length !== 0) {
			const groupsIdArray = groups.map(group => group.id);
			if (digitalTwinType === "Gltf 3D model") {
				topicsManagedByUser = await getTopicsByGroupsIdArray(groupsIdArray);
			}
			dashboardsManagedByUser = await getDashboardsByGroupsIdArray(groupsIdArray);
		}
	}
	if (digitalTwinType === "Grafana dashboard") {
		const filteredDashboards = dashboardsManagedByUser.filter(dashboard => dashboard.id === dashboardsId[0]);
		if (filteredDashboards.length === 0) {
			message = "The indicated dashboard is not managed for the logged user";
		}
	} else if (digitalTwinType === "Gltf 3D model") {
		const topicsIdManagedByUser = topicsManagedByUser.map(topic => topic.id);
		const dashboardsIdManagedByUser = dashboardsManagedByUser.map(dashboard => dashboard.id);
		const isTopicsManaged = arrayContainedChecker(topicsId, topicsIdManagedByUser);
		const isDashboardsManaged = arrayContainedChecker(dashboardsId, dashboardsIdManagedByUser);
		if (isTopicsManaged || isDashboardsManaged) {
			message = "The indicated topics and/or dashboards are not managed for the logged user";
		}
	}
	return message;
}

export const demoDigitalTwinName = (group: IGroup, deviceType: string): string => {
	let digitalTwinName: string;
	if (deviceType === "Mobile") digitalTwinName = `${group.acronym.replace(/ /g, "_")}_mobile_default_DT`;
	else digitalTwinName = `${group.acronym.replace(/ /g, "_")}_generic_default_DT`;
	return digitalTwinName;
}

export const insertDigitalTwin = async (digitalTwinData: IDigitalTwinUpdate): Promise<IDigitalTwinUpdate> => {
	const result = await pool.query(`INSERT INTO grafanadb.digital_twin (device_id,
					name, description, type, dashboard_id, gltfdata, created, updated)
					VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
					RETURNING  id, device_id AS "deviceId", name, description,
					type, dashboard_id AS "dashboardId", gltfdata AS "gltfData", created, updated`,
		[
			digitalTwinData.deviceId,
			digitalTwinData.name,
			digitalTwinData.description,
			digitalTwinData.type,
			digitalTwinData.dashboardId,
			digitalTwinData.gltfData,
		]);
	return result.rows[0];
};


export const updateDigitalTwinById = async (digitalTwinId: number, digitalTwinData: IDigitalTwin): Promise<void> => {
	const query = `UPDATE grafanadb.digital_twin SET name = $1, description = $2, type = $3,
					dashboard_id = $4, gltfdata = $5, updated = NOW() WHERE grafanadb.digital_twin.id = $6;`;
	const result = await pool.query(query, [
		digitalTwinData.name,
		digitalTwinData.description,
		digitalTwinData.type,
		digitalTwinData.dashboardId,
		digitalTwinData.gltfData,
		digitalTwinId
	]);
};



export const deleteDigitalTwinById = async (digitalTwinId: number): Promise<void> => {
	await pool.query(`DELETE FROM grafanadb.digital_twin WHERE grafanadb.digital_twin.id = $1`, [digitalTwinId]);
};

export const createDigitalTwin = async (deviceId: number, digitalTwinInput: CreateDigitalTwinDto): Promise<IDigitalTwinUpdate | null> => {
	const digitalTwinUpdated: IDigitalTwinUpdate = { ...digitalTwinInput, deviceId };
	const digitalTwin = await insertDigitalTwin(digitalTwinUpdated);
	return digitalTwin;
};

export const getDigitalTwinByProp = async (propName: string, propValue: (string | number)): Promise<IDigitalTwin> => {
	const response = await pool.query(`SELECT grafanadb.digital_twin.id, grafanadb.device.org_id AS "orgId",
									grafanadb.device.group_id AS "groupId", grafanadb.digital_twin.device_id AS "deviceId",
									grafanadb.digital_twin.name, grafanadb.digital_twin.description,
									grafanadb.digital_twin.type, grafanadb.digital_twin.dashboard_id AS "dashboardId",
									grafanadb.digital_twin.gltfdata AS "gltfData",
									grafanadb.digital_twin.created, grafanadb.digital_twin.updated
									FROM grafanadb.digital_twin
									INNER JOIN grafanadb.device ON grafanadb.digital_twin.device_id = grafanadb.device.id
									WHERE grafanadb.digital_twin.${propName} = $1`, [propValue]);
	return response.rows[0];
}

export const getAllDigitalTwins = async (): Promise<IDigitalTwin[]> => {
	const response = await pool.query(`SELECT grafanadb.digital_twin.id, grafanadb.device.org_id AS "orgId",
									grafanadb.device.group_id AS "groupId", grafanadb.digital_twin.device_id AS "deviceId",
									grafanadb.digital_twin.name, grafanadb.digital_twin.description,
									grafanadb.digital_twin.type, grafanadb.digital_twin.dashboard_id AS "dashboardId",
									grafanadb.digital_twin.gltfdata AS "gltfData",
									grafanadb.digital_twin.created, grafanadb.digital_twin.updated
									FROM grafanadb.digital_twin
									INNER JOIN grafanadb.device ON grafanadb.digital_twin.device_id = grafanadb.device.id
									ORDER BY grafanadb.digital_twin.id ASC,
											grafanadb.device.org_id ASC,
											grafanadb.device.group_id ASC;`);
	return response.rows;
}

export const getStateOfAllDigitalTwins = async (): Promise<IDigitalTwinState[]> => {
	const response = await pool.query(`SELECT grafanadb.digital_twin.id AS "digitalTwinId", grafanadb.device.org_id AS "orgId",
									grafanadb.device.group_id AS "groupId", grafanadb.digital_twin.device_id AS "deviceId",
									grafanadb.alert.state
									FROM grafanadb.digital_twin
									INNER JOIN grafanadb.device ON grafanadb.digital_twin.device_id = grafanadb.device.id
									INNER JOIN grafanadb.alert ON grafanadb.digital_twin.dashboard_id = grafanadb.alert.dashboard_id
									ORDER BY grafanadb.device.org_id ASC,
											grafanadb.device.group_id ASC,
											grafanadb.device.id ASC,
											grafanadb.digital_twin.id ASC;`);
	return response.rows;
}

export const getNumDigitalTwins = async (): Promise<number> => {
	const result = await pool.query(`SELECT COUNT(*) FROM grafanadb.digital_twin;`);
	return parseInt(result.rows[0].count, 10);
}

export const getNumDigitalTwinsByDeviceId = async (deviceId: number): Promise<number> => {
	const result = await pool.query(`SELECT COUNT(*) FROM grafanadb.digital_twin
									INNER JOIN grafanadb.device ON grafanadb.digital_twin.device_id = grafanadb.device.id
									WHERE grafanadb.device.id = $1`, [deviceId]);
	return parseInt(result.rows[0].count, 10);
}


export const getDigitalTwinsByGroupId = async (groupId: number): Promise<IDigitalTwin[]> => {
	const response = await pool.query(`SELECT grafanadb.digital_twin.id, grafanadb.device.org_id AS "orgId",
									grafanadb.device.group_id AS "groupId", grafanadb.digital_twin.device_id AS "deviceId",
									grafanadb.digital_twin.name, grafanadb.digital_twin.description,
									grafanadb.digital_twin.type, grafanadb.digital_twin.dashboard_id AS "dashboardId",
									grafanadb.digital_twin.gltfdata AS "gltfData",
									grafanadb.digital_twin.created, grafanadb.digital_twin.updated
									FROM grafanadb.digital_twin
									INNER JOIN grafanadb.device ON grafanadb.digital_twin.device_id = grafanadb.device.id
									WHERE grafanadb.device.group_id = $1
									ORDER BY grafanadb.digital_twin.id ASC,
										grafanadb.device.org_id ASC,
										grafanadb.device.group_id ASC`, [groupId]);
	return response.rows;
};

export const getDigitalTwinsByGroupsIdArray = async (groupsIdArray: number[]): Promise<IDigitalTwin[]> => {
	const response = await pool.query(`SELECT grafanadb.digital_twin.id, grafanadb.device.org_id AS "orgId",
									grafanadb.device.group_id AS "groupId", grafanadb.digital_twin.device_id AS "deviceId",
									grafanadb.digital_twin.name, grafanadb.digital_twin.description,
									grafanadb.digital_twin.type, grafanadb.digital_twin.dashboard_id AS "dashboardId",
									grafanadb.digital_twin.gltfdata AS "gltfData",
									grafanadb.digital_twin.created, grafanadb.digital_twin.updated
									FROM grafanadb.digital_twin
									INNER JOIN grafanadb.device ON grafanadb.digital_twin.device_id = grafanadb.device.id
									WHERE grafanadb.device.group_id = ANY($1::bigint[])
									ORDER BY grafanadb.digital_twin.id ASC,
										grafanadb.device.org_id ASC,
										grafanadb.device.group_id ASC`, [groupsIdArray]);
	return response.rows;
};

export const getStateOfDigitalTwinsByGroupsIdArray = async (groupsIdArray: number[]): Promise<IDigitalTwinState[]> => {
	const response = await pool.query(`SELECT grafanadb.digital_twin.id AS "digitalTwinId", grafanadb.device.org_id AS "orgId",
									grafanadb.device.group_id AS "groupId", grafanadb.digital_twin.device_id AS "deviceId",
									grafanadb.alert.state
									FROM grafanadb.digital_twin
									INNER JOIN grafanadb.device ON grafanadb.digital_twin.device_id = grafanadb.device.id
									INNER JOIN grafanadb.alert ON grafanadb.digital_twin.dashboard_id = grafanadb.alert.dashboard_id
									WHERE grafanadb.device.group_id = ANY($1::bigint[])
									ORDER BY grafanadb.device.org_id ASC,
											grafanadb.device.group_id ASC,
											grafanadb.device.id ASC,
											grafanadb.digital_twin.id ASC`, [groupsIdArray]);
	return response.rows;
};



export const getNumDigitalTwinsByGroupsIdArray = async (groupsIdArray: number[]): Promise<number> => {
	const result = await pool.query(`SELECT COUNT(*) FROM grafanadb.digital_twin
									INNER JOIN grafanadb.device ON grafanadb.digital_twin.device_id = grafanadb.device.id
									WHERE grafanadb.device.group_id = ANY($1::bigint[])`, [groupsIdArray]);
	return parseInt(result.rows[0].count, 10);
}

export const getDigitalTwinsByOrgId = async (orgId: number): Promise<IDigitalTwin[]> => {
	const response = await pool.query(`SELECT grafanadb.digital_twin.id, grafanadb.device.org_id AS "orgId",
									grafanadb.device.group_id AS "groupId", grafanadb.digital_twin.device_id AS "deviceId",
									grafanadb.digital_twin.name, grafanadb.digital_twin.description,
									grafanadb.digital_twin.type, grafanadb.digital_twin.dashboard_id AS "dashboardId",
									grafanadb.digital_twin.gltfdata AS "gltfData",
									grafanadb.digital_twin.created, grafanadb.digital_twin.updated
									FROM grafanadb.digital_twin
									INNER JOIN grafanadb.device ON grafanadb.digital_twin.device_id = grafanadb.device.id
									WHERE grafanadb.device.org_id = $1
									ORDER BY grafanadb.digital_twin.id ASC,
										grafanadb.device.org_id ASC,
										grafanadb.device.group_id ASC`, [orgId]);
	return response.rows;
};

export const addMqttTopicAndDashboardUrl = async (digitalTwins: IDigitalTwin[]): Promise<IDigitalTwin[]> => {
	let topicIdArray: number[] = [];
	let dashboardIdArray: number[] = [];
	digitalTwins.forEach(digitalTwin => {
		const [topicsId, dashboardsId] = getTopicsIdAndDashboardsIdFromDigitalTwin(digitalTwin);
		if (topicsId.length !== 0) {
			const topicsIdConcat = topicIdArray.concat(topicsId)
			topicIdArray = topicsIdConcat.filter((item: number, pos: number) => topicsIdConcat.indexOf(item) === pos);
		}

		if (dashboardsId.length !== 0) {
			const dashboardsIdConcat = dashboardIdArray.concat(dashboardsId)
			dashboardIdArray = dashboardsIdConcat.filter((item: number, pos: number) => dashboardsIdConcat.indexOf(item) === pos);
		}
	})

	const checkIfExistTopicsMessage = await checkIfExistTopics(topicIdArray);
	if (checkIfExistTopicsMessage !== "OK") {
		throw new HttpException(400, checkIfExistTopicsMessage);
	}

	const checkIfExistDashboardsMessage = await checkIfExistDashboards(dashboardIdArray);
	if (checkIfExistDashboardsMessage !== "OK") {
		throw new HttpException(400, checkIfExistDashboardsMessage);
	}

	const topicsInfo = await getMqttTopicsInfoFromIdArray(topicIdArray);
	const dashboardsInfo = await getDashboardsInfoFromIdArray(dashboardIdArray);

	const digitalTwinsExtended = [...digitalTwins];
	digitalTwinsExtended.forEach(digitalTwin => {
		const [topicsId, dashboardsId] = getTopicsIdAndDashboardsIdFromDigitalTwin(digitalTwin);
		digitalTwin.mqttTopics = topicsId.map(topicId => {
			const topicInformation = topicsInfo.filter(topicInfo => topicInfo.topicId === topicId)[0];
			return generateMqttTopic(topicInformation)
		});

		digitalTwin.dashboardUrls = dashboardsId.map(dashboardId => {
			const dahboardInfo = dashboardsInfo.filter(elem => elem.dashboardId === dashboardId)[0];
			return generateDashboardUrl(dahboardInfo);
		})
	});
	return digitalTwinsExtended;
}

const generateMqttTopic = (mqttTopicInfo: IMqttTopicInfo): string => {
	const mqttTopic = `${mqttTopicInfo.topicType}/Group_${mqttTopicInfo.groupHash}/Device_${mqttTopicInfo.deviceHash}/Topic_${mqttTopicInfo.topicHash}`;
	return mqttTopic;
}

const generateDashboardUrl = (dashboardInfo: IDashboardInfo): string => {
	const domainName = getDomainUrl();
	const dashboardUrl = `${domainName}/grafana/d/${dashboardInfo.uid}/${dashboardInfo.slug}`;
	return dashboardUrl;
}



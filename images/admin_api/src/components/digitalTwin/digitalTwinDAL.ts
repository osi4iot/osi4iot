import pool from "../../config/dbconfig";
import IGroup from "../group/interfaces/Group.interface";
import CreateDigitalTwinDto from "./digitalTwin.dto";
import IDigitalTwin from "./digitalTwin.interface";
import IDigitalTwinState from "./digitalTwinState.interface";
import IDigitalTwinUpdate from "./digitalTwinUpdate.interface";
import IUser from "../user/interfaces/User.interface";
import ITopic from "../topic/topic.interface";
import IDashboard from "../dashboard/dashboard.interface";
import { getAllDashboards, getDashboardsByGroupsIdArray, getDashboardsInfoFromIdArray, markInexistentDashboards } from "../dashboard/dashboardDAL";
import { createTopic, getAllTopics, getMqttTopicsInfoFromIdArray, getTopicsByGroupsIdArray, markInexistentTopics } from "../topic/topicDAL";
import { getGroupsThatCanBeEditatedAndAdministratedByUserId, getAllGroupsInOrgArray } from "../group/groupDAL";
import { getOrganizationsManagedByUserId } from "../organization/organizationDAL";
import IMqttTopicInfo from "../topic/mqttTopicInfo.interface";
import getDomainUrl from "../../utils/helpers/getDomainUrl";
import IDashboardInfo from "../dashboard/dashboardInfo.interfase";
import IDigitalTwinGltfData, { IMqttTopicData } from "./digitalTwinGltfData.interface";
import { getLastMeasurement } from "../mesurement/measurementDAL";
import IMeasurement from "../mesurement/measurement.interface";
import IDigitalTwinSimulator from "./digitalTwinSimulator.interface";
import { add } from "winston";

export const getTopicsIdFromDigitalTwin = (digitalTwin: Partial<IDigitalTwin>): number[] => {
	const topicsId: number[] = [];
	let gltfData: any = digitalTwin.gltfData;
	if (typeof gltfData === "string") gltfData = JSON.parse(gltfData);
	if (Object.keys(gltfData).length && gltfData.nodes?.length !== 0) {
		const meshNodes: { name?: string; mesh?: number; extras: { topicId: number; }; }[] = [];
		gltfData.nodes.forEach((node: { name?: string; mesh?: number; extras: { topicId: number; }; }) => {
			if (node.mesh && node.extras) meshNodes.push(node);
		})

		meshNodes.forEach((node: { extras: { topicId: number; type: string; clipTopicIds: number[] }; }) => {
			if (node.extras?.type && node.extras?.type === "sensor") {
				const topicId = node.extras?.topicId;
				if (topicId && topicsId.findIndex(id => id === topicId) === -1) {
					topicsId.push(topicId)
				}
			}
			if (node.extras?.clipTopicIds && node.extras?.clipTopicIds.length !== 0) {
				node.extras?.clipTopicIds.forEach(topicId => {
					if (topicId && topicsId.findIndex(id => id === topicId) === -1) {
						topicsId.push(topicId)
					}
				})
			}
		})
	}

	if (digitalTwin.sensorSimulationTopicId) topicsId.push(digitalTwin.sensorSimulationTopicId);
	if (digitalTwin.assetStateTopicId) topicsId.push(digitalTwin.assetStateTopicId);
	if (digitalTwin.assetStateSimulationTopicId) topicsId.push(digitalTwin.assetStateSimulationTopicId);
	if (digitalTwin.femResultModalValuesTopicId) topicsId.push(digitalTwin.femResultModalValuesTopicId);
	if (digitalTwin.femResultModalValuesSimulationTopicId) topicsId.push(digitalTwin.femResultModalValuesSimulationTopicId)

	return topicsId;
}

export const getMqttTopicsDataFromDigitalTwinData = async (digitalTwin: IDigitalTwinGltfData): Promise<IMqttTopicData[]> => {
	const mqttTopicsData: IMqttTopicData[] = [];
	let gltfData: any = digitalTwin.gltfData;
	if (typeof gltfData === "string") gltfData = JSON.parse(gltfData);
	if (Object.keys(gltfData).length && gltfData.nodes?.length !== 0) {
		const meshNodes: { name?: string; mesh?: number; extras: { topicId: number; }; }[] = [];
		gltfData.nodes.forEach((node: { mesh: number; extras: { topicId: number; }; }) => {
			if (node.mesh && node.extras) meshNodes.push(node);
		})

		meshNodes.forEach((node: { extras: { topicId: number; type: string; clipTopicIds: number[] }; }) => {
			if (node.extras?.type && node.extras?.type === "sensor" && node.extras?.topicId) {
				const topicId = node.extras?.topicId;
				if (topicId && mqttTopicsData.findIndex(topicData => topicData.topicId === topicId) === -1) {
					const mqttTopicData: IMqttTopicData = {
						topicId,
						topicType: "dev2pdb",
						topicSubtype: "sensorTopic",
						mqttTopic: "",
						groupUid: null,
						sqlTopic: null,
						lastMeasurement: null
					}
					mqttTopicsData.push(mqttTopicData)
				}
			}
			if (node.extras?.clipTopicIds && node.extras?.clipTopicIds.length !== 0) {
				node.extras?.clipTopicIds.forEach(topicId => {
					if (topicId && mqttTopicsData.findIndex(topicData => topicData.topicId === topicId) === -1) {
						const mqttTopicData: IMqttTopicData = {
							topicId,
							topicType: "dev2pdb",
							topicSubtype: "sensorTopic",
							mqttTopic: "",
							groupUid: null,
							sqlTopic: null,
							lastMeasurement: null
						}
						mqttTopicsData.push(mqttTopicData)
					}
				})
			}
		})
	}

	if (digitalTwin.sensorSimulationTopicId) {
		const mqttTopicData: IMqttTopicData = {
			topicId: digitalTwin.sensorSimulationTopicId,
			topicType: "dts2dtm",
			topicSubtype: "sensorSimulationTopic",
			mqttTopic: "",
			groupUid: null,
			sqlTopic: null,
			lastMeasurement: null
		};
		mqttTopicsData.push(mqttTopicData);
	}

	if (digitalTwin.assetStateTopicId) {
		const mqttTopicData: IMqttTopicData = {
			topicId: digitalTwin.assetStateTopicId,
			topicType: "dtm2pdb",
			topicSubtype: "assetStateTopic",
			mqttTopic: "",
			groupUid: null,
			sqlTopic: null,
			lastMeasurement: null
		};
		mqttTopicsData.push(mqttTopicData);
	}

	if (digitalTwin.assetStateSimulationTopicId) {
		const mqttTopicData: IMqttTopicData = {
			topicId: digitalTwin.assetStateSimulationTopicId,
			topicType: "dtm2dts",
			topicSubtype: "assetStateSimulationTopic",
			mqttTopic: "",
			groupUid: null,
			sqlTopic: null,
			lastMeasurement: null
		};
		mqttTopicsData.push(mqttTopicData);
	}

	if (digitalTwin.femResultModalValuesTopicId) {
		const mqttTopicData: IMqttTopicData = {
			topicId: digitalTwin.femResultModalValuesTopicId,
			topicType: "dtm2pdb",
			topicSubtype: "femResultModalValuesTopic",
			mqttTopic: "",
			groupUid: null,
			sqlTopic: null,
			lastMeasurement: null
		};
		mqttTopicsData.push(mqttTopicData);
	}

	if (digitalTwin.femResultModalValuesSimulationTopicId) {
		const mqttTopicData: IMqttTopicData = {
			topicId: digitalTwin.femResultModalValuesSimulationTopicId,
			topicType: "dtm2dts",
			topicSubtype: "femResultModalValuesSimulationTopic",
			mqttTopic: "",
			groupUid: null,
			sqlTopic: null,
			lastMeasurement: null
		};
		mqttTopicsData.push(mqttTopicData);
	}

	if (mqttTopicsData.length) {
		const topicsId = mqttTopicsData.map(topicData => topicData.topicId);
		const markedTopicsId = await markInexistentTopics(topicsId);
		markedTopicsId.forEach((topicId, index) => {
			if (topicId < 0) {
				mqttTopicsData[index].mqttTopic = `Warning: Topic with id: ${mqttTopicsData[index].topicId} not exists any more`
			}
		});
		const topicsInfo = await getMqttTopicsInfoFromIdArray(markedTopicsId);
		topicsInfo.forEach(topicInfo => {
			const topicDataIndex = mqttTopicsData.findIndex(topicData => topicData.topicId === topicInfo.topicId);
			if (topicDataIndex !== -1) {
				mqttTopicsData[topicDataIndex].mqttTopic = generateMqttTopic(topicInfo);
				mqttTopicsData[topicDataIndex].groupUid = topicInfo.groupHash;
				mqttTopicsData[topicDataIndex].sqlTopic = generateSqlTopic(topicInfo);
			}
		});

		const mesurementsQueries: any[] = [];
		mqttTopicsData.forEach(mqttTopicData => {
			if (mqttTopicData.sqlTopic && (mqttTopicData.topicType === "dev2pdb" || mqttTopicData.topicType === "dtm2pdb")) {
				const query = getLastMeasurement(mqttTopicData.groupUid, mqttTopicData.sqlTopic);
				mesurementsQueries.push(query);
			}
		});
		const mesurements: IMeasurement[] = await Promise.all(mesurementsQueries).then(responses => responses);

		mesurements.forEach(mesurement => {
			if (mesurement !== undefined) {
				const topicDataIndex = mqttTopicsData.findIndex(topicData => topicData.sqlTopic === mesurement.topic);
				if (topicDataIndex !== -1) {
					mqttTopicsData[topicDataIndex].lastMeasurement = mesurement;
				}
			}
		})

		mqttTopicsData.sort((topicData1, topicData2) => {
			if (topicData1.topicId > topicData2.topicId) {
				return 1;
			}
			if (topicData1.topicId < topicData2.topicId) {
				return -1;
			}
			return 0;
		});
	}

	return mqttTopicsData;
}

const arrayContainedChecker = (arr: number[], target: number[]) => target.every(v => arr.includes(v));

export const checkIfLoggedUserManageTopicsAndDashboard = async (
	user: IUser,
	digitalTwinType: string,
	topicsId: number[],
	dashboardId: number
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
		const filteredDashboards = dashboardsManagedByUser.filter(dashboard => dashboard.id === dashboardId);
		if (filteredDashboards.length === 0) {
			message = "The indicated dashboard is not managed for the logged user or simply not exists";
		}
	} else if (digitalTwinType === "Gltf 3D model") {
		const topicsIdManagedByUser = topicsManagedByUser.map(topic => topic.id);
		const isTopicsManaged = arrayContainedChecker(topicsIdManagedByUser, topicsId);
		const isDashboardManaged = dashboardsManagedByUser.filter(dashboard => dashboard.id === dashboardId).length === 1;
		if (!isTopicsManaged || !isDashboardManaged) {
			message = "The indicated topics and/or dashboard are not managed for the logged user or simply not exist";
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

export const insertDigitalTwin = async (digitalTwinData: Partial<IDigitalTwinUpdate>): Promise<IDigitalTwinUpdate> => {
	const result = await pool.query(`INSERT INTO grafanadb.digital_twin (device_id,
					name, description, type, dashboard_id, gltfdata, gltf_file_name, gltf_file_last_modif_date_string,
					fem_simulation_data, femsimdata_file_name, femsimdata_file_last_modif_date_string,
					created, updated)
					VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
					RETURNING  id, device_id AS "deviceId", name, description,
					type, dashboard_id AS "dashboardId", gltf_file_name AS "gltfFileName",
					gltf_file_last_modif_date_string AS "gltfFileLastModifDateString",
					femsimdata_file_name AS "femSimDataFileName",
					femsimdata_file_last_modif_date_string AS "femSimDataFileLastModifDateString",
					created, updated`,
		[
			digitalTwinData.deviceId,
			digitalTwinData.name,
			digitalTwinData.description,
			digitalTwinData.type,
			digitalTwinData.dashboardId,
			digitalTwinData.gltfData,
			digitalTwinData.gltfFileName,
			digitalTwinData.gltfFileLastModifDateString,
			digitalTwinData.femSimulationData,
			digitalTwinData.femSimDataFileName,
			digitalTwinData.femSimDataFileLastModifDateString
		]);
	return result.rows[0];
};


export const updateDigitalTwinById = async (digitalTwinId: number, digitalTwinData: IDigitalTwin): Promise<void> => {
	const query = `UPDATE grafanadb.digital_twin SET name = $1, description = $2, type = $3,
					dashboard_id = $4, gltfdata = $5, gltf_file_name = $6, gltf_file_last_modif_date_string = $7,
					fem_simulation_data = $8, femsimdata_file_name = $9, femsimdata_file_last_modif_date_string = $10,
					digital_twin_simulation_format = $11, sensor_simulation_topic_id = $12, asset_state_topic_id = $13, asset_state_simulation_topic_id = $14, fem_result_modal_values_topic_id = $15,
					fem_result_modal_values_simulation_topic_id = $16,
					updated = NOW() WHERE grafanadb.digital_twin.id = $17;`;
	const result = await pool.query(query, [
		digitalTwinData.name,
		digitalTwinData.description,
		digitalTwinData.type,
		digitalTwinData.dashboardId,
		digitalTwinData.gltfData,
		digitalTwinData.gltfFileName,
		digitalTwinData.gltfFileLastModifDateString,
		digitalTwinData.femSimulationData,
		digitalTwinData.femSimDataFileName,
		digitalTwinData.femSimDataFileLastModifDateString,
		digitalTwinData.digitalTwinSimulationFormat,
		digitalTwinData.sensorSimulationTopicId,
		digitalTwinData.assetStateTopicId,
		digitalTwinData.assetStateSimulationTopicId,
		digitalTwinData.femResultModalValuesTopicId,
		digitalTwinData.femResultModalValuesSimulationTopicId,
		digitalTwinId
	]);
};

export const updateTopicsForDigitalTwinById = async (
	digitalTwinId: number,
	sensorSimulationTopicId: number,
	assetStateTopicId: number,
	assetStateSimulationTopicId: number,
	femResultModalValuesTopicId: number,
	femResultModalValuesSimulationTopicId: number
): Promise<void> => {
	const query = `UPDATE grafanadb.digital_twin SET sensor_simulation_topic_id = $1, asset_state_topic_id = $2,
					asset_state_simulation_topic_id = $3, fem_result_modal_values_topic_id = $4,
					fem_result_modal_values_simulation_topic_id = $5, updated = NOW()
					WHERE grafanadb.digital_twin.id = $6;`;
	const result = await pool.query(query, [
		sensorSimulationTopicId,
		assetStateTopicId,
		assetStateSimulationTopicId,
		femResultModalValuesTopicId,
		femResultModalValuesSimulationTopicId,
		digitalTwinId
	]);
};




export const deleteDigitalTwinById = async (digitalTwinId: number): Promise<void> => {
	await pool.query(`DELETE FROM grafanadb.digital_twin WHERE grafanadb.digital_twin.id = $1`, [digitalTwinId]);
};

export const createDigitalTwin = async (deviceId: number, digitalTwinInput: CreateDigitalTwinDto): Promise<IDigitalTwinUpdate | null> => {
	const digitalTwinUpdated: Partial<IDigitalTwinUpdate> = { ...digitalTwinInput, deviceId };
	const digitalTwin = await insertDigitalTwin(digitalTwinUpdated);
	if (digitalTwinUpdated.type === "Gltf 3D model") {
		const sensorSimulationTopicData =
		{
			topicType: "dts2dtm",
			topicName: `SST DT_${digitalTwin.id}`,
			description: `Sensor simulation topic for DT_${digitalTwin.id}`,
			payloadFormat: digitalTwinInput.digitalTwinSimulationFormat
		};
		const sensorSimulationTopic = await createTopic(deviceId, sensorSimulationTopicData);

		const assetStateTopicData =
		{
			topicType: "dtm2pdb",
			topicName: `AST DT_${digitalTwin.id}`,
			description: `Assets state topic for DT_${digitalTwin.id}`,
			payloadFormat: '{"assetPartsState": "number[]"}'
		};
		const assetStateTopic = await createTopic(deviceId, assetStateTopicData);

		const assetStateSimulationTopicData =
		{
			topicType: "dtm2dts",
			topicName: `ASST for DT_${digitalTwin.id}`,
			description: `Assets state simulation topic for DT_${digitalTwin.id}`,
			payloadFormat: '{"assetPartsState": "number[]"}'
		};
		const assetStateSimulationTopic = await createTopic(deviceId, assetStateSimulationTopicData);

		const femResultModalValuesTopicData =
		{
			topicType: "dtm2pdb",
			topicName: `FMRT DT_${digitalTwin.id}`,
			description: `Fem modal result topic for DT_${digitalTwin.id}`,
			payloadFormat: '{"femResultsModalValues": "number[][][]"}'
		};
		const femResultModalValuesTopic = await createTopic(deviceId, femResultModalValuesTopicData);

		const femResultModalValuesSimulationTopicData =
		{
			topicType: "dtm2dts",
			topicName: `FMRST DT_${digitalTwin.id}`,
			description: `Fem modal result simulation topic for DT_${digitalTwin.id}`,
			payloadFormat: '{"femResultsModalValues": "number[][]"}'
		};
		const femResultModalValuesSimulationTopic = await createTopic(deviceId, femResultModalValuesSimulationTopicData);

		await updateTopicsForDigitalTwinById(
			digitalTwin.id,
			sensorSimulationTopic.id,
			assetStateTopic.id,
			assetStateSimulationTopic.id,
			femResultModalValuesTopic.id,
			femResultModalValuesSimulationTopic.id
		)
	}
	return digitalTwin;
};

export const getDigitalTwinByProp = async (propName: string, propValue: (string | number)): Promise<IDigitalTwin> => {
	const response = await pool.query(`SELECT grafanadb.digital_twin.id, grafanadb.device.org_id AS "orgId",
									grafanadb.device.group_id AS "groupId", grafanadb.digital_twin.device_id AS "deviceId",
									grafanadb.digital_twin.name, grafanadb.digital_twin.description,
									grafanadb.digital_twin.type, grafanadb.digital_twin.dashboard_id AS "dashboardId",
									grafanadb.digital_twin.gltf_file_name AS "gltfFileName",
									grafanadb.digital_twin.gltf_file_last_modif_date_string AS "gltfFileLastModifDateString",
									grafanadb.digital_twin.femsimdata_file_name AS "femSimDataFileName",
									grafanadb.digital_twin.femsimdata_file_last_modif_date_string AS "femSimDataFileLastModifDateString",
									grafanadb.digital_twin.digital_twin_simulation_format AS "digitalTwinSimulationFormat",
									grafanadb.digital_twin.sensor_simulation_topic_id AS "sensorSimulationTopicId",
									grafanadb.digital_twin.asset_state_topic_id AS "assetStateTopicId",
									grafanadb.digital_twin.asset_state_simulation_topic_id AS "assetStateSimulationTopicId",
									grafanadb.digital_twin.fem_result_modal_values_topic_id AS "femResultModalValuesTopicId",
									grafanadb.digital_twin.fem_result_modal_values_simulation_topic_id AS "femResultModalValuesSimulationTopicId",
									grafanadb.digital_twin.created, grafanadb.digital_twin.updated
									FROM grafanadb.digital_twin
									INNER JOIN grafanadb.device ON grafanadb.digital_twin.device_id = grafanadb.device.id
									WHERE grafanadb.digital_twin.${propName} = $1`, [propValue]);
	return response.rows[0];
}

export const getDigitalTwinGltfDataById = async (digitalTwinId: number): Promise<IDigitalTwinGltfData> => {
	const response = await pool.query(`SELECT grafanadb.digital_twin.id,
									grafanadb.digital_twin.gltfdata AS "gltfData",
									grafanadb.digital_twin.fem_simulation_data AS "femSimulationData",
									grafanadb.digital_twin.digital_twin_simulation_format AS "digitalTwinSimulationFormat",
									grafanadb.digital_twin.sensor_simulation_topic_id AS "sensorSimulationTopicId",
									grafanadb.digital_twin.asset_state_topic_id AS "assetStateTopicId",
									grafanadb.digital_twin.asset_state_simulation_topic_id AS "assetStateSimulationTopicId",
									grafanadb.digital_twin.fem_result_modal_values_topic_id AS "femResultModalValuesTopicId",
									grafanadb.digital_twin.fem_result_modal_values_simulation_topic_id AS "femResultModalValuesSimulationTopicId"
									FROM grafanadb.digital_twin
									WHERE grafanadb.digital_twin.id = $1`, [digitalTwinId]);
	return response.rows[0];
}

export const getAllDigitalTwins = async (): Promise<IDigitalTwin[]> => {
	const response = await pool.query(`SELECT grafanadb.digital_twin.id, grafanadb.device.org_id AS "orgId",
									grafanadb.device.group_id AS "groupId", grafanadb.digital_twin.device_id AS "deviceId",
									grafanadb.digital_twin.name, grafanadb.digital_twin.description,
									grafanadb.digital_twin.type, grafanadb.digital_twin.dashboard_id AS "dashboardId",
									grafanadb.digital_twin.gltf_file_name AS "gltfFileName",
									grafanadb.digital_twin.gltf_file_last_modif_date_string AS "gltfFileLastModifDateString",
									grafanadb.digital_twin.femsimdata_file_name AS "femSimDataFileName",
									grafanadb.digital_twin.femsimdata_file_last_modif_date_string AS "femSimDataFileLastModifDateString",
									grafanadb.digital_twin.digital_twin_simulation_format AS "digitalTwinSimulationFormat",
									grafanadb.digital_twin.sensor_simulation_topic_id AS "sensorSimulationTopicId",
									grafanadb.digital_twin.asset_state_topic_id AS "assetStateTopicId",
									grafanadb.digital_twin.asset_state_simulation_topic_id AS "assetStateSimulationTopicId",
									grafanadb.digital_twin.fem_result_modal_values_topic_id AS "femResultModalValuesTopicId",
									grafanadb.digital_twin.fem_result_modal_values_simulation_topic_id AS "femResultModalValuesSimulationTopicId",
									grafanadb.digital_twin.created, grafanadb.digital_twin.updated
									FROM grafanadb.digital_twin
									INNER JOIN grafanadb.device ON grafanadb.digital_twin.device_id = grafanadb.device.id
									ORDER BY grafanadb.digital_twin.id ASC,
											grafanadb.device.org_id ASC,
											grafanadb.device.group_id ASC;`);
	return response.rows;
}

export const getAllDigitalTwinSimulators = async (): Promise<IDigitalTwinSimulator[]> => {
	const response = await pool.query(`SELECT grafanadb.digital_twin.id, grafanadb.device.org_id AS "orgId",
									grafanadb.device.group_id AS "groupId", grafanadb.digital_twin.device_id AS "deviceId",
									grafanadb.digital_twin.name, grafanadb.digital_twin.description,
									grafanadb.digital_twin.digital_twin_simulation_format AS "digitalTwinSimulationFormat",
									grafanadb.digital_twin.sensor_simulation_topic_id AS "sensorSimulationTopicId"
									FROM grafanadb.digital_twin
									INNER JOIN grafanadb.device ON grafanadb.digital_twin.device_id = grafanadb.device.id
									WHERE  grafanadb.digital_twin.type = $1 AND
									grafanadb.digital_twin.digital_twin_simulation_format != '{}'::jsonb
									ORDER BY grafanadb.device.org_id ASC,
										grafanadb.device.group_id ASC,
										grafanadb.digital_twin.device_id ASC,
										grafanadb.digital_twin.id ASC;`, ["Gltf 3D model"]);
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
									grafanadb.digital_twin.gltf_file_name AS "gltfFileName",
									grafanadb.digital_twin.gltf_file_last_modif_date_string AS "gltfFileLastModifDateString",
									grafanadb.digital_twin.femsimdata_file_name AS "femSimDataFileName",
									grafanadb.digital_twin.femsimdata_file_last_modif_date_string AS "femSimDataFileLastModifDateString",
									grafanadb.digital_twin.digital_twin_simulation_format AS "digitalTwinSimulationFormat",
									grafanadb.digital_twin.sensor_simulation_topic_id AS "sensorSimulationTopicId",
									grafanadb.digital_twin.asset_state_topic_id AS "assetStateTopicId",
									grafanadb.digital_twin.asset_state_simulation_topic_id AS "assetStateSimulationTopicId",
									grafanadb.digital_twin.fem_result_modal_values_topic_id AS "femResultModalValuesTopicId",
									grafanadb.digital_twin.fem_result_modal_values_simulation_topic_id AS "femResultModalValuesSimulationTopicId",
									grafanadb.digital_twin.created, grafanadb.digital_twin.updated
									FROM grafanadb.digital_twin
									INNER JOIN grafanadb.device ON grafanadb.digital_twin.device_id = grafanadb.device.id
									WHERE grafanadb.device.group_id = $1
									ORDER BY grafanadb.digital_twin.id ASC,
										grafanadb.device.org_id ASC,
										grafanadb.device.group_id ASC;`, [groupId]);
	return response.rows;
};

export const getDigitalTwinsByGroupsIdArray = async (groupsIdArray: number[]): Promise<IDigitalTwin[]> => {
	const response = await pool.query(`SELECT grafanadb.digital_twin.id, grafanadb.device.org_id AS "orgId",
									grafanadb.device.group_id AS "groupId", grafanadb.digital_twin.device_id AS "deviceId",
									grafanadb.digital_twin.name, grafanadb.digital_twin.description,
									grafanadb.digital_twin.type, grafanadb.digital_twin.dashboard_id AS "dashboardId",
									grafanadb.digital_twin.gltf_file_name AS "gltfFileName",
									grafanadb.digital_twin.gltf_file_last_modif_date_string AS "gltfFileLastModifDateString",
									grafanadb.digital_twin.femsimdata_file_name AS "femSimDataFileName",
									grafanadb.digital_twin.femsimdata_file_last_modif_date_string AS "femSimDataFileLastModifDateString",
									grafanadb.digital_twin.digital_twin_simulation_format AS "digitalTwinSimulationFormat",
									grafanadb.digital_twin.sensor_simulation_topic_id AS "sensorSimulationTopicId",
									grafanadb.digital_twin.asset_state_topic_id AS "assetStateTopicId",
									grafanadb.digital_twin.asset_state_simulation_topic_id AS "assetStateSimulationTopicId",
									grafanadb.digital_twin.fem_result_modal_values_topic_id AS "femResultModalValuesTopicId",
									grafanadb.digital_twin.fem_result_modal_values_simulation_topic_id AS "femResultModalValuesSimulationTopicId",
									grafanadb.digital_twin.created, grafanadb.digital_twin.updated
									FROM grafanadb.digital_twin
									INNER JOIN grafanadb.device ON grafanadb.digital_twin.device_id = grafanadb.device.id
									WHERE grafanadb.device.group_id = ANY($1::bigint[])
									ORDER BY grafanadb.digital_twin.id ASC,
										grafanadb.device.org_id ASC,
										grafanadb.device.group_id ASC;`, [groupsIdArray]);
	return response.rows;
};

export const getDigitalTwinSimulatorsByGroupsIdArray = async (groupsIdArray: number[]): Promise<IDigitalTwinSimulator[]> => {
	const response = await pool.query(`SELECT grafanadb.digital_twin.id, grafanadb.device.org_id AS "orgId",
									grafanadb.device.group_id AS "groupId", grafanadb.digital_twin.device_id AS "deviceId",
									grafanadb.digital_twin.name, grafanadb.digital_twin.description,
									grafanadb.digital_twin.digital_twin_simulation_format AS "digitalTwinSimulationFormat",
									grafanadb.digital_twin.sensor_simulation_topic_id AS "sensorSimulationTopicId"
									FROM grafanadb.digital_twin
									FROM grafanadb.digital_twin
									INNER JOIN grafanadb.device ON grafanadb.digital_twin.device_id = grafanadb.device.id
									WHERE grafanadb.device.group_id = ANY($1::bigint[]) AND
									grafanadb.digital_twin.type = $2 AND
									grafanadb.digital_twin.digital_twin_simulation_format != '{}'::jsonb
									ORDER BY grafanadb.device.org_id ASC,
										grafanadb.device.group_id ASC,
										grafanadb.digital_twin.device_id ASC,
										grafanadb.digital_twin.id ASC;`, [groupsIdArray, "Gltf 3D model"]);
	return response.rows;
}

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
									grafanadb.digital_twin.gltf_file_name AS "gltfFileName",
									grafanadb.digital_twin.gltf_file_last_modif_date_string AS "gltfFileLastModifDateString",
									grafanadb.digital_twin.femsimdata_file_name AS "femSimDataFileName",
									grafanadb.digital_twin.femsimdata_file_last_modif_date_string AS "femSimDataFileLastModifDateString",
									grafanadb.digital_twin.digital_twin_simulation_format AS "digitalTwinSimulationFormat",
									grafanadb.digital_twin.sensor_simulation_topic_id AS "sensorSimulationTopicId",
									grafanadb.digital_twin.asset_state_topic_id AS "assetStateTopicId",
									grafanadb.digital_twin.asset_state_simulation_topic_id AS "assetStateSimulationTopicId",
									grafanadb.digital_twin.fem_result_modal_values_topic_id AS "femResultModalValuesTopicId",
									grafanadb.digital_twin.fem_result_modal_values_simulation_topic_id AS "femResultModalValuesSimulationTopicId",
									grafanadb.digital_twin.created, grafanadb.digital_twin.updated
									FROM grafanadb.digital_twin
									INNER JOIN grafanadb.device ON grafanadb.digital_twin.device_id = grafanadb.device.id
									WHERE grafanadb.device.org_id = $1
									ORDER BY grafanadb.digital_twin.id ASC,
										grafanadb.device.org_id ASC,
										grafanadb.device.group_id ASC`, [orgId]);
	return response.rows;
};

export const addMqttTopicsData = async (digitalTwin: IDigitalTwinGltfData): Promise<IDigitalTwinGltfData> => {
	const topicsData = await getMqttTopicsDataFromDigitalTwinData(digitalTwin);
	const mqttTopicsData = topicsData.map(topicData => {
		return {
			topicId: topicData.topicId,
			mqttTopic: topicData.mqttTopic,
			topicType: topicData.topicType,
			topicSubtype: topicData.topicSubtype,
			lastMeasurement: topicData.lastMeasurement
		}
	});
	const digitalTwinExtended = {
		...digitalTwin,
		mqttTopicsData
	};
	return digitalTwinExtended;
}

export const addMqttTopicsToDigitalTwinSimulators = async (digitalTwinSimulators: IDigitalTwinSimulator[]): Promise<IDigitalTwinSimulator[]> => {
	const topicsId = digitalTwinSimulators.map(digitalTwinSimulator => digitalTwinSimulator.sensorSimulationTopicId);
	const markedTopicsId = await markInexistentTopics(topicsId);
	const topicsInfo = await getMqttTopicsInfoFromIdArray(markedTopicsId);
	const digitalTwinSimulatorsExtended: IDigitalTwinSimulator[] = [];
	topicsInfo.forEach(topicInfo => {
		const digitalTwinSimulatorIndex = digitalTwinSimulators.findIndex(elem => elem.sensorSimulationTopicId === topicInfo.topicId);
		if (digitalTwinSimulatorIndex !== -1) {
			const dtsExtended = digitalTwinSimulators[digitalTwinSimulatorIndex];
			dtsExtended.mqttTopic = generateMqttTopic(topicInfo);
			digitalTwinSimulatorsExtended.push(dtsExtended);
		}
	});

	return digitalTwinSimulatorsExtended;
}

export const addDashboardUrls = async (digitalTwins: IDigitalTwin[]): Promise<IDigitalTwin[]> => {
	const dashboardIdArray: number[] = [];
	digitalTwins.forEach(digitalTwin => {
		if (digitalTwin.dashboardId && dashboardIdArray.findIndex(id => id === digitalTwin.dashboardId) === -1) {
			dashboardIdArray.push(digitalTwin.dashboardId)
		}
	})

	const markedDashboards = await markInexistentDashboards(dashboardIdArray);
	const dashboardsInfo = await getDashboardsInfoFromIdArray(markedDashboards);
	const digitalTwinsExtended = [...digitalTwins];
	digitalTwinsExtended.forEach(digitalTwin => {
		const dashboardInformation = dashboardsInfo.filter(dashboardInfo => dashboardInfo.dashboardId === digitalTwin.dashboardId)[0];
		digitalTwin.dashboardUrl = generateDashboardUrl(dashboardInformation)
	});
	return digitalTwinsExtended;
}

const generateMqttTopic = (mqttTopicInfo: IMqttTopicInfo): string => {
	const mqttTopic = `${mqttTopicInfo.topicType}/Group_${mqttTopicInfo.groupHash}/Device_${mqttTopicInfo.deviceHash}/Topic_${mqttTopicInfo.topicHash}`;
	return mqttTopic;
}

const generateSqlTopic = (mqttTopicInfo: IMqttTopicInfo): string => {
	const sqlTopic = `Device_${mqttTopicInfo.deviceHash}/Topic_${mqttTopicInfo.topicHash}`;
	return sqlTopic;
}

const generateDashboardUrl = (dashboardInfo: IDashboardInfo): string => {
	const domainName = getDomainUrl();
	let dashboardUrl: string;
	if (dashboardInfo.slug === "Inexistent") {
		dashboardUrl = `Warning: Dashboard with id: ${dashboardInfo.dashboardId} not exists any more`;
	} else {
		dashboardUrl = `${domainName}/grafana/d/${dashboardInfo.uid}/${dashboardInfo.slug}`;
	}
	return dashboardUrl;
}



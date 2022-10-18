import { nanoid } from "nanoid";
import pool from "../../config/dbconfig";
import IGroup from "../group/interfaces/Group.interface";
import CreateDigitalTwinDto from "./digitalTwin.dto";
import IDigitalTwin from "./digitalTwin.interface";
import IDigitalTwinState from "./digitalTwinState.interface";
import {
	getDashboardsInfoFromIdArray,
	markInexistentDashboards
} from "../dashboard/dashboardDAL";
import {
	createTopic,
	deleteTopicByIdsArray,
	getMqttTopicsInfoFromIdArray,
	getSensorTopicsOfDTByDigitalTwinId,
	markInexistentTopics
} from "../topic/topicDAL";
import IMqttTopicInfo from "../topic/mqttTopicInfo.interface";
import getDomainUrl from "../../utils/helpers/getDomainUrl";
import IDashboardInfo from "../dashboard/dashboardInfo.interfase";
import IDigitalTwinGltfData, { IMqttTopicData } from "./digitalTwinGltfData.interface";
import { getLastMeasurement } from "../mesurement/measurementDAL";
import IMeasurement from "../mesurement/measurement.interface";
import IDigitalTwinSimulator from "./digitalTwinSimulator.interface";
import IDigitalTwinTopic from "./digitalTwinTopic.interface";
import IDevice from "../device/device.interface";
import { createDashboard, deleteDashboard } from "../group/dashboardDAL";
import IMqttDigitalTwinTopicInfo from "./mqttDigitalTwinTopicInfo.interface";
import ITopic from "../topic/topic.interface";

export const getTopicSensorTypesFromDigitalTwin = (digitalTwin: Partial<IDigitalTwin>): string[] => {
	const topicTypes: string[] = [];
	if (digitalTwin.type === "Gltf 3D model") {
		let gltfData: any = digitalTwin.gltfData;
		if (typeof gltfData === "string") gltfData = JSON.parse(gltfData);
		if (Object.keys(gltfData).length && gltfData.nodes?.length !== 0) {
			const meshNodes: { name?: string; mesh?: number; extras: { topicType: string; }; }[] = [];
			gltfData.nodes.forEach((node: { name?: string; mesh?: number; extras: { topicType: string; }; }) => {
				if (node.mesh !== undefined && node.extras !== undefined) meshNodes.push(node);
			})

			meshNodes.forEach((node: { extras: { topicType: string; type: string; clipTopicTypes: string[] }; }) => {
				if (node.extras?.type !== undefined && node.extras?.type === "sensor") {
					const topicType = node.extras?.topicType;
					if (topicType && topicTypes.findIndex(type => type === topicType) === -1) {
						topicTypes.push(topicType)
					}
				}
				if (node.extras?.clipTopicTypes !== undefined && node.extras?.clipTopicTypes.length !== 0) {
					node.extras?.clipTopicTypes.forEach(topicType => {
						if (topicType && topicTypes.findIndex(type => type === topicType) === -1) {
							topicTypes.push(topicType);
						}
					})
				}
			})
		}

	} else if (digitalTwin.type === "Grafana dashboard") {
		topicTypes.push("dev2pdb_1");
	}

	return topicTypes;
}

const generateSensorSimulationTopicPayload = (digitalTwinSimulationFormat: string): string => {
	const digitalTwinSimulationFormatObj = JSON.parse(digitalTwinSimulationFormat);
	const keys = Object.keys(digitalTwinSimulationFormatObj);
	const payloadObj: Record<string, { type: string, units: string }> = {};
	keys.forEach(key => {
		payloadObj[key] = {} as any;
		payloadObj[key].type = "number";
		payloadObj[key].units = digitalTwinSimulationFormatObj[key].units;
	});
	const payload = JSON.stringify(payloadObj);
	return payload;
}

export const verifyAndCorrectDigitalTwinTopics = async (digitalTwinUpdate: Partial<IDigitalTwin>, device: IDevice): Promise<Partial<IDigitalTwin>> => {
	const topicTypes: string[] = [];
	const topicSensorTypes = getTopicSensorTypesFromDigitalTwin(digitalTwinUpdate);
	topicTypes.push(...topicSensorTypes);
	if (digitalTwinUpdate.type === "Gltf 3D model") {
		topicTypes.push("dev_sim_2dtm", "dtm_as2pdb", "dtm_sim_as2dts", "dtm_fmv2pdb", "dtm_sim_fmv2dts");
	}
	const existentDigitalTwinTopicsList = await getDTTopicsByDigitalTwinId(digitalTwinUpdate.id);
	const topicTypesToAdd: string[] = [];
	const topicIdsToRemove: number[] = [];
	topicTypes.forEach(topicType => {
		const existentTopic = existentDigitalTwinTopicsList.filter(topic => topic.topicType === topicType)[0];
		if (!existentTopic) topicTypesToAdd.push(topicType);
	});

	existentDigitalTwinTopicsList.forEach(topic => {
		const necessaryTopicTypeIndex = topicTypes.indexOf(topic.topicType);
		if (necessaryTopicTypeIndex === -1) topicIdsToRemove.push(topic.topicId);
	})

	if (topicIdsToRemove.length !== 0) {
		await deleteTopicByIdsArray(topicIdsToRemove)
	}

	if (topicTypesToAdd.length !== 0) {
		const digitalTwinUid = digitalTwinUpdate.digitalTwinUid;
		const deviceId = digitalTwinUpdate.deviceId;
		const topicSensorTypesToAdd = topicTypesToAdd.filter(topicType => topicType.slice(0, 7) === "dev2pdb");
		if (topicSensorTypesToAdd.length !== 0) {
			const topicSensorQueries: any[] = [];
			for (let i = 1; i <= topicSensorTypesToAdd.length; i++) {
				const sensorTopicData =
				{
					topicType: "dev2pdb",
					topicName: `${digitalTwinUid}_${topicSensorTypesToAdd[i]}`,
					description: `Device to platform db for ${digitalTwinUid}`,
					payloadFormat: '{"parameter": "number", "units": "m"}',
					mqttAccessControl: "Pub & Sub"
				};
				const topicSensorQuery = createTopic(deviceId, sensorTopicData);
				topicSensorQueries.push(topicSensorQuery)
			}
			const topicSensors = await Promise.all(topicSensorQueries);

			const digitalTwinTopicSensorQueries: any[] = [];
			for (let i = 0; i < topicSensorTypesToAdd.length; i++) {
				const topicType = topicSensorTypesToAdd[i];
				const digitalTwinTopicSensorQuery = createDigitalTwinTopic(digitalTwinUpdate.id, topicSensors[i].id, topicType)
				digitalTwinTopicSensorQueries.push(digitalTwinTopicSensorQuery);
			}
			await Promise.all(digitalTwinTopicSensorQueries);
		}


		if (topicTypesToAdd.indexOf("dev_sim_2dtm") !== -1) {
			const sensorSimulationTopicData =
			{
				topicType: "dev_sim_2dtm",
				topicName: `${digitalTwinUid}_dev_sim_2dtm`,
				description: `Simulated device to DTM for ${digitalTwinUid}`,
				payloadFormat: generateSensorSimulationTopicPayload(digitalTwinUpdate.digitalTwinSimulationFormat),
				mqttAccessControl: "Pub & Sub"
			};
			const sensorSimulationTopic = await createTopic(deviceId, sensorSimulationTopicData);
			await createDigitalTwinTopic(digitalTwinUpdate.id, sensorSimulationTopic.id, "dev_sim_2dtm");
		}

		if (topicTypesToAdd.indexOf("dtm_as2pdb") !== -1) {
			const assetStateTopicData =
			{
				topicType: "dtm_as2pdb",
				topicName: `${digitalTwinUid}_dtm_as2pdb`,
				description: `DTM assets state to pdb for ${digitalTwinUid}`,
				payloadFormat: '{"assetPartsState": "number[]"}',
				mqttAccessControl: "Pub & Sub"
			};
			const assetStateTopic = await createTopic(deviceId, assetStateTopicData);
			await createDigitalTwinTopic(digitalTwinUpdate.id, assetStateTopic.id, "dtm_as2pdb");
		}

		if (topicTypesToAdd.indexOf("dtm_sim_as2dts") !== -1) {
			const assetStateSimulationTopicData =
			{
				topicType: "dtm_sim_as2dts",
				topicName: `${digitalTwinUid}_dtm_sim_as2dts`,
				description: `DTM sim assets state to DTS for ${digitalTwinUid}`,
				payloadFormat: '{"assetPartsState": "number[]"}',
				mqttAccessControl: "Pub & Sub"
			};
			const assetStateSimulationTopic = await createTopic(deviceId, assetStateSimulationTopicData);
			await createDigitalTwinTopic(digitalTwinUpdate.id, assetStateSimulationTopic.id, "dtm_sim_as2dts");
		}

		if (topicTypesToAdd.indexOf("dtm_fmv2pdb") !== -1) {
			const femResultModalValuesTopicData =
			{
				topicType: "dtm_fmv2pdb",
				topicName: `${digitalTwinUid}_dtm_fmv2pdb`,
				description: `DTM fem modal value to pdb for ${digitalTwinUid}`,
				payloadFormat: '{"femResultsModalValues": "number[][][]"}',
				mqttAccessControl: "Pub & Sub"
			};
			const femResultModalValuesTopic = await createTopic(deviceId, femResultModalValuesTopicData);
			await createDigitalTwinTopic(digitalTwinUpdate.id, femResultModalValuesTopic.id, "dtm_fmv2pdb");
		}

		if (topicTypesToAdd.indexOf("dtm_sim_fmv2dts") !== -1) {
			const femResultModalValuesSimulationTopicData =
			{
				topicType: "dtm_sim_fmv2dts",
				topicName: `${digitalTwinUid}_dtm_sim_fmv2dts`,
				description: `DTM sim fem modal value to DTS for ${digitalTwinUid}`,
				payloadFormat: '{"femResultsModalValues": "number[][]"}',
				mqttAccessControl: "Pub & Sub"
			};
			const femResultModalValuesSimulationTopic = await createTopic(deviceId, femResultModalValuesSimulationTopicData);
			await createDigitalTwinTopic(digitalTwinUpdate.id, femResultModalValuesSimulationTopic.id, "dtm_sim_fmv2dts");
		}
	}

	let digitalTwinUpdated: Partial<IDigitalTwin> = { ...digitalTwinUpdate, deviceId: device.id, dashboardId: digitalTwinUpdate.dashboardId };
	const sensorTopics = await getSensorTopicsOfDTByDigitalTwinId(digitalTwinUpdated.id);
	if (digitalTwinUpdated.type === "Gltf 3D model") {
		digitalTwinUpdated = updatedTopicSensorIdsFromDigitalTwinGltfData(digitalTwinUpdated, sensorTopics);
	}
	return digitalTwinUpdated;
}

const findTopicSensorId = (topicName: string, topicSensors: Partial<ITopic>[]) => {
	let sensorTopicId = -1;
	for (const topicSensor of topicSensors) {
		const topicSensorIndex = parseInt(topicSensor.topicName.split("_").slice(-1)[0], 10);
		if (topicName === `dev2pdb_${topicSensorIndex}`) {
			sensorTopicId = topicSensor.id;
		}
	}
	return sensorTopicId;
}

export const updatedTopicSensorIdsFromDigitalTwinGltfData = (
	digitalTwin: Partial<IDigitalTwin>,
	topicSensors: ITopic[]
): Partial<IDigitalTwin> => {
	const digitalTwinUpdated = { ...digitalTwin };

	let gltfData: any = digitalTwinUpdated.gltfData;
	if (typeof gltfData === "string") gltfData = JSON.parse(gltfData);
	if (Object.keys(gltfData).length && gltfData.nodes?.length !== 0) {
		gltfData.nodes.forEach(
			(
				node: {
					name?: string; mesh?: number;
					extras: { topicType: string; topicId: number; type: string; clipTopicTypes: string[]; clipTopicIds: number[]; };
				}
			) => {
				if (node.mesh !== undefined && node.extras !== undefined) {
					if (node.extras.type && node.extras.type === "sensor") {
						const topicType = node.extras?.topicType;
						if (topicType) {
							const topicSensorId = findTopicSensorId(topicType, topicSensors);
							node.extras.topicId = topicSensorId;
						}
					}
					if (node.extras.clipTopicTypes && node.extras.clipTopicTypes.length !== 0) {
						node.extras.clipTopicIds = [];
						node.extras?.clipTopicTypes.forEach(topicType => {
							if (topicType) {
								const topicSensorId = findTopicSensorId(topicType, topicSensors);
								node.extras.clipTopicIds.push(topicSensorId);
							}
						})
					}
				}

			})
	}

	digitalTwinUpdated.gltfData = gltfData;
	return digitalTwinUpdated;
}

export const getMqttTopicsDataFromDigitalTwinData = async (digitalTwin: IDigitalTwinGltfData): Promise<IMqttTopicData[]> => {
	const mqttTopicsData: IMqttTopicData[] = [];
	const digitalTwinTopicsList = await getDTTopicsByDigitalTwinId(digitalTwin.id);
	if (digitalTwinTopicsList.length !== 0) {
		for (const digitalTwinTopic of digitalTwinTopicsList) {
			const mqttTopicData: IMqttTopicData = {
				topicId: digitalTwinTopic.topicId,
				topicType: digitalTwinTopic.topicType,
				mqttTopic: "",
				groupUid: null,
				sqlTopic: null,
				lastMeasurement: null
			};
			mqttTopicsData.push(mqttTopicData);
		}
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
			if (mqttTopicData.sqlTopic &&
				(mqttTopicData.topicType.slice(0, 7) === "dev2pdb" ||
					mqttTopicData.topicType === "dtm_as2pdb" ||
					mqttTopicData.topicType === "dtm_fmv2pdb")
			) {
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

export const demoDigitalTwinDescription = (group: IGroup, dashboardType: string): string => {
	const digitalTwinDescription = `${dashboardType} dashboard for ${group.acronym.replace(/ /g, "_")} group`;
	return digitalTwinDescription;
}

export const generateDigitalTwinUid = (): string => {
	const digitalTwinUid = `DT_${nanoid(20).replace(/-/g, "x").replace(/_/g, "X")}`
	return digitalTwinUid;
}

export const insertDigitalTwin = async (digitalTwinData: Partial<IDigitalTwin>): Promise<IDigitalTwin> => {
	const result = await pool.query(`INSERT INTO grafanadb.digital_twin (device_id,
					digital_twin_uid, description, type, dashboard_id, gltfdata, gltf_file_name, gltf_file_last_modif_date_string,
					fem_simulation_data, femsimdata_file_name, femsimdata_file_last_modif_date_string, digital_twin_simulation_format,
					created, updated)
					VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())
					RETURNING  id, device_id AS "deviceId", digital_twin_uid AS "digitalTwinUid", description,
					type, dashboard_id AS "dashboardId", gltf_file_name AS "gltfFileName",
					gltf_file_last_modif_date_string AS "gltfFileLastModifDateString",
					femsimdata_file_name AS "femSimDataFileName",
					femsimdata_file_last_modif_date_string AS "femSimDataFileLastModifDateString",
					digital_twin_simulation_format AS "digitalTwinSimulationFormat",
					created, updated`,
		[
			digitalTwinData.deviceId,
			digitalTwinData.digitalTwinUid,
			digitalTwinData.description,
			digitalTwinData.type,
			digitalTwinData.dashboardId,
			digitalTwinData.gltfData,
			digitalTwinData.gltfFileName,
			digitalTwinData.gltfFileLastModifDateString,
			digitalTwinData.femSimulationData,
			digitalTwinData.femSimDataFileName,
			digitalTwinData.femSimDataFileLastModifDateString,
			digitalTwinData.digitalTwinSimulationFormat
		]);
	return result.rows[0];
};

export const createDigitalTwinTopic = async (digitalTwinId: number, topicId: number, topicType: string): Promise<IDigitalTwinTopic> => {
	const result = await pool.query(`INSERT INTO grafanadb.digital_twin_topic (digital_twin_id, topic_id, topic_type, created, updated)
		VALUES ($1, $2, $3, NOW(), NOW())
		RETURNING  digital_twin_id AS "digitalTwinId", topic_id AS "topicId", topic_type AS "topicType", created, updated`,
		[digitalTwinId, topicId, topicType]);
	return result.rows[0];
};

export const getDTTopicsByDigitalTwinId = async (digitalTwinId: number): Promise<IDigitalTwinTopic[]> => {
	const response = await pool.query(`SELECT grafanadb.digital_twin_topic.digital_twin_id AS "digitalTwinId",
	                                grafanadb.digital_twin_topic.topic_id AS "topicId",
									grafanadb.digital_twin_topic.topic_type AS "topicType",
									grafanadb.digital_twin_topic.created,
									grafanadb.digital_twin_topic.updated
									FROM grafanadb.digital_twin_topic
									WHERE grafanadb.digital_twin_topic.digital_twin_id = $1
									ORDER BY grafanadb.digital_twin_topic.digital_twin_id ASC,
											grafanadb.digital_twin_topic.topic_id ASC;`, [digitalTwinId]);
	return response.rows;
};

export const getDTSensorTopicsByDigitalTwinId = async (digitalTwinId: number): Promise<IDigitalTwinTopic[]> => {
	const response = await pool.query(`SELECT grafanadb.digital_twin_topic.digital_twin_id AS "digitalTwinId",
	                                grafanadb.digital_twin_topic.topic_id AS "topicId",
									grafanadb.digital_twin_topic.topic_type AS "topicType",
									grafanadb.digital_twin_topic.created,
									grafanadb.digital_twin_topic.updated
									FROM grafanadb.digital_twin_topic
									WHERE grafanadb.digital_twin_topic.digital_twin_id = $1
									ORDER BY grafanadb.digital_twin_topic.digital_twin_id ASC,
											grafanadb.digital_twin_topic.topic_id ASC;`, [digitalTwinId]);
	return response.rows;
};


export const getDigitalTwinMqttTopicsInfoFromByDTIdsArray = async (digitalTwinIdsArray: number[]): Promise<IMqttDigitalTwinTopicInfo[]> => {
	const response = await pool.query(`SELECT grafanadb.digital_twin.digital_twin_uid AS "digitalTwinUid",
	                                grafanadb.topic.id AS "topicId", grafanadb.digital_twin_topic.topic_type AS "topicType",
									grafanadb.group.group_uid AS "groupHash", grafanadb.device.device_uid AS "deviceHash",
									grafanadb.topic.topic_uid AS "topicHash"
									FROM grafanadb.topic
									INNER JOIN grafanadb.device ON grafanadb.topic.device_id = grafanadb.device.id
									INNER JOIN grafanadb.group ON grafanadb.device.group_id = grafanadb.group.id
									INNER JOIN grafanadb.digital_twin_topic ON grafanadb.digital_twin_topic.topic_id = grafanadb.topic.id
									INNER JOIN grafanadb.digital_twin ON
										grafanadb.digital_twin.id = grafanadb.digital_twin_topic.digital_twin_id
									WHERE grafanadb.digital_twin_topic.digital_twin_id = ANY($1::bigint[])
									ORDER BY grafanadb.topic.id ASC;`, [digitalTwinIdsArray]);

	return response.rows;
}

export const generateDigitalTwinMqttTopics = (digitalTwinMqttTopicsInfo: IMqttDigitalTwinTopicInfo[]): Record<string, Record<string, string>> => {
	const digitalTwinMqttTopics: Record<string, Record<string, string>> = {};
	for (const topicInfo of digitalTwinMqttTopicsInfo) {
		const digitalTwinUid = topicInfo.digitalTwinUid;
		if (digitalTwinMqttTopics[digitalTwinUid] === undefined) {
			digitalTwinMqttTopics[digitalTwinUid] = {};
		}
		const topicType = topicInfo.topicType;
		digitalTwinMqttTopics[digitalTwinUid][topicType] = generateMqttTopic(topicInfo);
	}

	const digitalTwinMqttTopicsSorted: Record<string, Record<string, string>> = {};
	for (const digitalTwinUid of Object.keys(digitalTwinMqttTopics)) {
		const sorted = Object.keys(digitalTwinMqttTopics[digitalTwinUid])
			.sort()
			.reduce((accumulator: Record<string, string>, key: string) => {
				accumulator[key] = digitalTwinMqttTopics[digitalTwinUid][key];
				return accumulator;
			}, {});
		digitalTwinMqttTopicsSorted[digitalTwinUid] = sorted;
	}
	return digitalTwinMqttTopicsSorted;
}


export const updateDigitalTwinById = async (digitalTwinId: number, digitalTwinData: Partial<IDigitalTwin>): Promise<void> => {
	const query = `UPDATE grafanadb.digital_twin SET digital_twin_uid = $1, description = $2, type = $3,
					gltfdata = $4, gltf_file_name = $5, gltf_file_last_modif_date_string = $6,
					fem_simulation_data = $7, femsimdata_file_name = $8, femsimdata_file_last_modif_date_string = $9,
					digital_twin_simulation_format = $10,
					updated = NOW() WHERE grafanadb.digital_twin.id = $11;`;
	const result = await pool.query(query, [
		digitalTwinData.digitalTwinUid,
		digitalTwinData.description,
		digitalTwinData.type,
		digitalTwinData.gltfData,
		digitalTwinData.gltfFileName,
		digitalTwinData.gltfFileLastModifDateString,
		digitalTwinData.femSimulationData,
		digitalTwinData.femSimDataFileName,
		digitalTwinData.femSimDataFileLastModifDateString,
		digitalTwinData.digitalTwinSimulationFormat,
		digitalTwinId
	]);
};

export const deleteDigitalTwin = async (digitalTwinId: number): Promise<void> => {
	await pool.query(`DELETE FROM grafanadb.digital_twin WHERE grafanadb.digital_twin.id = $1`, [digitalTwinId]);
};

export const deleteDigitalTwinById = async (digitalTwin: IDigitalTwin): Promise<void> => {
	const digitalTwinTopicsList = await getDTTopicsByDigitalTwinId(digitalTwin.id);
	const topicIdsArray = digitalTwinTopicsList.map(topic => topic.topicId);
	await deleteTopicByIdsArray(topicIdsArray);
	await deleteDashboard(digitalTwin.dashboardId);
	await deleteDigitalTwin(digitalTwin.id);
};

export const createDigitalTwin = async (
	group: IGroup,
	device: IDevice,
	digitalTwinInput: CreateDigitalTwinDto,
	dashboardId: number | null = null,
	alreadyCreatedTopic: ITopic | null = null
): Promise<Partial<IDigitalTwin> | null> => {
	const deviceId = device.id;
	const digitalTwinUid = digitalTwinInput.digitalTwinUid;

	let topicSensors: ITopic[] = [];
	if (!alreadyCreatedTopic) {
		const topicSensorTypes = getTopicSensorTypesFromDigitalTwin(digitalTwinInput);
		const topicSensorQueries: any[] = [];
		for (const topicSensorType of topicSensorTypes) {
			const sensorTopicData =
			{
				topicType: "dev2pdb",
				topicName: `${digitalTwinUid}_${topicSensorType}`,
				description: `Device to platform db for ${digitalTwinUid}`,
				payloadFormat: '{"parameter": "number"}',
				mqttAccessControl: "Pub & Sub"
			};
			const topicSensorQuery = createTopic(deviceId, sensorTopicData);
			topicSensorQueries.push(topicSensorQuery)
		}
		topicSensors = await Promise.all(topicSensorQueries);
	} else {
		topicSensors.push(alreadyCreatedTopic);
	}

	let digitalTwinDashboardId = dashboardId;
	if (!dashboardId) {
		digitalTwinDashboardId = await createDashboard(group, device, topicSensors[0], digitalTwinUid);
	}

	let digitalTwinUpdated: Partial<IDigitalTwin> = { ...digitalTwinInput, deviceId, dashboardId: digitalTwinDashboardId };
	if (digitalTwinInput.type === "Gltf 3D model") {
		digitalTwinUpdated = updatedTopicSensorIdsFromDigitalTwinGltfData(digitalTwinUpdated, topicSensors);
	}
	const digitalTwin = await insertDigitalTwin(digitalTwinUpdated);

	const digitalTwinTopicSensorQueries: any[] = [];
	for (const topicSensor of topicSensors) {
		const index = topicSensor.topicName.split("_")[3];
		const topicType = `dev2pdb_${index}`;
		const digitalTwinTopicSensorQuery = createDigitalTwinTopic(digitalTwin.id, topicSensor.id, topicType)
		digitalTwinTopicSensorQueries.push(digitalTwinTopicSensorQuery);
	}
	await Promise.all(digitalTwinTopicSensorQueries);


	if (digitalTwinInput.type === "Gltf 3D model") {
		const sensorSimulationTopicData =
		{
			topicType: "dev_sim_2dtm",
			topicName: `${digitalTwinUid}_dev_sim_2dtm`,
			description: `Simulated device to DTM for ${digitalTwinUid}`,
			payloadFormat: generateSensorSimulationTopicPayload(digitalTwinInput.digitalTwinSimulationFormat),
			mqttAccessControl: "Pub & Sub"
		};
		const sensorSimulationTopic = await createTopic(deviceId, sensorSimulationTopicData);
		await createDigitalTwinTopic(digitalTwin.id, sensorSimulationTopic.id, "dev_sim_2dtm");

		const assetStateTopicData =
		{
			topicType: "dtm_as2pdb",
			topicName: `${digitalTwinUid}_dtm_as2pdb`,
			description: `DTM assets state to pdb for ${digitalTwinUid}`,
			payloadFormat: '{"assetPartsState": "number[]"}',
			mqttAccessControl: "Pub & Sub"
		};
		const assetStateTopic = await createTopic(deviceId, assetStateTopicData);
		await createDigitalTwinTopic(digitalTwin.id, assetStateTopic.id, "dtm_as2pdb");

		const assetStateSimulationTopicData =
		{
			topicType: "dtm_sim_as2dts",
			topicName: `${digitalTwinUid}_dtm_sim_as2dts`,
			description: `DTM sim assets state to DTS for ${digitalTwinUid}`,
			payloadFormat: '{"assetPartsState": "number[]"}',
			mqttAccessControl: "Pub & Sub"
		};
		const assetStateSimulationTopic = await createTopic(deviceId, assetStateSimulationTopicData);
		await createDigitalTwinTopic(digitalTwin.id, assetStateSimulationTopic.id, "dtm_sim_as2dts");

		const femResultModalValuesTopicData =
		{
			topicType: "dtm_fmv2pdb",
			topicName: `${digitalTwinUid}_dtm_fmv2pdb`,
			description: `DTM fem modal value to pdb for ${digitalTwinUid}`,
			payloadFormat: '{"femResultsModalValues": "number[][][]"}',
			mqttAccessControl: "Pub & Sub"
		};
		const femResultModalValuesTopic = await createTopic(deviceId, femResultModalValuesTopicData);
		await createDigitalTwinTopic(digitalTwin.id, femResultModalValuesTopic.id, "dtm_fmv2pdb");

		const femResultModalValuesSimulationTopicData =
		{
			topicType: "dtm_sim_fmv2dts",
			topicName: `${digitalTwinUid}_dtm_sim_fmv2dts`,
			description: `DTM sim fem modal value to DTS for ${digitalTwinUid}`,
			payloadFormat: '{"femResultsModalValues": "number[][][]"}',
			mqttAccessControl: "Pub & Sub"
		};
		const femResultModalValuesSimulationTopic = await createTopic(deviceId, femResultModalValuesSimulationTopicData);
		await createDigitalTwinTopic(digitalTwin.id, femResultModalValuesSimulationTopic.id, "dtm_sim_fmv2dts");

	}

	return digitalTwin;
};

export const getDigitalTwinByProp = async (propName: string, propValue: (string | number)): Promise<IDigitalTwin> => {
	const response = await pool.query(`SELECT grafanadb.digital_twin.id, grafanadb.device.org_id AS "orgId",
									grafanadb.device.group_id AS "groupId", grafanadb.digital_twin.device_id AS "deviceId",
									grafanadb.digital_twin.digital_twin_uid AS "digitalTwinUid", grafanadb.digital_twin.description,
									grafanadb.digital_twin.type, grafanadb.digital_twin.dashboard_id AS "dashboardId",
									grafanadb.digital_twin.gltf_file_name AS "gltfFileName",
									grafanadb.digital_twin.gltf_file_last_modif_date_string AS "gltfFileLastModifDateString",
									grafanadb.digital_twin.femsimdata_file_name AS "femSimDataFileName",
									grafanadb.digital_twin.femsimdata_file_last_modif_date_string AS "femSimDataFileLastModifDateString",
									grafanadb.digital_twin.digital_twin_simulation_format AS "digitalTwinSimulationFormat",
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
									grafanadb.digital_twin.digital_twin_simulation_format AS "digitalTwinSimulationFormat"
									FROM grafanadb.digital_twin
									WHERE grafanadb.digital_twin.id = $1`, [digitalTwinId]);
	return response.rows[0];
}

export const getAllDigitalTwins = async (): Promise<IDigitalTwin[]> => {
	const response = await pool.query(`SELECT grafanadb.digital_twin.id, grafanadb.device.org_id AS "orgId",
									grafanadb.device.group_id AS "groupId", grafanadb.digital_twin.device_id AS "deviceId",
									grafanadb.digital_twin.digital_twin_uid AS "digitalTwinUid", grafanadb.digital_twin.description,
									grafanadb.digital_twin.type, grafanadb.digital_twin.dashboard_id AS "dashboardId",
									grafanadb.digital_twin.gltf_file_name AS "gltfFileName",
									grafanadb.digital_twin.gltf_file_last_modif_date_string AS "gltfFileLastModifDateString",
									grafanadb.digital_twin.femsimdata_file_name AS "femSimDataFileName",
									grafanadb.digital_twin.femsimdata_file_last_modif_date_string AS "femSimDataFileLastModifDateString",
									grafanadb.digital_twin.digital_twin_simulation_format AS "digitalTwinSimulationFormat",
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
						grafanadb.digital_twin.digital_twin_uid AS "digitalTwinUid", grafanadb.digital_twin.description,
						grafanadb.digital_twin.digital_twin_simulation_format AS "digitalTwinSimulationFormat",
						grafanadb.digital_twin_topic.topic_id AS "sensorSimulationTopicId"
						FROM grafanadb.digital_twin
						INNER JOIN grafanadb.device ON grafanadb.digital_twin.device_id = grafanadb.device.id
						INNER JOIN grafanadb.digital_twin_topic ON
							grafanadb.digital_twin_topic.digital_twin_id = grafanadb.digital_twin.id
						WHERE  grafanadb.digital_twin.type = $1 AND
						grafanadb.digital_twin.digital_twin_simulation_format != '{}'::jsonb AND
						grafanadb.digital_twin_topic.topic_type = $2
						ORDER BY grafanadb.device.org_id ASC,
							grafanadb.device.group_id ASC,
							grafanadb.digital_twin.device_id ASC,
							grafanadb.digital_twin.id ASC;`, ["Gltf 3D model", "dev_sim_2dtm"]);
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
									grafanadb.digital_twin.digital_twin_uid AS "digitalTwinUid", grafanadb.digital_twin.description,
									grafanadb.digital_twin.type, grafanadb.digital_twin.dashboard_id AS "dashboardId",
									grafanadb.digital_twin.gltf_file_name AS "gltfFileName",
									grafanadb.digital_twin.gltf_file_last_modif_date_string AS "gltfFileLastModifDateString",
									grafanadb.digital_twin.femsimdata_file_name AS "femSimDataFileName",
									grafanadb.digital_twin.femsimdata_file_last_modif_date_string AS "femSimDataFileLastModifDateString",
									grafanadb.digital_twin.digital_twin_simulation_format AS "digitalTwinSimulationFormat",
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
									grafanadb.digital_twin.digital_twin_uid AS "digitalTwinUid", grafanadb.digital_twin.description,
									grafanadb.digital_twin.type, grafanadb.digital_twin.dashboard_id AS "dashboardId",
									grafanadb.digital_twin.gltf_file_name AS "gltfFileName",
									grafanadb.digital_twin.gltf_file_last_modif_date_string AS "gltfFileLastModifDateString",
									grafanadb.digital_twin.femsimdata_file_name AS "femSimDataFileName",
									grafanadb.digital_twin.femsimdata_file_last_modif_date_string AS "femSimDataFileLastModifDateString",
									grafanadb.digital_twin.digital_twin_simulation_format AS "digitalTwinSimulationFormat",
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
						grafanadb.digital_twin.digital_twin_uid AS "digitalTwinUid", grafanadb.digital_twin.description,
						grafanadb.digital_twin.digital_twin_simulation_format AS "digitalTwinSimulationFormat",
						grafanadb.digital_twin_topic.topic_id AS "sensorSimulationTopicId"
						FROM grafanadb.digital_twin
						INNER JOIN grafanadb.device ON grafanadb.digital_twin.device_id = grafanadb.device.id
						INNER JOIN grafanadb.digital_twin_topic ON
							grafanadb.digital_twin_topic.digital_twin_id = grafanadb.digital_twin.id
						WHERE grafanadb.device.group_id = ANY($1::bigint[]) AND
						grafanadb.digital_twin.type = $2 AND
						grafanadb.digital_twin.digital_twin_simulation_format != '{}'::jsonb AND
						grafanadb.digital_twin_topic.topic_type = $3
						ORDER BY grafanadb.device.org_id ASC,
							grafanadb.device.group_id ASC,
							grafanadb.digital_twin.device_id ASC,
							grafanadb.digital_twin.id ASC;`, [groupsIdArray, "Gltf 3D model", "dev_sim_2dtm"]);
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
									grafanadb.digital_twin.digital_twin_uid AS "digitalTwinUid", grafanadb.digital_twin.description,
									grafanadb.digital_twin.type, grafanadb.digital_twin.dashboard_id AS "dashboardId",
									grafanadb.digital_twin.gltf_file_name AS "gltfFileName",
									grafanadb.digital_twin.gltf_file_last_modif_date_string AS "gltfFileLastModifDateString",
									grafanadb.digital_twin.femsimdata_file_name AS "femSimDataFileName",
									grafanadb.digital_twin.femsimdata_file_last_modif_date_string AS "femSimDataFileLastModifDateString",
									grafanadb.digital_twin.digital_twin_simulation_format AS "digitalTwinSimulationFormat",
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
		let topicType = topicData.topicType;
		if (topicData.topicType.slice(0, 7) === "dev2pdb") {
			topicType = "dev2pdb";
		}
		return {
			topicId: topicData.topicId,
			mqttTopic: topicData.mqttTopic,
			topicType,
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

const generateMqttTopic = (mqttTopicInfo: IMqttTopicInfo | IMqttDigitalTwinTopicInfo): string => {
	let topicType = mqttTopicInfo.topicType;
	if (mqttTopicInfo.topicType.slice(0, 7) === "dev2pdb") {
		topicType = "dev2pdb";
	}
	const mqttTopic = `${topicType}/Group_${mqttTopicInfo.groupHash}/Device_${mqttTopicInfo.deviceHash}/Topic_${mqttTopicInfo.topicHash}`;
	return mqttTopic;
}

export const generateSqlTopic = (mqttTopicInfo: IMqttTopicInfo): string => {
	const sqlTopic = `Device_${mqttTopicInfo.deviceHash}/Topic_${mqttTopicInfo.topicHash}`;
	return sqlTopic;
}

const generateDashboardUrl = (dashboardInfo: IDashboardInfo): string => {
	const domainNameUrl = getDomainUrl();
	let dashboardUrl: string;
	if (dashboardInfo.slug === "Inexistent") {
		dashboardUrl = `Warning: Dashboard with id: ${dashboardInfo.dashboardId} not exists any more`;
	} else {
		dashboardUrl = `${domainNameUrl}/grafana/d/${dashboardInfo.uid}/${dashboardInfo.slug}`;
	}
	return dashboardUrl;
}



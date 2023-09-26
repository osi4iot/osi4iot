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
	// getSensorTopicsOfDTByDigitalTwinId,
	getTopicByProp,
	markInexistentTopics
} from "../topic/topicDAL";
import IMqttTopicInfo from "../topic/mqttTopicInfo.interface";
import getDomainUrl from "../../utils/helpers/getDomainUrl";
import IDashboardInfo from "../dashboard/dashboardInfo.interfase";
import IDigitalTwinGltfData, { IMqttTopicData, IMqttTopicDataShort } from "./digitalTwinGltfData.interface";
import { getLastMeasurement } from "../mesurement/measurementDAL";
import IMeasurement from "../mesurement/measurement.interface";
import IDigitalTwinSimulator from "./digitalTwinSimulator.interface";
import IDigitalTwinTopic from "./digitalTwinTopic.interface";
import IDevice from "../device/device.interface";
import { createDashboard, createSensorDashboard, deleteDashboard } from "../group/dashboardDAL";
import IMqttDigitalTwinTopicInfo from "./mqttDigitalTwinTopicInfo.interface";
import ITopic from "../topic/topic.interface";
import process_env from "../../config/api_config";
import s3Client from "../../config/s3Config";
import {
	DeleteObjectCommand,
	DeleteObjectsCommand,
	GetObjectCommand,
	ListObjectsV2Command,
	PutObjectCommand
} from "@aws-sdk/client-s3";
import IAsset from "../asset/asset.interface";
import { createDevice, deleteDevicesByIdArray, getDeviceByProp } from "../device/deviceDAL";
import ISensor from "../sensor/sensor.interface";
import { createNewSensor, deleteSensorsByIdArray, getSensorByPropName } from "../sensor/sensorDAL";
import IDigitalTwinDevice from "./digitalTwinDevice.interface";
import IDigitalTwinSensor from "./digitalTwinSensor.interface";
import IDigitalTwinSensorDashboard from "./digitalTwinSensorDashboard.interface";
import UpdateDigitalTwinDto from "./digitalTwinUpdate.dto";
import CreateSensorRefDto from "./sensorRef.dto";

// const generateSensorSimulationTopicPayload = (digitalTwinSimulationFormat: string): string => {
// 	const digitalTwinSimulationFormatObj = JSON.parse(digitalTwinSimulationFormat);
// 	const keys = Object.keys(digitalTwinSimulationFormatObj);
// 	const payloadObj: Record<string, { type: string, units: string }> = {};
// 	keys.forEach(key => {
// 		payloadObj[key] = {} as any;
// 		payloadObj[key].type = "number";
// 		payloadObj[key].units = digitalTwinSimulationFormatObj[key].units;
// 	});
// 	const payload = JSON.stringify(payloadObj);
// 	return payload;
// }

export interface IMeshNode {
	name?: string;
	mesh?: number;
	extras: {
		animationType: string;
		topicType: string;
		type: string;
		clipTopicType: string;
		sensorRef: string;
		topicRef: string;
		description: string;
		payloadKey: string;
		paramLabel: string;
		valueType: string;
		units: string;
		dashboardRefresh: string;
		dashboardTimeWindow: string;
	};
}

// const getTopicSensorTypesFromDigitalTwin = (type: string, gltfFileData: any): string[] => {
// 	const topicTypes: string[] = [];
// 	if (type === "Gltf 3D model") {
// 		if (typeof gltfFileData === "string") gltfFileData = JSON.parse(gltfFileData);
// 		if (Object.keys(gltfFileData).length && gltfFileData.nodes?.length !== 0) {
// 			const meshNodes: IMeshNode[] = [];
// 			gltfFileData.nodes.forEach((node: IMeshNode) => {
// 				// node.mesh are not included for taking into account root nodes
// 				if (node.extras !== undefined) meshNodes.push(node);
// 			})

// 			meshNodes.forEach((node: IMeshNode) => {
// 				if (node.extras?.type !== undefined && node.extras?.type === "sensor") {
// 					const topicType = node.extras?.topicType;
// 					if (topicType && topicTypes.findIndex(topicTypei => topicTypei === topicType) === -1) {
// 						topicTypes.push(topicType)
// 					}
// 				}
// 				if (node.extras?.clipTopicType !== undefined) {
// 					const topicType = node.extras?.clipTopicType;
// 					if (topicTypes.findIndex(topicTypei => topicTypei === topicType) === -1) {
// 						topicTypes.push(topicType);
// 					}
// 				}
// 			})
// 		}

// 	} else if (type === "Grafana dashboard") {
// 		topicTypes.push("dev2pdb_1");
// 	}

// 	return topicTypes;
// }


// interface ISensorRef {
// 	sensorRef: string;
// 	topicRef: string;
// 	description: string;
// 	payloadKey: string;
// 	paramLabel: string;
// 	valueType: string;
// 	units: string;
// 	dashboardRefresh: string;
// 	dashboardTimeWindow: string;
// }

// interface IDigitalTwinReferences {
// 	devicesRef: string[],
// 	topicsRef: string[],
// 	sensorsRef: ISensorRef[],
// }

// const getDigitalTwinRefFromGltfFile = (type: string, gltfFileData: any): IDigitalTwinReferences => {
// 	const digitalTwinReferences: IDigitalTwinReferences = {
// 		devicesRef: [],
// 		topicsRef: [],
// 		sensorsRef: [],
// 	};

// 	const devicesRef: string[] = [];
// 	const topicsRef: string[] = [];
// 	const sensorsRef: { sensorRef: string, topicRef: string }[] = [];

// 	if (type === "Gltf 3D model") {
// 		if (typeof gltfFileData === "string") gltfFileData = JSON.parse(gltfFileData);
// 		if (Object.keys(gltfFileData).length && gltfFileData.nodes?.length !== 0) {
// 			const meshNodes: IMeshNode[] = [];
// 			gltfFileData.nodes.forEach((node: IMeshNode) => {
// 				// node.mesh are not included for taking into account root nodes
// 				if (node.extras !== undefined) meshNodes.push(node);
// 			})

// 			meshNodes.forEach((node: IMeshNode) => {
// 				if (node.extras?.type !== undefined && node.extras?.type === "sensor") {
// 					const topicRef = node.extras?.topicRef;
// 					if (topicRef && topicsRef.findIndex(topicRefi => topicRefi === topicRef) === -1) {
// 						topicsRef.push(topicRef);
// 						const deviceRef = `device_${topicRef.slice(8).split("-")[0]}`;
// 						if (devicesRef.findIndex(deviceRefi => deviceRefi === deviceRef) === -1) {
// 							devicesRef.push(deviceRef);
// 						}
// 					}
// 					const sensorRef = node.extras?.sensorRef;
// 					if (sensorRef && topicRef) {
// 						if (sensorsRef.findIndex(sensorsRefi => sensorsRefi.sensorRef === sensorRef) === -1) {
// 							const newSensorRef = {
// 								sensorRef,
// 								topicRef,
// 								description: node.extras?.description,
// 								payloadKey: node.extras?.payloadKey,
// 								paramLabel: node.extras?.paramLabel,
// 								valueType: node.extras?.valueType,
// 								units: node.extras?.units,
// 								dashboardRefresh: node.extras?.dashboardRefresh,
// 								dashboardTimeWindow: node.extras?.dashboardTimeWindow
// 							}
// 							digitalTwinReferences.sensorsRef.push(newSensorRef);
// 						}
// 					}
// 				}
// 			})
// 		}
// 	} else {
// 		digitalTwinReferences.topicsRef.push("dev2pdb_1-1");
// 		const newSensorRef = {
// 			sensorRef: "device_1",
// 			topicRef: "dev2pdb_1-1",
// 			description: "Sensor for device_1",
// 			payloadKey: "paramter",
// 			paramLabel: "Parameter",
// 			valueType: "number",
// 			units: "-",
// 			dashboardRefresh: "1s",
// 			dashboardTimeWindow: "5m"
// 		}
// 		digitalTwinReferences.sensorsRef.push(newSensorRef);
// 	}
// 	return digitalTwinReferences;
// }

const findTopicIdForSensor = (topicName: string, topicSensors: ITopic[]) => {
	let sensorTopicId = -1;
	for (const topicSensor of topicSensors) {
		const topicSensorIndex = parseInt(topicSensor.topicName.split("_").slice(-1)[0], 10);
		if (topicName === `dev2pdb_${topicSensorIndex}`) {
			sensorTopicId = topicSensor.id;
		}
	}
	return sensorTopicId;
}

export const updatedTopicSensorIdsFromDigitalTwinGltfData = async (
	gltfFileName: string,
	gltfFileData: any,
	topicSensors: ITopic[]
) => {
	if (typeof gltfFileData === "string") gltfFileData = JSON.parse(gltfFileData);
	if (Object.keys(gltfFileData).length && gltfFileData.nodes?.length !== 0) {
		gltfFileData.nodes.forEach(
			(
				node: {
					name?: string; mesh?: number;
					extras: {
						animationType: string;
						topicType: string;
						objectOnOff: string;
						sensorTopicId: number;
						type: string;
						clipTopicType: string;
						clipTopicId: number;
					};
				}
			) => {
				// if (node.mesh !== undefined && node.extras !== undefined) {
				if (node.extras !== undefined) {
					if (node.extras.type !== undefined && node.extras.type === "sensor") {
						const topicType = node.extras?.topicType;
						if (topicType) {
							const topicId = findTopicIdForSensor(topicType, topicSensors);
							node.extras.sensorTopicId = topicId;
						}
					}
					if (node.extras.clipTopicType !== undefined) {
						const topicType = node.extras.clipTopicType
						node.extras.clipTopicId = findTopicIdForSensor(topicType, topicSensors);
					}
				}

			})

		const bucketParams = {
			Bucket: process_env.S3_BUCKET_NAME,
			Key: gltfFileName,
			Body: JSON.stringify(gltfFileData)
		};
		await s3Client.send(new PutObjectCommand(bucketParams));
	}
}

interface IGltfFileData {
	gltfFileName: string;
	gltfFileData: string;
}

export const verifyAndCorrectDigitalTwinReferences = async (
	group: IGroup,
	digitalTwinUpdate: IDigitalTwin & UpdateDigitalTwinDto
): Promise<void> => {
	const digitalTwinId = digitalTwinUpdate.id;
	const { topicsRef, devicesRef, sensorsRef } = digitalTwinUpdate;
	const storedTopicsRef = await getDigitalTwinTopics(digitalTwinId);
	const storedDevicesRef = await getDigitalTwinDevices(digitalTwinId);
	const storedSensorsRef = await getDigitalTwinSensors(digitalTwinId);
	const newDevicesRef = [...devicesRef];
	const newSensorTopicsRef = [...topicsRef];

	const devicesIdToRemove: number[] = [];
	const devicesRefToAdd: string[] = [];
	devicesRef.forEach(deviceRef => {
		const deviceMap = storedDevicesRef.filter(device => device.deviceRef === deviceRef.deviceRef)[0];
		if (!deviceMap) devicesRefToAdd.push(deviceMap.deviceRef);
	});
	storedDevicesRef.forEach(deviceRef => {
		const deviceMap = devicesRef.filter(device => {
			return device.deviceRef === deviceRef.deviceRef && !deviceRef.alreadyCreated
		})[0];
		if (!deviceMap) devicesIdToRemove.push(deviceRef.deviceId);
	});
	if (devicesIdToRemove.length !== 0) {
		await deleteDevicesByIdArray(devicesIdToRemove);
	}
	for (const deviceRef of devicesRefToAdd) {
		const deviceData = { mqttAccessControl: "Pub & Sub" };
		const device = await createDevice(group, deviceData);
		await createDigitalTwinDevice(digitalTwinId, device.id, deviceRef, true);
		newDevicesRef.push({ deviceId: device.id, deviceRef });
	}

	const newTopicsRef = topicsRef.map(topic => topic.topicRef);
	newTopicsRef.push("dtm2sim", "sim2dtm", "dtm2pdb");
	for (let devIndex = 1; devIndex <= sensorsRef.length; devIndex++) {
		newTopicsRef.push(`dev2dtm_${devIndex}`);
		newTopicsRef.push(`dtm2dev_${devIndex}`);
		newTopicsRef.push(`dev2sim_${devIndex}`);
	}
	const topicTypesToAdd: string[] = [];
	const topicIdsToRemove: number[] = [];
	newTopicsRef.forEach(topicType => {
		const existentTopic = storedTopicsRef.filter(topic => topic.topicType === topicType)[0];
		if (!existentTopic) topicTypesToAdd.push(topicType);
	});
	storedTopicsRef.forEach(topic => {
		const necessaryTopicTypeIndex = newTopicsRef.indexOf(topic.topicType);
		if (necessaryTopicTypeIndex === -1) topicIdsToRemove.push(topic.topicId);
	})
	if (topicIdsToRemove.length !== 0) {
		await deleteTopicByIdsArray(topicIdsToRemove)
	}
	if (topicTypesToAdd.length !== 0) {
		const digitalTwinUid = digitalTwinUpdate.digitalTwinUid;
		const topicSensorTypesToAdd = topicTypesToAdd.filter(topicType => topicType.slice(0, 7) === "dev2pdb");
		if (topicSensorTypesToAdd.length !== 0) {
			for (let i = 1; i <= topicSensorTypesToAdd.length; i++) {
				const topicType = topicSensorTypesToAdd[i];
				const devIndexString = topicType[i].slice(8).split("-")[0];
				const devIndex = parseInt(devIndexString, 10) - 1;
				const deviceRef = `device_${devIndex}`;
				const deviceId = newDevicesRef.filter(device => device.deviceRef === deviceRef)[0].deviceId;
				const topicData = {
					topicType,
					description: `${topicType} for DT_${digitalTwinUid}`,
					mqttAccessControl: "Pub & Sub"
				}
				const topic = await createTopic(deviceId, topicData);
				await createDigitalTwinTopic(digitalTwinId, topic.id, topicType);
				newSensorTopicsRef.push({topicRef: topicType, topicId: topic.id})
			}
		}

		for (let devIndex = 1; devIndex <= devicesRef.length; devIndex++) {
			const deviceRef = `device_${devIndex}`;
			const deviceId = newDevicesRef.filter(device => device.deviceRef === deviceRef)[0].deviceId;
			if (topicTypesToAdd.indexOf(`dev2dtm_${devIndex}`) !== -1) {
				const dev2dtmTopicData =
				{
					topicType: `dev2dtm_${devIndex}`,
					description: `dev2dtm_${devIndex} for DT_${digitalTwinUid}`,
					mqttAccessControl: "Pub & Sub"
				};
				const dev2dtmTopic = await createTopic(deviceId, dev2dtmTopicData);
				await createDigitalTwinTopic(digitalTwinId, dev2dtmTopic.id, `dev2dtm_${devIndex}`);
			}

			if (topicTypesToAdd.indexOf(`dtm2dev_${devIndex}`) !== -1) {
				const dtm2devTopicData =
				{
					topicType: `dtm2dev_${devIndex}`,
					description: `dtm2dev_${devIndex} for DT_${digitalTwinUid}`,
					mqttAccessControl: "Pub & Sub"
				};
				const dtm2devTopic = await createTopic(deviceId, dtm2devTopicData);
				await createDigitalTwinTopic(digitalTwinId, dtm2devTopic.id, `dtm2dev_${devIndex}`);
			}

			if (topicTypesToAdd.indexOf(`dev2sim_${devIndex}`) !== -1) {
				const dev2simTopicData =
				{
					topicType: `dev2sim_${devIndex}`,
					description: `dev2sim_${devIndex} for DT_${digitalTwinUid}`,
					mqttAccessControl: "Pub & Sub"
				};
				const dev2simTopic = await createTopic(deviceId, dev2simTopicData);
				await createDigitalTwinTopic(digitalTwinId, dev2simTopic.id, `dev2sim_${devIndex}`);
			}
		}

		if (topicTypesToAdd.indexOf("dtm2sim") !== -1) {
			const dtm2simTopicData =
			{
				topicType: "dtm2sim",
				topicName: `${digitalTwinUid}_dtm2sim`,
				description: `DTM to simulator for ${digitalTwinUid}`,
				mqttAccessControl: "Pub & Sub"
			};
			const dtm2simTopic = await createTopic(0, dtm2simTopicData);
			await createDigitalTwinTopic(digitalTwinId, dtm2simTopic.id, "dtm2sim");
		}

		if (topicTypesToAdd.indexOf("sim2dtm") !== -1) {
			const sim2dtmTopicData =
			{
				topicType: "sim2dtm",
				description: `sim2dtm for DT_${digitalTwinUid}`,
				mqttAccessControl: "Pub & Sub"
			};
			const sim2dtmTopic = await createTopic(0, sim2dtmTopicData);
			await createDigitalTwinTopic(digitalTwinId, sim2dtmTopic.id, "sim2dtm");
		}

		if (topicTypesToAdd.indexOf("dtm2pdb") !== -1) {
			const dtm2pdbTopicData =
			{
				topicType: "dtm2pdb",
				topicName: `${digitalTwinUid}_dtm2pdb`,
				description: `DTM to platform db for ${digitalTwinUid}`,
				mqttAccessControl: "Pub & Sub"
			};
			const dtm2pdbTopic = await createTopic(0, dtm2pdbTopicData);
			await createDigitalTwinTopic(digitalTwinId, dtm2pdbTopic.id, "dtm2pdb");
		}
	}

	const sensorsIdToRemove: number[] = [];
	const sensorsRefToAdd: CreateSensorRefDto[] = [];
	sensorsRef.forEach(sensorRef => {
		const sensorMap = storedSensorsRef.filter(sensor => sensor.sensorRef === sensorRef.sensorRef)[0];
		if (!sensorMap) sensorsRefToAdd.push(sensorRef);
	});
	storedSensorsRef.forEach(sensorRef => {
		const sensorMap = sensorsRef.filter(sensor => {
			return sensor.sensorRef === sensorRef.sensorRef && !sensorRef.alreadyCreated
		})[0];
		if (!sensorMap) sensorsIdToRemove.push(sensorRef.sensorId);
	});
	if (sensorsIdToRemove.length !== 0) {
		await deleteSensorsByIdArray(sensorsIdToRemove);
	}
	for (const sensorRef of sensorsRefToAdd) {
		const topicRef = topicsRef.filter(topicMap => topicMap.topicRef === sensorRef.topicRef)[0].topicRef;
		const topicId = newSensorTopicsRef.filter(topic => topic.topicRef === topicRef )[0].topicId;
		const sensorData = {
			assetId: digitalTwinUpdate.assetId,
			description: sensorRef.description,
			topicId,
			payloadKey: sensorRef.payloadKey,
			paramLabel: sensorRef.paramLabel,
			valueType: sensorRef.valueType,
			units: sensorRef.units,
			dashboardRefresh: sensorRef.dashboardRefresh,
			dashboardTimeWindow: sensorRef.dashboardTimeWindow
		}
		const sensorsUid = nanoid(20).replace(/-/g, "x").replace(/_/g, "X");
		const sensorDashboarId = await createSensorDashboard(group, sensorData, sensorsUid);
		const dashboardsInfo = await getDashboardsInfoFromIdArray([sensorDashboarId]);
		const dashboardsUrl = generateDashboardsUrl(dashboardsInfo);
		const sensor = await createNewSensor(sensorData, sensorDashboarId, dashboardsUrl[0], sensorsUid);
		await createDigitalTwinSensor(digitalTwinId, sensor.id, sensorRef.sensorRef, topicId, true)
	}
}


export const getMqttTopicsDataFromDigitalTwinData = async (digitalTwinId: number): Promise<IMqttTopicData[]> => {
	const mqttTopicsData: IMqttTopicData[] = [];
	const digitalTwinTopicsList = await getDTTopicsByDigitalTwinId(digitalTwinId);
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
			if (
				mqttTopicData.sqlTopic &&
				(mqttTopicData.topicType.slice(0, 7) === "dev2pdb" || mqttTopicData.topicType === "dtm2pdb")
			) {
				const query = getLastMeasurement(mqttTopicData.groupUid, mqttTopicData.sqlTopic);
				mesurementsQueries.push(query);
			}
		});
		const mesurements: IMeasurement[] = await Promise.all(mesurementsQueries).then(responses => responses as IMeasurement[]);

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

/// Marker

export const insertDigitalTwin = async (
	digitalTwinData: Partial<IDigitalTwin>
): Promise<IDigitalTwin> => {
	const queryString = `INSERT INTO grafanadb.digital_twin (group_id, asset_id,
		digital_twin_uid, description, type, dashboard_id, max_num_resfem_files,
		digital_twin_simulation_format, created, updated)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
		RETURNING  id, group_id AS "groupId", asset_id AS "assetId",
		scope, digital_twin_uid AS "digitalTwinUid", description,
		type, dashboard_id AS "dashboardId",
		digital_twin_simulation_format AS "digitalTwinSimulationFormat",
		created, updated`;

	const result = await pool.query(
		queryString,
		[
			digitalTwinData.groupId,
			digitalTwinData.assetId,
			digitalTwinData.digitalTwinUid,
			digitalTwinData.description,
			digitalTwinData.type,
			digitalTwinData.dashboardId,
			digitalTwinData.maxNumResFemFiles,
			digitalTwinData.digitalTwinSimulationFormat
		]);
	return result.rows[0] as IDigitalTwin;
};

export const createDigitalTwinTopic = async (
	digitalTwinId: number,
	topicId: number,
	topicType: string
): Promise<IDigitalTwinTopic> => {
	const queryString = `INSERT INTO grafanadb.digital_twin_topic (
		digital_twin_id, topic_id, topic_type)
		VALUES ($1, $2, $3)
	    RETURNING  digital_twin_id AS "digitalTwinId", topic_id AS "topicId", 
		topic_type AS "topicType"`
	const result = await pool.query(
		queryString,
		[digitalTwinId, topicId, topicType]);
	return result.rows[0] as IDigitalTwinTopic;
};

export const getDigitalTwinTopics = async (digitalTwinId: number): Promise<IDigitalTwinTopic[]> => {
	const queryString = `SELECT digital_twin_id AS "digitalTwinId",
						topic_id AS "topicId", topic_type AS "topicType"
						FROM grafanadb.digital_twin_topic
						WHERE grafanadb.digital_twin_topic.digital_twin_id = $1
						ORDER BY grafanadb.digital_twin_topic.digital_twin_id ASC,
						         grafanadb.digital_twin_topic.topic_id ASC;`;
	const response = await pool.query(queryString, [digitalTwinId]);
	return response.rows as IDigitalTwinTopic[];
};

export const deleteDigitalTwinTopics = async (
	digitalTwinId: number,
	topicsId: number[]
): Promise<void> => {
	const queryString = `DELETE FROM grafanadb.digital_twin_topic
						WHERE grafanadb.digital_twin_topic.digital_twin_id = $1
						AND grafanadb.digital_twin_topic.topic_id = ANY($2::bigint[]);`;
	await pool.query(queryString, [digitalTwinId, topicsId]);
};

export const createDigitalTwinDevice = async (
	digitalTwinId: number,
	deviceId: number,
	deviceRef: string,
	alreadyCreated: boolean
): Promise<IDigitalTwinDevice> => {
	const queryString = `INSERT INTO grafanadb.digital_twin_device (
		digital_twin_id, device_id, device_ref, already_created)
		VALUES ($1, $2, $3, $4)
	    RETURNING  digital_twin_id AS "digitalTwinId", device_id AS "devicId", 
		device_ref AS "deviceRef", already_created AS "alreadyCreated"`
	const result = await pool.query(
		queryString,
		[digitalTwinId, deviceId, deviceRef, alreadyCreated]);
	return result.rows[0] as IDigitalTwinDevice;
};

export const getDigitalTwinDevices = async (digitalTwinId: number): Promise<IDigitalTwinDevice[]> => {
	const queryString = `SELECT digital_twin_id AS "digitalTwinId",
						device_id AS "deviceId", device_ref AS "devideRef",
						already_created AS "alreadyCreated"
						FROM grafanadb.digital_twin_device
						WHERE grafanadb.digital_twin_device.digital_twin_id = $1
						ORDER BY grafanadb.digital_twin_device.digital_twin_id ASC,
						         grafanadb.digital_twin_device.device_id ASC;`;
	const response = await pool.query(queryString, [digitalTwinId]);
	return response.rows as IDigitalTwinDevice[];
};

export const createDigitalTwinSensor = async (
	digitalTwinId: number,
	sensorId: number,
	sensorRef: string,
	topicId: number,
	alreadyCreated: boolean
): Promise<IDigitalTwinSensor> => {
	const queryString = `INSERT INTO grafanadb.digital_twin_sensor (
		digital_twin_id, sensor_id, sensor_ref, topic_id, already_created)
		VALUES ($1, $2, $3, $4, $5)
	    RETURNING  digital_twin_id AS "digitalTwinId", sensor_id AS "sensorId",
		sensor_ref AS "sensorRef", topic_id AS "topicId"`
	const result = await pool.query(
		queryString,
		[digitalTwinId, sensorId, sensorRef, topicId, alreadyCreated]);
	return result.rows[0] as IDigitalTwinSensor;
};

export const getDigitalTwinSensors = async (digitalTwinId: number): Promise<IDigitalTwinSensor[]> => {
	const queryString = `SELECT digital_twin_id AS "digitalTwinId",
	                    sensor_id AS "sensorId", sensor_ref AS "sensorRef·
						grafanadb.digital_twin_topic.topic_type AS "topicType",
						already_created AS "alreadyCreated"
						FROM grafanadb.digital_twin_sensor
						WHERE grafanadb.digital_twin_sensor.digital_twin_id = $1
						ORDER BY grafanadb.digital_twin_sensor.digital_twin_id ASC,
						         grafanadb.digital_twin_sensor.sensor_id ASC;`;
	const response = await pool.query(queryString, [digitalTwinId]);
	return response.rows as IDigitalTwinSensor[];
};

export const createDigitalTwinSensorDashboard = async (
	digitalTwinId: number,
	sensorId: number,
	dashboardId: number
): Promise<IDigitalTwinSensorDashboard> => {
	const queryString = `INSERT INTO grafanadb.digital_twin_sensor_dashboard (
		digital_twin_id, sensor_id, dashboard_id)
		VALUES ($1, $2, $3)
	    RETURNING  digital_twin_id AS "digitalTwinId", sensor_id AS "sensorId",
		dashboard_id AS "dashboardId"`
	const result = await pool.query(
		queryString,
		[digitalTwinId, sensorId, dashboardId]);
	return result.rows[0] as IDigitalTwinSensorDashboard;
};

/// Fin marker

export const getDTTopicsByDigitalTwinId = async (digitalTwinId: number): Promise<IDigitalTwinTopic[]> => {
	const response = await pool.query(`SELECT grafanadb.digital_twin_topic.digital_twin_id AS "digitalTwinId",
	                                grafanadb.digital_twin_topic.topic_id AS "topicId",
									grafanadb.digital_twin_topic.topic_type AS "topicType"
									FROM grafanadb.digital_twin_topic
									WHERE grafanadb.digital_twin_topic.digital_twin_id = $1
									ORDER BY grafanadb.digital_twin_topic.digital_twin_id ASC,
											grafanadb.digital_twin_topic.topic_id ASC;`, [digitalTwinId]);
	return response.rows as IDigitalTwinTopic[];
};

export const getDTSensorTopicsByDigitalTwinId = async (digitalTwinId: number): Promise<IDigitalTwinTopic[]> => {
	const response = await pool.query(`SELECT grafanadb.digital_twin_topic.digital_twin_id AS "digitalTwinId",
	                                grafanadb.digital_twin_topic.topic_id AS "topicId",
									grafanadb.digital_twin_topic.topic_type AS "topicType"
									FROM grafanadb.digital_twin_topic
									WHERE grafanadb.digital_twin_topic.digital_twin_id = $1
									ORDER BY grafanadb.digital_twin_topic.digital_twin_id ASC,
											grafanadb.digital_twin_topic.topic_id ASC;`, [digitalTwinId]);
	return response.rows as IDigitalTwinTopic[];
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

	return response.rows as IMqttDigitalTwinTopicInfo[];
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
	const query = `UPDATE grafanadb.digital_twin SET digital_twin_uid = $1, description = $2, type = $3, max_num_resfem_files = $4,
					digital_twin_simulation_format = $5, updated = NOW() WHERE grafanadb.digital_twin.id = $6;`;
	await pool.query(query, [
		digitalTwinData.digitalTwinUid,
		digitalTwinData.description,
		digitalTwinData.type,
		digitalTwinData.maxNumResFemFiles,
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

interface ICreateDigitalTwin {
	digitalTwin: IDigitalTwin | null;
	topicSensors: ITopic[];
}

export const createDigitalTwin = async (
	group: IGroup,
	asset: IAsset,
	digitalTwinInput: CreateDigitalTwinDto,
	dashboardId: number | null = null,
): Promise<ICreateDigitalTwin> => {
	const assetId = asset.id;
	const digitalTwinUid = digitalTwinInput.digitalTwinUid;

	const devices: IDevice[] = [];
	if (digitalTwinInput.devicesRef.length !== 0) {
		for (const deviceMap of digitalTwinInput.devicesRef) {
			if (deviceMap.deviceId !== 0) {
				const device = await getDeviceByProp("id", deviceMap.deviceId)
				if (!device) throw new Error(`The device with id: ${deviceMap.deviceId} not exists`);
				devices.push(device);
			} else {
				const deviceData = { mqttAccessControl: "Pub & Sub" };
				const device = await createDevice(group, deviceData);
				devices.push(device);
			}
		}
	}

	const topicSensors: ITopic[] = [];
	if (digitalTwinInput.topicsRef.length !== 0) {
		for (const topicMap of digitalTwinInput.topicsRef) {
			const topicSensorType = topicMap.topicRef; /// Format dev2pdb_1-1
			if (topicMap.topicId !== 0) {
				const topic = await getTopicByProp("id", topicMap.topicId)
				if (!topic) throw new Error(`The topic with id: ${topicMap.topicId} not exists`);
				topicSensors.push(topic);
			} else {
				const devIndexString = topicSensorType.slice(8).split("-")[0];
				const devIndex = parseInt(devIndexString, 10) - 1;
				const topicData = {
					topicType: topicSensorType,
					description: `${topicSensorType} for DT_${digitalTwinUid}`,
					mqttAccessControl: "Pub & Sub"
				}
				const topic = await createTopic(devices[devIndex].id, topicData);
				topicSensors.push(topic);
			}
		}
	}

	const sensors: ISensor[] = [];
	const sensorDashboarsId: number[] = [];
	if (digitalTwinInput.sensorsRef.length !== 0) {
		for (const sensorMap of digitalTwinInput.sensorsRef) {
			if (sensorMap.sensorId !== 0) {
				const sensor = await getSensorByPropName("id", sensorMap.sensorId)
				if (!sensor) throw new Error(`The sensor with id: ${sensorMap.sensorId} not exists`);
				sensors.push(sensor);
			} else {
				const topicIndex = digitalTwinInput.topicsRef.findIndex(topicMap => topicMap.topicRef === sensorMap.topicRef);
				const sensorData = {
					assetId: asset.id,
					description: sensorMap.description,
					topicId: topicSensors[topicIndex].id,
					payloadKey: sensorMap.payloadKey,
					paramLabel: sensorMap.paramLabel,
					valueType: sensorMap.valueType,
					units: sensorMap.units,
					dashboardRefresh: sensorMap.dashboardRefresh,
					dashboardTimeWindow: sensorMap.dashboardTimeWindow
				}
				const sensorsUid = nanoid(20).replace(/-/g, "x").replace(/_/g, "X");
				const sensorDashboarId = await createSensorDashboard(group, sensorData, sensorsUid);
				const dashboardsInfo = await getDashboardsInfoFromIdArray([sensorDashboarId]);
				const dashboardsUrl = generateDashboardsUrl(dashboardsInfo);
				const sensor = await createNewSensor(sensorData, sensorDashboarId, dashboardsUrl[0], sensorsUid);
				sensors.push(sensor);
				sensorDashboarsId.push(sensorDashboarId);
			}
		}
	}

	let digitalTwinDashboardId = dashboardId;
	if (!dashboardId) {
		const dashboardTitle = `DT_${digitalTwinUid} dashboard`;
		const deviceUid = devices[0].deviceUid;
		const topicUid = topicSensors[0]?.topicUid;
		digitalTwinDashboardId = await createDashboard(group, deviceUid, topicUid, dashboardTitle);
	}

	const digitalTwinUpdated: Partial<IDigitalTwin> = {
		...digitalTwinInput,
		assetId,
		dashboardId: digitalTwinDashboardId
	};
	const digitalTwin = await insertDigitalTwin(digitalTwinUpdated);

	const digitalTwinTopicSensorQueries: any[] = [];
	for (const topicSensor of topicSensors) {
		const topicType = topicSensor.topicType;
		const digitalTwinTopicSensorQuery = createDigitalTwinTopic(digitalTwin.id, topicSensor.id, topicType)
		digitalTwinTopicSensorQueries.push(digitalTwinTopicSensorQuery);
	}
	await Promise.all(digitalTwinTopicSensorQueries);

	const digitalTwinDeviceQueries: any[] = [];
	for (const device of devices) {
		const deviceId = device.id;
		const deviceIndex = digitalTwinInput.devicesRef.findIndex(deviceMap => deviceMap.deviceId === deviceId);
		const deviceRef = digitalTwinInput.devicesRef[deviceIndex].deviceRef;
		const alreadyCreated = digitalTwinInput.devicesRef[deviceIndex].deviceId !== 0;
		const digitalTwinDeviceQuery = createDigitalTwinDevice(digitalTwin.id, deviceId, deviceRef, alreadyCreated)
		digitalTwinDeviceQueries.push(digitalTwinDeviceQuery);
	}
	await Promise.all(digitalTwinDeviceQueries);

	const digitalTwinSensorQueries: any[] = [];
	for (const sensor of sensors) {
		const sensorId = sensor.id;
		const topicId = sensor.topicId;
		const sensorIndex = digitalTwinInput.sensorsRef.findIndex(sensorMap => sensorMap.sensorId === sensorId);
		const sensorRef = digitalTwinInput.sensorsRef[sensorIndex].sensorRef;
		const alreadyCreated = digitalTwinInput.sensorsRef[sensorIndex].sensorId !== 0;
		const digitalTwinSensorQuery = createDigitalTwinSensor(digitalTwin.id, sensorId, sensorRef, topicId, alreadyCreated)
		digitalTwinSensorQueries.push(digitalTwinSensorQuery);
	}
	await Promise.all(digitalTwinSensorQueries);

	const digitalTwinSensorDashboardQueries: any[] = [];
	for (let i = 0; i < sensors.length; i++) {
		const sensorId = sensors[i].id;
		const sensorDashboardId = sensorDashboarsId[i];
		const digitalTwinSensorDashboardQuery = createDigitalTwinSensorDashboard(
			digitalTwin.id,
			sensorId,
			sensorDashboardId
		)
		digitalTwinSensorDashboardQueries.push(digitalTwinSensorDashboardQuery);
	}
	await Promise.all(digitalTwinSensorDashboardQueries);

	if (digitalTwinInput.type === "Gltf 3D model") {
		const sim2dtmTopicData =
		{
			topicType: "sim2dtm",
			description: `sim2dtm for DT_${digitalTwinUid}`,
			mqttAccessControl: "Pub & Sub"
		};
		const sim2dtmTopic = await createTopic(0, sim2dtmTopicData);
		await createDigitalTwinTopic(digitalTwin.id, sim2dtmTopic.id, "sim2dtm");

		const dtm2simTopicData =
		{
			topicType: "dtm2sim",
			topicName: `${digitalTwinUid}_dtm2sim`,
			description: `DTM to simulator for ${digitalTwinUid}`,
			mqttAccessControl: "Pub & Sub"
		};
		const dtm2simTopic = await createTopic(0, dtm2simTopicData);
		await createDigitalTwinTopic(digitalTwin.id, dtm2simTopic.id, "dtm2sim");

		const dtm2pdbTopicData =
		{
			topicType: "dtm2pdb",
			topicName: `${digitalTwinUid}_dtm2pdb`,
			description: `DTM to platform db for ${digitalTwinUid}`,
			mqttAccessControl: "Pub & Sub"
		};
		const dtm2pdbTopic = await createTopic(0, dtm2pdbTopicData);
		await createDigitalTwinTopic(digitalTwin.id, dtm2pdbTopic.id, "dtm2pdb");

		let devIndex = 0;
		for (const device of devices) {
			devIndex++;
			const dev2dtmTopicData =
			{
				topicType: `dev2dtm_${devIndex}`,
				description: `dev2dtm_${devIndex} for DT_${digitalTwinUid}`,
				mqttAccessControl: "Pub & Sub"
			};
			const dev2dtmTopic = await createTopic(device.id, dev2dtmTopicData);
			await createDigitalTwinTopic(digitalTwin.id, dev2dtmTopic.id, `dev2dtm_${devIndex}`);

			const dtm2devTopicData =
			{
				topicType: `dtm2dev_${devIndex}`,
				description: `dtm2dev_${devIndex} for DT_${digitalTwinUid}`,
				mqttAccessControl: "Pub & Sub"
			};
			const dtm2devTopic = await createTopic(device.id, dtm2devTopicData);
			await createDigitalTwinTopic(digitalTwin.id, dtm2devTopic.id, `dtm2dev_${devIndex}`);

			const dev2simTopicData =
			{
				topicType: `dev2sim_${devIndex}`,
				description: `dev2sim_${devIndex} for DT_${digitalTwinUid}`,
				mqttAccessControl: "Pub & Sub"
			};
			const dev2simTopic = await createTopic(device.id, dev2simTopicData);
			await createDigitalTwinTopic(digitalTwin.id, dev2simTopic.id, `dev2sim_${devIndex}`);
		}
	}

	return { digitalTwin, topicSensors };
};

export const getDigitalTwinByProp = async (propName: string, propValue: (string | number)): Promise<IDigitalTwin> => {
	const response = await pool.query(`SELECT grafanadb.digital_twin.id, grafanadb.device.org_id AS "orgId",
									grafanadb.device.group_id AS "groupId", grafanadb.digital_twin.device_id AS "deviceId",
									grafanadb.digital_twin.digital_twin_uid AS "digitalTwinUid", grafanadb.digital_twin.description,
									grafanadb.digital_twin.type, grafanadb.digital_twin.max_num_resfem_files AS "maxNumResFemFiles",
									grafanadb.digital_twin.dashboard_id AS "dashboardId",
									grafanadb.digital_twin.digital_twin_simulation_format AS "digitalTwinSimulationFormat",
									grafanadb.digital_twin.created, grafanadb.digital_twin.updated
									FROM grafanadb.digital_twin
									INNER JOIN grafanadb.device ON grafanadb.digital_twin.device_id = grafanadb.device.id
									WHERE grafanadb.digital_twin.${propName} = $1`, [propValue]);
	return response.rows[0] as IDigitalTwin;
}

export const getGltfFileData = async (digitalTwin: IDigitalTwin): Promise<IGltfFileData> => {
	const orgId = digitalTwin.orgId;
	const groupId = digitalTwin.groupId;
	const digitalTwinId = digitalTwin.id;
	const keyBase = `org_${orgId}/group_${groupId}/digitalTwin_${digitalTwinId}`;
	const gltfFileFolder = `${keyBase}/gltfFile`;
	const gltfFileList = await getBucketFolderFileList(gltfFileFolder);
	let gltfFileName = "";

	let gltfFileData = '{}';
	if (gltfFileList.length !== 0) {
		gltfFileName = gltfFileList[0];
		const bucketParamsGltfFile = {
			Bucket: process_env.S3_BUCKET_NAME,
			Key: gltfFileName
		};
		const data = await s3Client.send(new GetObjectCommand(bucketParamsGltfFile));
		gltfFileData = await data.Body.transformToString();
	}

	return { gltfFileName, gltfFileData };
}

export const getDigitalTwinGltfData = async (digitalTwin: IDigitalTwin): Promise<IDigitalTwinGltfData> => {
	const orgId = digitalTwin.orgId;
	const groupId = digitalTwin.groupId;
	const digitalTwinId = digitalTwin.id;
	const keyBase = `org_${orgId}/group_${groupId}/digitalTwin_${digitalTwinId}`;
	const gltfFileFolder = `${keyBase}/gltfFile`;
	const gltfFileList = await getBucketFolderFileList(gltfFileFolder);

	let gltfFileData = '{}';
	if (gltfFileList.length !== 0) {
		const bucketParamsGltfFile = {
			Bucket: process_env.S3_BUCKET_NAME,
			Key: gltfFileList[0]
		};
		const data = await s3Client.send(new GetObjectCommand(bucketParamsGltfFile));
		gltfFileData = await data.Body.transformToString();
	}

	const mqttTopicsData = await getMqttTopicsData(digitalTwinId);

	const gltfData = {
		id: digitalTwinId,
		gltfData: gltfFileData,
		digitalTwinSimulationFormat: digitalTwin.digitalTwinSimulationFormat,
		mqttTopicsData
	}

	return gltfData;
}

export const getAllDigitalTwins = async (): Promise<IDigitalTwin[]> => {
	const response = await pool.query(`SELECT grafanadb.digital_twin.id, grafanadb.group.org_id AS "orgId",
										grafanadb.digital_twin.group_id AS "groupId", grafanadb.digital_twin.asset_id AS "assetId",
										grafanadb.digital_twin.digital_twin_uid AS "digitalTwinUid",
										grafanadb.digital_twin.scope, grafanadb.digital_twin.description,
										grafanadb.digital_twin.type, grafanadb.digital_twin.max_num_resfem_files AS "maxNumResFemFiles",
										grafanadb.digital_twin.dashboard_id AS "dashboardId",
										grafanadb.digital_twin.digital_twin_simulation_format AS "digitalTwinSimulationFormat",
										grafanadb.digital_twin.created, grafanadb.digital_twin.updated
										FROM grafanadb.digital_twin
										INNER JOIN grafanadb.group ON grafanadb.digital_twin.group_id = grafanadb.group.id
										ORDER BY grafanadb.digital_twin.id ASC,
											grafanadb.group.org_id ASC,
											grafanadb.digital_twin.group_id ASC,
											grafanadb.digital_twin.asset_id ASC;`);
	return response.rows as IDigitalTwin[];
}

export const getAllDigitalTwinSimulators = async (): Promise<IDigitalTwinSimulator[]> => {
	const response = await pool.query(`SELECT grafanadb.digital_twin.id, grafanadb.group.org_id AS "orgId",
						grafanadb.device.group_id AS "groupId", grafanadb.digital_twin.asset_id AS "assetId",
						grafanadb.digital_twin.digital_twin_uid AS "digitalTwinUid", grafanadb.digital_twin.description,
						grafanadb.digital_twin.digital_twin_simulation_format AS "digitalTwinSimulationFormat",
						grafanadb.digital_twin_topic.topic_id AS "sensorSimulationTopicId"
						FROM grafanadb.digital_twin
						INNER JOIN grafanadb.group ON grafanadb.digital_twin.group_id = grafanadb.group.id
						INNER JOIN grafanadb.digital_twin_topic ON
							grafanadb.digital_twin_topic.digital_twin_id = grafanadb.digital_twin.id
						WHERE  grafanadb.digital_twin.type = $1 AND
						grafanadb.digital_twin.digital_twin_simulation_format != '{}'::jsonb AND
						grafanadb.digital_twin_topic.topic_type = $2
						ORDER BY grafanadb.group.org_id ASC,
							grafanadb.digital_twin.group_id ASC,
							grafanadb.digital_twin.asset_id ASC,
							grafanadb.digital_twin.id ASC;`, ["Gltf 3D model", "sim2dtm"]);
	return response.rows as IDigitalTwinSimulator[];
}

export const getStateOfAllDigitalTwins = async (): Promise<IDigitalTwinState[]> => {
	const response = await pool.query(`SELECT grafanadb.digital_twin.id AS "digitalTwinId", grafanadb.group.org_id AS "orgId",
									grafanadb.digital_twin.group_id AS "groupId", grafanadb.digital_twin.asset_id AS "assetId",
									grafanadb.alert.state
									FROM grafanadb.digital_twin
									INNER JOIN grafanadb.group ON grafanadb.digital_twin.group_id = grafanadb.group.id
									INNER JOIN grafanadb.alert ON grafanadb.digital_twin.dashboard_id = grafanadb.alert.dashboard_id
									ORDER BY grafanadb.group.org_id ASC,
											grafanadb.digital_twin.group_id ASC,
											grafanadb.digital_twin.asset_id ASC,
											grafanadb.digital_twin.id ASC;`);
	return response.rows as IDigitalTwinState[];
}

export const getNumDigitalTwins = async (): Promise<number> => {
	const result = await pool.query(`SELECT COUNT(*) FROM grafanadb.digital_twin;`);
	return parseInt(result.rows[0].count, 10);
}

export const getNumDigitalTwinsByAssetId = async (assetId: number): Promise<number> => {
	const result = await pool.query(`SELECT COUNT(*) FROM grafanadb.digital_twin
									WHERE grafanadb.digital_twin.assetId = $1`, [assetId]);
	return parseInt(result.rows[0].count, 10);
}


export const getDigitalTwinsByGroupId = async (groupId: number): Promise<IDigitalTwin[]> => {
	const response = await pool.query(`SELECT grafanadb.digital_twin.id, grafanadb.group.org_id AS "orgId",
										grafanadb.digital_twin.group_id AS "groupId", grafanadb.digital_twin.asset_id AS "assetId",
										grafanadb.digital_twin.digital_twin_uid AS "digitalTwinUid",
										grafanadb.digital_twin.scope, grafanadb.digital_twin.description,
										grafanadb.digital_twin.type, grafanadb.digital_twin.max_num_resfem_files AS "maxNumResFemFiles",
										grafanadb.digital_twin.dashboard_id AS "dashboardId",
										grafanadb.digital_twin.digital_twin_simulation_format AS "digitalTwinSimulationFormat",
										grafanadb.digital_twin.created, grafanadb.digital_twin.updated
										FROM grafanadb.digital_twin
										INNER JOIN grafanadb.group ON grafanadb.digital_twin.group_id = grafanadb.group.id
										WHERE grafanadb.digital_twin.group_id = $1
										ORDER BY grafanadb.digital_twin.id ASC,
										grafanadb.group.org_id ASC,
										grafanadb.digital_twin.group_id ASC,
										grafanadb.digital_twin.asset_id ASC;`, [groupId]);
	return response.rows as IDigitalTwin[];
};

export const getDigitalTwinsByGroupsIdArray = async (groupsIdArray: number[]): Promise<IDigitalTwin[]> => {
	const response = await pool.query(`SELECT grafanadb.digital_twin.id, grafanadb.group.org_id AS "orgId",
									grafanadb.digital_twin.group_id AS "groupId", grafanadb.digital_twin.asset_id AS "assetId",
									grafanadb.digital_twin.digital_twin_uid AS "digitalTwinUid",
									grafanadb.digital_twin.scope, grafanadb.digital_twin.description,
									grafanadb.digital_twin.type, grafanadb.digital_twin.max_num_resfem_files AS "maxNumResFemFiles",
									grafanadb.digital_twin.dashboard_id AS "dashboardId",
									grafanadb.digital_twin.digital_twin_simulation_format AS "digitalTwinSimulationFormat",
									grafanadb.digital_twin.created, grafanadb.digital_twin.updated
									FROM grafanadb.digital_twin
									INNER JOIN grafanadb.group ON grafanadb.digital_twin.group_id = grafanadb.group.id
									WHERE grafanadb.asset.group_id = ANY($1::bigint[])
									ORDER BY grafanadb.digital_twin.id ASC,
										grafanadb.group.org_id ASC,
										grafanadb.digital_twin.group_id ASC,
										grafanadb.digital_twin.asset_id ASC;`, [groupsIdArray]);
	return response.rows as IDigitalTwin[];
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
							grafanadb.digital_twin.id ASC;`, [groupsIdArray, "Gltf 3D model", "sim2dtm"]);
	return response.rows as IDigitalTwinSimulator[];
}

export const getStateOfDigitalTwinsByGroupsIdArray = async (groupsIdArray: number[]): Promise<IDigitalTwinState[]> => {
	const response = await pool.query(`SELECT grafanadb.digital_twin.id AS "digitalTwinId", grafanadb.group.org_id AS "orgId",
									grafanadb.digital_twin.group_id AS "groupId", grafanadb.digital_twin.asset_id AS "assetId",
									grafanadb.alert.state
									FROM grafanadb.digital_twin
									INNER JOIN grafanadb.group ON grafanadb.digital_twin.group_id = grafanadb.group.id
									INNER JOIN grafanadb.alert ON grafanadb.digital_twin.dashboard_id = grafanadb.alert.dashboard_idd
									WHERE grafanadb.digital_twin.group_id = ANY($1::bigint[])
									ORDER BY grafanadb.group.org_id ASC,
											grafanadb.digital_twin.group_id ASC,
											grafanadb.digital_twin.asset_id ASC,
											grafanadb.digital_twin.id ASC;`, [groupsIdArray]);
	return response.rows as IDigitalTwinState[];
};



export const getNumDigitalTwinsByGroupsIdArray = async (groupsIdArray: number[]): Promise<number> => {
	const result = await pool.query(`SELECT COUNT(*) FROM grafanadb.digital_twin
									WHERE grafanadb.digital_twin.group_id = ANY($1::bigint[])`, [groupsIdArray]);
	return parseInt(result.rows[0].count, 10);
}

export const getDigitalTwinsByOrgId = async (orgId: number): Promise<IDigitalTwin[]> => {
	const response = await pool.query(`SELECT grafanadb.digital_twin.id, grafanadb.group.org_id AS "orgId",
									grafanadb.digital_twin.group_id AS "groupId", grafanadb.digital_twin.asset_id AS "assetId",
									grafanadb.digital_twin.digital_twin_uid AS "digitalTwinUid",
									grafanadb.digital_twin.scope, grafanadb.digital_twin.description,
									grafanadb.digital_twin.type, grafanadb.digital_twin.max_num_resfem_files AS "maxNumResFemFiles",
									grafanadb.digital_twin.dashboard_id AS "dashboardId",
									grafanadb.digital_twin.digital_twin_simulation_format AS "digitalTwinSimulationFormat",
									grafanadb.digital_twin.created, grafanadb.digital_twin.updated
									FROM grafanadb.digital_twin
									INNER JOIN grafanadb.group ON grafanadb.digital_twin.group_id = grafanadb.group.id
									WHERE grafanadb.group.org_id = $1
									ORDER BY grafanadb.digital_twin.id ASC,
										grafanadb.group.org_id ASC,
										grafanadb.digital_twin.group_id ASC,
										grafanadb.digital_twin.asset_id ASC;`, [orgId]);
	return response.rows as IDigitalTwin[];
};

export const getMqttTopicsData = async (digitalTwinId: number): Promise<IMqttTopicDataShort[]> => {
	const topicsData = await getMqttTopicsDataFromDigitalTwinData(digitalTwinId);
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
	return mqttTopicsData;
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
		const dashboardsUrl = generateDashboardsUrl([dashboardInformation])
		digitalTwin.dashboardUrl = dashboardsUrl[0];
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

export const generateDashboardsUrl = (dashboardsInfo: IDashboardInfo[]): string[] => {
	const domainNameUrl = getDomainUrl();
	const dashboarsdUrl: string[] = [];
	for (const dashboardInfo of dashboardsInfo) {
		if (dashboardInfo.slug === "Inexistent") {
			const dashboardUrl = `Warning: Dashboard with id: ${dashboardInfo.dashboardId} not exists any more`;
			dashboarsdUrl.push(dashboardUrl);
		} else {
			const dashboardUrl = `${domainNameUrl}/grafana/d/${dashboardInfo.uid}/${dashboardInfo.slug}`;
			dashboarsdUrl.push(dashboardUrl);
		}
	}
	return dashboarsdUrl;
}

const getBucketFolderFileList = async (folderPath: string): Promise<string[]> => {
	const bucketParams = {
		Bucket: process_env.S3_BUCKET_NAME,
		Prefix: folderPath,
	};

	let fileList: string[] = [];
	const data = await s3Client.send(new ListObjectsV2Command(bucketParams));
	if (data.KeyCount !== 0) {
		fileList = data.Contents.map(fileData => fileData.Key);
	}
	return fileList;
}

export interface IBucketFileInfoList {
	fileName: string;
	lastModified: string
}

export const getBucketFolderInfoFileList = async (folderPath: string): Promise<IBucketFileInfoList[]> => {
	const bucketParams = {
		Bucket: process_env.S3_BUCKET_NAME,
		Prefix: folderPath,
	};
	const data = await s3Client.send(new ListObjectsV2Command(bucketParams));
	let fileInfoList: IBucketFileInfoList[] = [];
	if (data.KeyCount !== 0 && data.Contents.length !== 0) {
		fileInfoList = data.Contents.map(fileinfo => {
			const fileData = {
				fileName: fileinfo.Key,
				lastModified: fileinfo.LastModified.toString()
			}
			return fileData;
		});

		fileInfoList.sort((a, b) => {
			const c = new Date(a.lastModified).getTime();
			const d = new Date(b.lastModified).getTime();
			return d - c;
		});
	}
	return fileInfoList;
}

export const checkMaxNumberOfFemResFiles = async (digitalTwin: IDigitalTwin) => {
	const orgId = digitalTwin.orgId;
	const groupId = digitalTwin.groupId;
	const digitalTwinId = digitalTwin.id;
	const maxNumResFemFiles = digitalTwin.maxNumResFemFiles;
	const keyBase = `org_${orgId}/group_${groupId}/digitalTwin_${digitalTwinId}`;
	const folderPath = `${keyBase}/femResFiles`

	const femResFileInfoList = await getBucketFolderInfoFileList(folderPath);
	if (femResFileInfoList.length > maxNumResFemFiles) {
		const femResFileInfoListFiltered = femResFileInfoList.slice(maxNumResFemFiles);
		const femResFileKeysToRemove = femResFileInfoListFiltered.map(file => file.fileName);
		await deleteBucketFiles(femResFileKeysToRemove);
	}
}

export const checkNumberOfGltfFiles = async (digitalTwin: IDigitalTwin) => {
	const orgId = digitalTwin.orgId;
	const groupId = digitalTwin.groupId;
	const digitalTwinId = digitalTwin.id;
	const keyBase = `org_${orgId}/group_${groupId}/digitalTwin_${digitalTwinId}`;
	const folderPath = `${keyBase}/gltfFile`

	const gltfFileInfoList = await getBucketFolderInfoFileList(folderPath);
	if (gltfFileInfoList.length > 1) {
		const gltfFileInfoListFiltered = gltfFileInfoList.slice(1);
		const gltfFileKeysToRemove = gltfFileInfoListFiltered.map(file => file.fileName);
		await deleteBucketFiles(gltfFileKeysToRemove);
	}
}


export const deleteBucketFile = async (fileKey: string) => {
	const bucketParams = {
		Bucket: process_env.S3_BUCKET_NAME,
		Key: fileKey,
	};
	await s3Client.send(new DeleteObjectCommand(bucketParams));
}

export const deleteBucketFiles = async (filesToRemove: string[]) => {
	const fileKeys = filesToRemove.map(file => {
		const key = file;
		return { Key: key }
	});
	const bucketParams = {
		Bucket: process_env.S3_BUCKET_NAME,
		Delete: {
			Objects: fileKeys
		}
	};
	await s3Client.send(new DeleteObjectsCommand(bucketParams));
}

export const removeFilesFromBucketFolder = async (folderPath: string) => {
	const filesToRemove = await getBucketFolderFileList(folderPath);
	if (filesToRemove.length !== 0) {
		await deleteBucketFiles(filesToRemove);
	}
}





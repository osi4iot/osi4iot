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
import IDigitalTwinGltfData, { IMqttTopicData, IMqttTopicDataShort } from "./digitalTwinGltfData.interface";
import { getLastMeasurement } from "../mesurement/measurementDAL";
import IMeasurement from "../mesurement/measurement.interface";
import IDigitalTwinSimulator from "./digitalTwinSimulator.interface";
import IDigitalTwinTopic from "./digitalTwinTopic.interface";
import IDevice from "../device/device.interface";
import { createDashboard, deleteDashboard } from "../group/dashboardDAL";
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


export interface IMeshNode {
	name?: string;
	mesh?: number;
	extras: {
		animationType: string;
		topicType: string;
		type: string;
		clipTopicType: string;
	};
}

const getTopicSensorTypesFromDigitalTwin = (type: string, gltfFileData: any): string[] => {
	const topicTypes: string[] = [];
	if (type === "Gltf 3D model") {
		if (typeof gltfFileData === "string") gltfFileData = JSON.parse(gltfFileData);
		if (Object.keys(gltfFileData).length && gltfFileData.nodes?.length !== 0) {
			const meshNodes: IMeshNode[] = [];
			gltfFileData.nodes.forEach((node: IMeshNode) => {
				// node.mesh are not included for taking into account root nodes
				if (node.extras !== undefined) meshNodes.push(node);
			})

			meshNodes.forEach((node: IMeshNode) => {
				if (node.extras?.type !== undefined && node.extras?.type === "sensor") {
					const topicType = node.extras?.topicType;
					if (topicType && topicTypes.findIndex(topicTypei => topicTypei === topicType) === -1) {
						topicTypes.push(topicType)
					}
				}
				if (node.extras?.clipTopicType !== undefined) {
					const topicType = node.extras?.clipTopicType;
					if (topicTypes.findIndex(topicTypei => topicTypei === topicType) === -1) {
						topicTypes.push(topicType);
					}
				}
			})
		}

	} else if (type === "Grafana dashboard") {
		topicTypes.push("dev2pdb_1");
	}

	return topicTypes;
}

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

export const verifyAndCorrectDigitalTwinTopics = async (
	digitalTwinUpdate: IDigitalTwin,
	device: IDevice): Promise<IDigitalTwin> => {
	const { gltfFileName, gltfFileData } = await getGltfFileData(digitalTwinUpdate);
	const topicSensorTypes = getTopicSensorTypesFromDigitalTwin(digitalTwinUpdate.type, gltfFileData);
	const topicTypes: string[] = [];
	topicTypes.push(...topicSensorTypes);
	if (digitalTwinUpdate.type === "Gltf 3D model") {
		topicTypes.push(
			"dev2dtm",
			"dtm2dev",
			"dev2sim",
			"dtm2sim",
			"sim2dtm",
			"dtm2pdb"
		);
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


		if (topicTypesToAdd.indexOf("dev2dtm") !== -1) {
			const dev2dtmTopicData =
			{
				topicType: "dev2dtm",
				topicName: `${digitalTwinUid}_dev2dtm`,
				description: `Device to DTM for ${digitalTwinUid}`,
				payloadFormat: generateSensorSimulationTopicPayload(digitalTwinUpdate.digitalTwinSimulationFormat),
				mqttAccessControl: "Pub & Sub"
			};
			const dev2dtmTopic = await createTopic(deviceId, dev2dtmTopicData);
			await createDigitalTwinTopic(digitalTwinUpdate.id, dev2dtmTopic.id, "dev2dtm");
		}

		if (topicTypesToAdd.indexOf("dtm2dev") !== -1) {
			const dtm2devTopicData =
			{
				topicType: "dtm2dev",
				topicName: `${digitalTwinUid}_dtm2dev`,
				description: `DTM to device for ${digitalTwinUid}`,
				payloadFormat: '{"param1": "number", "param2": "number[]"}',
				mqttAccessControl: "Pub & Sub"
			};
			const dtm2devTopic = await createTopic(deviceId, dtm2devTopicData);
			await createDigitalTwinTopic(digitalTwinUpdate.id, dtm2devTopic.id, "dtm2dev");
		}

		if (topicTypesToAdd.indexOf("dev2sim") !== -1) {
			const dev2simTopicData =
			{
				topicType: "dev2sim",
				topicName: `${digitalTwinUid}_dev2sim`,
				description: `Device to simulator for ${digitalTwinUid}`,
				payloadFormat: '{"param1": "number", "param2": "number[]"}',
				mqttAccessControl: "Pub & Sub"
			};
			const dev2simTopic = await createTopic(deviceId, dev2simTopicData);
			await createDigitalTwinTopic(digitalTwinUpdate.id, dev2simTopic.id, "dev2sim");
		}

		if (topicTypesToAdd.indexOf("dtm2sim") !== -1) {
			const dtm2simTopicData =
			{
				topicType: "dtm2sim",
				topicName: `${digitalTwinUid}_dtm2sim`,
				description: `DTM to simulator for ${digitalTwinUid}`,
				payloadFormat: '{"customAnimation": "Object", "endlessTimeFactor": "Object", "objectOnOff": "Object", "newFemResFile": "string","femResultsModalValues": "number[][][]", "assetPartsState": "number[]" }',
				mqttAccessControl: "Pub & Sub"
			};
			const dtm2simTopic = await createTopic(deviceId, dtm2simTopicData);
			await createDigitalTwinTopic(digitalTwinUpdate.id, dtm2simTopic.id, "dtm2sim");
		}

		if (topicTypesToAdd.indexOf("sim2dtm") !== -1) {
			const sim2dtmTopicData =
			{
				topicType: "sim2dtm",
				topicName: `${digitalTwinUid}_sim2dtm`,
				description: `Simulator to DTM for ${digitalTwinUid}`,
				payloadFormat: '{"param1": "number", "param2": "number[]"}',
				mqttAccessControl: "Pub & Sub"
			};
			const sim2dtmTopic = await createTopic(deviceId, sim2dtmTopicData);
			await createDigitalTwinTopic(digitalTwinUpdate.id, sim2dtmTopic.id, "sim2dtm")
		}

		if (topicTypesToAdd.indexOf("dtm2pdb") !== -1) {
			const dtm2pdbTopicData =
			{
				topicType: "dtm2pdb",
				topicName: `${digitalTwinUid}_dtm2pdb`,
				description: `DTM to platform db for ${digitalTwinUid}`,
				payloadFormat: '{"param1": "number", "param2": "number[]"}',
				mqttAccessControl: "Pub & Sub"
			};
			const dtm2pdbTopic = await createTopic(deviceId, dtm2pdbTopicData);
			await createDigitalTwinTopic(digitalTwinUpdate.id, dtm2pdbTopic.id, "dtm2pdb");
		}
	}

	const digitalTwinUpdated: IDigitalTwin = { ...digitalTwinUpdate, deviceId: device.id, dashboardId: digitalTwinUpdate.dashboardId };
	const sensorTopics = await getSensorTopicsOfDTByDigitalTwinId(digitalTwinUpdated.id);
	if (digitalTwinUpdated.type === "Gltf 3D model") {
		await updatedTopicSensorIdsFromDigitalTwinGltfData(gltfFileName, gltfFileData, sensorTopics);
		await checkMaxNumberOfFemResFiles(digitalTwinUpdate);
	}
	return digitalTwinUpdated;
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

export const insertDigitalTwin = async (digitalTwinData: Partial<IDigitalTwin>): Promise<IDigitalTwin> => {
	const result = await pool.query(`INSERT INTO grafanadb.digital_twin (device_id,
					digital_twin_uid, description, type, dashboard_id, max_num_resfem_files,
					digital_twin_simulation_format, created, updated)
					VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
					RETURNING  id, device_id AS "deviceId", digital_twin_uid AS "digitalTwinUid", description,
					type, dashboard_id AS "dashboardId",
					digital_twin_simulation_format AS "digitalTwinSimulationFormat",
					created, updated`,
	[
		digitalTwinData.deviceId,
		digitalTwinData.digitalTwinUid,
		digitalTwinData.description,
		digitalTwinData.type,
		digitalTwinData.dashboardId,
		digitalTwinData.maxNumResFemFiles,
		digitalTwinData.digitalTwinSimulationFormat
	]);
	return result.rows[0] as IDigitalTwin;
};

export const createDigitalTwinTopic = async (digitalTwinId: number, topicId: number, topicType: string): Promise<IDigitalTwinTopic> => {
	const result = await pool.query(`INSERT INTO grafanadb.digital_twin_topic (digital_twin_id, topic_id, topic_type, created, updated)
		VALUES ($1, $2, $3, NOW(), NOW())
		RETURNING  digital_twin_id AS "digitalTwinId", topic_id AS "topicId", topic_type AS "topicType", created, updated`,
	[digitalTwinId, topicId, topicType]);
	return result.rows[0] as IDigitalTwinTopic;
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
	return response.rows as IDigitalTwinTopic[];
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
	device: IDevice,
	digitalTwinInput: CreateDigitalTwinDto,
	dashboardId: number | null = null,
	alreadyCreatedTopic: ITopic | null = null
): Promise<ICreateDigitalTwin> => {
	const deviceId = device.id;
	const digitalTwinUid = digitalTwinInput.digitalTwinUid;

	let topicSensors: ITopic[] = [];
	if (!alreadyCreatedTopic) {
		const topicSensorTypes = digitalTwinInput.topicSensorTypes;
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
		const dashboardTitle = `${digitalTwinUid} dashboard`;
		const deviceUid = device.deviceUid;
		const topicUid = topicSensors[0]?.topicUid;
		digitalTwinDashboardId = await createDashboard(group, deviceUid, topicUid, dashboardTitle);
	}

	const digitalTwinUpdated: Partial<IDigitalTwin> = { ...digitalTwinInput, deviceId, dashboardId: digitalTwinDashboardId };
	const digitalTwin = await insertDigitalTwin(digitalTwinUpdated);

	if (alreadyCreatedTopic) {
		const topicType = digitalTwinInput.topicSensorTypes[0];
		await createDigitalTwinTopic(digitalTwin.id, topicSensors[0].id, topicType)
	} else {
		const digitalTwinTopicSensorQueries: any[] = [];
		for (const topicSensor of topicSensors) {
			const index = topicSensor.topicName.split("_")[3];
			const topicType = `dev2pdb_${index}`;
			const digitalTwinTopicSensorQuery = createDigitalTwinTopic(digitalTwin.id, topicSensor.id, topicType)
			digitalTwinTopicSensorQueries.push(digitalTwinTopicSensorQuery);
		}
		await Promise.all(digitalTwinTopicSensorQueries);
	}


	if (digitalTwinInput.type === "Gltf 3D model") {
		const sim2dtmTopicData =
		{
			topicType: "sim2dtm",
			topicName: `${digitalTwinUid}_sim2dtm`,
			description: `Simulator to DTM for ${digitalTwinUid}`,
			payloadFormat: generateSensorSimulationTopicPayload(digitalTwinInput.digitalTwinSimulationFormat),
			mqttAccessControl: "Pub & Sub"
		};
		const sim2dtmTopic = await createTopic(deviceId, sim2dtmTopicData);
		await createDigitalTwinTopic(digitalTwin.id, sim2dtmTopic.id, "sim2dtm");

		const dev2dtmTopicData =
		{
			topicType: "dev2dtm",
			topicName: `${digitalTwinUid}_dev2dtm`,
			description: `Device to DTM for ${digitalTwinUid}`,
			payloadFormat: '{"param1": "number", "param2": "number[]"}',
			mqttAccessControl: "Pub & Sub"
		};
		const dev2dtmTopic = await createTopic(deviceId, dev2dtmTopicData);
		await createDigitalTwinTopic(digitalTwin.id, dev2dtmTopic.id, "dev2dtm");

		const dtm2devTopicData =
		{
			topicType: "dtm2dev",
			topicName: `${digitalTwinUid}_dtm2dev`,
			description: `DTM to device for ${digitalTwinUid}`,
			payloadFormat: '{"param1": "number", "param2": "number[]"}',
			mqttAccessControl: "Pub & Sub"
		};
		const dtm2devTopic = await createTopic(deviceId, dtm2devTopicData);
		await createDigitalTwinTopic(digitalTwin.id, dtm2devTopic.id, "dtm2dev");

		const dev2simTopicData =
		{
			topicType: "dev2sim",
			topicName: `${digitalTwinUid}_dev2sim`,
			description: `Device to simulator for ${digitalTwinUid}`,
			payloadFormat: '{"param1": "number", "param2": "number[]"}',
			mqttAccessControl: "Pub & Sub"
		};
		const dev2simTopic = await createTopic(deviceId, dev2simTopicData);
		await createDigitalTwinTopic(digitalTwin.id, dev2simTopic.id, "dev2sim");

		const dtm2simTopicData =
		{
			topicType: "dtm2sim",
			topicName: `${digitalTwinUid}_dtm2sim`,
			description: `DTM to simulator for ${digitalTwinUid}`,
			payloadFormat: '{"customAnimation": "Object", "endlessTimeFactor": "Object", "objectOnOff": "Object", "newFemResFile": "string","femResultsModalValues": "number[][][]", "assetPartsState": "number[]" }',
			mqttAccessControl: "Pub & Sub"
		};
		const dtm2simTopic = await createTopic(deviceId, dtm2simTopicData);
		await createDigitalTwinTopic(digitalTwin.id, dtm2simTopic.id, "dtm2sim");

		const dtm2pdbTopicData =
		{
			topicType: "dtm2pdb",
			topicName: `${digitalTwinUid}_dtm2pdb`,
			description: `DTM to platform db for ${digitalTwinUid}`,
			payloadFormat: '{"param1": "number", "param2": "number[]"}',
			mqttAccessControl: "Pub & Sub"
		};
		const dtm2pdbTopic = await createTopic(deviceId, dtm2pdbTopicData);
		await createDigitalTwinTopic(digitalTwin.id, dtm2pdbTopic.id, "dtm2pdb");
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
	const deviceId = digitalTwin.deviceId;
	const digitalTwinId = digitalTwin.id;
	const keyBase = `org_${orgId}/group_${groupId}/device_${deviceId}/digitalTwin_${digitalTwinId}`;
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
	const deviceId = digitalTwin.deviceId;
	const digitalTwinId = digitalTwin.id;
	const keyBase = `org_${orgId}/group_${groupId}/device_${deviceId}/digitalTwin_${digitalTwinId}`;
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
	const response = await pool.query(`SELECT grafanadb.digital_twin.id, grafanadb.device.org_id AS "orgId",
									grafanadb.device.group_id AS "groupId", grafanadb.digital_twin.device_id AS "deviceId",
									grafanadb.digital_twin.digital_twin_uid AS "digitalTwinUid", grafanadb.digital_twin.description,
									grafanadb.digital_twin.type, grafanadb.digital_twin.max_num_resfem_files AS "maxNumResFemFiles",
									grafanadb.digital_twin.dashboard_id AS "dashboardId",
									grafanadb.digital_twin.digital_twin_simulation_format AS "digitalTwinSimulationFormat",
									grafanadb.digital_twin.created, grafanadb.digital_twin.updated
									FROM grafanadb.digital_twin
									INNER JOIN grafanadb.device ON grafanadb.digital_twin.device_id = grafanadb.device.id
									ORDER BY grafanadb.digital_twin.id ASC,
											grafanadb.device.org_id ASC,
											grafanadb.device.group_id ASC;`);
	return response.rows as IDigitalTwin[];
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
							grafanadb.digital_twin.id ASC;`, ["Gltf 3D model", "sim2dtm"]);
	return response.rows as IDigitalTwinSimulator[];
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
	return response.rows as IDigitalTwinState[];
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
									grafanadb.digital_twin.type, grafanadb.digital_twin.max_num_resfem_files AS "maxNumResFemFiles",
									grafanadb.digital_twin.dashboard_id AS "dashboardId",
									grafanadb.digital_twin.digital_twin_simulation_format AS "digitalTwinSimulationFormat",
									grafanadb.digital_twin.created, grafanadb.digital_twin.updated
									FROM grafanadb.digital_twin
									INNER JOIN grafanadb.device ON grafanadb.digital_twin.device_id = grafanadb.device.id
									WHERE grafanadb.device.group_id = $1
									ORDER BY grafanadb.digital_twin.id ASC,
										grafanadb.device.org_id ASC,
										grafanadb.device.group_id ASC;`, [groupId]);
	return response.rows as IDigitalTwin[];
};

export const getDigitalTwinsByGroupsIdArray = async (groupsIdArray: number[]): Promise<IDigitalTwin[]> => {
	const response = await pool.query(`SELECT grafanadb.digital_twin.id, grafanadb.device.org_id AS "orgId",
									grafanadb.device.group_id AS "groupId", grafanadb.digital_twin.device_id AS "deviceId",
									grafanadb.digital_twin.digital_twin_uid AS "digitalTwinUid", grafanadb.digital_twin.description,
									grafanadb.digital_twin.type, grafanadb.digital_twin.max_num_resfem_files AS "maxNumResFemFiles",
									grafanadb.digital_twin.dashboard_id AS "dashboardId",
									grafanadb.digital_twin.digital_twin_simulation_format AS "digitalTwinSimulationFormat",
									grafanadb.digital_twin.created, grafanadb.digital_twin.updated
									FROM grafanadb.digital_twin
									INNER JOIN grafanadb.device ON grafanadb.digital_twin.device_id = grafanadb.device.id
									WHERE grafanadb.device.group_id = ANY($1::bigint[])
									ORDER BY grafanadb.digital_twin.id ASC,
										grafanadb.device.org_id ASC,
										grafanadb.device.group_id ASC;`, [groupsIdArray]);
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
	return response.rows as IDigitalTwinState[];
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
									grafanadb.digital_twin.type, grafanadb.digital_twin.max_num_resfem_files AS "maxNumResFemFiles",
									grafanadb.digital_twin.dashboard_id AS "dashboardId",
									grafanadb.digital_twin.digital_twin_simulation_format AS "digitalTwinSimulationFormat",
									grafanadb.digital_twin.created, grafanadb.digital_twin.updated
									FROM grafanadb.digital_twin
									INNER JOIN grafanadb.device ON grafanadb.digital_twin.device_id = grafanadb.device.id
									WHERE grafanadb.device.org_id = $1
									ORDER BY grafanadb.digital_twin.id ASC,
										grafanadb.device.org_id ASC,
										grafanadb.device.group_id ASC`, [orgId]);
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

export const generateDashboardUrl = (dashboardInfo: IDashboardInfo): string => {
	const domainNameUrl = getDomainUrl();
	let dashboardUrl: string;
	if (dashboardInfo.slug === "Inexistent") {
		dashboardUrl = `Warning: Dashboard with id: ${dashboardInfo.dashboardId} not exists any more`;
	} else {
		dashboardUrl = `${domainNameUrl}/grafana/d/${dashboardInfo.uid}/${dashboardInfo.slug}`;
	}
	return dashboardUrl;
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
	if (data.KeyCount !== 0 &&  data.Contents.length !== 0) {
		fileInfoList = data.Contents.map(fileinfo => {
			const fileData = {
				fileName: fileinfo.Key,
				lastModified: fileinfo.LastModified.toString()
			}
			return fileData;
		});

		fileInfoList.sort((a, b) => {
			const c = new Date(a.lastModified).getTime() ;
			const d = new Date(b.lastModified).getTime() ;
			return d - c;
		});
	}
	return fileInfoList;
}

export const checkMaxNumberOfFemResFiles = async (digitalTwin: IDigitalTwin) => {
	const orgId = digitalTwin.orgId;
	const groupId = digitalTwin.groupId;
	const deviceId = digitalTwin.deviceId;
	const digitalTwinId = digitalTwin.id;
	const maxNumResFemFiles = digitalTwin.maxNumResFemFiles;
	const keyBase = `org_${orgId}/group_${groupId}/device_${deviceId}/digitalTwin_${digitalTwinId}`;
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
	const deviceId = digitalTwin.deviceId;
	const digitalTwinId = digitalTwin.id;
	const keyBase = `org_${orgId}/group_${groupId}/device_${deviceId}/digitalTwin_${digitalTwinId}`;
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





import { nanoid } from "nanoid";
import pool from "../../config/dbconfig";
import IDevice from "../device/device.interface";
import IGroup from "../group/interfaces/Group.interface";
import IMobileTopic from "./mobileTopic.interface";
import IMqttTopicInfo from "./mqttTopicInfo.interface";
import CreateTopicDto from './topic.dto';
import ITopic from "./topic.interface";
import ITopicInfoForMqttAcl from "./topicInfoForMqttAcl.interface";

export const demoTopicName = (group: IGroup, device: IDevice, sensorType: string): string => {
	let topicName: string;
	if (device.type === "Main master") {
		topicName = `${group.acronym.replace(/ /g, "_")}_main_master_${sensorType.replace(/ /g, "_")}`;
	} else if (device.type === "Generic") {
		topicName = `${group.acronym.replace(/ /g, "_")}_generic_default_${sensorType.replace(/ /g, "_")}`;
	}
	return topicName;
}


export const insertTopic = async (topicData: Partial<ITopic>): Promise<ITopic> => {
	const result = await pool.query(`INSERT INTO grafanadb.topic (device_id, topic_type,
					topic_name, description, payload_format, topic_uid, mqtt_action_allowed,
					created, updated)
					VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
					RETURNING  id, device_id AS "deviceId", topic_type AS "topicType",
					topic_name AS "topicName", description,
					payload_format AS "payloadFormat", topic_uid AS "topicUid",
					mqtt_action_allowed AS "mqttActionAllowed",
					created, updated`,
		[
			topicData.deviceId,
			topicData.topicType,
			topicData.topicName,
			topicData.description,
			topicData.payloadFormat,
			topicData.topicUid,
			topicData.mqttActionAllowed
		]);
	return result.rows[0];
};

export const updateTopicById = async (topicId: number, topic: ITopic): Promise<void> => {
	const query = `UPDATE grafanadb.topic SET topic_type = $1, topic_name = $2, description = $3,
					payload_format = $4, mqtt_action_allowed = $5, updated = NOW()
					WHERE grafanadb.topic.id = $6;`;
	const result = await pool.query(query, [
		topic.topicType,
		topic.topicName,
		topic.description,
		topic.payloadFormat,
		topic.mqttActionAllowed,
		topicId
	]);
};

export const changeTopicUidByUid = async (topic: ITopic): Promise<string> => {
	const oldTopicUid = topic.topicUid;
	const newTopicUid = nanoid(20).replace(/-/g, "x");
	await pool.query('UPDATE grafanadb.topic SET topic_uid = $1 WHERE topic_uid = $2',
		[newTopicUid, oldTopicUid]);
	return newTopicUid;
};

export const deleteTopicById = async (topicId: number): Promise<void> => {
	await pool.query(`DELETE FROM grafanadb.topic WHERE grafanadb.topic.id = $1`, [topicId]);
};

export const deleteTopicByIdsArray = async (topicIdsArray: number[]): Promise<void> => {
	await pool.query(`DELETE FROM grafanadb.topic WHERE grafanadb.topic.id = ANY($1::bigint[]);`, [topicIdsArray]);
};

export const createTopic = async (deviceId: number, topicInput: CreateTopicDto): Promise<ITopic> => {
	const topicUid = nanoid(20).replace(/-/g, "x");
	const topicUpdated: Partial<ITopic> = { ...topicInput, topicUid, deviceId };
	const topic = await insertTopic(topicUpdated);
	return topic;
};

export const getTopicByProp = async (propName: string, propValue: (string | number)): Promise<ITopic> => {
	const response = await pool.query(`SELECT grafanadb.topic.id, grafanadb.device.org_id AS "orgId",
                                    grafanadb.device.group_id AS "groupId", grafanadb.topic.device_id AS "deviceId",
									grafanadb.topic.topic_type AS "topicType",
	                                grafanadb.topic.topic_name AS "topicName",
									grafanadb.topic.description,
									grafanadb.topic.topic_uid AS "topicUid",
									grafanadb.topic.payload_format AS "payloadFormat",
									grafanadb.topic.mqtt_action_allowed AS "mqttActionAllowed",
									grafanadb.topic.created, grafanadb.topic.updated
									FROM grafanadb.topic
									INNER JOIN grafanadb.device ON grafanadb.topic.device_id = grafanadb.device.id
									WHERE grafanadb.topic.${propName} = $1`, [propValue]);
	return response.rows[0];
}

export const getSensorTopicsOfDTByDigitalTwinId = async (digitalTwinId: number): Promise<ITopic[]> => {
	const response = await pool.query(`SELECT grafanadb.topic.id, grafanadb.device.org_id AS "orgId",
                                    grafanadb.device.group_id AS "groupId", grafanadb.topic.device_id AS "deviceId",
									grafanadb.topic.topic_type AS "topicType",
	                                grafanadb.topic.topic_name AS "topicName",
									grafanadb.topic.description,
									grafanadb.topic.topic_uid AS "topicUid",
									grafanadb.topic.payload_format AS "payloadFormat",
									grafanadb.topic.mqtt_action_allowed AS "mqttActionAllowed",
									grafanadb.topic.created, grafanadb.topic.updated
									FROM grafanadb.topic
									INNER JOIN grafanadb.device ON grafanadb.topic.device_id = grafanadb.device.id
									INNER JOIN grafanadb.digital_twin_topic ON grafanadb.digital_twin_topic.topic_id = grafanadb.topic.id
									WHERE grafanadb.digital_twin_topic.digital_twin_id = $1`, [digitalTwinId]);
	return response.rows;
}

export const getAllTopics = async (): Promise<ITopic[]> => {
	const response = await pool.query(`SELECT grafanadb.topic.id, grafanadb.device.org_id AS "orgId",
									grafanadb.device.group_id AS "groupId", grafanadb.topic.device_id AS "deviceId",
									grafanadb.topic.topic_type AS "topicType",
									grafanadb.topic.topic_name AS "topicName",
									grafanadb.topic.description,
									grafanadb.topic.topic_uid AS "topicUid",
									grafanadb.topic.payload_format AS "payloadFormat",
									grafanadb.topic.mqtt_action_allowed AS "mqttActionAllowed",
									grafanadb.topic.created, grafanadb.topic.updated
									FROM grafanadb.topic
									INNER JOIN grafanadb.device ON grafanadb.topic.device_id = grafanadb.device.id
									ORDER BY grafanadb.device.org_id ASC,
											grafanadb.device.group_id ASC,
											grafanadb.topic.id  ASC;`);
	return response.rows;
}

export const getAllMobileTopics = async (): Promise<IMobileTopic[]> => {
	const response = await pool.query(`SELECT grafanadb.topic.id, grafanadb.org.acronym AS "orgAcronym",
									grafanadb.group.acronym AS "groupAcronym", grafanadb.device.name AS "deviceName",
									grafanadb.topic.topic_name AS "topicName",
									grafanadb.topic.topic_type AS "topicType",
									grafanadb.topic.description,
									grafanadb.group.group_uid AS "groupUid",
									grafanadb.device.device_uid AS "deviceUid",
									grafanadb.topic.topic_uid AS "topicUid",
									grafanadb.topic.payload_format AS "payloadFormat"
									FROM grafanadb.topic
									INNER JOIN grafanadb.device ON grafanadb.topic.device_id = grafanadb.device.id
									INNER JOIN grafanadb.org ON grafanadb.device.org_id = grafanadb.org.id
									INNER JOIN grafanadb.group ON grafanadb.device.group_id = grafanadb.group.id
									WHERE grafanadb.topic.payload_format::jsonb ? 'mobile_accelerations'
									OR grafanadb.topic.payload_format::jsonb ? 'mobile_photo'
									ORDER BY grafanadb.org.acronym ASC,
									        grafanadb.group.acronym ASC,
											grafanadb.device.name ASC,
											grafanadb.topic.topic_name ASC;`);
	return response.rows;
}


export const getNumTopics = async (): Promise<number> => {
	const result = await pool.query(`SELECT COUNT(*) FROM grafanadb.topic;`);
	return parseInt(result.rows[0].count, 10);
}


export const getTopicsByGroupId = async (groupId: number): Promise<ITopic[]> => {
	const response = await pool.query(`SELECT grafanadb.topic.id, grafanadb.device.org_id AS "orgId",
									grafanadb.device.group_id AS "groupId", grafanadb.topic.device_id AS "deviceId",
									grafanadb.topic.topic_type AS "topicType",
									grafanadb.topic.topic_name AS "topicName",
									grafanadb.topic.description,
									grafanadb.topic.topic_uid AS "topicUid",
									grafanadb.topic.payload_format AS "payloadFormat",
									grafanadb.topic.mqtt_action_allowed AS "mqttActionAllowed",
									grafanadb.topic.created, grafanadb.topic.updated
									FROM grafanadb.topic
									INNER JOIN grafanadb.device ON grafanadb.topic.device_id = grafanadb.device.id
									WHERE grafanadb.device.group_id = $1
									ORDER BY grafanadb.device.org_id ASC,
											grafanadb.device.group_id ASC,
											grafanadb.topic.id  ASC`, [groupId]);
	return response.rows;
};

export const getTopicsByGroupsIdArray = async (groupsIdArray: number[]): Promise<ITopic[]> => {
	const response = await pool.query(`SELECT grafanadb.topic.id, grafanadb.device.org_id AS "orgId",
									grafanadb.device.group_id AS "groupId", grafanadb.topic.device_id AS "deviceId",
									grafanadb.topic.topic_type AS "topicType",
									grafanadb.topic.topic_name AS "topicName",
									grafanadb.topic.description,
									grafanadb.topic.topic_uid AS "topicUid",
									grafanadb.topic.payload_format AS "payloadFormat",
									grafanadb.topic.mqtt_action_allowed AS "mqttActionAllowed",
									grafanadb.topic.created, grafanadb.topic.updated
									FROM grafanadb.topic
									INNER JOIN grafanadb.device ON grafanadb.topic.device_id = grafanadb.device.id
									WHERE grafanadb.device.group_id = ANY($1::bigint[])
									ORDER BY grafanadb.device.org_id ASC,
											grafanadb.device.group_id ASC,
											grafanadb.topic.id  ASC`, [groupsIdArray]);
	return response.rows;
};

export const getMobileTopicsByGroupsIdArray = async (groupsIdArray: number[]): Promise<IMobileTopic[]> => {
	const response = await pool.query(`SELECT grafanadb.topic.id, grafanadb.org.acronym AS "orgAcronym",
									grafanadb.group.acronym AS "groupAcronym", grafanadb.device.name AS "deviceName",
									grafanadb.topic.topic_name AS "topicName",
									grafanadb.topic.topic_type AS "topicType",
									grafanadb.topic.description,
									grafanadb.group.group_uid AS "groupUid",
									grafanadb.device.device_uid AS "deviceUid",
									grafanadb.topic.topic_uid AS "topicUid",
									grafanadb.topic.payload_format AS "payloadFormat"
									FROM grafanadb.topic
									INNER JOIN grafanadb.device ON grafanadb.topic.device_id = grafanadb.device.id
									INNER JOIN grafanadb.org ON grafanadb.device.org_id = grafanadb.org.id
									INNER JOIN grafanadb.group ON grafanadb.device.group_id = grafanadb.group.id
									WHERE (grafanadb.device.group_id = ANY($1::bigint[])) AND
									(grafanadb.topic.payload_format::jsonb ? 'mobile_accelerations' OR grafanadb.topic.payload_format::jsonb ? 'mobile_photo')
									ORDER BY grafanadb.device.org_id ASC,
											grafanadb.device.group_id ASC,
											grafanadb.topic.id  ASC`, [groupsIdArray]);
	return response.rows;
};


export const getNumTopicsByGroupsIdArray = async (groupsIdArray: number[]): Promise<number> => {
	const result = await pool.query(`SELECT COUNT(*) FROM grafanadb.topic
									INNER JOIN grafanadb.device ON grafanadb.topic.device_id = grafanadb.device.id
									WHERE grafanadb.device.group_id = ANY($1::bigint[])`, [groupsIdArray]);
	return parseInt(result.rows[0].count, 10);
}

export const getTopicsByOrgId = async (orgId: number): Promise<ITopic[]> => {
	const response = await pool.query(`SELECT grafanadb.topic.id, grafanadb.device.org_id AS "orgId",
									grafanadb.device.group_id AS "groupId", grafanadb.topic.device_id AS "deviceId",
									grafanadb.topic.topic_type AS "topicType",
									grafanadb.topic.topic_name AS "topicName",
									grafanadb.topic.description,
									grafanadb.topic.topic_uid AS "topicUid",
									grafanadb.topic.payload_format AS "payloadFormat",
									grafanadb.topic.mqtt_action_allowed AS "mqttActionAllowed",
									grafanadb.topic.created, grafanadb.topic.updated
									FROM grafanadb.topic
									INNER JOIN grafanadb.device ON grafanadb.topic.device_id = grafanadb.device.id
									WHERE grafanadb.device.org_id = $1
									ORDER BY grafanadb.device.org_id ASC,
											grafanadb.device.group_id ASC,
											grafanadb.topic.id  ASC`, [orgId]);
	return response.rows;
};

export const getTopicsByDeviceId = async (deviceId: number): Promise<ITopic[]> => {
	const response = await pool.query(`SELECT grafanadb.topic.id, grafanadb.device.org_id AS "orgId",
									grafanadb.device.group_id AS "groupId", grafanadb.topic.device_id AS "deviceId",
									grafanadb.topic.topic_type AS "topicType",
									grafanadb.topic.topic_name AS "topicName",
									grafanadb.topic.description,
									grafanadb.topic.topic_uid AS "topicUid",
									grafanadb.topic.payload_format AS "payloadFormat",
									grafanadb.topic.mqtt_action_allowed AS "mqttActionAllowed",
									grafanadb.topic.created, grafanadb.topic.updated
									FROM grafanadb.topic
									INNER JOIN grafanadb.device ON grafanadb.topic.device_id = grafanadb.device.id
									WHERE grafanadb.topic.device_id = $1
									ORDER BY grafanadb.device.org_id ASC,
											grafanadb.device.group_id ASC,
											grafanadb.topic.id  ASC`, [deviceId]);
	return response.rows;
};

export const checkIfExistTopics = async (topicsIdArray: number[]): Promise<string> => {
	let message = "OK";
	const response = await pool.query(`SELECT grafanadb.topic.id FROM grafanadb.topic
									WHERE grafanadb.topic.id = ANY($1::bigint[])
									ORDER BY grafanadb.topic.id ASC;`, [topicsIdArray]);
	const existentTopicsId = response.rows.map(elem => elem.id);
	const nonExistentTopicsId = topicsIdArray.filter(topicId => !existentTopicsId.includes(topicId));
	if (nonExistentTopicsId.length !== 0) {
		message = `Topics with id=[${nonExistentTopicsId.toString()}] no longer exist`
	}
	return message;
};

export const markInexistentTopics = async (topicsId: number[]): Promise<number[]> => {
	const response = await pool.query(`SELECT grafanadb.topic.id FROM grafanadb.topic
									WHERE grafanadb.topic.id = ANY($1::bigint[])
									ORDER BY grafanadb.topic.id ASC;`, [topicsId]);
	const existentTopicsId = response.rows.map(elem => elem.id);
	const markedTopics = topicsId.map(topicId => {
		if (!existentTopicsId.includes(topicId)) return -topicId;
		else return topicId;
	})
	return markedTopics;
};

export const getMqttTopicsInfoFromIdArray = async (topicsIdArray: number[]): Promise<IMqttTopicInfo[]> => {
	if (topicsIdArray.length === 0) return [];
	const filteredTopicsIdArray = topicsIdArray.filter(id => id > 0);
	const response = await pool.query(`SELECT grafanadb.topic.id AS "topicId", grafanadb.topic.topic_type AS "topicType",
									grafanadb.group.group_uid AS "groupHash", grafanadb.device.device_uid AS "deviceHash",
									grafanadb.topic.topic_uid AS "topicHash"
									FROM grafanadb.topic
									INNER JOIN grafanadb.device ON grafanadb.topic.device_id = grafanadb.device.id
									INNER JOIN grafanadb.group ON grafanadb.device.group_id = grafanadb.group.id
									WHERE grafanadb.topic.id = ANY($1::bigint[])
									ORDER BY grafanadb.topic.id ASC;`, [filteredTopicsIdArray]);

	return response.rows;
}

export const getTopicInfoForMqttAclByTopicUid = async (topicUid: string): Promise<ITopicInfoForMqttAcl> => {
	const response = await pool.query(`SELECT grafanadb.topic.id AS "topicId", grafanadb.device.org_id AS "orgId",
									grafanadb.device.group_id AS "groupId", grafanadb.topic.device_id AS "deviceId",
									grafanadb.topic.topic_type AS "topicType", grafanadb.device.mqtt_action_allowed AS "mqttActionAllowed",
									grafanadb.group.group_uid AS "groupHash", grafanadb.device.device_uid AS "deviceHash",
									grafanadb.topic.topic_uid AS "topicHash", grafanadb.group.team_id AS "teamId"
									FROM grafanadb.topic
									INNER JOIN grafanadb.device ON grafanadb.topic.device_id = grafanadb.device.id
									INNER JOIN grafanadb.group ON grafanadb.device.group_id = grafanadb.group.id
									WHERE grafanadb.topic.device_id = $1`, [topicUid]);
	return response.rows[0];
};


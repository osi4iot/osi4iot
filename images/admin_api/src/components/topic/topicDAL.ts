import { nanoid } from "nanoid";
import pool from "../../config/dbconfig";
import CreateTopicDto from './topic.dto';
import ITopic from "./topic.interface";
import ITopicUpdate from "./topicUpdate.interface";


export const insertTopic = async (topicData: ITopicUpdate): Promise<ITopicUpdate> => {
	const result = await pool.query(`INSERT INTO grafanadb.topic (device_id,
					sensor_name, description, payload_format, topic_uid,
					created, updated)
					VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
					RETURNING  id, device_id AS "deviceId", description,
					payload_format AS "payloadFormat", topic_uid AS "topicUid",
					created, updated`,
		[
			topicData.deviceId,
			topicData.sensorName,
			topicData.description,
			topicData.payloadFormat,
			topicData.topicUid
		]);
	return result.rows[0];
};

export const updateTopicById = async (topicId: number, topic: ITopic): Promise<void> => {
	const query = `UPDATE grafanadb.topic SET sensor_name = $1, description = $2,
					payload_format = $3, updated = NOW()
					WHERE grafanadb.topic.id = $4;`;
	const result = await pool.query(query, [
		topic.sensorName,
		topic.description,
		topic.payloadFormat,
		topicId
	]);
};

export const changeTopicUidByUid = async (topic: ITopic): Promise<string> => {
	const oldTopicUid = topic.topicUid;
	const newTopicUid = nanoid().replace(/-/g, "x");
	await pool.query('UPDATE grafanadb.topic SET topic_uid = $1 WHERE topic_uid = $2',
		[newTopicUid, oldTopicUid]);
	return newTopicUid;
};

export const deleteTopicById = async (topicId: number): Promise<void> => {
	await pool.query(`DELETE FROM grafanadb.topic WHERE grafanadb.topic.id = $1`, [topicId]);
};

export const createTopic = async (deviceId: number, topicInput: CreateTopicDto): Promise<ITopicUpdate> => {
	const topicUid = nanoid().replace(/-/g, "x");
	const topicUpdated: ITopicUpdate = { ...topicInput, topicUid, deviceId };
	const topic = await insertTopic(topicUpdated);
	return topic;
};

export const getTopicByProp = async (propName: string, propValue: (string | number)): Promise<ITopic> => {
	const response = await pool.query(`SELECT grafanadb.topic.id, grafanadb.device.org_id AS "orgId",
                                    grafanadb.device.group_id AS "groupId", grafanadb.topic.device_id AS "deviceId",
	                                grafanadb.topic.sensor_name AS "sensorName", grafanadb.topic.description,
									grafanadb.topic.topic_uid AS "topicUid",
									grafanadb.topic.payload_format AS "payloadFormat",
									grafanadb.topic.created, grafanadb.topic.updated
									FROM grafanadb.topic
									INNER JOIN grafanadb.device ON grafanadb.topic.device_id = grafanadb.device.id
									WHERE grafanadb.topic.${propName} = $1`, [propValue]);
	return response.rows[0];
}

export const getAllTopics = async (): Promise<ITopic[]> => {
	const response = await pool.query(`SELECT grafanadb.topic.id, grafanadb.device.org_id AS "orgId",
									grafanadb.device.group_id AS "groupId", grafanadb.topic.device_id AS "deviceId",
									grafanadb.topic.sensor_name AS "sensorName", grafanadb.topic.description,
									grafanadb.topic.topic_uid AS "topicUid",
									grafanadb.topic.payload_format AS "payloadFormat",
									grafanadb.topic.created, grafanadb.topic.updated
									FROM grafanadb.topic
									INNER JOIN grafanadb.device ON grafanadb.topic.device_id = grafanadb.device.id
									ORDER BY grafanadb.topic.id  ASC;`);
	return response.rows;
}

export const getNumTopics = async (): Promise<number> => {
	const result = await pool.query(`SELECT COUNT(*) FROM grafanadb.topic;`);
	return parseInt(result.rows[0].count, 10);
}


export const getTopicsByGroupId = async (groupId: number): Promise<ITopic[]> => {
	const response = await pool.query(`SELECT grafanadb.topic.id, grafanadb.device.org_id AS "orgId",
									grafanadb.device.group_id AS "groupId", grafanadb.topic.device_id AS "deviceId",
									grafanadb.topic.sensor_name AS "sensorName", grafanadb.topic.description,
									grafanadb.topic.topic_uid AS "topicUid",
									grafanadb.topic.payload_format AS "payloadFormat",
									grafanadb.topic.created, grafanadb.topic.updated
									FROM grafanadb.topic
									INNER JOIN grafanadb.device ON grafanadb.topic.device_id = grafanadb.device.id
									WHERE grafanadb.device.group_id = $1
									ORDER BY grafanadb.topic.id  ASC`, [groupId]);
	return response.rows;
};

export const getTopicsByGroupsIdArray = async (groupsIdArray: number[]): Promise<ITopic[]> => {
	const response = await pool.query(`SELECT grafanadb.topic.id, grafanadb.device.org_id AS "orgId",
									grafanadb.device.group_id AS "groupId", grafanadb.topic.device_id AS "deviceId",
									grafanadb.topic.sensor_name AS "sensorName", grafanadb.topic.description,
									grafanadb.topic.topic_uid AS "topicUid",
									grafanadb.topic.payload_format AS "payloadFormat",
									grafanadb.topic.created, grafanadb.topic.updated
									FROM grafanadb.topic
									INNER JOIN grafanadb.device ON grafanadb.topic.device_id = grafanadb.device.id
									WHERE grafanadb.device.group_id = $1
									ORDER BY grafanadb.topic.id  ASC`, [groupsIdArray]);
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
									grafanadb.topic.sensor_name AS "sensorName", grafanadb.topic.description,
									grafanadb.topic.topic_uid AS "topicUid",
									grafanadb.topic.payload_format AS "payloadFormat",
									grafanadb.topic.created, grafanadb.topic.updated
									FROM grafanadb.topic
									INNER JOIN grafanadb.device ON grafanadb.topic.device_id = grafanadb.device.id
									WHERE grafanadb.device.org_id = $1
									ORDER BY grafanadb.topic.id  ASC`, [orgId]);
	return response.rows;
};

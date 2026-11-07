import { nanoid } from "nanoid";
import pool, { readQuery } from "../../config/dbconfig";
import IMobileTopic from "./mobileTopic.interface";
import IMqttTopicInfo from "./mqttTopicInfo.interface";
import CreateTopicDto from "./topic.dto";
import ITopic from "./topic.interface";
import ITopicInfoForMqttAcl from "./topicInfoForMqttAcl.interface";
import natsClient from "../../config/natsConfig";
import { messageSchemaToStore } from "./messageSchema";

// schema sent by the user, with the field of the current version or the one of older versions
const topicSchemaInput = (topic: { messageSchema?: unknown; payloadJsonSchema?: unknown }): unknown => {
	const value = topic.messageSchema ?? topic.payloadJsonSchema;
	delete topic.payloadJsonSchema;
	return value;
};

export const insertTopic = async (topicData: Partial<ITopic>): Promise<ITopic> => {
	const result = await pool.query(
		`INSERT INTO grafanadb.topic (group_id, topic_type,
		description, topic_uid,  mqtt_access_control, message_schema,
		created, updated)
		VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
		RETURNING  id, group_id AS "groupId", topic_type AS "topicType",
		description, topic_uid AS "topicUid",
		mqtt_access_control AS "mqttAccessControl",
		message_schema AS "messageSchema",
		message_schema_version AS "messageSchemaVersion",
		created, updated`,
		[
			topicData.groupId,
			topicData.topicType,
			topicData.description,
			topicData.topicUid,
			topicData.mqttAccessControl,
			JSON.stringify(await messageSchemaToStore(topicData.topicType, topicSchemaInput(topicData))),
		]
	);
	return result.rows[0] as ITopic;
};

export const updateTopicById = async (groupId: number, topicId: number, topic: ITopic): Promise<void> => {
	const query = `UPDATE grafanadb.topic SET topic_type = $1, description = $2,
					mqtt_access_control = $3, message_schema = $4,
					updated = NOW()
					WHERE grafanadb.topic.id = $5 RETURNING *;`;
	await pool.query(query, [
		topic.topicType,
		topic.description,
		topic.mqttAccessControl,
		JSON.stringify(await messageSchemaToStore(topic.topicType, topicSchemaInput(topic), topicId)),
		topicId,
	]);

	const context = {
		groupId,
	};
	await natsClient.jsPublish("topic", "update", topicId, context);
};

export const changeTopicUidByUid = async (topic: ITopic): Promise<string> => {
	const oldTopicUid = topic.topicUid;
	const newTopicUid = nanoid(20).replace(/-/g, "x").replace(/_/g, "X");
	await pool.query("UPDATE grafanadb.topic SET topic_uid = $1 WHERE topic_uid = $2", [newTopicUid, oldTopicUid]);
	return newTopicUid;
};

export const deleteTopicById = async (groupId: number, topicId: number): Promise<void> => {
	await pool.query(`DELETE FROM grafanadb.topic WHERE grafanadb.topic.id = $1`, [topicId]);

	const context = {
		groupId,
	};
	await natsClient.jsPublish("topic", "delete", topicId, context);
};

export const createTopic = async (groupId: number, topicInput: CreateTopicDto, isDefault = false): Promise<ITopic> => {
	const topicUid = nanoid(20).replace(/-/g, "x").replace(/_/g, "X");
	const topicUpdated: Partial<ITopic> = { ...topicInput, topicUid, groupId };
	const topic = await insertTopic(topicUpdated);
	if (!isDefault) {
		const context = {
			groupId,
		};
		await natsClient.jsPublish("topic", "create", topic.id, context);
	}

	return topic;
};

export const getTopicByProp = async (propName: string, propValue: string | number): Promise<ITopic> => {
	const response = await readQuery(
		`SELECT grafanadb.topic.id, grafanadb.group.org_id AS "orgId",
		grafanadb.topic.group_id AS "groupId",
		grafanadb.group.group_uid AS "groupUid",
		grafanadb.topic.topic_type AS "topicType",
		grafanadb.topic.description,
		grafanadb.topic.topic_uid AS "topicUid",
		grafanadb.topic.mqtt_access_control AS "mqttAccessControl",
		grafanadb.topic.message_schema AS "messageSchema",
		grafanadb.topic.message_schema_version AS "messageSchemaVersion",
		grafanadb.topic.created, grafanadb.topic.updated
		FROM grafanadb.topic
		INNER JOIN grafanadb.group ON grafanadb.topic.group_id = grafanadb.group.id
		WHERE grafanadb.topic.${propName} = $1`,
		[propValue]
	);
	return response.rows[0] as ITopic;
};

export const getAllTopics = async (): Promise<ITopic[]> => {
	const response = await readQuery(
		`SELECT grafanadb.topic.id, grafanadb.group.org_id AS "orgId",
		grafanadb.topic.group_id AS "groupId",
		grafanadb.group.group_uid AS "groupUid",
		grafanadb.topic.topic_type AS "topicType",
		grafanadb.topic.description,
		grafanadb.topic.topic_uid AS "topicUid",
		grafanadb.topic.mqtt_access_control AS "mqttAccessControl",
		grafanadb.topic.message_schema AS "messageSchema",
		grafanadb.topic.message_schema_version AS "messageSchemaVersion",
		grafanadb.topic.created, grafanadb.topic.updated
		FROM grafanadb.topic
		INNER JOIN grafanadb.group ON grafanadb.topic.group_id = grafanadb.group.id
		ORDER BY grafanadb.group.org_id ASC,
				grafanadb.topic.group_id ASC,
				grafanadb.topic.id  ASC;`
	);
	return response.rows as ITopic[];
};

// The sensors the "Mobile sensors" page can feed from a phone, each with the
// topic type its form publishes to. Any asset with at least one of them is
// listed, whatever its asset type (not only "Mobile" or "Assembly with
// mobile"): a sensor on a topic of another type is left out, because the
// page could not publish to it.
export const MOBILE_SENSOR_TYPES_BY_TOPIC_TYPE: Record<string, string[]> = {
	dev2pdb_wt: ["Mobile geolocation", "Mobile accelerations", "Mobile orientation", "Mobile motion"],
	dev2dtm: ["Mobile photo", "Mobile video", "Mobile audio"],
};

const MOBILE_SENSOR_CONDITION = `((grafanadb.topic.topic_type = 'dev2pdb_wt' AND grafanadb.sensor_type.type = ANY($1::text[]))
		OR (grafanadb.topic.topic_type = 'dev2dtm' AND grafanadb.sensor_type.type = ANY($2::text[])))`;

const MOBILE_SENSOR_PARAMS = [MOBILE_SENSOR_TYPES_BY_TOPIC_TYPE.dev2pdb_wt, MOBILE_SENSOR_TYPES_BY_TOPIC_TYPE.dev2dtm];

export const getAllMobileTopics = async (): Promise<IMobileTopic[]> => {
	const response = await readQuery(
		`SELECT grafanadb.topic.id, 
		grafanadb.org.acronym AS "orgAcronym",
		grafanadb.group.acronym AS "groupAcronym",
		grafanadb.topic.topic_type AS "topicType",
		grafanadb.sensor_type.type AS "sensorType",
		grafanadb.sensor.description AS "sensorDescription",
		grafanadb.asset.description AS "assetDescription",
		grafanadb.group.group_uid AS "groupUid",
		grafanadb.asset.asset_uid AS "assetUid",
		grafanadb.topic.topic_uid AS "topicUid"
		FROM grafanadb.topic
		INNER JOIN grafanadb.group ON grafanadb.topic.group_id = grafanadb.group.id
		INNER JOIN grafanadb.org ON grafanadb.group.org_id = grafanadb.org.id
		INNER JOIN grafanadb.asset_topic ON grafanadb.topic.id = grafanadb.asset_topic.topic_id
		INNER JOIN grafanadb.asset ON grafanadb.asset_topic.asset_id = grafanadb.asset.id
		INNER JOIN grafanadb.sensor ON grafanadb.sensor.asset_id = grafanadb.asset.id
		INNER JOIN grafanadb.sensor_type ON grafanadb.sensor_type.id = grafanadb.sensor.sensor_type_id
		WHERE grafanadb.sensor.topic_id = grafanadb.topic.id AND ${MOBILE_SENSOR_CONDITION}
		ORDER BY grafanadb.org.acronym ASC,
				grafanadb.group.acronym ASC,
				grafanadb.topic.id  ASC;`,
		MOBILE_SENSOR_PARAMS
	);
	return response.rows as IMobileTopic[];
};

export const getNumTopics = async (): Promise<number> => {
	const result = await pool.query(`SELECT COUNT(*) FROM grafanadb.topic;`);
	return parseInt(result.rows[0].count as string, 10);
};

export const getTopicsByGroupId = async (groupId: number): Promise<ITopic[]> => {
	const response = await readQuery(
		`SELECT grafanadb.topic.id, grafanadb.group.org_id AS "orgId",
		grafanadb.topic.group_id AS "groupId",
		grafanadb.group.group_uid AS "groupUid",
		grafanadb.topic.topic_type AS "topicType",
		grafanadb.topic.description,
		grafanadb.topic.topic_uid AS "topicUid",
		grafanadb.topic.mqtt_access_control AS "mqttAccessControl",
		grafanadb.topic.message_schema AS "messageSchema",
		grafanadb.topic.message_schema_version AS "messageSchemaVersion",
		grafanadb.topic.created, grafanadb.topic.updated
		FROM grafanadb.topic
		INNER JOIN grafanadb.group ON grafanadb.topic.group_id = grafanadb.group.id
		WHERE grafanadb.topic.group_id = $1
		ORDER BY grafanadb.group.org_id ASC,
				grafanadb.topic.group_id ASC,
				grafanadb.topic.id  ASC`,
		[groupId]
	);
	return response.rows as ITopic[];
};

export const getTopicsByGroupsIdArray = async (groupsIdArray: number[]): Promise<ITopic[]> => {
	const response = await readQuery(
		`SELECT grafanadb.topic.id, grafanadb.group.org_id AS "orgId",
		grafanadb.topic.group_id AS "groupId",
		grafanadb.group.group_uid AS "groupUid",
		grafanadb.topic.topic_type AS "topicType",
		grafanadb.topic.description,
		grafanadb.topic.topic_uid AS "topicUid",
		grafanadb.topic.mqtt_access_control AS "mqttAccessControl",
		grafanadb.topic.message_schema AS "messageSchema",
		grafanadb.topic.message_schema_version AS "messageSchemaVersion",
		grafanadb.topic.created, grafanadb.topic.updated
		FROM grafanadb.topic
		INNER JOIN grafanadb.group ON grafanadb.topic.group_id = grafanadb.group.id
		WHERE grafanadb.topic.group_id = ANY($1::bigint[])
		ORDER BY grafanadb.group.org_id ASC,
				grafanadb.topic.group_id ASC,
				grafanadb.topic.id  ASC`,
		[groupsIdArray]
	);
	return response.rows as ITopic[];
};

export const getMobileTopicsByGroupsIdArray = async (groupsIdArray: number[]): Promise<IMobileTopic[]> => {
	const response = await readQuery(
		`SELECT grafanadb.topic.id, 
		grafanadb.org.acronym AS "orgAcronym",
		grafanadb.group.acronym AS "groupAcronym",
		grafanadb.topic.topic_type AS "topicType",
		grafanadb.sensor_type.type AS "sensorType",
		grafanadb.sensor.description AS "sensorDescription",
		grafanadb.asset.description AS "assetDescription",
		grafanadb.group.group_uid AS "groupUid",
		grafanadb.asset.asset_uid AS "assetUid",
		grafanadb.topic.topic_uid AS "topicUid"
		FROM grafanadb.topic
		INNER JOIN grafanadb.group ON grafanadb.topic.group_id = grafanadb.group.id
		INNER JOIN grafanadb.org ON grafanadb.group.org_id = grafanadb.org.id
		INNER JOIN grafanadb.asset_topic ON grafanadb.topic.id = grafanadb.asset_topic.topic_id
		INNER JOIN grafanadb.asset ON grafanadb.asset_topic.asset_id = grafanadb.asset.id
		INNER JOIN grafanadb.sensor ON grafanadb.sensor.asset_id = grafanadb.asset.id
		INNER JOIN grafanadb.sensor_type ON grafanadb.sensor_type.id = grafanadb.sensor.sensor_type_id
		WHERE grafanadb.sensor.topic_id = grafanadb.topic.id AND ${MOBILE_SENSOR_CONDITION} AND
			grafanadb.topic.group_id = ANY($3::bigint[])
		ORDER BY grafanadb.org.acronym ASC,
			grafanadb.group.acronym ASC,
			grafanadb.topic.id  ASC;`,
		[...MOBILE_SENSOR_PARAMS, groupsIdArray]
	);
	return response.rows as IMobileTopic[];
};

export const getNumTopicsByGroupsIdArray = async (groupsIdArray: number[]): Promise<number> => {
	const result = await readQuery(
		`SELECT COUNT(*) FROM grafanadb.topic
									WHERE grafanadb.topic.group_id = ANY($1::bigint[])`,
		[groupsIdArray]
	);
	return parseInt(result.rows[0].count as string, 10);
};

export const getTopicsByOrgId = async (orgId: number): Promise<ITopic[]> => {
	const response = await readQuery(
		`SELECT grafanadb.topic.id, grafanadb.group.org_id AS "orgId",
		grafanadb.topic.group_id AS "groupId",
		grafanadb.group.group_uid AS "groupUid",
		grafanadb.topic.topic_type AS "topicType",
		grafanadb.topic.description,
		grafanadb.topic.topic_uid AS "topicUid",
		grafanadb.topic.mqtt_access_control AS "mqttAccessControl",
		grafanadb.topic.message_schema AS "messageSchema",
		grafanadb.topic.message_schema_version AS "messageSchemaVersion",
		grafanadb.topic.created, grafanadb.topic.updated
		FROM grafanadb.topic
		INNER JOIN grafanadb.group ON grafanadb.topic.group_id = grafanadb.group.id
		WHERE grafanadb.group.org_id = $1
		ORDER BY grafanadb.group.org_id ASC,
				grafanadb.topic.group_id ASC,
				grafanadb.topic.id  ASC`,
		[orgId]
	);
	return response.rows as ITopic[];
};

export const checkIfExistTopics = async (topicsIdArray: number[]): Promise<string> => {
	let message = "OK";
	const response = await readQuery(
		`SELECT grafanadb.topic.id FROM grafanadb.topic
		WHERE grafanadb.topic.id = ANY($1::bigint[])
		ORDER BY grafanadb.topic.id ASC;`,
		[topicsIdArray]
	);
	const existentTopicsId = response.rows.map((elem) => elem.id as number);
	const nonExistentTopicsId = topicsIdArray.filter((topicId) => !existentTopicsId.includes(topicId));
	if (nonExistentTopicsId.length !== 0) {
		message = `Topics with id=[${nonExistentTopicsId.toString()}] no longer exist`;
	}
	return message;
};

export const markInexistentTopics = async (topicsId: number[]): Promise<number[]> => {
	const response = await readQuery(
		`SELECT grafanadb.topic.id FROM grafanadb.topic
		WHERE grafanadb.topic.id = ANY($1::bigint[])
		ORDER BY grafanadb.topic.id ASC;`,
		[topicsId]
	);
	const existentTopicsId = response.rows.map((elem) => elem.id as number);
	const markedTopics = topicsId.map((topicId) => {
		if (!existentTopicsId.includes(topicId)) return -topicId;
		else return topicId;
	});
	return markedTopics;
};

export const getMqttTopicsInfoFromIdArray = async (topicsIdArray: number[]): Promise<IMqttTopicInfo[]> => {
	if (topicsIdArray.length === 0) return [];
	const filteredTopicsIdArray = topicsIdArray.filter((id) => id > 0);
	const response = await readQuery(
		`SELECT grafanadb.topic.id AS "topicId", grafanadb.topic.topic_type AS "topicType",
		grafanadb.group.group_uid AS "groupHash", grafanadb.topic.topic_uid AS "topicHash"
		FROM grafanadb.topic
		INNER JOIN grafanadb.group ON grafanadb.topic.group_id = grafanadb.group.id
		WHERE grafanadb.topic.id = ANY($1::bigint[])
		ORDER BY grafanadb.topic.id ASC;`,
		[filteredTopicsIdArray]
	);

	return response.rows as IMqttTopicInfo[];
};

export const getTopicInfoForMqttAclByTopicUid = async (topicUid: string): Promise<ITopicInfoForMqttAcl> => {
	const response = await readQuery(
		`SELECT grafanadb.topic.id AS "topicId", 
		grafanadb.group.org_id AS "orgId",
		grafanadb.topic.group_id AS "groupId",
		grafanadb.topic.topic_type AS "topicType", 
		grafanadb.topic.mqtt_access_control AS "topicAccessControl",
		grafanadb.group.mqtt_access_control AS "groupAccessControl",
		grafanadb.org.mqtt_access_control AS "orgAccessControl",
		grafanadb.group.group_uid AS "groupHash",
		grafanadb.topic.topic_uid AS "topicHash", 
		grafanadb.group.team_id AS "teamId"
		FROM grafanadb.topic
		INNER JOIN grafanadb.group ON grafanadb.topic.group_id = grafanadb.group.id
		INNER JOIN grafanadb.org ON grafanadb.group.org_id = grafanadb.org.id
		WHERE grafanadb.topic.topic_uid = $1`,
		[topicUid]
	);
	return response.rows[0] as ITopicInfoForMqttAcl;
};

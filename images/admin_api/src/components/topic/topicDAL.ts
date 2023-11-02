import { nanoid } from "nanoid";
import pool from "../../config/dbconfig";
import IMobileTopic from "./mobileTopic.interface";
import IMqttTopicInfo from "./mqttTopicInfo.interface";
import CreateTopicDto from './topic.dto';
import ITopic from "./topic.interface";
import ITopicInfoForMqttAcl from "./topicInfoForMqttAcl.interface";


export const insertTopic = async (topicData: Partial<ITopic>): Promise<ITopic> => {
	const result = await pool.query(`INSERT INTO grafanadb.topic (group_id, topic_type,
					description, topic_uid,  mqtt_access_control, payload_json_schema,
					require_s3_storage, s3_folder, parquet_schema, last_s3_storage,
					created, updated)
					VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW(), NOW())
					RETURNING  id, group_id AS "groupId", topic_type AS "topicType",
					description, topic_uid AS "topicUid",
					mqtt_access_control AS "mqttAccessControl",
                    payload_json_schema AS "payloadJsonSchema",
					require_s3_storage AS "requireS3Storage",
					s3_folder AS "s3Folder",
					parquet_schema AS "parquetSchema",
					last_s3_storage AS "lastS3Storage",
					created, updated`,
	[
		topicData.groupId,
		topicData.topicType,
		topicData.description,
		topicData.topicUid,
		topicData.mqttAccessControl,
		topicData.payloadJsonSchema,
		topicData.requireS3Storage,
		topicData.s3Folder,
		topicData.parquetSchema
	]);
	return result.rows[0] as ITopic;
};

export const updateTopicById = async (topicId: number, topic: ITopic): Promise<void> => {
	const query = `UPDATE grafanadb.topic SET topic_type = $1, description = $2,
					mqtt_access_control = $3, payload_json_schema = $4,
					require_s3_storage = $5, s3_folder = $6, parquet_schema = $7,
					updated = NOW()
					WHERE grafanadb.topic.id = $8;`;
	await pool.query(query, [
		topic.topicType,
		topic.description,
		topic.mqttAccessControl,
		topic.payloadJsonSchema,
		topic.requireS3Storage,
		topic.s3Folder,
		topic.parquetSchema,
		topicId
	]);
};

export const changeTopicUidByUid = async (topic: ITopic): Promise<string> => {
	const oldTopicUid = topic.topicUid;
	const newTopicUid = nanoid(20).replace(/-/g, "x").replace(/_/g, "X");
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

export const createTopic = async (groupId: number, topicInput: CreateTopicDto): Promise<ITopic> => {
	const topicUid = nanoid(20).replace(/-/g, "x").replace(/_/g, "X");
	const topicUpdated: Partial<ITopic> = { ...topicInput, topicUid, groupId };
	const topic = await insertTopic(topicUpdated);
	return topic;
};

export const getTopicByProp = async (propName: string, propValue: (string | number)): Promise<ITopic> => {
	const response = await pool.query(`SELECT grafanadb.topic.id, grafanadb.group.org_id AS "orgId",
                                    grafanadb.topic.group_id AS "groupId",
									grafanadb.topic.topic_type AS "topicType",
									grafanadb.topic.description,
									grafanadb.topic.topic_uid AS "topicUid",
									grafanadb.topic.mqtt_access_control AS "mqttAccessControl",
									grafanadb.topic.payload_json_schema AS "payloadJsonSchema",
									grafanadb.topic.require_s3_storage AS "requireS3Storage",
									grafanadb.topic.s3_folder AS "s3Folder",
									grafanadb.topic.parquet_schema AS "parquetSchema",
									grafanadb.topic.last_s3_storage AS "lastS3Storage",
									grafanadb.topic.created, grafanadb.topic.updated
									FROM grafanadb.topic
									INNER JOIN grafanadb.group ON grafanadb.topic.group_id = grafanadb.group.id
									WHERE grafanadb.topic.${propName} = $1`, [propValue]);
	return response.rows[0] as ITopic;
}

export const getSensorTopicsOfDTByDigitalTwinId = async (digitalTwinId: number): Promise<ITopic[]> => {
	const response = await pool.query(`SELECT grafanadb.topic.id, grafanadb.group.org_id AS "orgId",
									grafanadb.topic.group_id AS "groupId",
									grafanadb.topic.topic_type AS "topicType",
									grafanadb.topic.description,
									grafanadb.topic.topic_uid AS "topicUid",
									grafanadb.topic.mqtt_access_control AS "mqttAccessControl",
									grafanadb.topic.payload_json_schema AS "payloadJsonSchema",
									grafanadb.topic.require_s3_storage AS "requireS3Storage",
									grafanadb.topic.s3_folder AS "s3Folder",
									grafanadb.topic.parquet_schema AS "parquetSchema",
									grafanadb.topic.last_s3_storage AS "lastS3Storage",
									grafanadb.topic.created, grafanadb.topic.updated
									FROM grafanadb.topic
									INNER JOIN grafanadb.group ON grafanadb.topic.group_id = grafanadb.group.id
									INNER JOIN grafanadb.digital_twin_topic ON grafanadb.digital_twin_topic.topic_id = grafanadb.topic.id
									WHERE grafanadb.digital_twin_topic.digital_twin_id = $1`, [digitalTwinId]);
	return response.rows as ITopic[];
}

export const getAllTopics = async (): Promise<ITopic[]> => {
	const response = await pool.query(`SELECT grafanadb.topic.id, grafanadb.group.org_id AS "orgId",
									grafanadb.topic.group_id AS "groupId",
									grafanadb.topic.topic_type AS "topicType",
									grafanadb.topic.description,
									grafanadb.topic.topic_uid AS "topicUid",
									grafanadb.topic.mqtt_access_control AS "mqttAccessControl",
									grafanadb.topic.payload_json_schema AS "payloadJsonSchema",
									grafanadb.topic.require_s3_storage AS "requireS3Storage",
									grafanadb.topic.s3_folder AS "s3Folder",
									grafanadb.topic.parquet_schema AS "parquetSchema",
									grafanadb.topic.last_s3_storage AS "lastS3Storage",
									grafanadb.topic.created, grafanadb.topic.updated
									FROM grafanadb.topic
									INNER JOIN grafanadb.group ON grafanadb.topic.group_id = grafanadb.group.id
									ORDER BY grafanadb.group.org_id ASC,
											grafanadb.topic.group_id ASC,
											grafanadb.topic.id  ASC;`);
	return response.rows as ITopic[];
}

export const getAllMobileTopics = async (): Promise<IMobileTopic[]> => {
	const response = await pool.query(`SELECT grafanadb.topic.id, 
									grafanadb.org.acronym AS "orgAcronym",
									grafanadb.group.acronym AS "groupAcronym",
									grafanadb.topic.topic_type AS "topicType",
									grafanadb.sensor.type AS "sensorType",
									grafanadb.sensor.description AS "sensorDescription",
									grafanadb.asset.description AS "assetDescription",
									grafanadb.group.group_uid AS "groupUid",
									grafanadb.asset.asset_uid AS "assetUid",
									grafanadb.topic.topic_uid AS "topicUid"
									FROM grafanadb.topic
									INNER JOIN grafanadb.group ON grafanadb.topic.group_id = grafanadb.group.id
									INNER JOIN grafanadb.org ON grafanadb.group.org_id = grafanadb.org.id
									INNER JOIN grafanadb.asset ON grafanadb.topic.group_id = grafanadb.asset.group_id
									INNER JOIN grafanadb.asset_type ON grafanadb.asset.asset_type_id = grafanadb.asset_type.id
									INNER JOIN grafanadb.sensor ON grafanadb.sensor.asset_id = grafanadb.asset.id
									WHERE ((grafanadb.asset_type.type = 'Mobile' OR grafanadb.asset_type.type = 'Assembly with mobile') AND
									(grafanadb.sensor.topic_id = grafanadb.topic.id))
									ORDER BY grafanadb.org.acronym ASC,
									        grafanadb.group.acronym ASC,
											grafanadb.topic.id  ASC;`);
	return response.rows as IMobileTopic[];
}


export const getNumTopics = async (): Promise<number> => {
	const result = await pool.query(`SELECT COUNT(*) FROM grafanadb.topic;`);
	return parseInt(result.rows[0].count as string, 10);
}


export const getTopicsByGroupId = async (groupId: number): Promise<ITopic[]> => {
	const response = await pool.query(`SELECT grafanadb.topic.id, grafanadb.group.org_id AS "orgId",
									grafanadb.topic.group_id AS "groupId",
									grafanadb.topic.topic_type AS "topicType",
									grafanadb.topic.description,
									grafanadb.topic.topic_uid AS "topicUid",
									grafanadb.topic.mqtt_access_control AS "mqttAccessControl",
									grafanadb.topic.payload_json_schema AS "payloadJsonSchema",
									grafanadb.topic.require_s3_storage AS "requireS3Storage",
									grafanadb.topic.s3_folder AS "s3Folder",
									grafanadb.topic.parquet_schema AS "parquetSchema",
									grafanadb.topic.last_s3_storage AS "lastS3Storage",
									grafanadb.topic.created, grafanadb.topic.updated
									FROM grafanadb.topic
									INNER JOIN grafanadb.group ON grafanadb.topic.group_id = grafanadb.group.id
									WHERE grafanadb.topic.group_id = $1
									ORDER BY grafanadb.group.org_id ASC,
											grafanadb.topic.group_id ASC,
											grafanadb.topic.id  ASC`, [groupId]);
	return response.rows as ITopic[];
};


export const getTopicsByGroupsIdArray = async (groupsIdArray: number[]): Promise<ITopic[]> => {
	const response = await pool.query(`SELECT grafanadb.topic.id, grafanadb.group.org_id AS "orgId",
									grafanadb.topic.group_id AS "groupId",
									grafanadb.topic.topic_type AS "topicType",
									grafanadb.topic.description,
									grafanadb.topic.topic_uid AS "topicUid",
									grafanadb.topic.mqtt_access_control AS "mqttAccessControl",
									grafanadb.topic.payload_json_schema AS "payloadJsonSchema",
									grafanadb.topic.require_s3_storage AS "requireS3Storage",
									grafanadb.topic.s3_folder AS "s3Folder",
									grafanadb.topic.parquet_schema AS "parquetSchema",
									grafanadb.topic.last_s3_storage AS "lastS3Storage",
									grafanadb.topic.created, grafanadb.topic.updated
									FROM grafanadb.topic
									INNER JOIN grafanadb.group ON grafanadb.topic.group_id = grafanadb.group.id
									WHERE grafanadb.topic.group_id = ANY($1::bigint[])
									ORDER BY grafanadb.group.org_id ASC,
											grafanadb.topic.group_id ASC,
											grafanadb.topic.id  ASC`, [groupsIdArray]);
	return response.rows as ITopic[];
};


export const getMobileTopicsByGroupsIdArray = async (groupsIdArray: number[]): Promise<IMobileTopic[]> => {
	const response = await pool.query(`SELECT grafanadb.topic.id, 
									grafanadb.org.acronym AS "orgAcronym",
									grafanadb.group.acronym AS "groupAcronym",
									grafanadb.topic.topic_type AS "topicType",
									grafanadb.sensor.type AS "sensorType",
									grafanadb.sensor.description AS "sensorDescription",
									grafanadb.asset.description AS "assetDescription",
									grafanadb.group.group_uid AS "groupUid",
									grafanadb.asset.asset_uid AS "assetUid",
									grafanadb.topic.topic_uid AS "topicUid"
									FROM grafanadb.topic
									INNER JOIN grafanadb.group ON grafanadb.topic.group_id = grafanadb.group.id
									INNER JOIN grafanadb.org ON grafanadb.group.org_id = grafanadb.org.id
									INNER JOIN grafanadb.asset ON grafanadb.topic.group_id = grafanadb.asset.group_id
									INNER JOIN grafanadb.asset_type ON grafanadb.asset.asset_type_id = grafanadb.asset_type.id
									INNER JOIN grafanadb.sensor ON grafanadb.sensor.asset_id = grafanadb.asset.id
									WHERE ((grafanadb.topic.group_id = ANY($1::bigint[])) AND
										(grafanadb.asset_type.type = 'Mobile' OR grafanadb.asset_type.type = 'Assembly with mobile') AND
										(grafanadb.sensor.topic_id = grafanadb.topic.id))
									ORDER BY grafanadb.org.acronym ASC,
										grafanadb.group.acronym ASC,
										grafanadb.topic.id  ASC;`, [groupsIdArray]);
	return response.rows as IMobileTopic[];
};


export const getNumTopicsByGroupsIdArray = async (groupsIdArray: number[]): Promise<number> => {
	const result = await pool.query(`SELECT COUNT(*) FROM grafanadb.topic
									WHERE grafanadb.topic.group_id = ANY($1::bigint[])`, [groupsIdArray]);
	return parseInt(result.rows[0].count as string, 10);
}

export const getTopicsByOrgId = async (orgId: number): Promise<ITopic[]> => {
	const response = await pool.query(`SELECT grafanadb.topic.id, grafanadb.group.org_id AS "orgId",
									grafanadb.topic.group_id AS "groupId",
									grafanadb.topic.topic_type AS "topicType",
									grafanadb.topic.description,
									grafanadb.topic.topic_uid AS "topicUid",
									grafanadb.topic.mqtt_access_control AS "mqttAccessControl",
									grafanadb.topic.payload_json_schema AS "payloadJsonSchema",
									grafanadb.topic.require_s3_storage AS "requireS3Storage",
									grafanadb.topic.s3_folder AS "s3Folder",
									grafanadb.topic.parquet_schema AS "parquetSchema",
									grafanadb.topic.last_s3_storage AS "lastS3Storage",
									grafanadb.topic.created, grafanadb.topic.updated
									FROM grafanadb.topic
									INNER JOIN grafanadb.group ON grafanadb.topic.group_id = grafanadb.group.id
									WHERE grafanadb.group.org_id = $1
									ORDER BY grafanadb.group.org_id ASC,
											grafanadb.topic.group_id ASC,
											grafanadb.topic.id  ASC`, [orgId]);
	return response.rows as ITopic[];
};


export const checkIfExistTopics = async (topicsIdArray: number[]): Promise<string> => {
	let message = "OK";
	const response = await pool.query(`SELECT grafanadb.topic.id FROM grafanadb.topic
									WHERE grafanadb.topic.id = ANY($1::bigint[])
									ORDER BY grafanadb.topic.id ASC;`, [topicsIdArray]);
	const existentTopicsId = response.rows.map(elem => elem.id as number);
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
	const existentTopicsId = response.rows.map(elem => elem.id as number);
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
									grafanadb.group.group_uid AS "groupHash", grafanadb.topic.topic_uid AS "topicHash"
									FROM grafanadb.topic
									INNER JOIN grafanadb.group ON grafanadb.topic.group_id = grafanadb.group.id
									WHERE grafanadb.topic.id = ANY($1::bigint[])
									ORDER BY grafanadb.topic.id ASC;`, [filteredTopicsIdArray]);

	return response.rows as IMqttTopicInfo[];
}

export const getTopicInfoForMqttAclByTopicUid = async (topicUid: string): Promise<ITopicInfoForMqttAcl> => {
	const response = await pool.query(`SELECT grafanadb.topic.id AS "topicId", 
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
									WHERE grafanadb.topic.topic_uid = $1`, [topicUid]);
	return response.rows[0] as ITopicInfoForMqttAcl;
};

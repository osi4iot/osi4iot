import pool from "../config/dbConfig";
import ITopic from "./topic.interface";

export const getAllTopics = async (): Promise<ITopic[]> => {
    const lastMidnight = new Date();
    lastMidnight.setHours(0,0,0,0);
    const newTimeStorage = lastMidnight.toISOString();
	const response = await pool.query(`SELECT grafanadb.group.org_id AS "orgId",
                                        grafanadb.topic.group_id AS "groupId",
                                        grafanadb.asset.id AS "assetId",
                                        grafanadb.topic.id AS "topicId",
                                        grafanadb.group.group_uid AS "groupUid",
                                        grafanadb.topic.topic_uid AS "topicUid",
                                        grafanadb.topic.require_s3_storage AS "requireS3Storage",
                                        grafanadb.topic.s3_folder AS "s3Folder",
                                        grafanadb.topic.parquet_schema AS "parquetSchema",
                                        grafanadb.topic.last_s3_storage AS "lastS3Storage"
                                        FROM grafanadb.topic
                                        INNER JOIN grafanadb.group ON grafanadb.topic.group_id = grafanadb.group.id
                                        INNER JOIN grafanadb.sensor ON grafanadb.sensor.topic_id = grafanadb.topic.id
                                        INNER JOIN grafanadb.asset ON grafanadb.asset.id = grafanadb.sensor.asset_id
                                        WHERE grafanadb.topic.require_s3_storage = $1 AND 
                                        grafanadb.topic.last_s3_storage < $2
                                        ORDER BY grafanadb.group.org_id ASC,
                                        grafanadb.topic.group_id ASC,
                                        grafanadb.asset.id ASC,
                                        grafanadb.topic.id  ASC;`, [true, newTimeStorage]);
	return response.rows as ITopic[];
}

export const updateLastS3Storage = async (topicId: number): Promise<void> => {
    const lastMidnight = new Date();
    lastMidnight.setHours(0,0,0,0);
    const newTimeStorage = lastMidnight.toISOString();
	const query = `UPDATE grafanadb.topic SET last_s3_storage = $1, updated = NOW()
					WHERE grafanadb.topic.id = $2;`;
	await pool.query(query, [newTimeStorage, topicId]);
}
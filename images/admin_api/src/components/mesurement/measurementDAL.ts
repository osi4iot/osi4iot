import pool from "../../config/dbconfig";
import IDevice from "../device/device.interface";
import ITopic from "../topic/topic.interface";
import { getTopicsByDeviceId } from "../topic/topicDAL";
import IMeasurement from "./measurement.interface";

const timestampAsString = 'to_char(timestamp, \'YYYY-MM-DD HH24:MI:SS.USOF\') AS "timestamp"';

export const updateMeasurement = async (groupUid: string, topic: string, timestamp: string, newPayload: string): Promise<IMeasurement> => {
	const query = `UPDATE iot_data.thingData SET payload = $1
				    WHERE timestamp = $2 AND
                    group_uid = $3 AND
                    topic = $4
					RETURNING *;`;
	const result = await pool.query(query, [
		newPayload,
		timestamp,
		groupUid,
		topic
	]);
	return result.rows[0];
};

export const deleteMeasurement = async (groupUid: string, topic: string, timestamp: string,): Promise<IMeasurement> => {
	const result = await pool.query(`DELETE FROM iot_data.thingData
                    WHERE timestamp = $1::TIMESTAMPTZ AND
                    group_uid = $2 AND
                    topic = $3
					RETURNING *;`, [timestamp, groupUid, topic]);
	return result.rows[0];
};

export const deleteMeasurementsBeforeDate = async (
	groupUid: string,
	topic: string,
	deleteDate: string,
): Promise<IMeasurement[]> => {
	const result = await pool.query(`DELETE FROM iot_data.thingData
                    WHERE timestamp <= $1 AND
                    group_uid = $2 AND
                    topic = $3
					RETURNING *;`, [deleteDate, groupUid, topic]);
	return result.rows[0];
};

export const getMeasurement = async (groupUid: string, topic: string, timestamp: string): Promise<IMeasurement> => {
	const response = await pool.query(`SELECT ${timestampAsString}, topic, payload
									FROM iot_data.thingData
									WHERE timestamp = $1 AND
									group_uid = $2 AND
									topic = $3;`, [timestamp, groupUid, topic]);
	return response.rows[0];
}

export const getLastMeasurements = async (groupUid: string, topic: string, count: number): Promise<IMeasurement[]> => {
	const response = await pool.query(`SELECT ${timestampAsString}, topic, payload
									FROM iot_data.thingData
									WHERE group_uid = $1 AND
									topic = $2
									ORDER BY timestamp DESC
									LIMIT $3;`, [groupUid, topic, count]);
	return response.rows;
};

export const getLastMeasurementsFromTopicsArray = async (groupUid: string, topicsArray: string[]): Promise<IMeasurement[]> => {
	const response = await pool.query(`SELECT DISTINCT ON (topic) ${timestampAsString}, topic, payload
									FROM iot_data.thingData
									WHERE group_uid = $1 AND
									topic = ANY($2::text[])
									ORDER BY topic DESC,
											timestamp DESC
									LIMIT $3;`, [groupUid, topicsArray, topicsArray.length]);
	return response.rows;
};

export const getLastMeasurement = async (groupUid: string, topic: string): Promise<IMeasurement> => {
	const response = await pool.query(`SELECT ${timestampAsString}, topic, payload
									FROM iot_data.thingData
									WHERE group_uid = $1 AND
									topic = $2
									ORDER BY timestamp DESC
									LIMIT $3;`, [groupUid, topic, 1]);
	return response.rows[0];
};

export const getDuringMeasurementsWithPagination = async (
	groupUid: string,
	topic: string,
	start: string,
	end: string,
	pageIndex: number,
	itemsPerPage: number
): Promise<IMeasurement[]> => {
	const offset = pageIndex * itemsPerPage;
	const response = await pool.query(`SELECT ${timestampAsString},
	topic, payload FROM iot_data.thingData
	WHERE group_uid = $1 AND
	topic = $2 AND
	timestamp >= $3 AND
	timestamp <= $4
	ORDER BY timestamp DESC
	LIMIT $5
	OFFSET  $6;`, [groupUid, topic, start, end, itemsPerPage, offset]);

	return response.rows;
};

export const getTotalRowsDuringMeasurements = async (
	groupUid: string,
	topic: string,
	start: string,
	end: string
): Promise<number> => {
	const response = await pool.query(`SELECT COUNT(*) FROM iot_data.thingData
									WHERE group_uid = $1 AND
									topic = $2 AND
									timestamp >= $3 AND
									timestamp <= $4`,
		[groupUid, topic, start, end]);
	return response.rows[0].count;
};

export const updateMeasurementsTopicByDevice = async (device: IDevice, newDeviceUid: string): Promise<void> => {
	const measurementUpdateQueries: any[] = [];
	const topics = await getTopicsByDeviceId(device.id);

	topics.forEach(topic => {
		const oldTopic = `Device_${device.deviceUid}/Topic_${topic.topicUid}`;
		const newTopic = `Device_${newDeviceUid}/Topic_${topic.topicUid}`;
		const query = pool.query(`UPDATE iot_data.thingData SET topic = $1 WHERE topic = $2;`,
			[newTopic, oldTopic]);
		measurementUpdateQueries.push(query);
	});

	await Promise.all(measurementUpdateQueries)
}

export const updateMeasurementsTopicByTopic = async (device: IDevice, topic: ITopic, newTopicUid: string): Promise<void> => {
	const oldTopic = `Device_${device.deviceUid}/Topic_${topic.topicUid}`;
	const newTopic = `Device_${device.deviceUid}/Topic_${newTopicUid}`;
	await pool.query(`UPDATE iot_data.thingData SET topic = $1 WHERE topic = $2;`, [newTopic, oldTopic]);
}



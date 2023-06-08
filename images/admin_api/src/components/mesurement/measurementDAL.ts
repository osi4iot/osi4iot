import timescaledb_pool from "../../config/timescaledb_config";
import IDevice from "../device/device.interface";
import IGroup from "../group/interfaces/Group.interface";
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
	const result = await timescaledb_pool.query(query, [
		newPayload,
		timestamp,
		groupUid,
		topic
	]);
	return result.rows[0] as IMeasurement;
};

export const deleteMeasurement = async (groupUid: string, topic: string, timestamp: string,): Promise<IMeasurement> => {
	const result = await timescaledb_pool.query(`DELETE FROM iot_data.thingData
                    WHERE timestamp = $1::TIMESTAMPTZ AND
                    group_uid = $2 AND
                    topic = $3
					RETURNING *;`, [timestamp, groupUid, topic]);
	return result.rows[0] as IMeasurement;
};

export const deleteMeasurementsBeforeDate = async (
	groupUid: string,
	topic: string,
	deleteDate: string,
): Promise<IMeasurement> => {
	const result = await timescaledb_pool.query(`WITH deleted as (
					DELETE FROM iot_data.thingData
					WHERE timestamp <= $1 AND
					group_uid = $2 AND
					topic = $3
					RETURNING timestamp
				)
				select count(*)
				from deleted;`, [deleteDate, groupUid, topic]);
	return result.rows[0] as IMeasurement;
};

export const getMeasurement = async (groupUid: string, topic: string, timestamp: string): Promise<IMeasurement> => {
	const response = await timescaledb_pool.query(`SELECT ${timestampAsString}, topic, payload
									FROM iot_data.thingData
									WHERE timestamp = $1 AND
									group_uid = $2 AND
									topic = $3;`, [timestamp, groupUid, topic]);
	return response.rows[0] as IMeasurement;
}

export const getLastMeasurements = async (groupUid: string, topic: string, count: number): Promise<IMeasurement[]> => {
	const response = await timescaledb_pool.query(`SELECT ${timestampAsString}, topic, payload
									FROM iot_data.thingData
									WHERE group_uid = $1 AND
									topic = $2
									ORDER BY timestamp DESC
									LIMIT $3;`, [groupUid, topic, count]);
	return response.rows as IMeasurement[];
};

export const getLastMeasurementsFromTopicsArray = async (groupUid: string, topicsArray: string[]): Promise<IMeasurement[]> => {
	const lastMeasurementQueries = [];
	for (const topic of topicsArray) {
		const query = getLastMeasurementInChunk(groupUid, topic);
		lastMeasurementQueries.push(query);
	}
	const responses = await Promise.all(lastMeasurementQueries);
	const lastMeasurements = responses.filter(lastMeasurement => lastMeasurement !== undefined);
	return lastMeasurements;
};

export const getLastMeasurementInChunk = async (groupUid: string, topic: string): Promise<IMeasurement> => {
	const response = await timescaledb_pool.query(`SELECT ${timestampAsString}, topic, payload
									FROM iot_data.thingData
									WHERE timestamp > now() - interval '1day' AND
									group_uid = $1 AND
									topic = $2
									ORDER BY timestamp DESC
									LIMIT $3;`, [groupUid, topic, 1]);
	return response.rows[0] as IMeasurement;
};

export const getLastMeasurement = async (groupUid: string, topic: string): Promise<IMeasurement> => {
	const response = await timescaledb_pool.query(`SELECT ${timestampAsString}, topic, payload
									FROM iot_data.thingData
									WHERE group_uid = $1 AND
									topic = $2
									ORDER BY timestamp DESC
									LIMIT $3;`, [groupUid, topic, 1]);
	return response.rows[0] as IMeasurement;
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
	const response = await timescaledb_pool.query(`SELECT ${timestampAsString},
	topic, payload FROM iot_data.thingData
	WHERE group_uid = $1 AND
	topic = $2 AND
	timestamp >= $3 AND
	timestamp <= $4
	ORDER BY timestamp DESC
	LIMIT $5
	OFFSET  $6;`, [groupUid, topic, start, end, itemsPerPage, offset]);

	return response.rows as IMeasurement[];
};

export const getTotalRowsDuringMeasurements = async (
	groupUid: string,
	topic: string,
	start: string,
	end: string
): Promise<number> => {
	const response = await timescaledb_pool.query(`SELECT COUNT(*) FROM iot_data.thingData
									WHERE group_uid = $1 AND
									topic = $2 AND
									timestamp >= $3 AND
									timestamp <= $4`,
	[groupUid, topic, start, end]);
	return response.rows[0].count as number;
};

export const updateMeasurementsTopicByDevice = async (device: IDevice, newDeviceUid: string): Promise<void> => {
	const measurementUpdateQueries: any[] = [];
	const topics = await getTopicsByDeviceId(device.id);

	topics.forEach(topic => {
		const oldTopic = `Device_${device.deviceUid}/Topic_${topic.topicUid}`;
		const newTopic = `Device_${newDeviceUid}/Topic_${topic.topicUid}`;
		const query = timescaledb_pool.query(`UPDATE iot_data.thingData SET topic = $1 WHERE topic = $2;`,
			[newTopic, oldTopic]);
		measurementUpdateQueries.push(query);
	});

	await Promise.all(measurementUpdateQueries)
}

export const updateMeasurementsTopicByTopic = async (device: IDevice, topic: ITopic, newTopicUid: string): Promise<void> => {
	const oldTopic = `Device_${device.deviceUid}/Topic_${topic.topicUid}`;
	const newTopic = `Device_${device.deviceUid}/Topic_${newTopicUid}`;
	await timescaledb_pool.query(`UPDATE iot_data.thingData SET topic = $1 WHERE topic = $2;`, [newTopic, oldTopic]);
}

export const updateMeasurementsGroupUid = async (group: IGroup, newGroupUid: string): Promise<void> => {
	const oldGroupUid = group.groupUid;
	await timescaledb_pool.query(`UPDATE iot_data.thingData SET group_uid = $1 WHERE group_uid = $2;`, [newGroupUid, oldGroupUid]);
}




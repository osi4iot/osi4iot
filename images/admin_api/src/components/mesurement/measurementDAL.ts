import pool from "../../config/dbconfig";
import IMeasurement from "./measurement.interface";

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

export const deleteMeasurement = async (groupUid: string, topic: string, timestamp: string, ): Promise<IMeasurement> => {
	const result = await pool.query(`DELETE FROM iot_data.thingData
                    WHERE timestamp = $1 AND
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
	const response = await pool.query(`SELECT timestamp, topic, payload
									FROM iot_data.thingData
									WHERE timestamp = $1 AND
									group_uid = $2 AND
									topic = $3;`, [timestamp, groupUid, topic]);
	return response.rows[0];
}

export const getLastMeasurements = async (groupUid: string, topic: string, count: number): Promise<IMeasurement[]> => {
	const response = await pool.query(`SELECT timestamp, topic, payload
									FROM iot_data.thingData
									WHERE group_uid = $1 AND
									topic = $2
									ORDER BY timestamp DESC
									LIMIT = $3;`, [groupUid, topic, count]);
	return response.rows;
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
	const response = await pool.query(`SELECT timestamp, topic, payload
									FROM iot_data.thingData
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



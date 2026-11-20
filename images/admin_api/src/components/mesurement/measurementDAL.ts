import timescaledb_pool, { timescaledbReadQuery } from "../../config/timescaledb_config";
import IGroup from "../group/interfaces/Group.interface";
import ISensor from "../sensor/sensor.interface";
import ITopic from "../topic/topic.interface";import IGeolocationMeasurement from "./geolocation_measurement.interface";
;
import IMeasurement from "./measurement.interface";
import { readQuery } from "../../config/dbconfig";
import { Measurements, tablePath, toMeasurements, withoutValueAtPath } from "../../utils/measurements/measurements";

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
): Promise<number> => {
	const result = await timescaledb_pool.query(`WITH deleted as (
					DELETE FROM iot_data.thingData
					WHERE timestamp <= $1 AND
					group_uid = $2 AND
					topic = $3
					RETURNING timestamp
				)
				select count(*)
				from deleted;`, [deleteDate, groupUid, topic]);
	return result.rows[0] as number;
};

export const getMeasurement = async (groupUid: string, topic: string, timestamp: string): Promise<IMeasurement> => {
	const response = await timescaledbReadQuery(`SELECT ${timestampAsString}, topic, payload
									FROM iot_data.thingData
									WHERE timestamp = $1 AND
									group_uid = $2 AND
									topic = $3;`, [timestamp, groupUid, topic]);
	return response.rows[0] as IMeasurement;
}

export const getLastMeasurements = async (groupUid: string, topic: string, count: number): Promise<IMeasurement[]> => {
	const response = await timescaledbReadQuery(`SELECT ${timestampAsString}, topic, payload
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
	const response = await timescaledbReadQuery(`SELECT ${timestampAsString}, topic, payload
									FROM iot_data.thingData
									WHERE timestamp > now() - interval '1day' AND
									group_uid = $1 AND
									topic = $2
									ORDER BY timestamp DESC
									LIMIT $3;`, [groupUid, topic, 1]);
	return response.rows[0] as IMeasurement;
};

export const getLastGeolocationMeasurementsFromSensorsArray = async (sensors: ISensor[]): Promise<IGeolocationMeasurement[]> => {
	const lastMeasurementQueries = [];
	for (const sensor of sensors) {
		const sqlTopic = `Topic_${sensor.topicUid}`;
		const query = getLastGeolocationMeasurementInChunk(sensor.groupUid, sensor.assetUid, sqlTopic);
		lastMeasurementQueries.push(query);
	}
	const responses = await Promise.all(lastMeasurementQueries);
	const lastGeolocationMeasurements = responses.filter(lastMeasurement =>
		lastMeasurement !== undefined &&
		lastMeasurement.longitude !== null &&
		lastMeasurement.latitude !== null
	);
	return lastGeolocationMeasurements;
};


export const getLastGeolocationMeasurementInChunk = async (
	groupUid: string,
	assetUid: string,
	topic: string
): Promise<IGeolocationMeasurement> => {
	const response = await timescaledbReadQuery(`SELECT ${timestampAsString}, $1 AS "assetUid", 
									CAST(payload->>'longitude' AS DOUBLE PRECISION) AS "longitude",
									CAST(payload->>'latitude' AS DOUBLE PRECISION) AS "latitude"
									FROM iot_data.thingData
									WHERE timestamp > now() - interval '1day' AND
									group_uid = $2 AND
									topic = $3
									ORDER BY timestamp DESC
									LIMIT $4;`, [assetUid, groupUid, topic, 1]);
	return response.rows[0] as IGeolocationMeasurement;
};


export const getLastMeasurement = async (groupUid: string, topic: string): Promise<IMeasurement> => {
	const response = await timescaledbReadQuery(`SELECT ${timestampAsString}, topic, payload
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
	const response = await timescaledbReadQuery(`SELECT ${timestampAsString},
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

export const getDuringSensorMeasurementsWithPagination = async (
	groupUid: string,
	topic: string,
	start: string,
	end: string,
	pageIndex: number,
	itemsPerPage: number,
	payloadKey: string,
	payloadPath: string[]
): Promise<IMeasurement[]> => {
	const offset = pageIndex * itemsPerPage;
	// la clave va como parámetro; el nombre de la columna, entre comillas dobles escapadas
	const queryString =
		`SELECT ${timestampAsString},
		topic, payload #>> $7::text[] AS "${payloadKey.replace(/"/g, '""')}"
		FROM iot_data.thingData
		WHERE group_uid = $1 AND
		topic = $2 AND
		timestamp >= $3 AND
		timestamp <= $4 AND
		payload #>> $7::text[] IS NOT NULL
		ORDER BY timestamp DESC
		LIMIT $5
		OFFSET  $6;`
	const response = await timescaledbReadQuery(queryString
		, [groupUid, topic, start, end, itemsPerPage, offset, payloadPath]);

	return response.rows as IMeasurement[];
};

export const getSensorMeasurementsBeforeDate = async (
	groupUid: string,
	topic: string,
	date: string
): Promise<IMeasurement[]> => {
	const queryString =
		`SELECT ${timestampAsString}, topic, payload
		FROM iot_data.thingData
		WHERE timestamp <= $1 AND
		group_uid = $2 AND
		topic = $3;`
	const response = await timescaledbReadQuery(queryString,
		[date, groupUid, topic]);

	return response.rows as IMeasurement[];
};

export const getTotalRowsDuringMeasurements = async (
	groupUid: string,
	topic: string,
	start: string,
	end: string
): Promise<number> => {
	const queryString = `
		SELECT COUNT(*) FROM iot_data.thingData
		WHERE group_uid = $1 AND
		topic = $2 AND
		timestamp >= $3 AND
		timestamp <= $4`;
	const response = await timescaledbReadQuery(queryString,
		[groupUid, topic, start, end]);
	return response.rows[0].count as number;
};

export const getTotalRowsDuringSensorMeasurements = async (
	groupUid: string,
	topic: string,
	start: string,
	end: string,
	payloadPath: string[]
): Promise<number> => {
	const queryString = `
		SELECT COUNT(*) FROM iot_data.thingData
		WHERE group_uid = $1 AND
		topic = $2 AND
		timestamp >= $3 AND
		timestamp <= $4 AND
		payload #>> $5::text[] IS NOT NULL`;
	const response = await timescaledbReadQuery(queryString,
		[groupUid, topic, start, end, payloadPath]);
	return response.rows[0].count as number;
};

export const updateMeasurementsTopicByTopic = async (topic: ITopic, newTopicUid: string): Promise<void> => {
	const oldTopic = `Topic_${topic.topicUid}`;
	const newTopic = `Topic_${newTopicUid}`;
	await timescaledb_pool.query(`UPDATE iot_data.thingData SET topic = $1 WHERE topic = $2;`, [newTopic, oldTopic]);
}

export const updateMeasurementsGroupUid = async (group: IGroup, newGroupUid: string): Promise<void> => {
	const oldGroupUid = group.groupUid;
	await timescaledb_pool.query(`UPDATE iot_data.thingData SET group_uid = $1 WHERE group_uid = $2;`, [newGroupUid, oldGroupUid]);
}

export const deleteSensorMeasurementsBeforeSomeDate = async (
	measurements: IMeasurement[],
	payloadPath: string[],
	groupUid: string,
	topic: string
): Promise<number>  => {
	const deleteQueries = [];
	for (const measurement of measurements) {
		// the value at the path out of the message; nothing left: the message out
		const { payload, found } = withoutValueAtPath(measurement.payload, payloadPath);
		if (!found) continue;
		if (payload === undefined || (typeof payload === "object" && payload !== null && Object.keys(payload).length === 0)) {
			deleteQueries.push(deleteMeasurement(groupUid, topic, measurement.timestamp));
		} else {
			deleteQueries.push(updateMeasurement(groupUid, topic, measurement.timestamp, JSON.stringify(payload)));
		}
	}
	const responses = await Promise.all(deleteQueries);
	return responses.length;
}
// The measurements of the sensors of a topic of a group (a sensor without them: those of its type), to find where a
// field is in its messages
export const topicSensorsMeasurements = async (groupId: number, topic: string): Promise<Measurements> => {
	const topicUid = topic.replace(/^Topic_/, "");
	const result = await readQuery(
		`SELECT grafanadb.sensor.measurements, grafanadb.sensor_type.default_measurements AS "defaultMeasurements"
		FROM grafanadb.sensor
		INNER JOIN grafanadb.asset ON grafanadb.sensor.asset_id = grafanadb.asset.id
		INNER JOIN grafanadb.topic ON grafanadb.topic.id = grafanadb.sensor.topic_id
		INNER JOIN grafanadb.sensor_type ON grafanadb.sensor_type.id = grafanadb.sensor.sensor_type_id
		WHERE grafanadb.asset.group_id = $1 AND grafanadb.topic.topic_uid = $2
		ORDER BY grafanadb.sensor.id ASC`,
		[groupId, topicUid]
	);
	const measurements: Measurements = {};
	for (const row of result.rows as { measurements: unknown; defaultMeasurements: unknown }[]) {
		let own = toMeasurements(row.measurements);
		if (Object.keys(own).length === 0) own = toMeasurements(row.defaultMeasurements);
		for (const [field, m] of Object.entries(own)) if (!(field in measurements)) measurements[field] = m;
	}
	return measurements;
};

// Where the measurements table of the sensors of a topic finds a field (as the measurements say; else a dotted key)
export const topicFieldPath = async (groupId: number, topic: string, payloadKey: string): Promise<string[]> =>
	tablePath(payloadKey, (await topicSensorsMeasurements(groupId, topic))[payloadKey]);

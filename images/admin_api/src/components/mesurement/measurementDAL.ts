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

interface AssetGeolocationRow {
	groupUid: string;
	assetUid: string;
	geolocation: unknown;
	lastUpdated: Date | string | null;
}

const finiteNumber = (v: unknown): number | null => {
	const n = typeof v === "string" ? Number(v) : v;
	return typeof n === "number" && Number.isFinite(n) ? n : null;
};

// The position kept in a state's section geolocation ({ latitude, longitude, at }), or null
export const positionOfStateGeolocation = (
	geolocation: unknown
): { latitude: number; longitude: number; at: string | null } | null => {
	if (!geolocation || typeof geolocation !== "object" || Array.isArray(geolocation)) return null;
	const g = geolocation as Record<string, unknown>;
	const latitude = finiteNumber(g.latitude);
	const longitude = finiteNumber(g.longitude);
	if (latitude === null || longitude === null || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
	return { latitude, longitude, at: typeof g.at === "string" ? g.at : null };
};

// The NATS subject of a topic (as pipelines and the viewers build it)
export const topicNatsSubject = (topicType: string, groupUid: string, topicUid: string): string =>
	`${topicType}.Group_${groupUid}.Topic_${topicUid}`;

// The positions of the assets of the geolocation sensors: one entry per asset, with the position kept in its state
// (null without one: the map uses the asset's own) and the subjects of its sensors
export const getLastGeolocationMeasurementsFromSensorsArray = async (sensors: ISensor[]): Promise<IGeolocationMeasurement[]> => {
	const byAsset = new Map<string, { groupUid: string; assetUid: string; natsSubjects: string[] }>();
	for (const sensor of sensors) {
		const key = `${sensor.groupUid}|${sensor.assetUid}`;
		let entry = byAsset.get(key);
		if (!entry) {
			entry = { groupUid: sensor.groupUid, assetUid: sensor.assetUid, natsSubjects: [] };
			byAsset.set(key, entry);
		}
		if (sensor.topicType && sensor.topicUid) {
			const subject = topicNatsSubject(sensor.topicType, sensor.groupUid, sensor.topicUid);
			if (!entry.natsSubjects.includes(subject)) entry.natsSubjects.push(subject);
		}
	}
	if (byAsset.size === 0) return [];
	const assets = [...byAsset.values()];
	const response = await timescaledbReadQuery<AssetGeolocationRow>(
		`SELECT group_uid AS "groupUid", asset_uid AS "assetUid", state->'geolocation' AS "geolocation",
				last_updated AS "lastUpdated"
		 FROM iot_data.assetState
		 WHERE (group_uid, asset_uid) IN (SELECT * FROM unnest($1::text[], $2::text[]))`,
		[assets.map((a) => a.groupUid), assets.map((a) => a.assetUid)]
	);
	const kept = new Map<string, AssetGeolocationRow>();
	for (const row of response.rows) kept.set(`${row.groupUid}|${row.assetUid}`, row);
	return assets.map((asset) => {
		const row = kept.get(`${asset.groupUid}|${asset.assetUid}`);
		const position = positionOfStateGeolocation(row?.geolocation);
		const updated = row?.lastUpdated ? new Date(row.lastUpdated).toISOString() : null;
		return {
			timestamp: position ? position.at ?? updated : null,
			assetUid: asset.assetUid,
			longitude: position?.longitude ?? null,
			latitude: position?.latitude ?? null,
			natsSubjects: asset.natsSubjects,
		};
	});
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

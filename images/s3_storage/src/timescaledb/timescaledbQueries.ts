import timescaledb_pool from "../config/timescale_config";
import IMeasurement from "./measurements.interface";

const timestampAsString = 'to_char(timestamp, \'YYYY-MM-DD HH24:MI:SS.USOF\') AS "timestamp"';

export const getLastMeasurements = async (groupUid: string, topic: string):
    Promise<IMeasurement[]> => {
    // const yesterdayMidnight = new Date();
    // yesterdayMidnight.setDate(yesterdayMidnight.getDate() - 1);
    // yesterdayMidnight.setHours(0, 0, 0, 0);
    // const start = yesterdayMidnight.toISOString();

    // const todayMidnight = new Date();
    // todayMidnight.setHours(0, 0, 0, 0);
    // const end = todayMidnight.toISOString();

    const end = new Date().toISOString();
    const fiveMinutesEarly = new Date(Date.now() - 1000 * (60 * 120));
    const start = fiveMinutesEarly.toISOString();

    const queryString = `SELECT ${timestampAsString},
                        topic, payload FROM iot_data.thingData
                        WHERE group_uid = $1 AND
                        topic = $2 AND
                        timestamp >= $3 AND
                        timestamp <= $4
                        ORDER BY timestamp ASC;`
    const response = await timescaledb_pool.query(queryString, [groupUid, topic, start, end]);
    return response.rows as IMeasurement[];
};
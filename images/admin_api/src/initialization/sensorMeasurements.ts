import { PoolClient } from "pg";
import { logger } from "../config/winston";

// Measurements of the sensors (see utils/measurements.ts): the columns
// grafanadb.sensor.payload_json_schema and grafanadb.sensor_type.default_payload_json_schema
// are renamed to measurements and default_measurements, and their content is
// converted from the JSON schema of older versions
//   { "type": "object", "properties": { "temperature": { "type": "number", "description": "Temperature", "units": "°C" } } }
// to
//   { "temperature": { "type": "number", "label": "Temperature", "units": "°C" } }
//
// Run on every start of replica 1 for existing databases: the renames only run
// while the old columns exist and the conversion only touches rows still in the
// old format, so afterwards it is a no-op.

const renameColumn = (table: string, oldName: string, newName: string) => `
	IF EXISTS (SELECT 1 FROM information_schema.columns
		WHERE table_schema = 'grafanadb' AND table_name = '${table}' AND column_name = '${oldName}')
	AND NOT EXISTS (SELECT 1 FROM information_schema.columns
		WHERE table_schema = 'grafanadb' AND table_name = '${table}' AND column_name = '${newName}') THEN
		ALTER TABLE grafanadb.${table} RENAME COLUMN ${oldName} TO ${newName};
	END IF;`;

const queryRenameColumns = `
DO $$
BEGIN
	${renameColumn("sensor", "payload_json_schema", "measurements")}
	${renameColumn("sensor_type", "default_payload_json_schema", "default_measurements")}
END $$;`;

const convertColumn = (table: string, column: string) => `
UPDATE grafanadb.${table} SET ${column} = COALESCE(
	(SELECT jsonb_object_agg(field.key, jsonb_build_object(
		'type', CASE WHEN field.value->>'type' = 'array' THEN 'array' ELSE 'number' END,
		'label', COALESCE(NULLIF(field.value->>'description', ''), field.key),
		'units', COALESCE(NULLIF(field.value->>'units', ''), '-')))
	FROM jsonb_each(${column}->'properties') AS field),
	'{}'::jsonb)
WHERE ${column}->>'type' = 'object' AND jsonb_typeof(${column}->'properties') = 'object';`;

export const ensureSensorMeasurements = async (client: PoolClient): Promise<void> => {
	try {
		await client.query(queryRenameColumns);
		await client.query(convertColumn("sensor", "measurements"));
		await client.query(convertColumn("sensor_type", "default_measurements"));
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		logger.log("error", `The measurements of the sensors could not be updated: %s`, message);
	}
};

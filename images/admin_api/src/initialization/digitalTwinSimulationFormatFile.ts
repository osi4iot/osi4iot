import { PoolClient } from "pg";
import { logger } from "../config/winston";

// Digital twin simulation format: the name and the last modification date
// of the file it was loaded from, shown by the Edit digital twin form (as
// for the gltf, FEM results and pipeline files). "-" when the format was not
// loaded from a file.
//
// Run on every start of replica 1, for new and existing databases: the
// columns are added with IF NOT EXISTS, so it brings older platforms up to
// date and is a no-op afterwards.

const queryDigitalTwinSimulationFormatFile = `
ALTER TABLE grafanadb.digital_twin
	ADD COLUMN IF NOT EXISTS digital_twin_simulation_format_file_name VARCHAR(255) NOT NULL DEFAULT '-',
	ADD COLUMN IF NOT EXISTS digital_twin_simulation_format_last_modif_date VARCHAR(100) NOT NULL DEFAULT '-';`;

export const ensureDigitalTwinSimulationFormatFile = async (client: PoolClient): Promise<void> => {
	try {
		await client.query(queryDigitalTwinSimulationFormatFile);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		logger.log("error", `The simulation format file columns of grafanadb.digital_twin could not be added: %s`, message);
	}
};

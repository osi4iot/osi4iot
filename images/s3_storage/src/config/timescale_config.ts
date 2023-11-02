import { Pool, types } from 'pg';
import process_env from './env_config';

// data parsing
types.setTypeParser(types.builtins.INT8, (value: string) => {
	return parseInt(value, 10);
});

types.setTypeParser(types.builtins.FLOAT8, (value: string) => {
	return parseFloat(value);
});

types.setTypeParser(types.builtins.NUMERIC, (value: string) => {
	return parseFloat(value);
})

let timescaledb_pool: Pool | null = null;

if (!timescaledb_pool) {
	timescaledb_pool = new Pool({
		max: 20,
		user: process_env.TIMESCALE_USER,
		host: "timescaledb",
		password: process_env.TIMESCALE_PASSWORD,
		database: process_env.TIMESCALE_DB,
		port: 5432,
		idleTimeoutMillis: 30000,
	});
}


export default timescaledb_pool as Pool;
import { Pool, types } from 'pg';
import process_env from './api_config';

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

const pool = new Pool({
	max: 20,
	user: process_env.POSTGRES_USER,
	host: process_env.POSTGRES_HOST,
	password: process_env.POSTGRES_PASSWORD,
	database: process_env.POSTGRES_DB,
	port: parseInt(process_env.POSTGRES_PORT, 10),
	idleTimeoutMillis: 30000,
});


export default pool;